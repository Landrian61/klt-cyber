/**
 * The Hospitality department's shared contract (spec 0024).
 *
 * Every name, cap, union, error code, template and pure helper the visitor
 * pages depend on lives here, for the same reason `realEstate.ts` and
 * `library.ts` exist: the Convex mutation refuses a value, the portal form
 * stops the typist before the cap, and both have to agree on what the value
 * is. A cap defined privately in one of them leaves the other guessing.
 *
 * Reuses rather than redefines:
 * - `normalizeMemberPhone` from `./directory` for the phone (AC-6).
 * - `whatsAppDigits` from `./library` for the WhatsApp link (AC-17).
 * - `kampalaToday` from `./weeklyPrograms` for "today" (AC-5).
 * - `isValidDateKey` and `addDaysToDateKey` from `../schemas/dateKey`.
 */

import { isValidDateKey, addDaysToDateKey } from '../schemas/dateKey';
import type { AgeBracket, Sex } from '../enums/user';
import { whatsAppDigits } from './library';
import { KAMPALA_UTC_OFFSET_MS } from './weeklyPrograms';

// -- The department --------------------------------------------------------

/**
 * The `departments.name` `manageHospitality` is scoped by (AC-1).
 *
 * Exactly the string `convex/seed.ts` writes and `ROSTER_PORTAL_DEPARTMENTS`
 * carries. A mismatch would silently read the capability as false for every
 * operator except nobody, so a test pins it.
 */
export const HOSPITALITY_DEPARTMENT_NAME = 'Hospitality';

// -- Caps and bounds -------------------------------------------------------

/** Free text "invited by", for an inviter who is not a member in the app. */
export const VISITOR_INVITED_BY_MAX = 120;

/** The operator's notes on a visitor. */
export const VISITOR_NOTES_MAX = 1000;

/** The note on one contact attempt. */
export const CONTACT_NOTE_MAX = 500;

/** The note on a consent given again, or a follow up closed by hand. */
export const HOSPITALITY_NOTE_MAX = 500;

/** The body of one in app message (H2-05, N41). */
export const IN_APP_MESSAGE_MAX = 500;

/** How many app visitors one in app message may reach at once (AC-21). */
export const IN_APP_MESSAGE_MAX_RECIPIENTS = 50;

/** How far back a visit may be recorded, in days (AC-5). */
export const VISIT_BACKDATE_MAX_DAYS = 30;

/** Visits inside one calendar month that make someone a regular (AC-10). */
export const REGULAR_VISITS_PER_MONTH = 3;

/** The most rows one join may move (AC-28). */
export const JOIN_MAX_ROWS = 500;

/** How many of the smallest clans the placement page highlights (AC-33). */
export const SMALLEST_CLANS_HIGHLIGHTED = 3;

/** The longest report range, in days (AC-36). */
export const REPORT_MAX_RANGE_DAYS = 731;

/** Up to this many days, a report bins by week; beyond it, by month. */
export const WEEKLY_BIN_MAX_DAYS = 92;

/** What a removed or deleted visitor's name becomes (AC-25, AC-26). */
export const REMOVED_VISITOR_LABEL = 'Removed visitor';

/** The close note on the extra follow up a join closes (AC-28). */
export const MERGED_FOLLOW_UP_NOTE = 'merged';

// -- Unions ----------------------------------------------------------------

/** Where a visitor row came from. Never changes. */
export const VISITOR_KINDS = ['walk_in', 'app'] as const;
export type VisitorKind = (typeof VISITOR_KINDS)[number];

export const VISITOR_KIND_LABELS: Record<VisitorKind, string> = {
  walk_in: 'Walk in',
  app: 'App',
};

/** A visitor row's place in the list (spec 0024 state transitions). */
export const VISITOR_LIST_STATUSES = [
  'active',
  'member',
  'merged',
  'removed',
] as const;
export type VisitorListStatus = (typeof VISITOR_LIST_STATUSES)[number];

