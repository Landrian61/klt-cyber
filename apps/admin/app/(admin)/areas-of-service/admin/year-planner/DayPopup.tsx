"use client";

import { isPastOccurrence } from "@klt-cyber/shared";
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
import { isCancelledOccurrence, plannerItemColor, plannerItemTime } from "./plannerColors";
import { plannerItemKey, type ActivityItem, type PlannerItem } from "./types";
import type { OccurrenceAction } from "./OccurrenceDialog";

// The at-every-zoom-level day pop-up: everything on that day, each row
// carrying the same color-coded left accent
// as the day-cell chips (plannerColors.ts) for visual continuity, plus its
// time where one applies. Activity rows are clickable and keep their status
// pill alongside the type color, since status is still useful detail the color
// alone can't carry.
//
// Program rows became partly actionable with spec 0009: a single dated
// occurrence can be called off and put back from here (A4-02, A4-03), which is
// the only place in the portal where one date of a recurring program is a thing
// you can point at. Everything ELSE about a program — its title, time,
// recurrence, whether it runs at all — still belongs to the Weekly Program
// page, and events are still not editable from here at all.
export function DayPopup({
  date,
  items,
  onOpenChange,
  onAddActivity,
  onEditActivity,
  onOccurrenceAction,
}: {
  date: Date | null;
  items: PlannerItem[];
  onOpenChange: (open: boolean) => void;
  onAddActivity: () => void;
  onEditActivity: (item: ActivityItem) => void;
  onOccurrenceAction: (
    item: Extract<PlannerItem, { type: "program" }>,
    action: OccurrenceAction,
  ) => void;
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
              const isProgram = item.type === "program";
              const color = plannerItemColor(item);
              const cancelled = isCancelledOccurrence(item);
              const time = plannerItemTime(item);
              const row = (
                <>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-body text-sm text-on-surface",
                      cancelled && "line-through",
                    )}
                  >
                    {item.title}
                  </span>
                  {time && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs text-on-surface-variant",
                        cancelled && "line-through",
                      )}
                    >
                      {time}
                    </span>
                  )}
                  {cancelled && (
                    <span className="shrink-0 rounded-full bg-crimson-light px-2 py-0.5 font-body text-[11px] font-semibold text-crimson">
                      Cancelled
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

              if (isActivity) {
                return (
                  <button
                    key={plannerItemKey(item)}
                    type="button"
                    onClick={() => onEditActivity(item)}
                    className={cn(rowClass, "transition-colors hover:bg-surface-high")}
                  >
                    {row}
                  </button>
                );
              }

              if (isProgram) {
                return (
                  <div key={plannerItemKey(item)} className={cn(rowClass, "flex-col items-stretch gap-2")}>
                    <div className="flex w-full items-center gap-3">{row}</div>
                    {item.cancellationReason && (
                      <p className="font-body text-xs text-on-surface-variant">
                        {item.cancellationReason}
                      </p>
                    )}
                    {/* A cancelled occurrence stays actionable whatever its
                        date — restoring is how an admin clears a record,
                        including an old or orphaned one. Cancelling is offered
                        only for a date that has not gone: the server refuses a
                        past one (AC-5), and month view and prev/next
                        navigation both reach past days, so the button would
                        otherwise open the dialog only to fail on submit. */}
                    {(cancelled || !isPastOccurrence(item.date)) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {cancelled ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onOccurrenceAction(item, "restore")}
                            >
                              Put it back on
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onOccurrenceAction(item, "reason")}
                            >
                              {item.cancellationReason ? "Edit reason" : "Add a reason"}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOccurrenceAction(item, "cancel")}
                          >
                            Cancel this date
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              return (
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
