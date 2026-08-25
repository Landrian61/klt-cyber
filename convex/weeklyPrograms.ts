import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { RecurrenceType, WeekOfMonth } from "@klt-cyber/shared";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";
import { kampalaParts } from "./calendar";

// Weekly programs — recurring (or one-off) slots defined once. The calendar
// expands these into virtual occurrences at query time (see
// convex/calendar.ts, convex/plannedActivities.ts, convex/lib/recurrence.ts).
// See docs/DATA_MODEL.md, Increment 3.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Mirrors @klt-cyber/shared's RECURRENCE_TYPES/WEEK_OF_MONTH_POSITIONS —
// Convex validators need literal `v.literal(...)` calls, not a derived
// union, so the values are duplicated here; RecurrenceType/WeekOfMonth
// (imported above) keep the two in sync at the type level.
const recurrenceValidator = v.union(
  v.literal("once"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly")
);
const weekOfMonthValidator = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(-1)
);

/** Programs sort by their earliest weekday then start time, so the week reads
 * top-to-bottom. Falls back to the legacy single dayOfWeek/time for
 * not-yet-migrated rows. */
function byDayThenTime(a: Doc<"weeklyPrograms">, b: Doc<"weeklyPrograms">) {
  const aDay = a.daysOfWeek?.[0] ?? a.dayOfWeek ?? 0;
  const bDay = b.daysOfWeek?.[0] ?? b.dayOfWeek ?? 0;
  const aTime = a.startTime ?? a.time ?? "";
  const bTime = b.startTime ?? b.time ?? "";
  return aDay - bDay || aTime.localeCompare(bTime);
}

/**
 * Validates the recurrence-related fields together — shared by createProgram
 * and updateProgram (called with the fully-resolved values, i.e. existing +
 * patch merged, so an update can't leave the row in an inconsistent state).
 */
function validateRecurrenceFields(args: {
  recurrence: RecurrenceType;
  daysOfWeek: number[];
  weekOfMonth?: WeekOfMonth;
  startDate: number;
  endDate?: number;
  startTime: string;
  endTime?: string;
}) {
  if (args.daysOfWeek.length === 0) {
    throw new Error("At least one day of the week is required");
  }
  const uniqueDays = new Set(args.daysOfWeek);
  if (uniqueDays.size !== args.daysOfWeek.length) {
    throw new Error("daysOfWeek must not contain duplicates");
  }
  for (const day of args.daysOfWeek) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error("Each day of week must be an integer 0–6 (0 = Sunday)");
    }
  }

  if (args.recurrence === "monthly") {
    if (args.daysOfWeek.length !== 1) {
      throw new Error("A monthly program needs exactly one day of the week");
    }
    if (args.weekOfMonth === undefined) {
      throw new Error("A monthly program needs a week-of-month position");
    }
  }

  if (args.recurrence === "once") {
    if (args.daysOfWeek.length !== 1) {
      throw new Error("A one-time program needs exactly one day of the week");
    }
    if (args.endDate !== undefined) {
      throw new Error("A one-time program can't have an end date");
    }
    const actualDay = kampalaParts(args.startDate).dayOfWeek;
    if (args.daysOfWeek[0] !== actualDay) {
      throw new Error("daysOfWeek must match the weekday of startDate for a one-time program");
    }
  }

  if (!HHMM.test(args.startTime)) {
    throw new Error("startTime must be 24h HH:mm, e.g. \"09:00\"");
  }
  if (args.endTime !== undefined) {
    if (!HHMM.test(args.endTime)) {
      throw new Error("endTime must be 24h HH:mm, e.g. \"11:00\"");
    }
    if (args.endTime <= args.startTime) {
      throw new Error("endTime must be after startTime");
    }
  }
  if (args.endDate !== undefined && args.endDate < args.startDate) {
    throw new Error("endDate must be on or after startDate");
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Open: active programs, ordered by weekday then time. */
export const listActivePrograms = query({
  args: {},
  handler: async (ctx) => {
    const programs = await ctx.db
      .query("weeklyPrograms")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return resolveCoverUrls(programs.sort(byDayThenTime));
  },
});

/** Admin: every program, active or not. Gated by canManageContent. */
export const listAllPrograms = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const programs = await ctx.db.query("weeklyPrograms").collect();
    return resolveCoverUrls(programs.sort(byDayThenTime));
  },
});

// ── Mutations (content-admin only) ───────────────────────────────────────────

