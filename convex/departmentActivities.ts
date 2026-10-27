import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_LOCATION_MAX_LENGTH,
  ACTIVITY_TITLE_MAX_LENGTH,
  CANCELLATION_REASON_MAX_LENGTH,
} from "@klt-cyber/shared";
import {
  getAdministrationAuthorityOrNull,
  getCurrentUser,
  logActivity,
  requireDepartmentCapability,
  resolveDepartmentShellRole,
} from "./lib/authz";
import { notificationCommon } from "./lib/reminders";
import { resolveMediaUrl } from "./lib/media";
import {
  DAY_MS,
  KAMPALA_OFFSET_MS,
  kampalaParts,
  occurrenceInstant,
  ymd,
} from "./calendar";

/**
 * A department's own dated activities: the authoring side of the contract
 * spec 0010 built the member-facing reads against (spec 0012, S4-01 to S4-04).
 *
 * Writes `groupActivities` rows owned by one department, so the moment an HOD
 * schedules something it appears in that department's members' merged upcoming
 * list and "My groups" on their phones, with no mobile change at all.
 */

/**
 * The instant a wall-clock date and time in Kampala actually falls on (AC-22).
 *
 * The portal sends what the HOD typed — "2026-11-03", "18:00" — and this reads
 * it as church local time, which is fixed UTC+3 with no DST. An HOD travelling,
 * or a browser left on another timezone, therefore cannot shift a service by
 * three hours: the typed time means the same instant whoever types it.
 */
function churchLocalInstant(date: string, time: string): number {
  const [year, month, day] = date.split("-").map((n) => Number.parseInt(n, 10));
  if (!year || !month || !day) {
    throw new Error("A date is needed, as YYYY-MM-DD");
  }
  return occurrenceInstant(year, month - 1, day, time);
}

/**
 * The start and end instants for one typed date and a pair of wall-clock times.
 *
 * An end time at or before the start time means the activity runs past
 * midnight, so the end rolls to the next day: a 22:00 vigil ending 01:00 is an
 * ordinary thing for a church to hold, and the form only asks for one date.
 * Without this, entering it is impossible — the end would land three hours
 * before the start and the mutation would refuse it with no way for the HOD to
 * express what they meant.
 *
 * Equal times are treated as crossing rather than as a zero-length activity,
 * since nobody schedules something that takes no time, and 18:00 to 18:00 far
 * more likely means a full day.
 */
function churchLocalRange(date: string, startTime: string, endTime: string) {
  const startDateTime = churchLocalInstant(date, startTime);
  let endDateTime = churchLocalInstant(date, endTime);
  if (endDateTime <= startDateTime) endDateTime += DAY_MS;
  return { startDateTime, endDateTime };
}

/** The Kampala-local date an instant falls on, as "YYYY-MM-DD". */
function churchLocalDate(ts: number): string {
  const parts = kampalaParts(ts);
  return ymd(parts.year, parts.month, parts.day);
}

/** The Kampala-local wall-clock time of an instant, as "HH:MM". */
function churchLocalTime(ts: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(ts + KAMPALA_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function requireWithin(value: string | undefined, cap: number, what: string) {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length > cap) {
    throw new Error(`The ${what} can be at most ${cap} characters`);
  }
  return trimmed ? trimmed : undefined;
}

/**
 * Schedule the one reminder tier spec 0012 decided on: about 24 hours before the
 * start (N23).
 *
 * The job calls `deliverDayBeforeReminder` below rather than `dispatch`
 * directly, which is what makes a stale job harmless: the activity is re-read at
 * fire time and a reminder for one that has moved, been cancelled or been
 * deleted delivers nothing. Returns undefined when the start is already less
 * than a day away, in which case there is no reminder to schedule rather than
 * one to send in the past.
 */
async function scheduleDayBeforeReminder(
  ctx: MutationCtx,
  activityId: Id<"groupActivities">,
  startDateTime: number
): Promise<Id<"_scheduled_functions"> | undefined> {
  const at = startDateTime - DAY_MS;
  if (at <= Date.now()) return undefined;
  return await ctx.scheduler.runAt(
    at,
    internal.departmentActivities.deliverDayBeforeReminder,
    { activityId, expectedStart: startDateTime }
  );
}

/** Stop a scheduled reminder, if there is one. Cancelling a finished job is safe. */
async function cancelDayBeforeReminder(
  ctx: MutationCtx,
  activity: Doc<"groupActivities">
) {
  if (activity.dayBeforeReminderJobId) {
    await ctx.scheduler.cancel(activity.dayBeforeReminderJobId);
  }
}

/**
 * The day-before reminder, re-checked at fire time (AC-24).
 *
 * Three guards, and each closes a real gap: the activity may have been deleted,
 * it may have been cancelled after the job was queued, and its start may have
 * moved — in which case a job queued against the old start is stale and the new
 * start has a job of its own. Checking here rather than at schedule time makes
 * the guarantee unconditional: no sequence of edits and scheduler timing can
 * deliver a reminder for something that is not happening.
 *
 * The audience resolves inside `dispatch`, at this moment, so a member added to
 * the roster after the activity was scheduled is included.
 */
export const deliverDayBeforeReminder = internalMutation({
  args: {
    activityId: v.id("groupActivities"),
    expectedStart: v.number(),
  },
  handler: async (ctx, { activityId, expectedStart }) => {
    const activity = await ctx.db.get(activityId);
    if (!activity) return { delivered: false as const, reason: "gone" };
    if (activity.cancelledAt !== undefined) {
      return { delivered: false as const, reason: "cancelled" };
    }
    if (activity.startDateTime !== expectedStart) {
      return { delivered: false as const, reason: "rescheduled" };
    }
    if (activity.owner.type !== "department") {
      return { delivered: false as const, reason: "not_a_department" };
    }

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `Tomorrow: ${activity.title}`,
      body: activity.location
        ? `${activity.title} is tomorrow, at ${activity.location}.`
        : `${activity.title} is tomorrow.`,
      ...notificationCommon({
        audience: { type: "department", departmentId: activity.owner.departmentId },
        deepLink: { type: "activity", id: activityId },
        createdBy: activity.createdBy,
        imageUrl: activity.coverImageUrl,
      }),
    });

    return { delivered: true as const };
  },
});

