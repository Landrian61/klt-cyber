import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  DEPARTMENT_FEED_ACTIONS,
  PAUSED_DEPARTMENTS,
  departmentIconKey,
  slugifyDepartmentName,
} from "@klt-cyber/shared";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  departmentCapabilities,
  getCurrentUser,
  logActivity,
  requireDepartmentCapability,
  resolveDepartmentShellRole,
} from "./lib/authz";
import { findLiveMembership } from "./lib/departmentMembership";
import { resolveMediaUrl } from "./lib/media";

/**
 * What every page of a department's portal needs (spec 0012).
 *
 * The shell is one set of page components and one set of functions, hosted by
 * the dynamic `areas-of-service/[slug]` route for any active department and
 * imported by a bespoke portal (Media) beside its own pages. This file holds
 * what is common to all five pages; roster, activities and messages extend the
 * existing files that already own those subjects.
 */

/**
 * Resolve a URL slug to a department, server side.
 *
 * Reads all thirteen through `by_order` and matches on the shared
 * `slugifyDepartmentName`, rather than storing a slug column that would then
 * have to stay in sync with the name. Thirteen rows per page load is cheap and
 * the comparison can never disagree with the hub's own links, which use the
 * same function.
 *
 * The department being acted on is ALWAYS resolved this way and never taken
 * from a client supplied id, because every shell mutation is scoped by it
 * (AC-4).
 */
async function departmentBySlug(ctx: QueryCtx, slug: string) {
  const departments = await ctx.db.query("departments").withIndex("by_order").collect();
  return departments.find((d) => slugifyDepartmentName(d.name) === slug) ?? null;
}

/** True for a department that has not opened yet and keeps its "Coming soon" page. */
function isPaused(name: string): boolean {
  return (PAUSED_DEPARTMENTS as readonly string[]).includes(name);
}

/**
 * The shell's gate and its chrome, in one read: which department this page is
 * about, the caller's role in it, and what that role may do.
 *
 * Resolves to `null` rather than throwing for every refusal — unknown slug,
 * paused department, signed out, no role here. It backs a live subscription, so
 * a user who loses their role or signs out while a page is mounted must see the
 * layout resolve to a redirect, not an exception thrown inside a mounted
 * `useQuery` that takes the tree down with it (AC-38). Mutations still throw;
 * there, an unauthorised call is a real violation rather than teardown.
 */
export const getShellContext = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const department = await departmentBySlug(ctx, slug);
    if (!department) return null;
    if (isPaused(department.name)) return null;

    const role = await resolveDepartmentShellRole(ctx, user._id, department._id);
    if (!role) return null;

    return {
      department: {
        _id: department._id,
        name: department.name,
        description: department.description ?? null,
      },
      iconKey: departmentIconKey(department.name),
      role,
      can: departmentCapabilities(role),
    };
  },
});

/**
 * A shell query's gate: the caller's role in this department, or null.
 *
 * Null for an unauthenticated caller and for one with no role here, for the
 * same reason `getShellContext` is: these are live subscriptions that have to
 * survive a sign-out or a role change under a mounted page.
 */
async function shellRoleOrNull(ctx: QueryCtx, departmentId: Id<"departments">) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const role = await resolveDepartmentShellRole(ctx, user._id, departmentId);
  return role ? { user, role } : null;
}

/** How many feed entries a dashboard reads. Small: the card shows a glance. */
const FEED_PAGE_SIZE = 12;

/** How many upcoming activities the dashboard card shows. */
const UPCOMING_CARD_SIZE = 4;

/**
 * The department's dashboard numbers (spec 0012, AC-33, AC-34, AC-36).
 *
 * `now` comes from the client, rounded to the minute, and is the only clock
 * this query uses. A server side `Date.now()` cannot be re-evaluated by a live
 * query, so "upcoming" would freeze at whatever the time was when the
 * subscription started; letting the client advance `now` makes the list move on
 * its own.
 *
 * The two member counts differ on purpose and the roster labels explain why: a
 * roster written before spec 0012 can hold an `active` row belonging to a
 * profile nobody has verified. Those rows stay on the roster, labelled, and are
 * excluded from the verified count.
 */
