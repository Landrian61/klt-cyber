"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md" | "lg" | "xl";
type AvatarVariant = "sunken" | "gradient";

export interface AvatarProps {
  name?: string | null;
  email?: string;
  src?: string | null;
  size?: AvatarSize;
  /**
   * `sunken` (default) — the pale gold disc used in tables/lists.
   * `gradient` — the gold-leaf gradient disc with white initials, matching the
   * mobile app's profile avatar.
   */
  variant?: AvatarVariant;
  className?: string;
}

const sizes: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-[72px] w-[72px] text-xl",
};

const variantRoot: Record<AvatarVariant, string> = {
  sunken: "bg-primary-dim",
  gradient:
    "bg-[image:linear-gradient(135deg,var(--color-gold-radiant),var(--color-gold-rich))] shadow-[0_2px_10px_rgba(196,127,8,0.35)]",
};

const variantFallback: Record<AvatarVariant, string> = {
  sunken: "text-primary",
  gradient: "text-gold-ink",
};

function initialsOf(name?: string | null, email?: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const words = trimmed.split(/\s+/);
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function Avatar({
  name,
  email,
  src,
  size = "md",
  variant = "sunken",
  className,
}: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        variantRoot[variant],
        sizes[size],
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={name ?? email ?? "Avatar"}
          className="h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className={cn(
          "flex h-full w-full items-center justify-center font-body font-semibold",
          variantFallback[variant],
        )}
      >
        {initialsOf(name, email)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { Avatar };
