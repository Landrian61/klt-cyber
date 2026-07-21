import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canManageChurchAdmin, logActivity } from "./lib/authz";

// Church Admin-owned department list (docs/DATA_MODEL.md, Increment 4).
// Deliberately not seeded like the 12 fixed clans; Church Admin populates and
// maintains this list live.

/** Public — active departments, for the mobile department picker. */
export const listActiveDepartments = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("departments")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

export const createDepartment = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await canManageChurchAdmin(ctx);
    const now = Date.now();
    const departmentId = await ctx.db.insert("departments", {
      name: args.name,
      ...(args.description ? { description: args.description } : {}),
      active: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.created",
      targetType: "departments",
      targetId: departmentId,
    });
    return { departmentId };
  },
});

export const updateDepartment = mutation({
  args: {
    departmentId: v.id("departments"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { departmentId, ...patch }) => {
    const actor = await canManageChurchAdmin(ctx);
    const existing = await ctx.db.get(departmentId);
    if (!existing) throw new Error("Department not found");

    const fields: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.description !== undefined) fields.description = patch.description;

    await ctx.db.patch(departmentId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.updated",
      targetType: "departments",
      targetId: departmentId,
    });
    return { ok: true as const };
  },
});

export const toggleDepartmentActive = mutation({
  args: { departmentId: v.id("departments"), active: v.boolean() },
  handler: async (ctx, { departmentId, active }) => {
    const actor = await canManageChurchAdmin(ctx);
    const existing = await ctx.db.get(departmentId);
    if (!existing) throw new Error("Department not found");

    await ctx.db.patch(departmentId, { active, updatedAt: Date.now() });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: active ? "department.activated" : "department.deactivated",
      targetType: "departments",
      targetId: departmentId,
    });
    return { ok: true as const };
  },
});
