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

/** True when `userId` holds an active `system_admin` role assignment. */
export async function isActiveSystemAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const admin = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .filter((q) => q.eq(q.field("roleType"), "system_admin"))
    .first();
  return admin !== null;
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
  if (!(await isActiveSystemAdmin(ctx, user._id))) {
    throw new Error("Requires an active system_admin role");
  }
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

// ── Department-scoped authority (docs/Alignment.md, Increment 5) ────────────
// Replaces the free-floating `church_admin` role: `hod` and `department_admin`
// are now scoped to a specific `departmentId`. "Administration" is the
// department whose HOD/department_admin inherit the old church_admin's
// portal-wide content/verification/facility authority.

/** The `_id` of the fixed "Administration" department, or null if unseeded. */
export async function getAdministrationDepartmentId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"departments"> | null> {
  const dept = await ctx.db
    .query("departments")
    .withIndex("by_name", (q) => q.eq("name", "Administration"))
    .first();
  return dept?._id ?? null;
}

/**
 * True when `userId` holds an active `roleAssignments` row scoped to
 * `departmentId` whose `roleType` is in `roleTypes`. `departmentId: null`
 * (e.g. Administration not yet seeded) always resolves false.
 */
export async function hasActiveDepartmentRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  departmentId: Id<"departments"> | null,
  roleTypes: readonly string[]
): Promise<boolean> {
  if (!departmentId) return false;
  const rows = await ctx.db
    .query("roleAssignments")
    .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
    .filter((q) =>
      q.and(q.eq(q.field("userId"), userId), q.eq(q.field("status"), "active"))
    )
    .collect();
  return rows.some((row) => roleTypes.includes(row.roleType));
}

/**
 * System Admin, or that department's active `hod`/`department_admin`.
 * Used to gate roster additions ({@link requireDepartmentHod} is the
 * narrower, hod-only gate for removals).
 */
export async function requireDepartmentAuthority(
  ctx: QueryCtx | MutationCtx,
  departmentId: Id<"departments">
): Promise<Doc<"users">> {
  const actor = await requireUser(ctx);
  if (await isActiveSystemAdmin(ctx, actor._id)) return actor;
  if (
    await hasActiveDepartmentRole(ctx, actor._id, departmentId, [
      "hod",
      "department_admin",
    ])
  ) {
    return actor;
  }
  throw new Error(
    "Only System Admin, this department's HOD, or its department admin is authorized"
  );
}

/**
 * Narrower than {@link requireDepartmentAuthority} — hod (or system_admin)
 * only, not department_admin. Used wherever the action is reserved for the
 * department head: removing a roster member, appointing department_admin
 * delegates.
 */
export async function requireDepartmentHod(
  ctx: MutationCtx,
  departmentId: Id<"departments">
): Promise<Doc<"users">> {
  const actor = await requireUser(ctx);
  if (await isActiveSystemAdmin(ctx, actor._id)) return actor;
  if (await hasActiveDepartmentRole(ctx, actor._id, departmentId, ["hod"])) {
    return actor;
  }
  throw new Error("Only System Admin or this department's HOD is authorized");
}

/**
 * System Admin, or the Administration department's active `hod` /
 * `department_admin`. This is the portal-wide authority gate: content,
 * member verification, and facilities — everything the old free-floating
 * `church_admin` role used to cover — now flows through Administration
 * department membership instead. Kept available under its original name,
 * {@link canManageChurchAdmin} below, so existing call sites across content/
 * events/announcements/themes/weeklyPrograms/facilities/memberProfiles/
 * uploads don't need touching.
 */
export async function requireAdministrationAuthority(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return await assertAdministrationAuthority(ctx, user);
}

/**
 * The authority check for an **already-resolved** caller. Split out of
 * {@link requireAdministrationAuthority} so callers that have had to resolve
 * the user themselves don't pay for it twice: `getCurrentUser` is three
 * document reads plus two cross-component subqueries into the Better Auth
 * component (session lookup, then auth-user lookup), and this gate fronts
 * eight of the portal's highest-traffic queries. Same checks, same order,
 * same error message as before — only the redundant re-resolution is gone.
 */
