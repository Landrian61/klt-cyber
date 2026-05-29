import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Form label (INTERFACE_SPEC §1.3/§1.7): body font, small, secondary tone.
// Never the display face for UI labels.
export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block font-body text-sm font-medium text-on-surface-variant",
        className,
      )}
      {...props}
    />
  );
}
