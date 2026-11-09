/**
 * The Real Estate department's shared contract (spec 0018).
 *
 * Every union, cap, bound, error code and formatter the Tower of Faith and the
 * spaces-to-let feature depends on lives here rather than inside the Convex
 * mutations that enforce them, for the same reason `library.ts` exists: three
 * readers have to agree on the same values. The mutation refuses an over-long
 * name, the portal form counts characters and stops the typist before the cap,
 * and the mobile screen renders the result. A cap defined privately in one of
 * the three leaves the other two guessing.
 *
 * Deliberately reuses rather than redefines:
 * - `E164_PHONE_REGEX`, `isE164Phone`, `normalizeE164Phone` and
 *   `whatsAppDigits` from `./library`, so a phone number has ONE format in
 *   this project rather than two (AC-24).
 * - `formatUgx` from `./library`, so money reads identically on a facility, a
 *   space to let, a Library item and the cost register.
 * - `KAMPALA_UTC_OFFSET_MS` from `./weeklyPrograms`, so the fixed +3 lives in
 *   exactly one constant. Spec 0018's follow-up asks for that offset to sit in
 *   one place in `packages/shared`; it already did, so this file imports it
 *   rather than adding a second copy that could drift.
 */

import { formatUgx } from './library';
import { KAMPALA_UTC_OFFSET_MS } from './weeklyPrograms';

// -- The department --------------------------------------------------------

/**
 * The `departments.name` the Real Estate capability is scoped by (AC-24).
 *
 * Exactly the string `convex/seed.ts` writes. A mismatch here is silent and
 * nasty: `manageRealEstate` would simply read false for everyone except a
 * System Admin and nobody would see an error, so a Convex test asserts this
 * matches a real seeded row rather than trusting the two to stay in step.
 */
export const REAL_ESTATE_DEPARTMENT_NAME = 'Real Estate';

// -- Caps and bounds -------------------------------------------------------

/** A facility's display name, e.g. "Heritage Academy". */
export const RE_FACILITY_NAME_MAX_LENGTH = 120;

/** One line under the name, e.g. "Nursery to P7, day and boarding". */
export const RE_FACILITY_TAGLINE_MAX_LENGTH = 160;

/** The long prose on a facility's detail screen. */
export const RE_FACILITY_DESCRIPTION_MAX_LENGTH = 2000;

/** A floor's name, e.g. "Ground Floor". */
export const RE_FLOOR_NAME_MAX_LENGTH = 60;

/** A space-to-let's title, e.g. "Corner shop, street frontage". */
export const RE_SPACE_TITLE_MAX_LENGTH = 160;

/** The long prose on a space's detail screen. */
export const RE_SPACE_DESCRIPTION_MAX_LENGTH = 2000;

/** How many "services offered" bullets one facility may list. */
export const RE_SERVICES_MAX = 12;

/** Each "services offered" bullet, e.g. "Boarding section". */
export const RE_SERVICE_MAX_LENGTH = 60;

/**
 * Photos per facility or space, cover included (AC-11).
 *
 * `photos[0]` IS the cover, so this is the whole gallery and there is no
 * separate cover slot to budget for.
 */
export const RE_PHOTOS_MAX = 6;

/** One photo's ceiling, read back from R2 rather than trusted (AC-11). */
export const RE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * What a gallery photo may be (AC-11).
 *
 * Deliberately NOT `image/heic`: an iPhone will happily hand one over and no
 * browser renders it, so accepting it means an operator uploads a photo that
 * looks fine on their own phone and is a broken image for the congregation.
 */
export const RE_PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type RealEstatePhotoContentType = (typeof RE_PHOTO_CONTENT_TYPES)[number];

