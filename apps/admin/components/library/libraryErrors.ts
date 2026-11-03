import { ConvexError } from "convex/values";
import { libraryErrorMessage } from "@klt-cyber/shared";
import { errorMessage } from "@/lib/content-helpers";

/**
 * A Library refusal, as a sentence the operator can act on (spec 0015, AC-7).
 *
 * The server refuses with a CODE rather than prose, because the wording
 * belongs to whichever surface is showing it. This is the portal's side of
 * that bargain: pull the code out of the `ConvexError`, map it through the
 * shared table, and fall back to the generic reader for anything that is not
 * one of ours (an authorization throw, a dropped connection).
 *
 * The server's own `message` wins when it sent one, because two refusals carry
 * a number the shared table cannot know: how many items still use a category,
 * and how many copies are actually on the shelf. A generic sentence there
 * would leave the operator with nothing to do about it.
 */
export function libraryError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown; message?: unknown } | null;
    if (data && typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
    if (data && typeof data.code === "string") {
      return libraryErrorMessage(data.code);
    }
  }
  return errorMessage(error);
}
