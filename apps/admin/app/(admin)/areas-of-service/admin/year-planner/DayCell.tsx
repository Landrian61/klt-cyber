"use client";

import { cn } from "@/lib/utils";
import { PlannerChip } from "./PlannerChip";
import { plannerItemKey, type PlannerItem } from "./types";

// The Month and Week views' day cell, laid out like a wall calendar: the date
// number top right, the day's items as colour coded chips below, and a
// "+N more" when they do not fit. Three tones tell days apart without lines
// (the No Line Rule): a weekday is lifted parchment, a weekend sits a step
// lower, and a public holiday takes a royal wash with its name spelled out.
// Days outside the month fade back. Today's number sits in a gold pill.
export function DayCell({
  date,
  items = [],
  inMonth = true,
  isToday = false,
  isWeekend = false,
  holiday,
  variant,
  onClick,
}: {
  date: Date;
  items?: PlannerItem[];
  inMonth?: boolean;
  isToday?: boolean;
  isWeekend?: boolean;
  holiday?: string;
  variant: "month" | "week";
  onClick: () => void;
}) {
  const maxTitles = variant === "week" ? 6 : holiday ? 2 : 3;
  const shown = items.slice(0, maxTitles);
  const extra = items.length - shown.length;

  const label = date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}${holiday ? `, ${holiday}` : ""}, ${items.length} item${items.length === 1 ? "" : "s"}`}
      className={cn(
        // Each day is a small raised card with a quiet outline, so the grid
        // reads as a wall calendar even where the weekend tone sits close to
        // the page.
        "group flex w-full flex-col gap-1 rounded-md border border-border p-1.5 text-left shadow-e1 transition-[background-color,box-shadow] hover:shadow-e2 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        variant === "week" ? "min-h-56" : "min-h-28",
        holiday
          ? "bg-royal-light hover:bg-royal-light/80"
          : isWeekend
            ? "bg-surface-low hover:bg-surface-high"
            : "bg-surface-lowest hover:bg-surface-low",
        !inMonth && "opacity-50 shadow-none",
      )}
    >
      <div className="flex w-full items-start justify-between gap-1">
        {holiday ? (
          <span className="line-clamp-2 font-body text-[10px] font-semibold uppercase leading-tight tracking-wide text-royal">
            {holiday}
          </span>
        ) : (
          <span />
        )}
        <span
          className={cn(
            "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 font-mono text-xs",
            isToday
              ? "bg-primary font-bold text-on-primary"
              : isWeekend || holiday
                ? "text-on-surface-variant"
                : "text-on-surface",
          )}
        >
          {date.getDate()}
        </span>
      </div>
      <div className="flex w-full flex-col gap-0.5">
        {shown.map((item) => (
          <PlannerChip key={plannerItemKey(item)} item={item} />
        ))}
        {extra > 0 && (
          <span className="px-1 font-body text-[11px] font-semibold text-on-surface-variant">
            +{extra} more
          </span>
        )}
      </div>
    </button>
  );
}
