import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_LOCATION_MAX_LENGTH,
  ACTIVITY_TITLE_MAX_LENGTH,
  CANCELLATION_REASON_MAX_LENGTH,
  GROUP_MESSAGE_MAX_LENGTH,
  GROUP_MESSAGE_PAGE_SIZE,
  GROUP_MESSAGE_WINDOW_DAYS,
  UPCOMING_HORIZON_DAYS,
} from '../groupContent';
import { PROGRAM_CANCELLATION_REASON_MAX_LENGTH } from '../weeklyPrograms';

// The point of these tests is the same as spec 0009's cap test: each number is
// read by a Convex query, a screen and a seed precisely so the three cannot
// drift. Changing one should be a deliberate change to a named value here, not
// a number quietly retyped in one of the three places.

describe('UPCOMING_HORIZON_DAYS (spec 0010, AC-5)', () => {
  it('is 8 weeks', () => {
    expect(UPCOMING_HORIZON_DAYS).toBe(56);
  });

  // It was private inside convex/weeklyPrograms.ts before this spec moved it
  // here. The merged upcoming list and the weekly programs strip sit on the
  // same screen, so a horizon of 56 in one and 60 in the other would show the
  // member two different answers to "what is coming up".
  it('is a whole number of weeks, so a horizon never lands mid-week', () => {
    expect(UPCOMING_HORIZON_DAYS % 7).toBe(0);
  });
});

describe('GROUP_MESSAGE_WINDOW_DAYS (spec 0010, AC-2)', () => {
  it('is 90 days', () => {
    expect(GROUP_MESSAGE_WINDOW_DAYS).toBe(90);
  });

  // AC-2's "does not appear" step still has nothing proving it: the seed
  // cannot plant a message older than this window, because `_creationTime` is
  // assigned by Convex and cannot be backdated (see convex/contentSeed.ts).
  // That needs a faked-clock Convex test, which is still owed.
  it('reaches further back than the upcoming list reaches forward', () => {
    expect(GROUP_MESSAGE_WINDOW_DAYS).toBeGreaterThan(UPCOMING_HORIZON_DAYS);
  });
});

describe('GROUP_MESSAGE_PAGE_SIZE (spec 0010, AC-2)', () => {
  it('is 50 messages per group', () => {
    expect(GROUP_MESSAGE_PAGE_SIZE).toBe(50);
  });

  // The window alone does not bound the read; this cap is what keeps the work
  // flat however chatty one department becomes. A cap of 0 or a negative would
  // silently empty every group.
  it('is a positive whole number', () => {
    expect(Number.isInteger(GROUP_MESSAGE_PAGE_SIZE)).toBe(true);
    expect(GROUP_MESSAGE_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe('the activity and message caps (spec 0010, AC-11)', () => {
  it('holds a title in 120, a location in 160 and a description in 2000', () => {
    expect(ACTIVITY_TITLE_MAX_LENGTH).toBe(120);
    expect(ACTIVITY_LOCATION_MAX_LENGTH).toBe(160);
    expect(ACTIVITY_DESCRIPTION_MAX_LENGTH).toBe(2000);
  });

  it('holds a message body in 2000', () => {
    expect(GROUP_MESSAGE_MAX_LENGTH).toBe(2000);
  });

  // A title longer than its own description cap would mean a row that passes
  // one check and fails the other, which is the kind of mismatch nobody notices
  // until an author hits it.
  it('keeps the title shorter than the description', () => {
    expect(ACTIVITY_TITLE_MAX_LENGTH).toBeLessThan(ACTIVITY_DESCRIPTION_MAX_LENGTH);
  });
});

describe('CANCELLATION_REASON_MAX_LENGTH (spec 0010, AC-6)', () => {
  it('is 200 characters', () => {
    expect(CANCELLATION_REASON_MAX_LENGTH).toBe(200);
  });

  // Deliberately the same number spec 0009 fixed for a weekly program
  // occurrence. The two are separate exports because they cap different fields
  // on different tables, but a member reading a cancelled program and a
  // cancelled activity on the same screen should not find one reason truncated
  // where the other is not.
  it('matches the weekly program occurrence reason cap', () => {
    expect(CANCELLATION_REASON_MAX_LENGTH).toBe(PROGRAM_CANCELLATION_REASON_MAX_LENGTH);
  });
});
