"use client";

import { DAY_LABELS } from "../_lib/adminContent";
import { localYmd, monthGridDays } from "./calendarGrid";
import { DayCell } from "./DayCell";
import type { PlannerItem } from "./types";

export function MonthView({
  year,
  month,
  byDate,
  today,
  onDayClick,
}: {
  year: number;
  month: number;
  byDate: Map<string, PlannerItem[]>;
  today: Date;
  onDayClick: (date: Date) => void;
}) {
  const days = monthGridDays(year, month);
  const todayKey = localYmd(today);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-1 text-center font-body text-xs font-semibold text-outline"
          >
            {label.slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map(({ date, inMonth }) => {
          const key = localYmd(date);
          return (
            <DayCell
              key={key}
              date={date}
              items={byDate.get(key)}
              inMonth={inMonth}
              isToday={key === todayKey}
              variant="month"
              onClick={() => onDayClick(date)}
            />
          );
        })}
      </div>
    </div>
  );
}
