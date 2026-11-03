/**
 * Weekly program constants and pure formatters (spec 0009).
 *
 * The cancellation reason cap lives here rather than in the Convex mutation so
 * the admin dialog's character counter and the server's rejection cannot drift:
 * a client cap that is looser than the server's shows the admin a reason they
 * are allowed to type and then refuses to save it.
 */

/**
 * The longest a cancellation reason may be, in characters, after trimming.
 *
 * 200 is roughly two sentences — enough for "the hall is being repainted" or
 * "Pastor is away at the regional convention", short enough to read inside a
 * calendar chip and a push body without becoming its own screen.
 */
export const PROGRAM_CANCELLATION_REASON_MAX_LENGTH = 200;

/**
 * Africa/Kampala's offset from UTC in milliseconds — a fixed +3, no DST.
 *
 * Lives here because both sides of a cancellation need the church's own idea
 * of a calendar day: the backend derives its KAMPALA_OFFSET_MS from this
 * (convex/calendar.ts) and the admin portal needs it to work out whether the
 * date an admin is looking at has already passed. Two definitions would let
 * the dialog and the server disagree about which occurrences are still
 * cancellable.
 */
export const KAMPALA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Today as a "YYYY-MM-DD" Kampala calendar day.
 *
 * Shifts the instant by the offset and reads the UTC date off the result,
 * which is the same arithmetic the backend does via kampalaParts/ymd — so a
 * browser in any timezone gets the church's day and not its own.
 */
export function kampalaToday(now: number = Date.now()): string {
  return new Date(now + KAMPALA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The Kampala calendar month a timestamp falls in, as "YYYY-MM".
 *
 * Same arithmetic as `kampalaToday`, one slice shorter. Lives beside the
 * offset rather than in `convex/lib/` because a second place that knows the
 * church's timezone is how the two drift apart — and these keys are what the
 * Library dashboard's twelve month trends are bucketed by, on the server, in
 * every query (spec 0017 AC-10, AC-15, AC-25).
 */
export function kampalaMonthKey(timestamp: number): string {
  return new Date(timestamp + KAMPALA_UTC_OFFSET_MS).toISOString().slice(0, 7);
}

/**
 * The epoch milliseconds of the first instant of the Kampala calendar month a
 * timestamp falls in.
 *
 * Built by shifting into Kampala time, zeroing the day and the clock there via
 * `Date.UTC`, then shifting back, so midnight means midnight in Kampala and
 * not in the viewer's zone. This is the lower bound of the dashboard's twelve
 * month window, counted back month by month from the current one (AC-10,
 * AC-25).
 */
export function kampalaMonthStart(timestamp: number): number {
  const shifted = new Date(timestamp + KAMPALA_UTC_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) -
    KAMPALA_UTC_OFFSET_MS
  );
}

/**
 * The `LIBRARY_TREND_MONTHS`-style window of consecutive "YYYY-MM" Kampala
 * month keys ending at the month `now` falls in, oldest first.
 *
 * Generated up front so a trend series is always exactly `count` points and a
 * quiet month reads as a zero rather than vanishing from the chart. Returns
 * the keys and the window's lower bound, which is the `createdAt` a range read
 * starts at (AC-10, AC-15).
 */
export function kampalaMonthWindow(
  now: number,
  count: number,
): { keys: string[]; startedAt: number } {
  const current = new Date(kampalaMonthStart(now) + KAMPALA_UTC_OFFSET_MS);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    // Date.UTC normalises an out of range month, so month - 13 rolls the year
    // back on its own and no month arithmetic is written by hand here.
    keys.push(
      new Date(Date.UTC(year, month - back, 1)).toISOString().slice(0, 7),
    );
  }
  return {
    keys,
    startedAt: Date.UTC(year, month - (count - 1), 1) - KAMPALA_UTC_OFFSET_MS,
  };
}

/**
 * Whether a "YYYY-MM-DD" occurrence date is before today in Kampala.
 *
 * The comparison is between calendar DAYS and not between instants, which is
 * the whole point: an occurrence that started two hours ago today is not past
 * (AC-5 lets an admin call off a service that has only just begun), while one
 * from yesterday is, whatever the time of day. ISO date strings sort in
 * calendar order, so the string compare IS the date compare.
 */
export function isPastOccurrence(date: string, now: number = Date.now()): boolean {
  return date < kampalaToday(now);
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * A "YYYY-MM-DD" occurrence date as human wording, for example "Wed 22 Oct".
 *
 * Shared by the push body, the portal dialogs and the app so the three never
 * disagree about which day was called off.
 *
 * Deliberately parses the string by hand and does its weekday arithmetic in
 * UTC. `new Date('2026-10-22')` is read as UTC midnight but then rendered in
 * the reader's own zone, so anywhere west of Greenwich the same string would
 * print as the day before. The date here is already a Kampala calendar day,
 * not an instant, so it must be formatted without a timezone anywhere near it.
 *
 * Returns the input unchanged when it is not a well formed date, so a bad value
 * shows up as itself rather than as "NaN undefined" or a thrown error inside a
 * notification body.
 */
export function formatOccurrenceDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return date;

  const utc = new Date(Date.UTC(year, month - 1, day));
  // Catches an overflowing day like "2026-02-30", which Date.UTC rolls forward
  // into the next month rather than rejecting.
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return date;

  return `${WEEKDAY_LABELS[utc.getUTCDay()]} ${day} ${MONTH_LABELS[month - 1]}`;
}
