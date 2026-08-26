import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ActionVariant = "gold" | "danger" | "neutral";

export interface ActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  loading?: boolean;
}

// Compact row action (INTERFACE_SPEC §1.7): a small tonal button for table
// rows and toolbars — light gold, light crimson, or neutral parchment fills,
// each with a hairline border (Hairline Border Rule); hover deepens the tone.
const variants: Record<ActionVariant, string> = {
  gold: "border border-border text-primary bg-primary-light hover:bg-primary-dim",
  danger: "border border-border text-crimson bg-crimson-light hover:brightness-95",
  neutral: "border border-border text-on-surface-variant bg-surface-low hover:bg-surface-high",
};

export function ActionButton({
  variant = "gold",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex h-8 select-none items-center justify-center gap-1.5 rounded-md px-3 font-body text-sm font-semibold transition-colors duration-150",
        variants[variant],
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  );
}
