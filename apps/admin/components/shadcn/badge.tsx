import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Status pill (INTERFACE_SPEC §1.7): 22px tall, tonal background separation —
// never a border. Variant names mirror the domain states used across the admin
// so pages migrate with a plain import swap.
const badgeVariants = cva(
  "inline-flex h-[22px] items-center rounded-full px-2.5 font-body text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        visitor: "bg-royal-light text-royal",
        member: "bg-primary-light text-primary",
        role: "bg-royal-light text-royal",
        suspended: "bg-error-light text-error",
        rejected: "bg-error-light text-error",
        pending: "bg-warning-light text-warning",
        verified: "bg-success-light text-success",
        neutral: "bg-surface-low text-on-surface-variant",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string;
  children: ReactNode;
}

function Badge({ variant, className, children }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)}>
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
