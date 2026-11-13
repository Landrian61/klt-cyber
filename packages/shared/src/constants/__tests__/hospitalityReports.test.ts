import { describe, expect, it } from 'vitest';
import {
  REPORT_MAX_RANGE_DAYS,
  cohortCompletionPercent,
  defaultReportRange,
  isValidReportRange,
  kampalaDayEndMs,
  kampalaDayStartMs,
} from '../hospitality';

describe('Kampala day bounds (AC-36)', () => {
  it('starts at Kampala midnight, which is 21:00 UTC the day before', () => {
    expect(new Date(kampalaDayStartMs('2026-11-13')).toISOString()).toBe(
      '2026-11-12T21:00:00.000Z'
    );
  });
  it('ends one millisecond before the next Kampala day', () => {
    expect(kampalaDayEndMs('2026-11-13') + 1).toBe(kampalaDayStartMs('2026-11-14'));
  });
});

describe('cohortCompletionPercent (AC-36)', () => {
  it('rounds to a whole percent', () => {
    expect(cohortCompletionPercent(3, 1)).toBe(33);
    expect(cohortCompletionPercent(4, 4)).toBe(100);
  });
  it('never passes 100 and reads 0 for an empty cohort', () => {
    expect(cohortCompletionPercent(2, 5)).toBe(100);
    expect(cohortCompletionPercent(0, 0)).toBe(0);
  });
});

describe('defaultReportRange (AC-36)', () => {
  it('is the last 3 months ending today', () => {
    expect(defaultReportRange('2026-11-13')).toEqual({ from: '2026-08-13', to: '2026-11-13' });
  });
  it('clamps to the end of a shorter month and crosses the year', () => {
    expect(defaultReportRange('2026-05-31').from).toBe('2026-02-28');
    expect(defaultReportRange('2026-02-10').from).toBe('2025-11-10');
  });
});

describe('isValidReportRange (AC-36)', () => {
  it('accepts an ordered range up to the maximum', () => {
    expect(isValidReportRange('2026-01-01', '2026-01-01')).toBe(true);
    expect(REPORT_MAX_RANGE_DAYS).toBe(731);
    expect(isValidReportRange('2024-11-13', '2026-11-13')).toBe(true);
  });
  it('refuses a reversed, too long or unreadable range', () => {
    expect(isValidReportRange('2026-02-01', '2026-01-01')).toBe(false);
    expect(isValidReportRange('2024-11-12', '2026-11-13')).toBe(false);
    expect(isValidReportRange('2026-13-01', '2026-12-01')).toBe(false);
  });
});
