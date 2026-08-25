"use client";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityStatusBadge } from "../_lib/adminContent";
import { PLANNER_TYPE_COLOR, plannerItemTime } from "./plannerColors";
import { plannerItemKey, type ActivityItem, type PlannerItem } from "./types";

// The at-every-zoom-level day pop-up (docs/Admin-portal.html `.day-popup`):
// everything on that day, each row carrying the same color-coded left accent
// as the day-cell chips (plannerColors.ts) for visual continuity, plus its
// time where one applies. Programs/events aren't editable from here (Weekly
// Program and Events own their own editing) — only activity rows are
// clickable, and they keep their status pill alongside the type color since
// status is still useful detail the color alone can't carry.
export function DayPopup({
  date,
  items,
  onOpenChange,
  onAddActivity,
  onEditActivity,
}: {
  date: Date | null;
  items: PlannerItem[];
  onOpenChange: (open: boolean) => void;
  onAddActivity: () => void;
  onEditActivity: (item: ActivityItem) => void;
}) {
  return (
    <Dialog open={!!date} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {date
              ? date.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : ""}
          </DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing planned"
            message="Add an activity to get this day started."
          />
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const isActivity = item.type === "activity";
              const color = PLANNER_TYPE_COLOR[item.type];
              const time = plannerItemTime(item);
              const row = (
                <>
                  <span className="min-w-0 flex-1 truncate font-body text-sm text-on-surface">
                    {item.title}
                  </span>
                  {time && (
                    <span className="shrink-0 font-mono text-xs text-on-surface-variant">
                      {time}
                    </span>
                  )}
                  {isActivity && (
                    <span className="shrink-0">
                      <ActivityStatusBadge status={item.status} />
                    </span>
                  )}
                </>
              );
              const rowClass = cn(
                "flex w-full items-center gap-3 rounded-lg border-l-[3px] bg-surface-low px-3 py-2.5 text-left",
                color.border,
              );
              return isActivity ? (
                <button
                  key={plannerItemKey(item)}
                  type="button"
                  onClick={() => onEditActivity(item)}
                  className={cn(rowClass, "transition-colors hover:bg-surface-high")}
                >
                  {row}
                </button>
              ) : (
                <div key={plannerItemKey(item)} className={rowClass}>
                  {row}
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button size="sm" onClick={onAddActivity}>
            Add activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
