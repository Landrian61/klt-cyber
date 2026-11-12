import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  EVENT_CANCELLATION_REASON_MAX_LENGTH,
  EVENT_ERROR,
  formatKampalaDayHeading,
  formatKampalaTime,
  kampalaDateKeyAt,
  type NotificationKind,
} from "@klt-cyber/shared";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  getCurrentUser,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";
import { DAY_MS } from "./calendar";
import { notificationCommon } from "./lib/reminders";
import { getEligibleGroups } from "./lib/groupMembership";
import {
  audienceOf,
  eventAudienceValidator,
  isInEventAudience,
  pushRecipientIds,
  resolveEventPushAudience,
  sameEventAudience,
  validateEventAudience,
} from "./lib/eventAudience";
import type { NotificationAudience } from "./schema";

// One-off events. `archiveEvent` sets active:false rather than hard-deleting, so
// a mistaken archive is reversible and history is preserved. `cancelEvent`
// (spec 0021) is different and final: a cancelled event stays listed, marked,
// until it ends.

function eventError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

/**
 * A filter for the caller's event audience (spec 0021, AC-12), evaluated live
 * on every read. `null` when the session is not signed in.
 */
async function audienceFilterFor(
  ctx: QueryCtx
): Promise<((event: Doc<"events">) => boolean) | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const groups = await getEligibleGroups(ctx, user._id);
  return (event) => isInEventAudience(groups, audienceOf(event));
}

// ── Reads (any signed in session, filtered to the caller's audience) ─────────

/** Upcoming active events (start >= now) the caller is in the audience of, soonest first. */
export const listUpcomingEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const inAudience = await audienceFilterFor(ctx);
    if (!inAudience) return null;
    const now = Date.now();
    const events = await ctx.db
      .query("events")
      .withIndex("by_startDateTime", (q) => q.gte("startDateTime", now))
      .order("asc")
      .collect();
    const upcoming = events.filter((event) => event.active && inAudience(event));
    return resolveCoverUrls(
      typeof limit === "number" ? upcoming.slice(0, limit) : upcoming
    );
  },
});

/** Upcoming active featured events (Home tab slider) the caller is in the audience of. */
export const listFeaturedEvents = query({
  args: {},
  handler: async (ctx) => {
    const inAudience = await audienceFilterFor(ctx);
    if (!inAudience) return null;
    const now = Date.now();
    const featured = await ctx.db
      .query("events")
      .withIndex("by_featured", (q) =>
        q.eq("featured", true).gte("startDateTime", now)
      )
      .order("asc")
      .collect();
    return resolveCoverUrls(
      featured.filter((event) => event.active && inAudience(event))
    );
  },
});

/**
 * One event, for the shared detail screen and the `event` deep link (spec 0010,
 * AC-7).
 *
 * Returns `null` for an archived event, for a session that is not signed in,
 * and for a caller outside the event's audience (spec 0021, AC-12), with no
 * distinct error, so a deep link reveals nothing about an event's existence.
 * A past event that was not cancelled still opens for its audience.
 */
export const getEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const inAudience = await audienceFilterFor(ctx);
    if (!inAudience) return null;

    const event = await ctx.db.get(eventId);
    // Archived, not cancelled: an archived event is a mistake being undone and
    // disappears, while a cancelled one is still a real event on a real date
    // and keeps showing, marked.
    if (!event || !event.active || !inAudience(event)) return null;

    const [resolved] = await resolveCoverUrls([event]);
    return {
      ...resolved,
      tag: "Church",
      cancelled: event.cancelledAt !== undefined,
    };
  },
});

/** Admin: every event (past, inactive, cancelled, every audience), newest first. Gated. */
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
    const resolved = await resolveCoverUrls(events);
    return resolved.map((event) => ({
      ...event,
      audience: audienceOf(event),
    }));
  },
});

// ── Notifications ───────────────────────────────────────────────────────────

/**
 * Schedules one event push now. Sends nothing when the resolved audience is
 * empty (spec 0021, AC-13).
 */
