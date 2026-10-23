"use client";

import { cn } from "@/lib/utils";
import { isCancelledOccurrence, plannerItemColor, plannerItemTime } from "./plannerColors";
import type { PlannerItem } from "./types";

/**
 * A day cell's per-item chip — a tonal, color-coded pill with a 3px left
 * accent bar (the same sanctioned exception to the No-Line Rule already used
 * for priority announcement cards; see spec/INTERFACE_SPEC.md), colored by
 * item type via PLANNER_TYPE_COLOR. Replaces plain truncated title text so a
 * day's mix of programs/events/activities is legible at a glance without
 * needing to open the day.
 *
 * A called-off occurrence (spec 0009, AC-9) takes crimson and a struck-through
 * title. Both, not either: crimson is also the activity colour, and a
 * strikethrough alone is easy to miss at month and year zoom.
 */
export function PlannerChip({ item, className }: { item: PlannerItem; className?: string }) {
  const color = plannerItemColor(item);
  const cancelled = isCancelledOccurrence(item);
  const time = plannerItemTime(item);

  return (
    <div
      className={cn(
        "flex w-full items-center gap-1.5 overflow-hidden rounded-sm border-l-[3px] px-1.5 py-0.5",
        color.border,
        color.bg,
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-body text-[11px] font-medium",
          color.text,
          cancelled && "line-through",
        )}
      >
        {item.title}
      </span>
      {/* Read out for screen readers, which get nothing from a line-through or
          a colour. Hidden visually because the two carry it for sighted
          readers and the chip has no room for a word. */}
      {cancelled && <span className="sr-only">(cancelled)</span>}
      {time && (
        <span className="shrink-0 font-mono text-[10px] text-on-surface-variant">{time}</span>
      )}
    </div>
  );
}
