"use client";

import { DAY_LABELS } from "../_lib/adminContent";
import { localYmd, weekDays } from "./calendarGrid";
import { DayCell } from "./DayCell";
import type { PlannerItem } from "./types";

export function WeekView({
  focus,
  byDate,
  today,
  onDayClick,
}: {
  focus: Date;
  byDate: Map<string, PlannerItem[]>;
  today: Date;
  onDayClick: (date: Date) => void;
}) {
  const days = weekDays(focus);
  const todayKey = localYmd(today);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((date, i) => {
        const key = localYmd(date);
        return (
          <div key={key} className="space-y-1">
            <p className="text-center font-body text-xs font-semibold text-outline">
              {DAY_LABELS[i].slice(0, 3)}
            </p>
            <DayCell
              date={date}
              items={byDate.get(key)}
              isToday={key === todayKey}
              variant="week"
              onClick={() => onDayClick(date)}
            />
          </div>
        );
      })}
    </div>
  );
}
