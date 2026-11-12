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

// Year and Quarter views' building block: a real month (react-day-picker),
// Monday first with weekday initials, weekends a step lower in tone, public
// holidays washed in royal with their name on hover. A busy day carries small
// type coloured dots rather than a fill, since a fill cannot say what kind of
// thing is on that day. The calendar's own caption and navigation are hidden:
// the card names its month and the parent grid shows every month at once.

const HolidaysContext = React.createContext<Map<string, string>>(new Map());

export function MiniMonth({
  year,
  month,
  byDate,
  holidays,
  onDayClick,
  isCurrent,
}: {
  year: number;
  month: number;
  byDate: Map<string, PlannerItem[]>;
  holidays: Map<string, string>;
  onDayClick: (date: Date) => void;
  isCurrent?: boolean;
}) {
  const dayPickerDefaults = getDefaultClassNames();

  function has(date: Date, test: (item: PlannerItem) => boolean): boolean {
    return !!byDate.get(localYmd(date))?.some(test);
  }

  const monthHolidays = [...holidays.entries()].filter(([date]) =>
    date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`),
  ).length;

  return (
    <HolidaysContext.Provider value={holidays}>
      <div
        className={cn(
          "rounded-md p-2.5 shadow-e1",
          isCurrent ? "bg-primary-light" : "bg-surface-lowest",
        )}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <p
            className={cn(
              "font-display text-sm font-bold",
              isCurrent ? "text-primary" : "text-on-surface",
            )}
          >
            {MONTH_LABELS[month]}
          </p>
          {monthHolidays > 0 && (
            <span className="font-body text-[10px] text-royal">
              <span className="font-mono">{monthHolidays}</span> holiday
              {monthHolidays === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Calendar
          month={new Date(year, month, 1)}
          weekStartsOn={1}
          showOutsideDays={false}
          onDayClick={(date, modifiers) => {
            if (modifiers.outside || modifiers.hidden) return;
            onDayClick(date);
          }}
          modifiers={{
            // "Has a program" means one still running: a day holding a
            // cancelled program and another that is on has to say both.
            hasProgram: (date) =>
              has(date, (item) => item.type === "program" && !isCancelledOccurrence(item)),
            hasEvent: (date) => has(date, (item) => item.type === "event"),
            hasActivity: (date) => has(date, (item) => item.type === "activity"),
            hasGroup: (date) => has(date, (item) => item.type === "group"),
            hasCancelled: (date) => has(date, isCancelledOccurrence),
            holiday: (date) => holidays.has(localYmd(date)),
            weekend: (date) => date.getDay() === 0 || date.getDay() === 6,
          }}
          components={{ Nav: () => <></>, DayButton: MiniMonthDayButton }}
          classNames={{
            root: cn("w-full", dayPickerDefaults.root),
            month_caption: "hidden",
            nav: "hidden",
            weekday:
              "flex-1 select-none pb-1 text-center font-body text-[10px] font-semibold uppercase text-outline",
          }}
          className="bg-transparent p-0 [--cell-size:1.75rem]"
        />
      </div>
    </HolidaysContext.Provider>
  );
}

function MiniMonthDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const holidays = React.useContext(HolidaysContext);
  const blank = modifiers.outside || modifiers.hidden;
  const holiday = modifiers.holiday ? holidays.get(localYmd(day.date)) : undefined;

  // At this zoom "cancelled" can only be a hint: a called off item adds a
  // crimson dot of its own, and opening the day spells out which and why.
  const dots: { key: string; dot: string }[] = [];
  if (modifiers.hasProgram) dots.push({ key: "program", dot: PLANNER_TYPE_COLOR.program.dot });
  if (modifiers.hasCancelled) dots.push({ key: "cancelled", dot: PLANNER_CANCELLED_COLOR.dot });
  if (modifiers.hasEvent) dots.push({ key: "event", dot: PLANNER_TYPE_COLOR.event.dot });
  if (modifiers.hasActivity) dots.push({ key: "activity", dot: PLANNER_TYPE_COLOR.activity.dot });
  if (modifiers.hasGroup) dots.push({ key: "group", dot: PLANNER_TYPE_COLOR.group.dot });

  return (
    <button
      type="button"
      disabled={blank}
      title={holiday}
      aria-label={holiday ? `${day.date.getDate()}, ${holiday}` : undefined}
      className={cn(
        "flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[3px] font-mono text-[10px] transition-colors",
        blank && "invisible pointer-events-none",
        !blank &&
          (holiday
            ? "bg-royal-light font-semibold text-royal hover:bg-surface-high"
            : modifiers.weekend
              ? "bg-surface-low text-on-surface-variant hover:bg-surface-high"
              : "text-on-surface hover:bg-surface-high"),
        modifiers.today && "font-bold text-primary",
        className,
      )}
      {...props}
    >
      <span>{day.date.getDate()}</span>
      <span className="flex h-1 items-center gap-0.5" aria-hidden="true">
        {dots.map(({ key, dot }) => (
          <span key={key} className={cn("h-1 w-1 rounded-full", dot)} />
        ))}
      </span>
    </button>
  );
}
