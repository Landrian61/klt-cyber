import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveCoverUrls } from "./lib/media";
import { weeklyProgramOccursOn } from "./lib/recurrence";

// Calendar is a query, not a table — it avoids a redundant store that could
// drift from `events` / `weeklyPrograms`. It expands active weekly programs into
// virtual occurrences within the range and merges them with in-range events into
// one sorted list. Future departmental calendars plug into this same merge.
// See docs/DATA_MODEL.md, Increment 3.

// Church-local time is Africa/Kampala — fixed UTC+3, no DST. Occurrences are
// computed against this offset so a "09:00" program lands at the right instant
// regardless of the server's own timezone.
// Exported (not just module-local) so other admin-only calendar views —
// currently the Year Planner (convex/plannedActivities.ts) — can expand
// occurrences the same way without duplicating the Kampala-offset math.
export const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;
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

    const [programs, eventsInRange] = await Promise.all([
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
        items.push({
          type: "program",
          start: instant,
          occurrenceKey: `${program._id}_${date}`,
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
