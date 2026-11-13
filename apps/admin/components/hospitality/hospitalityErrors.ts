import { ConvexError } from "convex/values";
import { hospitalityErrorMessage } from "@klt-cyber/shared";
import { errorMessage } from "@/lib/content-helpers";

/**
 * A Hospitality refusal as a sentence the operator can act on (spec 0024).
 *
 * The server refuses with a code; the wording lives in `@klt-cyber/shared`.
 * Anything that is not one of ours (an authorization throw, a dropped
 * connection) falls through to the portal's generic reader.
 */
export function hospitalityError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown } | null;
    if (data && typeof data.code === "string") {
      return hospitalityErrorMessage(data.code);
    }
  }
  return errorMessage(error);
}

/** The Kampala calendar day as "8 Nov 2026", from a `YYYY-MM-DD` key. */
export function formatDateKey(key: string | undefined): string {
  if (!key) return "Never";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A `YYYY-MM-DD` key as the DatePicker's local midnight ms, and back. */
export function keyToMs(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}
export function msToKey(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A moment as "8 Nov 2026, 10:42" in Kampala time, for history rows. */
export function formatMoment(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}
