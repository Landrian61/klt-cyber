"use client";

import { Calendar } from "@/components/shadcn/calendar";
import { Checkbox } from "@/components/shadcn/checkbox";
import { cn } from "@/lib/utils";
import { PLANNER_TYPE_COLOR, PLANNER_TYPES } from "./plannerColors";
import type { PlannerItem } from "./types";

// The planner's left panel, after the reference calendar: a small month to
// jump to any date, what to show, and the public holidays in view. The type
// checkboxes double as the colour legend, so there is one key, not two.

type ItemType = PlannerItem["type"];

export function PlannerSidebar({
  focus,
  onFocusChange,
  visibleTypes,
  onToggleType,
  counts,
  holidaysInView,
}: {
  focus: Date;
  onFocusChange: (date: Date) => void;
  visibleTypes: Set<ItemType>;
  onToggleType: (type: ItemType, on: boolean) => void;
  counts: Record<ItemType, number>;
  holidaysInView: { date: string; name: string }[];
}) {
  return (
    <aside className="space-y-4">
      <div className="rounded-md bg-surface-lowest p-3 shadow-e1">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={focus}
          month={focus}
          onMonthChange={onFocusChange}
          onSelect={(date) => date && onFocusChange(date)}
          // The portal's ghost Button carries an outline, which every day here
          // inherits; a navigator reads cleaner as bare numbers. Scoped to this
          // calendar so date pickers elsewhere are untouched.
          className="w-full bg-transparent p-0 [--cell-size:2rem] [&_[data-day]]:border-transparent [&_[data-day]]:shadow-none"
          classNames={{ root: "w-full" }}
        />
      </div>

      <section className="rounded-md bg-surface-lowest p-3 shadow-e1">
        <h2 className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-outline">
          Show
        </h2>
        <ul className="space-y-2">
          {PLANNER_TYPES.map((type) => {
            const id = `planner-type-${type}`;
            const color = PLANNER_TYPE_COLOR[type];
            return (
              <li key={type} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={visibleTypes.has(type)}
                  onCheckedChange={(on) => onToggleType(type, on === true)}
                />
                <span className={cn("h-2 w-2 shrink-0 rounded-full", color.dot)} aria-hidden="true" />
                <label htmlFor={id} className="flex-1 font-body text-sm text-on-surface">
                  {color.label}
                </label>
                <span className="font-mono text-xs text-outline">{counts[type]}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-md bg-surface-lowest p-3 shadow-e1">
        <h2 className="mb-2 font-body text-xs font-semibold uppercase tracking-wide text-outline">
          Public holidays in view
        </h2>
        {holidaysInView.length === 0 ? (
          <p className="font-body text-sm text-on-surface-variant">None in this period.</p>
        ) : (
          <ul className="space-y-1.5">
            {holidaysInView.map((holiday) => {
              const [y, m, d] = holiday.date.split("-").map(Number);
              const when = new Date(y, m - 1, d).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              });
              return (
                <li key={holiday.date} className="flex items-baseline gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs text-royal">{when}</span>
                  <span className="font-body text-sm text-on-surface">{holiday.name}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 font-body text-[11px] text-outline">
          Uganda public holidays. Eid dates are estimates until announced.
        </p>
      </section>
    </aside>
  );
}
