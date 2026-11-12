import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  LIBRARY_DEPARTMENT_NAME,
  MEDIA_DEPARTMENT_NAME,
  PASTORAL_DEPARTMENT_NAME,
  REAL_ESTATE_DEPARTMENT_NAME,
  ROSTER_PORTAL_DEPARTMENTS,
} from "@klt-cyber/shared";
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

/**
 * Who the caller is *for one department*, as far as the shell is concerned.
 *
 * `roster` is the fourth value, added by spec 0015. It is NOT a general
 * "member of this department" role: it resolves only inside a
 * `ROSTER_PORTAL_DEPARTMENTS` department, and it holds no shell capability at
 * all — only a department-scoped one its own department grants (today, just
 * Library's `manageLibrary`). SRS 4.9.2's "No" on roster, claims, positions
 * and delegates is therefore still intact for a roster member, while SRS
 * 4.13.2's "every Library roster member has full operational access" is
 * satisfied in the one place the portal already computes authority.
 */
export type DepartmentShellRole =
  | "hod"
  | "delegate"
  | "system_admin"
  | "roster";

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
  // Spec 0015. The first DEPARTMENT-SCOPED capability: it is granted only
  // inside `Library & Information`, and there to every shell role alike —
  // including `roster`, which holds this and nothing else. See
  // DEPARTMENT_SCOPED_CAPABILITIES below.
  "manageLibrary",
  // Spec 0018. The second scoped capability, and the one that proves the first
  // was a pattern rather than a Library special case. Granted only inside
  // `Real Estate`, and there to the HOD, a delegate and a System Admin.
  //
  // It reaches no roster member, but NOT by a rule of its own: Real Estate is
  // deliberately absent from ROSTER_PORTAL_DEPARTMENTS, so
  // `resolveDepartmentShellRole` returns null for a Real Estate roster member
  // and the scoped branch below is never even reached for them. That is how
  // SRS 4.14.1's "roster members have no portal access" holds here without a
  // second exception living in this file.
  "manageRealEstate",
  // Spec 0019. The third scoped capability, and the first on a bespoke portal
  // rather than the shared shell. Granted only inside `Media`, and there to
  // every shell role alike: the HOD, a delegate, a System Admin and a
  // VERIFIED roster member. The roster reaches it because Media is in
  // ROSTER_PORTAL_DEPARTMENTS and `resolveDepartmentShellRole` already
  // requires a verified member profile for the `roster` role, so an
  // unverified roster member is refused there rather than by a second rule.
  //
  // It covers the radio pages only (SRS 4.9.2, F3-19). Devotionals and Past
  // events keep `requireMediaAuthority`, so publishing church wide content
  // does not widen to the roster.
  "manageRadio",
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

/**
 * The capabilities that belong to ONE named department rather than to the
 * shell, mapped to the department that grants them (spec 0015).
 *
 * A scoped capability behaves differently from every other entry in the
 * matrix: it ignores the HOD-only split entirely and is granted to every shell
 * role of its own department — HOD, delegate, System Admin and `roster` alike
 * — and to nobody in any other department. That is SRS 4.13.2's rule, which
 * gives the Library's whole roster full operational access over the catalogue
 * without an appointment.
 *
 * Library is the first of these, and Real Estate (spec 0018) is the second, on
 * exactly this mechanism with no new machinery. Hospitality is next. A
 * capability listed here is false whenever the department name is not passed
 * at all, which is why the second argument to {@link departmentCapabilities}
 * being optional is safe: a caller that does not know which department it is
 * talking about cannot accidentally be handed one of these.
 *
 * Note that the two entries differ in who they actually reach, and not because
 * of anything written here. `manageLibrary` reaches the Library's roster
 * because `Library & Information` is in ROSTER_PORTAL_DEPARTMENTS;
 * `manageRealEstate` reaches only the HOD, delegates and System Admin because
 * `Real Estate` is not. The scoping rule is the same for both, and the roster
 * question is settled one layer down in `resolveDepartmentShellRole`.
 */
const DEPARTMENT_SCOPED_CAPABILITIES = {
  manageLibrary: LIBRARY_DEPARTMENT_NAME,
  manageRealEstate: REAL_ESTATE_DEPARTMENT_NAME,
  manageRadio: MEDIA_DEPARTMENT_NAME,
} as const satisfies Partial<Record<DepartmentCapability, string>>;

