import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import {
  PROFILE_LIFECYCLE_ERRORS,
  PROFILE_LIFECYCLE_NOTICES,
} from "@klt-cyber/shared";
import {
  getActiveRoles,
  getAdministrationDepartmentId,
  getMediaDepartmentId,
  getCurrentUser,
  logActivity,
  requireUser,
} from "./lib/authz";
import { resolvePhotoUrl, syncIdentityToUser } from "./lib/identity";
import { findLiveMemberships } from "./lib/departmentMembership";
import { assertMentorshipChangeAllowed } from "./lib/profileLifecycle";
import { notificationCommon } from "./lib/reminders";
import { displayName } from "./lib/roleNotices";
import { scheduleReplacedMediaCleanupMany } from "./lib/mediaCleanup";

// Read-only "who am I" queries, plus `updateMyProfile` below for a person's own
// edits to their profile. Profile *submission* and *verification* are handled
// by `submitProfile` / `verifyProfile` in convex/memberProfiles.ts, and a
// submission that is waiting or has been sent back is edited whole through
// `resubmitProfile` there rather than field by field here.
//
// Creating a `memberProfiles` row is NOT gated on mentorship completion (that
// stopped being true before spec 0014) and does not by itself promote the
// caller to member — that happens only once Administration verifies the
// submission.

export async function getMyAccountCore(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
) {
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  const activeRoles = await getActiveRoles(ctx, user._id);

  const isSystemAdmin = activeRoles.some((r) => r.roleType === "system_admin");
  const adminDeptId = isSystemAdmin ? null : await getAdministrationDepartmentId(ctx);
  const hasAdministrationAccess =
    isSystemAdmin ||
    (adminDeptId !== null &&
      activeRoles.some(
        (r) =>
          r.departmentId === adminDeptId &&
          (r.roleType === "hod" || r.roleType === "department_admin")
      ));

  const mediaDeptId = isSystemAdmin ? null : await getMediaDepartmentId(ctx);
  const hasMediaAccess =
    isSystemAdmin ||
    (mediaDeptId !== null &&
      activeRoles.some(
        (r) =>
          r.departmentId === mediaDeptId &&
          (r.roleType === "hod" || r.roleType === "department_admin")
      ));

  return {
    user,
    profile: profile ?? null,
    activeRoles,
    hasAdministrationAccess,
    hasMediaAccess,
    // One already-resolved photo for every avatar on every surface (AC-14).
    // Resolved per read rather than stored, because `resolveMediaUrl` returns
    // a signed R2 URL that expires — see convex/lib/identity.ts. No client
    // reads the raw `users.profilePictureUrl` any more.
    photoUrl:
      (await resolvePhotoUrl(profile?.photoUrl, user.profilePictureUrl)) ?? null,
  };
}

export async function getMyProfileCore(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
) {
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!profile) return null;
  const [children, leadershipProgress, liveMemberships] = await Promise.all([
    ctx.db
      .query("children")
      .withIndex("by_parentUserId", (q) => q.eq("parentUserId", user._id))
      .collect(),
    ctx.db
      .query("leadershipProgress")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect(),
    // The wizard's departments step needs these to reopen pre-filled, and
    // department membership is not a field on the profile row (spec 0014). An
    // `active`-only read would drop the claims still waiting on their HOD,
    // which is exactly the set the person selected in the wizard.
    findLiveMemberships(ctx, user._id),
  ]);
  return {
    ...profile,
    children,
    leadershipProgress,
    departmentMemberships: liveMemberships.map((membership) => ({
      _id: membership._id,
      departmentId: membership.departmentId,
      status: membership.status,
    })),
  };
}

/**
 * Everything the mobile/web client needs to gate UI: the base user, their
 * member profile (or null if not yet submitted / still pending verification),
 * and their active role assignments.
 */
export const getMyAccount = query({
  args: {},
  handler: async (ctx) => {
    // Null (not an error) when unauthenticated: reactive clients stay
    // subscribed through sign-out, and the unauthenticated re-run must
    // resolve rather than crash the page mid-teardown.
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await getMyAccountCore(ctx, user);
  },
});

/** The caller's member profile plus their children and leadership progress. */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await getMyProfileCore(ctx, user);
  },
});

/**
 * Drives the mobile profile-completion flow: the caller's own `memberProfiles`
 * row if one exists, else null. The client
 * gates on the result — null shows the 7-step wizard, `pending_verification`
 * shows the review-pending screen, `verified` means the member experience
 * applies and the flow has nothing to do.
 *
 * Returns null (not an error) when unauthenticated, matching `getMyAccount`:
 * reactive clients stay subscribed through sign-out and must resolve rather
 * than crash mid-teardown.
 */
export const getMyProfileStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

// ── The one self-service edit mutation ───────────────────────────────────────

/**
 * The fields a member may unset, as a literal union (AC-11).
 *
 * An omitted value means "unchanged", which is what makes a partial save
 * possible at all — but it leaves no way to REMOVE a phone number or an
 * address. `clearFields` is that way, and it is a closed list rather than an
 * arbitrary field name so a caller cannot unset `firstName`, `sex`,
 * `maritalStatus` or `mentorshipStatus`, all of which the row requires.
 */
