import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import {
  buildPlannerItems,
  listGroupActivitiesInRange,
} from "./lib/plannerRange";

// Year Planner. Internal planning records, never shown
// to members — distinct from the member-facing `weeklyPrograms`/`events`
// content in convex/calendar.ts. Reads and writes are gated the same way as
// weeklyPrograms/events/announcements: Administration HOD, delegate, or
// system_admin.

// ── Reads ────────────────────────────────────────────────────────────────────

/** Admin: every activity whose targetDate falls in [startDate, endDate]. */
export const listActivitiesInRange = query({
  args: { startDate: v.number(), endDate: v.number() },
  handler: async (ctx, { startDate, endDate }) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const activities = await ctx.db
      .query("plannedActivities")
      .withIndex("by_targetDate", (q) =>
        q.gte("targetDate", startDate).lte("targetDate", endDate)
      )
      .collect();
    return activities.sort((a, b) => a.targetDate - b.targetDate);
  },
});

/**
 * Admin: the merged Year Planner calendar for [startDate, endDate] — the same
 * program-occurrence expansion + event merge as `calendar.getCalendarRange`
 * (convex/calendar.ts), plus this department's planned activities layered in.
 * Unlike the public calendar, this includes inactive-nothing filtering beyond
 * what members already see, since the planner is for seeing the full picture,
 * not just what's live.
 */
export const getYearPlannerRange = query({
  args: { startDate: v.number(), endDate: v.number() },
  handler: async (ctx, { startDate, endDate }) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    if (endDate < startDate) {
      throw new Error("endDate must be on or after startDate");
    }

    const [items, groupActivities] = await Promise.all([
      buildPlannerItems(ctx, startDate, endDate),
      // Department and clan activities, shown read only (spec 0021, AC-21).
      listGroupActivitiesInRange(ctx, startDate, endDate),
    ]);
    return { items, groupActivities };
  },
});

// ── Mutations (content-admin only) ───────────────────────────────────────────

export const createActivity = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    targetDate: v.number(),
    departmentIds: v.array(v.id("departments")),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("done")
      )
    ),
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    if (args.departmentIds.length === 0) {
      throw new Error("At least one area of service must be responsible");
    }
    const now = Date.now();
    const activityId = await ctx.db.insert("plannedActivities", {
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      targetDate: args.targetDate,
      departmentIds: args.departmentIds,
      status: args.status ?? "planned",
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.activity_created",
      targetType: "plannedActivities",
      targetId: activityId,
      metadata: { title: args.title },
    });
    return { activityId };
  },
});

export const updateActivity = mutation({
  args: {
    activityId: v.id("plannedActivities"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    targetDate: v.optional(v.number()),
    departmentIds: v.optional(v.array(v.id("departments"))),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("done")
      )
    ),
  },
  handler: async (ctx, { activityId, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(activityId);
    if (!existing) throw new Error("Activity not found");
    if (patch.departmentIds !== undefined && patch.departmentIds.length === 0) {
      throw new Error("At least one area of service must be responsible");
    }

    const fields: Partial<Doc<"plannedActivities">> = { updatedAt: Date.now() };
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.targetDate !== undefined) fields.targetDate = patch.targetDate;
    if (patch.departmentIds !== undefined) fields.departmentIds = patch.departmentIds;
    if (patch.status !== undefined) fields.status = patch.status;

    await ctx.db.patch(activityId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.activity_updated",
      targetType: "plannedActivities",
      targetId: activityId,
    });
    return { ok: true as const };
  },
});

/**
 * Deletes a planned activity outright (spec 0021, AC-20). The planner asks for
 * confirmation first; the row is gone afterwards, so the audit entry carries
 * a snapshot of what was deleted.
 *
 * The snapshot records the row's real fields. The spec names `startDate` and
 * `endDate`, but a planned activity has one `targetDate`, so that is what is
 * kept.
 */
export const deleteActivity = mutation({
  args: { activityId: v.id("plannedActivities") },
  handler: async (ctx, { activityId }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(activityId);
    if (!existing) throw new Error("NOT_FOUND: Activity not found.");

    await ctx.db.delete(activityId);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.activity_deleted",
      targetType: "plannedActivities",
      targetId: activityId,
      metadata: {
        title: existing.title,
        targetDate: existing.targetDate,
        departmentIds: existing.departmentIds,
        status: existing.status,
      },
    });
    return null;
  },
});
