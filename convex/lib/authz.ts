import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ROSTER_PORTAL_DEPARTMENTS } from "@klt-cyber/shared";
import { authComponent } from "../auth";

// Shared authorization & audit helpers for the domain functions. Kept out of the
// public API surface (no query/mutation wrappers here) — these are plain helpers.

/**
 * Resolve the calling user's app `users` row from the Better Auth identity, or
 * null when unauthenticated / not yet provisioned.
 *
 * A deleted row resolves to null (spec 0008 AC-19). Deletion anonymizes the
 * `users` row and then destroys the Better Auth identity, and those are two
 * steps: if the second fails, a usable credential can outlive the data it
 * pointed at. The guard lives here, in the one resolver every caller goes
 * through, rather than in each caller, so there is no path that forgets it.
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authUser._id))
    .unique();
  if (user?.deletedAt !== undefined) return null;
  return user;
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

// ── Department-scoped authority ──────────────────────────────────────────
// `hod` and `department_admin`
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

// ── Department shell capabilities (spec 0012) ───────────────────────────────
// SRS 4.7.2 as one table. It is written here exactly once: `departmentShell
// .getShellContext` returns it to the portal so navigation and buttons render
// from it, and `requireDepartmentCapability` below enforces the same table in
// every shell mutation. Copying the matrix per page is how a delegate ends up
// with HOD powers in one department.

/** Who the caller is *for one department*, as far as the shell is concerned. */
export type DepartmentShellRole = "hod" | "delegate" | "system_admin";

/**
 * Every gated action in the shell.
 *
 * Deliberately finer-grained than the roles: `deleteOwnMessage` and
 * `deleteAnyMessage` are separate because a delegate may delete only what they
 * sent, which no single "can delete messages" flag can express.
 */
export const DEPARTMENT_CAPABILITIES = [
  "viewRoster",
  "viewPendingClaimants",
  "viewFullProfiles",
  "addMember",
  "createActivity",
  "editActivity",
  "cancelActivity",
  "sendMessage",
  "viewMessages",
  "deleteOwnMessage",
  "deleteAnyMessage",
  "confirmClaim",
  "declineClaim",
  "setPosition",
  "removeMember",
  "manageDelegates",
  "editDescription",
  "sendHodNotice",
] as const;

export type DepartmentCapability = (typeof DEPARTMENT_CAPABILITIES)[number];

export type DepartmentCapabilities = Record<DepartmentCapability, boolean>;

/**
 * The capabilities a delegate (`department_admin`) does NOT hold.
 *
 * Stated as the exclusion rather than two full lists, because the interesting
 * fact about the matrix is precisely this line: a delegate runs the department's
 * day to day work (activities, messages, adding members) but makes none of the
 * decisions about who serves in it or what it says about itself (AC-18).
 */
const HOD_ONLY_CAPABILITIES = [
  "deleteAnyMessage",
  "confirmClaim",
  "declineClaim",
  "setPosition",
  "removeMember",
  "manageDelegates",
  "editDescription",
  "sendHodNotice",
] as const satisfies readonly DepartmentCapability[];

/** The `can` object for one role. System Admin holds everything. */
export function departmentCapabilities(
  role: DepartmentShellRole
): DepartmentCapabilities {
  const hodOnly: readonly string[] = HOD_ONLY_CAPABILITIES;
  const full = role === "hod" || role === "system_admin";
  return Object.fromEntries(
    DEPARTMENT_CAPABILITIES.map((capability) => [
      capability,
      full || !hodOnly.includes(capability),
    ])
  ) as DepartmentCapabilities;
}

/**
 * The caller's shell role for one department, or null when they have none.
 *
 * Null — not an error — for a plain roster member: SRS 4.9.2 gives a roster
 * member "No" on roster, claims, positions and delegates, so they get no shell
 * pages even though `hasPortalAccess` admits them to the portal for their
 * department's own bespoke pages (Media's Devotionals, Past events). Null too
 * for Administration authority, which keeps the active-roster read it already
 * had and gains nothing inside another department's shell.
 */
export async function resolveDepartmentShellRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  departmentId: Id<"departments">
): Promise<DepartmentShellRole | null> {
  if (await isActiveSystemAdmin(ctx, userId)) return "system_admin";
  if (await hasActiveDepartmentRole(ctx, userId, departmentId, ["hod"])) {
    return "hod";
  }
  if (
    await hasActiveDepartmentRole(ctx, userId, departmentId, [
      "department_admin",
    ])
  ) {
    return "delegate";
  }
  return null;
}

