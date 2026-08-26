import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { MAX_ACTIVE_DEPARTMENTS } from "@klt-cyber/shared";
import {
  requireUser,
  getCurrentUser,
  requireDepartmentAuthority,
  requireDepartmentHod,
  getAdministrationAuthorityOrNull,
  isActiveSystemAdmin,
  getActiveRoles,
  getAdministrationDepartmentId,
  logActivity,
} from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";

// Department roster (docs/Alignment.md, Increment 5). Membership is separate
// from `roleAssignments`: being on a department's roster doesn't imply any
// administrative authority, and holding hod/department_admin for a
// department implies roster membership (enforced in roles.ts assignRoleCore)
// but not the reverse. A roster row can also be self-added by the member
// during profile submission (see convex/memberProfiles.ts `submitProfile`) —
// that path writes directly to this table rather than going through
// `addDepartmentMember` below, so it isn't gated on department authority or
// on the profile already being verified.

export const addDepartmentMember = mutation({
  args: {
    departmentId: v.id("departments"),
    userId: v.id("users"),
    positionTitle: v.optional(v.string()),
  },
  handler: async (ctx, { departmentId, userId, positionTitle }) => {
    const actor = await requireDepartmentAuthority(ctx, departmentId); // hod, department_admin, or system_admin

    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || profile.profileStatus !== "verified") {
      throw new Error("Only verified members can be added to a department roster");
    }

    const activeMemberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .collect();
    if (activeMemberships.some((m) => m.departmentId === departmentId)) {
      throw new Error("Already an active member of this department");
    }
    if (activeMemberships.length >= MAX_ACTIVE_DEPARTMENTS) {
      throw new Error(
        "This member already belongs to the maximum of 3 active departments"
      );
    }

    const membershipId = await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      ...(positionTitle ? { positionTitle } : {}),
      addedBy: actor._id,
      status: "active",
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.member_added",
      targetType: "departmentMemberships",
      targetId: membershipId,
      metadata: { userId, departmentId },
    });
    return { membershipId };
  },
});

export const removeDepartmentMember = mutation({
  args: { membershipId: v.id("departmentMemberships") },
  handler: async (ctx, { membershipId }) => {
    const membership = await ctx.db.get(membershipId);
    if (!membership) throw new Error("Membership not found");

    const actor = await requireDepartmentHod(ctx, membership.departmentId); // hod or system_admin ONLY

    await ctx.db.patch(membershipId, {
      status: "removed",
      removedBy: actor._id,
      removedAt: Date.now(),
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.member_removed",
      targetType: "departmentMemberships",
      targetId: membershipId,
      metadata: { userId: membership.userId, departmentId: membership.departmentId },
    });

    // Cascade: revoke any hod/department_admin role they held in this
    // specific department (§ "Removal cascades" in docs/Alignment.md).
    const roleRows = await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) =>
        q.eq("departmentId", membership.departmentId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), membership.userId),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();
    for (const role of roleRows) {
      await ctx.db.patch(role._id, {
        status: "revoked",
        revokedBy: actor._id,
        revokedAt: Date.now(),
        note: "Revoked via department roster removal",
      });
      await logActivity(ctx, {
        actorUserId: actor._id,
        action: "role.revoked",
        targetType: "roleAssignments",
        targetId: role._id,
        metadata: { reason: "roster_removal", userId: membership.userId },
      });
    }

    return { ok: true as const };
  },
});

/**
 * Which department a roster read is about: the explicit `departmentId` when
 * one is given, otherwise the fixed "Administration" department resolved
 * server-side.
 *
 * The admin portal's own roster screens are always about Administration, but
 * the client had no way to name it without first fetching all 13 departments
 * and matching on `name` — a second, dependent round trip before the roster
 * query could even start, each hop paying the full authz gate. Resolving it
 * here collapses that to one call. Returns null when Administration has not
 * been seeded yet, matching the "reactive queries resolve rather than throw"
 * convention used across this file.
 */
async function resolveRosterDepartment(
  ctx: QueryCtx,
  departmentId?: Id<"departments">
) {
  const id = departmentId ?? (await getAdministrationDepartmentId(ctx));
  return id ? await ctx.db.get(id) : null;
}

