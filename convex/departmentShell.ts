import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  DEPARTMENT_CONTACT_PHONE_INVALID,
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  DEPARTMENT_FEED_ACTIONS,
  LIBRARY_FEED_ACTIONS,
  PAUSED_DEPARTMENTS,
  normalizeE164Phone,
  departmentIconKey,
  slugifyDepartmentName,
} from "@klt-cyber/shared";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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
        // The desk number the HOD sets on Settings (spec 0015, AC-29). Here
        // rather than in its own query because the Settings form needs the
        // current value to show, and this is the read that page already makes.
        // The MEMBER's copy of it comes from `library.getCatalogueItem`
        // instead, which is a different audience and a different gate.
        contactPhone: department.contactPhone ?? null,
      },
      iconKey: departmentIconKey(department.name),
      role,
      // The NAME goes in, so a department-scoped capability can be granted on
      // it (spec 0015, AC-2). This is the one call site that passes it: every
      // other caller of `departmentCapabilities` is asking about the shell's
      // own matrix and reads a scoped capability as false, which is correct
      // for all of them.
      can: departmentCapabilities(role, department.name),
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

/**
 * A shell query's gate when the page in question is a LEADER's page.
 *
 * `shellRoleOrNull` above asks only "do you have any role here", which was the
 * same question until spec 0015 gave the shell a `roster` role. A roster
 * member has a role here and holds no shell capability at all, so the two
 * queries behind the dashboard's member counts and its activity feed have to
 * ask the narrower question: the portal hiding those cards is user experience,
 * and leaving the queries open would hand a roster member the department's
 * claim numbers through the API anyway (AC-4).
 *
 * `viewRoster` is the capability that stands for "this is leaders' data": it
 * is the one every member-facing panel on the dashboard is already keyed to.
 */
async function rosterViewerOrNull(
  ctx: QueryCtx,
  departmentId: Id<"departments">
) {
  const resolved = await shellRoleOrNull(ctx, departmentId);
  if (!resolved) return null;
  const department = await ctx.db.get(departmentId);
  return departmentCapabilities(resolved.role, department?.name).viewRoster
    ? resolved
    : null;
}

/** How many feed entries a dashboard reads. Small: the card shows a glance. */
const FEED_PAGE_SIZE = 12;

/**
 * How many over-read passes the feed makes before giving up.
 *
 * Caps the work when a department's history is mostly entries the feed does not
 * show, so the query stays bounded rather than walking the whole audit trail.
 */
const FEED_MAX_PASSES = 5;

/** How many upcoming activities the dashboard card lists. */
const UPCOMING_CARD_SIZE = 4;

/**
 * How far the "Coming up" count reads before it stops counting.
 *
 * The card lists four, but the number beside it has to be the real total or it
 * lies: a department with twelve activities ahead would read "4 activities
 * still ahead". Bounded rather than a full count, because this is a live query
 * and a department that schedules hundreds should not make the dashboard pay
 * for all of them; past the cap the card says "50+".
 */
