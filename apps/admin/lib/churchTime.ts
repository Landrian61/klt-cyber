import { KAMPALA_UTC_OFFSET_MS } from "@klt-cyber/shared";

/**
 * Reading and writing times in church local time (spec 0012, AC-22).
 *
 * The portal's existing date helpers in `lib/content-helpers.tsx` use the
 * browser's own timezone, which is right for a period filter the reader picked
 * themselves. It is wrong for a department activity: that is stored as the
 * instant of a Kampala wall-clock time, so an HOD on a laptop still set to
 * London would both enter and read it three hours out. Everything that renders
 * or edits an activity's date and time goes through this file instead.
 *
 * Africa/Kampala is a fixed UTC+3 with no daylight saving, which is what makes
 * a plain offset correct here rather than an approximation.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** The Kampala-local calendar parts of an instant. */
export function churchParts(ms: number) {
  const d = new Date(ms + KAMPALA_UTC_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(), // 0-based
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

/** "YYYY-MM-DD" in church local time, the shape the mutations take. */
export function churchDateInput(ms: number): string {
  const p = churchParts(ms);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
}

/** "HH:MM" in church local time, the shape the mutations take. */
export function churchTimeInput(ms: number): string {
  const p = churchParts(ms);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}

/** The instant a church-local "YYYY-MM-DD" plus "HH:MM" falls on. */
export function churchInstant(date: string, time: string): number {
  const [year, month, day] = date.split("-").map((n) => Number.parseInt(n, 10));
  const [hh, mm] = time.split(":").map((n) => Number.parseInt(n, 10));
  return (
    Date.UTC(year, (month ?? 1) - 1, day ?? 1, hh || 0, mm || 0) -
    KAMPALA_UTC_OFFSET_MS
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "12 Jul 2026", in church local time. */
export function churchDateLabel(ms: number): string {
  const p = churchParts(ms);
  return `${p.day} ${MONTHS_SHORT[p.month]} ${p.year}`;
}

/** "6:00 pm", in church local time. */
export function churchTimeLabel(ms: number): string {
  const p = churchParts(ms);
  const period = p.hours < 12 ? "am" : "pm";
  const hour = p.hours % 12 === 0 ? 12 : p.hours % 12;
  return `${hour}:${pad(p.minutes)} ${period}`;
}

/** "12 Jul 2026, 6:00 pm", in church local time. */
export function churchDateTimeLabel(ms: number): string {
  return `${churchDateLabel(ms)}, ${churchTimeLabel(ms)}`;
}

/** The full name of a month index, for a calendar heading. */
export function monthLabel(month: number, year: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** The instant church-local midnight on the first of a month falls on. */
export function churchMonthStart(year: number, month: number): number {
  return Date.UTC(year, month, 1) - KAMPALA_UTC_OFFSET_MS;
}

/** The instant the last millisecond of a church-local month falls on. */
export function churchMonthEnd(year: number, month: number): number {
  return Date.UTC(year, month + 1, 1) - 1 - KAMPALA_UTC_OFFSET_MS;
}

/** How many days a month has. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * The weekday (0 = Sunday) the first of a church-local month lands on, so a
 * month grid can leave the right number of leading blanks.
 */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}
