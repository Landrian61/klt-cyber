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
        "shadow-gold-glow",
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
