import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  /** Destination — defaults to the landing page. */
  href?: string;
  /** `light` for the dark brand rail, `ink` for the parchment form column. */
  tone?: "light" | "ink";
  className?: string;
}

/**
 * A circular back button. Lives on the left of the auth layout — over the brand
 * rail on md+, and top-left of the form column on small screens. Returns to the
 * landing page.
 */
export function BackButton({
  href = "/",
  tone = "ink",
  className,
}: BackButtonProps) {
  return (
    <Link
      href={href}
      aria-label="Back to home"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-95",
        tone === "light"
          ? "bg-white/10 text-white ring-1 ring-white/25 backdrop-blur-sm hover:bg-white/20"
          : "bg-surface-low text-on-surface ring-1 ring-black/[0.04] hover:bg-surface-high",
        className,
      )}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}
