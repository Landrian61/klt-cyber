import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_DELETION_ERROR_MESSAGES,
  ACCOUNT_DELETION_ERRORS,
  ACCOUNT_DELETION_EXPIRY_SECONDS,
  ACCOUNT_DELETION_REQUEST_MAX,
  ACCOUNT_DELETION_REQUEST_REPLY,
  ACCOUNT_DELETION_REQUEST_WINDOW_SECONDS,
  DELETE_ACCOUNT_CONFIRM_PATH,
  DELETE_ACCOUNT_PATH,
  accountDeletionErrorMessage,
  accountDeletionExpiryLabel,
  isAccountDeletionError,
} from '../accountDeletion';

describe('account deletion link expiry (AC-15)', () => {
  it('expires a deletion link in 1 hour', () => {
    expect(ACCOUNT_DELETION_EXPIRY_SECONDS).toBe(3600);
  });

  it('derives its human label from the configured expiry', () => {
    expect(accountDeletionExpiryLabel()).toBe('1 hour');
  });

  // The reply is assembled from the label, so this is what stops the page
  // promising an hour after somebody changes the constant to a day.
  it('quotes the configured expiry in the public reply', () => {
    expect(ACCOUNT_DELETION_REQUEST_REPLY).toContain(accountDeletionExpiryLabel());
  });
});

describe('the public request reply (AC-14, AC-16)', () => {
  // The whole enumeration defence rests on there being exactly one string.
  // If a later change introduces a second "not found" variant, the fix is to
  // delete it, not to update this test.
  it('is a single constant, so hit, miss and rate limited cannot diverge', () => {
    expect(typeof ACCOUNT_DELETION_REQUEST_REPLY).toBe('string');
    expect(ACCOUNT_DELETION_REQUEST_REPLY.length).toBeGreaterThan(0);
  });

  it('never says whether the address was found', () => {
    const reply = ACCOUNT_DELETION_REQUEST_REPLY.toLowerCase();
    for (const leak of ['not found', 'no account', 'does not exist', 'unknown', 'too many']) {
      expect(reply).not.toContain(leak);
    }
  });

  it('is worded conditionally', () => {
    expect(ACCOUNT_DELETION_REQUEST_REPLY.toLowerCase()).toContain('if an account exists');
  });
});

describe('rate limit constants (AC-16)', () => {
  it('allows at most 3 requests per address per hour', () => {
    expect(ACCOUNT_DELETION_REQUEST_MAX).toBe(3);
    expect(ACCOUNT_DELETION_REQUEST_WINDOW_SECONDS).toBe(3600);
  });
});

describe('portal paths', () => {
  it('exposes the paths the routes, middleware and emailed link share', () => {
    expect(DELETE_ACCOUNT_PATH).toBe('/delete-account');
    expect(DELETE_ACCOUNT_CONFIRM_PATH).toBe('/delete-account/confirm');
  });

  it('nests the confirm path under the request path, so one allowlist entry covers both', () => {
    expect(DELETE_ACCOUNT_CONFIRM_PATH.startsWith(DELETE_ACCOUNT_PATH)).toBe(true);
  });
});

describe('error copy (AC-9, AC-17)', () => {
  // Guards the gap this record exists to close: a code thrown by the backend
  // with no copy on the client shows the person a generic shrug.
  it('has a message for every error code', () => {
    for (const code of Object.values(ACCOUNT_DELETION_ERRORS)) {
      expect(ACCOUNT_DELETION_ERROR_MESSAGES[code]).toBeTruthy();
    }
    expect(Object.keys(ACCOUNT_DELETION_ERROR_MESSAGES).sort()).toEqual(
      Object.values(ACCOUNT_DELETION_ERRORS).sort()
    );
  });

  it('tells the only System Admin why, rather than just refusing (AC-9)', () => {
    expect(ACCOUNT_DELETION_ERROR_MESSAGES.LAST_SYSTEM_ADMIN.toLowerCase()).toContain(
      'only system admin'
    );
  });

  it('points a passwordless account at the emailed link (AC-17)', () => {
    expect(ACCOUNT_DELETION_ERROR_MESSAGES.NO_PASSWORD_CREDENTIAL.toLowerCase()).toContain('link');
  });

  it('recognises its own codes and nothing else', () => {
    expect(isAccountDeletionError('TOKEN_EXPIRED')).toBe(true);
    expect(isAccountDeletionError('NOPE')).toBe(false);
    expect(isAccountDeletionError(undefined)).toBe(false);
  });
});

describe('accountDeletionErrorMessage', () => {
  // Convex wraps a thrown message in server detail, so matching has to be a
  // substring test. This is the shape a real failure arrives in.
  it('finds the code inside a wrapped Convex error', () => {
    const wrapped = new Error(
      '[Request ID: abc] Server Error\nUncaught Error: INVALID_PASSWORD at handler'
    );
    expect(accountDeletionErrorMessage(wrapped)).toBe(
      ACCOUNT_DELETION_ERROR_MESSAGES.INVALID_PASSWORD
    );
  });

  // What the functions actually throw: a ConvexError carrying the code as
  // structured data. This is the only path that works on a production
  // deployment, where the message above is replaced with a generic one.
  it('reads the code out of a ConvexError payload', () => {
    const thrown = Object.assign(new Error('[Request ID: abc] Server Error'), {
      data: { code: 'LAST_SYSTEM_ADMIN' },
    });
    expect(accountDeletionErrorMessage(thrown)).toBe(
      ACCOUNT_DELETION_ERROR_MESSAGES.LAST_SYSTEM_ADMIN
    );
  });

  it('prefers the payload code over anything in the message', () => {
    const thrown = Object.assign(new Error('Uncaught Error: TOKEN_USED'), {
      data: { code: 'TOKEN_EXPIRED' },
    });
    expect(accountDeletionErrorMessage(thrown)).toBe(
      ACCOUNT_DELETION_ERROR_MESSAGES.TOKEN_EXPIRED
    );
  });

  it('ignores a payload that is not one of this feature’s codes', () => {
    const thrown = Object.assign(new Error('Uncaught Error: TOKEN_USED'), {
      data: { code: 'SOMETHING_ELSE' },
    });
    expect(accountDeletionErrorMessage(thrown)).toBe(
      ACCOUNT_DELETION_ERROR_MESSAGES.TOKEN_USED
    );
  });

  it('falls back to a generic line for anything unrecognised', () => {
    const message = accountDeletionErrorMessage(new Error('network request failed'));
    expect(message).toContain('was not deleted');
  });

  it('survives a non error being thrown', () => {
    expect(accountDeletionErrorMessage(undefined)).toContain('was not deleted');
    expect(accountDeletionErrorMessage('TOKEN_USED')).toBe(
      ACCOUNT_DELETION_ERROR_MESSAGES.TOKEN_USED
    );
  });
});
