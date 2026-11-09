import { describe, expect, it } from 'vitest';

import {
  emptyOpeningHours,
  facilityHiddenReason,
  formatMinutesOfDay,
  formatOpeningHoursEntry,
  formatSpacePrice,
  formatSpaceSize,
  isFacilityIncomplete,
  isFacilityOpenNow,
  isRealEstateErrorCode,
  isRealEstatePhotoContentType,
  isRealEstateSpaceStatus,
  isValidSpacePrice,
  isValidSpaceSize,
  normalizeFloorName,
  openingHoursError,
  realEstateErrorMessage,
  REAL_ESTATE_DEPARTMENT_NAME,
  REAL_ESTATE_ERROR_CODES,
  REAL_ESTATE_ERROR_MESSAGES,
  REAL_ESTATE_FEED_ACTIONS,
  REAL_ESTATE_LIST_CAP,
  REAL_ESTATE_TARGET_TYPES,
  RE_DAYS_PER_WEEK,
  RE_FACILITY_DESCRIPTION_MAX_LENGTH,
  RE_FACILITY_NAME_MAX_LENGTH,
  RE_FACILITY_TAGLINE_MAX_LENGTH,
  RE_FLOOR_NAME_MAX_LENGTH,
  RE_HIDDEN_REASON_LABELS,
  RE_MINUTE_MAX,
  RE_OPEN_STATE_LABELS,
  RE_PHOTOS_MAX,
  RE_PHOTO_CONTENT_TYPES,
  RE_PHOTO_MAX_BYTES,
  RE_PRICE_ON_ENQUIRY_LABEL,
  RE_SERVICES_MAX,
  RE_SERVICE_MAX_LENGTH,
  RE_SPACE_DESCRIPTION_MAX_LENGTH,
  RE_SPACE_PRICE_MAX_UGX,
  RE_SPACE_SIZE_MAX_SQM,
  RE_SPACE_SIZE_MIN_SQM,
  RE_SPACE_STATUSES,
  RE_SPACE_STATUS_LABELS,
  RE_SPACE_TITLE_MAX_LENGTH,
  RE_WEEKDAYS,
  RE_WEEKDAY_DISPLAY_ORDER,
  RE_WEEKDAY_LABELS,
  type RealEstateOpeningHoursEntry,
} from '../realEstate';
import { formatUgx } from '../library';
import { KAMPALA_UTC_OFFSET_MS } from '../weeklyPrograms';

/**
 * The epoch milliseconds of a wall-clock moment in Kampala.
 *
 * Built by treating the parts as UTC and shifting back by the fixed +3, which
 * is the inverse of what `isFacilityOpenNow` does, so a test can name "Sunday
 * 23:30 in Kampala" without depending on the machine running it.
 */
function kampala(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - KAMPALA_UTC_OFFSET_MS;
}

/** Seven entries with one weekday open for the given window. */
function hoursWithOpenDay(
  weekday: number,
  openMinutes: number,
  closeMinutes: number,
): RealEstateOpeningHoursEntry[] {
  return emptyOpeningHours().map((entry) =>
    entry.weekday === weekday
      ? { weekday: entry.weekday, closed: false, openMinutes, closeMinutes }
      : entry,
  );
}

// 2026-11-08 is a Sunday and 2026-11-09 is a Monday. Every clock test below
// leans on that pair, because the overnight bug this feature can have lives
// exactly on the boundary between them.
const SUNDAY = 0;
const MONDAY = 1;

describe('the Real Estate department name (AC-24)', () => {
  it('is exactly the string the seed writes', () => {
    // A Convex test holds this against a real seeded `departments` row. If the
    // two ever drift, the scoped capability silently reads false for everyone
    // except a System Admin and nobody sees an error, which is why this is
    // pinned here as a literal rather than derived from anything.
    expect(REAL_ESTATE_DEPARTMENT_NAME).toBe('Real Estate');
  });
});