/** True only for a content type the gallery accepts. */
export function isRealEstatePhotoContentType(
  value: string,
): value is RealEstatePhotoContentType {
  return (RE_PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}

/** A space's monthly rent floor, in whole shillings. */
export const RE_SPACE_PRICE_MIN_UGX = 0;

/** A space's monthly rent ceiling, in whole shillings. */
export const RE_SPACE_PRICE_MAX_UGX = 100_000_000;

/** The smallest lettable area, in square metres. */
export const RE_SPACE_SIZE_MIN_SQM = 0.1;

/** The largest lettable area, in square metres. */
export const RE_SPACE_SIZE_MAX_SQM = 100_000;

/**
 * The ceiling every list query reads up to (AC-29).
 *
 * No page control is rendered, because one building cannot plausibly reach
 * this. The cap is applied AFTER the visibility filter, never before:
 * truncating first and filtering second would silently drop visible rows,
 * which is the exact failure a cap is supposed to prevent rather than cause. A
 * list that ever does reach this is the signal that the "one bounded building"
 * assumption has stopped holding and real pagination is owed.
 */
export const REAL_ESTATE_LIST_CAP = 200;

// -- Spaces to let ---------------------------------------------------------

/**
 * A space's letting status (AC-16).
 *
 * All six transitions are allowed and each is logged; only `available` and
 * `reserved` reach the app. A `let` space stays in the portal so it can be
 * flipped back without retyping it.
 */
export const RE_SPACE_STATUSES = ['available', 'reserved', 'let'] as const;
export type RealEstateSpaceStatus = (typeof RE_SPACE_STATUSES)[number];

/** What the portal calls each status. */
export const RE_SPACE_STATUS_LABELS: Record<RealEstateSpaceStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  let: 'Let',
};

/** True only for a stored status this feature knows. */
export function isRealEstateSpaceStatus(
  value: string,
): value is RealEstateSpaceStatus {
  return (RE_SPACE_STATUSES as readonly string[]).includes(value);
}

// -- Opening hours ---------------------------------------------------------

/**
 * Weekday numbering: 0 is SUNDAY, matching JavaScript's `getDay()` (AC-10).
 *
 * Chosen to match the language rather than the display, so no conversion layer
 * sits between the stored entry and the clock — a conversion layer is the
 * thing that gets written once correctly and then forgotten by the second
 * reader. Both surfaces display the week starting Monday regardless; that is a
 * presentation ordering (`RE_WEEKDAY_DISPLAY_ORDER`), not a second model.
 */
export const RE_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type RealEstateWeekday = (typeof RE_WEEKDAYS)[number];

/** How many weekdays there are. Named so the modulo arithmetic reads. */
export const RE_DAYS_PER_WEEK = 7;

/**
 * Weekday names, indexed so that index 0 is Sunday.
 *
 * Keyed by plain `number` rather than by {@link RealEstateWeekday}, because a
 * stored entry's weekday arrives from Convex as a `number`: the schema stores
 * `v.number()`, there being no practical numeric literal union in a Convex
 * validator. A narrow key type here would only force a cast at every call
 * site. {@link openingHoursError} is what actually guarantees the range, at
 * runtime, where the value really comes from.
 */
export const RE_WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/** Short weekday names, for a tight hours table. */
export const RE_WEEKDAY_SHORT_LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/**
 * The order both surfaces DISPLAY the week in: Monday first, Sunday last.
 *
 * Storage stays keyed 0-is-Sunday; this is only the reading order, kept here
 * so the portal's editor and the mobile detail screen cannot disagree about
 * which end of the week Sunday belongs on.
 */
export const RE_WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** The first minute of a day. */
export const RE_MINUTE_MIN = 0;

/** The last minute of a day, 23:59. An all-day facility is 0 to 1439. */
export const RE_MINUTE_MAX = 1439;

/** Minutes in a full day. */
export const RE_MINUTES_PER_DAY = 1440;

/**
 * One weekday's hours.
 *
 * A `closed` day carries no pair. An open day carries both halves or none,
 * never one (AC-10).
 */
export type RealEstateOpeningHoursEntry = {
  /**
   * 0 is Sunday. Typed as a plain number because that is what Convex stores
   * and hands back; {@link openingHoursError} enforces the 0 to 6 range at
   * runtime, which is the only place the guarantee can actually be made.
   */
  weekday: number;
  closed: boolean;
  openMinutes?: number;
  closeMinutes?: number;
};

/** Seven entries, one per weekday. */
export type RealEstateOpeningHours = readonly RealEstateOpeningHoursEntry[];

/**
 * Whether a facility is open right now, or whether that is even knowable.
 *
 * Three states, not two. `unknown` exists because labelling a facility with no
 * recorded schedule "Closed" tells the member something false (AC-18).
 */
