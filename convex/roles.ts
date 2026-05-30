import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { roleAssignmentInputSchema } from "@klt-cyber/shared";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getActiveRoles,
  logActivity,
  requireSystemAdmin,
  requireUser,
} from "./lib/authz";

type AssignRoleArgs = {
  roleType: "system_admin" | "clan_elder";
  userId: Id<"users">;
  clanId?: Id<"clans">;
  note?: string;
};

// ── Core logic (auth-free; the acting admin is passed in) ────────────────────

export async function assignRoleCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  args: AssignRoleArgs
) {
  // Discriminated validation: clan_elder requires clanId, system_admin must not.
  roleAssignmentInputSchema.parse(args);

  const target = await ctx.db.get(args.userId);
  if (!target) throw new Error("Target user not found");
  if (!target.profileCompleted) {
    throw new Error("Target user must complete their profile first");
  }

  if (args.roleType === "clan_elder") {
    if (!args.clanId) throw new Error("clan_elder requires a clanId");
    const clanId = args.clanId;

    // Revoke-and-replace any sitting elder of this clan (one elder per clan).
    const sitting = await ctx.db
      .query("roleAssignments")
      .withIndex("by_clanId", (q) => q.eq("clanId", clanId))
      .filter((q) =>
        q.and(
          q.eq(q.field("roleType"), "clan_elder"),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();
    for (const ex of sitting) {
      await ctx.db.patch(ex._id, {
        status: "revoked",
        revokedBy: caller._id,
        revokedAt: Date.now(),
      });
      await logActivity(ctx, {
        actorUserId: caller._id,
        action: "role.revoked",
        targetType: "roleAssignments",
        targetId: ex._id,
        metadata: { reason: "replaced", userId: ex.userId, clanId },
      });
    }
  }

  const roleAssignmentId = await ctx.db.insert("roleAssignments", {
    userId: args.userId,
    roleType: args.roleType,
    ...(args.roleType === "clan_elder" ? { clanId: args.clanId } : {}),
    assignedBy: caller._id,
    status: "active",
    ...(args.note ? { note: args.note } : {}),
  });

  await logActivity(ctx, {
    actorUserId: caller._id,
    action: "role.assigned",
    targetType: "roleAssignments",
    targetId: roleAssignmentId,
    metadata: {
      roleType: args.roleType,
      userId: args.userId,
      ...(args.clanId ? { clanId: args.clanId } : {}),
    },
  });

  return { roleAssignmentId };
}

export async function revokeRoleCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  args: { roleAssignmentId: Id<"roleAssignments">; note?: string }
) {
  const assignment = await ctx.db.get(args.roleAssignmentId);
  if (!assignment) throw new Error("Role assignment not found");
  if (assignment.status === "revoked") {
    return { ok: true as const, alreadyRevoked: true };
  }

  await ctx.db.patch(args.roleAssignmentId, {
    status: "revoked",
    revokedBy: caller._id,
    revokedAt: Date.now(),
    ...(args.note ? { note: args.note } : {}),
  });

  await logActivity(ctx, {
    actorUserId: caller._id,
    action: "role.revoked",
    targetType: "roleAssignments",
    targetId: args.roleAssignmentId,
    metadata: {
      roleType: assignment.roleType,
      userId: assignment.userId,
      ...(assignment.clanId ? { clanId: assignment.clanId } : {}),
    },
  });

  return { ok: true as const };
}

// ── Registered functions (auth wrappers) ─────────────────────────────────────

/**
 * Grant a role. system_admin only. The target must have completed their member
 * profile. For `clan_elder`, any existing active elder of the same clan is
 * revoke-and-replaced in the same mutation.
 */
export const assignRole = mutation({
  args: {
    roleType: v.union(v.literal("system_admin"), v.literal("clan_elder")),
    userId: v.id("users"),
    clanId: v.optional(v.id("clans")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await assignRoleCore(ctx, caller, args);
  },
});

/** Revoke a role assignment. system_admin only. */
export const revokeRole = mutation({
  args: {
    roleAssignmentId: v.id("roleAssignments"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await revokeRoleCore(ctx, caller, args);
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
