import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  MAX_ACTIVE_DEPARTMENTS,
  PROFILE_LIFECYCLE_COPY,
  PROFILE_LIFECYCLE_ERRORS,
  PROFILE_LIFECYCLE_NOTICES,
} from "@klt-cyber/shared";
import { internal } from "./_generated/api";
import {
  canManageChurchAdmin,
  getAdministrationAuthorityOrNull,
  logActivity,
  requireUser,
} from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";
import { resolvePhotoUrl, syncIdentityToUser } from "./lib/identity";
import { scheduleReplacedMediaCleanupMany } from "./lib/mediaCleanup";
import {
  assertNotStale,
  enteredStateAt,
  isResubmission,
  validateSentBackReason,
} from "./lib/profileLifecycle";
import { notificationCommon } from "./lib/reminders";
import { displayName } from "./lib/roleNotices";
import {
  notifyClaimActionable,
  resolveAdministrationReviewerIds,
} from "./lib/reviewerNotices";
import {
  findLiveMembership,
  findLiveMemberships,
} from "./lib/departmentMembership";

// The mobile 7-step profile-submission wizard and its Administration review
// workflow. Creating a `memberProfiles` row here does not by itself promote
// the caller; only `verifyProfile` does that, once Administration has reviewed
// the submission.
//
// The review is a CONVERSATION, not a single decision (spec 0014): a reviewer
// may verify, or send the profile back with a written reason, and the person
// edits and resubmits. See `sendProfileBack` and `resubmitProfile` below, and
// the three-state machine on `profileStatus` in convex/schema.ts.

const sexValidator = v.union(v.literal("male"), v.literal("female"));
const maritalStatusValidator = v.union(
  v.literal("single"),
  v.literal("married"),
  v.literal("widowed"),
  v.literal("divorced")
);
const mentorshipStatusValidator = v.union(
  v.literal("not_enrolled"),
  v.literal("enrolled"),
  v.literal("completed")
);
const dateOfBirthValidator = v.object({
  day: v.number(),
  month: v.number(),
  year: v.optional(v.number()),
});
const nextOfKinValidator = v.object({
  fullName: v.string(),
  relationship: v.string(),
  phone: v.string(),
});
const addressValidator = v.object({
  line1: v.string(),
  city: v.optional(v.string()),
  district: v.optional(v.string()),
  country: v.optional(v.string()),
});
const leadershipLevelValidator = v.union(
  v.literal("level_1"),
  v.literal("level_2"),
  v.literal("advanced")
);
// "not_enrolled" isn't a stored value — a level with no `leadershipProgress`
// row for the user is implicitly not enrolled (see the "don't store negative
// space" convention on that table in convex/schema.ts). This validator is
// intentionally narrower than the table's own status union: schema.ts still
// accepts a legacy "in_progress" (pre-rename) on existing rows, but no new
// submission may ever write it — see convex/leadershipMigration.ts.
const leadershipStatusValidator = v.union(
  v.literal("enrolled"),
  v.literal("completed")
);

// The editable bio fields, shared between `submitProfile` (required subset)
// and `verifyProfile`'s `edits` patch (fully optional).
const profileEditableFields = {
  firstName: v.string(),
  middleName: v.optional(v.string()),
  lastName: v.string(),
  phone: v.optional(v.string()),
  sex: sexValidator,
  dateOfBirth: v.optional(dateOfBirthValidator),
  maritalStatus: maritalStatusValidator,
  shortBio: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  joinDate: v.optional(v.number()),
  address: v.optional(addressValidator),
  spouseUserId: v.optional(v.id("users")),
  spouseNameUnlinked: v.optional(v.string()),
  anniversaryDate: v.optional(v.number()),
  nextOfKin: v.optional(nextOfKinValidator),
  mentorshipStatus: mentorshipStatusValidator,
  mentorshipProofUrl: v.optional(v.string()),
  clanId: v.optional(v.id("clans")),
  occupation: v.optional(v.string()),
  industry: v.optional(v.string()),
  employer: v.optional(v.string()),
  skills: v.optional(v.array(v.string())),
  // The wizard's last step asks this, so it arrives with the submission
  // rather than needing a seventh-and-a-half step (F2-01, AC-17).
  directorySharing: v.optional(v.boolean()),
};

const profileEditsPatchValidator = v.object({
  firstName: v.optional(v.string()),
  middleName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  phone: v.optional(v.string()),
  sex: v.optional(sexValidator),
  dateOfBirth: v.optional(dateOfBirthValidator),
  maritalStatus: v.optional(maritalStatusValidator),
  shortBio: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  joinDate: v.optional(v.number()),
  address: v.optional(addressValidator),
  spouseUserId: v.optional(v.id("users")),
  spouseNameUnlinked: v.optional(v.string()),
  anniversaryDate: v.optional(v.number()),
  nextOfKin: v.optional(nextOfKinValidator),
  mentorshipStatus: v.optional(mentorshipStatusValidator),
  mentorshipProofUrl: v.optional(v.string()),
  clanId: v.optional(v.id("clans")),
  occupation: v.optional(v.string()),
  industry: v.optional(v.string()),
  employer: v.optional(v.string()),
  skills: v.optional(v.array(v.string())),
});

const childEntryValidator = v.object({
  name: v.string(),
  dateOfBirth: v.optional(v.number()),
  sex: sexValidator,
});

const leadershipEntryValidator = v.object({
  level: leadershipLevelValidator,
  status: leadershipStatusValidator,
  proofUrl: v.optional(v.string()),
  completedAt: v.optional(v.number()),
});

// The resubmission counterparts. Identical to the two above plus an optional
// `_id`: carrying the row id is what lets `resubmitProfile` PATCH a row the
// person edited instead of deleting and recreating it, so ids stay stable
// across a resubmission (spec 0014, AC-6, AC-13).
const childResubmitEntryValidator = v.object({
  _id: v.optional(v.id("children")),
  name: v.string(),
  dateOfBirth: v.optional(v.number()),
  sex: sexValidator,
});

