import { KAMPALA_UTC_OFFSET_MS } from "@klt-cyber/shared";

/**
 * Kampala wall clock conversions for the radio forms (spec 0019). Every
 * broadcast time is entered and shown in Kampala time whatever the browser's
 * own zone (NF-11). Kampala is a fixed UTC+3 with no DST.
 */

/** A DatePicker value (local midnight) plus `"HH:mm"`, read as Kampala time. */
export function kampalaInstant(dateValue: number, time: string): number {
  const d = new Date(dateValue);
  const [hh, mm] = time.split(":").map((n) => Number.parseInt(n, 10));
  return (
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0) -
    KAMPALA_UTC_OFFSET_MS
  );
}

/** The DatePicker value (local midnight) and `"HH:mm"` of a Kampala instant. */
export function kampalaFormParts(instant: number): { date: number; time: string } {
  const k = new Date(instant + KAMPALA_UTC_OFFSET_MS);
  const date = new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()).getTime();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date, time: `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}` };
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
