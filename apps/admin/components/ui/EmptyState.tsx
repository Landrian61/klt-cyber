import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

// Designed empty state (INTERFACE_SPEC §12.3): 40px outline-tone icon, warm
// body-font messaging, optional action. Every list that can be empty gets
// one — quiet and inviting, never corporate.
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 py-12 text-center",
        className,
      )}
    >
      <span className="text-outline">{icon ?? <DefaultGlyph />}</span>
      <p className="font-body text-md font-semibold text-on-surface-variant">
        {title}
      </p>
      {message && <p className="font-body text-sm text-outline">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function DefaultGlyph() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      {/* An open, waiting vessel with a small spark above it. */}
      <path
        d="M8 20v8a4 4 0 0 0 4 4h16a4 4 0 0 0 4-4v-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 20h7l2 3h6l2-3h7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 6v6M15 9l2.5 2M25 9l-2.5 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