const leadershipResubmitEntryValidator = v.object({
  _id: v.optional(v.id("leadershipProgress")),
  level: leadershipLevelValidator,
  status: leadershipStatusValidator,
  proofUrl: v.optional(v.string()),
  completedAt: v.optional(v.number()),
});

// ── Joins used by every admin verification read ──────────────────────────────

async function withChildrenAndLeadership(
  ctx: QueryCtx | MutationCtx,
  profile: Doc<"memberProfiles">
) {
  const [children, leadershipProgress, spouse, departmentMemberships] = await Promise.all([
    ctx.db
      .query("children")
      .withIndex("by_parentUserId", (q) => q.eq("parentUserId", profile.userId))
      .collect(),
    ctx.db
      .query("leadershipProgress")
      .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
      .collect(),
    // Resolve a linked spouse's display name — `spouseUserId` alone isn't
    // reviewable. Unset when unlinked; `spouseNameUnlinked` covers that case.
    profile.spouseUserId ? ctx.db.get(profile.spouseUserId) : null,
    // Areas of Service claimed at submission — written straight into
    // `departmentMemberships` by `submitProfile`, not a field on this table
    // (see that mutation). Included here so every admin verification read
    // gets it for free, same as children/leadershipProgress.
    //
    // Both live statuses, not just `active` (spec 0012 AC-21): since a
    // submission now creates `pending_claim` rows awaiting their HOD, an
    // `active`-only read would show a reviewing admin an empty list for exactly
    // the profiles they are reviewing. Each row carries its own `status`, so
    // the reviewer can tell a confirmed seat from a request still waiting.
    findLiveMemberships(ctx, profile.userId),
  ]);
  // Resolve the uploaded photo + proof KEYS to signed URLs so a reviewing admin
  // sees the actual images. (photoUrl may be a Google account URL — passed
  // through; proofs are always R2 keys.)
  return {
    ...profile,
    photoUrl: await resolveMediaUrl(profile.photoUrl),
    mentorshipProofUrl: await resolveMediaUrl(profile.mentorshipProofUrl),
    spouseName: spouse
      ? `${spouse.firstName ?? ""} ${spouse.lastName ?? ""}`.trim() || null
      : null,
    children,
    leadershipProgress: await Promise.all(
      leadershipProgress.map(async (lp) => ({
        ...lp,
        proofUrl: await resolveMediaUrl(lp.proofUrl),
      }))
    ),
    departmentMemberships: await Promise.all(
      departmentMemberships.map(async (membership) => ({
        ...membership,
        departmentName: (await ctx.db.get(membership.departmentId))?.name ?? null,
      }))
    ),
  };
}

// ── Reconcilers, used by `resubmitProfile` ───────────────────────────────────
//
// All three answer the same question: the person has sent the whole wizard
// again, so which stored rows should be patched, inserted or removed?
//
// Reconciling rather than wiping and rewriting is the point (AC-13). Delete
// and recreate would change every `_id` on every save, which breaks anything
// holding one (a reviewer's open screen, a log entry's `targetId`) and makes
// "the person edited one child's name" indistinguishable from "the person
// replaced all their children" in the audit trail.

/** Patch rows carrying an `_id`, insert those without, remove the stored rows left out. */
async function reconcileChildren(
  ctx: MutationCtx,
  userId: Id<"users">,
  entries:
    | {
        _id?: Id<"children">;
        name: string;
        dateOfBirth?: number;
        sex: "male" | "female";
      }[]
    | undefined,
  now: number
) {
  // `undefined` means the client did not send this section at all, which is
  // not the same as sending an empty one: only an explicit `[]` removes
  // everything.
  if (entries === undefined) return;

  const stored = await ctx.db
    .query("children")
    .withIndex("by_parentUserId", (q) => q.eq("parentUserId", userId))
    .collect();
  const storedById = new Map(stored.map((row) => [row._id, row]));
  const keptIds = new Set<Id<"children">>();

  for (const entry of entries) {
    const existing = entry._id ? storedById.get(entry._id) : undefined;
    // An `_id` naming a row that is not this person's is ignored rather than
    // trusted: the id came from the client, and patching on it unchecked
    // would let anybody edit anybody's child row.
    if (existing) {
      keptIds.add(existing._id);
      await ctx.db.patch(existing._id, {
        name: entry.name,
        dateOfBirth: entry.dateOfBirth,
        sex: entry.sex,
        updatedAt: now,
      });
      continue;
    }
    const childId = await ctx.db.insert("children", {
      parentUserId: userId,
      name: entry.name,
      ...(entry.dateOfBirth !== undefined
        ? { dateOfBirth: entry.dateOfBirth }
        : {}),
      sex: entry.sex,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: userId,
      action: "child.added",
      targetType: "children",
      targetId: childId,
    });
  }

  for (const row of stored) {
    if (keptIds.has(row._id)) continue;
    await ctx.db.delete(row._id);
    await logActivity(ctx, {
      actorUserId: userId,
      action: "child.removed",
      targetType: "children",
      targetId: row._id,
    });
  }
}

