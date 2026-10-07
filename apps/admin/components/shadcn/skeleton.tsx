import * as React from "react";
import { cn } from "@/lib/utils";

// Loading placeholder — a pulsing tonal surface.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-surface-high", className)}
      {...props}
    />
  );
}

export { Skeleton };
