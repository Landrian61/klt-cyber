/**
 * The closed email registry (SRS F1-10, spec 0007).
 *
 * The SRS allows exactly five system emails and no more. This list is the only
 * source of that rule: `internal.emails.send` accepts no template name outside
 * it, a test in `__tests__/emails.test.ts` fails if the list grows or shrinks,
 * and a second test in `convex/emails.test.ts` fails if the Resend component's
 * `sendEmail` is called from any file other than `convex/emails.ts`.
 *
 * Adding a sixth email is therefore a deliberate act that breaks a test and
 * needs an SRS change, not something a feature can do by accident.
 */
export const EMAIL_TEMPLATES = [
  'welcome',
  'password_reset',
  'profile_verified',
  'profile_sent_back',
  'account_deleted',
] as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

/**
 * Portal paths for the password reset flow. Shared so the Next.js routes, the
 * middleware allowlist, and both clients' `redirectTo` cannot drift apart.
 */
export const RESET_PASSWORD_PATH = '/reset-password';
export const FORGOT_PASSWORD_PATH = '/forgot-password';

/**
 * How long a reset link stays valid, in seconds (AC-5).
 *
 * One source for two consumers: it configures Better Auth's
 * `emailAndPassword.resetPasswordTokenExpiresIn` and it renders the "1 hour"
 * wording in the email and on both confirmation screens. The mobile mock
 * previously claimed "30 minutes" against nothing at all, which is exactly the
 * drift this constant exists to prevent.
 */
export const PASSWORD_RESET_EXPIRY_SECONDS = 3600;

/**
 * The same expiry as human wording, derived rather than retyped, so copy can
 * never contradict the configuration above.
 */
export function passwordResetExpiryLabel(): string {
  const hours = PASSWORD_RESET_EXPIRY_SECONDS / 3600;
  if (hours >= 1 && Number.isInteger(hours)) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const minutes = Math.round(PASSWORD_RESET_EXPIRY_SECONDS / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
