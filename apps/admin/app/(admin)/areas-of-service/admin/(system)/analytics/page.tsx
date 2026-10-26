"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { AnalyticsClient } from "./AnalyticsClient";
import { ErrorState } from "@/components/ui/ErrorState";

// Spec 0002's error-screen pattern, the same shape the Administration
// dashboard uses: a Sentry boundary whose fallback offers retry, keyed on an
// attempt counter so retrying genuinely remounts the subtree rather than
// re-rendering the same failed tree.
export default function PlatformAnalyticsPage() {
  const [attempt, setAttempt] = useState(0);

  return (
    <Sentry.ErrorBoundary
      key={attempt}
      fallback={() => (
        <ErrorState cause="generic" retry={() => setAttempt((a) => a + 1)} />
      )}
    >
      <AnalyticsClient />
    </Sentry.ErrorBoundary>
  );
}
