import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  getActiveRoles,
  getAdministrationDepartmentId,
  getCurrentUser,
  hasActiveDepartmentRole,
  isActiveSystemAdmin,
  logActivity,
  requireDepartmentHod,
  requireUser,
} from "./lib/authz";
import { placeOnRoster } from "./lib/departmentMembership";
import {
  displayName,
  endRoleAssignment,
  findIdenticalActiveAssignment,
  notifyAppointment,
  roleScopeName,
} from "./lib/roleNotices";

type AssignRoleArgs = {
  roleType: "system_admin" | "clan_elder" | "hod" | "department_admin";
  userId: Id<"users">;
  clanId?: Id<"clans">;
  departmentId?: Id<"departments">;
  note?: string;
};

// ── Core logic ────────────────────────────────────────────────────────────────
// Authorization here is data-dependent on `args.roleType`, so the core
// resolves its own caller via requireUser rather than taking a
// pre-authorized `caller` param.

export async function assignRoleCore(ctx: MutationCtx, args: AssignRoleArgs) {
  const actor = await requireUser(ctx);
  const callerIsSystemAdmin = await isActiveSystemAdmin(ctx, actor._id);
  const adminDeptId = await getAdministrationDepartmentId(ctx);

  const target = await ctx.db.get(args.userId);
  if (!target) throw new Error("Target user not found");

  // System Admin is a "ghost": a technical steward, not a church member. They
  // sign up and are granted the role without ever completing a member profile,
  // because none of their church-domain data is stored. Every other role is a
  // real ministry position held by a verified member, so it keeps the gate —
  // and for hod/department_admin the gate also protects the implicit roster
  // insert below, which `addDepartmentMember` would refuse for an unverified
  // member.
  if (args.roleType !== "system_admin" && !target.profileCompleted) {
    throw new Error("Target user must complete their profile first");
  }

  // Each role carries only its own scope. A stray id is refused rather than
  // stored, because the notices read the scope off the row: a clan elder
  // carrying a departmentId would announce itself to that department's roster.
  if (args.roleType === "clan_elder") {
    if (!args.clanId) throw new Error("clan_elder requires a clanId");
    if (args.departmentId) throw new Error("clan_elder must not carry a departmentId");
  } else if (args.roleType === "system_admin") {
    if (args.clanId || args.departmentId) {
      throw new Error("system_admin must not carry a clanId or departmentId");
    }
  } else if (args.clanId) {
    throw new Error(`${args.roleType} must not carry a clanId`);
  }

  if (args.roleType === "hod") {
    if (!args.departmentId) {
      throw new Error(
        "An HOD appointment must name a department (departmentId is required)"
      );
    }
    const callerIsAdminHod = await hasActiveDepartmentRole(
      ctx,
      actor._id,
      adminDeptId,
      ["hod"]
    );
    if (!callerIsSystemAdmin && !callerIsAdminHod) {
      throw new Error(
        "Only System Admin or the Administration HOD can appoint department heads"
      );
    }
  } else if (args.roleType === "department_admin") {
    if (!args.departmentId) {
      throw new Error("departmentId required for department_admin");
    }
    await requireDepartmentHod(ctx, args.departmentId); // throws if unauthorized
  } else {
    if (!callerIsSystemAdmin) throw new Error("Not authorized");
  }

  // Re-appointing someone to a seat they already hold is a no op (spec 0013,
  // AC-4). Checked after authorization, so it reveals nothing to a caller who
  // could not make the appointment, and before both cardinality rules below,
  // which would otherwise revoke the sitting HOD or elder (the same person) and
  // insert a copy, logging and notifying a change that did not happen.
  const identical = await findIdenticalActiveAssignment(ctx, {
    userId: args.userId,
    roleType: args.roleType,
    departmentId: args.departmentId,
    clanId: args.clanId,
  });
  if (identical) return { roleAssignmentId: identical._id };

  if (args.roleType === "clan_elder" && args.clanId) {
    const clanId = args.clanId;

    // Revoke-and-replace any sitting elder of this clan (one elder per clan).
    const sittingElder = await ctx.db
      .query("roleAssignments")
      .withIndex("by_clanId", (q) => q.eq("clanId", clanId))
      .filter((q) =>
        q.and(
          q.eq(q.field("roleType"), "clan_elder"),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();
    for (const row of sittingElder) {
      await endRoleAssignment(ctx, row, {
        actorId: actor._id,
        reason: "replaced_clan_elder",
      });
    }
  }

  if (args.roleType === "hod" && args.departmentId) {
    const departmentId = args.departmentId;

    // Cardinality A: at most one active hod per department.
    const existingForDept = await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("roleType"), "hod")
        )
      )
      .collect();
    for (const row of existingForDept) {
      await endRoleAssignment(ctx, row, {
        actorId: actor._id,
        reason: "replaced_department_hod",
      });
    }

    // Cardinality B: a person can be hod of at most one department.
    const existingForUser = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .filter((q) => q.eq(q.field("roleType"), "hod"))
      .collect();
    for (const row of existingForUser) {
      await endRoleAssignment(ctx, row, {
        actorId: actor._id,
        reason: "replaced_person_hod",
      });
    }
  }

  const roleAssignmentId = await ctx.db.insert("roleAssignments", {
    userId: args.userId,
    roleType: args.roleType,
    ...(args.clanId ? { clanId: args.clanId } : {}),
    ...(args.departmentId ? { departmentId: args.departmentId } : {}),
    assignedBy: actor._id,
    status: "active",
    ...(args.note ? { note: args.note } : {}),
  });

  await logActivity(ctx, {
    actorUserId: actor._id,
    action: "role.assigned",
    targetType: "roleAssignments",
    targetId: roleAssignmentId,
    metadata: {
      roleType: args.roleType,
      userId: args.userId,
      ...(args.clanId ? { clanId: args.clanId } : {}),
      ...(args.departmentId ? { departmentId: args.departmentId } : {}),
    },
  });

  // hod/department_admin implicitly puts the appointee on that department's
  // roster too, if they aren't on it already. `placeOnRoster` promotes a
  // `pending_claim` row rather than inserting beside it (spec 0012 AC-15):
  // appointing someone who had asked to serve here would otherwise leave them
  // on the roster twice, as a leader and as a claimant still waiting.
  if (
    (args.roleType === "hod" || args.roleType === "department_admin") &&
    args.departmentId
  ) {
    await placeOnRoster(ctx, {
      userId: args.userId,
      departmentId: args.departmentId,
      actorUserId: actor._id,
    });
  }

  // N13 to the appointee and, for a scoped role, N14 to the group they now
  // lead (spec 0013, AC-1, AC-2). Never to everyone (AC-3). Scheduled after
  // everything above has succeeded, same "notification is a best-effort side
  // effect, not part of the transaction" convention as publishAnnouncement.
  const assignment = await ctx.db.get(roleAssignmentId);
  if (assignment) await notifyAppointment(ctx, assignment, actor._id);

  return { roleAssignmentId };
}

