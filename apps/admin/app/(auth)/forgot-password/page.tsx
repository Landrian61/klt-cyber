import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/shadcn/card";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import { RequestResetForm } from "@/components/auth/RequestResetForm";

/**
 * A page rather than a dialog on the sign in screen (spec 0007, RECOMMEND 3):
 * it reuses the existing auth shell, can be linked from an email or a
 * bookmark, and needs one middleware allowlist line instead of extra state on
 * the sign in page.
 *
 * `noindex` lives in this route's own metadata rather than a `next.config`
 * header, so it travels with the page under OpenNext on Cloudflare (AC-10).
 */
export const metadata: Metadata = {
  title: "Reset your password · KLT Cyber Church",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Reset your password"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          Enter the email address on your account and we will send you a link to
          set a new password.
        </p>

        <RequestResetForm idPrefix="forgot" />

        <p className="mt-6 text-center font-body text-sm text-on-surface-variant">
          Remembered it?{" "}
          <Link
            href="/sign-in"
            className="font-body font-semibold text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </Stagger>
    </Card>
  );
}
