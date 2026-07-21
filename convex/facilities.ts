import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canManageChurchAdmin, logActivity } from "./lib/authz";

// Tower of Faith facilities directory (docs/DATA_MODEL.md, Increment 4).

const facilityFields = {
  name: v.string(),
  tagline: v.optional(v.string()),
  description: v.optional(v.string()),
  servicesOffered: v.optional(v.array(v.string())),
  campusBlock: v.optional(v.string()),
  address: v.optional(v.string()),
  contactPerson: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
};

/** Public — active facilities, for the mobile Tower of Faith tab. */
export const listActiveFacilities = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("facilities")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

export const createFacility = mutation({
  args: facilityFields,
  handler: async (ctx, args) => {
    const actor = await canManageChurchAdmin(ctx);
    const now = Date.now();
    const facilityId = await ctx.db.insert("facilities", {
      ...args,
      active: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.created",
      targetType: "facilities",
      targetId: facilityId,
    });
    return { facilityId };
  },
});

const facilityPatchFields = {
  name: v.optional(v.string()),
  tagline: v.optional(v.string()),
  description: v.optional(v.string()),
  servicesOffered: v.optional(v.array(v.string())),
  campusBlock: v.optional(v.string()),
  address: v.optional(v.string()),
  contactPerson: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
};

export const updateFacility = mutation({
  args: { facilityId: v.id("facilities"), ...facilityPatchFields },
  handler: async (ctx, { facilityId, ...patch }) => {
    const actor = await canManageChurchAdmin(ctx);
    const existing = await ctx.db.get(facilityId);
    if (!existing) throw new Error("Facility not found");

    const fields: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) fields[key] = value;
    }

    await ctx.db.patch(facilityId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.updated",
      targetType: "facilities",
      targetId: facilityId,
    });
    return { ok: true as const };
  },
});

/** Archive a facility (soft delete — sets active: false, no hard delete). */
export const archiveFacility = mutation({
  args: { facilityId: v.id("facilities") },
  handler: async (ctx, { facilityId }) => {
    const actor = await canManageChurchAdmin(ctx);
    const existing = await ctx.db.get(facilityId);
    if (!existing) throw new Error("Facility not found");

    await ctx.db.patch(facilityId, { active: false, updatedAt: Date.now() });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.archived",
      targetType: "facilities",
      targetId: facilityId,
    });
    return { ok: true as const };
  },
});