/** The same reconcile for `leadershipProgress`. */
async function reconcileLeadership(
  ctx: MutationCtx,
  userId: Id<"users">,
  entries:
    | {
        _id?: Id<"leadershipProgress">;
        level: "level_1" | "level_2" | "advanced";
        status: "enrolled" | "completed";
        proofUrl?: string;
        completedAt?: number;
      }[]
    | undefined,
  now: number
) {
  if (entries === undefined) return;

  const stored = await ctx.db
    .query("leadershipProgress")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const storedById = new Map(stored.map((row) => [row._id, row]));
  const keptIds = new Set<Id<"leadershipProgress">>();

  for (const entry of entries) {
    const existing = entry._id ? storedById.get(entry._id) : undefined;
    if (existing) {
      keptIds.add(existing._id);
      await ctx.db.patch(existing._id, {
        level: entry.level,
        status: entry.status,
        proofUrl: entry.proofUrl,
        completedAt: entry.completedAt,
        updatedAt: now,
      });
      continue;
    }
    await ctx.db.insert("leadershipProgress", {
      userId,
      level: entry.level,
      status: entry.status,
      ...(entry.proofUrl ? { proofUrl: entry.proofUrl } : {}),
      ...(entry.completedAt !== undefined
        ? { completedAt: entry.completedAt }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const row of stored) {
    if (keptIds.has(row._id)) continue;
    await ctx.db.delete(row._id);
    await logActivity(ctx, {
      actorUserId: userId,
      action: "leadership.removed",
      targetType: "leadershipProgress",
      targetId: row._id,
    });
  }
}

/**
 * Reconcile the person's department claims against the ids they sent.
 *
 * A new id creates a `pending_claim`; a live row whose id is gone becomes
 * terminal. The verified gate `addMyAreaOfService` imposes does NOT apply —
 * this is the submission path and the person is by definition not verified
 * yet — but the `MAX_ACTIVE_DEPARTMENTS` cap does, counted after the reconcile.
 *
 * Reconciling is what makes a resubmitted wizard safe: it re-sends its own
 * earlier choices, and inserting them again would reject the save with "you
 * have already asked to serve in X" for a choice the person never changed.
 */
async function reconcileDepartmentClaims(
  ctx: MutationCtx,
  userId: Id<"users">,
  departmentIds: Id<"departments">[] | undefined,
  now: number
) {
  if (departmentIds === undefined) return;

  const wanted = new Set(departmentIds);
  const live = await findLiveMemberships(ctx, userId);
  const liveByDepartment = new Map(
    live.map((row) => [row.departmentId, row])
  );

  // The cap counts what this save will actually LEAVE BEHIND, not the set the
  // wizard sent. The two differ: an `active` row the person deselected is
  // retained on purpose (see the loop below), because leaving a roster is
  // `leaveMyAreaOfService`, with its own role block and its own notices.
  //
  // So a person with three claims, one of them confirmed, who deselects the
  // confirmed one and picks a different department would end up on four live
  // rows if the cap were measured on `wanted` alone, violating the invariant
  // everywhere else enforces with no mutation ever reporting it.
  const retained = live.filter(
    (row) => row.status !== "pending_claim" && !wanted.has(row.departmentId)
  );
  if (wanted.size + retained.length > MAX_ACTIVE_DEPARTMENTS) {
    throw new ConvexError({
      code: PROFILE_LIFECYCLE_ERRORS.DEPARTMENT_CAP_REACHED,
    });
  }

  for (const departmentId of wanted) {
    if (liveByDepartment.has(departmentId)) continue;
    const membershipId = await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      addedBy: userId,
      status: "pending_claim",
      claimedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: userId,
      action: "department.claim_created",
      targetType: "departmentMemberships",
      targetId: membershipId,
      departmentId,
      metadata: { userId, departmentId, selfService: true },
    });
  }

  for (const row of live) {
    if (wanted.has(row.departmentId)) continue;
    // An `active` row is a roster place somebody authorised, so dropping the
    // id in the wizard withdraws the CLAIM only. Leaving a roster is
    // `leaveMyAreaOfService`, which has its own role block and its own
    // notices; silently removing an active row here would route around both.
    if (row.status !== "pending_claim") continue;
    await ctx.db.patch(row._id, {
      status: "declined",
      decidedBy: userId,
      decidedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: userId,
      action: "department.claim_withdrawn",
      targetType: "departmentMemberships",
      targetId: row._id,
      departmentId: row.departmentId,
      metadata: { userId, departmentId: row.departmentId, selfService: true },
    });
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Visitor → pending-member submission. Creates the caller's `memberProfiles`
 * row, plus any `children` / `leadershipProgress` / `departmentMemberships`
 * rows, in one mutation. Does NOT promote the caller — that happens only
 * once Administration verifies via `verifyProfile`. Gated server-side only on
 * not already having a profile — mentorship status is self-reported and is not
 * required to be "completed".
 *
 * A caller who already has one edits it through `resubmitProfile` (while it is
 * waiting or has been sent back) or `profile.updateMyProfile` (once verified),
 * so "no resubmission path" stopped being true in spec 0014.
 */
export const submitProfile = mutation({
  args: {
    ...profileEditableFields,
    children: v.optional(v.array(childEntryValidator)),
    leadershipEntries: v.optional(v.array(leadershipEntryValidator)),
    // Areas of Service — Step 6. Self-selected, up to MAX_ACTIVE_DEPARTMENTS.
    // Written directly to `departmentMemberships` below (see that table's
    // comment in convex/departmentMemberships.ts) rather than living on
    // `memberProfiles` — department membership is deliberately not a
    // profile field.
    departmentIds: v.optional(v.array(v.id("departments"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) throw new Error("Profile already submitted");

    const { children, leadershipEntries, departmentIds, ...profileFields } =
      args;
    const now = Date.now();

    const profileId = await ctx.db.insert("memberProfiles", {
      userId: user._id,
      ...profileFields,
      profileStatus: "pending_verification",
      createdAt: now,
      updatedAt: now,
    });

    // One source of truth for the name, from the first write (AC-14).
    await syncIdentityToUser(ctx, user._id, {
      firstName: profileFields.firstName,
      lastName: profileFields.lastName,
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "profile.submitted",
      targetType: "memberProfiles",
      targetId: profileId,
    });

    if (children) {
      for (const child of children) {
        const childId = await ctx.db.insert("children", {
          parentUserId: user._id,
          name: child.name,
          ...(child.dateOfBirth !== undefined
            ? { dateOfBirth: child.dateOfBirth }
            : {}),
          sex: child.sex,
          createdAt: now,
          updatedAt: now,
        });
        await logActivity(ctx, {
          actorUserId: user._id,
          action: "child.added",
          targetType: "children",
          targetId: childId,
        });
      }
    }

    if (leadershipEntries) {
      for (const entry of leadershipEntries) {
        await ctx.db.insert("leadershipProgress", {
          userId: user._id,
          level: entry.level,
          status: entry.status,
          ...(entry.proofUrl ? { proofUrl: entry.proofUrl } : {}),
          ...(entry.completedAt !== undefined
            ? { completedAt: entry.completedAt }
            : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (departmentIds && departmentIds.length > 0) {
      const uniqueDepartmentIds = Array.from(new Set(departmentIds));
      if (uniqueDepartmentIds.length > MAX_ACTIVE_DEPARTMENTS) {
        throw new Error(
          `You can select at most ${MAX_ACTIVE_DEPARTMENTS} areas of service`
        );
      }
      // A REQUEST to serve, not a roster place (spec 0012, AC-15). Until that
      // change this path inserted `status: "active"`, so a person's own
      // selection put them on a roster nobody had authorised. Now it writes a
      // `pending_claim` row that the department's HOD confirms or declines, and
      // the person receives nothing from that department until they do.
      //
      // Still intentionally NOT `addDepartmentMember`, which requires
      // department authority and an already-verified profile. Neither holds
      // here: the caller is the member themself, submitting for the first time.
      for (const departmentId of uniqueDepartmentIds) {
        // One live row per person and department (spec 0012 AC-15). Without
        // this, a retried submission or a later claim could leave two rows for
        // one pair, and an HOD confirming one of them would be confirming a
        // person who is already on the roster.
        const live = await findLiveMembership(ctx, user._id, departmentId);
        if (live) {
          const department = await ctx.db.get(departmentId);
          const name = department?.name ?? "that area of service";
          throw new Error(
            live.status === "active"
              ? `You already serve in ${name}`
              : `You have already asked to serve in ${name}`
          );
        }
        const membershipId = await ctx.db.insert("departmentMemberships", {
          userId: user._id,
          departmentId,
          addedBy: user._id,
          status: "pending_claim",
          claimedAt: now,
        });
        await logActivity(ctx, {
          actorUserId: user._id,
          action: "department.claim_created",
          targetType: "departmentMemberships",
          targetId: membershipId,
          // Carried at the top level so the claim shows up in that
          // department's own dashboard feed (AC-35, AC-37).
          departmentId,
          metadata: { userId: user._id, departmentId, selfService: true },
        });
      }
    }

    // N04 to the Administration reviewers, or the System Admins when
    // Administration has nobody (spec 0013, AC-8). A resolved `users` list,
    // not a `role` audience, which has no department scoping and would reach
    // every department's HOD. Skipped when nobody is left (AC-17).
    const reviewerIds = await resolveAdministrationReviewerIds(ctx);
    if (reviewerIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        title: "New profile pending review",
        body: `${displayName(user)} submitted a member profile for verification.`,
        ...notificationCommon({
          audience: { type: "users", userIds: reviewerIds },
          // Opens /portal-work on mobile: the review itself happens on the
          // web portal.
          deepLink: { type: "profile_review", id: profileId },
          createdBy: user._id,
          kind: "N04",
        }),
      });
    }

    return { profileId };
  },
});

/**
 * Administration verification. Optionally applies corrections first, then marks
 * the profile verified and flips the linked user from visitor to member.
 * Never touches `roleAssignments` — verification and admin authority stay
 * fully independent.
 *
 * Accepts a `sent_back` row as well as a pending one, clearing the three send
 * back fields as it goes (spec 0014, AC-34): a reviewer who sent a profile
 * back by mistake has to be able to undo it without waiting for the person to
 * resubmit, and a verified row must not keep looking sent back afterwards.
 */
export const verifyProfile = mutation({
  args: {
    profileId: v.id("memberProfiles"),
    edits: v.optional(profileEditsPatchValidator),
    // Required, and a breaking change to every caller including the seeds and
    // the tests (spec 0014, AC-7). The portal passes the `updatedAt` from the
    // row it actually rendered, never a fresh read — a fresh read would always
    // match and the guard would be decoration.
    seenUpdatedAt: v.number(),
  },
  handler: async (ctx, { profileId, edits, seenUpdatedAt }) => {
    const actor = await canManageChurchAdmin(ctx);

    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    // Verifying twice is a no op (spec 0013, AC-10): no write, no log, and
    // above all no second N05, verified email or N10 claim alert.
    //
    // Deliberately BEFORE the stale check: a no op has nothing to overwrite,
    // so a second press of Verify should quietly do nothing rather than
    // report a conflict about a profile that is already in the state the
    // reviewer wanted.
    if (profile.profileStatus === "verified") return { ok: true as const };

    assertNotStale(profile, seenUpdatedAt);

    if (edits) {
      await ctx.db.patch(profileId, { ...edits, updatedAt: Date.now() });
      // A reviewer's correction to the name is a name write like any other,
      // so it mirrors onto the `users` row too (AC-14).
      await syncIdentityToUser(ctx, profile.userId, {
        firstName: edits.firstName,
        lastName: edits.lastName,
      });
    }

    const now = Date.now();
    await ctx.db.patch(profileId, {
      profileStatus: "verified",
      verifiedBy: actor._id,
      verifiedAt: now,
      updatedAt: now,
      // Clear the send-back round, whether or not this row was sent back
      // (AC-34). `undefined` on a patch unsets the field in Convex.
      sentBackReason: undefined,
      sentBackBy: undefined,
      sentBackAt: undefined,
    });

    // profileCompleted mirrors the same "has a recognised church identity"
    // moment `role` transitions on.
    await ctx.db.patch(profile.userId, {
      role: "member",
      profileCompleted: true,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "profile.verified",
      targetType: "memberProfiles",
      targetId: profileId,
      metadata: { userId: profile.userId },
    });

    // Copy deliberately says "verified", not "member"/"welcome to the
    // family": per product guidance, verification and official membership
    // are meant to be two distinct moments (membership only once
    // mentorship is separately marked complete), even though this mutation
    // currently promotes `role` to "member" in the same step, unconditionally
    // of `mentorshipStatus` — a known gap that's out of scope here. Revisit
    // this copy once a real mentorship-completion trigger exists.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      // "the church office" named the wrong body and was one of four different
      // phrases for the same reviewer across four screens (spec 0014, AC-26).
      // The name now comes from one constant, so a copy change is one edit.
      title: PROFILE_LIFECYCLE_COPY.verified.title,
      body: `${PROFILE_LIFECYCLE_COPY.verified.body} You now have full member access in the app.`,
      ...notificationCommon({
        audience: { type: "users", userIds: [profile.userId] },
        // Recognized by apps/mobile/app/notifications.tsx — routes to the
        // caller's own Profile screen (which takes no id param; `id` here
        // is just the affected user, carried for completeness).
        deepLink: { type: "profile", id: profile.userId },
        createdBy: actor._id,
        kind: "N05",
      }),
    });

    // The person's claims became actionable just now: an HOD only hears about
    // a request once the claimant is verified (spec 0013, AC-9).
    const liveMemberships = await findLiveMemberships(ctx, profile.userId);
    for (const membership of liveMemberships) {
      if (membership.status === "pending_claim") {
        await notifyClaimActionable(ctx, membership, actor._id);
      }
    }

    // The same news by email (AC-13), beside the push notice rather than
    // instead of it. Its wording deliberately matches the copy above: verified,
    // and no claim of membership or completed mentorship. Scheduled, so a
    // send that cannot be queued never fails the verification itself.
    await ctx.scheduler.runAfter(0, internal.emails.sendProfileVerified, {
      userId: profile.userId,
      profileId,
      verifiedAt: now,
    });

    return { ok: true as const };
  },
});

/**
 * Hand a profile back to its owner with a written reason (F2-05, A2-02).
 *
 * The missing half of the review conversation. Before this a reviewer had one
 * button: they could verify, or they could silently correct the submission
 * themselves, or they could leave it in the queue forever. None of those is
 * "I need you to change this".
 *
 * Gated by `canManageChurchAdmin`, the same helper `verifyProfile` uses, so
 * Administration HOD, Administration delegate and System Admin may call it and
 * nobody else. The refusal happens here, in the server, not in the portal
 * (AC-10).
 *
 * Sending back a profile that is ALREADY `sent_back` is allowed and replaces
 * the reason, writing a fresh log row and a fresh notice, so a reviewer can
 * correct what they asked for (AC-9). Because `sentBackAt` moves, the email's
 * idempotency key moves with it and the second email sends.
 */
export const sendProfileBack = mutation({
  args: {
    profileId: v.id("memberProfiles"),
    reason: v.string(),
    seenUpdatedAt: v.number(),
  },
  handler: async (ctx, { profileId, reason, seenUpdatedAt }) => {
    const actor = await canManageChurchAdmin(ctx);

    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    // `verified` is terminal in this feature: nothing demotes a member (AC-9).
    if (profile.profileStatus === "verified") {
      throw new ConvexError({
        code: PROFILE_LIFECYCLE_ERRORS.PROFILE_ALREADY_VERIFIED,
      });
    }

    assertNotStale(profile, seenUpdatedAt);
    const trimmedReason = validateSentBackReason(reason);

    const now = Date.now();
    await ctx.db.patch(profileId, {
      profileStatus: "sent_back",
      sentBackReason: trimmedReason,
      sentBackBy: actor._id,
      sentBackAt: now,
      updatedAt: now,
    });

    // The reason goes in the metadata, so the trail records what was actually
    // asked for rather than only that something was (AC-2).
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "profile.sent_back",
      targetType: "memberProfiles",
      targetId: profileId,
      metadata: { userId: profile.userId, reason: trimmedReason },
    });

    // N06. The copy the member reads names REVIEWER_NAME, never the actor:
    // A2-05 is explicit that members see the body, not the individual.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      ...PROFILE_LIFECYCLE_NOTICES.sentBack(trimmedReason),
      ...notificationCommon({
        audience: { type: "users", userIds: [profile.userId] },
        // Routes to the person's own Profile screen, which shows the reason in
        // full and the way back into their submission.
        deepLink: { type: "profile", id: profile.userId },
        createdBy: actor._id,
        kind: "N06",
      }),
    });

    // The same news by email, through the action and template spec 0007 built
    // and nothing has called until now (AC-3). `sentBackAt` is passed so the
    // existing `profile_sent_back:<profileId>:<sentBackAt>` idempotency key
    // stays correct across repeats: a second send-back is a new key and sends.
    await ctx.scheduler.runAfter(0, internal.emails.sendProfileSentBack, {
      userId: profile.userId,
      profileId,
      sentBackAt: now,
      reason: trimmedReason,
    });

    return { ok: true as const };
  },
});

/**
 * The owner's own edit of a submission that is waiting or has come back
 * (F2-03, A2-03, AC-6).
 *
 * Takes `submitProfile`'s whole argument shape, because the person reopens the
 * whole seven-step wizard and saves it in one go. That is why
 * `profile.updateMyProfile` cannot serve these states: it carries profile
 * fields only, and so could not satisfy AC-6 at all. Two edit mutations rather
 * than one is deliberate — one for a whole submission here, one for a verified
 * member's field-level edit there — and a single mutation for all three states
 * was the first design and was wrong for exactly this reason.
 *
 * One accepted consequence: a sent-back person who saves with nothing changed
 * still resubmits, because the state transition is the point of the save
 * rather than a side effect of a diff. A reviewer sees a resubmission with no
 * visible change, which is mildly annoying and much simpler than guessing at
 * intent.
 */
export const resubmitProfile = mutation({
  args: {
    ...profileEditableFields,
    children: v.optional(v.array(childResubmitEntryValidator)),
    leadershipEntries: v.optional(v.array(leadershipResubmitEntryValidator)),
    departmentIds: v.optional(v.array(v.id("departments"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Own profile only, read from the caller's own id — there is no "whose
    // profile" argument to forge.
    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("No profile to resubmit");
    // A verified member edits through `profile.updateMyProfile` instead, so a
    // field-level save can never resubmit by accident (AC-11).
    if (profile.profileStatus === "verified") {
      throw new ConvexError({
        code: PROFILE_LIFECYCLE_ERRORS.PROFILE_ALREADY_VERIFIED,
      });
    }

    const { children, leadershipEntries, departmentIds, ...profileFields } =
      args;
    const now = Date.now();
    const wasSentBack = profile.profileStatus === "sent_back";

    // One patch and one `updatedAt` for the whole save, whatever it touched,
    // so a reviewer's stale guard sees one moment rather than several.
    await ctx.db.patch(profile._id, { ...profileFields, updatedAt: now });

    // The wizard is the MAIN place a photo gets replaced, so the cleanup has
    // to be here as well as in `updateMyProfile` (AC-18).
    //
    // `touched` is derived from the payload, exactly as it is there, and NOT
    // hardcoded to true. This looks like a whole-submission save where every
    // field is present, but it is not: the wizard has no mentorship
    // certificate step, so it never sends that field, and assuming otherwise
    // would delete the certificate a reviewer attached on every resubmission.
    await scheduleReplacedMediaCleanupMany(ctx, [
      {
        touched: "photoUrl" in profileFields,
        previous: profile.photoUrl,
        next: profileFields.photoUrl,
      },
      {
        touched: "mentorshipProofUrl" in profileFields,
        previous: profile.mentorshipProofUrl,
        next: profileFields.mentorshipProofUrl,
      },
    ]);
    await syncIdentityToUser(ctx, user._id, {
      firstName: profileFields.firstName,
      lastName: profileFields.lastName,
    });

    await reconcileChildren(ctx, user._id, children, now);
    await reconcileLeadership(ctx, user._id, leadershipEntries, now);
    await reconcileDepartmentClaims(ctx, user._id, departmentIds, now);

    if (wasSentBack) {
      // Back into the queue, and `sentBackAt`/`sentBackReason` stay put ON
      // PURPOSE: they are what makes this row read as "Resubmitted" and what
      // shows the reviewer their own earlier words (AC-4, AC-5).
      await ctx.db.patch(profile._id, {
        profileStatus: "pending_verification",
      });

      await logActivity(ctx, {
        actorUserId: user._id,
        action: "profile.resubmitted",
        targetType: "memberProfiles",
        targetId: profile._id,
        metadata: { userId: user._id },
      });

      // N04 again, with the resubmission wording so a reviewer can tell it
      // from a first submission (AC-33). Same resolver and the same System
      // Admin fallback spec 0013 built, and the same skip when nobody is left.
      const reviewerIds = await resolveAdministrationReviewerIds(ctx);
      if (reviewerIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
          ...PROFILE_LIFECYCLE_NOTICES.resubmitted(displayName(user)),
          ...notificationCommon({
            audience: { type: "users", userIds: reviewerIds },
            deepLink: { type: "profile_review", id: profile._id },
            createdBy: user._id,
            kind: "N04",
          }),
        });
      }
    } else {
      // Already in the queue: log the edit and tell nobody. Nobody is waiting
      // to hear that a submission already waiting changed, and the queue reads
      // the row live, so the reviewer is looking at the new version already.
      await logActivity(ctx, {
        actorUserId: user._id,
        action: "profile.edited",
        targetType: "memberProfiles",
        targetId: profile._id,
        metadata: { userId: user._id },
      });
    }

    return { profileStatus: "pending_verification" as const };
  },
});

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Who sent a profile back, by name, for a reviewer's eyes (AC-8).
 *
 * Falls back to "a reviewer" when that account has since been deleted, rather
 * than showing an empty cell or an id. The index's note that `sentBackBy` is
 * never shown applies to the MEMBER; reviewers see it, which is the whole
 * point of recording it.
 */
async function sentBackByName(
  ctx: QueryCtx | MutationCtx,
  sentBackBy: Id<"users"> | undefined
): Promise<string | null> {
  if (!sentBackBy) return null;
  const reviewer = await ctx.db.get(sentBackBy);
  if (!reviewer || reviewer.deletedAt !== undefined) return "a reviewer";
  return displayName(reviewer);
}

/**
 * All profiles awaiting verification, joined with their children and
 * leadership-progress rows so a review screen has everything in one call.
 *
 * Carries the derived resubmission marker and the earlier reason (AC-5). A
 * resubmission is DERIVED, never stored — `pending_verification` with
 * `sentBackAt` set — so no second field can disagree with the row.
 */
export const listPendingVerifications = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const pending = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) =>
        q.eq("profileStatus", "pending_verification")
      )
      .collect();
    const rows = await Promise.all(
      pending
        .sort((a, b) => enteredStateAt(a) - enteredStateAt(b))
        .map(async (profile) => ({
          ...(await withChildrenAndLeadership(ctx, profile)),
          isResubmission: isResubmission(profile),
          sentBackByName: await sentBackByName(ctx, profile.sentBackBy),
        }))
    );
    return rows;
  },
});

