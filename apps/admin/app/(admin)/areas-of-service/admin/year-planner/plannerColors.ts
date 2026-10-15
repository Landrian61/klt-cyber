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
};

export const PLANNER_TYPES: PlannerItem["type"][] = ["program", "event", "activity"];

/**
 * "9:00 AM" for program/event — both carry a real time-of-day. `undefined`
 * for activity: `targetDate` is a day-level plan, not a scheduled time, so
 * there's nothing meaningful to show.
 */
export function plannerItemTime(item: PlannerItem): string | undefined {
  if (item.type === "program") return formatTime(item.startTime);
  if (item.type === "event") {
    return new Date(item.start).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return undefined;
}
