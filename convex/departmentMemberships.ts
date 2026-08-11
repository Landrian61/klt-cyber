import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  requireUser,
  getCurrentUser,
  requireDepartmentAuthority,
  requireDepartmentHod,
  isActiveSystemAdmin,
  hasActiveDepartmentRole,
  getActiveRoles,
  logActivity,
} from "./lib/authz";

// Department roster (docs/Alignment.md, Increment 5). Membership is separate
// from `roleAssignments`: being on a department's roster doesn't imply any
// administrative authority, and holding hod/department_admin for a
// department implies roster membership (enforced in roles.ts assignRoleCore)
// but not the reverse.

const MAX_ACTIVE_DEPARTMENTS = 3;

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

/** Active roster of a single department. */
export const listDepartmentMembers = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) =>
    await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", departmentId).eq("status", "active")
      )
      .collect(),
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

/** Active hod(s) of a department — expect at most one, per cardinality rules. */
export const listDepartmentHods = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) =>
    await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("roleType"), "hod")
        )
      )
      .collect(),
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
    const isSystemAdmin = await isActiveSystemAdmin(ctx, actor._id);

    if (!isSystemAdmin) {
      const isMember = await ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", actor._id).eq("status", "active")
        )
        .filter((q) => q.eq(q.field("departmentId"), departmentId))
        .first();
      const hasAuthority = await hasActiveDepartmentRole(
        ctx,
        actor._id,
        departmentId,
        ["hod", "department_admin"]
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
