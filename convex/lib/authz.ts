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
 * Like {@link requireSystemAdmin}, but resolves null when the caller is
 * unauthenticated instead of throwing. For queries subscribed by reactive
 * clients: on sign-out the token drops while subscriptions are still live,
 * so the server re-runs them unauthenticated — they must deliver a value
 * (null), not an error the client surfaces as a crash. An authenticated
 * caller *without* the role still throws: that's a real authorization
 * violation, not a teardown race.
 */
export async function getSystemAdminOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
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

/**
 * Require that the caller holds an active `system_admin` role assignment.
 * Returns the caller's `users` row. For mutations and one-shot server reads;
 * reactive queries should prefer {@link getSystemAdminOrNull}.
 */
export async function requireSystemAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getSystemAdminOrNull(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

// Role types that confer content-management rights (DATA_MODEL.md, Increment 3
// — Access Control). `church_admin` is anticipated but not yet a member of the
// `roleAssignments.roleType` union; the cast below tolerates that until it lands
// as a one-line union extension.
const CONTENT_MANAGER_ROLES = ["system_admin", "church_admin"] as const;

/** True when `userId` holds an active content-manager role assignment. */
async function hasActiveContentRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const active = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .collect();
  return active.some((row) =>
    (CONTENT_MANAGER_ROLES as readonly string[]).includes(row.roleType)
  );
}

/**
 * Content-management gate (DATA_MODEL.md, Increment 3 — Access Control).
 *
 * Checks the caller for an active `roleAssignments` row with `roleType` in
 * {@link CONTENT_MANAGER_ROLES}, via the `by_userId_status` index. A role row is
 * just data — grantable/revocable directly in the Convex dashboard with no
 * redeploy — which is why this replaced the earlier `CONTENT_ADMIN_AUTH_IDS`
 * env-var allowlist (PR7a). Revoking a row removes access on the very next
 * request; there is no caching.
 *
 * Throws when the caller is unauthenticated or lacks the role. Returns the
 * caller's `users` row (for audit-log attribution) on success. Called by every
 * content create/update/publish/archive mutation.
 */
export async function canManageContent(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  if (!(await hasActiveContentRole(ctx, user._id))) {
    throw new Error("Not authorized to manage content");
  }
  return user;
}

/**
 * Non-throwing capability check: `true` when the caller may manage content.
 * For gating admin UI without surfacing an authorization error — the write
 * mutations still enforce {@link canManageContent} server-side regardless.
 */
export async function isContentManager(
  ctx: QueryCtx | MutationCtx
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return user ? await hasActiveContentRole(ctx, user._id) : false;
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
