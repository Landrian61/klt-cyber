"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Church, Plus } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { Heading } from "@/components/ui/Heading";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { Badge } from "@/components/shadcn/badge";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Reveal } from "@/components/motion/Reveal";
import {
  churchDateLabel,
  churchMonthEnd,
  churchMonthStart,
  churchParts,
  churchTimeLabel,
  daysInMonth,
  firstWeekdayOfMonth,
  monthLabel,
} from "@/lib/churchTime";
import type { DepartmentShellContext } from "./DepartmentShellProvider";
import { ActivityDialog } from "./ActivityDialog";

/**
 * A department's activities, as a list and as a month (spec 0012, AC-22 to
 * AC-26).
 *
 * Church-wide events sit in the same views, read only: the department plans
 * around them and does not own them.
 */

type ListResult = NonNullable<
  FunctionReturnType<typeof api.departmentActivities.listForDepartment>
>;
type Activity = ListResult["activities"][number];
type ChurchEvent = ListResult["churchEvents"][number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The clock, advanced once a minute. See DepartmentDashboard for the why. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / 60_000) * 60_000),
      30_000,
    );
    return () => clearInterval(id);
  }, []);
  return now;
}

export function DepartmentActivities({
  departmentId,
  can,
}: {
  departmentId: Id<"departments">;
  can: DepartmentShellContext["can"];
}) {
  const now = useMinuteClock();
  const today = churchParts(now);

  const [view, setView] = useState("list");
  const [month, setMonth] = useState(today.month);
  const [year, setYear] = useState(today.year);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [creating, setCreating] = useState(false);

  // The list looks from the start of the shown month to a year ahead, so a
  // department scheduling the next convention sees it without changing month;
  // the calendar reads the same window and simply bins it by day.
  const from = churchMonthStart(year, month);
  const to = Math.max(churchMonthEnd(year, month), from + 366 * 24 * 60 * 60 * 1000);

  const data = useAuthQuery(api.departmentActivities.listForDepartment, {
    departmentId,
    from,
    to,
    now,
  });

  const monthActivities = useMemo(() => {
    if (!data) return undefined;
    const end = churchMonthEnd(year, month);
    return data.activities.filter(
      (a) => a.startDateTime >= from && a.startDateTime <= end,
    );
  }, [data, from, month, year]);

  const monthEvents = useMemo(() => {
    if (!data) return undefined;
    const end = churchMonthEnd(year, month);
    return data.churchEvents.filter(
      (e) => e.startDateTime >= from && e.startDateTime <= end,
    );
  }, [data, from, month, year]);

  function shiftMonth(delta: number) {
    const next = month + delta;
    if (next < 0) {
      setMonth(11);
      setYear(year - 1);
    } else if (next > 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(next);
    }
  }

  if (data === null) return <ErrorState />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Heading as="h1" size="xl">
            Activities
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            What this department has on, and what the church has on around it.
          </p>
        </div>
        {can.createActivity && (
          <ActionButton variant="gold" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Schedule an activity
          </ActionButton>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          size="sm"
          ariaLabel="How to view activities"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "List" },
            { value: "month", label: "Month" },
          ]}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="flex size-8 items-center justify-center rounded-full border border-border text-on-surface-variant transition-colors hover:bg-surface-low hover:text-primary"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <p className="min-w-40 text-center font-body text-sm font-semibold text-on-surface">
            {monthLabel(month, year)}
          </p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="flex size-8 items-center justify-center rounded-full border border-border text-on-surface-variant transition-colors hover:bg-surface-low hover:text-primary"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {view === "list" ? (
        <ActivityList
          activities={data?.activities}
          events={data?.churchEvents}
          canEdit={can.editActivity}
          onEdit={setEditing}
        />
      ) : (
        <MonthGrid
          year={year}
          month={month}
          todayKey={`${today.year}-${today.month}-${today.day}`}
          activities={monthActivities}
          events={monthEvents}
          onPick={can.editActivity ? setEditing : undefined}
        />
      )}

      {(creating || editing) && (
        <ActivityDialog
          departmentId={departmentId}
          activity={editing}
          canCancel={can.cancelActivity}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ActivityList({
  activities,
  events,
  canEdit,
  onEdit,
}: {
  activities: Activity[] | undefined;
  events: ChurchEvent[] | undefined;
  canEdit: boolean;
  onEdit: (activity: Activity) => void;
}) {
  if (activities === undefined) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        {activities.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            message="When you schedule an activity, the verified people on your roster hear about it on their phones."
          />
        ) : (
          <Reveal as="ul" className="space-y-3">
            {activities.map((activity) => (
              <li key={activity._id}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onEdit(activity)}
                  className="w-full rounded-md border border-border bg-surface-lowest p-4 text-left shadow-e1 transition-colors enabled:hover:bg-surface-low disabled:cursor-default"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 font-body text-sm font-semibold text-on-surface">
                      {activity.title}
                    </p>
                    <div className="flex shrink-0 gap-1.5">
                      {activity.cancelled && (
                        <Badge variant="rejected">Cancelled</Badge>
                      )}
                      {activity.past && !activity.cancelled && (
                        <Badge variant="neutral">Done</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 font-body text-xs text-on-surface-variant">
                    <span className="font-mono">
                      {churchDateLabel(activity.startDateTime)}
                    </span>
                    {" · "}
                    <span className="font-mono">
                      {churchTimeLabel(activity.startDateTime)}–
                      {churchTimeLabel(activity.endDateTime)}
                    </span>
                    {activity.location ? ` · ${activity.location}` : ""}
                  </p>
                  {activity.cancelled && activity.cancellationReason && (
                    <p className="mt-2 font-body text-xs text-crimson">
                      {activity.cancellationReason}
                    </p>
                  )}
                  {activity.description && (
                    <p className="mt-2 line-clamp-2 font-body text-xs text-on-surface-variant">
                      {activity.description}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </Reveal>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          <Church className="size-4 text-primary" aria-hidden="true" />
          Church events
        </h2>
        {events === undefined || events.length === 0 ? (
          <p className="font-body text-sm text-outline">
            Nothing church-wide in this window.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event._id}
                className="rounded-md border border-border bg-surface-low p-3"
              >
                <p className="font-body text-sm font-medium text-on-surface">
                  {event.title}
                  {event.cancelled && (
                    <span className="ml-2 font-body text-xs text-crimson">
                      cancelled
                    </span>
                  )}
                </p>
                <p className="font-body text-xs text-on-surface-variant">
                  <span className="font-mono">
                    {churchDateLabel(event.startDateTime)}
                  </span>
                  {event.location ? ` · ${event.location}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="font-body text-xs text-outline">
          Church events are read only here. The church office schedules them.
        </p>
      </section>
    </div>
  );
}

function MonthGrid({
  year,
  month,
  todayKey,
  activities,
  events,
  onPick,
}: {
  year: number;
  month: number;
  todayKey: string;
  activities: Activity[] | undefined;
  events: ChurchEvent[] | undefined;
  onPick?: (activity: Activity) => void;
}) {
  const leading = firstWeekdayOfMonth(year, month);
  const days = daysInMonth(year, month);

  const byDay = useMemo(() => {
    const map = new Map<number, { activities: Activity[]; events: ChurchEvent[] }>();
    for (const activity of activities ?? []) {
      const day = churchParts(activity.startDateTime).day;
      const bucket = map.get(day) ?? { activities: [], events: [] };
      bucket.activities.push(activity);
      map.set(day, bucket);
    }
    for (const event of events ?? []) {
      const day = churchParts(event.startDateTime).day;
      const bucket = map.get(day) ?? { activities: [], events: [] };
      bucket.events.push(event);
      map.set(day, bucket);
    }
    return map;
  }, [activities, events]);

  if (activities === undefined) {
    return <Skeleton className="h-96 w-full rounded-md" aria-busy="true" />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface-lowest shadow-e1">
      <div className="grid grid-cols-7 bg-surface-low">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-1 py-2 text-center font-body text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant"
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: leading }).map((_, index) => (
          <div key={`blank-${index}`} className="min-h-16 bg-surface-low/40 sm:min-h-24" />
        ))}
        {Array.from({ length: days }).map((_, index) => {
          const day = index + 1;
          const bucket = byDay.get(day);
          const isToday = todayKey === `${year}-${month}-${day}`;
          return (
            <div
              key={day}
              className={`min-h-16 border-t border-border/60 p-1 sm:min-h-24 sm:p-1.5 ${
                isToday ? "bg-primary-light" : ""
              }`}
            >
              <p
                className={`font-mono text-[11px] ${
                  isToday
                    ? "font-bold text-primary"
                    : "text-on-surface-variant"
                }`}
              >
                {day}
              </p>
              <div className="mt-1 space-y-1">
                {bucket?.activities.map((activity) => (
                  <button
                    key={activity._id}
                    type="button"
                    disabled={!onPick}
                    onClick={() => onPick?.(activity)}
                    title={activity.title}
                    className={`block w-full truncate rounded-sm px-1 py-0.5 text-left font-body text-[10px] leading-tight sm:text-[11px] ${
                      activity.cancelled
                        ? "bg-crimson-light text-crimson line-through"
                        : "bg-primary/15 text-on-surface"
                    } enabled:hover:brightness-95 disabled:cursor-default`}
                  >
                    {activity.title}
                  </button>
                ))}
                {bucket?.events.map((event) => (
                  <span
                    key={event._id}
                    title={`${event.title} (church event)`}
                    className="block truncate rounded-sm bg-royal-light px-1 py-0.5 font-body text-[10px] leading-tight text-on-surface-variant sm:text-[11px]"
                  >
                    {event.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
