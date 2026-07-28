import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type LinkProps = ComponentProps<typeof Link>;

/**
 * Gold-leaf pill CTA for the brand canvases — the deepened-gold gradient from
 * the mobile welcome screen, with a lift + brightening on hover and a gold glow.
 */
export function GoldCta({
  className,
  children,
  ...props
}: LinkProps & { children: ReactNode }) {
  return (
    <Link
      className={cn(
        "group inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-8",
        "bg-[image:linear-gradient(135deg,var(--color-gold-radiant),var(--color-gold-rich))]",
        "font-body text-base font-bold text-gold-ink",
        "shadow-[0_12px_36px_-8px_rgba(196,127,8,0.6)]",
        "transition-[transform,filter] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}

/**
 * Glass ghost CTA — translucent white on the heaven canvas, matching the mobile
 * welcome's secondary button.
 */
export function GhostCta({
  className,
  children,
  ...props
}: LinkProps & { children: ReactNode }) {
  return (
    <Link
      className={cn(
        "inline-flex h-[54px] items-center justify-center rounded-full px-8",
        "bg-white/10 font-body text-base font-semibold text-white backdrop-blur-sm",
        "ring-1 ring-white/25 transition-colors duration-200",
        "hover:bg-white/[0.18] active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
