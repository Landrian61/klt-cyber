import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  profileCompletionInputSchema,
  profileUpdateInputSchema,
} from "@klt-cyber/shared";
import type { Doc, Id } from "./_generated/dataModel";
import { getActiveRoles, logActivity, requireUser } from "./lib/authz";

const sexValidator = v.union(v.literal("male"), v.literal("female"));
const maritalStatusValidator = v.union(
  v.literal("single"),
  v.literal("married"),
  v.literal("widowed"),
  v.literal("divorced")
);
const ageBracketValidator = v.union(
  v.literal("0-12"),
  v.literal("13-19"),
  v.literal("20-35"),
  v.literal("36+")
);

// ── Core logic (auth-free; the acting user is passed in) ──────────────────────
// Exported so both the registered mutations below and the verification harness
// exercise the same code against an explicit actor.

export async function completeProfileCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  rawInput: unknown
) {
  const input = profileCompletionInputSchema.parse(rawInput);

  const existing = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (existing) throw new Error("Profile already completed");
  if (user.role === "member") throw new Error("User is already a member");

  const profileId = await ctx.db.insert("memberProfiles", {
    userId: user._id,
    sex: input.sex,
    maritalStatus: input.maritalStatus,
    ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.clanId
      ? {
          clanId: input.clanId as Id<"clans">,
          clanApproval: { status: "pending" as const },
        }
      : {}),
  });

  // Promote, backfilling names only when the user does not already have them.
  const userPatch: Partial<Doc<"users">> = {
    role: "member",
    profileCompleted: true,
  };
  if (input.firstName && !user.firstName) userPatch.firstName = input.firstName;
  if (input.lastName && !user.lastName) userPatch.lastName = input.lastName;
  await ctx.db.patch(user._id, userPatch);

  await logActivity(ctx, {
    actorUserId: user._id,
    action: "profile.completed",
    targetType: "memberProfiles",
    targetId: profileId,
  });

  if (input.children) {
    for (const child of input.children) {
      const childId = await ctx.db.insert("children", {
        parentUserId: user._id,
        name: child.name,
        ...(child.dateOfBirth ? { dateOfBirth: child.dateOfBirth } : {}),
        ageBracket: child.ageBracket,
        ...(child.guardianContact
          ? { guardianContact: child.guardianContact }
          : {}),
      });
      await logActivity(ctx, {
        actorUserId: user._id,
        action: "child.added",
        targetType: "children",
        targetId: childId,
      });
    }
  }

  if (input.clanId) {
    await logActivity(ctx, {
      actorUserId: user._id,
      action: "clan.affiliation_claimed",
      targetType: "clans",
      targetId: input.clanId,
    });
  }

  return { profileId };
}

export async function updateProfileCore(
  ctx: MutationCtx,
  user: Doc<"users">,
  rawInput: Record<string, unknown>
) {
  // Defensive: sex is admin-only and not in the schema; never honour it.
  if (rawInput.sex !== undefined) {
    throw new Error("sex cannot be edited by the member");
  }
  const input = profileUpdateInputSchema.parse(rawInput);

  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!profile) throw new Error("No profile to update — complete it first");

  const userPatch: Partial<Doc<"users">> = {};
  if (input.firstName !== undefined) userPatch.firstName = input.firstName;
  if (input.lastName !== undefined) userPatch.lastName = input.lastName;
  if (input.profilePictureUrl !== undefined)
    userPatch.profilePictureUrl = input.profilePictureUrl;
  if (Object.keys(userPatch).length) await ctx.db.patch(user._id, userPatch);

  const profilePatch: Partial<Doc<"memberProfiles">> = {};
  if (input.phone !== undefined) profilePatch.phone = input.phone;
  if (input.profession !== undefined) profilePatch.profession = input.profession;
  if (input.dateOfBirth !== undefined)
    profilePatch.dateOfBirth = input.dateOfBirth;

  let clanChanged = false;
  if (
    input.clanId !== undefined &&
    (input.clanId as Id<"clans">) !== profile.clanId
  ) {
    profilePatch.clanId = input.clanId as Id<"clans">;
    profilePatch.clanApproval = { status: "pending" as const };
    clanChanged = true;
  }
  if (Object.keys(profilePatch).length)
    await ctx.db.patch(profile._id, profilePatch);

  if (clanChanged) {
    await logActivity(ctx, {
      actorUserId: user._id,
      action: "clan.affiliation_claimed",
      targetType: "clans",
      targetId: input.clanId as Id<"clans">,
    });
  }

  return { ok: true };
}

export async function getMyAccountCore(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
) {
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  const activeRoles = await getActiveRoles(ctx, user._id);
  return { user, profile: profile ?? null, activeRoles };
}

export async function getMyProfileCore(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
) {
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!profile) return null;
  const children = await ctx.db
    .query("children")
    .withIndex("by_parentUserId", (q) => q.eq("parentUserId", user._id))
    .collect();
  return { ...profile, children };
}

// ── Registered functions (auth wrappers) ─────────────────────────────────────

/**
 * Visitor → member promotion. Atomically creates the `memberProfiles` row,
 * flips the user to a member, records any children, and writes the audit trail.
 */
export const completeProfile = mutation({
  args: {
    sex: sexValidator,
    maritalStatus: maritalStatusValidator,
    dateOfBirth: v.optional(v.string()),
    phone: v.optional(v.string()),
    clanId: v.optional(v.id("clans")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    children: v.optional(
      v.array(
        v.object({
          name: v.string(),
          dateOfBirth: v.optional(v.string()),
          ageBracket: ageBracketValidator,
          guardianContact: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await completeProfileCore(ctx, user, args);
  },
});

/**
 * Member self-edit of profile fields. `sex` is admin-only and is defensively
 * rejected. Changing `clanId` re-triggers clan approval.
 */
export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
    profession: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    clanId: v.optional(v.id("clans")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await updateProfileCore(ctx, user, args);
  },
});

/**
 * Everything the mobile/web client needs to gate UI: the base user, their
 * member profile (or null for a visitor), and their active role assignments.
 */
export const getMyAccount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await getMyAccountCore(ctx, user);
  },
});

/** The caller's member profile plus their children, or null for a visitor. */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await getMyProfileCore(ctx, user);
  },
});
