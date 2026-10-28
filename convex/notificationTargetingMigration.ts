import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// One-time backfills for spec 0013 (notification targeting). Same
// additive-schema-then-migrate rollout as convex/weeklyProgramsMigration.ts.
//
// Deploy order (each deployment needs the developer's go ahead):
//   1. Deploy with the optional `announcements.firstPublishedAt` and
//      `notifications.kind` fields, which land with the code that writes them.
//   2. Run `pnpm exec convex run notificationTargetingMigration:backfillFirstPublishedAt`
//      and `…:retargetAppointmentNotices` (add `--prod` for production).
//   3. Run `…:verify` and confirm both counts are 0.
// Idempotent — safe to re-run; rows already set or narrowed are skipped.

/**
 * When this announcement was first published, according to the audit trail:
 * the earliest `content.announcement_published` entry, or a
 * `content.announcement_created` entry that created it already published.
 * `null` when the trail holds neither.
 */
async function firstPublishFromLogs(
  ctx: QueryCtx,
  announcement: Doc<"announcements">
): Promise<number | null> {
  const logs = await ctx.db
    .query("activityLogs")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "announcements").eq("targetId", announcement._id)
    )
    .collect();
  const times = logs
    .filter(
      (log) =>
        log.action === "content.announcement_published" ||
        (log.action === "content.announcement_created" &&
          log.metadata?.status === "published")
    )
    .map((log) => log._creationTime);
  return times.length ? Math.min(...times) : null;
}

/**
 * The value `firstPublishedAt` should take, or `null` when the row has never
 * been published and must stay unset. Published and archived rows always get
 * one (archived is terminal and can never republish, so marking it is
 * harmless); a draft gets one only when the trail shows it was published once
 * and then disabled.
 */
async function backfillValue(
  ctx: QueryCtx,
  announcement: Doc<"announcements">
): Promise<number | null> {
  const fromLogs = await firstPublishFromLogs(ctx, announcement);
  if (fromLogs !== null) return fromLogs;
  return announcement.status === "draft" ? null : announcement._creationTime;
}

/** An appointment notice row sent to everyone, from before spec 0013. */
function isBroadcastAppointment(row: Doc<"notifications">) {
  return row.deepLink.type === "role_assignment" && row.audience.type === "all";
}

export const backfillFirstPublishedAt = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("announcements").collect();
    let patched = 0;
    for (const row of rows) {
      if (row.firstPublishedAt !== undefined) continue;
      const value = await backfillValue(ctx, row);
      if (value === null) continue;
      await ctx.db.patch(row._id, { firstPublishedAt: value });
      patched++;
    }
    return { patched };
  },
});

/**
 * Narrows every pre-0013 appointment notice from `all` to its appointee
 * (spec 0013, AC-3). A row whose assignment no longer exists cannot be
 * narrowed to anyone, so it is left and `verify` keeps counting it.
 */
export const retargetAppointmentNotices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_audience_type", (q) => q.eq("audience.type", "all"))
      .collect();
    let patched = 0;
    for (const row of rows) {
      if (!isBroadcastAppointment(row)) continue;
      const assignmentId = ctx.db.normalizeId("roleAssignments", row.deepLink.id);
      const assignment = assignmentId ? await ctx.db.get(assignmentId) : null;
      if (!assignment) continue;
      await ctx.db.patch(row._id, {
        // `recipientCount` stays as written: the push really did reach
        // everyone at the time, and analytics reports that fact.
        audience: { type: "users", userIds: [assignment.userId] },
      });
      patched++;
    }
    return { patched };
  },
});

export const verify = internalQuery({
  args: {},
  handler: async (ctx) => {
    const announcements = await ctx.db.query("announcements").collect();
    let announcementsMissing = 0;
    for (const row of announcements) {
      if (row.firstPublishedAt !== undefined) continue;
      if ((await backfillValue(ctx, row)) !== null) announcementsMissing++;
    }
    const broadcast = await ctx.db
      .query("notifications")
      .withIndex("by_audience_type", (q) => q.eq("audience.type", "all"))
      .collect();
    return {
      announcementsMissing,
      appointmentRowsToAll: broadcast.filter(isBroadcastAppointment).length,
    }; // expect both 0
  },
});