/**
 * Active roster of a single department, plus the department itself so callers
 * don't need a separate lookup for its name. Omit `departmentId` to get the
 * Administration department's roster.
 *
 * Gated: Administration authority (see the note above `listDepartmentHods`).
 */
export const listDepartmentMembers = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, { departmentId }) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    const department = await resolveRosterDepartment(ctx, departmentId);
    if (!department) return null;

    const members = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", department._id).eq("status", "active")
      )
      .collect();

    return { department, members };
  },
});

/**
 * Same active roster as `listDepartmentMembers`, joined with each member's
 * profile (name, phone, photo) and the display name of whoever added them.
 * `listDepartmentMembers` returns bare membership rows only (userId, no
 * profile data) — this is what roster/roster-detail screens actually render;
 * kept as a separate query rather than changing `listDepartmentMembers`'
 * shape since other callers (e.g. the dashboard's member count) only need
 * the bare rows. Omit `departmentId` for the Administration department, same
 * as `listDepartmentMembers`. `profile` is null only if a membership row outlives its
 * profile (shouldn't happen — a profile row and its membership rows are
 * always created together, whether admin-added via `addDepartmentMember`
 * or self-added via `submitProfile` — but this is a live subscription, not
 * a transaction). Note the joined `profile.profileStatus` may be
 * `"pending_verification"`, not just `"verified"` — self-added members
 * appear on the roster before Church Admin verifies their profile.
 *
 * Gated: Administration authority. This is the most sensitive read in the
 * file — it joins each roster row to the member's profile (name, phone,
 * signed photo URL) and their user row.
 */
export const listDepartmentMembersWithProfiles = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, { departmentId }) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    const department = await resolveRosterDepartment(ctx, departmentId);
    if (!department) return null;

    const memberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", department._id).eq("status", "active")
      )
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const [profile, user, addedByUser] = await Promise.all([
          ctx.db
            .query("memberProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
            .unique(),
          ctx.db.get(membership.userId),
          ctx.db.get(membership.addedBy),
        ]);
        return {
          membership,
          profile: profile
            ? { ...profile, photoUrl: await resolveMediaUrl(profile.photoUrl) }
            : null,
          user,
          addedByName: addedByUser
            ? `${addedByUser.firstName ?? ""} ${addedByUser.lastName ?? ""}`.trim() ||
              addedByUser.email
            : null,
        };
      })
    );

    return { department, members };
  },
});

/** The caller's own active department memberships. Null when unauthenticated. */
export const getMyDepartmentMemberships = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getCurrentUser(ctx);
    if (!actor) return null;
    return await ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", actor._id).eq("status", "active")
      )
      .collect();
  },
});

/**
 * Active hod(s) of a department — expect at most one, per cardinality rules.
 *
 * Gated: Administration authority — system_admin, or the Administration
 * department's hod/department_admin, which is the portal-wide authority per
 * docs/Alignment.md. That matches every caller of the three roster reads
 * today: all of them render under `app/(admin)/admin/*`, whose layout already
 * requires exactly this. When departments get their own portals, the gate
 * will need to widen to "…or this department's own hod/department_admin" —
 * deliberately not anticipated here.
 *
 * `getAdministrationAuthorityOrNull` (not `requireAdministrationAuthority`)
 * because these are live subscriptions: on sign-out the token drops while the
 * subscription is still mounted, and the unauthenticated re-run must resolve
 * to null rather than surface as a client error. An authenticated caller
 * without the authority still throws — that is a real violation.
 *
 * NOTE: this query currently has no callers. Gated rather than deleted so the
 * whole file is consistent; removing it is a separate cleanup.
 */
export const listDepartmentHods = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    return await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("roleType"), "hod")
        )
      )
      .collect();
  },
});

// ── Post-login department picker (docs/Alignment.md, "Part 2") ──────────────

