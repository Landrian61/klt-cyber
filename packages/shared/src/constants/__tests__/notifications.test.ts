import { describe, expect, it } from 'vitest';
import { ROLE_TYPES } from '../../enums/roles';
import {
  NOTIFICATION_KINDS,
  PORTAL_WORK_COPY,
  PORTAL_WORK_TYPES,
  ROLE_COPY,
} from '../notifications';

describe('notification kinds (spec 0013, AC-18)', () => {
  // The SRS §5 catalogue runs N01 to N46. A gap or a duplicate here means a
  // notice can be stamped with a code feature 28 never maps to a category.
  it('are exactly N01 to N46, in order', () => {
    const expected = Array.from({ length: 46 }, (_, i) => `N${String(i + 1).padStart(2, '0')}`);
    expect([...NOTIFICATION_KINDS]).toEqual(expected);
  });
});

describe('ROLE_COPY (spec 0013, AC-14)', () => {
  it('covers every role type with a label and a description', () => {
    for (const roleType of ROLE_TYPES) {
      expect(ROLE_COPY[roleType].label.length).toBeGreaterThan(0);
      expect(ROLE_COPY[roleType].description.length).toBeGreaterThan(0);
    }
  });

  // Members never see the stored name of the role; the SRS calls it a delegate.
  it('names department_admin a delegate', () => {
    expect(ROLE_COPY.department_admin.label).toBe('delegate');
  });
});

describe('PORTAL_WORK_COPY (spec 0013, AC-16)', () => {
  it('covers every portal work type', () => {
    for (const type of PORTAL_WORK_TYPES) {
      expect(PORTAL_WORK_COPY[type].title.length).toBeGreaterThan(0);
      expect(PORTAL_WORK_COPY[type].body.length).toBeGreaterThan(0);
    }
  });
});
