import { z } from "zod";

// East Africa Time is UTC+3 with no daylight saving, so a fixed offset is
// exact. Date keys ("YYYY-MM-DD") avoid timezone bugs for date-only values.
export const EAT_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date in "YYYY-MM-DD" form. */
export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Unix ms → the "YYYY-MM-DD" key for that instant in East Africa Time. */
export function dateKeyFromMs(ms: number): string {
  return new Date(ms + EAT_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Calendar-day arithmetic on a date key. */
export function addDaysToDateKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `count` consecutive date keys starting at `startKey`. */
export function dateKeyRange(startKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysToDateKey(startKey, i));
}

export const dateKeySchema = z.string().refine(isValidDateKey, {
  message: "Date must be a real date",
});