/**
 * Tell the department's verified roster that something has changed (N22).
 *
 * Deliberately not called for every edit. AC-23 draws the line at what a member
 * has to act on: the date, the time, the place, or the whole thing being called
 * off. Fixing a typo in the title or swapping the picture notifies nobody,
 * because a push that says nothing new teaches people to ignore pushes.
 */
async function notifyRoster(
  ctx: MutationCtx,
  activity: { _id: Id<"groupActivities">; title: string; coverImageUrl?: string },
  departmentId: Id<"departments">,
  actorId: Id<"users">,
  title: string,
  body: string
) {
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title,
    body,
    ...notificationCommon({
      audience: { type: "department", departmentId },
      deepLink: { type: "activity", id: activity._id },
      createdBy: actorId,
      imageUrl: activity.coverImageUrl,
    }),
  });
}

export const createActivity = mutation({
  args: {
    departmentId: v.id("departments"),
    title: v.string(),
    date: v.string(), // YYYY-MM-DD, read as Kampala local
    startTime: v.string(), // HH:MM, read as Kampala local
    endTime: v.string(), // HH:MM, read as Kampala local
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    imageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireDepartmentCapability(
      ctx,
      args.departmentId,
      "createActivity"
    );

    const title = args.title.trim();
    if (title === "") throw new Error("An activity needs a title");
    if (title.length > ACTIVITY_TITLE_MAX_LENGTH) {
      throw new Error(
        `A title can be at most ${ACTIVITY_TITLE_MAX_LENGTH} characters`
      );
    }
    const location = requireWithin(
      args.location,
      ACTIVITY_LOCATION_MAX_LENGTH,
      "location"
    );
    const description = requireWithin(
      args.description,
      ACTIVITY_DESCRIPTION_MAX_LENGTH,
      "description"
    );

    const { startDateTime, endDateTime } = churchLocalRange(
      args.date,
      args.startTime,
      args.endTime
    );

    const now = Date.now();
    const activityId = await ctx.db.insert("groupActivities", {
      title,
      ...(description ? { description } : {}),
      startDateTime,
      endDateTime,
      ...(location ? { location } : {}),
      ...(args.imageKey ? { coverImageUrl: args.imageKey } : {}),
      owner: { type: "department", departmentId: args.departmentId },
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    const jobId = await scheduleDayBeforeReminder(ctx, activityId, startDateTime);
    if (jobId) await ctx.db.patch(activityId, { dayBeforeReminderJobId: jobId });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.activity_created",
      targetType: "groupActivities",
      targetId: activityId,
      departmentId: args.departmentId,
      metadata: { title, startDateTime },
    });

    await notifyRoster(
      ctx,
      { _id: activityId, title, coverImageUrl: args.imageKey },
      args.departmentId,
      actor._id,
      `New: ${title}`,
      location
        ? `${title} has been scheduled, at ${location}.`
        : `${title} has been scheduled.`
    );

    return { activityId };
  },
});

