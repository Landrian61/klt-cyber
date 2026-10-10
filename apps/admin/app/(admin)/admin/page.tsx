"use client";

import { Component, useState, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { AdminDashboardClient } from "./DashboardClient";
import { ErrorState } from "@/components/ui/ErrorState";

// Dependency-free final fallback (AC-4): if `ErrorState` itself (or
// Sentry's own fallback machinery) throws while rendering, this still
// renders — plain markup only, nothing that could itself fail.
class FinalFallbackBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          Something went wrong. Please reload the page.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AdminDashboardPage() {
  const [attempt, setAttempt] = useState(0);

  return (
    <FinalFallbackBoundary>
      <Sentry.ErrorBoundary
        key={attempt}
        fallback={() => <ErrorState cause="generic" retry={() => setAttempt((a) => a + 1)} />}
      >
        <AdminDashboardClient />
      </Sentry.ErrorBoundary>
    </FinalFallbackBoundary>
  );
}
