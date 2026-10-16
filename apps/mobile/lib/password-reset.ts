import { RESET_PASSWORD_PATH } from '@klt-cyber/shared';
import { authClient } from './auth';

/**
 * Requesting a reset link from the app (spec 0007, AC-1, AC-4, AC-21).
 *
 * The link lands on the web portal rather than deep linking back into the app,
 * so a reset works from a borrowed phone or a laptop and nothing here depends
 * on app store builds or domain association files. The cost is that the app has
 * to know the portal's origin, which is baked in per EAS profile.
 */

export type ResetRequestOutcome =
  /** The neutral result, identical whether or not the address has an account. */
  | { kind: 'sent' }
  | { kind: 'rate_limited' }
  | { kind: 'offline' }
  /**
   * `redirectTo` failed the backend's `trustedOrigins` check. Only a
   * misconfigured build can cause this, which is why the copy says to update
   * the app rather than suggesting the person did something wrong.
   */
  | { kind: 'untrusted_origin' }
  /** `EXPO_PUBLIC_PORTAL_URL` was never set in this build. */
  | { kind: 'not_configured' }
  | { kind: 'error' };

export const RESET_REQUEST_MESSAGES: Record<
  Exclude<ResetRequestOutcome['kind'], 'sent'>,
  string
> = {
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  offline: "We couldn't reach the server. Check your connection and try again.",
  untrusted_origin:
    'This app build needs an update before password reset will work. Please update the app.',
  not_configured:
    'Password reset is not set up in this build. Please update the app.',
  error: 'Something went wrong. Please try again.',
};

/**
 * Where the reset link should land. Set per EAS profile to that profile's
 * deployment `SITE_URL`, so it always matches a trusted origin on the backend.
 */
function portalResetUrl(): string | null {
  const portal = process.env.EXPO_PUBLIC_PORTAL_URL;
  if (!portal) return null;
  return `${portal.replace(/\/$/, '')}${RESET_PASSWORD_PATH}`;
}

export async function requestResetLink(
  email: string
): Promise<ResetRequestOutcome> {
  const redirectTo = portalResetUrl();
  if (!redirectTo) {
    console.error(
      'EXPO_PUBLIC_PORTAL_URL is not set in this build; see apps/mobile/eas.json'
    );
    return { kind: 'not_configured' };
  }

  // Trimmed and lowercased before the call (AC-21), so a stray capital or a
  // trailing space from autocomplete cannot look like a different account.
  const normalized = email.trim().toLowerCase();

  try {
    const { error } = await authClient.requestPasswordReset({
      email: normalized,
      redirectTo,
    });

    if (!error) return { kind: 'sent' };
    if (error.status === 429) return { kind: 'rate_limited' };
    if (error.status === 403) return { kind: 'untrusted_origin' };
    if (!error.status) return { kind: 'offline' };
    return { kind: 'error' };
  } catch {
    return { kind: 'offline' };
  }
}
