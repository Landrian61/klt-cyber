import { v } from "convex/values";
import { query, internalAction, internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getSystemAdminOrNull } from "./lib/authz";
import { reportError } from "./lib/sentry";
import { ANALYTICS_GAPS } from "@klt-cyber/shared";
import { serviceByKey } from "./costs";
import {
  DAY_MS,
  kampalaDateKey,
  kampalaDayStart,
  kampalaMonthStart,
} from "./calendar";

/**
 * Platform analytics for the System Admin (spec 0011, SRS §4.3.3).
 *
 * Every number here is counted live, on page load, from an indexed read. The
 * one exception is total file storage, which is measured once a night into
 * `platformMetrics` because measuring it means paging the whole storage
 * bucket — and the page says when it was measured rather than pretending it
 * is current.
 *
 * The rule that shapes this file: a number whose source does not exist yet is
 * never rendered as a zero. It is an entry in ANALYTICS_GAPS, which the page
 * renders as a sentence naming the feature that will supply it. A System Admin
 * acting on a fabricated zero is worse off than one told plainly that the
 * counter is not built, so there is deliberately no code path from "missing
 * source" to a numeral.
 *
 * Convex has no count aggregate, so a count is a read. That is affordable here
 * at the church's size and is revisited in the spec's Follow-up — the fix
 * would be @convex-dev/aggregate, not a nightly snapshot, which would
 * reintroduce exactly the staleness this design rejected.
 */
