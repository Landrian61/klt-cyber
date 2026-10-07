"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn/ui Input, adapted to the Sacred Curator minimalist field (§1.7): no
// enclosing box — a faint ghost bottom border at rest, thickening to a 2px
// crimson line when active. The entered value is set in crimson (with a matching
// caret); the placeholder stays muted. `aria-invalid` keeps the crimson error
// state (a heavier weight would be indistinguishable, so error relies on the
// message text).
const fieldBase =
  "w-full bg-transparent px-0 py-3 font-body text-base text-crimson caret-crimson " +
  "placeholder:text-outline outline-none disabled:opacity-50";

function Input({
  className,
  type = "text",
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<"input">) {
  const [reveal, setReveal] = React.useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && reveal ? "text" : type;
  const invalid = ariaInvalid === true || ariaInvalid === "true";

  return (
    <div
      data-slot="input-wrapper"
      className={cn(
        "relative flex items-center border-b transition-colors",
        invalid
          ? "border-b-2 border-destructive"
          : "border-input focus-within:border-b-2 focus-within:border-crimson",
      )}
    >
      <input
        data-slot="input"
        type={resolvedType}
        aria-invalid={ariaInvalid}
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
          className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full text-outline transition-colors hover:text-on-surface-variant"
        >
          {reveal ? (
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Eye className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

export { Input };
