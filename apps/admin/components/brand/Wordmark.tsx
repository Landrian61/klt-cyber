import Image from "next/image";
import { cn } from "@/lib/utils";

export interface WordmarkProps {
  /** Logo diameter in px. */
  size?: number;
  /** Show the "KLT Cyber Church / Admin Portal" lockup beside the mark. */
  showText?: boolean;
  className?: string;
  /** Light lockup for dark canvases (default) vs. ink for parchment. */
  tone?: "light" | "ink";
}

/**
 * The circular KLT logo lockup. On the heaven-blue canvases it carries a soft
 * gold ring and drop shadow so it reads as gilt against the deep navy.
 */
export function Wordmark({
  size = 44,
  showText = true,
  className,
  tone = "light",
}: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-gold-radiant/40 shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
        style={{ width: size, height: size }}
      >
        <Image
          src="/logo-circle-192.png"
          alt="KLT Cyber Church"
          width={size}
          height={size}
          className="rounded-full object-cover"
          priority
        />
      </span>
      {showText && (
        <span className="flex flex-col leading-tight">
          <span
            className={cn(
              "font-body text-sm font-semibold tracking-wide",
              tone === "light" ? "text-white" : "text-on-surface",
            )}
          >
            KLT Cyber Church
          </span>
          <span
            className={cn(
              "font-body text-[11px] tracking-[0.18em] uppercase",
              tone === "light" ? "text-gold-radiant" : "text-primary",
            )}
          >
            Admin Portal
          </span>
        </span>
      )}
    </span>
  );
}
