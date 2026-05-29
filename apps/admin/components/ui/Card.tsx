import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Editorial card (INTERFACE_SPEC §1.7): a "lifted parchment" surface on the
// parchment page. The tonal step (surface-lowest on parchment) defines the
// edge — NO border. Ambient shadow only (4% on-surface), never a hard drop
// shadow.
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-lowest p-6 shadow-[0_8px_32px_rgba(28,28,24,0.04)]",
        className,
      )}
      {...props}
    />
  );
}