describe('the caps and bounds (AC-24)', () => {
  it('matches the values the spec fixes', () => {
    expect(RE_FACILITY_NAME_MAX_LENGTH).toBe(120);
    expect(RE_FACILITY_TAGLINE_MAX_LENGTH).toBe(160);
    expect(RE_FACILITY_DESCRIPTION_MAX_LENGTH).toBe(2000);
    expect(RE_FLOOR_NAME_MAX_LENGTH).toBe(60);
    expect(RE_SPACE_TITLE_MAX_LENGTH).toBe(160);
    expect(RE_SPACE_DESCRIPTION_MAX_LENGTH).toBe(2000);
    expect(RE_SERVICES_MAX).toBe(12);
    expect(RE_SERVICE_MAX_LENGTH).toBe(60);
    expect(RE_PHOTOS_MAX).toBe(6);
    expect(RE_PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(RE_SPACE_PRICE_MAX_UGX).toBe(100_000_000);
    expect(RE_SPACE_SIZE_MIN_SQM).toBe(0.1);
    expect(RE_SPACE_SIZE_MAX_SQM).toBe(100_000);
    expect(REAL_ESTATE_LIST_CAP).toBe(200);
  });
});

describe('the photo content type allowlist (AC-11)', () => {
  it('accepts the three web-renderable types', () => {
    expect(RE_PHOTO_CONTENT_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(isRealEstatePhotoContentType('image/jpeg')).toBe(true);
    expect(isRealEstatePhotoContentType('image/png')).toBe(true);
    expect(isRealEstatePhotoContentType('image/webp')).toBe(true);
  });

  it('refuses HEIC deliberately, because no browser renders it', () => {
    expect(isRealEstatePhotoContentType('image/heic')).toBe(false);
    expect(isRealEstatePhotoContentType('image/heif')).toBe(false);
  });

  it('refuses a document wearing an image name', () => {
    expect(isRealEstatePhotoContentType('application/pdf')).toBe(false);
    expect(isRealEstatePhotoContentType('image/svg+xml')).toBe(false);
    expect(isRealEstatePhotoContentType('')).toBe(false);
  });
});

describe('the space status union (AC-16)', () => {
  it('is exactly available, reserved and let', () => {
    expect(RE_SPACE_STATUSES).toEqual(['available', 'reserved', 'let']);
  });

  it('labels every status', () => {
    for (const status of RE_SPACE_STATUSES) {
      expect(RE_SPACE_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('recognises only its own statuses', () => {
    expect(isRealEstateSpaceStatus('available')).toBe(true);
    expect(isRealEstateSpaceStatus('let')).toBe(true);
    expect(isRealEstateSpaceStatus('sold')).toBe(false);
    expect(isRealEstateSpaceStatus('')).toBe(false);
  });
});

describe('the error codes (AC-24)', () => {
  it('has no duplicate code', () => {
    expect(new Set(REAL_ESTATE_ERROR_CODES).size).toBe(
      REAL_ESTATE_ERROR_CODES.length,
    );
  });

  it('gives every code a sentence', () => {
    for (const code of REAL_ESTATE_ERROR_CODES) {
      expect(REAL_ESTATE_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });

  it('carries no message for a code it does not define', () => {
    expect(Object.keys(REAL_ESTATE_ERROR_MESSAGES).sort()).toEqual(
      [...REAL_ESTATE_ERROR_CODES].sort(),
    );
  });

  it('recognises its own codes and nothing else', () => {
    expect(isRealEstateErrorCode('REAL_ESTATE_FLOOR_IN_USE')).toBe(true);
    expect(isRealEstateErrorCode('LIBRARY_FILE_REQUIRED')).toBe(false);
  });

  it('falls back to a safe sentence rather than showing a bare code', () => {
    expect(realEstateErrorMessage('REAL_ESTATE_FLOOR_NAME_TAKEN')).toBe(
      'A floor with that name already exists.',
    );
    const unknown = realEstateErrorMessage('SOMETHING_ELSE_ENTIRELY');
    expect(unknown).toBe('Something went wrong. Try again.');
    expect(unknown).not.toContain('SOMETHING_ELSE_ENTIRELY');
  });
});

describe('the activity log actions (AC-14)', () => {
  it('keeps the two action names that already have rows written', () => {
    // Renaming either would orphan every row written before spec 0018.
    expect(REAL_ESTATE_FEED_ACTIONS).toContain('facility.created');
    expect(REAL_ESTATE_FEED_ACTIONS).toContain('facility.updated');
  });

  it('names all fourteen writes the spec lists', () => {
    expect(REAL_ESTATE_FEED_ACTIONS).toHaveLength(14);
    expect(new Set(REAL_ESTATE_FEED_ACTIONS).size).toBe(14);
  });

  it('keeps the facility target type the existing rows already use', () => {
    // `convex/facilities.ts` wrote this exact string before spec 0018, so the
    // rows logged either side of this feature resolve against one target.
    expect(REAL_ESTATE_TARGET_TYPES.facility).toBe('facilities');
  });

  it('names its own two tables for the other two targets', () => {
    expect(REAL_ESTATE_TARGET_TYPES.floor).toBe('realEstateFloors');
    expect(REAL_ESTATE_TARGET_TYPES.space).toBe('realEstateSpaces');
  });
});

describe('the weekday model (AC-10)', () => {
  it('numbers Sunday as 0, matching getDay()', () => {
    expect(RE_WEEKDAYS[0]).toBe(0);
    expect(RE_WEEKDAY_LABELS[0]).toBe('Sunday');
    expect(RE_WEEKDAY_LABELS[1]).toBe('Monday');
    expect(RE_DAYS_PER_WEEK).toBe(7);
  });

  it('displays the week Monday first while storing Sunday as 0', () => {
    expect(RE_WEEKDAY_DISPLAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
    // Same seven days, different reading order: a presentation choice, not a
    // second model.
    expect([...RE_WEEKDAY_DISPLAY_ORDER].sort()).toEqual([...RE_WEEKDAYS].sort());
  });

  it('starts the editor with seven closed days', () => {
    const fresh = emptyOpeningHours();
    expect(fresh).toHaveLength(7);
    expect(fresh.every((entry) => entry.closed)).toBe(true);
    expect(fresh.map((entry) => entry.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('hands out a new array each time, so two open dialogs cannot share one', () => {
    const first = emptyOpeningHours();
    const second = emptyOpeningHours();
    expect(first).not.toBe(second);
    first[0].closed = false;
    expect(second[0].closed).toBe(true);
  });
});

describe('opening hours validation (AC-10)', () => {
  it('accepts seven well-formed entries', () => {
    expect(openingHoursError(hoursWithOpenDay(MONDAY, 540, 1020))).toBeNull();
  });

  it('accepts absent hours, which simply means none were recorded', () => {
    expect(openingHoursError(undefined)).toBeNull();
  });

  it('accepts an all-day facility spelled 0 to 1439', () => {
    expect(openingHoursError(hoursWithOpenDay(MONDAY, 0, RE_MINUTE_MAX))).toBeNull();
  });

  it('accepts an overnight window, which is a real thing', () => {
    expect(openingHoursError(hoursWithOpenDay(SUNDAY, 1320, 120))).toBeNull();
  });

  it('refuses an open equal to its close as ambiguous', () => {
    // It reads equally as zero-length and as all day, and all day already has
    // an unambiguous spelling.
    expect(openingHoursError(hoursWithOpenDay(MONDAY, 600, 600))).toBe(
      'REAL_ESTATE_HOURS_INVALID',
    );
  });

  it('refuses a weekday that is absent', () => {
    const six = emptyOpeningHours().slice(0, 6);
    expect(openingHoursError(six)).toBe('REAL_ESTATE_HOURS_INVALID');
  });

  it('refuses a weekday that is duplicated', () => {
    const duped = emptyOpeningHours();
    duped[6] = { weekday: 0, closed: true };
    expect(openingHoursError(duped)).toBe('REAL_ESTATE_HOURS_INVALID');
  });

  it('refuses a minute outside the day', () => {
    expect(openingHoursError(hoursWithOpenDay(MONDAY, -1, 600))).toBe(
      'REAL_ESTATE_HOURS_INVALID',
    );
    expect(openingHoursError(hoursWithOpenDay(MONDAY, 600, 1440))).toBe(
      'REAL_ESTATE_HOURS_INVALID',
    );
  });

  it('refuses a non-integer minute', () => {
    expect(openingHoursError(hoursWithOpenDay(MONDAY, 540.5, 1020))).toBe(
      'REAL_ESTATE_HOURS_INVALID',
    );
  });

  it('refuses an open day missing either half of its pair', () => {
    const noClose = emptyOpeningHours();
    noClose[MONDAY] = { weekday: 1, closed: false, openMinutes: 540 };
    expect(openingHoursError(noClose)).toBe('REAL_ESTATE_HOURS_INVALID');

    const noOpen = emptyOpeningHours();
    noOpen[MONDAY] = { weekday: 1, closed: false, closeMinutes: 1020 };
    expect(openingHoursError(noOpen)).toBe('REAL_ESTATE_HOURS_INVALID');
  });

  it('refuses a weekday outside 0 to 6', () => {
    const bad = emptyOpeningHours();
    bad[0] = { weekday: 9 as never, closed: true };
    expect(openingHoursError(bad)).toBe('REAL_ESTATE_HOURS_INVALID');
  });
});

describe('isFacilityOpenNow, a normal window (AC-22)', () => {
  const monday9to5 = hoursWithOpenDay(MONDAY, 540, 1020);

  it('is open inside the window', () => {
    expect(isFacilityOpenNow(monday9to5, kampala(2026, 11, 9, 12))).toBe('open');
  });

  it('is open on the opening minute', () => {
    expect(isFacilityOpenNow(monday9to5, kampala(2026, 11, 9, 9, 0))).toBe('open');
  });

  it('is closed on the closing minute, so the window is half open', () => {
    // 17:00 is when it shuts, not a last minute of trading.
    expect(isFacilityOpenNow(monday9to5, kampala(2026, 11, 9, 17, 0))).toBe(
      'closed',
    );
  });

  it('is closed before it opens and after it shuts', () => {
    expect(isFacilityOpenNow(monday9to5, kampala(2026, 11, 9, 8, 59))).toBe(
      'closed',
    );
    expect(isFacilityOpenNow(monday9to5, kampala(2026, 11, 9, 17, 1))).toBe(
      'closed',
    );
  });

  it('is closed on a day it does not open at all', () => {
    expect(isFacilityOpenNow(monday9to5, kampala(2026, 11, 8, 12))).toBe('closed');
  });
});

describe('isFacilityOpenNow, an overnight window (AC-22)', () => {
  // Open Sunday 22:00 and shutting at 02:00 on Monday. This is the case an
  // implementation that reads only today's entry gets wrong every such
  // morning, while still passing a naive same-day test.
  const sundayNight = hoursWithOpenDay(SUNDAY, 1320, 120);

  it('is open at 23:30 on the Sunday, from that day own entry', () => {
    expect(isFacilityOpenNow(sundayNight, kampala(2026, 11, 8, 23, 30))).toBe(
      'open',
    );
  });

  it('is open at 01:00 on the Monday, read from the PREVIOUS day entry', () => {
    // Monday has no hours of its own. The only way to be right here is to look
    // back at Sunday and notice its window crossed midnight.
    expect(isFacilityOpenNow(sundayNight, kampala(2026, 11, 9, 1, 0))).toBe(
      'open',
    );
  });

  it('is closed at 03:00 on the Monday, once the window has run out', () => {
    expect(isFacilityOpenNow(sundayNight, kampala(2026, 11, 9, 3, 0))).toBe(
      'closed',
    );
  });

  it('is closed at 02:00 on the Monday, the minute it shuts', () => {
    expect(isFacilityOpenNow(sundayNight, kampala(2026, 11, 9, 2, 0))).toBe(
      'closed',
    );
  });

  it('is closed at 21:59 on the Sunday, just before it opens', () => {
    expect(isFacilityOpenNow(sundayNight, kampala(2026, 11, 8, 21, 59))).toBe(
      'closed',
    );
  });

  it('does not leak into a day whose previous day is closed', () => {
    // Tuesday 01:00: Monday is closed, so nothing carries over.
    expect(isFacilityOpenNow(sundayNight, kampala(2026, 11, 10, 1, 0))).toBe(
      'closed',
    );
  });
});

describe('isFacilityOpenNow, absent hours (AC-18, AC-22)', () => {
  it('reads "hours not listed" rather than "closed" when there are none', () => {
    // Calling an unknown schedule "Closed" tells the member something false.
    expect(isFacilityOpenNow(undefined, kampala(2026, 11, 9, 12))).toBe('unknown');
  });

  it('reads "hours not listed" for an empty array too', () => {
    expect(isFacilityOpenNow([], kampala(2026, 11, 9, 12))).toBe('unknown');
  });

  it('reads "closed" when hours exist but every day is shut', () => {
    // This is a real answer, unlike the two above.
    expect(isFacilityOpenNow(emptyOpeningHours(), kampala(2026, 11, 9, 12))).toBe(
      'closed',
    );
  });

  it('labels all three states', () => {
    expect(RE_OPEN_STATE_LABELS.open).toBe('Open now');
    expect(RE_OPEN_STATE_LABELS.closed).toBe('Closed');
    expect(RE_OPEN_STATE_LABELS.unknown).toBe('Hours not listed');
  });
});

describe('isFacilityOpenNow uses the building clock, not the viewer (AC-22)', () => {
  it('reads the Kampala weekday, not the UTC one', () => {
    // Monday 01:00 in Kampala is still SUNDAY 22:00 in UTC. A facility that
    // opens only on Monday morning must read open, which an implementation
    // resolving the weekday in UTC gets wrong.
    const mondayMorning = hoursWithOpenDay(MONDAY, 0, 360);
    const instant = kampala(2026, 11, 9, 1, 0);

    expect(new Date(instant).getUTCDay()).toBe(SUNDAY);
    expect(isFacilityOpenNow(mondayMorning, instant)).toBe('open');
  });

  it('reads the Kampala weekday, not the viewer device weekday', () => {
    // The same instant written three ways, one of them in a far-away offset.
    // All three are the same moment, so all three must agree, which they can
    // only do if the function never consults a local getter.
    const sameInstant = [
      kampala(2026, 11, 9, 1, 0),
      new Date('2026-11-09T01:00:00+03:00').getTime(),
      new Date('2026-11-08T17:00:00-05:00').getTime(),
    ];
    expect(new Set(sameInstant).size).toBe(1);

    const mondayMorning = hoursWithOpenDay(MONDAY, 0, 360);
    for (const instant of sameInstant) {
      expect(isFacilityOpenNow(mondayMorning, instant)).toBe('open');
    }
  });

  it('does not shift the day for a viewer whose own date has already rolled', () => {
    // Sunday 22:00 Kampala is Sunday 19:00 UTC and Monday 04:00 in Tokyo. The
    // building is on Sunday, so Sunday hours apply.
    const sundayEvening = hoursWithOpenDay(SUNDAY, 1200, 1380);
    const instant = kampala(2026, 11, 8, 22, 0);
    expect(isFacilityOpenNow(sundayEvening, instant)).toBe('open');

    const mondayEvening = hoursWithOpenDay(MONDAY, 1200, 1380);
    expect(isFacilityOpenNow(mondayEvening, instant)).toBe('closed');
  });

  it('is open all day for a 0 to 1439 facility', () => {
    const allDay = hoursWithOpenDay(MONDAY, 0, RE_MINUTE_MAX);
    expect(isFacilityOpenNow(allDay, kampala(2026, 11, 9, 0, 0))).toBe('open');
    expect(isFacilityOpenNow(allDay, kampala(2026, 11, 9, 23, 58))).toBe('open');
  });
});

describe('formatting hours (AC-19)', () => {
  it('reads minutes as a twelve-hour clock', () => {
    expect(formatMinutesOfDay(0)).toBe('12:00 am');
    expect(formatMinutesOfDay(540)).toBe('9:00 am');
    expect(formatMinutesOfDay(720)).toBe('12:00 pm');
    expect(formatMinutesOfDay(1020)).toBe('5:00 pm');
    expect(formatMinutesOfDay(1439)).toBe('11:59 pm');
  });

  it('reads a closed day as Closed', () => {
    expect(formatOpeningHoursEntry({ weekday: 1, closed: true })).toBe('Closed');
  });

  it('reads an ordinary day as a range', () => {
    expect(
      formatOpeningHoursEntry({
        weekday: 1,
        closed: false,
        openMinutes: 540,
        closeMinutes: 1020,
      }),
    ).toBe('9:00 am to 5:00 pm');
  });

  it('marks an overnight range, so it does not look like a typo', () => {
    expect(
      formatOpeningHoursEntry({
        weekday: 0,
        closed: false,
        openMinutes: 1320,
        closeMinutes: 120,
      }),
    ).toBe('10:00 pm to 2:00 am (next day)');
  });
});

describe('a space price and size (AC-15, AC-20)', () => {
  it('formats a rent the same way every other shilling in the app reads', () => {
    expect(formatSpacePrice(1_200_000)).toBe('USh 1,200,000');
    expect(formatSpacePrice(1_200_000)).toBe(formatUgx(1_200_000));
  });

  it('reads "price on enquiry" when there is no rent recorded', () => {
    expect(formatSpacePrice(undefined)).toBe(RE_PRICE_ON_ENQUIRY_LABEL);
    expect(formatSpacePrice(null)).toBe('Price on enquiry');
  });

  it('still formats a zero rent as money rather than as absent', () => {
    // Zero is a recorded decision ("free"), not a missing value.
    expect(formatSpacePrice(0)).toBe('USh 0');
  });

  it('accepts a whole number of shillings in range', () => {
    expect(isValidSpacePrice(0)).toBe(true);
    expect(isValidSpacePrice(1_200_000)).toBe(true);
    expect(isValidSpacePrice(RE_SPACE_PRICE_MAX_UGX)).toBe(true);
  });

  it('refuses a fractional, negative or oversized rent', () => {
    expect(isValidSpacePrice(1000.5)).toBe(false);
    expect(isValidSpacePrice(-1)).toBe(false);
    expect(isValidSpacePrice(RE_SPACE_PRICE_MAX_UGX + 1)).toBe(false);
    expect(isValidSpacePrice(Number.NaN)).toBe(false);
  });

  it('accepts a fractional area in range', () => {
    expect(isValidSpaceSize(RE_SPACE_SIZE_MIN_SQM)).toBe(true);
    expect(isValidSpaceSize(48.5)).toBe(true);
    expect(isValidSpaceSize(RE_SPACE_SIZE_MAX_SQM)).toBe(true);
  });

  it('refuses an area outside the bounds', () => {
    expect(isValidSpaceSize(0)).toBe(false);
    expect(isValidSpaceSize(0.09)).toBe(false);
    expect(isValidSpaceSize(RE_SPACE_SIZE_MAX_SQM + 1)).toBe(false);
    expect(isValidSpaceSize(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('formats an area without a pointless trailing zero', () => {
    expect(formatSpaceSize(48)).toBe('48 sqm');
    expect(formatSpaceSize(48.5)).toBe('48.5 sqm');
    expect(formatSpaceSize(48.04)).toBe('48 sqm');
  });
});

describe('why a facility is not in the app (AC-7, AC-18)', () => {
  const visible = {
    active: true,
    floorId: 'floor_1',
    floorHidden: false,
    contactPhone: '+256700123456',
  };

  it('gives no reason for a facility that IS in the app', () => {
    expect(facilityHiddenReason(visible)).toBeNull();
  });

  it('reports a WhatsApp-only facility as visible, since one number is enough', () => {
    expect(
      facilityHiddenReason({
        active: true,
        floorId: 'floor_1',
        contactWhatsapp: '+256700123456',
      }),
    ).toBeNull();
  });

  it('names each of the four reasons', () => {
    expect(facilityHiddenReason({ ...visible, active: false })).toBe('hidden');
    expect(facilityHiddenReason({ ...visible, floorHidden: true })).toBe(
      'floor_hidden',
    );
    expect(facilityHiddenReason({ ...visible, floorId: undefined })).toBe(
      'unplaced',
    );
    expect(facilityHiddenReason({ ...visible, contactPhone: undefined })).toBe(
      'no_contact',
    );
  });

  it('reports the FIRST reason, so the operator gets one fix not a list', () => {
    // A facility that is hidden AND unplaced AND has no contact reads
    // "Hidden", because that is the one to deal with first.
    expect(
      facilityHiddenReason({
        active: false,
        floorId: undefined,
        floorHidden: true,
      }),
    ).toBe('hidden');

    expect(
      facilityHiddenReason({
        active: true,
        floorId: 'floor_1',
        floorHidden: true,
        contactPhone: undefined,
      }),
    ).toBe('floor_hidden');
  });

  it('labels every reason', () => {
    expect(RE_HIDDEN_REASON_LABELS.hidden).toBe('Hidden');
    expect(RE_HIDDEN_REASON_LABELS.floor_hidden).toBe('Floor hidden');
    expect(RE_HIDDEN_REASON_LABELS.unplaced).toBe('Not yet placed');
    expect(RE_HIDDEN_REASON_LABELS.no_contact).toBe('Needs a contact');
  });
});

describe('whether a facility is unfinished (AC-4)', () => {
  const complete = {
    floorId: 'floor_1',
    photos: ['tower/a.jpg'],
    openingHours: hoursWithOpenDay(MONDAY, 540, 1020),
    contactPhone: '+256700123456',
  };

  it('does not flag a facility with all four', () => {
    expect(isFacilityIncomplete(complete)).toBe(false);
  });

  it('flags a missing contact, photo, hours or floor', () => {
    expect(isFacilityIncomplete({ ...complete, contactPhone: undefined })).toBe(
      true,
    );
    expect(isFacilityIncomplete({ ...complete, photos: undefined })).toBe(true);
    expect(isFacilityIncomplete({ ...complete, openingHours: undefined })).toBe(
      true,
    );
    expect(isFacilityIncomplete({ ...complete, floorId: undefined })).toBe(true);
  });

  it('treats an empty photos array the same as an absent one', () => {
    expect(isFacilityIncomplete({ ...complete, photos: [] })).toBe(true);
  });

  it('counts an unplaced facility as incomplete, so the card agrees with the page', () => {
    // This is the reading that makes the dashboard count and the
    // "Not yet placed" group tell the same story.
    expect(isFacilityIncomplete({ ...complete, floorId: undefined })).toBe(true);
  });

  it('counts a facility with no hours as incomplete, though it IS in the app', () => {
    // The two questions are different: AC-18 lets it through to the app
    // reading "Hours not listed", and AC-4 still wants it finished.
    const noHours = { ...complete, openingHours: undefined };
    expect(isFacilityIncomplete(noHours)).toBe(true);
    expect(
      facilityHiddenReason({
        active: true,
        floorId: 'floor_1',
        contactPhone: '+256700123456',
      }),
    ).toBeNull();
  });
});

describe('floor name uniqueness (AC-5)', () => {
  it('collapses case and internal whitespace, so near-duplicates collide', () => {
    expect(normalizeFloorName('First Floor')).toBe(
      normalizeFloorName('first  floor'),
    );
    expect(normalizeFloorName('  Ground Floor  ')).toBe('ground floor');
  });

  it('keeps genuinely different names apart', () => {
    expect(normalizeFloorName('First Floor')).not.toBe(
      normalizeFloorName('Second Floor'),
    );
  });

  it('reduces a whitespace-only name to nothing, so it reads as absent', () => {
    expect(normalizeFloorName('   ')).toBe('');
  });
});
