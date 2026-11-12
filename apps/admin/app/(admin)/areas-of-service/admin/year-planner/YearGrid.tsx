"use client";

import { MiniMonth } from "./MiniMonth";
import type { PlannerItem } from "./types";

// Arranges a run of MiniMonth cards — 12 for Year, 3 for Quarter. Same card,
// different column count. Narrower than before because the planner's side
// panel now takes the left of the page.
export function MiniMonthGrid({
  months,
  columns,
  byDate,
  holidays,
  today,
  onDayClick,
}: {
  months: { year: number; month: number }[];
  columns: 3 | 4;
  byDate: Map<string, PlannerItem[]>;
  holidays: Map<string, string>;
  today: Date;
  onDayClick: (date: Date) => void;
}) {
  return (
    <div
      className={
        columns === 4
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          : "grid grid-cols-1 gap-3 md:grid-cols-3"
      }
    >
      {months.map(({ year, month }) => (
        <MiniMonth
          key={`${year}-${month}`}
          year={year}
          month={month}
          byDate={byDate}
          holidays={holidays}
          onDayClick={onDayClick}
          isCurrent={year === today.getFullYear() && month === today.getMonth()}
        />
      ))}
    </div>
  );
}
