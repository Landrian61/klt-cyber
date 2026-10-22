/**
 * Account deletion (SRS F1-06, spec 0008).
 *
 * Every user facing string this feature can show lives here, named, so no
 * message is composed at a call site. That matters more than usual for this
 * feature: the public request page must reply with ONE fixed string whether
 * the address exists, does not exist, or has been rate limited, and the only
 * reliable way to guarantee that is for all three paths to return the same
 * constant rather than three strings that merely look alike today.
 */

/**
 * How long a public deletion link stays valid, in seconds.
 *
 * Deliberately the same hour as `PASSWORD_RESET_EXPIRY_SECONDS`: both prove
 * the same thing (possession of the address) and there is no reason for the
 * two to differ. Kept as its own constant anyway so changing one does not
 * silently move the other.
 */
export const ACCOUNT_DELETION_EXPIRY_SECONDS = 3600;

/** The expiry as human wording, derived rather than retyped, so copy cannot contradict the configuration. */
export function accountDeletionExpiryLabel(): string {
  const hours = ACCOUNT_DELETION_EXPIRY_SECONDS / 3600;
  if (hours >= 1 && Number.isInteger(hours)) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const minutes = Math.round(ACCOUNT_DELETION_EXPIRY_SECONDS / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/**
 * Portal paths for the public deletion flow. Shared so the Next.js routes, the
 * middleware allowlist and the link the backend emails cannot drift apart —
 * the same reason the reset paths are shared.
 */
export const DELETE_ACCOUNT_PATH = '/delete-account';
export const DELETE_ACCOUNT_CONFIRM_PATH = '/delete-account/confirm';

/**
 * The public request endpoint's rate limit: at most this many requests per
 * address per window. A rate limited caller gets the same reply as an accepted
 * one, so this throttles mail without telling anybody it fired.
 */
export const ACCOUNT_DELETION_REQUEST_MAX = 3;
export const ACCOUNT_DELETION_REQUEST_WINDOW_SECONDS = 3600;

/**
 * The single reply the public request page gives, always.
 *
 * Address exists, address does not exist, address was rate limited: all three
 * return this exact string (AC-14, AC-16). Wording it as "if an account
 * exists" is what makes one message honest in every case.
 */
export const ACCOUNT_DELETION_REQUEST_REPLY =
  'If an account exists for that email address, we have sent a link to confirm the deletion. The link is valid for ' +
  accountDeletionExpiryLabel() +
  ' and can be used once.';

/** Error codes the deletion functions throw. The client maps these to copy below. */
export const ACCOUNT_DELETION_ERRORS = {
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  LAST_SYSTEM_ADMIN: 'LAST_SYSTEM_ADMIN',
  NO_PASSWORD_CREDENTIAL: 'NO_PASSWORD_CREDENTIAL',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_USED: 'TOKEN_USED',
  ACCOUNT_GONE: 'ACCOUNT_GONE',
} as const;

export type AccountDeletionError =
  (typeof ACCOUNT_DELETION_ERRORS)[keyof typeof ACCOUNT_DELETION_ERRORS];

/**
 * What each error code says to the person who hit it. Keyed by code so a new
 * code cannot ship without copy, and so the mobile screen and the portal page
 * show the same sentence for the same failure.
 */
export const ACCOUNT_DELETION_ERROR_MESSAGES: Record<AccountDeletionError, string> = {
  INVALID_PASSWORD: 'That password is not right. Try again.',
  LAST_SYSTEM_ADMIN:
    'You are the only System Admin, so your account cannot be deleted yet. Ask another System Admin to be appointed first, then try again.',
  NO_PASSWORD_CREDENTIAL:
    'Your account signs in with Google, so there is no password to confirm. We can email you a link instead.',
  TOKEN_INVALID: 'This link is not valid. Request a new one to continue.',
  TOKEN_EXPIRED:
    'This link has expired. Links are valid for ' +
    accountDeletionExpiryLabel() +
    '. Request a new one to continue.',
  TOKEN_USED: 'This link has already been used. Each link works once.',
  ACCOUNT_GONE: 'This account has already been deleted. Nothing more to do.',
};

/** True when `code` is one of this feature's error codes, so unknown errors are not mislabelled. */
export function isAccountDeletionError(code: unknown): code is AccountDeletionError {
  return (
    typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(ACCOUNT_DELETION_ERROR_MESSAGES, code)
  );
}

/**
 * Turn whatever a deletion call threw into something worth showing.
 *
 * Reads `ConvexError.data.code` first, because that is the only part of a
 * thrown error Convex promises to deliver to the client: on a production
 * deployment the MESSAGE of an ordinary `Error` is replaced with a generic
 * server error, so matching on the message alone would show the fallback line
 * for every refusal in production while working perfectly in development.
 *
 * The substring match stays as a fallback, for anything that still throws a
 * plain `Error` carrying a code. Anything unrecognised falls back to a generic
 * line instead of leaking a stack trace into the UI.
 */
export function accountDeletionErrorMessage(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  const code =
    typeof data === 'string'
      ? data
      : (data as { code?: unknown } | null | undefined)?.code;
  if (isAccountDeletionError(code)) return ACCOUNT_DELETION_ERROR_MESSAGES[code];

  const raw = error instanceof Error ? error.message : String(error ?? '');
  for (const code of Object.keys(ACCOUNT_DELETION_ERROR_MESSAGES) as AccountDeletionError[]) {
    if (raw.includes(code)) return ACCOUNT_DELETION_ERROR_MESSAGES[code];
  }
  return 'Something went wrong and your account was not deleted. Try again in a moment.';
}

/**
 * What the confirm screen tells the person before anything is destroyed
 * (AC-1). Static copy, kept in step with spec 0008 by hand and never read
 * from the database, so the promise cannot change under the person reading it.
 */
export const ACCOUNT_DELETION_REMOVED = [
  'Your name, email address and photo',
  'Your member profile, including your family and next of kin details',
  'Your children and leadership progress records',
  'Your department and clan roles',
  'Your notification history',
] as const;

export const ACCOUNT_DELETION_KEPT = [
  'An anonymous record that the account existed, so church statistics stay correct',
  'The record of any role you held, with your name removed',
  'Giving records the church is required to keep, with your name removed',
] as const;

export const ACCOUNT_DELETION_FINAL_WARNING =
  'This cannot be undone. There is no waiting period and no way to recover the account afterwards.';
