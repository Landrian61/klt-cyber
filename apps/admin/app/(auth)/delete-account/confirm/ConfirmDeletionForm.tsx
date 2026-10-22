"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import {
  ACCOUNT_DELETION_FINAL_WARNING,
  DELETE_ACCOUNT_PATH,
  accountDeletionErrorMessage,
} from "@klt-cyber/shared";
import { api } from "@/lib/api";
import { Button, buttonVariants } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

/**
 * The claim step of the public deletion flow (spec 0008, AC-15).
 *
 * Following the emailed link does not delete anything. It lands here, and the
 * deletion happens only when the button below is pressed. That matters because
 * mail clients and security scanners follow links on their own: a link that
 * deleted on GET could destroy an account nobody meant to touch.
 *
 * Every refusal the token can earn — invalid, expired, already used, account
 * already gone — is decided server side inside the deletion transaction, not
 * here, so two people following the same link at the same moment cannot both
 * succeed. This component only reports what came back.
 */
export function ConfirmDeletionForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const confirmByToken = useAction(api.accountDeletion.confirmByToken);

  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      await confirmByToken({ token });
      setDone(true);
    } catch (err) {
      setError(accountDeletionErrorMessage(err));
    }
    setLoading(false);
  }

  // A link that arrived without its token is not worth a server round trip,
  // and saying so plainly beats a generic failure after a spinner.
  if (!token) {
    return (
      <div className="mt-6 rounded-xl bg-surface-low p-5">
        <p className="font-body text-base font-semibold text-on-surface">
          This link is incomplete
        </p>
        <p className="mt-1.5 font-body text-sm text-on-surface-variant">
          It looks like part of the link was cut off, which can happen when an
          email client wraps a long address. Request a new one and open it in a
          single click.
        </p>
        <Link
          href={DELETE_ACCOUNT_PATH}
          className="mt-4 inline-block font-body text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div
        className="mt-6 rounded-xl bg-surface-low p-5"
        role="status"
        aria-live="polite"
      >
        <p className="font-body text-base font-semibold text-on-surface">
          Your account has been deleted
        </p>
        <p className="mt-1.5 font-body text-sm text-on-surface-variant">
          Your personal details have been removed and your roles revoked. We
          have sent a confirmation to your email address.
        </p>
        <p className="mt-3 font-body text-sm text-on-surface-variant">
          You are always welcome back. Creating a new account in the app is all
          it takes.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="rounded-xl bg-crimson-light p-4 font-body text-sm font-semibold text-on-surface">
        {ACCOUNT_DELETION_FINAL_WARNING}
      </p>

      {error ? (
        <div className="space-y-3" role="alert">
          <p className="font-body text-sm text-destructive">{error}</p>
          <Link
            href={DELETE_ACCOUNT_PATH}
            className="inline-block font-body text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        className="w-full"
        disabled={loading}
        onClick={handleConfirm}
      >
        {loading ? "Deleting…" : "Delete my account permanently"}
      </Button>

      {/* A Link wearing the button styles, the same way `/reset-password`
          does it: this Button does not take `asChild`. */}
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
      >
        Keep my account
      </Link>
    </div>
  );
}
