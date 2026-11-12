"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
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
import {
  OccurrenceDialog,
  type OccurrenceAction,
  type TargetOccurrence,
} from "./OccurrenceDialog";
import { publicHolidayMap } from "@klt-cyber/shared";
import { PLANNER_TYPES } from "./plannerColors";
import { PlannerSidebar } from "./PlannerSidebar";
import { GroupActivityDetail } from "./GroupActivityDetail";
import {
  groupActivityDays,
  type ActivityItem,
  type GroupItem,
  type PlannerItem,
  type PlannerView,
} from "./types";

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
  // Month first: the wall calendar layout is the planner's working view.
  const [view, setView] = useState<PlannerView>("month");
  const [focus, setFocus] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<EditingActivity | null>(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState<Date>(today);
  const [occurrenceOpen, setOccurrenceOpen] = useState(false);
  const [occurrenceAction, setOccurrenceAction] = useState<OccurrenceAction>("cancel");
  const [occurrenceTarget, setOccurrenceTarget] = useState<TargetOccurrence | null>(null);

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

  const planner = useAuthQuery(api.plannedActivities.getYearPlannerRange, {
    startDate: range.start,
    endDate: range.end,
  });

  // Department and clan activities are read only (spec 0021, AC-21), each
  // shown on every day it covers. The side panel's Show checkboxes hide any
  // type, which is how the department and clan rows are switched off.
  const [visibleTypes, setVisibleTypes] = useState<Set<PlannerItem["type"]>>(
    () => new Set(PLANNER_TYPES),
  );
  const [viewingGroup, setViewingGroup] = useState<GroupItem | null>(null);

  const allItems = useMemo<PlannerItem[] | undefined>(() => {
    if (!planner) return planner === null ? [] : undefined;
    const groupDays = planner.groupActivities.flatMap((activity) =>
      groupActivityDays(activity, range.start, range.end),
    );
    return [...planner.items, ...groupDays].sort((a, b) => a.start - b.start);
  }, [planner, range.start, range.end]);

  const items = useMemo(
    () => allItems?.filter((item) => visibleTypes.has(item.type)),
    [allItems, visibleTypes],
  );

  const counts = useMemo(() => {
    const result = { program: 0, event: 0, activity: 0, group: 0 } as Record<
      PlannerItem["type"],
      number
    >;
    // A multi day group activity counts once, not once per day it covers.
    const seenGroups = new Set<string>();
    for (const item of allItems ?? []) {
      if (item.type === "group") {
        if (seenGroups.has(item.activity._id)) continue;
        seenGroups.add(item.activity._id);
      }
      result[item.type] += 1;
    }
    return result;
  }, [allItems]);

  // Uganda public holidays (packages/shared). The year either side covers
  // the spill over days a month or week grid shows.
  const holidays = useMemo(() => {
    const year = focus.getFullYear();
    return publicHolidayMap([year - 1, year, year + 1]);
  }, [focus]);

  const holidaysInView = useMemo(() => {
    const from = localYmd(new Date(range.start));
    const to = localYmd(new Date(range.end));
    return [...holidays.entries()]
      .filter(([date]) => date >= from && date <= to)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, name]) => ({ date, name }));
  }, [holidays, range.start, range.end]);

  function toggleType(type: PlannerItem["type"], on: boolean) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (on) next.add(type);
      else next.delete(type);
      return next;
    });
  }

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

  /**
   * Open the cancel / restore / edit-reason dialog for one program occurrence.
   *
   * `date: item.date` is load-bearing: that string is the Kampala calendar day
   * the server stamped on the occurrence. The grid above buckets days by
   * `localYmd`, which is browser-local, so deriving the date from the clicked
   * cell would send the wrong day for an admin outside Kampala.
   */
  function openOccurrenceAction(
    item: Extract<PlannerItem, { type: "program" }>,
    action: OccurrenceAction,
  ) {
    setSelectedDay(null);
    setOccurrenceAction(action);
    setOccurrenceTarget({
      programId: item.programId as Id<"weeklyPrograms">,
      date: item.date,
      title: item.title,
      start: item.start,
      cancelled: item.cancelled,
      cancellationReason: item.cancellationReason,
      notifiedAt: item.notifiedAt,
    });
    setOccurrenceOpen(true);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading as="h1" size="2xl">
            Year planner
          </Heading>
          <p className="font-body text-base text-on-surface-variant">
            Weekly programs, events, planned activities, and what every department and
            clan has scheduled, in one calendar.
          </p>
        </div>
        <Button size="sm" onClick={() => openAddActivity(today)}>
          Add activity
        </Button>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <PlannerSidebar
          focus={focus}
          onFocusChange={(date) =>
            setFocus(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
          }
          visibleTypes={visibleTypes}
          onToggleType={toggleType}
          counts={counts}
          holidaysInView={holidaysInView}
        />

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous period"
                onClick={() => setFocus((f) => stepFocus(f, view, -1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next period"
                onClick={() => setFocus((f) => stepFocus(f, view, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
              <Heading as="h2" size="lg" className="ml-2">
                {periodLabel(view, focus)}
              </Heading>
              <Button
                variant="secondary"
                size="sm"
                className="ml-3"
                onClick={() =>
                  setFocus(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
                }
              >
                Today
              </Button>
            </div>
            <SegmentedFilter
              options={VIEW_OPTIONS}
              value={view}
              onChange={(value) => setView(value as PlannerView)}
              ariaLabel="Calendar zoom level"
            />
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
                    holidays={holidays}
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
                    holidays={holidays}
                    today={today}
                    onDayClick={setSelectedDay}
                  />
                )}
                {view === "month" && (
                  <MonthView
                    year={focus.getFullYear()}
                    month={focus.getMonth()}
                    byDate={byDate}
                    holidays={holidays}
                    today={today}
                    onDayClick={setSelectedDay}
                  />
                )}
                {view === "week" && (
                  <WeekView
                    focus={focus}
                    byDate={byDate}
                    holidays={holidays}
                    today={today}
                    onDayClick={setSelectedDay}
                  />
                )}
              </div>
            </Reveal>
          )}
        </div>
      </div>

      <DayPopup
        date={selectedDay}
        holiday={selectedDay ? holidays.get(localYmd(selectedDay)) : undefined}
        items={selectedItems}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        onAddActivity={() => selectedDay && openAddActivity(selectedDay)}
        onEditActivity={openEditActivity}
        onOccurrenceAction={openOccurrenceAction}
        onViewGroup={(item) => {
          setSelectedDay(null);
          setViewingGroup(item);
        }}
      />

      <GroupActivityDetail
        item={viewingGroup}
        onOpenChange={(open) => !open && setViewingGroup(null)}
      />

      <OccurrenceDialog
        open={occurrenceOpen}
        action={occurrenceAction}
        occurrence={occurrenceTarget}
        onOpenChange={setOccurrenceOpen}
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
