import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { parseYouTubeVideoId, pastEventInputSchema } from "@klt-cyber/shared";
import {
  getCurrentUser,
  getMediaAuthorityOrNull,
  logActivity,
  requireMediaAuthority,
} from "./lib/authz";

export const listPastEvents = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getMediaAuthorityOrNull(ctx))) return null;
    return await ctx.db
      .query("pastEvents")
      .withIndex("by_date")
      .order("desc")
      .collect();
  },
});

export const listPastEventsPublic = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const cap = Math.max(1, Math.min(limit ?? 20, 100));
    return await ctx.db
      .query("pastEvents")
      .withIndex("by_date")
      .order("desc")
      .take(cap);
  },
});

export const createPastEvent = mutation({
  args: {
    title: v.string(),
    date: v.string(),
    youtubeUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireMediaAuthority(ctx);

    const parsed = pastEventInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { title, date, youtubeUrl } = parsed.data;

    const videoId = parseYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error("Enter a link to a single YouTube video");
    }

    const now = Date.now();
    const pastEventId = await ctx.db.insert("pastEvents", {
      title,
      date,
      youtubeUrl,
      youtubeVideoId: videoId,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "pastEvent.create",
      targetType: "pastEvents",
      targetId: pastEventId,
      metadata: { title, date },
    });

    return pastEventId;
  },
});

export const updatePastEvent = mutation({
  args: {
    pastEventId: v.id("pastEvents"),
    title: v.string(),
    date: v.string(),
    youtubeUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireMediaAuthority(ctx);

    const parsed = pastEventInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { title, date, youtubeUrl } = parsed.data;

    const existing = await ctx.db.get(args.pastEventId);
    if (!existing) throw new Error("Past event not found");

    const videoId = parseYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error("Enter a link to a single YouTube video");
    }

    await ctx.db.patch(args.pastEventId, {
      title,
      date,
      youtubeUrl,
      youtubeVideoId: videoId,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "pastEvent.update",
      targetType: "pastEvents",
      targetId: args.pastEventId,
      metadata: { title, date },
    });
  },
});

export const deletePastEvent = mutation({
  args: { pastEventId: v.id("pastEvents") },
  handler: async (ctx, { pastEventId }) => {
    const actor = await requireMediaAuthority(ctx);

    const existing = await ctx.db.get(pastEventId);
    if (!existing) throw new Error("Past event not found");

    await ctx.db.delete(pastEventId);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "pastEvent.delete",
      targetType: "pastEvents",
      targetId: pastEventId,
      metadata: { title: existing.title, date: existing.date },
    });
  },
});
