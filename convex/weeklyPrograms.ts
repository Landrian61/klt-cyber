import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { RecurrenceType, WeekOfMonth } from "@klt-cyber/shared";
import {
  PROGRAM_CANCELLATION_REASON_MAX_LENGTH,
  formatOccurrenceDate,
} from "@klt-cyber/shared";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  getCurrentUser,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";
import { kampalaParts, occurrenceInstant, ymd, DAY_MS } from "./calendar";
import { weeklyProgramOccursOn } from "./lib/recurrence";
import {
  cancellationKey,
  getCancellation,
  getCancellationsInRange,
  parseOccurrenceDate,
  type Cancellation,
} from "./lib/occurrences";
import { notificationCommon, scheduleReminderEntries } from "./lib/reminders";

// Weekly programs — recurring (or one-off) slots defined once. The calendar
// expands these into virtual occurrences at query time (see
// convex/calendar.ts, convex/plannedActivities.ts, convex/lib/recurrence.ts).

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
  startDate?: number;
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
    // No date yet is allowed (a draft one-time program simply never appears
    // on the calendar until a date is set) — but if one IS given, it must
    // actually fall on the claimed weekday.
    if (args.startDate !== undefined) {
      const actualDay = kampalaParts(args.startDate).dayOfWeek;
      if (args.daysOfWeek[0] !== actualDay) {
        throw new Error("daysOfWeek must match the weekday of startDate for a one-time program");
      }
    }
  }

  if (args.recurrence === "biweekly" && args.startDate === undefined) {
    // Unlike weekly/monthly, "every 2 weeks" has no meaning without an
    // anchor date to count weeks from — startDate isn't just a display
    // lower-bound here, it's load-bearing for the interval math itself
    // (see weeklyProgramOccursOn in convex/lib/recurrence.ts).
    throw new Error("A program repeating every 2 weeks needs a start date to count weeks from");
  }

  if (!HHMM.test(args.startTime)) {
    throw new Error("startTime must be 24h HH:mm, e.g. \"09:00\"");
  }
  if (args.endTime !== undefined) {
    if (!HHMM.test(args.endTime)) {
      throw new Error("endTime must be 24h HH:mm, e.g. \"11:00\"");
    }
    if (args.endTime === args.startTime) {
      throw new Error("endTime must be different from startTime");
    }
    // endTime <= startTime is allowed and means the program runs past
    // midnight into the next day (e.g. 23:00 – 02:00) — a bare "HH:mm" pair
    // has no date attached, so that's the only way to express an overnight
    // span; there's no way to tell it apart from a same-day mistake from
    // the strings alone, so this trusts the admin rather than rejecting it.
  }
  if (
    args.endDate !== undefined &&
    args.startDate !== undefined &&
    args.endDate < args.startDate
  ) {
    throw new Error("endDate must be on or after startDate");
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * How far ahead `listActivePrograms` looks for a program's next occurrence and
 * its cancelled dates. A module constant, not an argument: every consumer wants
 * the same window, and letting a screen choose its own would let two screens
 * disagree about whether a program has anything coming up.
 *
 * 8 weeks covers a monthly program's next slot with room to spare, which is the
 * longest gap the recurrence model can produce.
 */
const UPCOMING_HORIZON_DAYS = 8 * 7;

/**
 * Open: active programs, ordered by weekday then time, each carrying its next
 * occurrence and its cancelled dates in the window above (AC-8).
 *
 * Both fields are additive, so the screens that only wanted the program row
 * (mobile programs list, program detail, the admin dashboard) keep working.
 *
 * `nextOccurrence` is the first occurrence on TODAY's Kampala calendar day or
 * later — by day, not by instant, so a program that started two hours ago is
 * still "next" rather than skipping to next week. That is the same window
 * cancelOccurrence allows an admin to act in, deliberately, so the admin and
 * the member can never disagree about which occurrence "the next one" is.
 */
export const listActivePrograms = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getCurrentUser(ctx))) return null;
    const programs = await ctx.db
      .query("weeklyPrograms")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const todayParts = kampalaParts(Date.now());
    const todayMidnight = occurrenceInstant(
      todayParts.year,
      todayParts.month,
      todayParts.day,
      "00:00"
    );
    const todayYmd = ymd(todayParts.year, todayParts.month, todayParts.day);
    const lastParts = kampalaParts(todayMidnight + (UPCOMING_HORIZON_DAYS - 1) * DAY_MS);
    const horizonYmd = ymd(lastParts.year, lastParts.month, lastParts.day);

    // One indexed read for the window rather than one per program: this query
    // feeds three mobile screens and re-runs reactively, so a per-program
    // lookup was an N+1 across all of them. Keyed by cancellationKey, the same
    // way both calendar paths read cancellations.
    const cancellations = await getCancellationsInRange(ctx, todayYmd, horizonYmd);

    const withOccurrences = programs.sort(byDayThenTime).map((program) => {
      const startTime = program.startTime ?? program.time;

      // A row carrying neither field predates the recurrence model and has no
      // time to anchor an occurrence to — the same defensive skip both
      // calendar day walks make. It reports no next occurrence rather than
      // guessing one.
      if (!startTime) {
        return {
          ...program,
          nextOccurrence: null as null | {
            date: string;
            startsAt: number;
            cancelled: boolean;
            reason?: string;
          },
          cancelledUpcoming: [] as { date: string; reason?: string }[],
        };
      }

      // Walk the window once, collecting the days this program actually runs.
      const occurrenceDates = new Set<string>();
      let firstDate: string | undefined;
      let firstInstant = 0;
      for (let i = 0; i < UPCOMING_HORIZON_DAYS; i += 1) {
        const dayMidnight = todayMidnight + i * DAY_MS;
        const parts = kampalaParts(dayMidnight);
        if (!weeklyProgramOccursOn(program, dayMidnight, parts)) continue;
        const date = ymd(parts.year, parts.month, parts.day);
        occurrenceDates.add(date);
        if (firstDate === undefined) {
          firstDate = date;
          firstInstant = occurrenceInstant(parts.year, parts.month, parts.day, startTime);
        }
      }

      // Intersected with the days the program runs, so a row orphaned by a
      // program edit stays unread (AC-13, invariant 2). occurrenceDates was
      // filled by an ascending day walk, so iterating it yields date order
      // without a sort.
      const live: Cancellation[] = [];
      for (const date of occurrenceDates) {
        const row = cancellations.get(cancellationKey(program._id, date));
        if (row) live.push(row);
      }
      const byDate = new Map(live.map((row) => [row.date, row]));
      const firstCancellation = firstDate ? byDate.get(firstDate) : undefined;

      return {
        ...program,
        nextOccurrence:
          firstDate === undefined
            ? null
            : {
                date: firstDate,
                startsAt: firstInstant,
                cancelled: firstCancellation !== undefined,
                ...(firstCancellation?.reason ? { reason: firstCancellation.reason } : {}),
              },
        cancelledUpcoming: live.map((row) => ({
          date: row.date,
          ...(row.reason ? { reason: row.reason } : {}),
        })),
      };
    });

    return resolveCoverUrls(withOccurrences);
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
    startDate: v.optional(v.number()),
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
      ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
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
    // `null` explicitly clears an existing value — plain omission (the
    // ordinary meaning of v.optional) can't be distinguished from "clear
    // it" once a value is already stored, since Convex drops undefined-
    // valued args entirely rather than sending them.
    startDate: v.optional(v.union(v.number(), v.null())),
    endDate: v.optional(v.union(v.number(), v.null())),
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

    // `null` means "clear"; resolve it to `undefined` before folding into
    // the existing value, same shape validateRecurrenceFields expects.
    const resolvedStartDate =
      patch.startDate === undefined
        ? existing.startDate
        : patch.startDate === null
          ? undefined
          : patch.startDate;
    const resolvedEndDate =
      patch.endDate === undefined
        ? existing.endDate
        : patch.endDate === null
          ? undefined
          : patch.endDate;

    // Validate against the fully-resolved (existing + patch) state so a
    // partial edit can't leave the row internally inconsistent (e.g.
    // changing recurrence to "monthly" without also setting weekOfMonth).
    const resolvedRecurrence = patch.recurrence ?? existing.recurrence;
    const resolvedDaysOfWeek =
      patch.daysOfWeek ??
      existing.daysOfWeek ??
      (existing.dayOfWeek !== undefined ? [existing.dayOfWeek] : []);
    const resolvedStartTime = patch.startTime ?? existing.startTime ?? existing.time;
    if (!resolvedRecurrence || !resolvedStartTime) {
      throw new Error(
        "This program predates the recurrence model — set recurrence and startTime together before making other changes"
      );
    }
    validateRecurrenceFields({
      recurrence: resolvedRecurrence,
      daysOfWeek: resolvedDaysOfWeek,
      weekOfMonth: patch.weekOfMonth ?? existing.weekOfMonth,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      startTime: resolvedStartTime,
      endTime: patch.endTime ?? existing.endTime,
    });

    const fields: Partial<Doc<"weeklyPrograms">> = { updatedAt: Date.now() };
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.recurrence !== undefined) fields.recurrence = patch.recurrence;
    if (patch.daysOfWeek !== undefined) fields.daysOfWeek = patch.daysOfWeek;
    if (patch.weekOfMonth !== undefined) fields.weekOfMonth = patch.weekOfMonth;
    if (patch.startDate !== undefined) fields.startDate = patch.startDate === null ? undefined : patch.startDate;
    if (patch.endDate !== undefined) fields.endDate = patch.endDate === null ? undefined : patch.endDate;
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

