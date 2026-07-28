"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  name?: string | null;
  email?: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

// Initials avatar on Radix Avatar (image load states handled for free): a
// sunken gold circle with gold initials — tonal, no border. Same public API as
// the legacy component for a clean swap.
const sizes: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-[72px] w-[72px] text-xl",
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

function Avatar({ name, email, src, size = "md", className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-dim",
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
        className="flex h-full w-full items-center justify-center font-body font-semibold text-primary"
      >
        {initialsOf(name, email)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { Avatar };