/**
 * Profiles sent back and waiting on their owner (AC-8).
 *
 * A second list beside the queue, not a filter on it: these two are waiting on
 * different people, and a reviewer scanning for work they can do should not
 * have to read past the ones they have already answered.
 *
 * Gated by `getAdministrationAuthorityOrNull` and returning `null` when
 * unauthenticated, matching `listPendingVerifications` and
 * `getProfileForReview`, so a live subscription survives sign-out instead of
 * throwing mid-teardown (AC-10).
 */
export const listSentBack = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const sentBack = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "sent_back"))
      .collect();

    const rows = await Promise.all(
      sentBack
        .sort((a, b) => enteredStateAt(a) - enteredStateAt(b))
        .map(async (profile) => {
          const [user, photoUrl, reviewerName] = await Promise.all([
            ctx.db.get(profile.userId),
            resolveMediaUrl(profile.photoUrl),
            sentBackByName(ctx, profile.sentBackBy),
          ]);
          // Deleted accounts leave the list: these are people, not rows, the
          // same rule spec 0008 applied to every other count. The orphaned
          // `sent_back` status itself is never cleaned up — worth folding into
          // that spec's deletion sweep.
          if (!user || user.deletedAt !== undefined) return null;
          return {
            _id: profile._id,
            userId: profile.userId,
            firstName: profile.firstName,
            middleName: profile.middleName,
            lastName: profile.lastName,
            // Resolved here rather than on the client, and preferring the
            // profile's own upload over the account picture (AC-14).
            photoUrl: photoUrl ?? user.profilePictureUrl ?? null,
            sentBackAt: profile.sentBackAt ?? profile._creationTime,
            sentBackReason: profile.sentBackReason ?? null,
            sentBackByName: reviewerName,
            updatedAt: profile.updatedAt,
          };
        })
    );
    return rows.filter((row) => row !== null);
  },
});

