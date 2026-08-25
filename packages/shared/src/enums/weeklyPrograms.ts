// Weekly Program recurrence model. See docs/DATA_MODEL.md `weeklyPrograms`
// and convex/lib/recurrence.ts for how these drive occurrence expansion.
export const RECURRENCE_TYPES = ["once", "weekly", "biweekly", "monthly"] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

// Weekday-position within a month, for "monthly" recurrence (e.g. "the first
// Sunday", "the last Friday"). -1 means "last" rather than a fixed position,
// since month length varies.
export const WEEK_OF_MONTH_POSITIONS = [1, 2, 3, 4, -1] as const;
export type WeekOfMonth = (typeof WEEK_OF_MONTH_POSITIONS)[number];
