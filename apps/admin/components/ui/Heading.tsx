import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type HeadingSize = "lg" | "xl" | "2xl";

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3";
  size?: HeadingSize;
}

// Display heading (INTERFACE_SPEC §1.3): Playfair Display, weight 700. Only
// used at or above 18px — never for UI labels or navigation. Sizes map to the
// spec's type scale (xl = 24px hero, 2xl = 32px major hero).
const sizes: Record<HeadingSize, string> = {
  lg: "text-xl", // 20px screen titles
  xl: "text-2xl tracking-tight", // 24px hero
  "2xl": "text-4xl tracking-tight", // 32px major hero
};

export function Heading({
  as: Tag = "h1",
  size = "xl",
  className,
  ...props
}: HeadingProps) {
  return (
    <Tag
      className={cn(
        "font-display font-bold text-on-surface",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