/** The activity being edited, with its department resolved and the caller gated. */
async function requireDepartmentActivity(
  ctx: MutationCtx,
  activityId: Id<"groupActivities">,
  capability: "editActivity" | "cancelActivity"
) {
  const activity = await ctx.db.get(activityId);
  if (!activity) throw new Error("That activity could not be found");
  if (activity.owner.type !== "department") {
    throw new Error("That activity does not belong to a department");
  }
  const departmentId = activity.owner.departmentId;
  const { actor } = await requireDepartmentCapability(ctx, departmentId, capability);
  return { activity, departmentId, actor };
}

export const updateActivity = mutation({
  args: {
    activityId: v.id("groupActivities"),
    title: v.optional(v.string()),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    imageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { activity, departmentId, actor } = await requireDepartmentActivity(
      ctx,
      args.activityId,
      "editActivity"
    );
    if (activity.cancelledAt !== undefined) {
      throw new Error("A cancelled activity cannot be edited");
    }

    const fields: Partial<Doc<"groupActivities">> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title === "") throw new Error("An activity needs a title");
      if (title.length > ACTIVITY_TITLE_MAX_LENGTH) {
        throw new Error(
          `A title can be at most ${ACTIVITY_TITLE_MAX_LENGTH} characters`
        );
      }
      fields.title = title;
    }
    if (args.description !== undefined) {
      fields.description = requireWithin(
        args.description,
        ACTIVITY_DESCRIPTION_MAX_LENGTH,
        "description"
      );
    }
    if (args.location !== undefined) {
      fields.location = requireWithin(
        args.location,
        ACTIVITY_LOCATION_MAX_LENGTH,
        "location"
      );
    }
    if (args.imageKey !== undefined) {
      fields.coverImageUrl = args.imageKey.trim() === "" ? undefined : args.imageKey;
    }

    // The date and the two times move together: the row stores instants, and a
    // new time on the old date is still a new instant.
    const movedWhen =
      args.date !== undefined ||
      args.startTime !== undefined ||
      args.endTime !== undefined;
    if (movedWhen) {
      const previous = {
        date: churchLocalDate(activity.startDateTime),
        start: churchLocalTime(activity.startDateTime),
        end: churchLocalTime(activity.endDateTime),
      };
      const { startDateTime, endDateTime } = churchLocalRange(
        args.date ?? previous.date,
        args.startTime ?? previous.start,
        args.endTime ?? previous.end
      );
      fields.startDateTime = startDateTime;
      fields.endDateTime = endDateTime;
    }

    const startMoved =
      fields.startDateTime !== undefined &&
      fields.startDateTime !== activity.startDateTime;
    const locationMoved =
      args.location !== undefined && fields.location !== activity.location;

    // Move the reminder with the start time, rather than leaving a job queued
    // against the old one. The old job is cancelled and a new one queued; even
    // if the old one somehow still fires, its start-time check fails (AC-24).
    if (startMoved) {
      await cancelDayBeforeReminder(ctx, activity);
      const jobId = await scheduleDayBeforeReminder(
        ctx,
        activity._id,
        fields.startDateTime as number
      );
      fields.dayBeforeReminderJobId = jobId;
    }

    await ctx.db.patch(activity._id, fields);

    const title = fields.title ?? activity.title;

    // convex/AGENTS.md asks for an audit row on every consequential state
    // change, and moving a service's date, time or place is about as
    // consequential as this department gets. Deliberately NOT in
    // DEPARTMENT_FEED_ACTIONS: AC-35 fixes what the dashboard feed shows, and
    // it names created and cancelled only, so this stays audit trail rather
    // than becoming a feed row.
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.activity_updated",
      targetType: "groupActivities",
      targetId: activity._id,
      departmentId,
      metadata: {
        title,
        movedStart: startMoved,
        movedLocation: locationMoved,
        ...(startMoved ? { startDateTime: fields.startDateTime } : {}),
      },
    });

    // Only a change a member has to act on is announced (AC-23).
    if (startMoved || locationMoved) {
      await notifyRoster(
        ctx,
        { _id: activity._id, title, coverImageUrl: fields.coverImageUrl ?? activity.coverImageUrl },
        departmentId,
        actor._id,
        `Changed: ${title}`,
        startMoved
          ? `${title} has been moved. Check the new time in the app.`
          : `${title} has a new location${fields.location ? `: ${fields.location}` : ""}.`
      );
    }

    return { ok: true as const, notified: startMoved || locationMoved };
  },
});

