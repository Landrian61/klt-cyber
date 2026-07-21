import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { canManageChurchAdmin, logActivity, requireUser } from "./lib/authz";

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
const leadershipLevelValidator = v.union(
  v.literal("level_1"),
  v.literal("level_2"),
  v.literal("advanced")
);
const leadershipStatusValidator = v.union(
  v.literal("in_progress"),
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
  spouseUserId: v.optional(v.id("users")),
  spouseNameUnlinked: v.optional(v.string()),
  anniversaryDate: v.optional(v.number()),
  nextOfKin: v.optional(nextOfKinValidator),
  mentorshipStatus: mentorshipStatusValidator,
  mentorshipProofUrl: v.optional(v.string()),
  departmentId: v.optional(v.id("departments")),
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
  spouseUserId: v.optional(v.id("users")),
  spouseNameUnlinked: v.optional(v.string()),
  anniversaryDate: v.optional(v.number()),
  nextOfKin: v.optional(nextOfKinValidator),
  mentorshipStatus: v.optional(mentorshipStatusValidator),
  mentorshipProofUrl: v.optional(v.string()),
  departmentId: v.optional(v.id("departments")),
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
  const [children, leadershipProgress] = await Promise.all([
    ctx.db
      .query("children")
      .withIndex("by_parentUserId", (q) => q.eq("parentUserId", profile.userId))
      .collect(),
    ctx.db
      .query("leadershipProgress")
      .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
      .collect(),
  ]);
  return { ...profile, children, leadershipProgress };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Visitor → pending-member submission. Creates the caller's `memberProfiles`
 * row, plus any `children` / `leadershipProgress` rows, in one mutation. Does
 * NOT promote the caller — that happens only once Church Admin verifies via
 * `verifyProfile`. Hard-gated server-side on mentorship completion and on not
 * already having a profile (no resubmission path).
 */
export const submitProfile = mutation({
  args: {
    ...profileEditableFields,
    children: v.optional(v.array(childEntryValidator)),
    leadershipEntries: v.optional(v.array(leadershipEntryValidator)),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (args.mentorshipStatus !== "completed") {
      throw new Error(
        "Mentorship must be completed before a profile can be submitted"
      );
    }

    const existing = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) throw new Error("Profile already submitted");

    const { children, leadershipEntries, ...profileFields } = args;
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
    await canManageChurchAdmin(ctx);
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
    await canManageChurchAdmin(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile) return null;
    return await withChildrenAndLeadership(ctx, profile);
  },
});

/**
 * Verified members joined with their active role assignments. Returns a list
 * of assignments per member (not a single role) — a member may hold more than
 * one role simultaneously (e.g. Church Admin and Clan Elder at once).
 */
export const listVerifiedMembersWithRoles = query({
  args: {},
  handler: async (ctx) => {
    await canManageChurchAdmin(ctx);

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

    const results = [];
    for (const profile of verified) {
      const user = await ctx.db.get(profile.userId);
      results.push({
        profile,
        user,
        activeRoles: rolesByUser.get(profile.userId) ?? [],
      });
    }
    return results;
  },
});
