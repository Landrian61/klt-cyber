import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveCoverUrls } from "./lib/media";
import { weeklyProgramOccursOn } from "./lib/recurrence";
import { cancellationKey, getCancellationsInRange } from "./lib/occurrences";
import { KAMPALA_UTC_OFFSET_MS } from "@klt-cyber/shared";

// Calendar is a query, not a table — it avoids a redundant store that could
// drift from `events` / `weeklyPrograms`. It expands active weekly programs into
// virtual occurrences within the range and merges them with in-range events into
// one sorted list. Future departmental calendars plug into this same merge.

// Church-local time is Africa/Kampala — fixed UTC+3, no DST. Occurrences are
// computed against this offset so a "09:00" program lands at the right instant
// regardless of the server's own timezone.
// Exported (not just module-local) so other admin-only calendar views —
// currently the Year Planner (convex/plannedActivities.ts) — can expand
// occurrences the same way without duplicating the Kampala-offset math. The
// value itself comes from @klt-cyber/shared, because the admin portal needs
// the same offset to decide whether a date has already passed in Kampala and
// the two must not be able to drift.
export const KAMPALA_OFFSET_MS = KAMPALA_UTC_OFFSET_MS;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The Kampala-local calendar parts of a unix instant. */
export function kampalaParts(ts: number) {
  const d = new Date(ts + KAMPALA_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay(),
  };
}

/** The unix instant for a Kampala-local date + "HH:mm" wall-clock time. */
export function occurrenceInstant(
  year: number,
  month: number,
  day: number,
  time: string
): number {
  const [hh, mm] = time.split(":").map((n) => Number.parseInt(n, 10));
  return Date.UTC(year, month, day, hh || 0, mm || 0) - KAMPALA_OFFSET_MS;
}

/** "YYYY-MM-DD" for a Kampala-local date. */
export function ymd(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// ── Kampala-local period boundaries (spec 0011) ────────────────────────────
// The analytics page asks two different kinds of time question and must not
// confuse them. "Active today" is a calendar-day question — a Kampala church's
// day ends at Kampala midnight, not at UTC midnight, which is three hours
// earlier and would move every evening's activity into tomorrow. "Sent this
// month" is a calendar-month question for the same reason, and because the
// allowances it is compared against reset with the calendar.
//
// Built on `kampalaParts` rather than on a second offset constant, so there is
// exactly one place the Kampala offset is written down.

/** The unix instant of Kampala-local midnight on the day containing `instant`. */
export function kampalaDayStart(instant: number): number {
  const { year, month, day } = kampalaParts(instant);
  return Date.UTC(year, month, day) - KAMPALA_OFFSET_MS;
}

/** The unix instant of Kampala-local midnight starting `instant`'s month. */
export function kampalaMonthStart(instant: number): number {
  const { year, month } = kampalaParts(instant);
  return Date.UTC(year, month, 1) - KAMPALA_OFFSET_MS;
}

/** The "YYYY-MM-DD" key of the Kampala-local date containing `instant`. */
export function kampalaDateKey(instant: number): string {
  const { year, month, day } = kampalaParts(instant);
  return ymd(year, month, day);
}

/**
 * Merged, sorted calendar for [startDate, endDate] (unix ms, inclusive).
 * Programs are expanded into occurrences per their recurrence pattern (see
 * convex/lib/recurrence.ts — once/weekly/biweekly/monthly, each optionally
 * bounded by its own startDate/endDate) that fall within the queried range;
 * each carries a stable `occurrenceKey` of `${programId}_${YYYY-MM-DD}` (per
 * the occurrence-key convention). Events are those whose `startDateTime`
 * falls in range. Both are tagged with `type`.
 */
export const getCalendarRange = query({
  args: { startDate: v.number(), endDate: v.number() },
  handler: async (ctx, { startDate, endDate }) => {
    if (endDate < startDate) {
      throw new Error("endDate must be on or after startDate");
    }

    const rangeStart = kampalaParts(startDate);
    const rangeEnd = kampalaParts(endDate);

    const [programs, eventsInRange, cancellations] = await Promise.all([
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
      // Called-off occurrences in the same window (spec 0009). Fetched once for
      // the whole range rather than per expanded occurrence — see
      // convex/lib/occurrences.ts.
      getCancellationsInRange(
        ctx,
        ymd(rangeStart.year, rangeStart.month, rangeStart.day),
        ymd(rangeEnd.year, rangeEnd.month, rangeEnd.day)
      ),
    ]);

    type CalendarItem =
      | {
          type: "program";
          start: number;
          occurrenceKey: string;
          programId: string;
          title: string;
          description?: string;
          location?: string;
          coverImageUrl?: string;
          startTime: string;
          endTime?: string;
          dayOfWeek: number;
          date: string;
          // Spec 0009: this one dated occurrence has been called off. Member
          // visible by design — the reason is what stops someone travelling to
          // a service that is not happening.
          cancelled: boolean;
          cancellationReason?: string;
        }
      | {
          type: "event";
          start: number;
          eventId: string;
          title: string;
          description?: string;
          location?: string;
          coverImageUrl?: string;
          startDateTime: number;
          endDateTime: number;
          featured: boolean;
        };

    const items: CalendarItem[] = [];

    // Walk each Kampala-local calendar day in the range. Iterating from local
    // midnight keeps the weekday/date derivation exact under the fixed offset.
    const firstDay = kampalaParts(startDate);
    let dayCursor =
      Date.UTC(firstDay.year, firstDay.month, firstDay.day) - KAMPALA_OFFSET_MS;
    for (; dayCursor <= endDate; dayCursor += DAY_MS) {
      const parts = kampalaParts(dayCursor);
      for (const program of programs) {
        if (!weeklyProgramOccursOn(program, dayCursor, parts)) continue;
        const startTime = program.startTime ?? program.time;
        if (!startTime) continue; // shouldn't happen post-migration; defensive
        const instant = occurrenceInstant(
          parts.year,
          parts.month,
          parts.day,
          startTime
        );
        if (instant < startDate || instant > endDate) continue;
        const date = ymd(parts.year, parts.month, parts.day);
        const cancellation = cancellations.get(cancellationKey(program._id, date));
        items.push({
          type: "program",
          start: instant,
          occurrenceKey: `${program._id}_${date}`,
          cancelled: cancellation !== undefined,
          ...(cancellation?.reason ? { cancellationReason: cancellation.reason } : {}),
          programId: program._id,
          title: program.title,
          ...(program.description ? { description: program.description } : {}),
          ...(program.location ? { location: program.location } : {}),
          ...(program.coverImageUrl
            ? { coverImageUrl: program.coverImageUrl }
            : {}),
          startTime,
          ...(program.endTime ? { endTime: program.endTime } : {}),
          dayOfWeek: parts.dayOfWeek,
          date,
        });
      }
    }

    for (const event of eventsInRange) {
      if (!event.active) continue;
      items.push({
        type: "event",
        start: event.startDateTime,
        eventId: event._id,
        title: event.title,
        ...(event.description ? { description: event.description } : {}),
        ...(event.location ? { location: event.location } : {}),
        ...(event.coverImageUrl ? { coverImageUrl: event.coverImageUrl } : {}),
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        featured: event.featured,
      });
    }

    items.sort((a, b) => a.start - b.start);
    return resolveCoverUrls(items);
  },
});