async function sendEventPush(
  ctx: MutationCtx,
  event: { _id: Id<"events">; coverImageUrl?: string },
  audience: NotificationAudience | null,
  message: { title: string; body: string; kind: NotificationKind },
  actorId: Id<"users">
) {
  if (!audience) return;
  if (audience.type === "users" && audience.userIds.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: message.title,
    body: message.body,
    ...notificationCommon({
      audience,
      deepLink: { type: "event", id: event._id },
      createdBy: actorId,
      imageUrl: event.coverImageUrl,
      kind: message.kind,
    }),
  });
}

/** "Friday 13 Nov at 6:00 PM", in church time. */
function churchWhen(instant: number): string {
  return `${formatKampalaDayHeading(kampalaDateKeyAt(instant))} at ${formatKampalaTime(instant)}`;
}

/**
 * The N17 text for a relevant change. It always states the event as it now
 * stands (start, end time and place), so a change to only the end time or
 * the location still reads true rather than implying the start moved.
 */
function changeMessage(event: {
  title: string;
  startDateTime: number;
  endDateTime: number;
  location?: string;
}) {
  const where = event.location ? ` at ${event.location}` : "";
  return {
    title: `Updated: ${event.title}`,
    body: `${event.title} is now ${churchWhen(event.startDateTime)} to ${formatKampalaTime(event.endDateTime)}${where}.`,
    kind: "N17" as const,
  };
}

// ── Reminder scheduling ───────────────────────────────────────────────────

type ReminderJobIds = {
  weekBeforeReminderJobId?: Id<"_scheduled_functions">;
  dayBeforeReminderJobId?: Id<"_scheduled_functions">;
};

/**
 * Schedules the week before and day before reminders (N18) as
 * `deliverEventReminder` jobs, which resolve the audience when they fire
 * (spec 0021, AC-14). A reminder whose time is already past is skipped.
 */
async function scheduleEventReminders(
  ctx: MutationCtx,
  eventId: Id<"events">,
  startDateTime: number
): Promise<ReminderJobIds> {
  const now = Date.now();
  const weekBeforeTime = startDateTime - 7 * DAY_MS;
  const dayBeforeTime = startDateTime - DAY_MS;

  const [weekBeforeReminderJobId, dayBeforeReminderJobId] = await Promise.all([
    weekBeforeTime > now
      ? ctx.scheduler.runAt(weekBeforeTime, internal.events.deliverEventReminder, {
          eventId,
          expectedStart: startDateTime,
          which: "week" as const,
        })
      : Promise.resolve(undefined),
    dayBeforeTime > now
      ? ctx.scheduler.runAt(dayBeforeTime, internal.events.deliverEventReminder, {
          eventId,
          expectedStart: startDateTime,
          which: "day" as const,
        })
      : Promise.resolve(undefined),
  ]);

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
 * Cancels an event's currently scheduled reminders, guarded per field for a
 * reminder that was never scheduled or has already fired (cancelling a
 * completed mutation job is a safe no op).
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

/**
 * One N18 reminder, delivered at fire time (spec 0021, AC-14). It re reads the
 * event and resolves the audience now, so someone who joined a department
 * after the event was created is reminded, and it sends nothing for an event
 * that is gone, archived, cancelled or moved (invariant 6).
 */
export const deliverEventReminder = internalMutation({
  args: {
    eventId: v.id("events"),
    expectedStart: v.number(),
    which: v.union(v.literal("week"), v.literal("day")),
  },
  handler: async (ctx, { eventId, expectedStart, which }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return { delivered: false, reason: "missing" };
    if (!event.active) return { delivered: false, reason: "archived" };
    if (event.cancelledAt !== undefined) {
      return { delivered: false, reason: "cancelled" };
    }
    if (event.startDateTime !== expectedStart) {
      return { delivered: false, reason: "moved" };
    }

    const audience = await resolveEventPushAudience(ctx, audienceOf(event));
    if (!audience) return { delivered: false, reason: "empty_audience" };

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title:
        which === "week"
          ? `One Week Away: ${event.title}`
          : `Tomorrow: ${event.title}`,
      body:
        which === "week"
          ? `${event.title} is happening in one week.`
          : `${event.title} is happening tomorrow.`,
      ...notificationCommon({
        audience,
        deepLink: { type: "event", id: eventId },
        createdBy: event.createdBy,
        imageUrl: event.coverImageUrl,
        kind: "N18",
      }),
    });
    return { delivered: true };
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
    audience: eventAudienceValidator,
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    if (args.endDateTime < args.startDateTime) {
      throw new Error("endDateTime must be on or after startDateTime");
    }
    await validateEventAudience(ctx, args.audience);

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
      audience: args.audience,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.event_created",
      targetType: "events",
      targetId: eventId,
      metadata: {
        title: args.title,
        featured: args.featured ?? false,
        audience: args.audience.type,
      },
    });

    // Immediate N16 push to the audience only (spec 0021, AC-13) — scheduled,
    // not awaited inline: the write is the source of truth, the notification
    // is a best effort side effect.
    await sendEventPush(
      ctx,
      { _id: eventId, coverImageUrl: args.coverImageUrl },
      await resolveEventPushAudience(ctx, args.audience),
      {
        title: `New Event: ${args.title}`,
        body: args.description ?? `Join us for ${args.title}.`,
        kind: "N16",
      },
      actor._id
    );

    // No reminders for an event created inactive.
    if (args.active ?? true) {
      const reminderJobIds = await scheduleEventReminders(
        ctx,
        eventId,
        args.startDateTime
      );
      if (Object.keys(reminderJobIds).length > 0) {
        await ctx.db.patch(eventId, reminderJobIds);
      }
    }

    return { eventId };
  },
});

