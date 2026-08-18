import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { DAY_MS, kampalaParts, occurrenceInstant, ymd } from "./calendar";

// Year Planner (docs/Admin_Portal.md). Internal planning records, never shown
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

    const [programs, eventsInRange, activitiesInRange] = await Promise.all([
      ctx.db
        .query("weeklyPrograms")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_startDateTime", (q) =>
          q.gte("startDateTime", startDate).lte("startDateTime", endDate)
        )
        .collect(),
      ctx.db
        .query("plannedActivities")
        .withIndex("by_targetDate", (q) =>
          q.gte("targetDate", startDate).lte("targetDate", endDate)
        )
        .collect(),
    ]);

    type PlannerItem =
      | {
          type: "program";
          date: string;
          start: number;
          occurrenceKey: string;
          programId: string;
          title: string;
          time: string;
          location?: string;
        }
      | {
          type: "event";
          date: string;
          start: number;
          eventId: string;
          title: string;
          location?: string;
        }
      | {
          type: "activity";
          date: string;
          start: number;
          activityId: string;
          title: string;
          description?: string;
          status: Doc<"plannedActivities">["status"];
          departmentIds: Doc<"plannedActivities">["departmentIds"];
        };

    const items: PlannerItem[] = [];

    // Walk each Kampala-local calendar day in the range, expanding active
    // programs onto matching weekdays — identical approach to
    // calendar.getCalendarRange, kept separate because this query also needs
    // to layer in plannedActivities (an admin-only table the public calendar
    // must never see).
    const firstDay = kampalaParts(startDate);
    let dayCursor =
      Date.UTC(firstDay.year, firstDay.month, firstDay.day) - 3 * 60 * 60 * 1000;
    for (; dayCursor <= endDate; dayCursor += DAY_MS) {
      const parts = kampalaParts(dayCursor);
      for (const program of programs) {
        if (program.dayOfWeek !== parts.dayOfWeek) continue;
        const instant = occurrenceInstant(
          parts.year,
          parts.month,
          parts.day,
          program.time
        );
        if (instant < startDate || instant > endDate) continue;
        const date = ymd(parts.year, parts.month, parts.day);
        items.push({
          type: "program",
          date,
          start: instant,
          occurrenceKey: `${program._id}_${date}`,
          programId: program._id,
          title: program.title,
          time: program.time,
          ...(program.location ? { location: program.location } : {}),
        });
      }
    }

    for (const event of eventsInRange) {
      if (!event.active) continue;
      const parts = kampalaParts(event.startDateTime);
      items.push({
        type: "event",
        date: ymd(parts.year, parts.month, parts.day),
        start: event.startDateTime,
        eventId: event._id,
        title: event.title,
        ...(event.location ? { location: event.location } : {}),
      });
    }

    for (const activity of activitiesInRange) {
      const parts = kampalaParts(activity.targetDate);
      items.push({
        type: "activity",
        date: ymd(parts.year, parts.month, parts.day),
        start: activity.targetDate,
        activityId: activity._id,
        title: activity.title,
        ...(activity.description ? { description: activity.description } : {}),
        status: activity.status,
        departmentIds: activity.departmentIds,
      });
    }

    items.sort((a, b) => a.start - b.start);
    return items;
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
