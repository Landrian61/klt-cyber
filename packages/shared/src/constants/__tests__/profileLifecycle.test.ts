import { describe, expect, it } from 'vitest';
import {
  CLAN_UNASSIGNED_COPY,
  profileStaleCause,
  MENTORSHIP_STATUS_LABEL,
  PROFILE_LIFECYCLE_COPY,
  PROFILE_LIFECYCLE_ERROR_MESSAGES,
  PROFILE_LIFECYCLE_ERRORS,
  PROFILE_LIFECYCLE_NOTICES,
  PROFILE_STALE_OTHER_REVIEWER,
  PROFILE_STALE_OWNER_EDITED,
  REVIEWER_NAME,
  SENT_BACK_REASON_MAX_LENGTH,
  SENT_BACK_REASON_MIN_LENGTH,
  SENT_BACK_REASON_PUSH_LENGTH,
  isProfileLifecycleError,
  profileLifecycleErrorCode,
  profileLifecycleErrorMessage,
  sentBackReasonForPush,
} from '../profileLifecycle';

describe('the send-back reason bounds (AC-1, AC-32)', () => {
  it('asks for at least 10 characters, so one word cannot be a reason', () => {
    expect(SENT_BACK_REASON_MIN_LENGTH).toBe(10);
  });

  it('caps a reason at 500 characters, one email paragraph', () => {
    expect(SENT_BACK_REASON_MAX_LENGTH).toBe(500);
  });

  it('keeps the push excerpt well inside the full cap', () => {
    expect(SENT_BACK_REASON_PUSH_LENGTH).toBeLessThan(SENT_BACK_REASON_MAX_LENGTH);
  });

  // The two bounds and their copy are assembled from the same constants, so
  // this is what stops the portal counter promising 200 while the mutation
  // rejects at 500.
  it('quotes the configured bounds in the two reason messages', () => {
    expect(PROFILE_LIFECYCLE_ERROR_MESSAGES.REASON_TOO_SHORT).toContain(
      String(SENT_BACK_REASON_MIN_LENGTH),
    );
    expect(PROFILE_LIFECYCLE_ERROR_MESSAGES.REASON_TOO_LONG).toContain(
      String(SENT_BACK_REASON_MAX_LENGTH),
    );
  });
});

