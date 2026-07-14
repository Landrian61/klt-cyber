import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

// Minimalist textarea (INTERFACE_SPEC §1.7 Input Fields): the same treatment
// as Input — transparent, defined by a ghost bottom border that turns 2px
// gold on focus. Fixed rows, no resize handle.
export function Textarea({
  className,
  error = false,
  rows = 3,
  ...props
}: TextareaProps) {
  const borderClass = error
    ? "border-b-2 border-error"
    : "border-b border-outline/25 focus-within:border-b-2 focus-within:border-primary";

  return (
    <div className={cn("transition-colors", borderClass)}>
      <textarea
        rows={rows}
        aria-invalid={error || undefined}
        className={cn(
          "w-full resize-none bg-transparent px-0 py-3 font-body text-base text-on-surface placeholder:text-outline focus:outline-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}