export const getPlatformAnalytics = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated, so a live subscription outlasts sign-out —
    // the same reactive-safe convention convex/admin.ts:getDashboardStats
    // follows. A signed-in caller without the role is thrown out by the
    // helper, and the route-group layout redirects them before they get here.
    if (!(await getSystemAdminOrNull(ctx))) return null;

    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;
    const thirtyDaysAgo = now - 30 * DAY_MS;

    // ── People ────────────────────────────────────────────────────────────
    // Deleted accounts are excluded from every count except the deletion
    // count itself (spec 0008 AC-22): these are people, not rows.
    const users = (await ctx.db.query("users").collect()).filter(
      (user) => user.deletedAt === undefined
    );

    const pendingVerification = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) =>
        q.eq("profileStatus", "pending_verification")
      )
      .collect();

    // Unranged on purpose, and the one unranged activityLogs read in this
    // feature: the figure is "to date", and it is bounded by how many people
    // have ever left the church, which is small by nature rather than by a
    // window.
    const deletions = await ctx.db
      .query("activityLogs")
      .withIndex("by_action", (q) => q.eq("action", "account.deleted"))
      .collect();

    const people = {
      totalAccounts: users.length,
      visitors: users.filter((user) => user.role === "visitor").length,
      verifiedMembers: users.filter((user) => user.role === "member").length,
      pendingVerification: pendingVerification.length,
      signupsLast7Days: users.filter(
        (user) => user._creationTime >= sevenDaysAgo
      ).length,
      signupsLast30Days: users.filter(
        (user) => user._creationTime >= thirtyDaysAgo
      ).length,
      accountDeletions: deletions.length,
      // Thirty Kampala days of sign-ups, bucketed from the same `users` read
      // the counts above come from, so the chart and the totals can never
      // disagree. Days with nobody are present with a zero: a gap in a time
      // series has to be visible as a quiet day, not closed up as though it
      // never happened.
      signupsByDay: dailySeries(
        users.map((user) => user._creationTime),
        kampalaDayStart(now) - 29 * DAY_MS,
        30
      ),
    };

    // ── Activity ──────────────────────────────────────────────────────────
    // Three nesting windows. "Today" is a calendar-day question answered in
    // Africa/Kampala, not UTC: a Kampala church's day ends at Kampala
    // midnight, and answering it in UTC would push every evening's activity
    // into tomorrow. The 7- and 30-day windows are rolling rather than
    // calendar, which is what guarantees the three always nest.
    const todayStart = kampalaDayStart(now);
    const activityWindow = await ctx.db
      .query("userActivity")
      .withIndex("by_lastActiveAt", (q) => q.gte("lastActiveAt", thirtyDaysAgo))
      .collect();

    // A deleted account's activity row is removed with the account (AC-19), so
    // this set is belt and braces: it also covers a row left behind by a
    // deletion that ran before this feature shipped.
    const liveUserIds = new Set<Id<"users">>(users.map((user) => user._id));
    const activeIn = (since: number) =>
      new Set(
        activityWindow
          .filter(
            (row) => row.lastActiveAt >= since && liveUserIds.has(row.userId)
          )
          .map((row) => row.userId)
      ).size;

    const activity = {
      activeToday: activeIn(todayStart),
      activeLast7Days: activeIn(sevenDaysAgo),
      activeLast30Days: activeIn(thirtyDaysAgo),
    };

    // ── Devices ───────────────────────────────────────────────────────────
    // The unit here is phones, not people: two phones on one account count
    // twice, which is what SRS §4.3.3 asks for. The platform splits therefore
    // always sum to the total, and no deleted-account filter applies, because
    // a deleted account's device rows are deleted outright (AC-19).
    const devices = await ctx.db
      .query("userDevices")
      .withIndex("by_lastSeenAt", (q) => q.gte("lastSeenAt", thirtyDaysAgo))
      .collect();

    const versionCounts = new Map<string, number>();
    for (const device of devices) {
      versionCounts.set(
        device.appVersion,
        (versionCounts.get(device.appVersion) ?? 0) + 1
      );
    }

    // The two store consoles, found by `serviceKey` rather than by name,
    // because a System Admin may well have renamed the row since the seed
    // wrote it. Absent when nobody has filled the link in, and the page says
    // so rather than rendering a dead anchor.
    const [playConsole, appStore, sentryService, resendService, r2Service] =
      await Promise.all([
        serviceByKey(ctx, "play_console"),
        serviceByKey(ctx, "app_store"),
        serviceByKey(ctx, "sentry"),
        serviceByKey(ctx, "resend"),
        serviceByKey(ctx, "r2"),
      ]);

    const deviceStats = {
      playConsoleUrl: playConsole?.consoleUrl ?? null,
      appStoreUrl: appStore?.consoleUrl ?? null,
      total: devices.length,
      android: devices.filter((d) => d.platform === "android").length,
      ios: devices.filter((d) => d.platform === "ios").length,
      // Descending as strings, which is correct for Expo's zero-padded
      // major.minor.patch and is stated plainly here and on the page so
      // nobody expects semantic version ordering from it.
      byVersion: [...versionCounts.entries()]
        .map(([appVersion, count]) => ({ appVersion, count }))
        .sort((a, b) => (a.appVersion < b.appVersion ? 1 : -1)),
    };

    // ── Engagement ────────────────────────────────────────────────────────
    // A calendar month in Africa/Kampala, not a rolling 30 days. This is
    // volume measured against allowances that reset with the calendar, so the
    // window has to reset with the calendar too. Both kinds of window are
    // labelled on the page, because having two is only safe if nobody has to
    // guess which one a figure used.
    const monthStart = kampalaMonthStart(now);
    // Today counts as elapsed, so the first of the month is day 1 rather than
    // day 0 — otherwise a projection on the 1st divides by zero.
    const monthDaysElapsed =
      Math.round((kampalaDayStart(now) - monthStart) / DAY_MS) + 1;

    const verificationsThisMonth = await ctx.db
      .query("activityLogs")
      .withIndex("by_action", (q) =>
        q.eq("action", "profile.verified").gte("_creationTime", monthStart)
      )
      .collect();

    const departments = await ctx.db.query("departments").collect();
    const clans = await ctx.db.query("clans").collect();

    // One indexed read per group rather than one window read across every
    // message in the church: the work scales with how many groups exist, and
    // both bounds are invariants of this church — thirteen departments and
    // twelve clans — not assumptions about how it might grow.
    const departmentRows = await Promise.all(
      departments.map(async (department) => {
        const [messages, activities] = await Promise.all([
          ctx.db
            .query("groupMessages")
            .withIndex("by_department", (q) =>
              q
                .eq("owner.departmentId", department._id)
                .gte("_creationTime", monthStart)
            )
            .collect(),
          ctx.db
            .query("groupActivities")
            .withIndex("by_department_start", (q) =>
              q
                .eq("owner.departmentId", department._id)
                .gte("startDateTime", monthStart)
                .lt("startDateTime", nextMonthStart(now))
            )
            .collect(),
        ]);
        return {
          departmentId: department._id,
          name: department.name,
          // Soft-deleted messages are excluded (spec 0010): a message a
          // department withdrew was not engagement.
          messagesSent: messages.filter((m) => m.deletedAt === undefined)
            .length,
          activitiesStarting: activities.length,
        };
      })
    );

    // Clan-owned messages and activities are real and would otherwise vanish:
    // the table is per department because a department is what a portal user
    // runs, so the clans are summed into one line beneath it rather than
    // silently dropped from the totals.
    const clanTotals = await Promise.all(
      clans.map(async (clan) => {
        const [messages, activities] = await Promise.all([
          ctx.db
            .query("groupMessages")
            .withIndex("by_clan", (q) =>
              q.eq("owner.clanId", clan._id).gte("_creationTime", monthStart)
            )
            .collect(),
          ctx.db
            .query("groupActivities")
            .withIndex("by_clan_start", (q) =>
              q
                .eq("owner.clanId", clan._id)
                .gte("startDateTime", monthStart)
                .lt("startDateTime", nextMonthStart(now))
            )
            .collect(),
        ]);
        return {
          messagesSent: messages.filter((m) => m.deletedAt === undefined)
            .length,
          activitiesStarting: activities.length,
        };
      })
    );

    const engagement = {
      verificationsThisMonth: verificationsThisMonth.length,
      byDepartment: departmentRows.sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      clansCombined: {
        messagesSent: clanTotals.reduce((sum, c) => sum + c.messagesSent, 0),
        activitiesStarting: clanTotals.reduce(
          (sum, c) => sum + c.activitiesStarting,
          0
        ),
      },
    };

    // ── Notifications ─────────────────────────────────────────────────────
    // Ranged through the built-in creation-time index, since the table's only
    // declared index is `by_audience_type` and this read is not about audience.
    const notificationsThisMonth = await ctx.db
      .query("notifications")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", monthStart)
      )
      .collect();

    const emailsSentThisMonth = await ctx.db
      .query("activityLogs")
      .withIndex("by_action", (q) =>
        q.eq("action", "email.sent").gte("_creationTime", monthStart)
      )
      .collect();

    const notifications = {
      sentThisMonth: notificationsThisMonth.length,
      // Two distinct numbers, never one: "40 sent" and "40 sent to 1,200
      // people" answer different questions and the page shows both. Rows
      // written before this feature carry no count and contribute nothing,
      // which is why the page labels this as counting recorded fan-outs.
      recipientsReached: notificationsThisMonth.reduce(
        (sum, row) => sum + (row.recipientCount ?? 0),
        0
      ),
      emailsSentThisMonth: emailsSentThisMonth.length,
      // Shown as "x of y" only when the Resend row carries a limit; otherwise
      // just the count, because an allowance nobody has recorded is not a
      // number to invent.
      emailAllowance: resendService?.allowanceLimit ?? null,
      // This month day by day, bucketed from the two reads above. Only the
      // days that have happened: a chart that drew the rest of the month as
      // zeroes would show a cliff every month and read as a collapse rather
      // than as a month that is not over.
      emailsByDay: dailySeries(
        emailsSentThisMonth.map((row) => row._creationTime),
        monthStart,
        monthDaysElapsed
      ),
      notificationsByDay: dailySeries(
        notificationsThisMonth.map((row) => row._creationTime),
        monthStart,
        monthDaysElapsed
      ),
      // What the page needs to say "at this rate, the month ends here". Both
      // come from the server's own Kampala calendar, so a projection can
      // never be drawn against a month length the browser guessed at.
      monthDaysElapsed,
      monthDaysTotal: Math.round((nextMonthStart(now) - monthStart) / DAY_MS),
    };

    // ── Health ────────────────────────────────────────────────────────────
    const failedEmails = await ctx.db
      .query("activityLogs")
      .withIndex("by_action", (q) =>
        q.eq("action", "email.failed").gte("_creationTime", sevenDaysAgo)
      )
      .collect();

    // One row or none. None means the nightly job has never completed a pass,
    // which the page says in words rather than showing as zero bytes.
    const metrics = await ctx.db.query("platformMetrics").first();

    const health = {
      // One link to the Sentry organisation, not three per project, which is
      // what SRS §4.3.3's singular wording asks for.
      sentryUrl: sentryService?.consoleUrl ?? null,
      failedEmailsLast7Days: failedEmails.length,
      // The R2 row's recorded allowance, in bytes, so the page can show how
      // much of the free tier is gone rather than a figure with nothing to
      // measure itself against. Null when nobody has recorded one, and the
      // page then shows the bytes alone — the same rule the email allowance
      // follows, for the same reason.
      storageAllowance: r2Service?.allowanceLimit ?? null,
      storage: metrics
        ? {
            bytes: metrics.storageBytes,
            objectCount: metrics.storageObjectCount,
            computedAt: metrics.computedAt,
          }
        : null,
    };

    return {
      people,
      activity,
      devices: deviceStats,
      engagement,
      notifications,
      health,
      // Served from here rather than read straight off the shared constant
      // in the browser, so a client running a stale bundle cannot show a gap
      // line for a counter that has since been built. The page renders these
      // as sentences; there is no path from this list to a numeral (AC-9).
      gaps: ANALYTICS_GAPS.map((gap) => ({
        key: gap.key,
        section: gap.section,
        label: gap.label,
        sentence: gap.sentence,
      })),
    };
  },
});

