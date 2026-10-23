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