export const cancelActivity = mutation({
  args: {
    activityId: v.id("groupActivities"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { activityId, reason }) => {
    const { activity, departmentId, actor } = await requireDepartmentActivity(
      ctx,
      activityId,
      "cancelActivity"
    );
    if (activity.cancelledAt !== undefined) {
      throw new Error("That activity is already cancelled");
    }

    const cancellationReason = requireWithin(
      reason,
      CANCELLATION_REASON_MAX_LENGTH,
      "reason"
    );

    // Cancelling never deletes: the row keeps its place in the list, marked,
    // until its end time passes, which is the same two-state split `events`
    // uses. A member who was coming needs to see that it is off, not find it
    // missing and wonder.
    await ctx.db.patch(activityId, {
      cancelledAt: Date.now(),
      cancelledBy: actor._id,
      ...(cancellationReason ? { cancellationReason } : {}),
      dayBeforeReminderJobId: undefined,
      updatedAt: Date.now(),
    });
    await cancelDayBeforeReminder(ctx, activity);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.activity_cancelled",
      targetType: "groupActivities",
      targetId: activityId,
      departmentId,
      metadata: { title: activity.title, hadReason: cancellationReason !== undefined },
    });

    await notifyRoster(
      ctx,
      activity,
      departmentId,
      actor._id,
      `Cancelled: ${activity.title}`,
      cancellationReason
        ? `${activity.title} is off. ${cancellationReason}`
        : `${activity.title} is off.`
    );

    return { ok: true as const };
  },
});

/**
 * This department's activities in a window, plus the church-wide events that
 * fall in it, read only (AC-26).
 *
 * `now` is the client's, rounded to the minute: a live query cannot re-evaluate
 * a server side `Date.now()`, so "past" would freeze at subscription time.
 * Letting the client advance `now` is what makes a cancelled activity drop off
 * the list the moment its end time passes, with no server clock involved
 * (AC-25).
 */
export const listForDepartment = query({
  args: {
    departmentId: v.id("departments"),
    from: v.number(),
    to: v.number(),
    now: v.number(),
  },
  handler: async (ctx, { departmentId, from, to, now }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    if (!(await resolveDepartmentShellRole(ctx, user._id, departmentId))) return null;

    const rows = await ctx.db
      .query("groupActivities")
      .withIndex("by_department_start", (q) =>
        q.eq("owner.departmentId", departmentId).gte("startDateTime", from)
      )
      .filter((q) => q.lte(q.field("startDateTime"), to))
      .collect();

    const activities = await Promise.all(
      rows.map(async (a) => ({
        _id: a._id,
        title: a.title,
        description: a.description ?? null,
        startDateTime: a.startDateTime,
        endDateTime: a.endDateTime,
        location: a.location ?? null,
        imageUrl: await resolveMediaUrl(a.coverImageUrl),
        imageKey: a.coverImageUrl ?? null,
        cancelled: a.cancelledAt !== undefined,
        cancellationReason: a.cancellationReason ?? null,
        // Judged against the client's `now`, never a server clock.
        past: a.endDateTime < now,
      }))
    );

    // Church-wide events in the same window, read only: the department plans
    // around them, it does not own them. Events restricted to selected
    // departments join this list once feature 18 defines that audience field.
    const eventRows = await ctx.db
      .query("events")
      .withIndex("by_startDateTime", (q) =>
        q.gte("startDateTime", from).lte("startDateTime", to)
      )
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return {
      activities: activities.sort((a, b) => a.startDateTime - b.startDateTime),
      churchEvents: eventRows
        .map((e) => ({
          _id: e._id,
          title: e.title,
          startDateTime: e.startDateTime,
          endDateTime: e.endDateTime,
          location: e.location ?? null,
          cancelled: e.cancelledAt !== undefined,
        }))
        .sort((a, b) => a.startDateTime - b.startDateTime),
    };
  },
});

/**
 * Every department's activities in a window, with the owning department's name
 * (AC-27).
 *
 * For Administration's Year Planner to render read only. The planner interface
 * itself belongs to feature 18; only the query is in scope here, which is why
 * this returns plain rows and takes no rendering concern.
 *
 * There is deliberately no bare `["startDateTime"]` index on `groupActivities`
 * (see the schema's note), so this reads per department. Thirteen bounded range
 * reads is the price of not adding an index that would tempt every member-facing
 * read into scanning the whole church.
 */
export const listAllForPlanner = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .collect();

    const perDepartment = await Promise.all(
      departments.map(async (department) => {
        const rows = await ctx.db
          .query("groupActivities")
          .withIndex("by_department_start", (q) =>
            q.eq("owner.departmentId", department._id).gte("startDateTime", from)
          )
          .filter((q) => q.lte(q.field("startDateTime"), to))
          .collect();
        return rows.map((a) => ({
          _id: a._id,
          title: a.title,
          startDateTime: a.startDateTime,
          endDateTime: a.endDateTime,
          location: a.location ?? null,
          cancelled: a.cancelledAt !== undefined,
          departmentId: department._id,
          departmentName: department.name,
        }));
      })
    );

    return perDepartment
      .flat()
      .sort((a, b) => a.startDateTime - b.startDateTime);
  },
});