export const RE_OPEN_STATES = ['open', 'closed', 'unknown'] as const;
export type RealEstateOpenState = (typeof RE_OPEN_STATES)[number];

/** What each open state reads as on screen. */
export const RE_OPEN_STATE_LABELS: Record<RealEstateOpenState, string> = {
  open: 'Open now',
  closed: 'Closed',
  unknown: 'Hours not listed',
};

/**
 * Seven weekday entries with every day closed, the editor's starting point.
 *
 * A function returning a fresh array rather than a shared constant, because
 * the portal form mutates what it is handed and one module-level literal
 * shared between two open dialogs would leak one dialog's edits into the
 * other.
 */
export function emptyOpeningHours(): RealEstateOpeningHoursEntry[] {
  return RE_WEEKDAYS.map((weekday) => ({ weekday, closed: true }));
}

/** Whether a stored minute is a real time of day. */
function isMinuteOfDay(value: number | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RE_MINUTE_MIN &&
    value <= RE_MINUTE_MAX
  );
}

/**
 * Whether these seven entries are storable, per AC-10.
 *
 * Returns null when they are fine, or the error code to refuse with. A
 * predicate that returns the code rather than a boolean, so the mutation and
 * the form refuse for the same reason with the same words, rather than the
 * form saying "check the hours" and the server saying something else.
 *
 * Refused: a weekday duplicated or absent, a minute outside the day, an open
 * day missing either half of its pair, and an open equal to its close. That
 * last one is refused as genuinely ambiguous rather than guessed at — it reads
 * equally as a zero-length window and as all day — and an all-day facility has
 * an unambiguous spelling already, 0 to 1439.
 *
 * NOT refused: a close earlier than its open. That is an overnight window, and
 * a facility open 10:00 to 01:00 is a real thing.
 */
export function openingHoursError(
  entries: RealEstateOpeningHours | undefined,
): RealEstateErrorCode | null {
  if (entries === undefined) return null;
  if (entries.length !== RE_DAYS_PER_WEEK) return 'REAL_ESTATE_HOURS_INVALID';

  const seen = new Set<number>();
  for (const entry of entries) {
    if (!(RE_WEEKDAYS as readonly number[]).includes(entry.weekday)) {
      return 'REAL_ESTATE_HOURS_INVALID';
    }
    if (seen.has(entry.weekday)) return 'REAL_ESTATE_HOURS_INVALID';
    seen.add(entry.weekday);

    if (entry.closed) continue;

    if (!isMinuteOfDay(entry.openMinutes) || !isMinuteOfDay(entry.closeMinutes)) {
      return 'REAL_ESTATE_HOURS_INVALID';
    }
    if (entry.openMinutes === entry.closeMinutes) {
      return 'REAL_ESTATE_HOURS_INVALID';
    }
  }

  return seen.size === RE_DAYS_PER_WEEK ? null : 'REAL_ESTATE_HOURS_INVALID';
}

/**
 * The Kampala weekday and minute-of-day a timestamp falls on.
 *
 * Shifts the epoch by the fixed +3 and reads the result as if it were UTC,
 * which is the same arithmetic `kampalaToday` does. `getUTCDay` rather than
 * `getDay` is the whole point: reading the shifted instant with a local getter
 * would apply the viewer's own offset a second time.
 */