/**
 * A single profile for review, with the same children/leadership join, plus
 * the send-back round so the reviewer can see what they asked for last time
 * before deciding again (AC-5).
 */
export const getProfileForReview = query({
  args: { profileId: v.id("memberProfiles") },
  handler: async (ctx, { profileId }) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const profile = await ctx.db.get(profileId);
    if (!profile) return null;
    return {
      ...(await withChildrenAndLeadership(ctx, profile)),
      isResubmission: isResubmission(profile),
      sentBackByName: await sentBackByName(ctx, profile.sentBackBy),
    };
  },
});

/**
 * Verified members joined with their active role assignments AND their active
 * department roster memberships.
 *
 * Returns a NARROW PROJECTION, not whole documents — only the fields the
 * directory and the roster's add-member picker actually render. The omitted
 * fields (contact details, address, next of kin, employment, auth identity)
 * are deliberately withheld, not accidentally missing: adding one back means
 * disclosing it to every Administration-authority session. See the projection
 * in the handler.
 *
 * Returns a list of assignments/memberships
 * per member (not a single value each) — a member may hold more than one role
 * simultaneously (e.g. Church Admin and Clan Elder at once), and may serve on
 * up to 3 department rosters (see MAX_ACTIVE_DEPARTMENTS in
 * departmentMemberships.ts) without holding any leadership role at all.
 * `activeRoles` (system_admin/clan_elder/hod/department_admin) and
 * `departmentMemberships` (plain roster membership) are deliberately separate
 * fields — see the "two orthogonal permission dimensions" note in
 * AGENTS.md — callers that want a single "Area(s) of Service" view should
 * combine both rather than assume roleAssignments is the whole picture.
 */