async function assertAdministrationAuthority(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<Doc<"users">> {
  if (await isActiveSystemAdmin(ctx, user._id)) return user;
  const adminDeptId = await getAdministrationDepartmentId(ctx);
  if (
    adminDeptId &&
    (await hasActiveDepartmentRole(ctx, user._id, adminDeptId, [
      "hod",
      "department_admin",
    ]))
  ) {
    return user;
  }
  throw new Error(
    "Not authorized to manage Administration-department resources"
  );
}

/**
 * Like {@link requireAdministrationAuthority}, but resolves null when the
 * caller is unauthenticated instead of throwing — the same contract, and for
 * the same reason, as {@link getSystemAdminOrNull}: on sign-out the token
 * drops while reactive subscriptions are still live, so the server re-runs
 * them unauthenticated. Those re-runs must deliver a value (null), not an
 * error that surfaces in the Convex log and the client console.
 *
 * An authenticated caller *without* the authority still throws — that's a
 * real authorization violation, not a teardown race.
 *
 * Use this in every `query` a client subscribes to. Mutations and one-shot
 * server reads should keep using {@link canManageChurchAdmin}.
 */
export async function getAdministrationAuthorityOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  // Reuse the user we just resolved rather than calling
  // requireAdministrationAuthority, which would resolve it a second time.
  return await assertAdministrationAuthority(ctx, user);
}

/**
 * Church Admin gate (docs/DATA_MODEL.md, Increment 4 — Access Control;
 * re-pointed at Administration-department authority in Increment 5, see
 * docs/Alignment.md). A role row is just data — grantable/revocable directly
 * via `roles.assignRole`/`revokeRole`, no redeploy. Revoking access removes
 * it on the very next request; there is no caching.
 *
 * Throws when the caller is unauthenticated or lacks the authority. Returns
 * the caller's `users` row (for audit-log attribution) on success. Called by
 * every content, member-verification, and facility mutation.
 */
export async function canManageChurchAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return await requireAdministrationAuthority(ctx);
}

/**
 * @deprecated Increment 3's name for {@link canManageChurchAdmin}, kept as an
 * alias so existing content-mutation call sites (themes, events, programs,
 * announcements) don't need touching. Same check, same authority.
 */
export const canManageContent = canManageChurchAdmin;

/**
 * Non-throwing capability check: `true` when the caller may manage
 * Administration-department resources (content, verification, facilities).
 * For gating admin UI without surfacing an authorization error — the write
 * mutations still enforce {@link canManageChurchAdmin} server-side regardless.
 */
export async function isContentManager(
  ctx: QueryCtx | MutationCtx
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  if (await isActiveSystemAdmin(ctx, user._id)) return true;
  const adminDeptId = await getAdministrationDepartmentId(ctx);
  return adminDeptId
    ? await hasActiveDepartmentRole(ctx, user._id, adminDeptId, [
        "hod",
        "department_admin",
      ])
    : false;
}

/**
 * Every user currently holding Administration authority — active
 * `system_admin`, plus the Administration department's active `hod`/
 * `department_admin` — i.e. the concrete recipient set behind
 * {@link canManageChurchAdmin}.
 *
 * Exists for notification dispatch (convex/memberProfiles.ts's
 * `submitProfile`): the notification audience model's "role" variant
 * (convex/notifications.ts) is a bare `roleType` with no department scoping,
 * so `{ type: "role", roleType: "hod" }` would reach every department's HOD,
 * not just Administration's — the wrong, much noisier audience. Resolving
 * the actual user set here and dispatching to `{ type: "users", userIds }`
 * is the precise equivalent.
 */
export async function getAdministrationAuthorityUserIds(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">[]> {
  const systemAdmins = await ctx.db
    .query("roleAssignments")
    .withIndex("by_roleType", (q) => q.eq("roleType", "system_admin"))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();

  const adminDeptId = await getAdministrationDepartmentId(ctx);
  const deptAuthority = adminDeptId
    ? await ctx.db
        .query("roleAssignments")
        .withIndex("by_departmentId", (q) => q.eq("departmentId", adminDeptId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect()
    : [];

  const ids = [
    ...systemAdmins.map((r) => r.userId),
    ...deptAuthority
      .filter((r) => r.roleType === "hod" || r.roleType === "department_admin")
      .map((r) => r.userId),
  ];
  return [...new Set(ids)];
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
