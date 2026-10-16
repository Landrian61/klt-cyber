"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import { RequestResetForm } from "@/components/auth/RequestResetForm";

const MIN_PASSWORD_LENGTH = 8;

/**
 * The three states this page can be in, decided by the query parameters
 * Better Auth's callback redirect sets:
 *
 * - a `token` → the set a new password form
 * - `?error=INVALID_TOKEN`, or nothing at all → the expired state, with an
 *   inline re request so the person is not sent back to start (AC-9)
 * - after a successful submit → the success panel (AC-7)
 *
 * Reaching the page with no query at all shows the expired state too. Somebody
 * who typed or bookmarked the bare URL has no usable token either way, and a
 * fourth "how did you get here" state would only be a worse way of saying the
 * same thing.
 */
export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmation?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  /** Set when the token turns out to be dead, including mid submit. */
  const [tokenDead, setTokenDead] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const errors: { password?: string; confirmation?: string } = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmation) {
      errors.confirmation = "Both passwords must match.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    if (!token) {
      setTokenDead(true);
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      setLoading(false);

      if (!error) {
        setDone(true);
        return;
      }

      // The token can die between loading this page and submitting it: an hour
      // can pass on an open tab, or the same link can be used twice. Rather
      // than a dead end, drop into the expired state, which carries the re
      // request form.
      if (error.code === "INVALID_TOKEN" || error.status === 400) {
        setTokenDead(true);
        return;
      }
      if (error.status === 429) {
        setFormError("Too many attempts. Please wait a few minutes and try again.");
        return;
      }
      setFormError("Something went wrong. Please try again.");
    } catch {
      setLoading(false);
      setFormError(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "We could not reach the server. Check your connection and try again."
          : "Something went wrong. Please try again."
      );
    }
  }

  if (done) return <SuccessPanel />;

  if (!token || tokenDead || searchParams.get("error")) {
    return <ExpiredPanel />;
  }

  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Set a new password"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          Choose something you have not used here before. You will be signed out
          on your other devices.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
          <Field
            label="New password"
            htmlFor="new-password"
            error={fieldErrors.password}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={!!fieldErrors.password}
              placeholder="Enter a new password"
            />
          </Field>

          <Field
            label="Confirm new password"
            htmlFor="confirm-password"
            error={fieldErrors.confirmation}
          >
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={!!fieldErrors.confirmation}
              placeholder="Enter it once more"
            />
          </Field>

          <Button type="submit" loading={loading} className="w-full">
            Save new password
          </Button>

          {formError && (
            <p
              role="alert"
              className="text-center font-body text-sm text-destructive"
            >
              {formError}
            </p>
          )}
        </form>
      </Stagger>
    </Card>
  );
}

/**
 * AC-7: confirm the change, say plainly that other devices were signed out,
 * offer the way back in, and carry the mobile seam with words, because a
 * person who started this in the app has to go back to it themselves.
 */
function SuccessPanel() {
  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Your password is set"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-on-surface">
          You can sign in with your new password now.
        </p>

        <p className="mt-4 font-body text-sm text-on-surface-variant">
          For safety, we signed you out everywhere else. Any other phone,
          tablet, or computer will ask you to sign in again.
        </p>

        <p className="mt-3 font-body text-sm text-on-surface-variant">
          Using the KLT Cyber mobile app? Open it again and sign in there with
          your new password.
        </p>

        <div className="mt-8">
          {/* A link that looks like the primary button: `Button` renders a real
              <button> and has no `asChild`, so the shared variants do the
              styling rather than a hand-rolled copy of them. */}
          <Link href="/sign-in" className={cn(buttonVariants(), "w-full")}>
            Go to portal sign in
          </Link>
        </div>
      </Stagger>
    </Card>
  );
}

/** The expired, already used, or missing token state, with a way forward. */
function ExpiredPanel() {
  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="This link has expired"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          Reset links last a short while and can only be used once, so this one
          has either expired or already been used.
        </p>

        <p className="mt-6 font-body text-sm text-on-surface-variant">
          Enter your email address and we will send a fresh one.
        </p>

        <div className="mt-4">
          <RequestResetForm
            idPrefix="expired"
            submitLabel="Send a new link"
            compact
          />
        </div>

        <p className="mt-6 text-center font-body text-sm text-on-surface-variant">
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
