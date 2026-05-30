import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { childInputSchema } from "@klt-cyber/shared";
import { logActivity, requireUser } from "./lib/authz";

const ageBracketValidator = v.union(
  v.literal("0-12"),
  v.literal("13-19"),
  v.literal("20-35"),
  v.literal("36+")
);

const childFields = {
  name: v.string(),
  dateOfBirth: v.optional(v.string()),
  ageBracket: ageBracketValidator,
  guardianContact: v.optional(v.string()),
};

/** Add a child record for the calling user. */
export const addChild = mutation({
  args: childFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const input = childInputSchema.parse(args);

    const childId = await ctx.db.insert("children", {
      parentUserId: user._id,
      name: input.name,
      ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
      ageBracket: input.ageBracket,
      ...(input.guardianContact
        ? { guardianContact: input.guardianContact }
        : {}),
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "child.added",
      targetType: "children",
      targetId: childId,
    });

    return { childId };
  },
});

/**
 * Replace the editable fields of one of the caller's own children. Omitted
 * optional fields are cleared (full-replace semantics on the editable set).
 */
export const updateChild = mutation({
  args: { childId: v.id("children"), ...childFields },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { childId, ...rest } = args;
    const input = childInputSchema.parse(rest);

    const child = await ctx.db.get(childId);
    if (!child) throw new Error("Child not found");
    if (child.parentUserId !== user._id) {
      throw new Error("Not your child record");
    }

    await ctx.db.patch(childId, {
      name: input.name,
      ageBracket: input.ageBracket,
      dateOfBirth: input.dateOfBirth,
      guardianContact: input.guardianContact,
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "child.updated",
      targetType: "children",
      targetId: childId,
    });

    return { ok: true };
  },
});

/** Remove one of the caller's own children. */
export const removeChild = mutation({
  args: { childId: v.id("children") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const child = await ctx.db.get(args.childId);
    if (!child) throw new Error("Child not found");
    if (child.parentUserId !== user._id) {
      throw new Error("Not your child record");
    }

    await ctx.db.delete(args.childId);

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "child.removed",
      targetType: "children",
      targetId: args.childId,
    });

    return { ok: true };
  },
});
