"use client";

import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// Minimalist input (INTERFACE_SPEC §1.7): no enclosing box, defined by a
// bottom border only. Faint ghost border at rest; a 2px gold border on focus
// (one of the only two hard lines the spec permits). Password inputs get a
// show/hide eye toggle.
const fieldBase =
  "w-full bg-transparent px-0 py-3 font-body text-base text-on-surface " +
  "placeholder:text-outline focus:outline-none disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", error = false, ...props },
  ref,
) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && reveal ? "text" : type;

  const borderClass = error
    ? "border-b-2 border-error"
    : "border-b border-outline/25 focus-within:border-b-2 focus-within:border-primary";

  return (
    <div className={cn("relative flex items-center transition-colors", borderClass)}>
      <input
        ref={ref}
        type={resolvedType}
        aria-invalid={error || undefined}
        className={cn(fieldBase, isPassword && "pr-10", className)}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? "Hide password" : "Show password"}
          aria-pressed={reveal}
          tabIndex={-1}
          className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full text-outline hover:text-on-surface-variant"
        >
          {reveal ? <EyeOff /> : <Eye />}
        </button>
      )}
    </div>
  );
});

function Eye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.2-.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