describe('the push excerpt of a reason (AC-33)', () => {
  it('leaves a short reason exactly as written, trimmed', () => {
    expect(sentBackReasonForPush('  Your photo is too dark.  ')).toBe(
      'Your photo is too dark.',
    );
  });

  it('ellipsises a long reason at the push length rather than mid-word', () => {
    const long = 'a'.repeat(SENT_BACK_REASON_MAX_LENGTH);
    const excerpt = sentBackReasonForPush(long);
    expect(excerpt).toHaveLength(SENT_BACK_REASON_PUSH_LENGTH);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('leaves a reason exactly at the push length uncut', () => {
    const exact = 'b'.repeat(SENT_BACK_REASON_PUSH_LENGTH);
    expect(sentBackReasonForPush(exact)).toBe(exact);
  });
});

describe('error codes (AC-32)', () => {
  it('carries every code spec 0014 names', () => {
    expect(Object.keys(PROFILE_LIFECYCLE_ERRORS).sort()).toEqual(
      [
        'DEPARTMENT_ALREADY_LIVE',
        'DEPARTMENT_CAP_REACHED',
        'MENTORSHIP_CONFIRMED',
        'MENTORSHIP_NEEDS_REVIEW',
        'NOT_YOUR_ROW',
        'PROFILE_ALREADY_VERIFIED',
        'PROFILE_NOT_VERIFIED',
        'PROFILE_STALE',
        'REASON_TOO_LONG',
        'REASON_TOO_SHORT',
        'ROLE_BLOCKS_DEPARTURE',
      ].sort(),
    );
  });

  it('maps its own key to its own value, so a code cannot be mistyped', () => {
    for (const [key, value] of Object.entries(PROFILE_LIFECYCLE_ERRORS)) {
      expect(value).toBe(key);
    }
  });

  // PROFILE_STALE is the one deliberate omission: it has two causes needing
  // opposite advice and the caller picks. Every other code must have copy, or
  // a refusal reaches somebody as "something went wrong".
  it('has copy for every code except PROFILE_STALE', () => {
    for (const code of Object.keys(PROFILE_LIFECYCLE_ERRORS)) {
      if (code === 'PROFILE_STALE') {
        expect(code in PROFILE_LIFECYCLE_ERROR_MESSAGES).toBe(false);
        continue;
      }
      expect(
        PROFILE_LIFECYCLE_ERROR_MESSAGES[
          code as keyof typeof PROFILE_LIFECYCLE_ERROR_MESSAGES
        ],
      ).toBeTruthy();
    }
  });

  it('recognises its own codes and nothing else', () => {
    expect(isProfileLifecycleError('PROFILE_STALE')).toBe(true);
    expect(isProfileLifecycleError('INVALID_PASSWORD')).toBe(false);
    expect(isProfileLifecycleError(undefined)).toBe(false);
  });
});

describe('reading a code back off a thrown error', () => {
  it('reads ConvexError-shaped data, which is what survives production', () => {
    const thrown = Object.assign(new Error('server error'), {
      data: { code: 'MENTORSHIP_CONFIRMED' },
    });
    expect(profileLifecycleErrorCode(thrown)).toBe('MENTORSHIP_CONFIRMED');
  });

  it('reads a bare string payload too', () => {
    const thrown = Object.assign(new Error('server error'), {
      data: 'NOT_YOUR_ROW',
    });
    expect(profileLifecycleErrorCode(thrown)).toBe('NOT_YOUR_ROW');
  });

  it('falls back to the message for a plain Error carrying a code', () => {
    expect(
      profileLifecycleErrorCode(new Error('rejected: DEPARTMENT_CAP_REACHED')),
    ).toBe('DEPARTMENT_CAP_REACHED');
  });

  it('returns null for anything it does not recognise', () => {
    expect(profileLifecycleErrorCode(new Error('kaboom'))).toBeNull();
    expect(profileLifecycleErrorCode(null)).toBeNull();
  });
});

describe('the two stale messages (AC-7)', () => {
  const stale = Object.assign(new Error('server error'), {
    data: { code: 'PROFILE_STALE' },
  });

  it('tells a reviewer the owner edited, by default', () => {
    expect(profileLifecycleErrorMessage(stale)).toBe(PROFILE_STALE_OWNER_EDITED);
  });

  it('tells them a colleague acted first when that is what happened', () => {
    expect(profileLifecycleErrorMessage(stale, 'other_reviewer')).toBe(
      PROFILE_STALE_OTHER_REVIEWER,
    );
  });

  // The whole point of the split: one message would be false for one of the
  // two readers, so the two sentences must not be the same text.
  it('says two different things', () => {
    expect(PROFILE_STALE_OWNER_EDITED).not.toBe(PROFILE_STALE_OTHER_REVIEWER);
  });

  it('shows the mapped copy for any other code', () => {
    const thrown = Object.assign(new Error('server error'), {
      data: { code: 'ROLE_BLOCKS_DEPARTURE' },
    });
    expect(profileLifecycleErrorMessage(thrown)).toBe(
      PROFILE_LIFECYCLE_ERROR_MESSAGES.ROLE_BLOCKS_DEPARTURE,
    );
  });

  it('falls back to a generic line rather than leaking a stack trace', () => {
    expect(profileLifecycleErrorMessage(new Error('kaboom'))).toContain(
      'nothing was saved',
    );
  });
});

describe('the reviewer name (A2-05, AC-26)', () => {
  it('names Administration, not an individual or another body', () => {
    expect(REVIEWER_NAME).toBe('the Administration team');
  });

  // The four strings this replaced said "the elders", "a church admin" and
  // "the church office". Any of those reappearing in the shared copy means the
  // sweep has been undone.
  const forbidden = ['the elders', 'church admin', 'church office'];

  it('keeps the replaced names out of every member-facing lifecycle string', () => {
    const strings = [
      PROFILE_LIFECYCLE_COPY.pending.title,
      PROFILE_LIFECYCLE_COPY.pending.body,
      PROFILE_LIFECYCLE_COPY.sentBack.title,
      PROFILE_LIFECYCLE_COPY.sentBack.body,
      PROFILE_LIFECYCLE_COPY.sentBack.footer,
      PROFILE_LIFECYCLE_COPY.verified.title,
      PROFILE_LIFECYCLE_COPY.verified.body,
      PROFILE_LIFECYCLE_COPY.gate.pending('the announcements'),
      PROFILE_LIFECYCLE_COPY.gate.sentBack('the announcements'),
      PROFILE_LIFECYCLE_NOTICES.sentBack('Your photo is too dark.').body,
    ];
    for (const text of strings) {
      for (const name of forbidden) {
        expect(text.toLowerCase()).not.toContain(name);
      }
    }
  });
});

describe('no membership language before verification (F2-02, AC-27)', () => {
  // "You're in the family!" and "Welcome home" greeted somebody the moment
  // they pressed submit, promising something nobody had agreed to yet.
  const forbidden = ['in the family', 'welcome home', 'you are a member'];

  it('keeps it out of the pending and sent-back copy', () => {
    const strings = [
      PROFILE_LIFECYCLE_COPY.pending.title,
      PROFILE_LIFECYCLE_COPY.pending.body,
      PROFILE_LIFECYCLE_COPY.sentBack.title,
      PROFILE_LIFECYCLE_COPY.sentBack.body,
      PROFILE_LIFECYCLE_COPY.sentBack.footer,
      PROFILE_LIFECYCLE_COPY.gate.pending('the announcements'),
      PROFILE_LIFECYCLE_COPY.gate.sentBack('the announcements'),
    ];
    for (const text of strings) {
      for (const phrase of forbidden) {
        expect(text.toLowerCase()).not.toContain(phrase);
      }
    }
  });

  it('keeps the verified copy on "verified" rather than "member"', () => {
    expect(PROFILE_LIFECYCLE_COPY.verified.title.toLowerCase()).toContain(
      'verified',
    );
    expect(PROFILE_LIFECYCLE_COPY.verified.body.toLowerCase()).not.toContain(
      'member',
    );
  });
});

describe('which stale cause to report (AC-7)', () => {
  // Found in review: both portal screens derived this themselves and both got
  // it wrong, which is why it lives here now.
  it('blames a colleague when the send-back is newer than what was held', () => {
    expect(profileStaleCause(2_000, 1_000)).toBe('other_reviewer');
  });

  it('blames the owner when nothing was ever sent back', () => {
    expect(profileStaleCause(undefined, 1_000)).toBe('owner_edited');
  });

  // The trap that made both screens wrong: `sendProfileBack` writes
  // `sentBackAt` and `updatedAt` to the same instant, so a caller comparing
  // against a FRESH `updatedAt` compares a number with itself and always gets
  // "owner_edited". Equal must not read as a colleague acting.
  it('blames the owner when the two are equal', () => {
    expect(profileStaleCause(1_000, 1_000)).toBe('owner_edited');
  });

  it('blames the owner when the send-back predates what was held', () => {
    expect(profileStaleCause(500, 1_000)).toBe('owner_edited');
  });
});

describe('the gate copy names what it is gating', () => {
  it('drops the feature label into both unverified sentences', () => {
    expect(PROFILE_LIFECYCLE_COPY.gate.pending('The announcements')).toContain(
      'The announcements',
    );
    expect(PROFILE_LIFECYCLE_COPY.gate.sentBack('The announcements')).toContain(
      'The announcements',
    );
  });
});

describe('clan and mentorship copy (AC-24, AC-28)', () => {
  it('tells an unassigned member who assigns their clan', () => {
    expect(CLAN_UNASSIGNED_COPY).toBe(
      'Your clan will be assigned by the Hospitality team',
    );
  });

  it('labels all three mentorship values, so none falls back to a raw status', () => {
    expect(MENTORSHIP_STATUS_LABEL.not_enrolled).toBe('Not enrolled');
    expect(MENTORSHIP_STATUS_LABEL.enrolled).toBe('Enrolled');
    expect(MENTORSHIP_STATUS_LABEL.completed).toBe('Completed');
  });
});

describe('notice copy (AC-33)', () => {
  it('carries the reason in the send-back notice', () => {
    const notice = PROFILE_LIFECYCLE_NOTICES.sentBack('Your photo is too dark.');
    expect(notice.body).toContain('Your photo is too dark.');
    expect(notice.title).toBeTruthy();
  });

  // A reviewer reading a list of notices has to be able to tell a profile
  // they have already seen once from a brand new one.
  it('words a resubmission differently from a first submission', () => {
    const notice = PROFILE_LIFECYCLE_NOTICES.resubmitted('Esther Nakato');
    expect(notice.title.toLowerCase()).toContain('resubmitted');
    expect(notice.body).toContain('Esther Nakato');
  });

  it('names both the person and the department on each department notice', () => {
    for (const build of [
      PROFILE_LIFECYCLE_NOTICES.claimCreated,
      PROFILE_LIFECYCLE_NOTICES.claimWithdrawn,
      PROFILE_LIFECYCLE_NOTICES.memberLeft,
    ]) {
      const notice = build('Esther Nakato', 'Hospitality');
      expect(notice.body).toContain('Esther Nakato');
      expect(`${notice.title} ${notice.body}`).toContain('Hospitality');
    }
  });

  it('names both the person and the clan on each clan notice', () => {
    for (const build of [
      PROFILE_LIFECYCLE_NOTICES.clanJoined,
      PROFILE_LIFECYCLE_NOTICES.clanLeft,
    ]) {
      const notice = build('Esther Nakato', 'Judah');
      expect(`${notice.title} ${notice.body}`).toContain('Esther Nakato');
      expect(`${notice.title} ${notice.body}`).toContain('Judah');
    }
  });
});