/**
 * Count instants into consecutive Kampala days, starting at `startDayStart`.
 *
 * Every day in the range is present, including the empty ones, because a time
 * series with its quiet days dropped is a different shape from the truth: the
 * line would close the gap and imply activity that did not happen.
 *
 * Adding whole days to a day start is exact here only because Africa/Kampala
 * is a fixed UTC+3 offset with no daylight saving. The same arithmetic would
 * be wrong in a zone that shifts, which is why it lives next to the rest of
 * this feature's Kampala reasoning rather than in a general utility.
 */
function dailySeries(
  instants: number[],
  startDayStart: number,
  days: number
): { dateKey: string; count: number }[] {
  const counts = new Map<string, number>();
  const order: string[] = [];

  for (let day = 0; day < days; day++) {
    const key = kampalaDateKey(startDayStart + day * DAY_MS);
    order.push(key);
    counts.set(key, 0);
  }

  for (const instant of instants) {
    const key = kampalaDateKey(instant);
    const current = counts.get(key);
    // Anything outside the window is ignored rather than clamped onto an end
    // bucket, which would put a spike on the first or last day that nothing
    // actually produced.
    if (current !== undefined) counts.set(key, current + 1);
  }

  return order.map((dateKey) => ({ dateKey, count: counts.get(dateKey)! }));
}