const clearableFieldValidator = v.union(
  v.literal("middleName"),
  v.literal("phone"),
  v.literal("dateOfBirth"),
  v.literal("shortBio"),
  v.literal("photoUrl"),
  v.literal("joinDate"),
  v.literal("address"),
  v.literal("spouseUserId"),
  v.literal("spouseNameUnlinked"),
  v.literal("anniversaryDate"),
  v.literal("nextOfKin"),
  v.literal("mentorshipProofUrl"),
  v.literal("occupation"),
  v.literal("industry"),
  v.literal("employer"),
  v.literal("skills")
);

/**
 * A member's own edit of their profile (F2-06, F2-09, AC-11, AC-12).
 *
 * Replaces the eight-field version this used to be. Both surfaces — the mobile
 * profile screen and the portal's Settings page — call this one mutation, so
 * "today only eight fields are editable" ends for both at once and a field
 * added later appears on both surfaces or neither.
 *
 * Three things are deliberately NOT here:
 *
 *   `clanId` — only `changeMyClan` writes it, so that mutation's elder notices
 *   and audit entry can never be skipped by routing a clan change through a
 *   general-purpose field save.
 *
 *   A `sent_back` row — saved through `memberProfiles.resubmitProfile`
 *   instead, so a one-field save can never resubmit by accident.
 *
 *   The client's idea of the profile's state — `profileStatus` is read from
 *   the stored row inside the handler, never taken as an argument.
 */
export const updateMyProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    middleName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    sex: v.optional(v.union(v.literal("male"), v.literal("female"))),
    dateOfBirth: v.optional(
      v.object({
        day: v.number(),
        month: v.number(),
        year: v.optional(v.number()),
      })
    ),
    maritalStatus: v.optional(
      v.union(
        v.literal("single"),
        v.literal("married"),
        v.literal("widowed"),
        v.literal("divorced")
      )
    ),
    shortBio: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    joinDate: v.optional(v.number()),
    address: v.optional(
      v.object({
        line1: v.string(),
        city: v.optional(v.string()),
        district: v.optional(v.string()),
        country: v.optional(v.string()),
      })
    ),
    spouseUserId: v.optional(v.id("users")),
    spouseNameUnlinked: v.optional(v.string()),
    anniversaryDate: v.optional(v.number()),
    nextOfKin: v.optional(
      v.object({
        fullName: v.string(),
        relationship: v.string(),
        phone: v.string(),
      })
    ),
    mentorshipStatus: v.optional(
      v.union(
        v.literal("not_enrolled"),
        v.literal("enrolled"),
        v.literal("completed")
      )
    ),
    mentorshipProofUrl: v.optional(v.string()),
    occupation: v.optional(v.string()),
    industry: v.optional(v.string()),
    employer: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    clearFields: v.optional(v.array(clearableFieldValidator)),
  },
  handler: async (ctx, { clearFields, ...args }) => {
    const user = await requireUser(ctx);
    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("No profile to update");

    // Read from the stored row, never from the client (AC-11).
    if (profile.profileStatus === "sent_back") {
      throw new ConvexError({
        code: PROFILE_LIFECYCLE_ERRORS.PROFILE_NOT_VERIFIED,
      });
    }

    assertMentorshipChangeAllowed(profile.mentorshipStatus, args.mentorshipStatus);

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }
    // `undefined` on a Convex patch unsets the field, which is exactly what
    // these names are asking for.
    for (const field of clearFields ?? []) {
      patch[field] = undefined;
    }


    await ctx.db.patch(profile._id, { ...patch, updatedAt: Date.now() });

    // The photo and the certificate they just replaced are nothing's any more
    // (AC-18). Scheduled, because a mutation cannot reach the bucket, so the
    // delete runs strictly after the new key has committed.
    //
    // `touched` is load bearing. This is a PARTIAL update: an omitted field
    // arrives as `undefined`, exactly like a cleared one. Without the check,
    // a member saving only their phone number from the portal would have
    // their photo deleted from the bucket while the row kept pointing at it.
    // A field counts as in play only if the payload named it, as a value or
    // in `clearFields`.
    const cleared = new Set<string>(clearFields ?? []);
    await scheduleReplacedMediaCleanupMany(ctx, [
      {
        touched: "photoUrl" in args || cleared.has("photoUrl"),
        previous: profile.photoUrl,
        next: args.photoUrl,
      },
      {
        touched:
          "mentorshipProofUrl" in args || cleared.has("mentorshipProofUrl"),
        previous: profile.mentorshipProofUrl,
        next: args.mentorshipProofUrl,
      },
    ]);

    // Name is mirrored on write; photo is resolved on read. See
    // convex/lib/identity.ts for why the two halves of F1-07 differ.
    await syncIdentityToUser(ctx, user._id, {
      firstName: args.firstName,
      lastName: args.lastName,
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "profile.edited",
      targetType: "memberProfiles",
      targetId: profile._id,
      // Which fields moved, so the trail says what the person changed rather
      // than only that they changed something.
      metadata: { userId: user._id, fields: Object.keys(patch) },
    });

    return { ok: true as const };
  },
});

