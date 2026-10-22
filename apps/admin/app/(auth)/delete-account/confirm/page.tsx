import { Suspense } from "react";
import type { Metadata } from "next";
import {
  ACCOUNT_DELETION_KEPT,
  ACCOUNT_DELETION_REMOVED,
} from "@klt-cyber/shared";
import { Card } from "@/components/shadcn/card";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import { ConfirmDeletionForm } from "./ConfirmDeletionForm";

/**
 * Where the emailed deletion link lands (spec 0008, AC-15).
 *
 * The page restates what goes and what stays before offering the button,
 * exactly as the in app screen does (AC-1): somebody arriving from an email an
 * hour later should not have to remember what they were told on a web form.
 */
export const metadata: Metadata = {
  title: "Confirm account deletion · KLT Cyber Church",
  robots: { index: false, follow: false },
};

export default function ConfirmDeleteAccountPage() {
  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Confirm deletion"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          You asked to delete your KLT Cyber Church account. Please read this
          once more, then confirm below.
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

        {/* `useSearchParams` needs a Suspense boundary to stay statically
            renderable; without it the whole route opts into dynamic
            rendering. */}
        <Suspense fallback={null}>
          <ConfirmDeletionForm />
        </Suspense>
      </Stagger>
    </Card>
  );
}
