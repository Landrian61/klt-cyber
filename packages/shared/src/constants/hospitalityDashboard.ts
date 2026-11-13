/**
 * The Hospitality Dashboard's shared contract (spec 0025).
 *
 * The words the Dashboard counts by (period, window, personal contact, on
 * time) live here once, so the Convex queries, the portal page and later
 * Reports and SMS (feature 27) all mean the same thing by them.
 *
 * Reuses `kampalaWeekStart` and `daysInRange` from `./hospitality`, and
 * `addDaysToDateKey` from `../schemas/dateKey`.
 */

import { addDaysToDateKey, isValidDateKey } from '../schemas/dateKey';
import { daysInRange, kampalaWeekStart, type ContactChannel } from './hospitality';

// -- Period ------------------------------------------------------------------

/** The period switch's choices (AC-5), in the order the switch shows them. */
export const DASHBOARD_PERIODS = ['4w', '12w', '6m'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  '4w': '4 weeks',
  '12w': '12 weeks',
  '6m': '6 months',
};

/** What a missing or unknown `?period=` reads as (AC-5). */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = '12w';

export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return typeof value === 'string' && (DASHBOARD_PERIODS as readonly string[]).includes(value);
}

/** The `?period=` value, or `12w` for anything missing or unknown (AC-5). */
export function parseDashboardPeriod(value: string | null | undefined): DashboardPeriod {
  return isDashboardPeriod(value) ? value : DEFAULT_DASHBOARD_PERIOD;
}

// -- Window ------------------------------------------------------------------

export interface DateKeyRange {
  from: string;
  to: string;
}

export interface DashboardWindow extends DateKeyRange {
  /** The same number of days, ending the day before `from`. */
  previous: DateKeyRange;
}

/** `b` minus `a` in whole days, signed, not inclusive (AC-6). */
export function daysBetweenKeys(a: string, b: string): number {
  return daysInRange(a, b) - 1;
}

/** The 1st of the month `months` months before the month of `dateKey`. */
function monthStartBefore(dateKey: string, months: number): string {
  const [year, month] = dateKey.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) - months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * The Dashboard's window for a period, ending today (AC-6).
 *
 * `4w` and `12w` start on the Sunday of the week 3 or 11 weeks before the
 * current Kampala week, so the window holds 4 or 12 whole weeks, the last one
 * running to today. `6m` starts on the 1st of the month 5 months before the
 * current one. The previous window has as many days as this one and ends the
 * day before it starts, so it may start mid week or mid month.
 *
 * Throws on an invalid `today`; callers validate it first.
 */
export function dashboardWindow(today: string, period: DashboardPeriod): DashboardWindow {
  if (!isValidDateKey(today)) throw new Error(`Invalid date key: ${today}`);
  const from =
    period === '6m'
      ? monthStartBefore(today, 5)
      : addDaysToDateKey(kampalaWeekStart(today), -7 * (period === '4w' ? 3 : 11));
  const days = daysInRange(from, today);
  const previousTo = addDaysToDateKey(from, -1);
  return {
    from,
    to: today,
    previous: { from: addDaysToDateKey(previousTo, -(days - 1)), to: previousTo },
  };
}

// -- Contact -----------------------------------------------------------------

/**
 * The channels that count as a personal contact (AC-8), whatever the
 * outcome. `in_app` never does: a message in the app is not someone calling.
 */
export const PERSONAL_CONTACT_CHANNELS = [
  'call',
  'whatsapp',
  'sms',
  'in_person',
] as const satisfies readonly ContactChannel[];
export type PersonalContactChannel = (typeof PERSONAL_CONTACT_CHANNELS)[number];

export function isPersonalContactChannel(
  channel: ContactChannel,
): channel is PersonalContactChannel {
  return (PERSONAL_CONTACT_CHANNELS as readonly string[]).includes(channel);
}

/**
 * A first timer is contacted on time when a personal contact lands within
 * this many days of their first visit, the last day included (AC-8).
 */
export const CONTACT_ON_TIME_DAYS = 2;

/**
 * Whether a first timer's deadline has passed, so they can be measured at
 * all (AC-8). Someone still inside the window is never counted late.
 */
export function isOnTimeEligible(firstVisitDate: string, today: string): boolean {
  return daysBetweenKeys(firstVisitDate, today) > CONTACT_ON_TIME_DAYS;
}

/** Whether a first personal contact on `contactDay` was on time (AC-8). */
export function isContactOnTime(firstVisitDate: string, contactDay: string): boolean {
  const days = daysBetweenKeys(firstVisitDate, contactDay);
  return days >= 0 && days <= CONTACT_ON_TIME_DAYS;
}

