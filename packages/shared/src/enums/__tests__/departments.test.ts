import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_ICON_FALLBACK_KEY,
  DEPARTMENT_ICON_KEYS,
  DEPARTMENT_MEMBERSHIP_STATUSES,
  LIVE_DEPARTMENT_MEMBERSHIP_STATUSES,
  PAUSED_DEPARTMENTS,
  ROSTER_PORTAL_DEPARTMENTS,
  departmentIconKey,
  slugifyDepartmentName,
} from '../departments';

/**
 * The thirteen seeded department names, in seed order, copied from
 * convex/seed.ts's `DEPARTMENTS`. Duplicated here on purpose: this package
 * cannot import from convex/, and these tests exist precisely to catch the two
 * lists drifting apart.
 */
const SEEDED_DEPARTMENT_NAMES = [
  'Administration',
  'Pastoral',
  'Finance',
  'Education',
  'Media',
  'Worship Ministry',
  'Ushering',
  'Missions & Outreach',
  'Hospitality',
  "Children's Ministry",
  'Eagles Youth',
  'Real Estate',
  'Library & Information',
] as const;

/**
 * The admin app's former private `lib/slugify.ts`, reproduced verbatim as of
 * spec 0012. The hub already links using its output, so the shared replacement
 * has to agree with it for every seeded name or every existing link breaks.
 * This copy is the fixture for that parity check and is never imported by
 * runtime code.
 */
function legacySlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

describe('DEPARTMENT_MEMBERSHIP_STATUSES (spec 0012, AC-14)', () => {
  it('is the four states a membership row can hold', () => {
    expect([...DEPARTMENT_MEMBERSHIP_STATUSES]).toEqual([
      'pending_claim',
      'active',
      'removed',
      'declined',
    ]);
  });

  it('holds no duplicates', () => {
    expect(new Set(DEPARTMENT_MEMBERSHIP_STATUSES).size).toBe(
      DEPARTMENT_MEMBERSHIP_STATUSES.length,
    );
  });

  // The invariant every writer respects: a person may hold one seat-occupying
  // row per department, and the two terminal states are free to repeat.
  it('treats pending_claim and active as the only live statuses', () => {
    expect([...LIVE_DEPARTMENT_MEMBERSHIP_STATUSES]).toEqual([
      'pending_claim',
      'active',
    ]);
    for (const status of LIVE_DEPARTMENT_MEMBERSHIP_STATUSES) {
      expect(DEPARTMENT_MEMBERSHIP_STATUSES).toContain(status);
    }
  });
});

describe('slugifyDepartmentName (spec 0012, AC-1 and AC-7)', () => {
  // The parity test the spec calls for. A different result for any one of the
  // thirteen would break a link the hub already renders.
  it('matches the admin app\'s former slugify for all thirteen seeded names', () => {
    for (const name of SEEDED_DEPARTMENT_NAMES) {
      expect(slugifyDepartmentName(name)).toBe(legacySlugify(name));
    }
  });

  // Two departments resolving to one slug would make one of them unreachable.
  // This test fails the build before such a rename can ship.
  it('gives the thirteen departments thirteen distinct slugs', () => {
    const slugs = SEEDED_DEPARTMENT_NAMES.map(slugifyDepartmentName);
    expect(new Set(slugs).size).toBe(SEEDED_DEPARTMENT_NAMES.length);
    expect(slugs).not.toContain('');
  });

  it('spells out the slugs the portal links to today', () => {
    expect(slugifyDepartmentName('Media')).toBe('media');
    expect(slugifyDepartmentName('Missions & Outreach')).toBe('missions-outreach');
    expect(slugifyDepartmentName("Children's Ministry")).toBe('childrens-ministry');
    expect(slugifyDepartmentName('Library & Information')).toBe('library-information');
  });

  it('strips a curly apostrophe the same way as a straight one', () => {
    expect(slugifyDepartmentName('Children’s Ministry')).toBe(
      slugifyDepartmentName("Children's Ministry"),
    );
  });

  it('leaves no leading or trailing separator', () => {
    expect(slugifyDepartmentName('  & Media & ')).toBe('media');
  });
});

describe('DEPARTMENT_ICON_KEYS (spec 0012, AC-7)', () => {
  // Every seeded department renders its own icon, so the hub never shows the
  // fallback for a department the church actually has.
  it('names all thirteen seeded departments', () => {
    expect(Object.keys(DEPARTMENT_ICON_KEYS).sort()).toEqual(
      [...SEEDED_DEPARTMENT_NAMES].sort(),
    );
  });

  it('gives every entry a non-empty key', () => {
    for (const name of SEEDED_DEPARTMENT_NAMES) {
      expect(departmentIconKey(name)).toBeTruthy();
      expect(departmentIconKey(name)).not.toBe(DEPARTMENT_ICON_FALLBACK_KEY);
    }
  });

  // A department added later with no entry renders the fallback rather than
  // nothing, which is what keeps the hub card from rendering an empty square.
  it('falls back for an unknown department', () => {
    expect(departmentIconKey('Drone Ministry')).toBe(DEPARTMENT_ICON_FALLBACK_KEY);
    expect(departmentIconKey('')).toBe(DEPARTMENT_ICON_FALLBACK_KEY);
  });
});

describe('the department name lists agree with each other', () => {
  // PAUSED_DEPARTMENTS and ROSTER_PORTAL_DEPARTMENTS key the same seeded names.
  // A typo in either silently stops matching, which would quietly un-pause a
  // department or hand a roster portal to nobody.
  it('only names seeded departments', () => {
    for (const name of [...PAUSED_DEPARTMENTS, ...ROSTER_PORTAL_DEPARTMENTS]) {
      expect(SEEDED_DEPARTMENT_NAMES).toContain(name);
    }
  });

  it('never pauses a department that has a roster portal', () => {
    for (const name of ROSTER_PORTAL_DEPARTMENTS) {
      expect(PAUSED_DEPARTMENTS).not.toContain(name);
    }
  });
});
