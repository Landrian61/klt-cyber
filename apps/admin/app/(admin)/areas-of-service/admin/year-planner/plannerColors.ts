import { formatTime } from "../_lib/adminContent";
import type { PlannerItem } from "./types";

// One color per item type — the Year Planner's single source of truth so
// DayCell/MiniMonth/DayPopup can't drift from each other. Reuses exactly the
// three Kingdom Radiant brand hues (no new colors): Program keeps gold (the
// steady, recurring content), Event gets royal blue (CLAUDE.md's "tertiary —
// community" framing), Activity gets crimson (CLAUDE.md's "secondary —
// priority" framing — a department task that needs tracking).
export const PLANNER_TYPE_COLOR: Record<
  PlannerItem["type"],
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  program: {
    bg: "bg-primary-light",
    text: "text-primary",
    border: "border-primary",
    dot: "bg-primary",
    label: "Program",
  },
  event: {
    bg: "bg-royal-light",
    text: "text-royal",
    border: "border-royal",
    dot: "bg-royal",
    label: "Event",
  },
  activity: {
    bg: "bg-crimson-light",
    text: "text-crimson",
    border: "border-crimson",
    dot: "bg-crimson",
    label: "Activity",
  },
  // A department or clan activity (spec 0021, AC-21): view only, so it takes
  // the quiet surface tone and a dashed accent rather than a brand hue. It is
  // somebody else's plan, shown so Administration can plan around it.
  group: {
    bg: "bg-surface-low",
    text: "text-on-surface-variant",
    border: "border-outline border-dashed",
    dot: "bg-outline",
    label: "Department or clan",
  },
};

export const PLANNER_TYPES: PlannerItem["type"][] = ["program", "event", "activity", "group"];

/**
 * A called-off program occurrence (spec 0009) takes crimson — the design
 * system's secondary role, which already carries "priority / destructive"
 * everywhere else in the portal — rather than its program gold, so a cancelled
 * night reads as different at a glance and not merely as one more program.
 *
 * The colour alone is not the signal: `PlannerChip` also strikes the title
 * through, and the day pop-up spells the word out. Crimson is already the
 * activity colour, so colour on its own would be ambiguous.
 */
export const PLANNER_CANCELLED_COLOR = {
  bg: "bg-crimson-light",
  text: "text-crimson",
  border: "border-crimson",
  dot: "bg-crimson",
  label: "Cancelled",
} as const;

/**
 * True when this item has been called off: a program occurrence (spec 0009),
 * an event (spec 0021, AC-19) or a department or clan activity (AC-21).
 */
export function isCancelledOccurrence(item: PlannerItem): boolean {
  return item.type !== "activity" && item.cancelled;
}

/** The palette an item actually renders in — its type's, unless it is cancelled. */
export function plannerItemColor(item: PlannerItem) {
  return isCancelledOccurrence(item)
    ? PLANNER_CANCELLED_COLOR
    : PLANNER_TYPE_COLOR[item.type];
}

/**
 * "9:00 AM" for program/event — both carry a real time-of-day. `undefined`
 * for activity: `targetDate` is a day-level plan, not a scheduled time, so
 * there's nothing meaningful to show.
 */
export function plannerItemTime(item: PlannerItem): string | undefined {
  if (item.type === "program") return formatTime(item.startTime);
  if (item.type === "event" || (item.type === "group" && item.firstDay)) {
    return new Date(item.start).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return undefined;
}
