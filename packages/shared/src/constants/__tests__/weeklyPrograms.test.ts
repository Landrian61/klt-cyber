import { describe, expect, it } from 'vitest';
import {
  KAMPALA_UTC_OFFSET_MS,
  PROGRAM_CANCELLATION_REASON_MAX_LENGTH,
  formatOccurrenceDate,
  isPastOccurrence,
  kampalaMonthKey,
  kampalaMonthStart,
  kampalaMonthWindow,
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

describe('kampalaMonthKey (spec 0017, AC-10, AC-25)', () => {
  // The point of this test: a Library item added late on the last evening of a
  // month belongs to THAT month. 21:00 UTC is Kampala midnight, so the three
  // hours either side of it are exactly where a server that bucketed in UTC,
  // or a browser that bucketed in its own zone, would put the item in the
  // wrong bar. Both trends on the dashboard are twelve of these buckets, so a
  // boundary that slips moves real numbers between two charts.
  it('puts the last evening of a Kampala month in that month', () => {
    // 31 Oct 2026, 23:30 Kampala = 20:30 UTC the same day.
    expect(kampalaMonthKey(Date.UTC(2026, 9, 31, 20, 30))).toBe('2026-10');
    // 21:00 UTC on 31 Oct is already 1 Nov in Kampala.
    expect(kampalaMonthKey(Date.UTC(2026, 9, 31, 21, 0))).toBe('2026-11');
    // And the minute before it is still October.
    expect(kampalaMonthKey(Date.UTC(2026, 9, 31, 20, 59))).toBe('2026-10');
  });

  it('puts the first morning of a Kampala month in that month', () => {
    // 1 Nov 2026, 00:30 Kampala = 21:30 UTC on 31 Oct.
    expect(kampalaMonthKey(Date.UTC(2026, 9, 31, 21, 30))).toBe('2026-11');
    // Midday on the 1st is unambiguous either way; the guard is that it did
    // not get dragged back by the offset.
    expect(kampalaMonthKey(Date.UTC(2026, 10, 1, 12, 0))).toBe('2026-11');
  });

  it('agrees with kampalaToday about which month a day is in', () => {
    const instants = [
      Date.UTC(2026, 0, 1, 0, 0),
      Date.UTC(2026, 9, 31, 20, 59),
      Date.UTC(2026, 9, 31, 21, 0),
      Date.UTC(2026, 11, 31, 21, 0),
    ];
    for (const instant of instants) {
      expect(kampalaMonthKey(instant)).toBe(kampalaToday(instant).slice(0, 7));
    }
  });
});

describe('kampalaMonthStart (spec 0017, AC-25)', () => {
  // The point of this test: the window's lower bound is a `createdAt` a range
  // read starts at, so being three hours out would silently include or drop a
  // whole evening's movements at the oldest edge of the twelve month window.
  it('returns Kampala midnight on the first of the month', () => {
    // 1 Nov 2026 00:00 Kampala is 31 Oct 2026 21:00 UTC.
    expect(kampalaMonthStart(Date.UTC(2026, 10, 17, 9, 0))).toBe(
      Date.UTC(2026, 9, 31, 21, 0),
    );
  });

  it('is idempotent and lands in the month it was asked about', () => {
    const inside = Date.UTC(2026, 10, 17, 9, 0);
    const start = kampalaMonthStart(inside);
    expect(kampalaMonthStart(start)).toBe(start);
    expect(kampalaMonthKey(start)).toBe(kampalaMonthKey(inside));
  });

  it('does not slip a month for an instant in the boundary hours', () => {
    // 20:59 UTC on 31 Oct is still October in Kampala, so the month it starts
    // is October, not November.
    const lateOctober = Date.UTC(2026, 9, 31, 20, 59);
    expect(kampalaMonthKey(kampalaMonthStart(lateOctober))).toBe('2026-10');
    // One minute later it is November, and so is its month start.
    const earlyNovember = Date.UTC(2026, 9, 31, 21, 0);
    expect(kampalaMonthKey(kampalaMonthStart(earlyNovember))).toBe('2026-11');
  });

  it('reaches the offset back across a year boundary', () => {
    // 1 Jan 2027 00:00 Kampala is 31 Dec 2026 21:00 UTC — the case where
    // zeroing the clock in UTC rather than in Kampala would give the wrong
    // year as well as the wrong month.
    expect(kampalaMonthStart(Date.UTC(2026, 11, 31, 21, 30))).toBe(
      Date.UTC(2026, 11, 31, 21, 0),
    );
  });
});

describe('kampalaMonthWindow (spec 0017, AC-10, AC-15)', () => {
  // The point of this test: the series is always exactly `count` points, with
  // the current month last, so a quiet month reads as a zero bar rather than
  // disappearing and shortening the chart.
  it('ends at the current Kampala month and runs oldest first', () => {
    const { keys } = kampalaMonthWindow(Date.UTC(2026, 10, 17, 9, 0), 12);
    expect(keys).toHaveLength(12);
    expect(keys[keys.length - 1]).toBe('2026-11');
    expect(keys[0]).toBe('2025-12');
  });

  it('rolls the year back rather than producing a month zero', () => {
    const { keys } = kampalaMonthWindow(Date.UTC(2026, 1, 15, 9, 0), 12);
    expect(keys).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('starts at the Kampala month start of its oldest key', () => {
    const { keys, startedAt } = kampalaMonthWindow(
      Date.UTC(2026, 10, 17, 9, 0),
      12,
    );
    expect(kampalaMonthKey(startedAt)).toBe(keys[0]);
    expect(kampalaMonthStart(startedAt)).toBe(startedAt);
    // Nothing before the window shares its oldest key.
    expect(kampalaMonthKey(startedAt - 1)).not.toBe(keys[0]);
  });

  it('takes its window from the Kampala month, not the UTC one', () => {
    // 21:00 UTC on 31 Oct is 1 Nov in Kampala, so the window ends at November
    // even though UTC still says October.
    const { keys } = kampalaMonthWindow(Date.UTC(2026, 9, 31, 21, 0), 12);
    expect(keys[keys.length - 1]).toBe('2026-11');
    // One minute earlier it ends at October.
    const earlier = kampalaMonthWindow(Date.UTC(2026, 9, 31, 20, 59), 12);
    expect(earlier.keys[earlier.keys.length - 1]).toBe('2026-10');
  });

  it('handles a single month window', () => {
    const { keys } = kampalaMonthWindow(Date.UTC(2026, 10, 17, 9, 0), 1);
    expect(keys).toEqual(['2026-11']);
  });
});