/**
 * The `can` object for one role. System Admin holds everything the shell has.
 *
 * `departmentName` is OPTIONAL on purpose. Only the shell context, which has
 * just resolved the department document anyway, passes it; every other call
 * site reads the shell capabilities it always read and sees every scoped
 * capability as false. Making it required would have meant touching a dozen
 * call sites to thread through a value eleven of them have no use for.
 */
export function departmentCapabilities(
  role: DepartmentShellRole,
  departmentName?: string
): DepartmentCapabilities {
  const hodOnly: readonly string[] = HOD_ONLY_CAPABILITIES;
  const scoped: Record<string, string | undefined> =
    DEPARTMENT_SCOPED_CAPABILITIES;
  const full = role === "hod" || role === "system_admin";
  return Object.fromEntries(
    DEPARTMENT_CAPABILITIES.map((capability) => {
      // A scoped capability turns on the department, not the role: every role
      // of that department holds it, no role of any other does.
      const grantedBy = scoped[capability];
      if (grantedBy !== undefined) {
        return [capability, departmentName === grantedBy];
      }
      // A roster member holds no shell capability whatsoever — not the roster,
      // not the claims, not the messages. Only the scoped branch above can
      // ever give them a true.
      if (role === "roster") return [capability, false];
      return [capability, full || !hodOnly.includes(capability)];
    })
  ) as DepartmentCapabilities;
}

/**
 * The caller's shell role for one department, or null when they have none.
 *
 * Precedence is `system_admin`, then `hod`, then `delegate`, then `roster`,
 * and it matters: someone can be both Library's HOD and on its roster, and
 * resolving them as `roster` would strip the capabilities they actually hold.
 *
 * A roster member resolves to `roster` only when all three hold: they have an
 * `active` `departmentMemberships` row for THIS department, the department's
 * name is in `ROSTER_PORTAL_DEPARTMENTS`, and their `memberProfiles`
 * `profileStatus` is `verified`.
 *
 * That verified check is not decoration. `submitProfile` lets a user
 * self-insert their own roster memberships during the profile wizard, so
 * without it any visitor could hand themselves the Library's catalogue by
 * ticking a box about which department they would like to serve in. It is the
 * same gate `hasPortalAccess` applies at the front door, applied again here
 * because this function is what decides what they can actually do once inside.
 *
 * Still null — not an error — for a roster member of any OTHER department: SRS
 * 4.9.2 gives a roster member "No" on roster, claims, positions and delegates,
 * so they get no shell pages even though `hasPortalAccess` admits them to the
 * portal for their department's own bespoke pages (Media's Devotionals, Past
 * events). `roster` resolving at all does not change that; what it earns is
 * only a department-scoped capability (see DEPARTMENT_SCOPED_CAPABILITIES),
 * never a shell one. Null too for Administration authority, which keeps the
 * active-roster read it already had and gains nothing inside another
 * department's shell.
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
  if (await isVerifiedRosterPortalMember(ctx, userId, departmentId)) {
    return "roster";
  }
  return null;
}

/**
 * The `roster` branch of {@link resolveDepartmentShellRole}, split out so the
 * three conditions read as three conditions (spec 0015, AC-1).
 *
 * Ordered cheapest-first: the department read decides it for ten of the
 * thirteen departments without touching the membership or profile tables at
 * all.
 */
