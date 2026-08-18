"use client";

import { cn } from "@/lib/utils";
import { plannerItemKey, type PlannerItem } from "./types";

// The Month/Week views' shared day cell — larger than MiniMonth's marker-only
// dot, room for the day number (numeral, so font-mono) plus a preview of item
// titles. No border lines between cells; separation comes from the grid gap
// plus each cell's own tonal surface.
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
        isToday
          ? "bg-primary-light hover:brightness-95"
          : inMonth
            ? "bg-surface-lowest hover:bg-surface-high"
            : "bg-transparent hover:bg-surface-low",
      )}
    >
      <div className="flex w-full items-center justify-between">
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
        {items.length > 0 && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex w-full flex-col gap-0.5">
        {shown.map((item) => (
          <span
            key={plannerItemKey(item)}
            className="w-full truncate font-body text-[11px] text-on-surface-variant"
          >
            {item.title}
          </span>
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
