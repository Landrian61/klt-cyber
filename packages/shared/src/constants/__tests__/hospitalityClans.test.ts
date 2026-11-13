import { describe, expect, it } from 'vitest';
import {
  SMALLEST_CLANS_HIGHLIGHTED,
  clanAssignedElderNotice,
  clanAssignedMemberNotice,
  smallestClanFlags,
} from '../hospitality';

describe('smallestClanFlags (AC-33)', () => {
  it('highlights the three smallest', () => {
    expect(SMALLEST_CLANS_HIGHLIGHTED).toBe(3);
    expect(smallestClanFlags([5, 1, 9, 2, 3, 7])).toEqual([
      false, true, false, true, true, false,
    ]);
  });
  it('includes ties at the edge', () => {
    expect(smallestClanFlags([1, 2, 3, 3, 9])).toEqual([true, true, true, true, false]);
    expect(smallestClanFlags([0, 0, 0, 0, 5])).toEqual([true, true, true, true, false]);
  });
  it('highlights every clan when there are three or fewer', () => {
    expect(smallestClanFlags([4, 8])).toEqual([true, true]);
  });
  it('handles no clans', () => {
    expect(smallestClanFlags([])).toEqual([]);
  });
});

describe('N37 notices', () => {
  it('names the clan to the member', () => {
    const notice = clanAssignedMemberNotice('Judah');
    expect(notice.body).toContain('Judah');
    expect(notice.title.length).toBeGreaterThan(0);
  });
  it('names the member and clan to the elder', () => {
    const notice = clanAssignedElderNotice('Grace', 'Judah');
    expect(notice.body).toContain('Grace');
    expect(notice.body).toContain('Judah');
  });
});
