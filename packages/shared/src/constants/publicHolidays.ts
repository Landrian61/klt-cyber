/**
 * Uganda's public holidays, for shading the Year Planner.
 *
 * Three kinds, three sources:
 * - Fixed dates come from the Public Holidays Act and never move.
 * - Good Friday and Easter Monday are calculated from Easter Sunday.
 * - Eid al Fitr and Eid al Adha follow the moon and are announced by the
 *   government each year, so they cannot be calculated. They live in
 *   `EID_HOLIDAYS` below, kept by hand: when the date is announced, add or
 *   correct the row and set `confirmed: true`.
 *
 * Dates are plain "YYYY-MM-DD" calendar days, the same shape the planner keys
 * its day cells on. A holiday that falls on a weekend is shown on that day;
 * nothing here moves it to a weekday.
 */

export interface PublicHoliday {
  /** "YYYY-MM-DD". */
  date: string;
  name: string;
}

/** Holidays on the same date every year: [month 1 to 12, day, name]. */
export const UGANDA_FIXED_HOLIDAYS: readonly (readonly [number, number, string])[] = [
  [1, 1, "New Year's Day"],
  [1, 26, "NRM Liberation Day"],
  [2, 16, "Archbishop Janani Luwum Day"],
  [3, 8, "International Women's Day"],
  [5, 1, "Labour Day"],
  [6, 3, "Martyrs' Day"],
  [6, 9, "National Heroes' Day"],
  [10, 9, "Independence Day"],
  [12, 25, "Christmas Day"],
  [12, 26, "Boxing Day"],
];

/**
 * The two Eid holidays, by year. `confirmed: false` marks an estimate from the
 * expected moon sighting; replace it with the gazetted date once announced.
 */
export const EID_HOLIDAYS: readonly { date: string; name: string; confirmed: boolean }[] = [
  { date: "2026-03-20", name: "Eid al Fitr", confirmed: false },
  { date: "2026-05-27", name: "Eid al Adha", confirmed: false },
  { date: "2027-03-10", name: "Eid al Fitr", confirmed: false },
  { date: "2027-05-17", name: "Eid al Adha", confirmed: false },
];

const pad = (n: number) => String(n).padStart(2, "0");

function key(year: number, month: number, day: number): string {
  // Normalise through Date.UTC so day overflow (31 March + 1) rolls over.
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Western (Gregorian) Easter Sunday as [month 1 to 12, day]. */
export function easterSunday(year: number): [number, number] {
  // Anonymous Gregorian algorithm (Meeus, Jones, Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** Every public holiday in a year, in date order. */
export function publicHolidaysForYear(year: number): PublicHoliday[] {
  const [easterMonth, easterDay] = easterSunday(year);
  const holidays: PublicHoliday[] = [
    ...UGANDA_FIXED_HOLIDAYS.map(([month, day, name]) => ({
      date: key(year, month, day),
      name,
    })),
    { date: key(year, easterMonth, easterDay - 2), name: "Good Friday" },
    { date: key(year, easterMonth, easterDay + 1), name: "Easter Monday" },
    ...EID_HOLIDAYS.filter((h) => h.date.startsWith(`${year}-`)).map(({ date, name }) => ({
      date,
      name,
    })),
  ];
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Holidays by date for a run of years, for a calendar that looks them up per
 * day cell. Two holidays on one day are joined with " and ".
 */
export function publicHolidayMap(years: readonly number[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const year of new Set(years)) {
    for (const { date, name } of publicHolidaysForYear(year)) {
      const existing = map.get(date);
      map.set(date, existing ? `${existing} and ${name}` : name);
    }
  }
  return map;
}
