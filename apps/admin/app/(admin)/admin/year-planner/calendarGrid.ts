import { MONTH_LABELS } from "../_lib/adminContent";
import type { PlannerView } from "./types";

// Pure calendar-grid math for the Year Planner. Deliberately plain JS `Date`
// in browser-local time throughout (see YearPlannerClient's timezone note) —
// no calendar library, no timezone conversion. Grid cells are bucketed
// against a planner item's `date` ("YYYY-MM-DD") by matching `localYmd`.

const pad = (n: number) => String(n).padStart(2, "0");

/** Local "YYYY-MM-DD" for a Date — same shape as a planner item's `date`. */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function endOfDayMs(d: Date): number {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}

export function quarterOf(month: number): number {
  return Math.floor(month / 3);
}

/**
 * The local dates that fill a month's calendar grid, padded to whole weeks
 * (Sunday start) — 28 to 42 cells depending on how the month falls, never a
 * trailing all-empty week.
 */
export function monthGridDays(
  year: number,
  month: number,
): { date: Date; inMonth: boolean }[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStart = addDays(new Date(year, month, 1), -firstWeekday);
  return Array.from({ length: totalCells }, (_, i) => {
    const date = addDays(gridStart, i);
    return { date, inMonth: date.getMonth() === month };
  });
}

/** The 7 local dates (Sunday–Saturday) of the week containing `focus`. */
export function weekDays(focus: Date): Date[] {
  const start = addDays(startOfDay(focus), -focus.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface Range {
  start: number;
  end: number;
}

export function yearRange(year: number): Range {
  return {
    start: new Date(year, 0, 1).getTime(),
    end: endOfDayMs(new Date(year, 11, 31)),
  };
}

export function quarterRange(year: number, quarter: number): Range {
  const startMonth = quarter * 3;
  return {
    start: new Date(year, startMonth, 1).getTime(),
    end: endOfDayMs(new Date(year, startMonth + 3, 0)),
  };
}

/** Covers the full padded grid (including lead/trail days from adjacent
 * months) so spillover days still show their markers correctly. */
export function monthRangeForGrid(year: number, month: number): Range {
  const grid = monthGridDays(year, month);
  return {
    start: grid[0].date.getTime(),
    end: endOfDayMs(grid[grid.length - 1].date),
  };
}

export function weekRange(focus: Date): Range {
  const days = weekDays(focus);
  return { start: startOfDay(days[0]).getTime(), end: endOfDayMs(days[6]) };
}

export function stepFocus(focus: Date, view: PlannerView, dir: 1 | -1): Date {
  switch (view) {
    case "year":
      return new Date(focus.getFullYear() + dir, focus.getMonth(), 1);
    case "quarter":
      return new Date(focus.getFullYear(), focus.getMonth() + 3 * dir, 1);
    case "month":
      return new Date(focus.getFullYear(), focus.getMonth() + dir, 1);
    case "week":
      return addDays(focus, 7 * dir);
  }
}

/** "2026" / "Q3 2026" / "August 2026" / "Aug 24 – 30, 2026". */
export function periodLabel(view: PlannerView, focus: Date): string {
  switch (view) {
    case "year":
      return String(focus.getFullYear());
    case "quarter":
      return `Q${quarterOf(focus.getMonth()) + 1} ${focus.getFullYear()}`;
    case "month":
      return `${MONTH_LABELS[focus.getMonth()]} ${focus.getFullYear()}`;
    case "week": {
      const days = weekDays(focus);
      const start = days[0];
      const end = days[6];
      const startLabel = `${MONTH_LABELS[start.getMonth()].slice(0, 3)} ${start.getDate()}`;
      const endLabel =
        start.getMonth() === end.getMonth()
          ? `${end.getDate()}`
          : `${MONTH_LABELS[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
      return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
    }
  }
}
