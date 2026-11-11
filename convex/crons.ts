import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 06:00 UTC = 09:00 Kampala — Africa/Kampala is a fixed UTC+3 offset with no
// DST (see KAMPALA_OFFSET_MS, convex/calendar.ts), so this is simply the
// literal daily UTC time, no timezone-shift logic needed here.
crons.cron(
  "weekly program reminders",
  "0 6 * * *",
  internal.weeklyPrograms.checkWeeklyProgramReminders
);

// Hourly, not daily: until the Better Auth identity behind a deleted account
// is destroyed, that account still holds the person's real name and email
// after they asked for both to go, and their address stays unavailable for a
// fresh sign up (AC-11, AC-18). An hour is how long that state is allowed to
// last. Cheap enough to run that often — `pendingIdentityDeletes` reads
// through `by_identityDeletePending` and normally returns nothing, and the
// sweep is safe to run as often as you like, since an account whose identity
// is already gone simply has its flag cleared. Offset off the hour to stay
// clear of whatever else lands at :00.
crons.cron(
  "account deletion identity retry",
  "17 * * * *",
  internal.accountDeletion.retryIdentityDelete
);

// 02:10 UTC = 05:10 Kampala — the quietest hour, and the one job here that
// reads the whole storage bucket (spec 0011, AC-10). Offset off the hour for
// the same reason the retry sweep is: nothing else should land at :00.
crons.cron(
  "platform storage measurement",
  "10 2 * * *",
  internal.analytics.measureStorage
);

// 06:30 UTC = 09:30 Kampala — half an hour after the weekly program reminders,
// so two unrelated notification jobs do not fire into the same minute. The
// stages this sweep fires are thresholds, not exact days, so a sweep that
// misses a run fires once and late rather than losing the notice (AC-14).
crons.cron(
  "cost renewal reminders",
  "30 6 * * *",
  internal.costs.checkRenewalReminders
);

// 01:30 UTC = 04:30 Kampala. The rate source refreshes just after midnight
// UTC, so this reads a figure that is already a few minutes old rather than
// racing its publication (spec 0011). Before the storage job, because it is a
// single small request and should not queue behind a full bucket walk.
crons.cron(
  "usd to ugx exchange rate",
  "30 1 * * *",
  internal.exchangeRates.fetchUsdToUgx
);

// The radio stream probe (spec 0019, AC-5). Every minute, around the clock:
// the status has to be true at 3AM on a Tuesday during Super T as much as at
// a Sunday service. While the stream is Live or a broadcast window is open,
// that same run schedules two more probes at twenty and forty seconds, so a
// member sees a change within about twenty seconds during a broadcast and
// within a minute otherwise. Those two never schedule more, so a probe that
// throws costs one reading and the next minute starts the loop again.
crons.interval(
  "radio stream probe",
  { minutes: 1 },
  internal.radio.probeStream,
  { scheduleBurst: true }
);

// The nightly broadcast materialisation (spec 0019, AC-19). 21:30 UTC is
// 00:30 Kampala, just after the Kampala day turns, so the newly reachable
// seventh day is written ahead first thing. Insert only and idempotent.
crons.cron(
  "radio broadcast materialisation",
  "30 21 * * *",
  internal.radio.materialiseBroadcasts
);

// The listening sweep (spec 0019, AC-13). Every minute, so a phone that died
// or was force quit is closed within about two and a half minutes of its
// last beat, credited only up to that last beat.
crons.interval("radio listening sweep", { minutes: 1 }, internal.radio.sweepListening);

// The Radio inbox notice, N34 (spec 0019, AC-30). Hourly at twenty past,
// off the hour like every other job here. Each broadcast with new items gets
// one count to Pastoral's HOD and delegates, and its watermark moves in the
// same write, so a repeated run sends nothing twice.
crons.cron("radio inbox digest", "20 * * * *", internal.radioInbox.sendInboxDigest);

export default crons;
