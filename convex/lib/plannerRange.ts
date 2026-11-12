import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  DAY_MS,
  KAMPALA_OFFSET_MS,
  kampalaParts,
  occurrenceInstant,
  ymd,
} from "../calendar";
import { weeklyProgramOccursOn } from "./recurrence";
import { cancellationKey, getCancellationsInRange } from "./occurrences";
import { audienceOf, type EventAudience } from "./eventAudience";

// The Administration side range logic behind the Year Planner, shared with the
// dashboard's This week card (spec 0021, AC-2) so the two cannot disagree.
// Programs are expanded onto their days with cancellations applied, and every
// event is included whatever its audience: this is never the member side
// audience filter. No authorization here; each caller checks it.

export type PlannerItem =
  | {
      type: "program";
      date: string;
      start: number;
      occurrenceKey: string;
      programId: string;
      title: string;
      startTime: string;
      endTime?: string;
      location?: string;
      // Spec 0009. `notifiedAt` is planner only: it is what lets the restore
      // dialog warn that members have already been told the occurrence was off.
      cancelled: boolean;
      cancellationReason?: string;
      notifiedAt?: number;
    }
  | {
      type: "event";
      date: string;
      start: number;
      eventId: string;
      title: string;
      location?: string;
      audience: EventAudience;
      cancelled: boolean;
    }
  | {
      type: "activity";
      date: string;
      start: number;
      activityId: string;
      title: string;
      description?: string;
      status: Doc<"plannedActivities">["status"];
      departmentIds: Doc<"plannedActivities">["departmentIds"];
    };

/** Programs, events and planned activities in [startDate, endDate], soonest first. */
export async function buildPlannerItems(
  ctx: QueryCtx,
  startDate: number,
  endDate: number
): Promise<PlannerItem[]> {
  const rangeStart = kampalaParts(startDate);
  const rangeEnd = kampalaParts(endDate);

  const [programs, eventsInRange, activitiesInRange, cancellations] =
    await Promise.all([
      ctx.db
        .query("weeklyPrograms")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_startDateTime", (q) =>
          q.gte("startDateTime", startDate).lte("startDateTime", endDate)
        )
        .collect(),
      ctx.db
        .query("plannedActivities")
        .withIndex("by_targetDate", (q) =>
          q.gte("targetDate", startDate).lte("targetDate", endDate)
        )
        .collect(),
      // Called off program occurrences in the same window (spec 0009), through
      // the same helper the member calendar uses so the two cannot disagree.
      getCancellationsInRange(
        ctx,
        ymd(rangeStart.year, rangeStart.month, rangeStart.day),
        ymd(rangeEnd.year, rangeEnd.month, rangeEnd.day)
      ),
    ]);

  const items: PlannerItem[] = [];

  // Walk each Kampala local calendar day in the range, expanding active
  // programs onto matching days, the same approach as
  // calendar.getCalendarRange.
  const firstDay = kampalaParts(startDate);
  let dayCursor =
    Date.UTC(firstDay.year, firstDay.month, firstDay.day) - KAMPALA_OFFSET_MS;
  for (; dayCursor <= endDate; dayCursor += DAY_MS) {
    const parts = kampalaParts(dayCursor);
    for (const program of programs) {
      if (!weeklyProgramOccursOn(program, dayCursor, parts)) continue;
      const startTime = program.startTime ?? program.time;
      if (!startTime) continue; // shouldn't happen post-migration; defensive
      const instant = occurrenceInstant(
        parts.year,
        parts.month,
        parts.day,
        startTime
      );
      if (instant < startDate || instant > endDate) continue;
      const date = ymd(parts.year, parts.month, parts.day);
      const cancellation = cancellations.get(cancellationKey(program._id, date));
      items.push({
        type: "program",
        date,
        start: instant,
        occurrenceKey: `${program._id}_${date}`,
        programId: program._id,
        title: program.title,
        startTime,
        ...(program.endTime ? { endTime: program.endTime } : {}),
        ...(program.location ? { location: program.location } : {}),
        cancelled: cancellation !== undefined,
        ...(cancellation?.reason
          ? { cancellationReason: cancellation.reason }
          : {}),
        ...(cancellation?.notifiedAt !== undefined
          ? { notifiedAt: cancellation.notifiedAt }
          : {}),
      });
    }
  }

  for (const event of eventsInRange) {
    if (!event.active) continue;
    const parts = kampalaParts(event.startDateTime);
    items.push({
      type: "event",
      date: ymd(parts.year, parts.month, parts.day),
      start: event.startDateTime,
      eventId: event._id,
      title: event.title,
      ...(event.location ? { location: event.location } : {}),
      audience: audienceOf(event),
      cancelled: event.cancelledAt !== undefined,
    });
  }

  for (const activity of activitiesInRange) {
    const parts = kampalaParts(activity.targetDate);
    items.push({
      type: "activity",
      date: ymd(parts.year, parts.month, parts.day),
      start: activity.targetDate,
      activityId: activity._id,
      title: activity.title,
      ...(activity.description ? { description: activity.description } : {}),
      status: activity.status,
      departmentIds: activity.departmentIds,
    });
  }

  items.sort((a, b) => a.start - b.start);
  return items;
}

