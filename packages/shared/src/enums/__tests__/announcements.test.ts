import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
  announcementCategoryChip,
  announcementCategoryLabel,
  isAnnouncementCategory,
} from '../announcements';

describe('ANNOUNCEMENT_CATEGORIES (spec 0010, AC-1 and AC-16)', () => {
  // Fixed from an audit of the live rows, not from a guess. Adding a category
  // is a deliberate one-line change here; this test is what makes it
  // deliberate rather than accidental.
  it('is the three categories the church actually publishes', () => {
    expect([...ANNOUNCEMENT_CATEGORIES]).toEqual(['general', 'event', 'program']);
  });

  // The portal select renders one option per entry and the app renders one
  // chip, both from the labels map. A category with no label would ship as a
  // raw lowercase key in front of an editor.
  it('gives every category a human label', () => {
    for (const category of ANNOUNCEMENT_CATEGORIES) {
      expect(ANNOUNCEMENT_CATEGORY_LABELS[category]).toBeTruthy();
    }
    expect(Object.keys(ANNOUNCEMENT_CATEGORY_LABELS)).toHaveLength(
      ANNOUNCEMENT_CATEGORIES.length,
    );
  });

  it('holds no duplicates', () => {
    expect(new Set(ANNOUNCEMENT_CATEGORIES).size).toBe(ANNOUNCEMENT_CATEGORIES.length);
  });
});

describe('isAnnouncementCategory (spec 0010, AC-1 and AC-16)', () => {
  it('accepts every member of the set', () => {
    for (const category of ANNOUNCEMENT_CATEGORIES) {
      expect(isAnnouncementCategory(category)).toBe(true);
    }
  });

  // This false is what the mutations reject on (AC-16) and what the app
  // degrades on (AC-1). The same guard, two consequences.
  it('refuses a value outside the set', () => {
    expect(isAnnouncementCategory('finance')).toBe(false);
    expect(isAnnouncementCategory('General')).toBe(false);
    expect(isAnnouncementCategory('')).toBe(false);
  });

  // The app calls this on a stored field that is optional, and the mutations
  // call it on an argument that may be absent. Neither should throw.
  it('refuses a value that is not a string at all', () => {
    expect(isAnnouncementCategory(undefined)).toBe(false);
    expect(isAnnouncementCategory(null)).toBe(false);
    expect(isAnnouncementCategory(3)).toBe(false);
    expect(isAnnouncementCategory({})).toBe(false);
  });
});

describe('announcementCategoryLabel (spec 0010, AC-1)', () => {
  it('reads a known category as its label', () => {
    expect(announcementCategoryLabel('program')).toBe('Program');
  });

  // Null is the signal to render the neutral chip rather than a known one. An
  // older row holding an off-set value has to keep rendering, which is why this
  // returns null instead of throwing.
  it('returns null for an off-set value, so the caller can fall back', () => {
    expect(announcementCategoryLabel('finance')).toBeNull();
  });

  // No category means no chip at all, which is a third outcome and not the
  // same as the neutral one.
  it('returns null when there is no category', () => {
    expect(announcementCategoryLabel(undefined)).toBeNull();
  });
});

describe('announcementCategoryChip (spec 0010, AC-1)', () => {
  it('reads a known category as its label', () => {
    expect(announcementCategoryChip('event')).toEqual({ label: 'Event', known: true });
  });

  // The chip still renders for an off-set value, just neutrally, and shows the
  // stored word rather than hiding it — the member sees what the row says.
  it('keeps an off-set value, capitalised, and marks it unknown', () => {
    expect(announcementCategoryChip('finance')).toEqual({
      label: 'Finance',
      known: false,
    });
  });

  // No category is a third outcome: no chip at all, not a blank one.
  it('returns null when there is no category', () => {
    expect(announcementCategoryChip(undefined)).toBeNull();
    expect(announcementCategoryChip('')).toBeNull();
  });
});
