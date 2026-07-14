import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

// Minimalist native select (INTERFACE_SPEC §1.7 Input Fields): matches Input —
// no enclosing box, ghost bottom border that turns 2px gold on focus. The
// native arrow is replaced by an inline chevron in the outline tone.
export function Select({ className, error = false, children, ...props }: SelectProps) {
  const borderClass = error
    ? "border-b-2 border-error"
    : "border-b border-outline/25 focus-within:border-b-2 focus-within:border-primary";

  return (
    <div className={cn("relative flex items-center transition-colors", borderClass)}>
      <select
        aria-invalid={error || undefined}
        className={cn(
          "w-full appearance-none bg-transparent py-3 pl-0 pr-8 font-body text-base text-on-surface focus:outline-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-0 text-outline">
        <Chevron />
      </span>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
