import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui Button, adapted to Sacred Curator. The `default` variant is the
// Kingdom Radiant gold-leaf CTA (matches the mobile welcome button); focus is
// handled by the global gold :focus-visible outline (globals.css §12.5), so we
// don't add a competing ring here.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-body font-semibold " +
    "transition-[filter,background-color,transform,box-shadow] duration-150 " +
    "outline-none disabled:pointer-events-none disabled:cursor-not-allowed " +
    "active:scale-[0.98] select-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-border text-gold-ink bg-[image:linear-gradient(135deg,var(--color-gold-radiant),var(--color-gold-rich))] " +
          "shadow-gold-glow hover:-translate-y-px hover:brightness-105 " +
          "disabled:bg-none disabled:bg-surface-high disabled:text-outline disabled:shadow-none disabled:translate-y-0",
        secondary:
          "border border-border text-primary bg-secondary hover:bg-surface-high disabled:text-outline",
        outline:
          "border border-border text-on-surface bg-transparent hover:bg-secondary disabled:text-outline",
        ghost:
          "border border-border text-primary bg-transparent hover:bg-accent disabled:text-outline",
        destructive:
          "border border-border text-destructive-foreground bg-destructive hover:brightness-95 disabled:opacity-60",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[52px] px-6 text-base",
        sm: "h-9 px-4 text-sm",
        lg: "h-[56px] px-8 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

// ref accepted as a plain prop (React 19 — no forwardRef needed). Required
// for Radix's asChild/Slot pattern (Popover/Tooltip triggers) to measure and
// position against the real <button>, and for shadcn registry code (e.g.
// calendar.tsx's day buttons) that forwards a ref through this component.
function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

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

export { Button, buttonVariants };