/** "" and a missing value are the same location: the form sends "" for none. */
function sameLocation(a: string | undefined, b: string | undefined): boolean {
  return (a || undefined) === (b || undefined);
}

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
    audience: eventAudienceValidator,
  },
  handler: async (ctx, { eventId, audience, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(eventId);
    if (!existing) throw eventError(EVENT_ERROR.NOT_FOUND, "Event not found.");
    // Cancel is final (spec 0021, AC-18).
    if (existing.cancelledAt !== undefined) {
      throw eventError(
        EVENT_ERROR.EVENT_CANCELLED_LOCKED,
        "A cancelled event can no longer be edited."
      );
    }

    const start = patch.startDateTime ?? existing.startDateTime;
    const end = patch.endDateTime ?? existing.endDateTime;
    if (end < start) {
      throw new Error("endDateTime must be on or after startDateTime");
    }
    // Validated only when it changes. A department paused after the event
    // was created keeps its events (invariant 3), so an unchanged audience
    // naming it must not lock every other edit.
    const oldAudience = audienceOf(existing);
    const audienceChanged = !sameEventAudience(oldAudience, audience);
    if (audienceChanged) await validateEventAudience(ctx, audience);

    const fields: Partial<Doc<"events">> = { updatedAt: Date.now(), audience };
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

    // Compared on the server, because the form resends unchanged fields.
    const startChanged = start !== existing.startDateTime;
    const endChanged = end !== existing.endDateTime;
    const locationChanged =
      patch.location !== undefined &&
      !sameLocation(patch.location, existing.location);
    const relevantChange = startChanged || endChanged || locationChanged;

    const activeChanged =
      patch.active !== undefined && patch.active !== existing.active;
    const nowActive = patch.active ?? existing.active;

    // Any audience, start or active change replaces both reminder jobs, so no
    // legacy `dispatch` job addressed to `all` survives an audience change
    // (spec 0021, AC-14).
    if (startChanged || activeChanged || audienceChanged) {
      await cancelEventReminders(ctx, existing);
      if (nowActive) {
        const reminderJobIds = await scheduleEventReminders(ctx, eventId, start);
        fields.weekBeforeReminderJobId = reminderJobIds.weekBeforeReminderJobId;
        fields.dayBeforeReminderJobId = reminderJobIds.dayBeforeReminderJobId;
      } else {
        fields.weekBeforeReminderJobId = undefined;
        fields.dayBeforeReminderJobId = undefined;
      }
    }

    // The event as it reads after this edit, for the push copy.
    const updated = {
      _id: eventId,
      title: patch.title ?? existing.title,
      startDateTime: start,
      endDateTime: end,
      location:
        patch.location !== undefined ? patch.location || undefined : existing.location,
      coverImageUrl:
        patch.coverImageUrl !== undefined
          ? patch.coverImageUrl
          : existing.coverImageUrl,
    };

    await ctx.db.patch(eventId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.event_updated",
      targetType: "events",
      targetId: eventId,
      metadata: audienceChanged
        ? { audienceFrom: oldAudience.type, audienceTo: audience.type }
        : undefined,
    });

    // N16 and N17 only while the event is active (and, from the guard above,
    // not cancelled) — spec 0021, AC-15.
    // An event that has ended is a record being tidied, not news: nobody is
    // told it changed, or that it now concerns them.
    if (!nowActive || end <= Date.now()) return { ok: true as const };

    if (!audienceChanged) {
      if (relevantChange) {
        await sendEventPush(
          ctx,
          updated,
          await resolveEventPushAudience(ctx, audience),
          changeMessage(updated),
          actor._id
        );
      }
      return { ok: true as const };
    }

    // Audience changed: newcomers get N16, people removed get nothing, people
    // in both get N17 only on a relevant change.
    const [oldIds, newIds] = await Promise.all([
      pushRecipientIds(ctx, oldAudience),
      pushRecipientIds(ctx, audience),
    ]);
    const before = new Set(oldIds);
    const newcomers = newIds.filter((id) => !before.has(id));
    const remaining = newIds.filter((id) => before.has(id));

    await sendEventPush(
      ctx,
      updated,
      { type: "users", userIds: newcomers },
      {
        title: `New Event: ${updated.title}`,
        body:
          (patch.description ?? existing.description) ||
          `Join us for ${updated.title}.`,
        kind: "N16",
      },
      actor._id
    );
    if (relevantChange) {
      await sendEventPush(
        ctx,
        updated,
        { type: "users", userIds: remaining },
        changeMessage(updated),
        actor._id
      );
    }
    return { ok: true as const };
  },
});