// -- Follow up health -------------------------------------------------------

/** From this many days waiting, an open follow up is overdue (AC-9). */
export const FOLLOW_UP_OVERDUE_DAYS = 15;

/** How many open follow ups "Needs attention" lists (AC-9). */
export const ATTENTION_LIST_SIZE = 5;

/** Days waiting since the first visit, grouped (AC-9). The last is overdue. */
export const FOLLOW_UP_AGE_BUCKETS = ['0-2', '3-7', '8-14', '15+'] as const;
export type FollowUpAgeBucket = (typeof FOLLOW_UP_AGE_BUCKETS)[number];

export const FOLLOW_UP_AGE_BUCKET_LABELS: Record<FollowUpAgeBucket, string> = {
  '0-2': '0 to 2 days',
  '3-7': '3 to 7 days',
  '8-14': '8 to 14 days',
  '15+': '15 days or more',
};

/** Which group an open follow up waiting `days` days falls in (AC-9). */
export function followUpAgeBucket(days: number): FollowUpAgeBucket {
  if (days >= FOLLOW_UP_OVERDUE_DAYS) return '15+';
  if (days >= 8) return '8-14';
  if (days > CONTACT_ON_TIME_DAYS) return '3-7';
  return '0-2';
}

// -- Trends ------------------------------------------------------------------

/** The label for a value nobody recorded (AC-14). */
export const NOT_RECORDED_LABEL = 'Not recorded';

/**
 * The visitor journey's seven steps, in order (AC-12). Each is counted
 * against the cohort on its own, so a later step can be larger.
 */
export const VISITOR_JOURNEY_STEPS = [
  'first_visit',
  'contacted',
  'reached',
  'came_back',
  'regular',
  'on_app',
  'member',
] as const;
export type VisitorJourneyStep = (typeof VISITOR_JOURNEY_STEPS)[number];

export const VISITOR_JOURNEY_STEP_LABELS: Record<VisitorJourneyStep, string> = {
  first_visit: 'First visit',
  contacted: 'Contacted',
  reached: 'Reached',
  came_back: 'Came back',
  regular: 'Became a regular',
  on_app: 'On the app',
  member: 'Member',
};

/** How a first timer came to be invited (AC-14). */
export const INVITED_SOURCES = ['member', 'name', 'none'] as const;
export type InvitedSource = (typeof INVITED_SOURCES)[number];

export const INVITED_SOURCE_LABELS: Record<InvitedSource, string> = {
  member: 'By a member',
  name: 'By name',
  none: NOT_RECORDED_LABEL,
};

/**
 * Who invited a visitor (AC-14): a linked member wins when both are set,
 * then a typed name, else not recorded. A blank name counts as none.
 */
export function invitedSourceOf(row: {
  invitedByUserId?: unknown;
  invitedByText?: string;
}): InvitedSource {
  if (row.invitedByUserId !== undefined && row.invitedByUserId !== null) return 'member';
  if (row.invitedByText !== undefined && row.invitedByText.trim() !== '') return 'name';
  return 'none';
}

/** The bin whose `start` to `end` holds `today` (AC-11), labelled "so far". */
export function isBinSoFar(bin: { start: string; end: string }, today: string): boolean {
  return bin.start <= today && today <= bin.end;
}

// -- Numbers -----------------------------------------------------------------

/** The middle value, the mean of the two middle ones for an even count, or null. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole percent of `part` over `whole`, or null when there is no whole. */
export function percentOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/**
 * A headline number's change against the previous window (AC-7).
 *
 * - `count`: the percent change, null when the previous count is 0.
 * - `points`: for a value that is itself a percent, the difference in
 *   percentage points, null when either side had no one to measure.
 */
export function changeAgainst(
  current: number | null,
  previous: number | null,
  kind: 'count' | 'points' = 'count',
): number | null {
  if (current === null || previous === null) return null;
  if (kind === 'points') return Math.round(current - previous);
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// -- Sidebar badges ----------------------------------------------------------

/**
 * A sidebar badge stops reading at this many rows (AC-22), so its cost stays
 * constant however much work piles up.
 */
export const BADGE_CAP = 100;

/** What a badge shows: nothing for 0, "99+" from `BADGE_CAP` up (AC-22). */
export function badgeLabel(count: number | null | undefined): string | null {
  if (!count || count <= 0) return null;
  return count >= BADGE_CAP ? '99+' : String(count);
}
