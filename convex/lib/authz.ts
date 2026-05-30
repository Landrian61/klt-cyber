import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { authComponent } from "../auth";

// Shared authorization & audit helpers for the domain functions. Kept out of the
// public API surface (no query/mutation wrappers here) — these are plain helpers.

/**
 * Resolve the calling user's app `users` row from the Better Auth identity, or
 * null when unauthenticated / not yet provisioned.
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authUser._id))
    .unique();
}

/** Like {@link getCurrentUser} but throws when there is no authenticated user. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** The caller's active role assignments. */
export async function getActiveRoles(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Doc<"roleAssignments">[]> {
  return await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
}

/**
 * Require that the caller holds an active `system_admin` role assignment.
 * Returns the caller's `users` row.
 */
export async function requireSystemAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  const admin = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .filter((q) =>
      q.and(
        q.eq(q.field("roleType"), "system_admin"),
        q.eq(q.field("status"), "active")
      )
    )
    .first();
  if (!admin) throw new Error("Requires an active system_admin role");
  return user;
}

/** Append an audit entry. The single write-point for `activityLogs`. */
export async function logActivity(
  ctx: MutationCtx,
  entry: {
    actorUserId: Id<"users">;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: unknown;
  }
): Promise<void> {
  await ctx.db.insert("activityLogs", entry);
}
