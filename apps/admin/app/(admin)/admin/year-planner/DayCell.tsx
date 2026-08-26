"use client";

import { cn } from "@/lib/utils";
import { PlannerChip } from "./PlannerChip";
import { plannerItemKey, type PlannerItem } from "./types";

// The Month/Week views' shared day cell — larger than MiniMonth's marker-only
// dot, room for the day number (numeral, so font-mono) plus a preview of
// color-coded item chips (see PlannerChip/plannerColors — one hue per item
// type). No border lines between cells; separation comes from the grid gap
// plus each cell's own tonal surface. "Today" is called out with gold TEXT
// only, not a gold background fill — a solid fill would compete with the
// chips' own colors for attention.
export function DayCell({
  date,
  items = [],
  inMonth = true,
  isToday = false,
  variant,
  onClick,
}: {
  date: Date;
  items?: PlannerItem[];
  inMonth?: boolean;
  isToday?: boolean;
  variant: "month" | "week";
  onClick: () => void;
}) {
  const maxTitles = variant === "week" ? 4 : 2;
  const shown = items.slice(0, maxTitles);
  const extra = items.length - shown.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-md p-2 text-left transition-colors",
        variant === "week" ? "min-h-32" : "min-h-20",
        inMonth
          ? "bg-surface-lowest hover:bg-surface-high"
          : "bg-transparent hover:bg-surface-low",
      )}
    >
      <span
        className={cn(
          "font-mono text-sm",
          isToday
            ? "font-bold text-primary"
            : inMonth
              ? "text-on-surface"
              : "text-outline",
        )}
      >
        {date.getDate()}
      </span>
      <div className="flex w-full flex-col gap-1">
        {shown.map((item) => (
          <PlannerChip key={plannerItemKey(item)} item={item} />
        ))}
        {extra > 0 && (
          <span className="font-body text-[11px] font-medium text-outline">
            +{extra} more
          </span>
        )}
      </div>
    </button>
  );
}
