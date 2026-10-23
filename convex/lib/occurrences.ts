import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Reading cancelled program occurrences (spec 0009). Four read paths need the
// same answer — calendar.getCalendarRange, plannedActivities.getYearPlannerRange,
// weeklyPrograms.listActivePrograms and the reminder guard in
// notifications.dispatch — and the first two expand programs through separate
// copies of the same day walk, so the lookup lives here rather than inside
// either of them.
//
// This cannot live in lib/recurrence.ts: that module is deliberately pure (no
// `ctx`, no import from calendar.ts) so the two day walks can share it without
// forming a circular import. These functions need the database, so they get
// their own file.

export type Cancellation = Doc<"programOccurrenceCancellations">;

/**
 * The key both halves of the lookup agree on: `${programId}_${date}`, the same
 * shape as the `occurrenceKey` the calendar paths already stamp on each
 * expanded occurrence, so a caller can key straight off what it is building.
 */
export function cancellationKey(programId: string, date: string): string {
  return `${programId}_${date}`;
}

/**
 * Every cancellation falling in the inclusive "YYYY-MM-DD" range, keyed by
 * {@link cancellationKey}.
 *
 * Ranges on `by_date` rather than filtering in memory: ISO date strings sort in
 * calendar order, so a string `gte`/`lte` IS a date range here. The caller
 * passes Kampala-local day strings (`ymd(...kampalaParts(ts))`), never a raw
 * instant, because a cancellation belongs to a calendar day and not to a moment.
 *
 * A row for a date the program no longer occurs on (an orphan, left behind by a
 * program edit) is returned but never matched, since callers only ask about
 * dates they have already expanded.
 */
export async function getCancellationsInRange(
  ctx: QueryCtx | MutationCtx,
  startYmd: string,
  endYmd: string
): Promise<Map<string, Cancellation>> {
  const rows = await ctx.db
    .query("programOccurrenceCancellations")
    .withIndex("by_date", (q) => q.gte("date", startYmd).lte("date", endYmd))
    .collect();
  return new Map(rows.map((row) => [cancellationKey(row.programId, row.date), row]));
}

/**
 * The cancellation for exactly one occurrence, or `null` when it is on.
 *
 * `null` means on — nothing ever writes a row to mean "not cancelled", so the
 * absence of a row is the whole signal (invariant 3).
 */
export async function getCancellation(
  ctx: QueryCtx | MutationCtx,
  programId: Id<"weeklyPrograms">,
  date: string
): Promise<Cancellation | null> {
  return await ctx.db
    .query("programOccurrenceCancellations")
    .withIndex("by_program_date", (q) => q.eq("programId", programId).eq("date", date))
    .unique();
}

/**
 * The calendar parts of a "YYYY-MM-DD" occurrence date, or `null` when the
 * string is not a real day.
 *
 * `month` is 0-indexed to match `Date.UTC` and calendar.ts's `kampalaParts`,
 * so the result can be handed straight to `occurrenceInstant`. Rejects a day
 * that overflows its month ("2026-02-30"), which `Date.UTC` would otherwise
 * roll forward into the next month — cancelling a day the admin never picked.
 */
export function parseOccurrenceDate(
  date: string
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month, day));
  if (probe.getUTCMonth() !== month || probe.getUTCDate() !== day) return null;

  return { year, month, day };
}
