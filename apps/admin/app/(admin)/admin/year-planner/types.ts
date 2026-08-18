import type { FunctionReturnType } from "convex/server";
import type { api } from "@/lib/api";

// The Year Planner's single data source: convex/plannedActivities.ts's merged
// program/event/activity feed. Derived rather than hand-declared so the shape
// tracks the backend exactly — see CLAUDE.md's note on `api.plannedActivities`
// showing as a type error until `pnpm convex` has run once on this branch.
export type PlannerItems = NonNullable<
  FunctionReturnType<typeof api.plannedActivities.getYearPlannerRange>
>;
export type PlannerItem = PlannerItems[number];
export type ActivityItem = Extract<PlannerItem, { type: "activity" }>;

export type PlannerView = "year" | "quarter" | "month" | "week";

/** Stable React key for a planner item — each type keys off its own id field. */
export function plannerItemKey(item: PlannerItem): string {
  if (item.type === "activity") return `activity-${item.activityId}`;
  if (item.type === "program") return `program-${item.occurrenceKey}`;
  return `event-${item.eventId}`;
}
