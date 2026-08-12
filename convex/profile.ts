import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  getActiveRoles,
  getAdministrationDepartmentId,
  getCurrentUser,
  requireUser,
} from "./lib/authz";

// Read-only "who am I" queries, plus `updateMyProfile` below for self-service
// edits to an *already-verified* profile's contact/bio fields. Profile
// *submission* and *verification* are handled by `submitProfile` /
// `verifyProfile` in convex/memberProfiles.ts — see docs/DATA_MODEL.md,
// Increment 4. Creating a `memberProfiles` row is gated on mentorship
// completion and does not by itself promote the caller to member (that only
// happens once Church Admin verifies the submission).

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

  return {
    user,
    profile: profile ?? null,
    activeRoles,
    hasAdministrationAccess,
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
  const [children, leadershipProgress] = await Promise.all([
    ctx.db
      .query("children")
      .withIndex("by_parentUserId", (q) => q.eq("parentUserId", user._id))
      .collect(),
    ctx.db
      .query("leadershipProgress")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect(),
  ]);
  return { ...profile, children, leadershipProgress };
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
 * Drives the mobile profile-completion flow (docs/Profile-completion-mobile.md):
 * the caller's own `memberProfiles` row if one exists, else null. The client
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

/**
 * Self-service edit of the caller's own contact/bio fields, used by the
 * admin Settings page. `firstName`/`lastName` are required on the
 * `memberProfiles` row, so undefined values are dropped rather than patched
 * in blank.
 */
export const updateMyProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    middleName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    shortBio: v.optional(v.string()),
    occupation: v.optional(v.string()),
    industry: v.optional(v.string()),
    employer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("No profile to update");

    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(profile._id, { ...patch, updatedAt: Date.now() });
  },
});
