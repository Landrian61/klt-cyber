"use client";

import * as React from "react";
import { getDefaultClassNames, type DayButton } from "react-day-picker";
import { Calendar } from "@/components/shadcn/calendar";
import { cn } from "@/lib/utils";
import { MONTH_LABELS } from "../_lib/adminContent";
import { localYmd } from "./calendarGrid";
import type { PlannerItem } from "./types";

// Year/Quarter view's shared building block (docs/Admin-portal.html
// `.mini-month`) — now the real shadcn Calendar (react-day-picker) rather
// than a grid of blank marker squares, so each tile shows actual date
// numbers, not just coloured planks. A custom, compact DayButton keeps the
// "gold when something's on it" treatment; the calendar's own caption/nav/
// weekday header are hidden since the card renders its own "Jan"/"Feb" label
// and there's nothing to navigate — the parent Year/Quarter grid already
// shows every month at once.
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
  const dayPickerDefaults = getDefaultClassNames();

  return (
    <div
      className={cn(
        "rounded-md p-2.5 shadow-e1",
        isCurrent ? "bg-primary-light" : "bg-surface-lowest",
      )}
    >
      <p
        className={cn(
          "mb-1 font-body text-xs font-semibold",
          isCurrent ? "text-primary" : "text-on-surface-variant",
        )}
      >
        {MONTH_LABELS[month].slice(0, 3)}
      </p>
      <Calendar
        month={new Date(year, month, 1)}
        showOutsideDays={false}
        onDayClick={(date, modifiers) => {
          if (modifiers.outside || modifiers.hidden) return;
          onDayClick(date);
        }}
        modifiers={{
          hasItems: (date) => {
            const items = byDate.get(localYmd(date));
            return !!items && items.length > 0;
          },
        }}
        components={{ Nav: () => <></>, DayButton: MiniMonthDayButton }}
        classNames={{
          root: cn("w-full", dayPickerDefaults.root),
          month_caption: "hidden",
          nav: "hidden",
          weekdays: "hidden",
        }}
        className="bg-transparent p-0 [--cell-size:1.75rem]"
      />
    </div>
  );
}

function MiniMonthDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const blank = modifiers.outside || modifiers.hidden;
  return (
    <button
      type="button"
      disabled={blank}
      className={cn(
        "flex aspect-square w-full items-center justify-center rounded-[3px] font-mono text-[10px] transition-colors",
        blank && "invisible pointer-events-none",
        !blank &&
          (modifiers.hasItems
            ? "bg-primary font-semibold text-on-primary hover:brightness-110"
            : "text-on-surface-variant hover:bg-surface-high"),
        className,
      )}
      {...props}
    >
      {day.date.getDate()}
    </button>
  );
}
