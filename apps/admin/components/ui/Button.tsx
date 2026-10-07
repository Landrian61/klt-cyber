import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// Sacred Curator buttons (INTERFACE_SPEC §1.7). Primary is the gold-leaf
// gradient CTA; secondary is a ghost with a faint gold tint on hover; ghost is
// a text-style action. Focus rings come from the global :focus-visible rule.
const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-body font-semibold " +
  "transition-[filter,background-color,transform,box-shadow] duration-150 active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:cursor-not-allowed select-none";

const variants: Record<Variant, string> = {
  // Gold leaf gradient — references tokens, never raw hex.
  primary:
    "border border-border text-on-primary bg-[image:linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] " +
    "shadow-gold-glow hover:-translate-y-px hover:brightness-95 " +
    "disabled:bg-none disabled:bg-surface-high disabled:text-outline disabled:brightness-100 disabled:shadow-none disabled:translate-y-0",
  secondary:
    "border border-border text-primary bg-transparent " +
    "hover:bg-primary-light disabled:text-outline",
  ghost:
    "border border-border text-primary bg-transparent hover:bg-primary-light disabled:text-outline",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-[52px] px-6 text-md",
  lg: "h-[56px] px-8 text-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin"
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
