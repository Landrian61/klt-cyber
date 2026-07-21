import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { childInputSchema } from "@klt-cyber/shared";
import { logActivity, requireUser } from "./lib/authz";

// Children of members — data records, not user accounts. See
// docs/DATA_MODEL.md, Increment 4 — "children".

const sexValidator = v.union(v.literal("male"), v.literal("female"));

const childFields = {
  name: v.string(),
  dateOfBirth: v.optional(v.number()),
  sex: sexValidator,
};

/** Add a child record for the calling user. */
export const addChild = mutation({
  args: childFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const input = childInputSchema.parse(args);

    const now = Date.now();
    const childId = await ctx.db.insert("children", {
      parentUserId: user._id,
      name: input.name,
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth }
        : {}),
      sex: input.sex,
      createdAt: now,
      updatedAt: now,
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
      sex: input.sex,
      dateOfBirth: input.dateOfBirth,
      updatedAt: Date.now(),
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
