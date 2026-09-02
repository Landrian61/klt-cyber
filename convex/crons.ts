import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// See docs/DATA_MODEL.md, Increment 7.

const crons = cronJobs();

// 06:00 UTC = 09:00 Kampala — Africa/Kampala is a fixed UTC+3 offset with no
// DST (see KAMPALA_OFFSET_MS, convex/calendar.ts), so this is simply the
// literal daily UTC time, no timezone-shift logic needed here.
crons.cron(
  "weekly program reminders",
  "0 6 * * *",
  internal.weeklyPrograms.checkWeeklyProgramReminders
);

export default crons;
