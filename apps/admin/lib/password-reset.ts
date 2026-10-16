import { RESET_PASSWORD_PATH } from "@klt-cyber/shared";
import { authClient } from "./auth";

/**
 * The one reset request call, shared by `/forgot-password` and the inline re
 * request on `/reset-password` (AC-2, AC-9), so both surfaces send the same
 * thing and show the same neutral confirmation.
 */

export type ResetRequestOutcome =
  /**
   * The neutral result. Deliberately returned whether or not the address has
   * an account: the endpoint answers identically in both cases, and nothing
   * here may break that (AC-4).
   */
  | { kind: "sent" }
  /** Too many requests from this caller (AC-11). The one documented case where
   * the answer depends on something other than the address. */
  | { kind: "rate_limited" }
  /** The request never reached the server. Worth offering a retry (AC-21). */
  | { kind: "offline" }
  /** A misconfigured `redirectTo`, rejected against `trustedOrigins`. */
  | { kind: "untrusted_origin" }
  /** Anything else. Retryable, since we cannot say it is not. */
  | { kind: "error" };

export const RESET_REQUEST_MESSAGES: Record<
  Exclude<ResetRequestOutcome["kind"], "sent">,
  string
> = {
  rate_limited:
    "Too many attempts. Please wait a few minutes and try again.",
  offline:
    "We could not reach the server. Check your connection and try again.",
  untrusted_origin:
    "This link could not be verified. Please contact Administration.",
  error: "Something went wrong. Please try again.",
};

/**
 * Requests a reset link for `email`.
 *
 * The address is trimmed and lowercased before the call (AC-21), so a stray
 * capital or a copy and paste space cannot look like a different account.
 *
 * `redirectTo` is this portal's own origin plus the shared reset path, so it
 * always matches the deployment's `SITE_URL` and therefore always passes the
 * `trustedOrigins` check on the backend.
 */
export async function requestResetLink(
  email: string
): Promise<ResetRequestOutcome> {
  const normalized = email.trim().toLowerCase();

  try {
    const { error } = await authClient.requestPasswordReset({
      email: normalized,
      redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
    });

    if (!error) return { kind: "sent" };
    if (error.status === 429) return { kind: "rate_limited" };
    if (error.status === 403) return { kind: "untrusted_origin" };
    // A fetch that never landed surfaces here with no HTTP status at all.
    if (!error.status) return { kind: "offline" };
    return { kind: "error" };
  } catch {
    // The client threw rather than returning an error: almost always a dropped
    // connection. Trust the browser over a guess when it says it is offline.
    return {
      kind:
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "error",
    };
  }
}
