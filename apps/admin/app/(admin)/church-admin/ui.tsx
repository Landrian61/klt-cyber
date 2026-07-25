import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// Plain-Tailwind primitives for Church Admin, built directly against the
// Final Design System (Manrope headings via [data-section="church-admin"],
// Inter body, 44px control height, 12px card radius, 8px grid, Lucide
// icons). No shadcn/Base UI — avoids the filename-casing collisions and
// Radix/Base-UI API mismatches we hit building on top of shadcn.

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  // Gold-leaf gradient CTA — same tokens as the mobile app's primary button.
  default:
    "text-[var(--color-on-primary)] bg-[image:linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] hover:brightness-95 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:brightness-100",
  outline:
    "border border-border bg-background hover:bg-muted disabled:opacity-50",
  ghost: "hover:bg-muted disabled:opacity-50",
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50",
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-5 text-sm",
  sm: "h-9 px-4 text-sm",
  icon: "h-9 w-9",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed",
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-primary)] text-[var(--color-on-primary)]",
  secondary: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border border-border text-foreground",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeVariantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Select — plain native <select>, styled. No compound-component API to
// mismatch against; value/onChange work exactly like any other input.
// ---------------------------------------------------------------------------
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Dialog — minimal controlled modal. No portal library; fixed-position
// overlay is enough for an admin console (no nested-scroll edge cases here).
// ---------------------------------------------------------------------------
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
