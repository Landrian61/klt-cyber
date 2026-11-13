import { describe, expect, it } from 'vitest';
import {
  ATTENTION_LIST_SIZE,
  FOLLOW_UP_AGE_BUCKETS,
  FOLLOW_UP_OVERDUE_DAYS,
  followUpAgeBucket,
  BADGE_CAP,
  badgeLabel,
  CONTACT_ON_TIME_DAYS,
  DASHBOARD_PERIODS,
  PERSONAL_CONTACT_CHANNELS,
  changeAgainst,
  dashboardWindow,
  daysBetweenKeys,
  isContactOnTime,
  isOnTimeEligible,
  medianOf,
  parseDashboardPeriod,
  percentOf,
} from '../hospitalityDashboard';
import { daysInRange } from '../hospitality';

describe('parseDashboardPeriod (AC-5)', () => {
  it('keeps a known period', () => {
    for (const period of DASHBOARD_PERIODS) expect(parseDashboardPeriod(period)).toBe(period);
  });
  it('reads missing or unknown as 12w', () => {
    expect(parseDashboardPeriod(null)).toBe('12w');
    expect(parseDashboardPeriod(undefined)).toBe('12w');
    expect(parseDashboardPeriod('')).toBe('12w');
    expect(parseDashboardPeriod('1y')).toBe('12w');
    expect(parseDashboardPeriod('12W')).toBe('12w');
  });
});

