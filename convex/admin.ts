import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { clanVerificationInputSchema } from "@klt-cyber/shared";
import type { Doc, Id } from "./_generated/dataModel";
import { logActivity, requireSystemAdmin } from "./lib/authz";

// ── Core logic (auth-free; the acting admin is passed in) ────────────────────

export async function suspendUserCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  userId: Id<"users">
) {
  const target = await ctx.db.get(userId);
  if (!target) throw new Error("Target user not found");
  await ctx.db.patch(userId, { status: "suspended" });
  await logActivity(ctx, {
    actorUserId: caller._id,
    action: "user.suspended",
    targetType: "users",
    targetId: userId,
  });
  return { ok: true as const };
}

export async function unsuspendUserCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  userId: Id<"users">
) {
  const target = await ctx.db.get(userId);
  if (!target) throw new Error("Target user not found");
  await ctx.db.patch(userId, { status: "active" });
  await logActivity(ctx, {
    actorUserId: caller._id,
    action: "user.unsuspended",
    targetType: "users",
    targetId: userId,
  });
  return { ok: true as const };
}

export async function verifyClanAffiliationCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  args: { userId: Id<"users">; status: "verified" | "rejected"; note?: string }
) {
  clanVerificationInputSchema.parse(args);

  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();
  if (!profile) throw new Error("Target user has no member profile");
  if (!profile.clanId) throw new Error("Target user has no clan to verify");

  await ctx.db.patch(profile._id, {
    clanApproval: {
      status: args.status,
      verifiedBy: caller._id,
      verifiedAt: Date.now(),
      ...(args.note ? { note: args.note } : {}),
    },
  });

  await logActivity(ctx, {
    actorUserId: caller._id,
    action:
      args.status === "verified"
        ? "clan.affiliation_verified"
        : "clan.affiliation_rejected",
    targetType: "memberProfiles",
    targetId: profile._id,
    metadata: { userId: args.userId, clanId: profile.clanId },
  });

  return { ok: true as const };
}

// ── Registered functions (auth wrappers) ─────────────────────────────────────

/** Suspend a user (reversible). system_admin only. */
export const suspendUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await suspendUserCore(ctx, caller, args.userId);
  },
});

/** Reactivate a suspended user. system_admin only. */
export const unsuspendUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await unsuspendUserCore(ctx, caller, args.userId);
  },
});

/**
 * Verify or reject a member's self-selected clan affiliation. system_admin only
 * — an Elder-portal stand-in until that module ships.
 */
export const verifyClanAffiliation = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("verified"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await verifyClanAffiliationCore(ctx, caller, args);
  },
});
