import * as React from "react";
import { cn } from "@/lib/utils";

// Textarea, Sacred Curator tone: a filled tonal surface (no hard box border),
// gold focus ring, crimson invalid ring. Entered text uses the crimson value
// colour to match the Input.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-md bg-surface-low px-3 py-2.5 font-body text-base text-crimson caret-crimson",
        "placeholder:text-outline outline-none transition-[color,box-shadow] resize-y",
        "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-2 aria-invalid:ring-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
