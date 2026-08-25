import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_ACTIVE_DEPARTMENTS } from "@klt-cyber/shared";
import {
  canManageChurchAdmin,
  getAdministrationAuthorityOrNull,
  logActivity,
  requireUser,
} from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";

// The mobile 7-step profile-submission wizard and its Church Admin
// verification workflow. See docs/DATA_MODEL.md, Increment 4. Supersedes
// Increment 2's self-service `completeProfile`/`updateProfile` — creating a
// `memberProfiles` row here does not by itself promote the caller; only
// `verifyProfile` does that, once Church Admin has reviewed the submission.

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
// space" convention on that table in convex/schema.ts).
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
    // Areas of Service claimed at submission — self-added directly into
    // `departmentMemberships` by `submitProfile`, not a field on this table
    // (see that mutation). Included here so every admin verification read
    // gets it for free, same as children/leadershipProgress.
    ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", profile.userId).eq("status", "active")
      )
      .collect(),
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

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Visitor → pending-member submission. Creates the caller's `memberProfiles`
 * row, plus any `children` / `leadershipProgress` / `departmentMemberships`
 * rows, in one mutation. Does NOT promote the caller — that happens only
 * once Church Admin verifies via `verifyProfile`. Hard-gated server-side
 * only on not already having a profile (no resubmission path) — mentorship
 * status is self-reported and no longer required to be "completed".
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
      // Self-service roster join — intentionally NOT `addDepartmentMember`,
      // which requires department authority and an already-verified
      // profile. Neither holds here: the caller is the member themself,
      // submitting for the first time.
      for (const departmentId of uniqueDepartmentIds) {
        const membershipId = await ctx.db.insert("departmentMemberships", {
          userId: user._id,
          departmentId,
          addedBy: user._id,
          status: "active",
        });
        await logActivity(ctx, {
          actorUserId: user._id,
          action: "department.member_added",
          targetType: "departmentMemberships",
          targetId: membershipId,
          metadata: { userId: user._id, departmentId, selfService: true },
        });
      }
    }

    return { profileId };
  },
});

/**
 * Church Admin verification. Optionally applies corrections first, then marks
 * the profile verified and flips the linked user from visitor to member.
 * Never touches `roleAssignments` — verification and admin authority stay
 * fully independent.
 */
export const verifyProfile = mutation({
  args: {
    profileId: v.id("memberProfiles"),
    edits: v.optional(profileEditsPatchValidator),
  },
  handler: async (ctx, { profileId, edits }) => {
    const actor = await canManageChurchAdmin(ctx);

    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");

    if (edits) {
      await ctx.db.patch(profileId, { ...edits, updatedAt: Date.now() });
    }

    const now = Date.now();
    await ctx.db.patch(profileId, {
      profileStatus: "verified",
      verifiedBy: actor._id,
      verifiedAt: now,
      updatedAt: now,
    });

    // profileCompleted mirrors the same "has a recognised church identity"
    // moment `role` transitions on — see docs/DATA_MODEL.md Increment 1.
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

    return { ok: true as const };
  },
});

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * All profiles awaiting verification, joined with their children and
 * leadership-progress rows so a review screen has everything in one call.
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
    return await Promise.all(
      pending.map((profile) => withChildrenAndLeadership(ctx, profile))
    );
  },
});

/** A single profile for review, with the same children/leadership join. */
export const getProfileForReview = query({
  args: { profileId: v.id("memberProfiles") },
  handler: async (ctx, { profileId }) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const profile = await ctx.db.get(profileId);
    if (!profile) return null;
    return await withChildrenAndLeadership(ctx, profile);
  },
});

/**
 * Verified members joined with their active role assignments AND their active
 * department roster memberships. Returns a list of assignments/memberships
 * per member (not a single value each) — a member may hold more than one role
 * simultaneously (e.g. Church Admin and Clan Elder at once), and may serve on
 * up to 3 department rosters (see MAX_ACTIVE_DEPARTMENTS in
 * departmentMemberships.ts) without holding any leadership role at all.
 * `activeRoles` (system_admin/clan_elder/hod/department_admin) and
 * `departmentMemberships` (plain roster membership) are deliberately separate
 * fields — see the "two orthogonal permission dimensions" note in
 * docs/ROLES.md — callers that want a single "Area(s) of Service" view should
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

    const results = [];
    for (const profile of verified) {
      const user = await ctx.db.get(profile.userId);
      results.push({
        profile,
        user,
        activeRoles: rolesByUser.get(profile.userId) ?? [],
        departmentMemberships: membershipsByUser.get(profile.userId) ?? [],
      });
    }
    return results;
  },
});