export const createProgram = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    recurrence: recurrenceValidator,
    daysOfWeek: v.array(v.number()),
    weekOfMonth: v.optional(weekOfMonthValidator),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    startTime: v.string(),
    endTime: v.optional(v.string()),
    location: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    validateRecurrenceFields(args);

    const now = Date.now();
    const programId = await ctx.db.insert("weeklyPrograms", {
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      recurrence: args.recurrence,
      daysOfWeek: args.daysOfWeek,
      ...(args.weekOfMonth !== undefined ? { weekOfMonth: args.weekOfMonth } : {}),
      startDate: args.startDate,
      ...(args.endDate !== undefined ? { endDate: args.endDate } : {}),
      startTime: args.startTime,
      ...(args.endTime ? { endTime: args.endTime } : {}),
      ...(args.location ? { location: args.location } : {}),
      ...(args.coverImageUrl ? { coverImageUrl: args.coverImageUrl } : {}),
      active: args.active ?? true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.program_created",
      targetType: "weeklyPrograms",
      targetId: programId,
      metadata: { title: args.title, recurrence: args.recurrence },
    });
    return { programId };
  },
});

export const updateProgram = mutation({
  args: {
    programId: v.id("weeklyPrograms"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    recurrence: v.optional(recurrenceValidator),
    daysOfWeek: v.optional(v.array(v.number())),
    weekOfMonth: v.optional(weekOfMonthValidator),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    location: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { programId, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(programId);
    if (!existing) throw new Error("Program not found");

    // Validate against the fully-resolved (existing + patch) state so a
    // partial edit can't leave the row internally inconsistent (e.g.
    // changing recurrence to "monthly" without also setting weekOfMonth).
    const resolvedRecurrence = patch.recurrence ?? existing.recurrence;
    const resolvedDaysOfWeek =
      patch.daysOfWeek ??
      existing.daysOfWeek ??
      (existing.dayOfWeek !== undefined ? [existing.dayOfWeek] : []);
    const resolvedStartDate = patch.startDate ?? existing.startDate;
    const resolvedStartTime = patch.startTime ?? existing.startTime ?? existing.time;
    if (!resolvedRecurrence || resolvedStartDate === undefined || !resolvedStartTime) {
      throw new Error(
        "This program predates the recurrence model — set recurrence, startDate, and startTime together before making other changes"
      );
    }
    validateRecurrenceFields({
      recurrence: resolvedRecurrence,
      daysOfWeek: resolvedDaysOfWeek,
      weekOfMonth: patch.weekOfMonth ?? existing.weekOfMonth,
      startDate: resolvedStartDate,
      endDate: patch.endDate ?? existing.endDate,
      startTime: resolvedStartTime,
      endTime: patch.endTime ?? existing.endTime,
    });

    const fields: Partial<Doc<"weeklyPrograms">> = { updatedAt: Date.now() };
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.recurrence !== undefined) fields.recurrence = patch.recurrence;
    if (patch.daysOfWeek !== undefined) fields.daysOfWeek = patch.daysOfWeek;
    if (patch.weekOfMonth !== undefined) fields.weekOfMonth = patch.weekOfMonth;
    if (patch.startDate !== undefined) fields.startDate = patch.startDate;
    if (patch.endDate !== undefined) fields.endDate = patch.endDate;
    if (patch.startTime !== undefined) fields.startTime = patch.startTime;
    if (patch.endTime !== undefined) fields.endTime = patch.endTime;
    if (patch.location !== undefined) fields.location = patch.location;
    if (patch.coverImageUrl !== undefined)
      fields.coverImageUrl = patch.coverImageUrl;
    if (patch.active !== undefined) fields.active = patch.active;

    await ctx.db.patch(programId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.program_updated",
      targetType: "weeklyPrograms",
      targetId: programId,
    });
    return { ok: true as const };
  },
});

/** Flip a program on/off. active is set explicitly to keep the intent auditable. */
export const toggleProgramActive = mutation({
  args: { programId: v.id("weeklyPrograms"), active: v.boolean() },
  handler: async (ctx, { programId, active }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(programId);
    if (!existing) throw new Error("Program not found");
    await ctx.db.patch(programId, { active, updatedAt: Date.now() });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: active ? "content.program_activated" : "content.program_deactivated",
      targetType: "weeklyPrograms",
      targetId: programId,
    });
    return { ok: true as const, active };
  },
});
