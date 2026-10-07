"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/shadcn/button";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { Reveal } from "@/components/motion/Reveal";
import {
  localYmd,
  monthRangeForGrid,
  periodLabel,
  quarterOf,
  quarterRange,
  stepFocus,
  weekRange,
  yearRange,
} from "./calendarGrid";
import { MiniMonthGrid } from "./YearGrid";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayPopup } from "./DayPopup";
import { ActivityDialog, type EditingActivity } from "./ActivityDialog";
import { PLANNER_TYPE_COLOR, PLANNER_TYPES } from "./plannerColors";
import type { ActivityItem, PlannerItem, PlannerView } from "./types";

// Timezone note (spec-accepted v1 simplification): every date here is plain
// browser-local `Date` — grid boundaries, day-cell dates, and the fetched
// range are all `new Date(y, m, d)`/`.getTime()`. The backend re-buckets by
// Kampala time when merging in recurring programs, so a day right at the
// browser/Kampala boundary could show up one cell off; not solved here.

const VIEW_OPTIONS: { value: PlannerView; label: string }[] = [
  { value: "year", label: "Year" },
  { value: "quarter", label: "Quarter" },
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

const SKELETON_COUNT: Record<PlannerView, number> = {
  year: 12,
  quarter: 3,
  month: 1,
  week: 7,
};

export function YearPlannerClient() {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<PlannerView>("year");
  const [focus, setFocus] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<EditingActivity | null>(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState<Date>(today);

  const range = useMemo(() => {
    switch (view) {
      case "year":
        return yearRange(focus.getFullYear());
      case "quarter":
        return quarterRange(focus.getFullYear(), quarterOf(focus.getMonth()));
      case "month":
        return monthRangeForGrid(focus.getFullYear(), focus.getMonth());
      case "week":
        return weekRange(focus);
    }
  }, [view, focus]);

  const items = useAuthQuery(api.plannedActivities.getYearPlannerRange, {
    startDate: range.start,
    endDate: range.end,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    if (!items) return map;
    for (const item of items) {
      const bucket = map.get(item.date);
      if (bucket) bucket.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [items]);

  const selectedItems = selectedDay ? (byDate.get(localYmd(selectedDay)) ?? []) : [];

  function openAddActivity(date: Date) {
    setSelectedDay(null);
    setEditingActivity(null);
    setDialogDefaultDate(date);
    setDialogOpen(true);
  }

  function openEditActivity(item: ActivityItem) {
    setSelectedDay(null);
    setEditingActivity({
      activityId: item.activityId as Id<"plannedActivities">,
      title: item.title,
      description: item.description ?? "",
      status: item.status,
      departmentIds: item.departmentIds,
      targetDate: item.start,
    });
    setDialogDefaultDate(new Date(item.start));
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading as="h1" size="2xl">
            Year planner
          </Heading>
          <p className="font-body text-base text-on-surface-variant">
            Weekly programs, events, and planned activities, merged into one calendar.
          </p>
        </div>
        <Button size="sm" onClick={() => openAddActivity(today)}>
          Add activity
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          options={VIEW_OPTIONS}
          value={view}
          onChange={(value) => setView(value as PlannerView)}
          ariaLabel="Calendar zoom level"
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous period"
            onClick={() => setFocus((f) => stepFocus(f, view, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-32 text-center font-body text-sm font-semibold text-on-surface">
            {periodLabel(view, focus)}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next period"
            onClick={() => setFocus((f) => stepFocus(f, view, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Legend for the color-coded chips (plannerColors.ts) — mirrors the
          reference layout's type key so the mapping is discoverable rather
          than assumed. */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        {PLANNER_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className={cn("h-2 w-2 rounded-full", PLANNER_TYPE_COLOR[type].dot)}
              aria-hidden="true"
            />
            <span className="font-body text-xs text-on-surface-variant">
              {PLANNER_TYPE_COLOR[type].label}
            </span>
          </div>
        ))}
      </div>

      {items === undefined ? (
        <div
          className={
            view === "year"
              ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              : view === "quarter"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
                : "grid grid-cols-7 gap-1.5"
          }
        >
          {Array.from({ length: SKELETON_COUNT[view] }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-lowest" />
          ))}
        </div>
      ) : (
        <Reveal replayKey={`${view}-${focus.getTime()}`} y={8} duration={360} gap={0}>
          <div>
            {view === "year" && (
              <MiniMonthGrid
                months={Array.from({ length: 12 }, (_, m) => ({
                  year: focus.getFullYear(),
                  month: m,
                }))}
                columns={4}
                byDate={byDate}
                today={today}
                onDayClick={setSelectedDay}
              />
            )}
            {view === "quarter" && (
              <MiniMonthGrid
                months={Array.from({ length: 3 }, (_, i) => ({
                  year: focus.getFullYear(),
                  month: quarterOf(focus.getMonth()) * 3 + i,
                }))}
                columns={3}
                byDate={byDate}
                today={today}
                onDayClick={setSelectedDay}
              />
            )}
            {view === "month" && (
              <MonthView
                year={focus.getFullYear()}
                month={focus.getMonth()}
                byDate={byDate}
                today={today}
                onDayClick={setSelectedDay}
              />
            )}
            {view === "week" && (
              <WeekView focus={focus} byDate={byDate} today={today} onDayClick={setSelectedDay} />
            )}
          </div>
        </Reveal>
      )}

      <DayPopup
        date={selectedDay}
        items={selectedItems}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        onAddActivity={() => selectedDay && openAddActivity(selectedDay)}
        onEditActivity={openEditActivity}
      />

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activity={editingActivity}
        defaultDate={dialogDefaultDate}
      />
    </div>
  );
}
