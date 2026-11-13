"use client";

import { Component, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * Catches a thrown query so one Dashboard panel group shows `ErrorState`
 * with retry instead of taking the whole page down (spec 0025, AC-18).
 * Retry remounts the children, which opens a fresh subscription.
 *
 * `fallback` replaces the plain `ErrorState` when a failed group still has
 * siblings to keep on screen (the overview gates the welcome panel, so its
 * fallback renders the other panels too).
 */
export class RetryBoundary extends Component<
  {
    children: (retry: () => void) => ReactNode;
    fallback?: (retry: () => void) => ReactNode;
  },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  render() {
    if (this.state.failed) {
      return this.props.fallback ? (
        this.props.fallback(this.retry)
      ) : (
        <ErrorState retry={this.retry} />
      );
    }
    return <div key={this.state.attempt}>{this.props.children(this.retry)}</div>;
  }
}