async function isVerifiedRosterPortalMember(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  departmentId: Id<"departments">
): Promise<boolean> {
  const department = await ctx.db.get(departmentId);
  if (
    !department ||
    !(ROSTER_PORTAL_DEPARTMENTS as readonly string[]).includes(department.name)
  ) {
    return false;
  }

  const membership = await ctx.db
    .query("departmentMemberships")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .filter((q) => q.eq(q.field("departmentId"), departmentId))
    .first();
  if (!membership) return false;

  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return profile?.profileStatus === "verified";
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
  // The department's NAME, because a scoped capability is granted on it (spec
  // 0015, AC-2). One extra document read on a path that was already doing
  // several, and the alternative — threading the name in from every call site
  // — would have put the same read in a dozen places.
  const department = role ? await ctx.db.get(departmentId) : null;
  if (
    !role ||
    !departmentCapabilities(role, department?.name)[capability]
  ) {
    // Reworded for spec 0015: "only the HOD or a System Admin" stopped being
    // true the moment a roster member could hold a capability, and a refusal
    // that misstates the rule sends the reader looking for the wrong fix.
    throw new Error(
      "Not authorized to do that in this department. What you may do here " +
        "depends on your role in it, and some actions are the HOD's alone."
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
  if (await holdsAdministrationAuthority(ctx, user)) return user;
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
 * Like {@link getAdministrationAuthorityOrNull}, but resolves null for a
 * signed in caller WITHOUT the authority too, instead of throwing.
 *
 * For read queries a card or page subscribes to where "not for you" is an
 * ordinary answer, not a violation: spec 0021 (AC-1, AC-22) requires the
 * dashboard activity feed and the Administration listings to return `null`
 * and never throw, so a Media HOD whose sidebar briefly shows an
 * Administration link gets an empty state rather than an error.
 */
export async function getAdministrationCallerOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  return (await holdsAdministrationAuthority(ctx, user)) ? user : null;
}

/**
 * The one Administration authority rule (System Admin, or the Administration
 * department's HOD or delegate), behind both the throwing and the null
 * returning gates above, so they cannot drift apart.
 */
async function holdsAdministrationAuthority(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<boolean> {
  if (await isActiveSystemAdmin(ctx, user._id)) return true;
  const adminDeptId = await getAdministrationDepartmentId(ctx);
  return Boolean(
    adminDeptId &&
      (await hasActiveDepartmentRole(ctx, user._id, adminDeptId, [
        "hod",
        "department_admin",
      ]))
  );
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
    .withIndex("by_name", (q) => q.eq("name", MEDIA_DEPARTMENT_NAME))
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

// ── Radio authority (spec 0019) ───────────────────────────────────────────
// `manageRadio` is a department scoped capability like `manageLibrary`, but
// the radio functions are not called with a departmentId: there is exactly
// one radio and it belongs to Media. These helpers resolve Media by name and
// ask the same matrix every other scoped capability goes through, so there is
// no second definition of who may run the radio.

/**
 * Whether a user holds `manageRadio`: Media's HOD, a Media delegate, a
 * verified Media roster member, or a System Admin (AC-32). False everywhere
 * else, including for a roster member of any other department.
 */
export async function hasRadioAuthority(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const mediaDeptId = await getMediaDepartmentId(ctx);
  if (!mediaDeptId) return isActiveSystemAdmin(ctx, userId);
  const role = await resolveDepartmentShellRole(ctx, userId, mediaDeptId);
  if (!role) return false;
  return departmentCapabilities(role, MEDIA_DEPARTMENT_NAME).manageRadio;
}

/**
 * The caller, when they hold `manageRadio`. Throws when unauthenticated or
 * not authorised (AC-33). For mutations and actions' internal reads.
 */
export async function requireRadioAuthority(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!(await hasRadioAuthority(ctx, user._id))) {
    throw new Error("Not authorized to manage the radio");
  }
  return user;
}

/**
 * The caller when they hold `manageRadio`, else null, never throwing, so a
 * management query returns null to anyone else and survives the reactive
 * teardown on sign out.
 */
export async function getRadioAuthorityOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  return (await hasRadioAuthority(ctx, user._id)) ? user : null;
}

// ── Pastoral's view of the Radio inbox (spec 0019, AC-30, AC-38) ─────────
// SRS PS2-03 gives Pastoral's HOD and delegates the same inbox view as Media.
// Appointment holders only: Pastoral's roster does not read the inbox.

/** The `_id` of the fixed "Pastoral" department, or null if unseeded. */
export async function getPastoralDepartmentId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"departments"> | null> {
  const dept = await ctx.db
    .query("departments")
    .withIndex("by_name", (q) => q.eq("name", PASTORAL_DEPARTMENT_NAME))
    .first();
  return dept?._id ?? null;
}

/** Whether a user is Pastoral's active HOD or a Pastoral delegate. */
export async function isPastoralLeader(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  return hasActiveDepartmentRole(ctx, userId, await getPastoralDepartmentId(ctx), [
    "hod",
    "department_admin",
  ]);
}

/**
 * The active Pastoral HOD and delegates, deduplicated: N34's recipients
 * (AC-30). Resolved at send time, so a delegate appointed this morning is
 * included and one revoked is not.
 */
export async function pastoralLeaderIds(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">[]> {
  const deptId = await getPastoralDepartmentId(ctx);
  if (!deptId) return [];
  const rows = await ctx.db
    .query("roleAssignments")
    .withIndex("by_departmentId", (q) => q.eq("departmentId", deptId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
  return [
    ...new Set(
      rows
        .filter((r) => r.roleType === "hod" || r.roleType === "department_admin")
        .map((r) => r.userId)
    ),
  ];
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
