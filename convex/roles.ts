import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  getActiveRoles,
  getAdministrationDepartmentId,
  hasActiveDepartmentRole,
  isActiveSystemAdmin,
  logActivity,
  requireDepartmentHod,
  requireUser,
} from "./lib/authz";
import { notificationCommon } from "./lib/reminders";

const ROLE_LABEL: Record<AssignRoleArgs["roleType"], string> = {
  system_admin: "System Admin",
  clan_elder: "Clan Elder",
  hod: "HOD",
  department_admin: "Department Admin",
};

type AssignRoleArgs = {
  roleType: "system_admin" | "clan_elder" | "hod" | "department_admin";
  userId: Id<"users">;
  clanId?: Id<"clans">;
  departmentId?: Id<"departments">;
  note?: string;
};

// ── Core logic ────────────────────────────────────────────────────────────────
// Unlike the pre-Increment-5 version, authorization here is data-dependent on
// `args.roleType` (see docs/Alignment.md §1's authorization table), so the
// core resolves its own caller via requireUser rather than taking a
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

  if (args.roleType === "clan_elder") {
    if (!args.clanId) throw new Error("clan_elder requires a clanId");
    const clanId = args.clanId;

    // Revoke-and-replace any sitting elder of this clan (one elder per clan)
    // — restored: docs/Alignment.md §4's pseudocode dropped this pre-existing
    // invariant without flagging it as an intentional change.
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
      await ctx.db.patch(row._id, {
        status: "revoked",
        revokedBy: actor._id,
        revokedAt: Date.now(),
      });
      await logActivity(ctx, {
        actorUserId: actor._id,
        action: "role.revoked",
        targetType: "roleAssignments",
        targetId: row._id,
        metadata: { reason: "replaced_clan_elder", userId: row.userId, clanId },
      });
    }
  } else if (args.roleType === "system_admin" && args.clanId) {
    throw new Error("system_admin must not carry a clanId");
  }

  if (args.roleType === "hod") {
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
      await ctx.db.patch(row._id, {
        status: "revoked",
        revokedBy: actor._id,
        revokedAt: Date.now(),
      });
      await logActivity(ctx, {
        actorUserId: actor._id,
        action: "role.revoked",
        targetType: "roleAssignments",
        targetId: row._id,
        metadata: {
          reason: "replaced_department_hod",
          userId: row.userId,
          departmentId,
        },
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
      await ctx.db.patch(row._id, {
        status: "revoked",
        revokedBy: actor._id,
        revokedAt: Date.now(),
      });
      await logActivity(ctx, {
        actorUserId: actor._id,
        action: "role.revoked",
        targetType: "roleAssignments",
        targetId: row._id,
        metadata: { reason: "replaced_person_hod", userId: row.userId },
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
  // roster too, if they aren't on it already.
  if (
    (args.roleType === "hod" || args.roleType === "department_admin") &&
    args.departmentId
  ) {
    const departmentId = args.departmentId;
    const existingMembership = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .filter((q) => q.eq(q.field("departmentId"), departmentId))
      .first();
    if (!existingMembership) {
      await ctx.db.insert("departmentMemberships", {
        userId: args.userId,
        departmentId,
        addedBy: actor._id,
        status: "active",
      });
    }
  }

  // Broadcast the appointment. Scheduled after everything above has
  // succeeded, same "notification is a best-effort side effect, not part of
  // the transaction" convention as publishAnnouncement.
  const targetName =
    [target.firstName, target.lastName].filter(Boolean).join(" ") ||
    target.email;
  const roleLabel = ROLE_LABEL[args.roleType];
  let scopeName: string | undefined;
  if (args.departmentId) {
    scopeName = (await ctx.db.get(args.departmentId))?.name;
  } else if (args.clanId) {
    scopeName = (await ctx.db.get(args.clanId))?.name;
  }
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: scopeName ? `New ${scopeName} ${roleLabel} appointed` : `New ${roleLabel} appointed`,
    body: scopeName
      ? `${targetName} is now the ${roleLabel} for ${scopeName}.`
      : `${targetName} was appointed ${roleLabel}.`,
    ...notificationCommon({
      audience: { type: "all" },
      // No mobile screen owns role management (that's an admin-portal
      // concern) — an unrecognized type, which the notification center
      // falls back to Home for rather than doing nothing (apps/mobile/app/
      // notifications.tsx).
      deepLink: { type: "role_assignment", id: roleAssignmentId },
      createdBy: actor._id,
    }),
  });

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

  await ctx.db.patch(args.roleAssignmentId, {
    status: "revoked",
    revokedBy: actor._id,
    revokedAt: Date.now(),
    ...(args.note ? { note: args.note } : {}),
  });

  // Deliberately NOT wired to notifications.dispatch, unlike assignRoleCore
  // above — a revocation is not something to broadcast church-wide, and a
  // scoped/private notice to just the revoked person wasn't asked for
  // either. Not an oversight; revisit only if a real notification need for
  // this shows up.
  await logActivity(ctx, {
    actorUserId: actor._id,
    action: "role.revoked",
    targetType: "roleAssignments",
    targetId: args.roleAssignmentId,
    metadata: {
      roleType: assignment.roleType,
      userId: assignment.userId,
      ...(assignment.clanId ? { clanId: assignment.clanId } : {}),
      ...(assignment.departmentId
        ? { departmentId: assignment.departmentId }
        : {}),
    },
  });

  return { ok: true as const };
}

// ── Registered functions (auth wrappers) ─────────────────────────────────────

/**
 * Grant a role. Authorization is per-roleType — see docs/Alignment.md §1:
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

/** The caller's own active role assignments. */
export const getMyRoles = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await getActiveRoles(ctx, user._id);
  },
});
