import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";
import { DAY_MS } from "./calendar";
import { notificationCommon, scheduleReminderEntries } from "./lib/reminders";

// One-off events. `archiveEvent` sets active:false rather than hard-deleting, so
// a mistaken archive is reversible and history is preserved. See
// docs/DATA_MODEL.md, Increment 3 (table) and Increment 7 (reminder scheduling).

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
    return resolveCoverUrls(events);
  },
});

// ── Reminder scheduling (docs/DATA_MODEL.md, Increment 7) ───────────────────

type ReminderJobIds = {
  weekBeforeReminderJobId?: Id<"_scheduled_functions">;
  dayBeforeReminderJobId?: Id<"_scheduled_functions">;
};

/**
 * Schedules the week-before/day-before reminder pushes for an event and
 * returns the job ids to patch onto the row — only for whichever reminder's
 * computed time (`startDateTime - 7d` / `startDateTime - 1d`) is still in
 * the future. A reminder that's already past is silently skipped (its key
 * is simply absent from the result) rather than scheduling a notification
 * in the past. Shared by `createEvent` and `updateEvent` (on a relevant
 * edit) so the two can't drift. The two `runAt` calls are independent, so
 * they're issued concurrently rather than awaited one after another.
 */
async function scheduleEventReminders(
  ctx: MutationCtx,
  eventId: Id<"events">,
  event: { title: string; startDateTime: number; coverImageUrl?: string },
  actorId: Id<"users">
): Promise<ReminderJobIds> {
  const now = Date.now();
  const common = notificationCommon({
    audience: { type: "all" },
    deepLink: { type: "event", id: eventId },
    createdBy: actorId,
    imageUrl: event.coverImageUrl,
  });

  const weekBeforeTime = event.startDateTime - 7 * DAY_MS;
  const dayBeforeTime = event.startDateTime - DAY_MS;

  const [weekBeforeReminderJobId, dayBeforeReminderJobId] = await scheduleReminderEntries(
    ctx,
    [
      weekBeforeTime > now
        ? {
            at: weekBeforeTime,
            title: `One Week Away: ${event.title}`,
            body: `${event.title} is happening in one week.`,
          }
        : null,
      dayBeforeTime > now
        ? {
            at: dayBeforeTime,
            title: `Tomorrow: ${event.title}`,
            body: `${event.title} is happening tomorrow.`,
          }
        : null,
    ],
    common
  );

  const result: ReminderJobIds = {};
  if (weekBeforeReminderJobId !== undefined) {
    result.weekBeforeReminderJobId = weekBeforeReminderJobId;
  }
  if (dayBeforeReminderJobId !== undefined) {
    result.dayBeforeReminderJobId = dayBeforeReminderJobId;
  }
  return result;
}

/**
 * Cancels an event's currently-scheduled reminders, guarded per-field for a
 * reminder that was never scheduled (already past at create/update time) or
 * has already fired — cancelling an already-completed *mutation* job (which
 * `dispatch` is) is a safe no-op, verified directly against this deployment;
 * only scheduled *actions* throw on that per the Convex scheduler docs.
 * Called before rescheduling on a relevant edit, and unconditionally on
 * archive. Cancels run concurrently since they're independent.
 */
async function cancelEventReminders(ctx: MutationCtx, event: ReminderJobIds) {
  await Promise.all([
    event.weekBeforeReminderJobId
      ? ctx.scheduler.cancel(event.weekBeforeReminderJobId)
      : Promise.resolve(),
    event.dayBeforeReminderJobId
      ? ctx.scheduler.cancel(event.dayBeforeReminderJobId)
      : Promise.resolve(),
  ]);
}

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

    // Immediate "new event" push (Increment 7) — scheduled, not awaited
    // inline, same "the write is the source of truth, the notification is a
    // best-effort side effect" convention as announcements' publish push.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `New Event: ${args.title}`,
      body: args.description ?? `Join us for ${args.title}.`,
      ...notificationCommon({
        audience: { type: "all" },
        deepLink: { type: "event", id: eventId },
        createdBy: actor._id,
        imageUrl: args.coverImageUrl,
      }),
    });

    // No reminders to schedule for an event created inactive — mirrors
    // updateEvent/archiveEvent never leaving a scheduled reminder for an
    // inactive row.
    if (args.active ?? true) {
      const reminderJobIds = await scheduleEventReminders(
        ctx,
        eventId,
        {
          title: args.title,
          startDateTime: args.startDateTime,
          coverImageUrl: args.coverImageUrl,
        },
        actor._id
      );
      if (Object.keys(reminderJobIds).length > 0) {
        await ctx.db.patch(eventId, reminderJobIds);
      }
    }

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

    // Reminders need redoing whenever startDateTime *actually* moves — not
    // just whenever the field is present in the patch, since the admin form
    // resends the unchanged value on every save — or the active state
    // actually flips. Either way, cancel what's scheduled first; only
    // reschedule if the event is (still) active on exit — an inactive event
    // must never still push a reminder, the same guarantee archiveEvent
    // gives (Increment 7).
    const startDateTimeChanged =
      patch.startDateTime !== undefined &&
      patch.startDateTime !== existing.startDateTime;
    const activeChanged =
      patch.active !== undefined && patch.active !== existing.active;
    const nowActive = patch.active ?? existing.active;

    if (startDateTimeChanged || activeChanged) {
      await cancelEventReminders(ctx, existing);
      if (nowActive) {
        const reminderJobIds = await scheduleEventReminders(
          ctx,
          eventId,
          {
            title: patch.title ?? existing.title,
            startDateTime: start,
            coverImageUrl:
              patch.coverImageUrl !== undefined
                ? patch.coverImageUrl
                : existing.coverImageUrl,
          },
          actor._id
        );
        fields.weekBeforeReminderJobId = reminderJobIds.weekBeforeReminderJobId;
        fields.dayBeforeReminderJobId = reminderJobIds.dayBeforeReminderJobId;
      } else {
        // Explicitly clear — a stale (already-cancelled) job id must never
        // linger on the row.
        fields.weekBeforeReminderJobId = undefined;
        fields.dayBeforeReminderJobId = undefined;
      }
    }

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

    // An archived event should never still push a reminder (Increment 7) —
    // cancel the scheduled jobs and clear the row's references to them so
    // no stale (already-cancelled) id lingers if the event is reactivated
    // later without a startDateTime change.
    await cancelEventReminders(ctx, existing);

    await ctx.db.patch(eventId, {
      active: false,
      updatedAt: Date.now(),
      weekBeforeReminderJobId: undefined,
      dayBeforeReminderJobId: undefined,
    });
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