/**
 * The server side half of the matrix: assert the caller may do one named thing
 * in one named department, and hand back who they turned out to be.
 *
 * Every shell mutation calls this. The portal's navigation and buttons are user
 * experience only; this is the boundary, so forcing a request a hidden button
 * would have made fails here (AC-5, AC-18).
 *
 * Throws rather than resolving null, because a mutation reaching this point is a
 * real violation and not the reactive teardown that queries have to survive.
 */
export async function requireDepartmentCapability(
  ctx: QueryCtx | MutationCtx,
  departmentId: Id<"departments">,
  capability: DepartmentCapability
): Promise<{ actor: Doc<"users">; role: DepartmentShellRole }> {
  const actor = await requireUser(ctx);
  const role = await resolveDepartmentShellRole(ctx, actor._id, departmentId);
  if (!role || !departmentCapabilities(role)[capability]) {
    throw new Error(
      "Not authorized to do that in this department. Only this department's " +
        "HOD or a System Admin may, and some actions are the HOD's alone."
    );
  }
  return { actor, role };
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
 * Church Admin gate, pointed at Administration-department authority.
 * A role row is just data — grantable/revocable directly
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

// ── Media-department authority (spec 0005) ──────────────────────────────────
// Mirrors the Administration pattern above: system_admin, or the Media
// department's active hod/department_admin. Used by devotionals and past
// events mutations and queries.

/** The `_id` of the fixed "Media" department, or null if unseeded. */
export async function getMediaDepartmentId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"departments"> | null> {
  const dept = await ctx.db
    .query("departments")
    .withIndex("by_name", (q) => q.eq("name", "Media"))
    .first();
  return dept?._id ?? null;
}

async function assertMediaAuthority(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<Doc<"users">> {
  if (await isActiveSystemAdmin(ctx, user._id)) return user;
  const mediaDeptId = await getMediaDepartmentId(ctx);
  if (
    mediaDeptId &&
    (await hasActiveDepartmentRole(ctx, user._id, mediaDeptId, [
      "hod",
      "department_admin",
    ]))
  ) {
    return user;
  }
  throw new Error("Not authorized to manage Media-department resources");
}

/**
 * System Admin, or the Media department's active hod/department_admin.
 * Throws when unauthenticated or unauthorized. For mutations and one-shot
 * server reads; reactive queries should prefer {@link getMediaAuthorityOrNull}.
 */
export async function requireMediaAuthority(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return await assertMediaAuthority(ctx, user);
}

/**
 * Like {@link requireMediaAuthority}, but resolves null when unauthenticated
 * instead of throwing — same reactive-null contract as
 * {@link getAdministrationAuthorityOrNull}. An authenticated caller without
 * the authority still throws.
 */
export async function getMediaAuthorityOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  return await assertMediaAuthority(ctx, user);
}

// ── Portal access (spec 0006) ─────────────────────────────────────────────
// The portal gate: a user can enter the web admin portal when they hold at
// least one active roleAssignment, OR when they are on the active roster of
// Media, Hospitality, or Library & Information with a verified member
// profile. The verified profile check prevents unverified visitors who
// self inserted roster memberships during submitProfile from gaining portal
// access.

export async function hasPortalAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const roles = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .first();
  if (roles) return true;

  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile || profile.profileStatus !== "verified") return false;

  const memberships = await ctx.db
    .query("departmentMemberships")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .collect();
  for (const m of memberships) {
    const dept = await ctx.db.get(m.departmentId);
    if (
      dept &&
      (ROSTER_PORTAL_DEPARTMENTS as readonly string[]).includes(dept.name)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Append an audit entry. The single write-point for `activityLogs`.
 *
 * `departmentId` is a real column rather than a `metadata` key (spec 0012
 * AC-37): `metadata` is `v.any()` and Convex cannot index inside an `any`, so
 * a department's dashboard feed would have had to scan all church activity.
 * Every department-scoped mutation passes it; entries written before spec 0012
 * carry their department only inside `metadata`, which is why the feed starts
 * from that change forward.
 */
export async function logActivity(
  ctx: MutationCtx,
  entry: {
    actorUserId: Id<"users">;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: unknown;
    departmentId?: Id<"departments">;
  }
): Promise<void> {
  await ctx.db.insert("activityLogs", entry);
}
