"use client";

import { cn } from "@/lib/utils";
import { MONTH_LABELS } from "../_lib/adminContent";
import { localYmd, monthGridDays } from "./calendarGrid";
import type { PlannerItem } from "./types";

// Year/Quarter view's shared building block (docs/Admin-portal.html
// `.mini-month`). Tiny — no room for day numbers, so a day cell is just a
// gold marker when something's on it. Padding cells (days spilling into the
// adjacent month, needed to align the 7-column grid) are unmarked and
// unclickable.
export function MiniMonth({
  year,
  month,
  byDate,
  onDayClick,
  isCurrent,
}: {
  year: number;
  month: number;
  byDate: Map<string, PlannerItem[]>;
  onDayClick: (date: Date) => void;
  isCurrent?: boolean;
}) {
  const days = monthGridDays(year, month);

  return (
    <div
      className={cn(
        "rounded-lg p-2.5 shadow-[0_2px_10px_rgba(28,28,24,0.04)]",
        isCurrent ? "bg-primary-light" : "bg-surface-lowest",
      )}
    >
      <p
        className={cn(
          "mb-1.5 font-body text-xs font-semibold",
          isCurrent ? "text-primary" : "text-on-surface-variant",
        )}
      >
        {MONTH_LABELS[month].slice(0, 3)}
      </p>
      <div className="grid grid-cols-7 gap-[3px]">
        {days.map(({ date, inMonth }) => {
          const key = localYmd(date);
          const items = inMonth ? byDate.get(key) : undefined;
          const hasItems = !!items && items.length > 0;
          return (
            <button
              key={key}
              type="button"
              disabled={!inMonth}
              onClick={() => onDayClick(date)}
              aria-label={
                inMonth
                  ? `${date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}${
                      hasItems ? `, ${items!.length} item${items!.length > 1 ? "s" : ""}` : ""
                    }`
                  : undefined
              }
              className={cn(
                "aspect-square rounded-[2px] transition-colors",
                !inMonth && "pointer-events-none bg-transparent",
                inMonth && !hasItems && "bg-surface-low hover:bg-surface-high",
                inMonth && hasItems && "bg-primary hover:brightness-110",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
