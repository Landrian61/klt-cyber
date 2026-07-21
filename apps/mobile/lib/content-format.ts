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
