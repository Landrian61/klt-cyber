"use client";

import * as React from "react";
import { getDefaultClassNames, type DayButton } from "react-day-picker";
import { Calendar } from "@/components/shadcn/calendar";
import { cn } from "@/lib/utils";
import { MONTH_LABELS } from "../_lib/adminContent";
import { localYmd } from "./calendarGrid";
import { PLANNER_TYPE_COLOR } from "./plannerColors";
import type { PlannerItem } from "./types";

// Year/Quarter view's shared building block (docs/Admin-portal.html
// `.mini-month`) — the real shadcn Calendar (react-day-picker) rather than a
// grid of blank marker squares, so each tile shows actual date numbers, not
// just coloured planks. A custom, compact DayButton marks a busy day with up
// to 3 small type-colored dots (program/event/activity — see
// plannerColors.ts) rather than a solid gold fill, since a fill can't convey
// what kind of thing is on that day and would compete with the chips used
// everywhere else. The calendar's own caption/nav/weekday header are hidden
// since the card renders its own "Jan"/"Feb" label and there's nothing to
// navigate — the parent Year/Quarter grid already shows every month at once.
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

  function hasType(date: Date, type: PlannerItem["type"]): boolean {
    return !!byDate.get(localYmd(date))?.some((item) => item.type === type);
  }

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
          hasProgram: (date) => hasType(date, "program"),
          hasEvent: (date) => hasType(date, "event"),
          hasActivity: (date) => hasType(date, "activity"),
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
  const dots: PlannerItem["type"][] = [];
  if (modifiers.hasProgram) dots.push("program");
  if (modifiers.hasEvent) dots.push("event");
  if (modifiers.hasActivity) dots.push("activity");

  return (
    <button
      type="button"
      disabled={blank}
      className={cn(
        "flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[3px] font-mono text-[10px] transition-colors",
        blank && "invisible pointer-events-none",
        !blank && "text-on-surface-variant hover:bg-surface-high",
        className,
      )}
      {...props}
    >
      <span>{day.date.getDate()}</span>
      {dots.length > 0 && (
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {dots.map((type) => (
            <span
              key={type}
              className={cn("h-1 w-1 rounded-full", PLANNER_TYPE_COLOR[type].dot)}
            />
          ))}
        </span>
      )}
    </button>
  );
}