/** The Kampala-local instant that ends the month containing `instant`. */
function nextMonthStart(instant: number): number {
  // One month on from this month's start is the exclusive upper bound for
  // "activities starting this month". Derived rather than approximated with
  // 31 days, which would pull early-next-month activities into this month.
  return kampalaMonthStart(kampalaMonthStart(instant) + 32 * DAY_MS);
}

// ── Nightly storage measurement ──────────────────────────────────────────
// The one figure on this page that is not counted live, because counting it
// means paging every object in the R2 bucket. Opening the analytics page must
// never do that, so a cron does it once a night and the page shows the figure
// with the time it was taken.

/** How many objects to pull per page. The component's own maximum is larger;
 *  this is a comfortable size for an action that is in no hurry. */
const STORAGE_PAGE_SIZE = 500;

/**
 * Measure total R2 storage and object count, and record them (spec 0011,
 * AC-10).
 *
 * Calls the R2 component's own metadata query directly rather than going
 * through `api.uploads.listMetadata`, because that export is gated by
 * `canManageChurchAdmin` and a cron carries no identity to satisfy it. The
 * component takes the bucket and credentials as arguments rather than reading
 * them itself, so this action reads the same four `R2_*` deployment variables
 * `spec/STORAGE.md` already provisions and passes them through.
 *
 * Nothing is saved until the last page has come back. A failure part way
 * through therefore leaves the previous figure and its timestamp exactly as
 * they were — a page showing yesterday's real total is useful, and a page
 * showing a partial sum as though it were the whole is actively misleading.
 */
export const measureStorage = internalAction({
  args: {},
  handler: async (ctx) => {
    const bucket = process.env.R2_BUCKET;
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      // A deployment missing these fails this cron loudly rather than
      // recording a confident zero. Every environment has them per
      // spec/STORAGE.md, so this is a misconfiguration, not a normal state.
      await reportError(ctx, new Error("R2 credentials are not configured"), {
        fn: "analytics.measureStorage",
      });
      return null;
    }

    try {
      let storageBytes = 0;
      let storageObjectCount = 0;
      let cursor: string | undefined = undefined;

      // Paged to exhaustion rather than capped: a cap would silently
      // under-report the moment the bucket outgrew it, which is the one thing
      // this figure must not do.
      for (;;) {
        const page: {
          page: { size?: number }[];
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(components.r2.lib.listMetadata, {
          bucket,
          endpoint,
          accessKeyId,
          secretAccessKey,
          limit: STORAGE_PAGE_SIZE,
          ...(cursor === undefined ? {} : { cursor }),
        });

        for (const object of page.page) {
          // The component types `size` optional, so an object whose size it
          // never recorded contributes zero rather than NaN-ing the total.
          storageBytes += object.size ?? 0;
          storageObjectCount++;
        }

        if (page.isDone) break;
        cursor = page.continueCursor;
      }

      await ctx.runMutation(internal.analytics.saveStorageUsage, {
        storageBytes,
        storageObjectCount,
      });
    } catch (error) {
      // Reported, not rethrown: the previous figure stays, with its original
      // "as of" time, and the page keeps telling the truth about how old it is.
      await reportError(ctx, error, { fn: "analytics.measureStorage" });
    }

    return null;
  },
});

/** Write the completed measurement into the single `platformMetrics` row. */
export const saveStorageUsage = internalMutation({
  args: {
    storageBytes: v.number(),
    storageObjectCount: v.number(),
  },
  handler: async (ctx, { storageBytes, storageObjectCount }) => {
    const computedAt = Date.now();
    // Exactly one row, patched in place. A row per night would be storing
    // history nothing reads: the page shows current numbers only.
    const existing = await ctx.db.query("platformMetrics").first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        storageBytes,
        storageObjectCount,
        computedAt,
      });
    } else {
      await ctx.db.insert("platformMetrics", {
        storageBytes,
        storageObjectCount,
        computedAt,
      });
    }

    return null;
  },
});