/**
 * A member's own directory-sharing choice (F2-13, AC-17).
 *
 * Its own mutation rather than a field on `updateMyProfile`, because this is a
 * disclosure decision and a one-tap toggle, not part of a form save. Absent
 * reads as private, so a member who never answers is never disclosed.
 *
 * Nothing reads it yet — feature 13 builds the directory that does.
 */
export const setDirectorySharing = mutation({
  args: { directorySharing: v.boolean() },
  handler: async (ctx, { directorySharing }) => {
    const user = await requireUser(ctx);
    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("No profile to update");

    await ctx.db.patch(profile._id, {
      directorySharing,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "profile.edited",
      targetType: "memberProfiles",
      targetId: profile._id,
      metadata: { userId: user._id, fields: ["directorySharing"] },
    });

    return { ok: true as const };
  },
});


/**
 * The active elder of a clan, or null when it has none.
 *
 * A clan with no sitting elder notifies nobody and does not fail the change
 * (spec 0014, AC-22): a member should not be blocked from choosing their clan
 * because the church has not appointed its elder yet.
 */
async function clanElderId(
  ctx: MutationCtx,
  clanId: Id<"clans">
): Promise<Id<"users"> | null> {
  const elder = await ctx.db
    .query("roleAssignments")
    .withIndex("by_clanId", (q) => q.eq("clanId", clanId))
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "active"),
        q.eq(q.field("roleType"), "clan_elder")
      )
    )
    .first();
  return elder?.userId ?? null;
}

/**
 * A verified member sets or changes their own clan (F2-08, AC-22).
 *
 * **This is the only writer of `memberProfiles.clanId`.** The field is
 * deliberately absent from `updateMyProfile`'s arguments: leaving it there
 * would have let a member change their clan with no elder notices and no audit
 * entry, through a mutation that knows nothing about either. If you are adding
 * a clan write somewhere, add it here instead.
 *
 * Omitting `clanId` clears it, which is how somebody who picked the wrong clan
 * goes back to having none.
 *
 * The churn this allows is deliberate and is NOT prevented. A member may move
 * between clans as often as they like, and a Hospitality assignment can be
 * overridden by the member the moment it lands. Telling both elders is the
 * mitigation, not a prevention.
 */
export const changeMyClan = mutation({
  args: { clanId: v.optional(v.id("clans")) },
  handler: async (ctx, { clanId }) => {
    const user = await requireUser(ctx);
    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile || profile.profileStatus !== "verified") {
      throw new ConvexError({
        code: PROFILE_LIFECYCLE_ERRORS.PROFILE_NOT_VERIFIED,
      });
    }

    const previousClanId = profile.clanId;
    // Setting the clan somebody already has is a no op: no patch, no log, no
    // notice. Without this, a form resave would tell two elders about a change
    // that did not happen.
    if (previousClanId === clanId) return { ok: true as const };

    const incoming = clanId ? await ctx.db.get(clanId) : null;
    if (clanId && !incoming) throw new Error("Clan not found");
    const outgoing = previousClanId ? await ctx.db.get(previousClanId) : null;

    // Both elders are read BEFORE the patch. After it, the outgoing lookup is
    // gone — there is no record of which clan they used to be in.
    const [incomingElderId, outgoingElderId] = await Promise.all([
      clanId ? clanElderId(ctx, clanId) : Promise.resolve(null),
      previousClanId
        ? clanElderId(ctx, previousClanId)
        : Promise.resolve(null),
    ]);

    const now = Date.now();
    await ctx.db.patch(profile._id, { clanId, updatedAt: now });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "profile.clan_changed",
      targetType: "memberProfiles",
      targetId: profile._id,
      // Both clans, so the trail says where they went rather than only that
      // something moved.
      metadata: {
        userId: user._id,
        fromClanId: previousClanId ?? null,
        toClanId: clanId ?? null,
      },
    });

    // N26 to the elder gaining a member.
    if (incomingElderId && incoming) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        ...PROFILE_LIFECYCLE_NOTICES.clanJoined(
          displayName(user),
          incoming.name
        ),
        ...notificationCommon({
          audience: { type: "users", userIds: [incomingElderId] },
          deepLink: { type: "profile", id: user._id },
          createdBy: user._id,
          kind: "N26",
        }),
      });
    }

    // And to the elder losing one, who would otherwise find out by noticing
    // somebody had gone from their roster.
    if (outgoingElderId && outgoing) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        ...PROFILE_LIFECYCLE_NOTICES.clanLeft(displayName(user), outgoing.name),
        ...notificationCommon({
          audience: { type: "users", userIds: [outgoingElderId] },
          deepLink: { type: "profile", id: user._id },
          createdBy: user._id,
          kind: "N26",
        }),
      });
    }

    return { ok: true as const };
  },
});