export async function revokeRoleCore(
  ctx: MutationCtx,
  args: { roleAssignmentId: Id<"roleAssignments">; note?: string }
) {
  const assignment = await ctx.db.get(args.roleAssignmentId);
  if (!assignment) throw new Error("Role assignment not found");

  // Authenticate before any early return — an unauthenticated caller must not
  // be able to probe "does this ID exist and is it already revoked?".
  const actor = await requireUser(ctx);

  if (assignment.status === "revoked") {
    return { ok: true as const, alreadyRevoked: true };
  }

  const callerIsSystemAdmin = await isActiveSystemAdmin(ctx, actor._id);

  // Symmetric with assignRoleCore: revoking a role requires the same
  // authority tier that would be needed to grant it.
  if (assignment.roleType === "hod") {
    const adminDeptId = await getAdministrationDepartmentId(ctx);
    const callerIsAdminHod = await hasActiveDepartmentRole(
      ctx,
      actor._id,
      adminDeptId,
      ["hod"]
    );
    if (!callerIsSystemAdmin && !callerIsAdminHod) {
      throw new Error(
        "Only System Admin or the Administration HOD can revoke a department head"
      );
    }
  } else if (assignment.roleType === "department_admin") {
    if (!assignment.departmentId) {
      throw new Error(
        "Malformed department_admin assignment: missing departmentId"
      );
    }
    await requireDepartmentHod(ctx, assignment.departmentId); // allows system_admin too
  } else {
    if (!callerIsSystemAdmin) throw new Error("Not authorized");
  }

  // N15 to the holder, privately (spec 0013, AC-5). `removeDelegate` reaches
  // this too and no longer sends its own copy.
  await endRoleAssignment(ctx, assignment, {
    actorId: actor._id,
    ...(args.note ? { note: args.note } : {}),
  });

  return { ok: true as const };
}