/**
 * Departments the caller should see on the post-login picker. System Admin
 * sees all 13 (unscoped, per docs/Alignment.md §1). Everyone else sees only
 * departments they're on the active roster of, or hold an active
 * hod/department_admin grant for — in practice these largely coincide, since
 * assignRoleCore already adds hod/department_admin appointees to the roster,
 * but a role and a roster row are still tracked and unioned independently
 * here in case they ever diverge (e.g. a future admin action that grants
 * authority without roster membership).
 */
export const listMyDepartments = query({
  args: {},
  handler: async (ctx) => {
    // Null (not an error) when unauthenticated — reactive clients stay
    // subscribed through sign-out, and the unauthenticated re-run must
    // resolve rather than log a crash mid-teardown.
    const actor = await getCurrentUser(ctx);
    if (!actor) return null;

    const isSystemAdmin = await isActiveSystemAdmin(ctx, actor._id);
    const allDepartments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .collect();

    if (isSystemAdmin) {
      return allDepartments.map((department) => ({
        department,
        roles: [] as string[],
        isSystemAdmin: true as const,
      }));
    }

    const [memberships, activeRoles] = await Promise.all([
      ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", actor._id).eq("status", "active")
        )
        .collect(),
      getActiveRoles(ctx, actor._id),
    ]);

    const rolesByDept = new Map<Id<"departments">, Set<string>>();
    for (const membership of memberships) {
      const roles = rolesByDept.get(membership.departmentId) ?? new Set<string>();
      roles.add("member");
      rolesByDept.set(membership.departmentId, roles);
    }
    for (const role of activeRoles) {
      if (
        (role.roleType === "hod" || role.roleType === "department_admin") &&
        role.departmentId
      ) {
        const roles = rolesByDept.get(role.departmentId) ?? new Set<string>();
        roles.add(role.roleType);
        rolesByDept.set(role.departmentId, roles);
      }
    }

    return allDepartments
      .filter((department) => rolesByDept.has(department._id))
      .map((department) => ({
        department,
        roles: Array.from(rolesByDept.get(department._id) ?? []),
        isSystemAdmin: false as const,
      }));
  },
});

/**
 * Access check + name lookup for a single department's "coming soon" page —
 * every department other than Administration routes here today, since none
 * of them have a real portal built yet (docs/Alignment.md, "Part 2"; the
 * page itself is intentionally just a skeleton, so this query intentionally
 * doesn't fetch roster/hod detail it wouldn't render).
 *
 * This is the real authorization boundary for /departments/[departmentId] —
 * it throws unless the caller is System Admin, on this department's roster,
 * or holds hod/department_admin for it specifically. The page component only
 * redirects on the resulting error; it doesn't re-derive access itself.
 */
export const getDepartmentAccess = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    const actor = await requireUser(ctx);
    const activeRoles = await getActiveRoles(ctx, actor._id);

    // The web portal authorization invariant (docs/DATA_MODEL.md): a portal
    // session is valid only when the caller holds >=1 active roleAssignments
    // record. Enforced HERE, not just in routing.
    //
    // This used to be carried entirely by middleware, which is why the check
    // below could pass on roster membership alone. It cannot: roster
    // membership is not authority (see the note at the top of this file), and
    // `submitProfile` self-inserts roster rows for ordinary members who hold
    // no role at all. Such a member belongs in the mobile app; without this
    // check, moving the role gate out of middleware would let them into the
    // portal.
    if (activeRoles.length === 0) {
      throw new Error("Not authorized to view this department");
    }

    const isSystemAdmin = activeRoles.some(
      (role) => role.roleType === "system_admin"
    );

    if (!isSystemAdmin) {
      const isMember = await ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", actor._id).eq("status", "active")
        )
        .filter((q) => q.eq(q.field("departmentId"), departmentId))
        .first();
      // Derived from the roles we already loaded rather than a second indexed
      // read, which is what hasActiveDepartmentRole would have cost.
      const hasAuthority = activeRoles.some(
        (role) =>
          (role.roleType === "hod" || role.roleType === "department_admin") &&
          role.departmentId === departmentId
      );
      if (!isMember && !hasAuthority) {
        throw new Error("Not authorized to view this department");
      }
    }

    const department = await ctx.db.get(departmentId);
    if (!department) throw new Error("Department not found");

    return { department };
  },
});
