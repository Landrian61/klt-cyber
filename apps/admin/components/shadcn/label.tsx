import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Label, Sacred Curator tone. Kept as a plain <label> (no Radix
// dependency): the auth forms always pair it with a native control via htmlFor.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "font-body text-sm font-medium text-foreground select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