export const getDashboard = query({
  args: { departmentId: v.id("departments"), now: v.number() },
  handler: async (ctx, { departmentId, now }) => {
    if (!(await shellRoleOrNull(ctx, departmentId))) return null;

    const [activeRows, pendingRows] = await Promise.all([
      ctx.db
        .query("departmentMemberships")
        .withIndex("by_departmentId_status", (q) =>
          q.eq("departmentId", departmentId).eq("status", "active")
        )
        .collect(),
      ctx.db
        .query("departmentMemberships")
        .withIndex("by_departmentId_status", (q) =>
          q.eq("departmentId", departmentId).eq("status", "pending_claim")
        )
        .collect(),
    ]);

    // Read live from the profile, never copied onto the membership row: the
    // mistake F2-11 records on the mobile side is a hardcoded mentorship value.
    const profiles = await Promise.all(
      [...new Set(activeRows.map((m) => m.userId))].map((userId) =>
        ctx.db
          .query("memberProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique()
      )
    );

    const verifiedCount = profiles.filter(
      (p) => p?.profileStatus === "verified"
    ).length;
    const mentorshipGapCount = profiles.filter(
      (p) => p && p.mentorshipStatus !== "completed"
    ).length;

    // One indexed range read from `now` forward, so the work is bounded by what
    // is still to come rather than by everything the department has ever run.
    const upcoming = await ctx.db
      .query("groupActivities")
      .withIndex("by_department_start", (q) =>
        q.eq("owner.departmentId", departmentId).gte("startDateTime", now)
      )
      .filter((q) => q.eq(q.field("cancelledAt"), undefined))
      .order("asc")
      .take(UPCOMING_CARD_SIZE);

    return {
      verifiedCount,
      // Every count excludes claimants: a pending claimant is not a member of
      // anything yet (AC-33).
      claimsWaitingCount: pendingRows.length,
      rosterCount: activeRows.length,
      mentorshipGapCount,
      upcoming: upcoming.map((a) => ({
        _id: a._id,
        title: a.title,
        startDateTime: a.startDateTime,
        endDateTime: a.endDateTime,
        location: a.location ?? null,
      })),
    };
  },
});

/**
 * This department's recent history (AC-35).
 *
 * An indexed read over `activityLogs.by_department`, bounded by one department
 * and one page, rather than a scan of all church activity — which is the whole
 * reason `departmentId` is a column rather than a `metadata` key.
 *
 * The feed is empty for everything that happened before spec 0012: older
 * entries carry their department only inside `metadata`, and no backfill runs.
 */
export const listDepartmentFeed = query({
  args: {
    departmentId: v.id("departments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { departmentId, limit }) => {
    if (!(await shellRoleOrNull(ctx, departmentId))) return null;

    const actions: readonly string[] = DEPARTMENT_FEED_ACTIONS;
    const page = Math.min(limit ?? FEED_PAGE_SIZE, 50);

    // Over-read then filter, because the index is on the department and not on
    // the action: taking `page` rows straight would come back short whenever the
    // department's recent history includes an entry the feed does not show.
    const rows = await ctx.db
      .query("activityLogs")
      .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
      .order("desc")
      .take(page * 4);

    const entries = rows.filter((row) => actions.includes(row.action)).slice(0, page);

    const actorNames = new Map<Id<"users">, string>();
    for (const entry of entries) {
      if (actorNames.has(entry.actorUserId)) continue;
      const actor = await ctx.db.get(entry.actorUserId);
      // An anonymised account reads as a former member rather than as a blank,
      // the same wording the group message list uses.
      const name = actor
        ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim()
        : "";
      actorNames.set(entry.actorUserId, name === "" ? "A former member" : name);
    }

    return entries.map((entry) => ({
      _id: entry._id,
      action: entry.action,
      at: entry._creationTime,
      actorName: actorNames.get(entry.actorUserId) ?? "A former member",
      metadata: (entry.metadata ?? null) as Record<string, unknown> | null,
    }));
  },
});

/**
 * One roster member's full profile, with directory sharing bypassed (AC-11).
 *
 * The one deliberate carve-out of the privacy default in NF-02, required by
 * S3-02 so an HOD can actually reach the person serving with them. It lives in
 * exactly one named function, gated to this department's HOD and delegate plus
 * System Admin, so the exception cannot widen by accident. Administration
 * authority is rejected here: it keeps the active-roster read spec 0006 gave it
 * and gains nothing more inside another department.
 *
 * Throws for a caller who is authenticated but not allowed, since opening a
 * profile is a deliberate act rather than page chrome, and resolves null only
 * for the teardown cases.
 */
export const getRosterMemberProfile = query({
  args: { departmentId: v.id("departments"), userId: v.id("users") },
  handler: async (ctx, { departmentId, userId }) => {
    const caller = await getCurrentUser(ctx);
    if (!caller) return null;

    const role = await resolveDepartmentShellRole(ctx, caller._id, departmentId);
    if (!role || !departmentCapabilities(role).viewFullProfiles) {
      throw new Error(
        "Only this department's HOD or delegate, or a System Admin, may open a roster member's profile"
      );
    }

    // Through the roster, not by user id alone: this bypasses a privacy setting,
    // so it may only ever be used on someone actually serving in the department
    // the caller leads.
    const membership = await findLiveMembership(ctx, userId, departmentId);
    if (!membership) return null;

    const [profile, user] = await Promise.all([
      ctx.db
        .query("memberProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db.get(userId),
    ]);
    if (!profile || !user) return null;

    const [clan, children] = await Promise.all([
      profile.clanId ? ctx.db.get(profile.clanId) : null,
      ctx.db
        .query("children")
        .withIndex("by_parentUserId", (q) => q.eq("parentUserId", userId))
        .collect(),
    ]);

    return {
      membership: {
        _id: membership._id,
        status: membership.status,
        positionTitle: membership.positionTitle ?? null,
        since: membership._creationTime,
      },
      profile: {
        ...profile,
        photoUrl: await resolveMediaUrl(profile.photoUrl),
        mentorshipProofUrl: await resolveMediaUrl(profile.mentorshipProofUrl),
      },
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
      },
      clanName: clan?.name ?? null,
      children,
    };
  },
});

/**
 * Edit the department's own one-line description, the text its hub card shows.
 *
 * HOD (or System Admin) only — a delegate is rejected here, not merely denied
 * the form (AC-8, AC-18). The five rules are the spec's, stated so the build
 * does not invent them: trimmed plain text within the cap, newlines collapsed
 * to single spaces because the hub card renders one or two lines, an empty value
 * clears the field, an unchanged save writes no audit entry, and a real change
 * writes one carrying `departmentId`.
 */
export const updateDepartmentDescription = mutation({
  args: {
    departmentId: v.id("departments"),
    description: v.string(),
  },
  handler: async (ctx, { departmentId, description }) => {
    const { actor } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "editDescription"
    );

    const department = await ctx.db.get(departmentId);
    if (!department) throw new Error("Department not found");

    const normalised = description.replace(/\s*\n\s*/g, " ").trim();
    if (normalised.length > DEPARTMENT_DESCRIPTION_MAX_LENGTH) {
      throw new Error(
        `A description can be at most ${DEPARTMENT_DESCRIPTION_MAX_LENGTH} characters`
      );
    }
    // Convex drops an optional field patched to undefined, which is how an
    // empty value clears the description and returns the card to its
    // no-description state.
    const next = normalised.length > 0 ? normalised : undefined;

    if (next === (department.description ?? undefined)) {
      return { ok: true as const, changed: false as const };
    }

    await ctx.db.patch(departmentId, { description: next });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.description_updated",
      targetType: "departments",
      targetId: departmentId,
      departmentId,
      metadata: { from: department.description ?? null, to: next ?? null },
    });

    return { ok: true as const, changed: true as const };
  },
});
