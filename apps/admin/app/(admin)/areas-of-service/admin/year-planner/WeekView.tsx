"use client";

import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT, isWeekend, isoWeek, localYmd, weekDays } from "./calendarGrid";
import { DayCell } from "./DayCell";
import type { PlannerItem } from "./types";

// One week, Monday to Sunday, with the same day cells as the month: taller,
// so more of each day's items show before "+N more".
export function WeekView({
  focus,
  byDate,
  holidays,
  today,
  onDayClick,
}: {
  focus: Date;
  byDate: Map<string, PlannerItem[]>;
  holidays: Map<string, string>;
  today: Date;
  onDayClick: (date: Date) => void;
}) {
  const days = weekDays(focus);
  const todayKey = localYmd(today);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px] space-y-1">
        <p className="font-body text-xs text-outline">
          Week <span className="font-mono">{isoWeek(days[0])}</span>
        </p>
        <div className="grid grid-cols-7 gap-1">
          {days.map((date, i) => (
            <p
              key={localYmd(date)}
              className={cn(
                "py-1 text-center font-body text-xs font-semibold",
                i >= 5 ? "text-primary" : "text-on-surface-variant",
              )}
            >
              {WEEKDAY_SHORT[i]}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((date) => {
            const key = localYmd(date);
            return (
              <DayCell
                key={key}
                date={date}
                items={byDate.get(key)}
                isToday={key === todayKey}
                isWeekend={isWeekend(date)}
                holiday={holidays.get(key)}
                variant="week"
                onClick={() => onDayClick(date)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
