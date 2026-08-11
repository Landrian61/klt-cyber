import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";

// Weekly programs — recurring slots defined once and repeating until
// deactivated. The calendar expands these into virtual occurrences at query
// time (see convex/calendar.ts). See docs/DATA_MODEL.md, Increment 3.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Programs sort by weekday then start time, so the week reads top-to-bottom. */
function byDayThenTime(a: Doc<"weeklyPrograms">, b: Doc<"weeklyPrograms">) {
  return a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time);
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
    return programs.sort(byDayThenTime);
  },
});

// ── Mutations (content-admin only) ───────────────────────────────────────────

export const createProgram = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dayOfWeek: v.number(),
    time: v.string(),
    location: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    if (!Number.isInteger(args.dayOfWeek) || args.dayOfWeek < 0 || args.dayOfWeek > 6) {
      throw new Error("dayOfWeek must be an integer 0–6 (0 = Sunday)");
    }
    if (!HHMM.test(args.time)) {
      throw new Error("time must be 24h HH:mm, e.g. \"09:00\"");
    }
    const now = Date.now();
    const programId = await ctx.db.insert("weeklyPrograms", {
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      dayOfWeek: args.dayOfWeek,
      time: args.time,
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
      metadata: { title: args.title, dayOfWeek: args.dayOfWeek },
    });
    return { programId };
  },
});

export const updateProgram = mutation({
  args: {
    programId: v.id("weeklyPrograms"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dayOfWeek: v.optional(v.number()),
    time: v.optional(v.string()),
    location: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { programId, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(programId);
    if (!existing) throw new Error("Program not found");

    if (
      patch.dayOfWeek !== undefined &&
      (!Number.isInteger(patch.dayOfWeek) || patch.dayOfWeek < 0 || patch.dayOfWeek > 6)
    ) {
      throw new Error("dayOfWeek must be an integer 0–6 (0 = Sunday)");
    }
    if (patch.time !== undefined && !HHMM.test(patch.time)) {
      throw new Error("time must be 24h HH:mm, e.g. \"09:00\"");
    }

    const fields: Partial<Doc<"weeklyPrograms">> = { updatedAt: Date.now() };
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.dayOfWeek !== undefined) fields.dayOfWeek = patch.dayOfWeek;
    if (patch.time !== undefined) fields.time = patch.time;
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
