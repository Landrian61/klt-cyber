import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";

// One-off events. `archiveEvent` sets active:false rather than hard-deleting, so
// a mistaken archive is reversible and history is preserved. See
// docs/DATA_MODEL.md, Increment 3.

// ── Reads (open to any authenticated session) ────────────────────────────────

/** Upcoming active events (start >= now), soonest first, capped at `limit`. */
export const listUpcomingEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const events = await ctx.db
      .query("events")
      .withIndex("by_startDateTime", (q) => q.gte("startDateTime", now))
      .order("asc")
      .collect();
    const upcoming = events.filter((event) => event.active);
    return resolveCoverUrls(
      typeof limit === "number" ? upcoming.slice(0, limit) : upcoming
    );
  },
});

/** Upcoming active featured events (Home tab slider), soonest first. */
export const listFeaturedEvents = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const featured = await ctx.db
      .query("events")
      .withIndex("by_featured", (q) =>
        q.eq("featured", true).gte("startDateTime", now)
      )
      .order("asc")
      .collect();
    return resolveCoverUrls(featured.filter((event) => event.active));
  },
});

/** Admin: every event (past, inactive, all), soonest first. Gated. */
export const listAllEvents = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const events = await ctx.db
      .query("events")
      .withIndex("by_startDateTime")
      .order("desc")
      .collect();
    return events;
  },
});

// ── Mutations (content-admin only) ───────────────────────────────────────────

export const createEvent = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startDateTime: v.number(),
    endDateTime: v.number(),
    coverImageUrl: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    if (args.endDateTime < args.startDateTime) {
      throw new Error("endDateTime must be on or after startDateTime");
    }
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      ...(args.location ? { location: args.location } : {}),
      startDateTime: args.startDateTime,
      endDateTime: args.endDateTime,
      ...(args.coverImageUrl ? { coverImageUrl: args.coverImageUrl } : {}),
      featured: args.featured ?? false,
      active: args.active ?? true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.event_created",
      targetType: "events",
      targetId: eventId,
      metadata: { title: args.title, featured: args.featured ?? false },
    });
    return { eventId };
  },
});

export const updateEvent = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startDateTime: v.optional(v.number()),
    endDateTime: v.optional(v.number()),
    coverImageUrl: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { eventId, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(eventId);
    if (!existing) throw new Error("Event not found");

    const start = patch.startDateTime ?? existing.startDateTime;
    const end = patch.endDateTime ?? existing.endDateTime;
    if (end < start) {
      throw new Error("endDateTime must be on or after startDateTime");
    }

    const fields: Partial<Doc<"events">> = { updatedAt: Date.now() };
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.location !== undefined) fields.location = patch.location;
    if (patch.startDateTime !== undefined)
      fields.startDateTime = patch.startDateTime;
    if (patch.endDateTime !== undefined) fields.endDateTime = patch.endDateTime;
    if (patch.coverImageUrl !== undefined)
      fields.coverImageUrl = patch.coverImageUrl;
    if (patch.featured !== undefined) fields.featured = patch.featured;
    if (patch.active !== undefined) fields.active = patch.active;

    await ctx.db.patch(eventId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.event_updated",
      targetType: "events",
      targetId: eventId,
    });
    return { ok: true as const };
  },
});

/** Soft-archive: sets active:false. Does not hard-delete. */
export const archiveEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(eventId);
    if (!existing) throw new Error("Event not found");
    await ctx.db.patch(eventId, { active: false, updatedAt: Date.now() });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.event_archived",
      targetType: "events",
      targetId: eventId,
      metadata: { title: existing.title },
    });
    return { ok: true as const };
  },
});
