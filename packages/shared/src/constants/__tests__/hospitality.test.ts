import { describe, expect, it } from 'vitest';
import {
  HOSPITALITY_DEPARTMENT_NAME,
  HOSPITALITY_ERROR_CODES,
  HOSPITALITY_ERROR_MESSAGES,
  HOSPITALITY_MESSAGE_TEMPLATES,
  HOSPITALITY_TEMPLATE_KEYS,
  REGULAR_VISITS_PER_MONTH,
  buildVisitorSearchName,
  daysInRange,
  fillHospitalityTemplate,
  formatVisitDay,
  hospitalityErrorMessage,
  isAllowedVisitDate,
  isRegularOn,
  kampalaWeekStart,
  previousMonthKey,
  regularMonthFrom,
  reportBins,
  visitCountBucket,
  visitorDisplayName,
} from '../hospitality';
import { ROSTER_PORTAL_DEPARTMENTS } from '../../enums/departments';

describe('HOSPITALITY_DEPARTMENT_NAME (AC-1)', () => {
  it('is the seeded name and a roster portal department', () => {
    expect(HOSPITALITY_DEPARTMENT_NAME).toBe('Hospitality');
    expect(ROSTER_PORTAL_DEPARTMENTS).toContain(HOSPITALITY_DEPARTMENT_NAME);
  });
});

describe('error codes', () => {
  it('has a sentence for every code', () => {
    for (const code of HOSPITALITY_ERROR_CODES) {
      expect(HOSPITALITY_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
  it('falls back for an unknown code', () => {
    expect(hospitalityErrorMessage('NOPE')).toBe('Something went wrong. Try again.');
    expect(hospitalityErrorMessage('HOSPITALITY_VISIT_EXISTS')).toMatch(/already recorded/);
  });
});

describe('isAllowedVisitDate (AC-5)', () => {
  const today = '2026-11-13';
  it('accepts today and exactly 30 days back', () => {
    expect(isAllowedVisitDate('2026-11-13', today)).toBe(true);
    expect(isAllowedVisitDate('2026-10-14', today)).toBe(true);
  });
  it('refuses tomorrow, 31 days back and bad dates', () => {
    expect(isAllowedVisitDate('2026-11-14', today)).toBe(false);
    expect(isAllowedVisitDate('2026-10-13', today)).toBe(false);
    expect(isAllowedVisitDate('2026-02-30', today)).toBe(false);
    expect(isAllowedVisitDate('13/11/2026', today)).toBe(false);
  });
  it('crosses a year boundary', () => {
    expect(isAllowedVisitDate('2025-12-20', '2026-01-05')).toBe(true);
  });
});

describe('regular visitors (AC-10)', () => {
  it('needs the threshold inside one calendar month', () => {
    expect(REGULAR_VISITS_PER_MONTH).toBe(3);
    expect(regularMonthFrom(['2026-10-04', '2026-10-11', '2026-10-18'])).toBe('2026-10');
    expect(regularMonthFrom(['2026-09-27', '2026-10-04', '2026-10-11'])).toBeUndefined();
    expect(regularMonthFrom([])).toBeUndefined();
  });
  it('counts a repeated date once', () => {
    expect(regularMonthFrom(['2026-10-04', '2026-10-04', '2026-10-11'])).toBeUndefined();
  });
  it('picks the latest qualifying month', () => {
    const dates = ['2026-08-02', '2026-08-09', '2026-08-16', '2026-10-04', '2026-10-11', '2026-10-18'];
    expect(regularMonthFrom(dates)).toBe('2026-10');
  });
  it('stays regular through the next month, not the one after', () => {
    expect(isRegularOn('2026-10', '2026-10-31')).toBe(true);
    expect(isRegularOn('2026-10', '2026-11-30')).toBe(true);
    expect(isRegularOn('2026-10', '2026-12-01')).toBe(false);
    expect(isRegularOn(undefined, '2026-11-01')).toBe(false);
  });
  it('handles January', () => {
    expect(previousMonthKey('2027-01-15')).toBe('2026-12');
    expect(isRegularOn('2026-12', '2027-01-15')).toBe(true);
  });
});

describe('visitCountBucket (AC-11)', () => {
  it('buckets counts', () => {
    expect(visitCountBucket(0)).toBeNull();
    expect(visitCountBucket(1)).toBe('1');
    expect(visitCountBucket(2)).toBe('2-4');
    expect(visitCountBucket(4)).toBe('2-4');
    expect(visitCountBucket(5)).toBe('5+');
  });
});

describe('kampalaWeekStart and reportBins (AC-36)', () => {
  it('starts weeks on Sunday', () => {
    expect(kampalaWeekStart('2026-11-13')).toBe('2026-11-08'); // a Friday
    expect(kampalaWeekStart('2026-11-08')).toBe('2026-11-08'); // a Sunday
  });
  it('bins weekly up to 92 days, clipped to the range', () => {
    const bins = reportBins('2026-11-03', '2026-11-20');
    expect(bins.map((b) => b.key)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
    expect(bins[0]!.start).toBe('2026-11-03');
    expect(bins[2]!.end).toBe('2026-11-20');
  });
  it('bins monthly beyond 92 days', () => {
    expect(daysInRange('2026-01-15', '2026-04-30')).toBeGreaterThan(92);
    const bins = reportBins('2026-01-15', '2026-04-30');
    expect(bins.map((b) => b.key)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
    expect(bins[0]!.start).toBe('2026-01-15');
    expect(bins[1]!.end).toBe('2026-02-28');
  });
  it('rolls over December', () => {
    const bins = reportBins('2026-11-01', '2027-02-10');
    expect(bins.map((b) => b.key)).toContain('2027-01-01');
  });
  it('returns nothing for an invalid range', () => {
    expect(reportBins('2026-11-20', '2026-11-01')).toEqual([]);
  });
});

describe('names', () => {
  it('folds the search name and adds the email', () => {
    expect(buildVisitorSearchName('  Agnès ', 'NAMATA', 'a@x.ug')).toBe('agnes namata a@x.ug');
    expect(buildVisitorSearchName('Grace')).toBe('grace');
  });
  it('joins the display name', () => {
    expect(visitorDisplayName('Grace', 'Namata')).toBe('Grace Namata');
    expect(visitorDisplayName('Grace')).toBe('Grace');
  });
});

describe('fillHospitalityTemplate (AC-17)', () => {
  it('fills every template without leaving braces', () => {
    for (const key of HOSPITALITY_TEMPLATE_KEYS) {
      const text = fillHospitalityTemplate(key, {
        firstName: 'Grace',
        visitDate: '2026-11-08',
        appLink: 'https://example.org/app',
      });
      expect(text).not.toMatch(/[{}]/);
      expect(text).toContain('Grace');
    }
  });
  it('formats the visit date', () => {
    expect(formatVisitDay('2026-11-08')).toBe('8 November');
    expect(fillHospitalityTemplate('first_visit_thanks', { firstName: 'Grace', visitDate: '2026-11-08' })).toContain(
      'on 8 November',
    );
  });
  it('app invite uses only firstName and appLink', () => {
    expect(HOSPITALITY_MESSAGE_TEMPLATES.app_invite.body).not.toContain('{visitDate}');
    expect(fillHospitalityTemplate('app_invite', { firstName: 'Grace', appLink: 'https://x.y' })).toContain(
      'https://x.y',
    );
  });
});
