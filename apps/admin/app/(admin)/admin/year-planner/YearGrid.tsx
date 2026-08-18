"use client";

import { MiniMonth } from "./MiniMonth";
import type { PlannerItem } from "./types";

// Arranges a run of MiniMonth cards — 12 across 4 columns for Year, 3 across
// 3 columns for Quarter. Same card, different column count (spec: "the same
// mini-month card" for the quarter view).
export function MiniMonthGrid({
  months,
  columns,
  byDate,
  today,
  onDayClick,
}: {
  months: { year: number; month: number }[];
  columns: 3 | 4;
  byDate: Map<string, PlannerItem[]>;
  today: Date;
  onDayClick: (date: Date) => void;
}) {
  return (
    <div
      className={
        columns === 4
          ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          : "grid grid-cols-1 gap-3 sm:grid-cols-3"
      }
    >
      {months.map(({ year, month }) => (
        <MiniMonth
          key={`${year}-${month}`}
          year={year}
          month={month}
          byDate={byDate}
          onDayClick={onDayClick}
          isCurrent={year === today.getFullYear() && month === today.getMonth()}
        />
      ))}
    </div>
  );
}
