import * as React from "react";
import { Label } from "./label";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  htmlFor: string;
  /** Error message — renders in crimson and replaces the hint. */
  error?: string;
  /** Resting helper text. */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A labelled form field: Label → control → error/hint. Keeps the auth forms
 * declarative and consistent. Pairs with the shadcn Input/Button primitives.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="font-body text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="font-body text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
