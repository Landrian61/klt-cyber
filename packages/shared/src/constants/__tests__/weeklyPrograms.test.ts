import { describe, expect, it } from 'vitest';
import {
  KAMPALA_UTC_OFFSET_MS,
  PROGRAM_CANCELLATION_REASON_MAX_LENGTH,
  formatOccurrenceDate,
  isPastOccurrence,
  kampalaToday,
} from '../weeklyPrograms';

describe('PROGRAM_CANCELLATION_REASON_MAX_LENGTH (spec 0009, AC-1)', () => {
  // The point of this test: the cap is imported by both the Convex mutation
  // and the admin dialog precisely so the two cannot drift. If someone changes
  // it, that is fine, but it should be a deliberate change to one named value,
  // not a number quietly retyped in one of the two places.
  it('is 200 characters', () => {
    expect(PROGRAM_CANCELLATION_REASON_MAX_LENGTH).toBe(200);
  });
});

describe('formatOccurrenceDate (spec 0009, the one date wording)', () => {
  it('reads a Kampala calendar day as "Thu 22 Oct"', () => {
    expect(formatOccurrenceDate('2026-10-22')).toBe('Thu 22 Oct');
  });

  it('names the right weekday across a month boundary', () => {
    expect(formatOccurrenceDate('2026-01-01')).toBe('Thu 1 Jan');
    expect(formatOccurrenceDate('2026-12-31')).toBe('Thu 31 Dec');
  });

  it('handles a leap day', () => {
    expect(formatOccurrenceDate('2028-02-29')).toBe('Tue 29 Feb');
  });

  it('drops the leading zero from the day, keeping the stored string padded', () => {
    expect(formatOccurrenceDate('2026-03-05')).toBe('Thu 5 Mar');
  });

  // The real reason this function parses by hand instead of calling
  // `new Date(str)`: the argument is a calendar day, not an instant, so no
  // timezone may touch it. `new Date('2026-10-22')` is UTC midnight, which
  // renders as 21 October anywhere west of Greenwich — the push body and the
  // portal would then name different days for the same cancellation. This test
  // pins the output while the process runs in a zone behind UTC.
  it('names the same day whatever zone the reader is in', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatOccurrenceDate('2026-10-22')).toBe('Thu 22 Oct');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(formatOccurrenceDate('2026-10-22')).toBe('Thu 22 Oct');
    } finally {
      process.env.TZ = original;
    }
  });

  it('returns a malformed value unchanged rather than throwing or printing NaN', () => {
    for (const bad of ['', 'tomorrow', '2026-10', '26-10-22', '2026-13-01', '2026-10-00']) {
      expect(formatOccurrenceDate(bad)).toBe(bad);
    }
  });

  it('rejects a day that does not exist in its month instead of rolling forward', () => {
    // Date.UTC(2026, 1, 30) silently becomes 2 March — a formatter that
    // trusted it would name a day the admin never cancelled.
    expect(formatOccurrenceDate('2026-02-30')).toBe('2026-02-30');
  });
});

describe('kampalaToday / isPastOccurrence (spec 0009, AC-5)', () => {
  // 22 October 2026, 21:30 UTC — already the 23rd in Kampala (UTC+3).
  const lateUtcEvening = Date.UTC(2026, 9, 22, 21, 30);

  it('is the church calendar day, not the UTC one', () => {
    expect(kampalaToday(lateUtcEvening)).toBe('2026-10-23');
  });

  it('is the church calendar day whatever zone the caller is in', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(kampalaToday(lateUtcEvening)).toBe('2026-10-23');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(kampalaToday(lateUtcEvening)).toBe('2026-10-23');
    } finally {
      process.env.TZ = original;
    }
  });

  it('agrees with the offset the backend derives its own from', () => {
    expect(KAMPALA_UTC_OFFSET_MS).toBe(3 * 60 * 60 * 1000);
  });

  // The whole reason this is a day comparison and not an instant comparison:
  // AC-5 lets an admin call off a service that started two hours ago, so
  // "past" has to mean yesterday or earlier and never "already begun".
  it('does not count an occurrence that started earlier today as past', () => {
    const middayKampala = Date.UTC(2026, 9, 22, 9, 0); // 12:00 Kampala
    expect(isPastOccurrence('2026-10-22', middayKampala)).toBe(false);
  });

  it('counts yesterday as past and tomorrow as not', () => {
    const now = Date.UTC(2026, 9, 22, 9, 0);
    expect(isPastOccurrence('2026-10-21', now)).toBe(true);
    expect(isPastOccurrence('2026-10-23', now)).toBe(false);
  });

  // The bug this guards: without a lower bound, "within the next 48 hours"
  // is true of every date in the past, which pre-ticked "Notify members" on
  // a restore and offered to tell the whole church a long-gone date was back
  // on.
  it('counts a date from weeks ago as past', () => {
    expect(isPastOccurrence('2026-10-05', Date.UTC(2026, 9, 22, 9, 0))).toBe(true);
  });

  it('reads the day either side of the Kampala midnight boundary', () => {
    // 21:00 UTC is midnight in Kampala — the first moment of the next day.
    expect(kampalaToday(Date.UTC(2026, 9, 22, 20, 59))).toBe('2026-10-22');
    expect(kampalaToday(Date.UTC(2026, 9, 22, 21, 0))).toBe('2026-10-23');
  });
});