/** A department or clan activity, as the planner shows it read only (spec 0021, AC-21). */
export interface PlannerGroupActivity {
  _id: Id<"groupActivities">;
  title: string;
  startDateTime: number;
  endDateTime: number;
  location?: string;
  ownerType: "department" | "clan";
  ownerId: Id<"departments"> | Id<"clans">;
  ownerName: string;
  cancelled: boolean;
}

/**
 * Every department and clan activity that overlaps [rangeStart, rangeEnd],
 * both ends inclusive like the rest of the planner (`startDateTime <=
 * rangeEnd` and `endDateTime >= rangeStart`), soonest first. Spec 0021 AC-21
 * writes the start bound as `<`; inclusive is what keeps an activity starting
 * on the range's last instant from vanishing while an event at that instant
 * shows.
 *
 * One bounded read per department (`by_department_start`) and per clan
 * (`by_clan_start`): there is deliberately no bare start index on
 * `groupActivities`. The overlap rule includes rows that started before the
 * range and are still running, so each read has no lower bound on start and
 * the overlap filter does the rest. A group's activities number in the tens.
 */
export async function listGroupActivitiesInRange(
  ctx: QueryCtx,
  rangeStart: number,
  rangeEnd: number
): Promise<PlannerGroupActivity[]> {
  const overlaps = (a: Doc<"groupActivities">) =>
    a.startDateTime <= rangeEnd && a.endDateTime >= rangeStart;

  const [departments, clans] = await Promise.all([
    ctx.db.query("departments").withIndex("by_order").collect(),
    ctx.db.query("clans").withIndex("by_order").collect(),
  ]);

  const perDepartment = await Promise.all(
    departments.map(async (department) => {
      const rows = await ctx.db
        .query("groupActivities")
        .withIndex("by_department_start", (q) =>
          q
            .eq("owner.departmentId", department._id)
            .lte("startDateTime", rangeEnd)
        )
        .collect();
      return rows.filter(overlaps).map(
        (a): PlannerGroupActivity => ({
          _id: a._id,
          title: a.title,
          startDateTime: a.startDateTime,
          endDateTime: a.endDateTime,
          ...(a.location ? { location: a.location } : {}),
          ownerType: "department",
          ownerId: department._id,
          ownerName: department.name,
          cancelled: a.cancelledAt !== undefined,
        })
      );
    })
  );

  const perClan = await Promise.all(
    clans.map(async (clan) => {
      const rows = await ctx.db
        .query("groupActivities")
        .withIndex("by_clan_start", (q) =>
          q
            .eq("owner.clanId", clan._id)
            .lte("startDateTime", rangeEnd)
        )
        .collect();
      return rows.filter(overlaps).map(
        (a): PlannerGroupActivity => ({
          _id: a._id,
          title: a.title,
          startDateTime: a.startDateTime,
          endDateTime: a.endDateTime,
          ...(a.location ? { location: a.location } : {}),
          ownerType: "clan",
          ownerId: clan._id,
          ownerName: clan.name,
          cancelled: a.cancelledAt !== undefined,
        })
      );
    })
  );

  return [...perDepartment.flat(), ...perClan.flat()].sort(
    (a, b) => a.startDateTime - b.startDateTime
  );
}