// ── Registered functions (auth wrappers) ─────────────────────────────────────

/**
 * Grant a role. Authorization is per-roleType:
 * system_admin/clan_elder require System Admin; hod requires System Admin or
 * the Administration department's active hod; department_admin requires
 * System Admin or that department's active hod. `clan_elder` cardinality
 * (one per clan) is enforced upstream of this file's history and unchanged;
 * `hod` cardinality (one per department AND one per person) is enforced here.
 */
export const assignRole = mutation({
  args: {
    roleType: v.union(
      v.literal("system_admin"),
      v.literal("clan_elder"),
      v.literal("hod"),
      v.literal("department_admin")
    ),
    userId: v.id("users"),
    clanId: v.optional(v.id("clans")),
    departmentId: v.optional(v.id("departments")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => await assignRoleCore(ctx, args),
});

/** Revoke a role assignment. Authorization mirrors assignRole, see above. */
export const revokeRole = mutation({
  args: {
    roleAssignmentId: v.id("roleAssignments"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => await revokeRoleCore(ctx, args),
});

/**
 * What the mobile role screen shows for a `role_assignment` or `new_leader`
 * notice (spec 0013, AC-14, AC-15).
 *
 * Two readers. The appointee gets the appointee view, from the assignment
 * alone. Anyone else gets the member view only by naming the notification they
 * opened it from, and only when that row is a `new_leader` notice for this
 * assignment addressed to a `users` list they are on: so a member reads exactly
 * what they were already told in the push, and nobody can enumerate who holds
 * which role by guessing ids.
 *
 * Every refusal is `null`, whether the assignment is missing or simply not the
 * caller's, so the answer never confirms that an id exists.
 */
export const getRoleNotice = query({
  args: {
    roleAssignmentId: v.id("roleAssignments"),
    notificationId: v.optional(v.id("notifications")),
  },
  handler: async (ctx, { roleAssignmentId, notificationId }) => {
    const caller = await getCurrentUser(ctx);
    if (!caller) return null;
    const assignment = await ctx.db.get(roleAssignmentId);
    if (!assignment) return null;

    let view: "appointee" | "member";
    if (assignment.userId === caller._id) {
      view = "appointee";
    } else {
      if (!notificationId) return null;
      const notification = await ctx.db.get(notificationId);
      if (
        !notification ||
        notification.deepLink.type !== "new_leader" ||
        notification.deepLink.id !== roleAssignmentId ||
        notification.audience.type !== "users" ||
        !notification.audience.userIds.includes(caller._id)
      ) {
        return null;
      }
      view = "member";
    }

    const holder = await ctx.db.get(assignment.userId);
    // A deleted holder is never named to anyone else (spec 0008), so the member
    // view reads as no longer available.
    if (!holder || (view === "member" && holder.deletedAt !== undefined)) return null;

    return {
      view,
      roleType: assignment.roleType,
      scopeName: await roleScopeName(ctx, assignment),
      holderName: displayName(holder),
      active: assignment.status === "active",
    };
  },
});

/** The caller's own active role assignments. */
export const getMyRoles = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await getActiveRoles(ctx, user._id);
  },
});
