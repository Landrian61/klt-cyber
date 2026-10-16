"use client";

import { useState } from "react";
import { passwordResetExpiryLabel } from "@klt-cyber/shared";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import {
  RESET_REQUEST_MESSAGES,
  requestResetLink,
  type ResetRequestOutcome,
} from "@/lib/password-reset";

/**
 * The reset request form, shared by `/forgot-password` and the inline re
 * request on an expired `/reset-password` (AC-2, AC-9).
 *
 * The confirmation it shows is deliberately the same whether or not the
 * address has an account (AC-4). There is no "no account found" state here,
 * and adding one would undo the enumeration safety the backend goes out of its
 * way to provide.
 */
export function RequestResetForm({
  idPrefix = "reset",
  submitLabel = "Send reset link",
  compact = false,
}: {
  /** Keeps input ids unique when this form is embedded beside another. */
  idPrefix?: string;
  submitLabel?: string;
  /** Tighter spacing and a smaller confirmation, for the embedded use. */
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ResetRequestOutcome | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setOutcome(null);

    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setFieldError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    const result = await requestResetLink(normalized);
    setLoading(false);
    setOutcome(result);
  }

  if (outcome?.kind === "sent") {
    return (
      <div className={compact ? "space-y-2" : "space-y-3"}>
        <p
          className={`font-body ${
            compact ? "text-sm" : "text-base"
          } text-on-surface`}
        >
          Check your inbox. If that address has an account, a reset link is on
          its way.
        </p>
        <p className="font-body text-sm text-on-surface-variant">
          The link works once and expires in {passwordResetExpiryLabel()}. It
          can take a minute to arrive, and it is worth a look in your spam
          folder.
        </p>
      </div>
    );
  }

  // The "sent" case returned above, so anything still here is a failure kind.
  const failure = outcome?.kind ?? null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={compact ? "space-y-4" : "mt-8 space-y-6"}
    >
      <Field
        label="Email address"
        htmlFor={`${idPrefix}-email`}
        error={fieldError ?? undefined}
      >
        <Input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={!!fieldError}
          placeholder="you@example.com"
        />
      </Field>

      <Button type="submit" loading={loading} className="w-full">
        {submitLabel}
      </Button>

      {failure && (
        <p
          role="alert"
          className="text-center font-body text-sm text-destructive"
        >
          {RESET_REQUEST_MESSAGES[failure]}
        </p>
      )}
    </form>
  );
}
