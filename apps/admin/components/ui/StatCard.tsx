import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { label: string; tone: "positive" | "neutral" | "concern" };
  /** Visually louder variant for a headline KPI (e.g. a dashboard's primary
   * "Target Segment Match" count) — gold-tinted border/surface, larger
   * value. Existing tokens only, no new color. */
  emphasized?: boolean;
  className?: string;
}

// Dashboard stat (INTERFACE_SPEC §1.7 Editorial Card, §1.3): a lifted
// parchment card whose big number is set in the mono face — counts are
// "reference numbers", never the display serif.
const trendTones: Record<"positive" | "neutral" | "concern", string> = {
  positive: "text-brand",
  neutral: "text-on-surface-variant",
  concern: "text-crimson",
};

export function StatCard({
  label,
  value,
  hint,
  trend,
  emphasized,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface-lowest p-6 shadow-e1",
        emphasized && "border-primary/40 bg-primary-light shadow-e2",
        className,
      )}
    >
      <p className="font-body text-sm text-on-surface-variant">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono font-bold text-on-surface",
          emphasized ? "text-5xl" : "text-4xl",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 font-body text-xs text-outline">{hint}</p>}
      {trend && (
        <p
          className={cn(
            "mt-2 font-body text-xs font-semibold",
            trendTones[trend.tone],
          )}
        >
          {trend.label}
        </p>
      )}
    </div>
  );
}
