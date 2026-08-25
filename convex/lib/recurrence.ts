// Shared "does this weeklyPrograms row occur on this calendar day" logic —
// used by both convex/calendar.ts (getCalendarRange) and
// convex/plannedActivities.ts (getYearPlannerRange), which otherwise
// duplicate the day-walk expansion loop. Kept dependency-free (no import
// from calendar.ts) so the two never form a circular import; callers pass in
// the Kampala-local date parts they've already computed via
// calendar.ts's kampalaParts().

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecurrenceCheckable {
  recurrence?: string;
  daysOfWeek?: number[];
  dayOfWeek?: number; // legacy fallback for pre-migration rows
  startDate?: number;
  endDate?: number;
  weekOfMonth?: number;
}

export interface DateParts {
  year: number;
  month: number; // 0-indexed, matches Date.UTC
  day: number; // 1-indexed day-of-month
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
}

/**
 * True if `program` has an occurrence on the Kampala-local calendar day
 * described by `dateMidnightMs` (that day's Kampala-midnight instant, i.e.
 * calendar.ts's `dayCursor`) and `dateParts` (calendar.ts's
 * `kampalaParts(dayCursor)` for the same instant).
 */
export function weeklyProgramOccursOn(
  program: RecurrenceCheckable,
  dateMidnightMs: number,
  dateParts: DateParts
): boolean {
  const days =
    program.daysOfWeek ??
    (program.dayOfWeek !== undefined ? [program.dayOfWeek] : []);
  if (!days.includes(dateParts.dayOfWeek)) return false;

  if (program.startDate !== undefined && dateMidnightMs < program.startDate) {
    return false;
  }
  if (program.endDate !== undefined && dateMidnightMs > program.endDate) {
    return false;
  }

  const recurrence = program.recurrence ?? "weekly"; // unset = legacy row, always-weekly behavior
  switch (recurrence) {
    case "once":
      return (
        program.startDate !== undefined && dateMidnightMs === program.startDate
      );
    case "biweekly": {
      // No anchor to count weeks from — defensively treat as matching every
      // week rather than silently dropping the program from the calendar.
      if (program.startDate === undefined) return true;
      const weeksSinceStart = Math.floor(
        (dateMidnightMs - program.startDate) / (7 * DAY_MS)
      );
      return weeksSinceStart % 2 === 0;
    }
    case "monthly":
      // No position to check against — same defensive fallback as biweekly.
      if (program.weekOfMonth === undefined) return true;
      return isNthWeekdayOfMonth(dateParts, program.weekOfMonth);
    case "weekly":
    default:
      return true;
  }
}

/**
 * Is `parts.day` the Nth (1st/2nd/3rd/4th) — or, for `weekOfMonth === -1`,
 * the LAST — occurrence of its weekday within its calendar month?
 */
function isNthWeekdayOfMonth(parts: DateParts, weekOfMonth: number): boolean {
  const position = Math.ceil(parts.day / 7);
  if (weekOfMonth !== -1) return position === weekOfMonth;

  const daysInMonth = new Date(
    Date.UTC(parts.year, parts.month + 1, 0)
  ).getUTCDate();
  return parts.day + 7 > daysInMonth;
}