export const listVerifiedMembersWithRoles = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    const verified = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
      .collect();

    const activeAssignments = (
      await ctx.db.query("roleAssignments").collect()
    ).filter((assignment) => assignment.status === "active");
    const rolesByUser = new Map<Id<"users">, Doc<"roleAssignments">[]>();
    for (const assignment of activeAssignments) {
      const held = rolesByUser.get(assignment.userId) ?? [];
      held.push(assignment);
      rolesByUser.set(assignment.userId, held);
    }

    const activeMemberships = (
      await ctx.db.query("departmentMemberships").collect()
    ).filter((membership) => membership.status === "active");
    const membershipsByUser = new Map<
      Id<"users">,
      Doc<"departmentMemberships">[]
    >();
    for (const membership of activeMemberships) {
      const held = membershipsByUser.get(membership.userId) ?? [];
      held.push(membership);
      membershipsByUser.set(membership.userId, held);
    }

    // One await per member, resolved together rather than in sequence. Only
    // the photo is taken from the user row — see the projection below for why
    // the rest never leaves the server.
    const users = await Promise.all(
      verified.map((profile) => ctx.db.get(profile.userId))
    );
    const resolvedPhotos = await Promise.all(
      verified.map((profile, index) =>
        resolvePhotoUrl(profile.photoUrl, users[index]?.profilePictureUrl)
      )
    );

    return verified.map((profile, index) => ({
      // Projected, not the whole document. The full `memberProfiles` row
      // carries phone, dateOfBirth, address, nextOfKin (name + phone),
      // shortBio, occupation, employer, skills and the mentorship proof URL;
      // the full `users` row carries authId, email, role and status. None of
      // that is rendered by any consumer, and shipping it meant every
      // Administration-authority browser received the contact details and
      // home address of every verified member on page load. Treat this list
      // as a projection first and a payload reduction second — widening it
      // is a disclosure decision, not a convenience.
      profile: {
        _id: profile._id,
        userId: profile.userId,
        firstName: profile.firstName,
        middleName: profile.middleName,
        lastName: profile.lastName,
        sex: profile.sex,
        maritalStatus: profile.maritalStatus,
        clanId: profile.clanId,
        verifiedAt: profile.verifiedAt,
      },
      // One already-resolved photo, flattened off the two rows so neither is
      // returned whole (spec 0014, AC-14). The profile's own upload wins and
      // the account picture is the fallback; the signing happens here because
      // the signed URL expires and so cannot be stored. This replaced a raw
      // `users.profilePictureUrl`, which meant an uploaded profile photo never
      // showed on this list at all.
      photoUrl: resolvedPhotos[index] ?? null,
      activeRoles: (rolesByUser.get(profile.userId) ?? []).map(
        (assignment) => ({
          _id: assignment._id,
          roleType: assignment.roleType,
          clanId: assignment.clanId,
          departmentId: assignment.departmentId,
        })
      ),
      departmentMemberships: (
        membershipsByUser.get(profile.userId) ?? []
      ).map((membership) => ({
        _id: membership._id,
        departmentId: membership.departmentId,
        positionTitle: membership.positionTitle,
      })),
    }));
  },
});