// ── Single-occurrence cancel / restore (spec 0009) ───────────────────────────

/**
 * How much of a reason rides along in a PUSH body. The stored reason keeps its
 * full PROGRAM_CANCELLATION_REASON_MAX_LENGTH characters and the in-app row
 * shows all of it; only the push is shortened, because a notification tray
 * truncates mid-word anyway and an ellipsis we control reads better than one
 * the OS picks.
 */
const PUSH_REASON_MAX_LENGTH = 120;

function pushReasonSuffix(reason?: string): string {
  if (!reason) return "";
  if (reason.length <= PUSH_REASON_MAX_LENGTH) return ` ${reason}`;
  return ` ${reason.slice(0, PUSH_REASON_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Whether `date` ("YYYY-MM-DD", Kampala) is a real, still-upcoming occurrence
 * of `program` — the test a member-facing push about that date has to pass.
 *
 * cancelOccurrence asserts each part separately, because an admin who is
 * refused deserves to know which rule stopped them. This collapses the same
 * rules into one yes/no for restoreOccurrence, which clears the record either
 * way and only needs to know whether a push would be telling the truth.
 */
function isLiveOccurrence(program: Doc<"weeklyPrograms">, date: string): boolean {
  if (!program.active) return false;

  const parts = parseOccurrenceDate(date);
  if (!parts) return false;

  const todayParts = kampalaParts(Date.now());
  if (date < ymd(todayParts.year, todayParts.month, todayParts.day)) return false;

  const dayMidnight = occurrenceInstant(parts.year, parts.month, parts.day, "00:00");
  return weeklyProgramOccursOn(program, dayMidnight, kampalaParts(dayMidnight));
}

/** Trim a submitted reason; blank after trimming means "no reason", stored as absent. */
function normalizeReason(reason: string | undefined): string | undefined {
  const trimmed = reason?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > PROGRAM_CANCELLATION_REASON_MAX_LENGTH) {
    throw new Error(
      `A reason can be at most ${PROGRAM_CANCELLATION_REASON_MAX_LENGTH} characters.`
    );
  }
  return trimmed;
}

/**
 * Call off one dated occurrence of a program without touching the program
 * itself (A4-02). Writes one row; the occurrence reads as cancelled on every
 * path that shows programs, and no reminder of any tier fires for it from this
 * moment on — including one the daily cron has ALREADY scheduled, because the
 * guard lives in the dispatch and not in the scheduling (see
 * internal.notifications.dispatch).
 *
 * Validation is deliberately asymmetric with restoreOccurrence: cancelling
 * asserts the occurrence is real and still ahead, restoring only asserts the
 * record exists. Restore has to keep working after a program edit has orphaned
 * the record, otherwise an admin could be left with a cancellation they cannot
 * clear.
 */
export const cancelOccurrence = mutation({
  args: {
    programId: v.id("weeklyPrograms"),
    date: v.string(), // "YYYY-MM-DD", Kampala-local; see the `date` note below
    reason: v.optional(v.string()),
    // Required, not optional: a default would mean some future call site could
    // push to the whole church by forgetting an argument. The 48-hour rule
    // changes what the dialog pre-ticks, not whether the caller must decide.
    notify: v.boolean(),
  },
  handler: async (ctx, { programId, date, reason, notify }) => {
    const actor = await canManageContent(ctx);

    const program = await ctx.db.get(programId);
    if (!program) throw new Error("Program not found");

    // Checked before the date rules on purpose: a second cancel must always
    // fail THIS way (AC-12), including the day after, when "the date is today
    // or later" no longer holds and would otherwise shadow it.
    const existing = await getCancellation(ctx, programId, date);
    if (existing) throw new Error("This occurrence is already cancelled.");

    if (!program.active) {
      throw new Error("This program is switched off, so it has no occurrences to cancel.");
    }

    const parts = parseOccurrenceDate(date);
    if (!parts) throw new Error("That is not a valid date.");

    // `date` is a Kampala calendar day, so "is it in the past" is a comparison
    // between calendar days and not between instants: an occurrence that
    // started two hours ago today is still cancellable (AC-5), which is exactly
    // when an admin is most likely to be calling one off.
    const todayParts = kampalaParts(Date.now());
    if (date < ymd(todayParts.year, todayParts.month, todayParts.day)) {
      throw new Error("That date has already passed.");
    }

    // The same midnight instant both calendar day walks pass as `dayCursor`,
    // so "does it occur on this day" is answered identically here and there.
    const dayMidnight = occurrenceInstant(parts.year, parts.month, parts.day, "00:00");
    const dayParts = kampalaParts(dayMidnight);
    if (!weeklyProgramOccursOn(program, dayMidnight, dayParts)) {
      throw new Error("This program does not run on that date.");
    }

    const storedReason = normalizeReason(reason);
    const now = Date.now();

    const cancellationId = await ctx.db.insert("programOccurrenceCancellations", {
      programId,
      date,
      ...(storedReason ? { reason: storedReason } : {}),
      cancelledBy: actor._id,
      cancelledAt: now,
      updatedAt: now,
      ...(notify ? { notifiedAt: now } : {}),
    });

    if (notify) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        title: `Cancelled: ${program.title}`,
        body: `${program.title} on ${formatOccurrenceDate(date)} is cancelled.${pushReasonSuffix(storedReason)}`,
        ...notificationCommon({
          audience: { type: "all" },
          deepLink: { type: "program", id: programId },
          // Unlike the cron, this has a real acting user, so the notification
          // is attributed to the admin who called the occurrence off.
          createdBy: actor._id,
          imageUrl: program.coverImageUrl,
        }),
      });
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.program_occurrence_cancelled",
      targetType: "programOccurrenceCancellations",
      targetId: cancellationId,
      metadata: {
        programId,
        title: program.title,
        date,
        ...(storedReason ? { reason: storedReason } : {}),
        notified: notify,
      },
    });

    return { ok: true as const };
  },
});

/**
 * Put a cancelled occurrence back on (A4-03) by deleting its record — there is
 * no "restored" state, only the absence of a cancellation (invariant 3).
 *
 * Checks only that the record exists, by design: see cancelOccurrence's note on
 * the asymmetry. Notifying is gated separately — the record always goes, but
 * the push only goes when it would be true.
 */
export const restoreOccurrence = mutation({
  args: {
    programId: v.id("weeklyPrograms"),
    date: v.string(),
    notify: v.boolean(),
  },
  handler: async (ctx, { programId, date, notify }) => {
    const actor = await canManageContent(ctx);

    const existing = await getCancellation(ctx, programId, date);
    if (!existing) throw new Error("This occurrence is not cancelled.");

    await ctx.db.delete(existing._id);

    // A program is never hard-deleted today, but the record outlives edits, so
    // read defensively rather than assume a title is there to put in a push.
    const program = await ctx.db.get(programId);

    // The delete above is unconditional on purpose (see the note on the
    // asymmetry). Telling the church is not: "X on <date> is back on" is a
    // claim about something that is going to happen, and it is only true when
    // the date is still ahead, the program still runs, and it still runs on
    // THAT day. A past date, a switched-off program, or a record orphaned by a
    // program edit (AC-13) each clear the cancellation silently instead.
    let notified = false;

    if (notify && program && isLiveOccurrence(program, date)) {
      notified = true;
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        title: `Back on: ${program.title}`,
        body: `${program.title} on ${formatOccurrenceDate(date)} is back on.`,
        ...notificationCommon({
          audience: { type: "all" },
          deepLink: { type: "program", id: programId },
          createdBy: actor._id,
          imageUrl: program.coverImageUrl,
        }),
      });
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.program_occurrence_restored",
      targetType: "programOccurrenceCancellations",
      targetId: existing._id,
      metadata: {
        programId,
        ...(program ? { title: program.title } : {}),
        date,
        notified,
        // Worth keeping: it says whether members had been told it was off, which
        // is the whole reason the restore notification matters.
        wasNotified: existing.notifiedAt !== undefined,
      },
    });

    return { ok: true as const };
  },
});

/**
 * Fix the reason on an occurrence that stays cancelled (AC-4).
 *
 * Never notifies: the church has already been told the occurrence is off, and a
 * second push saying the same thing with better wording is noise. `cancelledAt`
 * and `notifiedAt` are left alone so the record still says when it was called
 * off and whether members heard about it; only `updatedAt` moves.
 */
export const updateCancellationReason = mutation({
  args: {
    programId: v.id("weeklyPrograms"),
    date: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { programId, date, reason }) => {
    const actor = await canManageContent(ctx);

    const existing = await getCancellation(ctx, programId, date);
    if (!existing) throw new Error("This occurrence is not cancelled.");

    const storedReason = normalizeReason(reason);

    await ctx.db.patch(existing._id, {
      // Explicitly undefined rather than omitted — clearing a reason has to
      // actually remove it, and omitting the key would leave the old one.
      reason: storedReason,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.program_occurrence_reason_updated",
      targetType: "programOccurrenceCancellations",
      targetId: existing._id,
      metadata: {
        programId,
        date,
        ...(storedReason ? { reason: storedReason } : { reasonCleared: true }),
      },
    });

    return { ok: true as const };
  },
});

// ── Reminder cron ─────────────────────────────────────────────────────────

/**
 * Daily cron (convex/crons.ts, 06:00 UTC / 09:00 Kampala — see
 * KAMPALA_OFFSET_MS) — day-before and hour-before reminder pushes for every
 * active weeklyPrograms occurrence landing tomorrow (Kampala-local). Reuses
 * weeklyProgramOccursOn (convex/lib/recurrence.ts) — the same recurrence
 * matcher getCalendarRange uses — rather than a naive day-of-week check, so
 * once/biweekly/monthly and startDate/endDate-bounded programs are handled
 * correctly.
 *
 * A called-off occurrence is skipped (spec 0009, F4-02), but NOT here: the
 * `occurrence` argument carried on each dispatch is the only guard, and it
 * re-checks at fire time rather than trusting the moment it was scheduled.
 * Skipping cancelled occurrences up front here looked like a free
 * optimisation and was a bug — this cron runs once a day, so a cancellation
 * entered in the morning and restored that afternoon left the occurrence with
 * no scheduler entries at all and nothing to re-create them, and the service
 * then happened with no reminder of either tier. Scheduling both tiers
 * unconditionally costs one dead entry per cancelled occurrence, which the
 * fire-time guard drops without sending anything.
 *
 * A cron run has no acting user, so createdBy on the dispatched notification
 * reuses the program's own createdBy rather than inventing a system-user
 * concept.
 */
export const checkWeeklyProgramReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const HOUR_MS = 60 * 60 * 1000;
    const tomorrowParts = kampalaParts(Date.now() + DAY_MS);
    const tomorrowMidnight = occurrenceInstant(
      tomorrowParts.year,
      tomorrowParts.month,
      tomorrowParts.day,
      "00:00"
    );

    const programs = await ctx.db
      .query("weeklyPrograms")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    for (const program of programs) {
      if (!weeklyProgramOccursOn(program, tomorrowMidnight, tomorrowParts)) {
        continue;
      }
      const startTime = program.startTime ?? program.time;
      if (!startTime) continue; // pre-migration row; defensive, mirrors calendar.ts

      const date = ymd(tomorrowParts.year, tomorrowParts.month, tomorrowParts.day);

      const common = notificationCommon({
        audience: { type: "all" },
        deepLink: { type: "program", id: program._id },
        createdBy: program.createdBy,
        imageUrl: program.coverImageUrl,
        // Carried on BOTH tiers below. The day-before fires immediately, so the
        // guard is a no-op for it today, but AC-6 is about every tier and a
        // later tier that waits should inherit the check for free rather than
        // need remembering.
        occurrence: { programId: program._id, date },
      });

      const occurrence = occurrenceInstant(
        tomorrowParts.year,
        tomorrowParts.month,
        tomorrowParts.day,
        startTime
      );

      await scheduleReminderEntries(
        ctx,
        [
          // Day-before — fires now, since the cron itself runs at the
          // day-before moment for tomorrow's occurrences.
          {
            at: Date.now(),
            title: `Tomorrow: ${program.title}`,
            body: `${program.title} is tomorrow at ${startTime}.`,
          },
          // Hour-before — scheduled against the exact occurrence instant,
          // minus one hour.
          {
            at: occurrence - HOUR_MS,
            title: `Starting Soon: ${program.title}`,
            body: `${program.title} starts in one hour.`,
          },
        ],
        common
      );
    }
  },
});
