import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUser,
  getMediaAuthorityOrNull,
  logActivity,
  requireMediaAuthority,
} from "./lib/authz";

const MAX_RECENT_LIMIT = 60;
const DEFAULT_RECENT_LIMIT = 14;

export const listDevotionals = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getMediaAuthorityOrNull(ctx))) return null;
    return await ctx.db
      .query("devotionals")
      .withIndex("by_date")
      .order("desc")
      .collect();
  },
});

export const getToday = query({
  args: { dateKey: v.string() },
  handler: async (ctx, { dateKey }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("devotionals")
      .withIndex("by_date", (q) => q.eq("date", dateKey))
      .first();
  },
});

export const listRecent = query({
  args: {
    todayKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { todayKey, limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const cap = Math.max(1, Math.min(limit ?? DEFAULT_RECENT_LIMIT, MAX_RECENT_LIMIT));
    return await ctx.db
      .query("devotionals")
      .withIndex("by_date", (q) => q.lte("date", todayKey))
      .order("desc")
      .take(cap);
  },
});

export const createDevotional = mutation({
  args: {
    title: v.string(),
    scriptureReference: v.string(),
    body: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireMediaAuthority(ctx);

    const existing = await ctx.db
      .query("devotionals")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();
    if (existing) {
      throw new Error("A devotional already exists for this date");
    }

    const now = Date.now();
    const devotionalId = await ctx.db.insert("devotionals", {
      title: args.title,
      scriptureReference: args.scriptureReference,
      body: args.body,
      date: args.date,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "devotional.create",
      targetType: "devotionals",
      targetId: devotionalId,
      metadata: { title: args.title, date: args.date },
    });

    return devotionalId;
  },
});

export const updateDevotional = mutation({
  args: {
    devotionalId: v.id("devotionals"),
    title: v.string(),
    scriptureReference: v.string(),
    body: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireMediaAuthority(ctx);

    const existing = await ctx.db.get(args.devotionalId);
    if (!existing) throw new Error("Devotional not found");

    if (args.date !== existing.date) {
      const clash = await ctx.db
        .query("devotionals")
        .withIndex("by_date", (q) => q.eq("date", args.date))
        .first();
      if (clash && clash._id !== args.devotionalId) {
        throw new Error("A devotional already exists for this date");
      }
    }

    await ctx.db.patch(args.devotionalId, {
      title: args.title,
      scriptureReference: args.scriptureReference,
      body: args.body,
      date: args.date,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "devotional.update",
      targetType: "devotionals",
      targetId: args.devotionalId,
      metadata: { title: args.title, date: args.date },
    });
  },
});

export const deleteDevotional = mutation({
  args: { devotionalId: v.id("devotionals") },
  handler: async (ctx, { devotionalId }) => {
    const actor = await requireMediaAuthority(ctx);

    const existing = await ctx.db.get(devotionalId);
    if (!existing) throw new Error("Devotional not found");

    await ctx.db.delete(devotionalId);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "devotional.delete",
      targetType: "devotionals",
      targetId: devotionalId,
      metadata: { title: existing.title, date: existing.date },
    });
  },
});
