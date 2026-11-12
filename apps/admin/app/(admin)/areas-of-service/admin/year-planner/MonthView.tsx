"use client";

import { cn } from "@/lib/utils";
import {
  WEEKDAY_SHORT,
  isWeekend,
  isoWeek,
  localYmd,
  monthGridDays,
} from "./calendarGrid";
import { DayCell } from "./DayCell";
import type { PlannerItem } from "./types";

// A wall calendar month: ISO week numbers down the left, Monday to Sunday
// across the top, weekends a step lower in tone, holidays washed in royal.
// The cells sit on a tonal well with a small gap, so rows and columns read as
// a grid without any drawn lines.
export function MonthView({
  year,
  month,
  byDate,
  holidays,
  today,
  onDayClick,
}: {
  year: number;
  month: number;
  byDate: Map<string, PlannerItem[]>;
  holidays: Map<string, string>;
  today: Date;
  onDayClick: (date: Date) => void;
}) {
  const days = monthGridDays(year, month);
  const todayKey = localYmd(today);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1 pb-1">
          <div className="py-1 text-center font-body text-[11px] font-semibold text-outline">W</div>
          {WEEKDAY_SHORT.map((label, i) => (
            <div
              key={label}
              className={cn(
                "py-1 text-center font-body text-xs font-semibold",
                i >= 5 ? "text-primary" : "text-on-surface-variant",
              )}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {weeks.map((week) => (
            <div
              key={localYmd(week[0].date)}
              className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-1"
            >
              <div className="pt-2 text-center font-mono text-[11px] text-outline">
                {isoWeek(week[0].date)}
              </div>
              <div className="col-span-7 grid grid-cols-7 gap-1.5">
                {week.map(({ date, inMonth }) => {
                  const key = localYmd(date);
                  return (
                    <DayCell
                      key={key}
                      date={date}
                      items={byDate.get(key)}
                      inMonth={inMonth}
                      isToday={key === todayKey}
                      isWeekend={isWeekend(date)}
                      holiday={holidays.get(key)}
                      variant="month"
                      onClick={() => onDayClick(date)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
