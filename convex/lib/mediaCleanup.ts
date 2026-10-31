import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { toR2Key } from "./media";

// Scheduling the deletion of a file somebody has just replaced (spec 0014,
// AC-18). The action that does the deleting lives in convex/uploads.ts, with
// the rest of the R2 gateway — see `uploads.deleteReplacedObjects` for why it
// has to be an action and what happens when one fails.

/**
 * One media field the caller is deciding about.
 *
 * `touched` is the field that stops this helper destroying data, so it is
 * REQUIRED rather than optional. In a partial-update mutation an omitted
 * optional argument arrives as `undefined`, which is indistinguishable from
 * "the person cleared it" if you only compare `previous` with `next`. Compare
 * them anyway and you delete the photo of every member who saved their phone
 * number, while the row carries on pointing at the key you just deleted.
 *
 * So the caller has to say whether the field was in the payload at all. Only
 * the mutation knows that, which is why the decision lives there and not here.
 */
export type MediaReplacement = {
  /** Did this save actually carry this field, as a value or as a clear? */
  touched: boolean;
  /** The stored value BEFORE the patch. */
  previous: string | undefined;
  /** The value going in; `undefined` when the field is being cleared. */
  next: string | undefined;
};

/**
 * Schedule the deletion of a media value that has just been replaced.
 *
 * Does nothing when the save did not touch the field, when the value did not
 * change, when there was nothing there before, or when the previous value was
 * an absolute URL rather than one of our objects — a Google avatar is not ours
 * to delete, which is what `toR2Key` discriminates.
 */
export async function scheduleReplacedMediaCleanup(
  ctx: MutationCtx,
  previous: string | undefined,
  next: string | undefined,
  touched = true
): Promise<void> {
  await scheduleReplacedMediaCleanupMany(ctx, [{ touched, previous, next }]);
}

/** The same for several fields at once, as one scheduled action. */
export async function scheduleReplacedMediaCleanupMany(
  ctx: MutationCtx,
  fields: MediaReplacement[]
): Promise<void> {
  const keys = fields
    .filter((field) => field.touched && field.previous !== field.next)
    .map((field) => toR2Key(field.previous))
    .filter((key): key is string => key !== null);
  if (keys.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.uploads.deleteReplacedObjects, {
    keys,
  });
}
