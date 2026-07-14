import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  name?: string | null;
  email?: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

// Initials avatar (INTERFACE_SPEC §1.2/§1.7): a sunken gold circle
// (primary-fixed-dim) with gold initials — tonal, no border. Falls back from
// name words → email prefix. Renders a plain <img> when a picture exists.
const sizes: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-xs", // 28px
  md: "h-9 w-9 text-sm", // 36px
  lg: "h-12 w-12 text-base", // 48px
  xl: "h-[72px] w-[72px] text-xl", // 72px
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

export function Avatar({ name, email, src, size = "md", className }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? email ?? "Avatar"}
        className={cn(
          "inline-block shrink-0 rounded-full object-cover",
          sizes[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary-dim font-body font-semibold text-primary",
        sizes[size],
        className,
      )}
    >
      {initialsOf(name, email)}
    </span>
  );
}