const UPCOMING_COUNT_CAP = 50;

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
    // Leaders' data: member counts, claim numbers, mentorship gaps. A roster
    // member has a role in this department and no business reading any of it
    // (spec 0015, AC-4).
    if (!(await rosterViewerOrNull(ctx, departmentId))) return null;

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
    const ahead = await ctx.db
      .query("groupActivities")
      .withIndex("by_department_start", (q) =>
        q.eq("owner.departmentId", departmentId).gte("startDateTime", now)
      )
      .filter((q) => q.eq(q.field("cancelledAt"), undefined))
      .order("asc")
      .take(UPCOMING_COUNT_CAP);
    const upcoming = ahead.slice(0, UPCOMING_CARD_SIZE);

    return {
      verifiedCount,
      // Every count excludes claimants: a pending claimant is not a member of
      // anything yet (AC-33).
      claimsWaitingCount: pendingRows.length,
      rosterCount: activeRows.length,
      mentorshipGapCount,
      // The real number ahead, which the card shows, separate from the handful
      // it lists. `true` when the count hit its cap, so the card can say "50+"
      // rather than claim exactly fifty.
      upcomingCount: ahead.length,
      upcomingCountCapped: ahead.length === UPCOMING_COUNT_CAP,
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
    // Leaders' data too: the feed is a record of confirmations, removals and
    // messages, which is the department's own business and not its roster's
    // (spec 0015, AC-4).
    if (!(await rosterViewerOrNull(ctx, departmentId))) return null;

    // The shell's own events, plus the operational events of a department that
    // runs its own pages on this shell (spec 0015, AC-10). Library's catalogue
    // and stock writes ARE that department's recent activity, so excluding
    // them would leave its feed showing roster changes and nothing about the
    // work the department actually does. A department with no bespoke pages is
    // unaffected: it never writes one of these actions.
    const actions: readonly string[] = [
      ...DEPARTMENT_FEED_ACTIONS,
      ...LIBRARY_FEED_ACTIONS,
    ];
    const page = Math.min(limit ?? FEED_PAGE_SIZE, 50);

    // Over-read then filter, because the index is on the department and not on
    // the action: taking `page` rows straight would come back short whenever the
    // department's recent history includes an entry the feed does not show.
    //
    // And it has to KEEP reading. Entries tagged with this department but absent
    // from the feed set do exist (`hodNotice.sent` from its own HOD, the
    // `role.revoked` a roster removal cascades), so a single over-read can come
    // back with nothing to show while the department has plenty of history. The
    // walk is bounded two ways: a fixed number of passes, and the index's own
    // `_creationTime` ordering as the cursor.
    const entries: Doc<"activityLogs">[] = [];
    let before: number | undefined = undefined;
    for (let pass = 0; pass < FEED_MAX_PASSES; pass++) {
      const rows = await ctx.db
        .query("activityLogs")
        .withIndex("by_department", (q) =>
          before === undefined
            ? q.eq("departmentId", departmentId)
            : q.eq("departmentId", departmentId).lt("_creationTime", before)
        )
        .order("desc")
        .take(page * 4);
      if (rows.length === 0) break;
      for (const row of rows) {
        if (actions.includes(row.action)) entries.push(row);
        if (entries.length === page) break;
      }
      if (entries.length === page) break;
      before = rows[rows.length - 1]._creationTime;
    }

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
    //
    // ACTIVE only, deliberately. `findLiveMembership` would also return a
    // `pending_claim` row, which would hand an HOD the phone number, children
    // and mentorship proof of someone who has merely ASKED to serve and whose
    // request they may be about to decline. A claimant is never a member
    // (AC-13), so the NF-02 carve-out does not reach them. Deciding on a claim
    // needs the name, photo, clan and verification state the roster list
    // already carries, and nothing more.
    const membership = await findLiveMembership(ctx, userId, departmentId);
    if (!membership || membership.status !== "active") return null;

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

/**
 * Set or clear the one number the congregation uses to reach this department
 * (spec 0015, AC-29).
 *
 * Gated exactly as the description editor above is — `editDescription`, which
 * is HOD-only — and for the same reason, only more so: the description is what
 * a department says about itself, and this is the number the whole
 * congregation taps. A delegate, a roster member or anyone else is refused by
 * the server, not merely by a hidden field.
 *
 * Stored in strict E.164 form so there is one phone format in the portal
 * rather than two: `tel:` takes the stored value as is, `wa.me` takes it with
 * the leading `+` stripped, and neither survives free text. What the HOD types
 * is normalised on the way in (spaces, dashes and brackets come out), and
 * anything still not E.164 is refused rather than guessed at — inferring a
 * missing country code is how a congregation ends up dialling the wrong
 * continent.
 *
 * An empty string clears the field, which removes the contact buttons from the
 * member's screen entirely rather than leaving one that dials nothing.
 */
export const updateContactPhone = mutation({
  args: {
    departmentId: v.id("departments"),
    contactPhone: v.string(),
  },
  handler: async (ctx, { departmentId, contactPhone }) => {
    const { actor } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "editDescription"
    );

    const department = await ctx.db.get(departmentId);
    if (!department) throw new Error("Department not found");

    const normalised = normalizeE164Phone(contactPhone);
    if (normalised === null) {
      throw new ConvexError({
        code: DEPARTMENT_CONTACT_PHONE_INVALID,
        message:
          "Enter the number in full international form, starting with the country code, e.g. +256700123456.",
      });
    }
    // Convex drops an optional field patched to undefined, which is how an
    // empty value clears the number.
    const next = normalised.length > 0 ? normalised : undefined;

    // An unchanged save writes no audit entry. Saving a field you did not
    // change is not an event, and a feed full of them hides the ones that are.
    if (next === (department.contactPhone ?? undefined)) {
      return { ok: true as const, changed: false as const };
    }

    await ctx.db.patch(departmentId, { contactPhone: next });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.contact_phone_updated",
      targetType: "departments",
      targetId: departmentId,
      departmentId,
      metadata: { from: department.contactPhone ?? null, to: next ?? null },
    });

    return { ok: true as const, changed: true as const };
  },
});
