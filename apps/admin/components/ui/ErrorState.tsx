"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export type ErrorStateCause = "offline" | "generic";

export interface ErrorStateProps {
  cause?: ErrorStateCause;
  retry?: () => void;
  className?: string;
}

const RETRY_COOLDOWN_MS = 3000;

const COPY: Record<ErrorStateCause, { title: string; message: string }> = {
  offline: {
    title: "You're offline",
    message: "Check your connection — this will pick back up on its own once it's back.",
  },
  generic: {
    title: "Something went wrong",
    message: "That didn't load. Give it another try.",
  },
};

// Shared failure state (Kingdom Radiant). No query/mutation/network call of
// its own — AC-4's dependency-free final fallback exists precisely because
// this component (or the boundary's own fallback slot) could still throw.
export function ErrorState({ cause = "generic", retry, className }: ErrorStateProps) {
  const [coolingDown, setCoolingDown] = useState(false);
  const copy = COPY[cause];

  const handleRetry = useCallback(() => {
    if (coolingDown || !retry) return;
    retry();
    setCoolingDown(true);
    setTimeout(() => setCoolingDown(false), RETRY_COOLDOWN_MS);
  }, [coolingDown, retry]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn("flex flex-col items-center gap-2 py-12 text-center", className)}
    >
      <span className="text-error">
        <ErrorGlyph />
      </span>
      <p className="font-body text-md font-semibold text-on-surface-variant">{copy.title}</p>
      <p className="font-body text-sm text-outline">{copy.message}</p>
      {retry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={handleRetry}
          disabled={coolingDown}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

function ErrorGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 6 36 32H4L20 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 17v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20" cy="28" r="1.2" fill="currentColor" />
    </svg>
  );
}
