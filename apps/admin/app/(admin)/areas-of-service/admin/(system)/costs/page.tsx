"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { CostsClient } from "./CostsClient";
import { ErrorState } from "@/components/ui/ErrorState";

// Spec 0002's error-screen pattern, matching the analytics page beside it.
export default function CostRegisterPage() {
  const [attempt, setAttempt] = useState(0);

  return (
    <Sentry.ErrorBoundary
      key={attempt}
      fallback={() => (
        <ErrorState cause="generic" retry={() => setAttempt((a) => a + 1)} />
      )}
    >
      <CostsClient />
    </Sentry.ErrorBoundary>
  );
}