describe('daysBetweenKeys (AC-6)', () => {
  it('is signed and not inclusive', () => {
    expect(daysBetweenKeys('2026-11-13', '2026-11-13')).toBe(0);
    expect(daysBetweenKeys('2026-11-13', '2026-11-15')).toBe(2);
    expect(daysBetweenKeys('2026-11-15', '2026-11-13')).toBe(-2);
  });
  it('crosses a month and a year', () => {
    expect(daysBetweenKeys('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenKeys('2028-02-28', '2028-03-01')).toBe(2);
  });
});

describe('dashboardWindow (AC-6)', () => {
  // Friday 13 November 2026; its week starts Sunday 8 November.
  const today = '2026-11-13';

  it('4 weeks starts on the Sunday 3 weeks before this week', () => {
    const w = dashboardWindow(today, '4w');
    expect(w).toMatchObject({ from: '2026-10-18', to: today });
    expect(new Date(`${w.from}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it('12 weeks starts on the Sunday 11 weeks before this week', () => {
    expect(dashboardWindow(today, '12w')).toMatchObject({ from: '2026-08-23', to: today });
  });

  it('6 months starts on the 1st, 5 months back, across a year', () => {
    expect(dashboardWindow(today, '6m').from).toBe('2026-06-01');
    expect(dashboardWindow('2027-02-10', '6m').from).toBe('2026-09-01');
    expect(dashboardWindow('2027-05-31', '6m').from).toBe('2026-12-01');
  });

  // The AC-6 rule gives 152 days at the shortest (1 November to 1 April)
  // and 184 at the longest (1 March to 31 August).
  it('a 6 month window is 152 to 184 days long', () => {
    expect(daysInRange(dashboardWindow('2027-04-01', '6m').from, '2027-04-01')).toBe(152);
    expect(daysInRange(dashboardWindow('2026-08-31', '6m').from, '2026-08-31')).toBe(184);
    for (const day of ['2027-03-01', '2027-03-31', '2026-08-31', '2026-01-01']) {
      const w = dashboardWindow(day, '6m');
      const days = daysInRange(w.from, w.to);
      expect(days).toBeGreaterThanOrEqual(152);
      expect(days).toBeLessThanOrEqual(184);
    }
  });

  it('the previous window has the same length and ends the day before', () => {
    for (const period of DASHBOARD_PERIODS) {
      const w = dashboardWindow(today, period);
      expect(daysInRange(w.previous.from, w.previous.to)).toBe(daysInRange(w.from, w.to));
      expect(daysBetweenKeys(w.previous.to, w.from)).toBe(1);
    }
  });

  it('on a Sunday the current week is one day long', () => {
    // Sunday 15 November 2026.
    const w = dashboardWindow('2026-11-15', '4w');
    expect(w.from).toBe('2026-10-25');
    expect(daysInRange(w.from, w.to)).toBe(22);
    expect(w.previous).toEqual({ from: '2026-10-03', to: '2026-10-24' });
  });

  it('refuses an invalid today', () => {
    expect(() => dashboardWindow('2026-13-01', '4w')).toThrow();
  });
});

describe('personal contact and on time (AC-8)', () => {
  it('never counts in app', () => {
    expect(PERSONAL_CONTACT_CHANNELS).toEqual(['call', 'whatsapp', 'sms', 'in_person']);
    expect((PERSONAL_CONTACT_CHANNELS as readonly string[]).includes('in_app')).toBe(false);
  });

  it('day 2 is not eligible, day 3 is', () => {
    expect(CONTACT_ON_TIME_DAYS).toBe(2);
    expect(isOnTimeEligible('2026-11-08', '2026-11-10')).toBe(false);
    expect(isOnTimeEligible('2026-11-08', '2026-11-11')).toBe(true);
  });

  it('a contact up to day 2 is on time, day 3 is late', () => {
    expect(isContactOnTime('2026-11-08', '2026-11-08')).toBe(true);
    expect(isContactOnTime('2026-11-08', '2026-11-10')).toBe(true);
    expect(isContactOnTime('2026-11-08', '2026-11-11')).toBe(false);
    expect(isContactOnTime('2026-11-08', '2026-11-07')).toBe(false);
  });
});

describe('medianOf', () => {
  it('is null for nothing', () => expect(medianOf([])).toBeNull());
  it('takes the middle of an odd count, unsorted', () => expect(medianOf([5, 0, 2])).toBe(2));
  it('averages the middle two of an even count', () => expect(medianOf([0, 1, 4, 9])).toBe(2.5));
});

describe('percentOf', () => {
  it('rounds and is null with no whole', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe('changeAgainst (AC-7)', () => {
  it('a count gives the percent change', () => {
    expect(changeAgainst(15, 10)).toBe(50);
    expect(changeAgainst(5, 10)).toBe(-50);
    expect(changeAgainst(10, 10)).toBe(0);
  });
  it('a count has no change against 0', () => {
    expect(changeAgainst(4, 0)).toBeNull();
  });
  it('a percent gives the difference in points', () => {
    expect(changeAgainst(60, 45, 'points')).toBe(15);
    expect(changeAgainst(40, 45, 'points')).toBe(-5);
    expect(changeAgainst(0, 0, 'points')).toBe(0);
  });
  it('a percent has no change when either side had no one', () => {
    expect(changeAgainst(50, null, 'points')).toBeNull();
    expect(changeAgainst(null, 50, 'points')).toBeNull();
  });
});

describe('badgeLabel (AC-22)', () => {
  it('hides a zero and shows a count', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(null)).toBeNull();
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(99)).toBe('99');
  });
  it('reads 99+ from the cap up', () => {
    expect(BADGE_CAP).toBe(100);
    expect(badgeLabel(BADGE_CAP)).toBe('99+');
    expect(badgeLabel(250)).toBe('99+');
  });
});

describe('followUpAgeBucket (AC-9)', () => {
  it('groups days waiting at each edge', () => {
    expect([0, 2, 3, 7, 8, 14, 15, 40].map(followUpAgeBucket)).toEqual([
      '0-2', '0-2', '3-7', '3-7', '8-14', '8-14', '15+', '15+',
    ]);
  });
  it('the last group starts at the overdue mark', () => {
    expect(FOLLOW_UP_OVERDUE_DAYS).toBe(15);
    expect(FOLLOW_UP_AGE_BUCKETS.at(-1)).toBe('15+');
    expect(followUpAgeBucket(FOLLOW_UP_OVERDUE_DAYS - 1)).toBe('8-14');
  });
  it('lists five', () => expect(ATTENTION_LIST_SIZE).toBe(5));
});

describe('trend helpers (AC-11, AC-12, AC-14)', () => {
  it('names seven journey steps, first visit first', async () => {
    const { VISITOR_JOURNEY_STEPS, VISITOR_JOURNEY_STEP_LABELS } = await import(
      '../hospitalityDashboard'
    );
    expect(VISITOR_JOURNEY_STEPS).toHaveLength(7);
    expect(VISITOR_JOURNEY_STEPS[0]).toBe('first_visit');
    expect(VISITOR_JOURNEY_STEPS.at(-1)).toBe('member');
    for (const step of VISITOR_JOURNEY_STEPS) expect(VISITOR_JOURNEY_STEP_LABELS[step]).toBeTruthy();
  });

  it('a linked member wins over a typed name; a blank name is none', async () => {
    const { invitedSourceOf, INVITED_SOURCE_LABELS } = await import('../hospitalityDashboard');
    expect(invitedSourceOf({ invitedByUserId: 'u1', invitedByText: 'Sam' })).toBe('member');
    expect(invitedSourceOf({ invitedByText: 'Sam' })).toBe('name');
    expect(invitedSourceOf({ invitedByText: '   ' })).toBe('none');
    expect(invitedSourceOf({})).toBe('none');
    expect(INVITED_SOURCE_LABELS.none).toBe('Not recorded');
  });

  it('marks the bin holding today as so far, both ends included', async () => {
    const { isBinSoFar } = await import('../hospitalityDashboard');
    const bin = { start: '2026-11-15', end: '2026-11-21' };
    expect(isBinSoFar(bin, '2026-11-15')).toBe(true);
    expect(isBinSoFar(bin, '2026-11-21')).toBe(true);
    expect(isBinSoFar(bin, '2026-11-14')).toBe(false);
    expect(isBinSoFar(bin, '2026-11-22')).toBe(false);
  });
});
