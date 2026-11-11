import { ConvexError } from "convex/values";
import { radioErrorMessage } from "@klt-cyber/shared";
import { errorMessage } from "@/lib/content-helpers";

/**
 * A radio refusal as a sentence the Media team can act on (spec 0019).
 *
 * The server refuses with a code from `RADIO_ERROR_CODES`; this maps it
 * through the shared table, and falls back to the generic reader for anything
 * that is not one of ours (an authorization throw, a dropped connection).
 */
export function radioError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown; message?: unknown } | null;
    if (data && typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
    if (data && typeof data.code === "string") {
      return radioErrorMessage(data.code);
    }
  }
  return errorMessage(error);
}
