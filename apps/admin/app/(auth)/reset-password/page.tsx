import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./ResetPasswordForm";

/**
 * Where a reset link lands (spec 0007). A web page rather than a deep link
 * into the app, so it works from a laptop, a borrowed phone, or a phone with
 * the app uninstalled.
 *
 * Two headers matter here and both are set in this route's own metadata rather
 * than a `next.config` rule, so they travel with the page under OpenNext on
 * Cloudflare (AC-10):
 *
 * - `robots: noindex` keeps a reset URL out of search results.
 * - `referrer: no-referrer` matters more than usual, because the reset token
 *   sits in this page's own URL and a referrer header would hand it to every
 *   third party the page talks to.
 */
export const metadata: Metadata = {
  title: "Set a new password · KLT Cyber Church",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
