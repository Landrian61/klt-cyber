// Display formatting for Increment 3 content (themes, programs, events,
// announcements). Program times are 24h "HH:mm" in church-local time; event
// timestamps are unix ms. Pure functions — safe anywhere.

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** 0 → "Sunday". Out-of-range indices fall back to an empty string. */
export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? '';
}

/** "17:00" → "5:00 PM". Returns the input unchanged if it isn't HH:mm. */
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${period}`;
}

/** Unix ms → "Fri, 25 Jul". */
export function formatEventDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Unix ms → "8:00 PM". */
export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Unix ms → "25 Jul 2026". */
export function formatFullDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Unix ms → a short relative label ("Just now", "5m ago", "2h ago",
 * "Yesterday", "3d ago", "2w ago"). Falls back to `formatFullDate` past
 * four weeks, where a relative label stops being useful. Used by the
 * notification center (Increment 6) in place of hand-written timestamps.
 */
export function formatRelativeTime(ms: number): string {
  const diffMs = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 2 * day) return 'Yesterday';
  if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 4 * week) return `${Math.floor(diffMs / week)}w ago`;
  return formatFullDate(ms);
}

const WEEK_OF_MONTH_LABEL: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  [-1]: 'Last',
};

/**
 * A short human label for a weekly program's recurrence, e.g. "Mon, Wed",
 * "Every 2 weeks · Fri", "Last Sun", "25 Jul 2026" (a one-time program with a
 * date set). Falls back to the legacy single `dayOfWeek` for pre-migration
 * rows, matching the fallback in convex/weeklyPrograms.ts's sort helper.
 */
export function formatProgramSchedule(program: {
  recurrence?: string;
  daysOfWeek?: number[];
  dayOfWeek?: number;
  weekOfMonth?: number;
  startDate?: number;
}): string {
  const days = program.daysOfWeek?.length
    ? program.daysOfWeek
    : program.dayOfWeek !== undefined
      ? [program.dayOfWeek]
      : [];
  const dayLabel = days.map(dayName).join(', ');

  switch (program.recurrence) {
    case 'once':
      return program.startDate ? formatFullDate(program.startDate) : dayLabel || 'One-time';
    case 'monthly': {
      const position = program.weekOfMonth !== undefined ? WEEK_OF_MONTH_LABEL[program.weekOfMonth] : undefined;
      return [position, dayLabel].filter(Boolean).join(' ') || 'Monthly';
    }
    case 'biweekly':
      return dayLabel ? `Every 2 weeks · ${dayLabel}` : 'Every 2 weeks';
    case 'weekly':
    default:
      return dayLabel || 'Weekly';
  }
}