// ── Dashboard analytics ──────────────────────────────────────────────────────
// Powers the /admin dashboard's chart tabs (Membership Trends, Members
// Overview, Discipleship Progress, Explore). Same "narrow projection, not
// whole documents" discipline as `listVerifiedMembersWithRoles` above — see
// that query's comment for why contact details, address, etc. never leave
// the server here either.

const LEADERSHIP_LEVEL_ORDER = ["level_1", "level_2", "advanced"] as const;

export type LeadershipStage =
  | "not_enrolled"
  | "level_1"
  | "level_2"
  | "advanced"
  | "completed";

/**
 * Collapses a member's per-level `leadershipProgress` rows into one ordinal
 * stage. "Completed" means the whole pipeline is done — the `advanced` row's
 * status is `completed` — not just any one level; finishing level_1 alone
 * shows as "level_1" (in progress there), same as being merely enrolled.
 * Sequential enrollment isn't enforced at the data layer (see schema.ts), so
 * this reads the highest level touched regardless of order.
 */
function deriveLeadershipStage(
  rows: Doc<"leadershipProgress">[]
): LeadershipStage {
  if (rows.length === 0) return "not_enrolled";
  const byLevel = new Map(rows.map((row) => [row.level, row.status]));
  if (byLevel.get("advanced") === "completed") return "completed";
  for (let i = LEADERSHIP_LEVEL_ORDER.length - 1; i >= 0; i--) {
    const level = LEADERSHIP_LEVEL_ORDER[i];
    if (byLevel.has(level)) return level;
  }
  return "not_enrolled";
}

