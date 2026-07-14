import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "visitor"
  | "member"
  | "role"
  | "suspended"
  | "pending"
  | "verified"
  | "rejected"
  | "neutral";

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

// Status pill (INTERFACE_SPEC §1.7 Badges & Pills): 22px tall, tonal
// background separation — never a border. Body font, xs, weight 600.
const variants: Record<BadgeVariant, string> = {
  visitor: "bg-royal-light text-royal",
  member: "bg-primary-light text-primary",
  role: "bg-royal-light text-royal",
  suspended: "bg-error-light text-error",
  rejected: "bg-error-light text-error",
  pending: "bg-warning-light text-warning",
  verified: "bg-success-light text-success",
  neutral: "bg-surface-low text-on-surface-variant",
};

export function Badge({ variant = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-full px-2.5 font-body text-xs font-semibold",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