export const FOLLOW_UP_STATUSES = ['open', 'done'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** How a follow up ended. */
export const FOLLOW_UP_OUTCOMES = [
  'reached',
  'wrong_number',
  'do_not_contact',
  'closed',
] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

/** How an operator reached out. `in_app` is only ever written by N41. */
export const CONTACT_CHANNELS = [
  'call',
  'whatsapp',
  'sms',
  'in_person',
  'in_app',
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** The channels an operator logs by hand (AC-18). */
export const LOGGED_CONTACT_CHANNELS = [
  'call',
  'whatsapp',
  'sms',
  'in_person',
] as const satisfies readonly ContactChannel[];

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  in_person: 'In person',
  in_app: 'In app message',
};

/** What happened on one contact attempt. */
export const CONTACT_OUTCOMES = [
  'reached',
  'no_answer',
  'wrong_number',
  'do_not_contact',
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const CONTACT_OUTCOME_LABELS: Record<ContactOutcome, string> = {
  reached: 'Reached',
  no_answer: 'No answer',
  wrong_number: 'Wrong number',
  do_not_contact: 'Asked not to be contacted',
};

/** The visit count filter's buckets (AC-11). */
export const VISIT_COUNT_BUCKETS = ['1', '2-4', '5+'] as const;
export type VisitCountBucket = (typeof VISIT_COUNT_BUCKETS)[number];

export const VISIT_COUNT_BUCKET_LABELS: Record<VisitCountBucket, string> = {
  '1': '1 visit',
  '2-4': '2 to 4 visits',
  '5+': '5 or more',
};

/** How the portal names the shared enums on a visitor (AC-4, AC-11). */
export const VISITOR_SEX_LABELS: Record<Sex, string> = {
  male: 'Male',
  female: 'Female',
};

export const VISITOR_AGE_BRACKET_LABELS: Record<AgeBracket, string> = {
  '0-12': 'Child (0 to 12)',
  '13-19': 'Teen (13 to 19)',
  '20-35': 'Young adult (20 to 35)',
  '36+': 'Adult (36 and over)',
};

// -- Error codes -----------------------------------------------------------

/**
 * Every refusal Hospitality can produce. One tuple, so the portal maps each
 * code to a sentence exhaustively and a typo in a `refuse(...)` is a
 * typecheck failure.
 */
export const HOSPITALITY_ERROR_CODES = [
  'HOSPITALITY_NOT_SEEDED',
  'HOSPITALITY_FIRST_NAME_REQUIRED',
  'HOSPITALITY_NAME_TOO_LONG',
  'HOSPITALITY_INVITED_BY_TOO_LONG',
  'HOSPITALITY_INVITER_INVALID',
  'HOSPITALITY_NOTES_TOO_LONG',
  'HOSPITALITY_VISIT_DATE_INVALID',
  'HOSPITALITY_TODAY_INVALID',
  'HOSPITALITY_PHONE_INVALID',
  'HOSPITALITY_CONSENT_REQUIRED',
  'HOSPITALITY_VISITOR_NOT_FOUND',
  'HOSPITALITY_VISITOR_NOT_ACTIVE',
  'HOSPITALITY_VISIT_EXISTS',
  'HOSPITALITY_VISIT_NOT_FOUND',
  'HOSPITALITY_NOT_ALLOWED',
  'HOSPITALITY_NOTE_REQUIRED',
  'HOSPITALITY_NOTE_TOO_LONG',
  'HOSPITALITY_NO_LIVE_CONSENT',
  'HOSPITALITY_APP_NAME_LOCKED',
  'HOSPITALITY_PHONE_VIA_CONSENT',
  'HOSPITALITY_REMOVE_CONFIRM',
  'HOSPITALITY_REMOVE_ACCOUNT_ROW',
  'HOSPITALITY_ALREADY_JOINED',
  'HOSPITALITY_NOT_JOINABLE',
  'HOSPITALITY_JOIN_TOO_LARGE',
  'HOSPITALITY_FOLLOW_UP_NOT_FOUND',
  'HOSPITALITY_FOLLOW_UP_CLOSED',
  'HOSPITALITY_ASSIGNEE_INVALID',
  'HOSPITALITY_CONTACT_NEEDS_PHONE',
  'HOSPITALITY_RECIPIENT_INVALID',
  'HOSPITALITY_RECIPIENT_COUNT',
  'HOSPITALITY_MESSAGE_REQUIRED',
  'HOSPITALITY_MESSAGE_TOO_LONG',
  'HOSPITALITY_CLAN_NOT_FOUND',
  'HOSPITALITY_CLAN_ALREADY_SET',
  'HOSPITALITY_PROFILE_NOT_VERIFIED',
  'HOSPITALITY_RANGE_INVALID',
  'HOSPITALITY_PERIOD_INVALID',
] as const;
export type HospitalityErrorCode = (typeof HOSPITALITY_ERROR_CODES)[number];

export const HOSPITALITY_ERROR_MESSAGES: Record<HospitalityErrorCode, string> = {
  HOSPITALITY_NOT_SEEDED:
    'The Hospitality department is not set up yet. Ask a System Admin to seed it.',
  HOSPITALITY_FIRST_NAME_REQUIRED: 'Enter the visitor’s first name.',
  HOSPITALITY_NAME_TOO_LONG: 'That name is too long. Shorten it and try again.',
  HOSPITALITY_INVITED_BY_TOO_LONG: `“Invited by” can be at most ${VISITOR_INVITED_BY_MAX} characters.`,
  HOSPITALITY_INVITER_INVALID:
    'The member you chose as the inviter is not a verified member any more. Choose someone else, or type their name instead.',
  HOSPITALITY_NOTES_TOO_LONG: `Notes can be at most ${VISITOR_NOTES_MAX} characters.`,
  HOSPITALITY_VISIT_DATE_INVALID: `Choose a visit date from today back to ${VISIT_BACKDATE_MAX_DAYS} days ago.`,
  HOSPITALITY_TODAY_INVALID:
    'Your device sent a date the server could not read. Reload the page and try again.',
  HOSPITALITY_PHONE_INVALID:
    'Check the phone number. A Ugandan number like 0772 123456 works, or the full international form.',
  HOSPITALITY_CONSENT_REQUIRED:
    'Tick the consent box to keep this phone number, or leave the number out.',
  HOSPITALITY_VISITOR_NOT_FOUND: 'That visitor no longer exists.',
  HOSPITALITY_VISITOR_NOT_ACTIVE:
    'This visitor has left the list (joined, became a member, or was removed).',
  HOSPITALITY_VISIT_EXISTS: 'A visit on that date is already recorded for this visitor.',
  HOSPITALITY_VISIT_NOT_FOUND: 'That visit no longer exists.',
  HOSPITALITY_NOT_ALLOWED:
    'Only the person who recorded this, the HOD, a delegate or a System Admin can do that.',
  HOSPITALITY_NOTE_REQUIRED: 'Add a short note saying why.',
  HOSPITALITY_NOTE_TOO_LONG: `A note can be at most ${HOSPITALITY_NOTE_MAX} characters.`,
  HOSPITALITY_NO_LIVE_CONSENT: 'This visitor has no consent to withdraw.',
  HOSPITALITY_APP_NAME_LOCKED:
    'An app visitor’s name belongs to their account, so it cannot be changed here.',
  HOSPITALITY_PHONE_VIA_CONSENT:
    'Change the phone number from the consent panel, so the consent is recorded with it.',
  HOSPITALITY_REMOVE_CONFIRM: 'Type REMOVE to confirm.',
  HOSPITALITY_REMOVE_ACCOUNT_ROW:
    'This visitor has an app account. They leave by deleting their account, not from here.',
  HOSPITALITY_ALREADY_JOINED: 'This walk in is already joined to an account.',
  HOSPITALITY_NOT_JOINABLE: 'That account can no longer be joined.',
  HOSPITALITY_JOIN_TOO_LARGE:
    'This join would move too many records at once. Ask a System Admin for help.',
  HOSPITALITY_FOLLOW_UP_NOT_FOUND: 'That follow up no longer exists.',
  HOSPITALITY_FOLLOW_UP_CLOSED: 'This follow up is already closed.',
  HOSPITALITY_ASSIGNEE_INVALID:
    'Choose someone on the Hospitality team: the HOD, a delegate, or a verified roster member.',
  HOSPITALITY_CONTACT_NEEDS_PHONE:
    'This visitor has no phone number with consent. Log an in person contact instead.',
  HOSPITALITY_RECIPIENT_INVALID:
    'One of the people you chose can no longer receive an in app message. Refresh the list and try again.',
  HOSPITALITY_RECIPIENT_COUNT: `Choose between 1 and ${IN_APP_MESSAGE_MAX_RECIPIENTS} app visitors.`,
  HOSPITALITY_MESSAGE_REQUIRED: 'Write the message first.',
  HOSPITALITY_MESSAGE_TOO_LONG: `A message can be at most ${IN_APP_MESSAGE_MAX} characters.`,
  HOSPITALITY_CLAN_NOT_FOUND: 'That clan no longer exists.',
  HOSPITALITY_CLAN_ALREADY_SET: 'This member already has a clan.',
  HOSPITALITY_PROFILE_NOT_VERIFIED: 'Only a verified member can be placed in a clan.',
  HOSPITALITY_RANGE_INVALID: `Choose a range of at most ${REPORT_MAX_RANGE_DAYS} days, with the start before the end.`,
  HOSPITALITY_PERIOD_INVALID: 'Choose 4 weeks, 12 weeks or 6 months.',
};

/** True only for a code this feature defines. */
export function isHospitalityErrorCode(value: string): value is HospitalityErrorCode {
  return (HOSPITALITY_ERROR_CODES as readonly string[]).includes(value);
}

/** The sentence for a code, or a safe fallback for anything unrecognised. */
export function hospitalityErrorMessage(code: string): string {
  return isHospitalityErrorCode(code)
    ? HOSPITALITY_ERROR_MESSAGES[code]
    : 'Something went wrong. Try again.';
}

// -- Dates -----------------------------------------------------------------

/**
 * Whether a visit date is allowed, given today (AC-5): a real `YYYY-MM-DD`
 * date, not after today and not more than `VISIT_BACKDATE_MAX_DAYS` before.
 *
 * Plain string comparison is exact here, because both values are zero
 * padded date keys.
 */
export function isAllowedVisitDate(visitDate: string, today: string): boolean {
  if (!isValidDateKey(visitDate) || !isValidDateKey(today)) return false;
  const earliest = addDaysToDateKey(today, -VISIT_BACKDATE_MAX_DAYS);
  return visitDate <= today && visitDate >= earliest;
}

/** The earliest visit date the form may offer, given today. */
export function earliestVisitDate(today: string): string {
  return addDaysToDateKey(today, -VISIT_BACKDATE_MAX_DAYS);
}

/** `YYYY-MM` for the month before the one a date key falls in. */
export function previousMonthKey(dateKey: string): string {
  const [year, month] = dateKey.slice(0, 7).split('-').map(Number) as [number, number];
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/**
 * The latest Kampala month (`YYYY-MM`) in which these visits number at least
 * `REGULAR_VISITS_PER_MONTH`, or undefined when no month reaches it (AC-10).
 *
 * Visit dates are already Kampala calendar days, so the month is the key's
 * first seven characters. Duplicates count once, matching the one visit per
 * date invariant.
 */
export function regularMonthFrom(visitDates: readonly string[]): string | undefined {
  const perMonth = new Map<string, number>();
  for (const date of new Set(visitDates)) {
    const month = date.slice(0, 7);
    perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
  }
  let latest: string | undefined;
  for (const [month, count] of perMonth) {
    if (count >= REGULAR_VISITS_PER_MONTH && (latest === undefined || month > latest)) {
      latest = month;
    }
  }
  return latest;
}

/**
 * Whether a visitor is regular on `today`: their `lastRegularMonth` is the
 * current month or the previous one (AC-10).
 */
export function isRegularOn(lastRegularMonth: string | undefined, today: string): boolean {
  if (!lastRegularMonth) return false;
  return lastRegularMonth === today.slice(0, 7) || lastRegularMonth === previousMonthKey(today);
}

/** Which visit count filter bucket a count falls in, or null for 0 (AC-11). */
export function visitCountBucket(count: number): VisitCountBucket | null {
  if (count <= 0) return null;
  if (count === 1) return '1';
  if (count <= 4) return '2-4';
  return '5+';
}

/** The Sunday that starts the week a date key falls in (AC-35, AC-36). */
export function kampalaWeekStart(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDaysToDateKey(dateKey, -day);
}

/** Whole days from `from` to `to`, counting both ends. */
export function daysInRange(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export interface ReportBin {
  /** First day inside the range that this bin covers. */
  start: string;
  /** Last day inside the range that this bin covers. */
  end: string;
  /** The bin's natural start (a Sunday, or the 1st), for labels. */
  key: string;
}

/**
 * The report's bins for a range (AC-36): weekly, starting Sunday, when the
 * range is at most `WEEKLY_BIN_MAX_DAYS` days, else calendar months.
 *
 * The first and last bins are clipped to the range, so every bin only counts
 * days the reader asked for. Returns an empty list for an invalid range.
 */
export function reportBins(from: string, to: string): ReportBin[] {
  if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) return [];
  const weekly = daysInRange(from, to) <= WEEKLY_BIN_MAX_DAYS;
  const bins: ReportBin[] = [];
  let key = weekly ? kampalaWeekStart(from) : `${from.slice(0, 7)}-01`;
  while (key <= to) {
    const next = weekly ? addDaysToDateKey(key, 7) : nextMonthStart(key);
    const naturalEnd = addDaysToDateKey(next, -1);
    bins.push({
      key,
      start: key < from ? from : key,
      end: naturalEnd > to ? to : naturalEnd,
    });
    key = next;
  }
  return bins;
}

function nextMonthStart(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number) as [number, number];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

/** "13 November", the `{visitDate}` format (spec 0024 value sourcing). */
export function formatVisitDay(dateKey: string): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return `${day} ${months[month - 1]}`;
}

// -- Names -----------------------------------------------------------------

/** Lowercased, accents stripped, spaces collapsed. */
function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The text the `search_name` index reads: folded first and last name, plus
 * the email for a row with an account (spec 0024 data model).
 */
export function buildVisitorSearchName(
  firstName: string,
  lastName?: string,
  email?: string,
): string {
  return foldForSearch([firstName, lastName, email].filter(Boolean).join(' '));
}

/** "Grace Namata", or just "Grace". */
export function visitorDisplayName(firstName: string, lastName?: string): string {
  return [firstName, lastName].filter((part) => part && part.trim()).join(' ').trim();
}

// -- Message templates -----------------------------------------------------

export const HOSPITALITY_TEMPLATE_KEYS = [
  'first_visit_thanks',
  'follow_up',
  'app_invite',
] as const;
export type HospitalityTemplateKey = (typeof HOSPITALITY_TEMPLATE_KEYS)[number];

/**
 * The fixed wordings the one tap buttons pre fill (AC-17). Feature 27 makes
 * these editable by the HOD (H3-02); until then they live here.
 */
export const HOSPITALITY_MESSAGE_TEMPLATES: Record<
  HospitalityTemplateKey,
  { label: string; body: string }
> = {
  first_visit_thanks: {
    label: 'Thank you for visiting',
    body:
      'Hello {firstName}, thank you for worshipping with us at Kingdom Life Tabernacle on {visitDate}. It was a joy to have you. We would love to see you again this Sunday. God bless you!',
  },
  follow_up: {
    label: 'Checking in',
    body:
      'Hello {firstName}, this is the Hospitality team at Kingdom Life Tabernacle. We are checking in after your visit on {visitDate}. Is there anything we can pray with you about, or help you with?',
  },
  app_invite: {
    label: 'Invite to the app',
    body:
      'Hello {firstName}, stay connected with Kingdom Life Tabernacle on our app: sermons, events and your church family in one place. Download it here: {appLink}',
  },
};

export interface HospitalityTemplateValues {
  firstName: string;
  visitDate?: string;
  appLink?: string;
}

/**
 * A template with its placeholders filled (AC-17). A placeholder whose value
 * is missing becomes an empty string rather than staying as `{name}`, so a
 * visitor never receives a raw brace.
 */
export function fillHospitalityTemplate(
  key: HospitalityTemplateKey,
  values: HospitalityTemplateValues,
): string {
  const { body } = HOSPITALITY_MESSAGE_TEMPLATES[key];
  return body
    .replace(/\{firstName\}/g, values.firstName)
    .replace(/\{visitDate\}/g, values.visitDate ? formatVisitDay(values.visitDate) : '')
    .replace(/\{appLink\}/g, values.appLink ?? '')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

// -- One tap contact links ---------------------------------------------------

export interface HospitalityContactLinks {
  call: string;
  whatsapp: string;
  sms: string;
}

/**
 * The three one tap links for a visitor's phone (AC-17), each pre filled with
 * the chosen message where the channel takes one. The phone is the stored
 * E.164 value; the operator's own phone does the sending, so nothing leaves
 * the server.
 */
export function hospitalityContactLinks(e164: string, message: string): HospitalityContactLinks {
  const text = encodeURIComponent(message);
  return {
    call: `tel:${e164}`,
    whatsapp: `https://wa.me/${whatsAppDigits(e164)}?text=${text}`,
    sms: `sms:${e164}?body=${text}`,
  };
}

// -- Notices -----------------------------------------------------------------

/** N36 (H2-04): a follow up was assigned to you. Names only the first name. */
export function followUpAssignedNotice(visitorFirstName: string): {
  title: string;
  body: string;
} {
  return {
    title: 'A visitor follow up is yours',
    body: `You have been asked to follow up with ${visitorFirstName}. Open Follow ups on the web portal.`,
  };
}

/** N41 (H2-05): the title an in app message to app visitors arrives under. */
export const IN_APP_MESSAGE_TITLE = 'A message from Kingdom Life Tabernacle';

/**
 * N37 (H5-04), the member's side: Hospitality placed you in a clan. The clan
 * name comes from `clans.name` (spec 0024 value sourcing).
 */
export function clanAssignedMemberNotice(clanName: string): {
  title: string;
  body: string;
} {
  return {
    title: 'You have a clan',
    body: `The Hospitality team has placed you in ${clanName}. Your clan elder will be in touch.`,
  };
}

/**
 * N37 (H5-04), the clan elder's side: a member joined your clan. Names only
 * the member's first name, as N36 does.
 */
export function clanAssignedElderNotice(
  memberFirstName: string,
  clanName: string
): { title: string; body: string } {
  return {
    title: 'A new member in your clan',
    body: `${memberFirstName} has been placed in ${clanName} by the Hospitality team. Welcome them in.`,
  };
}

// -- Clan placement ----------------------------------------------------------

/**
 * Which clans the placement page highlights (AC-33): those whose verified
 * count is among the `SMALLEST_CLANS_HIGHLIGHTED` lowest, ties included. So
 * with counts 0, 0, 0, 0, 5 all four empty clans are highlighted, and with
 * 1, 2, 3, 3, 9 the four up to 3 are. Returns one flag per input, in order.
 */
export function smallestClanFlags(
  counts: readonly number[],
  highlight: number = SMALLEST_CLANS_HIGHLIGHTED
): boolean[] {
  if (counts.length === 0 || highlight <= 0) return counts.map(() => false);
  const sorted = [...counts].sort((a, b) => a - b);
  const threshold = sorted[Math.min(highlight, sorted.length) - 1];
  return counts.map((count) => count <= threshold);
}

// -- Reports -----------------------------------------------------------------

/** The church's name, printed on report headers (AC-37). */
export const CHURCH_NAME = 'Kingdom Life Tabernacle';

/** The instant a Kampala calendar day starts (Kampala is UTC+3, no DST). */
export function kampalaDayStartMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`) - KAMPALA_UTC_OFFSET_MS;
}

/** The last millisecond of a Kampala calendar day. */
export function kampalaDayEndMs(dateKey: string): number {
  return kampalaDayStartMs(addDaysToDateKey(dateKey, 1)) - 1;
}

/**
 * The share of a cohort that is done, as a whole percent (AC-36). It counts
 * only follow ups opened in the range, so it can never pass 100; an empty
 * cohort reads 0 rather than dividing by zero.
 */
export function cohortCompletionPercent(opened: number, done: number): number {
  if (opened <= 0) return 0;
  return Math.min(100, Math.round((Math.min(done, opened) / opened) * 100));
}

/** The default report range (AC-36): the last 3 months, ending today. */
export function defaultReportRange(today: string): { from: string; to: string } {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const start = new Date(Date.UTC(year, month - 1 - 3, day));
  // A shorter month clamps (31 Aug back 3 months is 31 May, 30 Nov is 30 Aug).
  if (start.getUTCDate() !== day) start.setUTCDate(0);
  return { from: start.toISOString().slice(0, 10), to: today };
}

/** Whether a report range is allowed (AC-36): real dates, in order, short enough. */
export function isValidReportRange(from: string, to: string): boolean {
  return (
    isValidDateKey(from) &&
    isValidDateKey(to) &&
    from <= to &&
    daysInRange(from, to) <= REPORT_MAX_RANGE_DAYS
  );
}
