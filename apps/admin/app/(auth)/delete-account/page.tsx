import type { Metadata } from "next";
import Link from "next/link";
import {
  ACCOUNT_DELETION_FINAL_WARNING,
  ACCOUNT_DELETION_KEPT,
  ACCOUNT_DELETION_REMOVED,
} from "@klt-cyber/shared";
import { Card } from "@/components/shadcn/card";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import { RequestDeletionForm } from "./RequestDeletionForm";

/**
 * The public deletion request page (spec 0008, AC-14).
 *
 * It exists for one situation: somebody has already removed the app and wants
 * their account gone. Without this page the only way out would be to reinstall
 * in order to leave, which is both hostile and the thing Apple and Google ask
 * us not to do. The in app flow is still the primary one; this is the door for
 * people who no longer have that app.
 *
 * Public by design, so it is outside every authenticated layout and
 * allowlisted in `middleware.ts`. `noindex` lives in this route's own metadata
 * rather than a `next.config` header, so it travels with the page under
 * OpenNext on Cloudflare — the same reason `/forgot-password` does it here.
 *
 * It is also the URL the Apple and Google store listings and the privacy
 * policy point at, so the copy has to stand on its own for a reader who
 * arrived from a store page with no other context.
 */
export const metadata: Metadata = {
  title: "Delete your account · KLT Cyber Church",
  description:
    "Request deletion of your KLT Cyber Church account from the web, without reinstalling the app.",
  robots: { index: false, follow: false },
};

export default function DeleteAccountPage() {
  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Delete your account"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          If you still have the app, you can delete your account inside it under
          My Profile. Otherwise, enter your email address below and we will send
          you a link.
        </p>

        <section className="mt-6">
          <h2 className="font-body text-sm font-semibold text-on-surface">
            What is removed
          </h2>
          <ul className="mt-2 space-y-1.5">
            {ACCOUNT_DELETION_REMOVED.map((item) => (
              <li
                key={item}
                className="flex gap-2.5 font-body text-sm text-on-surface-variant"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-destructive"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h2 className="font-body text-sm font-semibold text-on-surface">
            What the church keeps
          </h2>
          <ul className="mt-2 space-y-1.5">
            {ACCOUNT_DELETION_KEPT.map((item) => (
              <li
                key={item}
                className="flex gap-2.5 font-body text-sm text-on-surface-variant"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary"
                />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-body text-xs text-on-surface-variant">
            Nothing kept has your name on it.
          </p>
        </section>

        <p className="mt-5 rounded-xl bg-crimson-light p-4 font-body text-sm font-semibold text-on-surface">
          {ACCOUNT_DELETION_FINAL_WARNING}
        </p>

        <RequestDeletionForm />

        <p className="mt-6 text-center font-body text-sm text-on-surface-variant">
          Changed your mind?{" "}
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