function kampalaClock(nowMs: number): { weekday: number; minutes: number } {
  const shifted = new Date(nowMs + KAMPALA_UTC_OFFSET_MS);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** One entry as a usable window, or null when the day is closed or unstorable. */
function openWindow(
  entry: RealEstateOpeningHoursEntry | undefined,
): { open: number; close: number } | null {
  if (!entry || entry.closed) return null;
  if (!isMinuteOfDay(entry.openMinutes) || !isMinuteOfDay(entry.closeMinutes)) {
    return null;
  }
  if (entry.openMinutes === entry.closeMinutes) return null;
  return { open: entry.openMinutes, close: entry.closeMinutes };
}

/**
 * "Open now", "Closed" or "Hours not listed", against the building's clock.
 *
 * Computed client side on purpose (spec 0018's value sourcing): a Convex query
 * result caches on its arguments, so a server-computed flag would not flip as
 * the clock passed closing time. The mobile screen recomputes on focus and on
 * a one-minute interval while focused; the portal's operator preview reads
 * this same function, so the two surfaces can never disagree.
 *
 * Resolves the weekday AND the time of day against a fixed Africa/Kampala
 * clock, never the viewer's device timezone, because the question is whether
 * the BUILDING is open. A member abroad near midnight still wants the
 * building's day, not their own.
 *
 * Tests TWO entries, not one: today's, and yesterday's when yesterday's window
 * crosses midnight. A facility open Sunday 22:00 to 02:00 IS open at 01:00 on
 * Monday, and an implementation that reads only Monday's entry is wrong every
 * such morning while still passing a naive same-day test.
 */
export function isFacilityOpenNow(
  openingHours: RealEstateOpeningHours | undefined,
  nowMs: number = Date.now(),
): RealEstateOpenState {
  if (!openingHours || openingHours.length === 0) return 'unknown';

  const { weekday, minutes } = kampalaClock(nowMs);
  const byWeekday = new Map<number, RealEstateOpeningHoursEntry>();
  for (const entry of openingHours) byWeekday.set(entry.weekday, entry);

  // Today's window. An overnight one (close below open) is open from its
  // opening minute to the end of the day; its tail belongs to tomorrow.
  const today = openWindow(byWeekday.get(weekday));
  if (today) {
    const overnight = today.close < today.open;
    const openNow = overnight
      ? minutes >= today.open
      : minutes >= today.open && minutes < today.close;
    if (openNow) return 'open';
  }

  // Yesterday's window, but only where it ran past midnight into today.
  const yesterdayWeekday = (weekday - 1 + RE_DAYS_PER_WEEK) % RE_DAYS_PER_WEEK;
  const yesterday = openWindow(byWeekday.get(yesterdayWeekday));
  if (yesterday && yesterday.close < yesterday.open && minutes < yesterday.close) {
    return 'open';
  }

  return 'closed';
}

/** `540` becomes `"9:00 am"`. The portal and the app read hours the same way. */
export function formatMinutesOfDay(minutes: number): string {
  const normalised =
    ((minutes % RE_MINUTES_PER_DAY) + RE_MINUTES_PER_DAY) % RE_MINUTES_PER_DAY;
  const hours24 = Math.floor(normalised / 60);
  const mins = normalised % 60;
  const suffix = hours24 < 12 ? 'am' : 'pm';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/**
 * One weekday's hours as a sentence, e.g. `"9:00 am to 5:00 pm"`.
 *
 * An overnight window is marked, because "10:00 pm to 2:00 am" read without a
 * cue looks like a typo rather than a night shift.
 */
export function formatOpeningHoursEntry(
  entry: RealEstateOpeningHoursEntry,
): string {
  const window = openWindow(entry);
  if (!window) return 'Closed';
  const overnight = window.close < window.open;
  const range = `${formatMinutesOfDay(window.open)} to ${formatMinutesOfDay(window.close)}`;
  return overnight ? `${range} (next day)` : range;
}

// -- Money -----------------------------------------------------------------

/** What a space with no recorded rent reads as (AC-20). */
export const RE_PRICE_ON_ENQUIRY_LABEL = 'Price on enquiry';

/**
 * A space's monthly rent as money, or the enquiry line when there is none.
 *
 * Wraps `formatUgx` rather than reimplementing it, so a space's rent, a
 * Library item's price and the cost register all render the same shilling.
 */
export function formatSpacePrice(priceUgxPerMonth?: number | null): string {
  if (priceUgxPerMonth === undefined || priceUgxPerMonth === null) {
    return RE_PRICE_ON_ENQUIRY_LABEL;
  }
  return formatUgx(priceUgxPerMonth);
}

/** Whether a rent is storable, per AC-15. */
export function isValidSpacePrice(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= RE_SPACE_PRICE_MIN_UGX &&
    value <= RE_SPACE_PRICE_MAX_UGX
  );
}

/** Whether an area is storable, per AC-15. Fractional metres are fine. */
export function isValidSpaceSize(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= RE_SPACE_SIZE_MIN_SQM &&
    value <= RE_SPACE_SIZE_MAX_SQM
  );
}