/**
 * Shared joins behind both `listProfilesForAnalytics` and `listProfileRoster`
 * — one collect-and-group pass each over `leadershipProgress` and active
 * `departmentMemberships`, keyed by userId. Kept as one helper so the two
 * queries' derived fields (`leadershipStage`, `departmentIds`) can never fork.
 */
async function buildAnalyticsJoins(ctx: QueryCtx) {
  const leadershipRows = await ctx.db.query("leadershipProgress").collect();
  const leadershipByUser = new Map<Id<"users">, Doc<"leadershipProgress">[]>();
  for (const row of leadershipRows) {
    const held = leadershipByUser.get(row.userId) ?? [];
    held.push(row);
    leadershipByUser.set(row.userId, held);
  }

  const activeMemberships = (
    await ctx.db.query("departmentMemberships").collect()
  ).filter((membership) => membership.status === "active");
  const departmentIdsByUser = new Map<Id<"users">, Id<"departments">[]>();
  for (const membership of activeMemberships) {
    const held = departmentIdsByUser.get(membership.userId) ?? [];
    held.push(membership.departmentId);
    departmentIdsByUser.set(membership.userId, held);
  }

  return { leadershipByUser, departmentIdsByUser };
}

/**
 * One row per submitted profile — pending AND verified, unlike
 * `listVerifiedMembersWithRoles` — carrying exactly the fields the dashboard
 * needs to bucket and filter by: sex, marital status, date of birth, clan,
 * mentorship status, a derived leadership stage, and the department(s)
 * self-selected at submission. Deliberately excludes name, contact details,
 * address and every other identifying field; the dashboard only ever counts
 * and charts, it never lists people by this query — see `listProfileRoster`
 * below for the named counterpart that powers the roster table.
 */
export const listProfilesForAnalytics = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    const profiles = await ctx.db.query("memberProfiles").collect();
    const { leadershipByUser, departmentIdsByUser } =
      await buildAnalyticsJoins(ctx);

    return profiles.map((profile) => ({
      _id: profile._id,
      profileStatus: profile.profileStatus,
      _creationTime: profile._creationTime,
      verifiedAt: profile.verifiedAt,
      sex: profile.sex,
      maritalStatus: profile.maritalStatus,
      dateOfBirth: profile.dateOfBirth,
      clanId: profile.clanId,
      mentorshipStatus: profile.mentorshipStatus,
      leadershipStage: deriveLeadershipStage(
        leadershipByUser.get(profile.userId) ?? []
      ),
      departmentIds: departmentIdsByUser.get(profile.userId) ?? [],
    }));
  },
});

/**
 * Same population and derived fields as `listProfilesForAnalytics` (pending
 * AND verified, same leadershipStage/departmentIds joins), but additionally
 * carries first/middle/last name — for the dashboard's roster table (Zone 4),
 * which needs to list people, not just count them.
 *
 * NOT a new trust boundary: `listVerifiedMembersWithRoles` and
 * `listPendingVerifications` already expose full names to this same
 * Administration-authority gate elsewhere in the portal. Kept as its own
 * query — rather than widening `listProfilesForAnalytics` — so that query's
 * "never lists people" doc comment and narrow projection stay true for its
 * other (chart/KPI) callers.
 */
export const listProfileRoster = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    const profiles = await ctx.db.query("memberProfiles").collect();
    const { leadershipByUser, departmentIdsByUser } =
      await buildAnalyticsJoins(ctx);

    return profiles.map((profile) => ({
      _id: profile._id,
      firstName: profile.firstName,
      middleName: profile.middleName,
      lastName: profile.lastName,
      profileStatus: profile.profileStatus,
      _creationTime: profile._creationTime,
      verifiedAt: profile.verifiedAt,
      sex: profile.sex,
      maritalStatus: profile.maritalStatus,
      dateOfBirth: profile.dateOfBirth,
      clanId: profile.clanId,
      mentorshipStatus: profile.mentorshipStatus,
      leadershipStage: deriveLeadershipStage(
        leadershipByUser.get(profile.userId) ?? []
      ),
      departmentIds: departmentIdsByUser.get(profile.userId) ?? [],
    }));
  },
});

