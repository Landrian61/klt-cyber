import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { label: string; tone: "positive" | "neutral" | "concern" };
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

export function StatCard({ label, value, hint, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-lowest p-6 shadow-[0_8px_32px_rgba(28,28,24,0.04)]",
        className,
      )}
    >
      <p className="font-body text-sm text-on-surface-variant">{label}</p>
      <p className="mt-2 font-mono text-4xl font-bold text-on-surface">{value}</p>
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