/** `48.5` becomes `"48.5 sqm"`, trimming a pointless trailing zero. */
export function formatSpaceSize(sizeSqm: number): string {
  const rounded = Math.round(sizeSqm * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} sqm`;
}

// -- Why a row is not in the app -------------------------------------------

/**
 * The reason a portal row is not visible to the congregation (AC-7).
 *
 * Four distinct reasons rather than one shared "Hidden" label, because an
 * operator fixing the wrong one is wasted work: unhiding a facility that is
 * actually missing a phone number changes nothing they can see.
 *
 * Reported as the FIRST reason that applies, in this order, so the operator is
 * pointed at one fix rather than handed a list.
 */
export const RE_HIDDEN_REASONS = [
  'hidden',
  'floor_hidden',
  'unplaced',
  'no_contact',
] as const;
export type RealEstateHiddenReason = (typeof RE_HIDDEN_REASONS)[number];

/** What each reason reads as on the row. */
export const RE_HIDDEN_REASON_LABELS: Record<RealEstateHiddenReason, string> = {
  hidden: 'Hidden',
  floor_hidden: 'Floor hidden',
  unplaced: 'Not yet placed',
  no_contact: 'Needs a contact',
};

/** What an operator should do about each reason. */
export const RE_HIDDEN_REASON_HINTS: Record<RealEstateHiddenReason, string> = {
  hidden: 'This facility is hidden. Unhide it to put it in the app.',
  floor_hidden:
    'Its floor is hidden, so everything on that floor is out of the app.',
  unplaced: 'Put it on a floor and it can appear in the app.',
  no_contact: 'Add a phone or WhatsApp number and it can appear in the app.',
};

/**
 * Why this facility is not in the app, or null when it is.
 *
 * The one place the visibility conditions of AC-18 are spelled out, read by
 * the member query's filter, the portal row's label and the dashboard's
 * "incomplete" count alike. Three readers, one rule: that is what stops the
 * page and the card from disagreeing about the same facility.
 *
 * A removed row is not a reason — it is gone, and the caller filters those out
 * before asking.
 */
export function facilityHiddenReason(facility: {
  active: boolean;
  floorId?: string | null;
  floorHidden?: boolean;
  contactPhone?: string;
  contactWhatsapp?: string;
}): RealEstateHiddenReason | null {
  if (!facility.active) return 'hidden';
  if (facility.floorHidden) return 'floor_hidden';
  if (!facility.floorId) return 'unplaced';
  if (!facility.contactPhone && !facility.contactWhatsapp) return 'no_contact';
  return null;
}

/**
 * Whether this facility counts as unfinished on the dashboard (AC-4).
 *
 * Missing any one of: a contact number, a photo, opening hours, or a floor.
 * Derived at read time, never a stored flag, which would go stale the moment
 * an operator filled the missing field in.
 *
 * Note that an unplaced facility counts as incomplete. That is the reading
 * which makes the dashboard card agree with the "Not yet placed" group on the
 * page, rather than the card claiming all is well while the page shows a pile
 * of unfinished drafts.
 */
export function isFacilityIncomplete(facility: {
  floorId?: string | null;
  photos?: readonly string[];
  openingHours?: RealEstateOpeningHours;
  contactPhone?: string;
  contactWhatsapp?: string;
}): boolean {
  if (!facility.contactPhone && !facility.contactWhatsapp) return true;
  if (!facility.photos || facility.photos.length === 0) return true;
  if (!facility.openingHours || facility.openingHours.length === 0) return true;
  if (!facility.floorId) return true;
  return false;
}

// -- Floor name comparison -------------------------------------------------

/**
 * A floor name reduced to what uniqueness is judged on (AC-5).
 *
 * Trimmed, lowercased, internal whitespace collapsed, so "First Floor" and
 * "first  floor" collide. Shared rather than inlined in the mutation because
 * the portal form wants to warn before the save, and a form that normalises
 * differently from the server is a form that promises a name is free and then
 * watches the save fail.
 */
export function normalizeFloorName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// -- Activity log actions --------------------------------------------------

/**
 * The `activityLogs.action` values this feature writes (AC-14).
 *
 * `facility.created` and `facility.updated` keep the names
 * `convex/facilities.ts` already wrote, so rows written before this spec stay
 * readable rather than becoming orphans nothing can render a sentence for.
 */
export const REAL_ESTATE_FEED_ACTIONS = [
  'floor.created',
  'floor.renamed',
  'floor.reordered',
  'floor.hidden',
  'floor.deleted',
  'facility.created',
  'facility.updated',
  'facility.reordered',
  'facility.hidden',
  'facility.removed',
  'space.created',
  'space.updated',
  'space.status_changed',
  'space.removed',
] as const;
export type RealEstateFeedAction = (typeof REAL_ESTATE_FEED_ACTIONS)[number];

/**
 * The `activityLogs.targetType` values this feature writes.
 *
 * Table names, which is this codebase's dominant convention
 * (`departmentMemberships`, `memberProfiles`, `roleAssignments`) rather than
 * the Library's singular `libraryItem`. `facility` in particular is pinned to
 * the exact string `convex/facilities.ts` already wrote, so the rows logged
 * before spec 0018 resolve against the same target as the ones after it.
 */
export const REAL_ESTATE_TARGET_TYPES = {
  floor: 'realEstateFloors',
  facility: 'facilities',
  space: 'realEstateSpaces',
} as const;

// -- Error codes -----------------------------------------------------------

/**
 * Every refusal this feature can produce.
 *
 * One tuple, so the portal can map a thrown code to a sentence exhaustively
 * and a typo in a mutation's `refuse(...)` is a typecheck failure rather than
 * a dialog that shows the operator a bare code.
 */
export const REAL_ESTATE_ERROR_CODES = [
  // Floors
  'REAL_ESTATE_FLOOR_NAME_REQUIRED',
  'REAL_ESTATE_FLOOR_NAME_TOO_LONG',
  'REAL_ESTATE_FLOOR_NAME_TAKEN',
  'REAL_ESTATE_FLOOR_NOT_FOUND',
  'REAL_ESTATE_FLOOR_IN_USE',
  'REAL_ESTATE_FLOOR_REQUIRED',
  // Facilities
  'REAL_ESTATE_FACILITY_NAME_REQUIRED',
  'REAL_ESTATE_FACILITY_NAME_TOO_LONG',
  'REAL_ESTATE_TAGLINE_TOO_LONG',
  'REAL_ESTATE_DESCRIPTION_TOO_LONG',
  'REAL_ESTATE_SERVICES_TOO_MANY',
  'REAL_ESTATE_SERVICE_TOO_LONG',
  'REAL_ESTATE_FACILITY_NOT_FOUND',
  'REAL_ESTATE_RESPONSIBLE_AMBIGUOUS',
  'REAL_ESTATE_RESPONSIBLE_NOT_FOUND',
  'REAL_ESTATE_HOURS_INVALID',
  'REAL_ESTATE_PHONE_INVALID',
  // Spaces
  'REAL_ESTATE_SPACE_TITLE_REQUIRED',
  'REAL_ESTATE_SPACE_TITLE_TOO_LONG',
  'REAL_ESTATE_SPACE_DESCRIPTION_TOO_LONG',
  'REAL_ESTATE_SPACE_NOT_FOUND',
  'REAL_ESTATE_PRICE_INVALID',
  'REAL_ESTATE_SIZE_INVALID',
  'REAL_ESTATE_STATUS_INVALID',
  // Photos
  'REAL_ESTATE_PHOTOS_TOO_MANY',
  'REAL_ESTATE_PHOTO_DUPLICATE',
  'REAL_ESTATE_PHOTO_MISSING',
  'REAL_ESTATE_PHOTO_TOO_LARGE',
  'REAL_ESTATE_PHOTO_TYPE_UNSUPPORTED',
  // Ordering
  'REAL_ESTATE_REORDER_MISMATCH',
] as const;
export type RealEstateErrorCode = (typeof REAL_ESTATE_ERROR_CODES)[number];

/**
 * The sentence each refusal shows an operator.
 *
 * Written for the person who hit it, naming the fix rather than the rule, and
 * kept here so the portal never has to invent wording for a code it did not
 * expect.
 */
export const REAL_ESTATE_ERROR_MESSAGES: Record<RealEstateErrorCode, string> = {
  REAL_ESTATE_FLOOR_NAME_REQUIRED: 'Give the floor a name.',
  REAL_ESTATE_FLOOR_NAME_TOO_LONG: `A floor name can be at most ${RE_FLOOR_NAME_MAX_LENGTH} characters.`,
  REAL_ESTATE_FLOOR_NAME_TAKEN: 'A floor with that name already exists.',
  REAL_ESTATE_FLOOR_NOT_FOUND: 'That floor no longer exists.',
  REAL_ESTATE_FLOOR_IN_USE:
    'This floor still has facilities or spaces on it. Move them first, or hide the floor instead.',
  REAL_ESTATE_FLOOR_REQUIRED: 'Choose the floor this space is on.',
  REAL_ESTATE_FACILITY_NAME_REQUIRED: 'Give the facility a name.',
  REAL_ESTATE_FACILITY_NAME_TOO_LONG: `A facility name can be at most ${RE_FACILITY_NAME_MAX_LENGTH} characters.`,
  REAL_ESTATE_TAGLINE_TOO_LONG: `A tagline can be at most ${RE_FACILITY_TAGLINE_MAX_LENGTH} characters.`,
  REAL_ESTATE_DESCRIPTION_TOO_LONG: `A description can be at most ${RE_FACILITY_DESCRIPTION_MAX_LENGTH} characters.`,
  REAL_ESTATE_SERVICES_TOO_MANY: `List at most ${RE_SERVICES_MAX} services.`,
  REAL_ESTATE_SERVICE_TOO_LONG: `Each service can be at most ${RE_SERVICE_MAX_LENGTH} characters.`,
  REAL_ESTATE_FACILITY_NOT_FOUND: 'That facility no longer exists.',
  REAL_ESTATE_RESPONSIBLE_AMBIGUOUS:
    'Name a responsible person either by choosing a member or by typing a name, not both.',
  REAL_ESTATE_RESPONSIBLE_NOT_FOUND: 'That member no longer exists.',
  REAL_ESTATE_HOURS_INVALID:
    'Check the opening hours: each day needs either "closed" or both an opening and a closing time, and the two cannot be the same.',
  REAL_ESTATE_PHONE_INVALID:
    'Enter the number in full international form, e.g. +256700123456.',
  REAL_ESTATE_SPACE_TITLE_REQUIRED: 'Give the space a title.',
  REAL_ESTATE_SPACE_TITLE_TOO_LONG: `A title can be at most ${RE_SPACE_TITLE_MAX_LENGTH} characters.`,
  REAL_ESTATE_SPACE_DESCRIPTION_TOO_LONG: `A description can be at most ${RE_SPACE_DESCRIPTION_MAX_LENGTH} characters.`,
  REAL_ESTATE_SPACE_NOT_FOUND: 'That space no longer exists.',
  REAL_ESTATE_PRICE_INVALID: `Enter a whole number of shillings up to ${RE_SPACE_PRICE_MAX_UGX}, or leave it blank for "price on enquiry".`,
  REAL_ESTATE_SIZE_INVALID: `Enter a size between ${RE_SPACE_SIZE_MIN_SQM} and ${RE_SPACE_SIZE_MAX_SQM} square metres.`,
  REAL_ESTATE_STATUS_INVALID: 'That is not a letting status this app knows.',
  REAL_ESTATE_PHOTOS_TOO_MANY: `Upload at most ${RE_PHOTOS_MAX} photos.`,
  REAL_ESTATE_PHOTO_DUPLICATE: 'That photo is already in this gallery.',
  REAL_ESTATE_PHOTO_MISSING:
    'One of the photos did not finish uploading. Try it again.',
  REAL_ESTATE_PHOTO_TOO_LARGE: `Each photo must be under ${Math.round(RE_PHOTO_MAX_BYTES / (1024 * 1024))} MB.`,
  REAL_ESTATE_PHOTO_TYPE_UNSUPPORTED: 'Photos must be JPEG, PNG or WebP.',
  REAL_ESTATE_REORDER_MISMATCH:
    'That list changed while you were reordering it. Reload and try again.',
};

/** True only for a code this feature defines. */
export function isRealEstateErrorCode(
  value: string,
): value is RealEstateErrorCode {
  return (REAL_ESTATE_ERROR_CODES as readonly string[]).includes(value);
}

/** The sentence for a code, or a safe fallback for anything unrecognised. */
export function realEstateErrorMessage(code: string): string {
  return isRealEstateErrorCode(code)
    ? REAL_ESTATE_ERROR_MESSAGES[code]
    : 'Something went wrong. Try again.';
}