/**
 * Calls an event off (spec 0021, AC-17, AC-18). Final: the event stays listed,
 * marked "Cancelled" with its reason, until it ends, and nothing clears
 * `cancelledAt` (invariant 1).
 */
export const cancelEvent = mutation({
  args: { eventId: v.id("events"), reason: v.optional(v.string()) },
  handler: async (ctx, { eventId, reason }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(eventId);
    if (!existing) throw eventError(EVENT_ERROR.NOT_FOUND, "Event not found.");
    if (existing.cancelledAt !== undefined) {
      throw eventError(
        EVENT_ERROR.EVENT_ALREADY_CANCELLED,
        "This event is already cancelled."
      );
    }
    const now = Date.now();
    if (existing.endDateTime <= now) {
      throw eventError(
        EVENT_ERROR.EVENT_ALREADY_ENDED,
        "This event has already ended."
      );
    }
    if (!existing.active) {
      throw eventError(
        EVENT_ERROR.EVENT_ARCHIVED,
        "An archived event cannot be cancelled."
      );
    }

    const trimmed = reason?.trim() || undefined;
    if (trimmed && trimmed.length > EVENT_CANCELLATION_REASON_MAX_LENGTH) {
      throw new Error(
        `A reason can be at most ${EVENT_CANCELLATION_REASON_MAX_LENGTH} characters.`
      );
    }

    await cancelEventReminders(ctx, existing);
    await ctx.db.patch(eventId, {
      cancelledAt: now,
      cancelledBy: actor._id,
      ...(trimmed ? { cancellationReason: trimmed } : {}),
      updatedAt: now,
      weekBeforeReminderJobId: undefined,
      dayBeforeReminderJobId: undefined,
    });

    await sendEventPush(
      ctx,
      existing,
      await resolveEventPushAudience(ctx, audienceOf(existing)),
      {
        title: `Cancelled: ${existing.title}`,
        body:
          trimmed ??
          `${existing.title} on ${formatKampalaDayHeading(
            kampalaDateKeyAt(existing.startDateTime)
          )} will no longer take place.`,
        kind: "N17",
      },
      actor._id
    );

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.event_cancelled",
      targetType: "events",
      targetId: eventId,
      metadata: {
        title: existing.title,
        ...(trimmed ? { reason: trimmed } : {}),
      },
    });
    return null;
  },
});

/** Soft-archive: sets active:false. Does not hard-delete. Works on a cancelled event too. */
export const archiveEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(eventId);
    if (!existing) throw eventError(EVENT_ERROR.NOT_FOUND, "Event not found.");

    // An archived event should never still push a reminder.
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

