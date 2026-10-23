"use client";

import * as React from "react";
import { getDefaultClassNames, type DayButton } from "react-day-picker";
import { Calendar } from "@/components/shadcn/calendar";
import { cn } from "@/lib/utils";
import { MONTH_LABELS } from "../_lib/adminContent";
import { localYmd } from "./calendarGrid";
import {
  PLANNER_CANCELLED_COLOR,
  PLANNER_TYPE_COLOR,
  isCancelledOccurrence,
} from "./plannerColors";
import type { PlannerItem } from "./types";

// Year/Quarter view's shared building block — the real shadcn Calendar
// (react-day-picker) rather than a
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
        "rounded-md border border-border p-2.5 shadow-e1",
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
          // "Has a program" means one that is still running: a day holding a
          // cancelled program and another that is on has to be able to say
          // both things, and cancelled ones get their own dot below.
          hasProgram: (date) =>
            !!byDate
              .get(localYmd(date))
              ?.some((item) => item.type === "program" && !isCancelledOccurrence(item)),
          hasEvent: (date) => hasType(date, "event"),
          hasActivity: (date) => hasType(date, "activity"),
          hasCancelledProgram: (date) =>
            !!byDate.get(localYmd(date))?.some(isCancelledOccurrence),
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

  // At year and quarter zoom a day is a few pixels of dot, so "cancelled" can
  // only be a hint (spec 0009, AC-9): a called-off occurrence adds a crimson
  // dot of its own, and opening the day spells out which occurrence and why.
  // A separate dot rather than recolouring the program one, because a day can
  // hold a cancelled program AND one still running — recolouring the single
  // dot then said the running one was off too. The dots are decorative to
  // assistive tech either way (the row below is aria-hidden); month and week
  // views carry the real marked-up treatment via PlannerChip.
  const dots: { key: string; dot: string }[] = [];
  if (modifiers.hasProgram) dots.push({ key: "program", dot: PLANNER_TYPE_COLOR.program.dot });
  if (modifiers.hasCancelledProgram) {
    dots.push({ key: "cancelled", dot: PLANNER_CANCELLED_COLOR.dot });
  }
  if (modifiers.hasEvent) dots.push({ key: "event", dot: PLANNER_TYPE_COLOR.event.dot });
  if (modifiers.hasActivity) {
    dots.push({ key: "activity", dot: PLANNER_TYPE_COLOR.activity.dot });
  }

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
          {dots.map(({ key, dot }) => (
            <span key={key} className={cn("h-1 w-1 rounded-full", dot)} />
          ))}
        </span>
      )}
    </button>
  );
}
