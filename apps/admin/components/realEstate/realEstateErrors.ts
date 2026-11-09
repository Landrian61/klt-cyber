import { ConvexError } from "convex/values";
import { realEstateErrorMessage } from "@klt-cyber/shared";
import { errorMessage } from "@/lib/content-helpers";

/**
 * A Real Estate refusal, as a sentence the operator can act on (spec 0018).
 *
 * The server refuses with a CODE rather than prose, because the wording
 * belongs to whichever surface is showing it. This is the portal's side of
 * that bargain: pull the code out of the `ConvexError`, map it through the
 * shared table, and fall back to the generic reader for anything that is not
 * one of ours (an authorization throw, a dropped connection).
 *
 * One refusal is composed here rather than read from the table, for the same
 * reason the Library composes two: `REAL_ESTATE_FLOOR_IN_USE` carries counts
 * the shared table cannot know, and "this floor is in use" without saying how
 * much leaves the operator to go hunting for it.
 */
export function realEstateError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as {
      code?: unknown;
      message?: unknown;
      facilityCount?: unknown;
      spaceCount?: unknown;
    } | null;

    if (data && data.code === "REAL_ESTATE_FLOOR_IN_USE") {
      const facilities =
        typeof data.facilityCount === "number" ? data.facilityCount : 0;
      const spaces = typeof data.spaceCount === "number" ? data.spaceCount : 0;
      return `${describeCounts(facilities, spaces)} still on this floor. Move them to another floor first, or hide the floor instead of deleting it.`;
    }

    // The server's own sentence wins when it sent one.
    if (data && typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
    if (data && typeof data.code === "string") {
      return realEstateErrorMessage(data.code);
    }
  }
  return errorMessage(error);
}

/** "3 facilities and 1 space are", or "1 facility is". */
function describeCounts(facilities: number, spaces: number): string {
  const parts: string[] = [];
  if (facilities > 0) {
    parts.push(`${facilities} ${facilities === 1 ? "facility" : "facilities"}`);
  }
  if (spaces > 0) {
    parts.push(`${spaces} ${spaces === 1 ? "space" : "spaces"}`);
  }
  const subject = parts.join(" and ");
  // Singular only when exactly one thing in total is in the way.
  const verb = facilities + spaces === 1 ? "is" : "are";
  return `${subject} ${verb}`;
}
