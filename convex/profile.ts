import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getActiveRoles, getCurrentUser, requireUser } from "./lib/authz";

// Read-only "who am I" queries. Profile *submission* and *verification* are
// handled by `submitProfile` / `verifyProfile` in convex/memberProfiles.ts —
// see docs/DATA_MODEL.md, Increment 4. This file no longer owns a self-service
// completion mutation: creating a `memberProfiles` row is gated on mentorship
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
  return { user, profile: profile ?? null, activeRoles };
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
