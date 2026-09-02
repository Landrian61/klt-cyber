import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { NotificationAudience } from "../schema";

// Shared helpers for `internal.notifications.dispatch` call sites — the
// dispatch-args shape and the time-tiered "schedule a reminder, skip it if
// it'd land in the past" pattern were previously hand-rolled independently
// in convex/announcements.ts, convex/events.ts, convex/weeklyPrograms.ts,
// convex/roles.ts, and convex/memberProfiles.ts (docs/DATA_MODEL.md,
// Increment 8). No behavior change versus what each call site did before —
// this is extraction, not new logic.

/** The dispatch-args shape every notification call site builds by hand. */
export function notificationCommon(params: {
  audience: NotificationAudience;
  deepLink: { type: string; id: string };
  createdBy: Id<"users">;
  imageUrl?: string;
}) {
  return {
    audience: params.audience,
    deepLink: params.deepLink,
    createdBy: params.createdBy,
    ...(params.imageUrl ? { imageUrl: params.imageUrl } : {}),
  };
}

export type ReminderEntry = { at: number; title: string; body: string } | null;

/**
 * Schedules each non-null entry's dispatch at its `at` instant, concurrently
 * (Convex fires immediately if `at` is already past — the same effect as
 * `runAfter(0, ...)`). Returns one result per input entry, same order —
 * `undefined` for a `null` entry (the caller's own "skip this tier" signal,
 * e.g. a week-before reminder that would already be in the past) or the
 * scheduled job id otherwise, so a caller that persists per-tier job ids
 * (convex/events.ts) can zip the result back onto named fields positionally.
 */
export async function scheduleReminderEntries(
  ctx: MutationCtx,
  entries: ReminderEntry[],
  common: ReturnType<typeof notificationCommon>
): Promise<(Id<"_scheduled_functions"> | undefined)[]> {
  return Promise.all(
    entries.map((entry) =>
      entry
        ? ctx.scheduler.runAt(entry.at, internal.notifications.dispatch, {
            title: entry.title,
            body: entry.body,
            ...common,
          })
        : Promise.resolve(undefined)
    )
  );
}
