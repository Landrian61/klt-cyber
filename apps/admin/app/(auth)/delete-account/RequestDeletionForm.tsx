"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import {
  ACCOUNT_DELETION_REQUEST_REPLY,
  accountDeletionExpiryLabel,
} from "@klt-cyber/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";

/**
 * The public deletion request form (spec 0008, AC-14, AC-16).
 *
 * There is exactly one success state, and it is shown whether the address has
 * an account, has no account, or has asked three times in the last hour. That
 * is the whole point: this form is reachable by anybody, so a reply that
 * differed would turn it into a way to find out who belongs to the church.
 *
 * So there is no "no account found" state here, no "too many requests" state,
 * and the copy comes from one shared constant rather than being written out
 * per branch. Adding a branch would quietly undo the enumeration safety the
 * backend goes out of its way to provide.
 *
 * The only failure this surface distinguishes is a request that never arrived
 * at all, which tells an attacker nothing and is worth offering a retry for.
 */
export function RequestDeletionForm() {
  const requestByEmail = useAction(api.accountDeletion.requestByEmail);

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setFailed(false);

    // Client side shape check only. It never says whether the address is
    // known, because this page cannot know that.
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setFieldError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await requestByEmail({ email: normalized });
      setSent(true);
    } catch {
      // Reaching here means the call itself did not complete. A rate limited
      // or unknown address does NOT reach here: the backend returns the same
      // success for both.
      setFailed(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div
        className="mt-6 rounded-xl bg-surface-low p-5"
        role="status"
        aria-live="polite"
      >
        <p className="font-body text-base font-semibold text-on-surface">
          Check your inbox
        </p>
        <p className="mt-1.5 font-body text-sm text-on-surface-variant">
          {ACCOUNT_DELETION_REQUEST_REPLY}
        </p>
        <p className="mt-3 font-body text-sm text-on-surface-variant">
          If nothing arrives, check your spam folder before requesting another
          link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      <Field
        label="Email address"
        htmlFor="delete-email"
        {...(fieldError ? { error: fieldError } : {})}
        hint={`The link is valid for ${accountDeletionExpiryLabel()} and can be used once. Nothing is deleted until you open it.`}
      >
        <Input
          id="delete-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (fieldError) setFieldError(null);
          }}
          aria-invalid={fieldError ? true : undefined}
          disabled={loading}
        />
      </Field>

      {failed ? (
        <p className="font-body text-sm text-destructive" role="alert">
          We could not reach the server. Check your connection and try again.
        </p>
      ) : null}

      <Button type="submit" variant="destructive" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Email me a deletion link"}
      </Button>
    </form>
  );
}
