import type { FunctionReturnType } from "convex/server";
import { kampalaDateKeyAt, kampalaDayStartAt } from "@klt-cyber/shared";
import type { api } from "@/lib/api";

// The Year Planner's data source: convex/plannedActivities.ts's merged
// program/event/activity feed, plus the department and clan activities it
// shows read only (spec 0021, AC-21). Derived rather than hand-declared so the
// shape tracks the backend exactly.
export type PlannerRange = NonNullable<
  FunctionReturnType<typeof api.plannedActivities.getYearPlannerRange>
>;
type ServerItem = PlannerRange["items"][number];
export type GroupActivity = PlannerRange["groupActivities"][number];

/**
 * A department or clan activity on one day it covers. Built in the client so
 * a three day retreat shows on each of its days; read only, never editable
 * from the planner.
 */
export interface GroupItem {
  type: "group";
  date: string;
  start: number;
  title: string;
  cancelled: boolean;
  /** True on the day the activity starts, which is the day that shows its time. */
  firstDay: boolean;
  activity: GroupActivity;
}

export type PlannerItem = ServerItem | GroupItem;
export type ActivityItem = Extract<PlannerItem, { type: "activity" }>;

export type PlannerView = "year" | "quarter" | "month" | "week";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One `GroupItem` per Kampala day the activity covers inside [rangeStart,
 * rangeEnd]. Kampala keys, the same as the server stamps on every other item,
 * so the day cells agree.
 */
export function groupActivityDays(
  activity: GroupActivity,
  rangeStart: number,
  rangeEnd: number,
): GroupItem[] {
  const from = Math.max(activity.startDateTime, rangeStart);
  const to = Math.min(activity.endDateTime, rangeEnd);
  const startKey = kampalaDateKeyAt(activity.startDateTime);
  const days: GroupItem[] = [];
  for (let day = kampalaDayStartAt(from); day <= to; day += DAY_MS) {
    const date = kampalaDateKeyAt(day);
    // An activity ending exactly at midnight (a 20:00 to 00:00 vigil) does
    // not touch the day that midnight begins.
    if (day === activity.endDateTime && date !== startKey) break;
    days.push({
      type: "group",
      date,
      start: date === startKey ? activity.startDateTime : day,
      title: activity.title,
      cancelled: activity.cancelled,
      firstDay: date === startKey,
      activity,
    });
  }
  return days;
}

/** Stable React key for a planner item — each type keys off its own id field. */
export function plannerItemKey(item: PlannerItem): string {
  if (item.type === "activity") return `activity-${item.activityId}`;
  if (item.type === "program") return `program-${item.occurrenceKey}`;
  if (item.type === "group") return `group-${item.activity._id}-${item.date}`;
  return `event-${item.eventId}`;
}
