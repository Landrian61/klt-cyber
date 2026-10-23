import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  KAMPALA_UTC_OFFSET_MS,
  UPCOMING_HORIZON_DAYS,
  kampalaToday,
} from "@klt-cyber/shared";
import { getCurrentUser } from "./lib/authz";
import { getEligibleGroups } from "./lib/groupMembership";
import { resolveMediaUrl } from "./lib/media";

// One merged upcoming list (spec 0010, AC-5 and AC-6): church events and the
// caller's own group activities, in one order, each tagged.
//
// Deliberately ONE query and not two. Home (feature 12, M2-06) calls the same
// function with a small `limit`, so the horizon, the sort, the tag and the
// cancelled mark exist in exactly one place and the two screens cannot answer
// "what is coming up" differently.
//
// Read-only: nothing here writes, and nothing lets a member change group or
// cancellation state (AC-15).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hard ceiling on `limit`, so a caller cannot ask for an unbounded read. */
const MAX_LIMIT = 100;

/**
 * Midnight today in Kampala, as an instant.
 *
 * NOT `Date.now()`. The window has to open at the start of the church's own
 * day so something that began an hour ago is still listed; starting it at the
 * current moment would drop this morning's service by lunchtime. Built from
 * the same Kampala day string and offset spec 0009 fixed, so the backend and
 * both clients agree on which day "today" is.
 */
function kampalaMidnightToday(now: number): number {
  const [year, month, day] = kampalaToday(now).split("-").map(Number);
  return Date.UTC(year, month - 1, day) - KAMPALA_UTC_OFFSET_MS;
}

export interface UpcomingRow {
  kind: "event" | "activity";
  id: string;
  title: string;
  description: string | undefined;
  startDateTime: number;
  endDateTime: number;
  location: string | undefined;
  coverImageUrl: string | undefined;
  /** `Church` for an event, the owning department's or clan's name otherwise. */
  tag: string;
  cancelled: boolean;
  cancellationReason: string | undefined;
  /** Only for the tie break below; the client has no use for it. */
  createdOrder: number;
}

/**
 * Church events plus the caller's group activities, merged and ordered.
 *
 * Returns `null` when the session is not authenticated, like every other
 * member-facing query here.
 */
export const listUpcomingForMember = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const now = Date.now();
    const windowStart = kampalaMidnightToday(now);
    // Inclusive of the final day: the window closes at the END of its last
    // day, not at that day's midnight, so an event on the horizon's own date
    // does not fall just outside it. UPCOMING_HORIZON_DAYS counts days
    // INCLUDING today, which is how weeklyPrograms.listActivePrograms counts
    // its own horizon off the same constant — the two feed one screen, so an
    // extra day here would have them disagree by a day about where the window
    // stops.
    const windowEnd = windowStart + UPCOMING_HORIZON_DAYS * DAY_MS - 1;

    // A row leaves the list once it has FINISHED, which is the one boundary
    // both AC-5 and AC-6 use: something that started an hour ago and is still
    // running stays listed, and a cancelled row leaves on the same boundary as
    // everything else rather than vanishing early.
    const stillRunning = (row: { endDateTime: number }) => row.endDateTime >= now;

    const toRow = async (
      kind: "event" | "activity",
      row: Doc<"events"> | Doc<"groupActivities">,
      tag: string
    ): Promise<UpcomingRow> => ({
      kind,
      id: row._id,
      title: row.title,
      description: row.description,
      startDateTime: row.startDateTime,
      endDateTime: row.endDateTime,
      location: row.location,
      coverImageUrl: await resolveMediaUrl(row.coverImageUrl),
      tag,
      cancelled: row.cancelledAt !== undefined,
      cancellationReason: row.cancellationReason,
      createdOrder: row._creationTime,
    });

    // ── Church events ──────────────────────────────────────────────────────
    const events = await ctx.db
      .query("events")
      .withIndex("by_startDateTime", (q) =>
        q.gte("startDateTime", windowStart).lte("startDateTime", windowEnd)
      )
      // `active: false` means archived, which is a different thing from
      // cancelled: an archived event disappears entirely, a cancelled one
      // stays and is marked (AC-6). The two checks never collapse into one.
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const rows: UpcomingRow[] = await Promise.all(
      events.filter(stillRunning).map((e) => toRow("event", e, "Church"))
    );

    // ── The caller's group activities ──────────────────────────────────────
    // One indexed read per eligible group. A member in ten departments makes
    // ten small reads rather than one read across every activity in the
    // church, so the cost follows the member's own memberships rather than how
    // many groups the church has.
    const groups = await getEligibleGroups(ctx, user._id);

    for (const departmentId of groups.departmentIds) {
      const department = await ctx.db.get(departmentId);
      // A roster row can outlive its department. Omitted rather than listed
      // untagged, the same rule My groups follows.
      if (!department) continue;

      const activities = await ctx.db
        .query("groupActivities")
        .withIndex("by_department_start", (q) =>
          q
            .eq("owner.departmentId", departmentId)
            .gte("startDateTime", windowStart)
            .lte("startDateTime", windowEnd)
        )
        .collect();

      rows.push(
        ...(await Promise.all(
          activities
            .filter(stillRunning)
            .map((a) => toRow("activity", a, department.name))
        ))
      );
    }

    if (groups.clanId) {
      const clan = await ctx.db.get(groups.clanId);
      if (clan) {
        const activities = await ctx.db
          .query("groupActivities")
          .withIndex("by_clan_start", (q) =>
            q
              .eq("owner.clanId", clan._id)
              .gte("startDateTime", windowStart)
              .lte("startDateTime", windowEnd)
          )
          .collect();

        rows.push(
          ...(await Promise.all(
            activities.filter(stillRunning).map((a) => toRow("activity", a, clan.name))
          ))
        );
      }
    }

    // ── One order ──────────────────────────────────────────────────────────
    // The tie break matters because of `limit`: without it, two items starting
    // at the same minute could come back either way round, and Home's "next 3"
    // would reshuffle between reads for no reason the member can see. Events
    // before activities, then oldest row first.
    rows.sort((a, b) => {
      if (a.startDateTime !== b.startDateTime) {
        return a.startDateTime - b.startDateTime;
      }
      if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
      return a.createdOrder - b.createdOrder;
    });

    // Applied AFTER the merge, so both sources are read for the whole window
    // first and the cut is taken from the ordered result. Cutting each source
    // separately would drop a near activity in favour of a far event.
    // MAX_LIMIT applies to the default too, not only to a limit the caller
    // named: the mobile screen calls this with no limit at all, which used to
    // skip the ceiling entirely. A non-positive limit floors at 0 rather than
    // reading as "no limit".
    const effectiveLimit =
      limit === undefined ? MAX_LIMIT : Math.min(Math.max(limit, 0), MAX_LIMIT);
    const capped = rows.slice(0, effectiveLimit);
    return capped.map(({ createdOrder: _createdOrder, ...row }) => row);
  },
});
