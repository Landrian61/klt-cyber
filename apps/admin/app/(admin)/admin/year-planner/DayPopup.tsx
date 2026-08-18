"use client";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityStatusBadge } from "../_lib/adminContent";
import { plannerItemKey, type ActivityItem, type PlannerItem } from "./types";

// The at-every-zoom-level day pop-up (docs/Admin-portal.html `.day-popup`):
// everything on that day, each row tagged by type. Programs/events aren't
// editable from here (Weekly Program and Events own their own editing) —
// only activity rows are clickable, and they carry their status pill instead
// of a plain "Activity" tag so the status is visible at a glance.
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
              const row = (
                <>
                  <span className="truncate font-body text-sm text-on-surface">
                    {item.title}
                  </span>
                  <span className="shrink-0">
                    {item.type === "activity" ? (
                      <ActivityStatusBadge status={item.status} />
                    ) : (
                      <Badge variant={item.type === "program" ? "role" : "member"}>
                        {item.type === "program" ? "Program" : "Event"}
                      </Badge>
                    )}
                  </span>
                </>
              );
              const rowClass = "flex w-full items-center justify-between gap-3 rounded-lg bg-surface-low px-3 py-2.5 text-left";
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
