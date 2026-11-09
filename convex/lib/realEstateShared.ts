import { ConvexError } from "convex/values";
import { R2 } from "@convex-dev/r2";
import {
  E164_PHONE_REGEX,
  REAL_ESTATE_DEPARTMENT_NAME,
  RE_PHOTOS_MAX,
  RE_PHOTO_MAX_BYTES,
  isRealEstatePhotoContentType,
  type RealEstateErrorCode,
} from "@klt-cyber/shared";

import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { toR2Key } from "./media";
import {
  departmentCapabilities,
  getCurrentUser,
  requireDepartmentCapability,
  resolveDepartmentShellRole,
} from "./authz";

/**
 * Helpers shared by `convex/realEstate.ts` (floors and spaces) and
 * `convex/facilities.ts` (the grown facilities table), for spec 0018.
 *
 * Split out rather than duplicated because the two files enforce the SAME
 * rules on the same kinds of value: both carry a photo gallery with the same
 * cap and the same R2 checks, both reorder rows within a floor by the same
 * absorbing rule, and both answer to the same one department. A second copy of
 * the photo diff in particular is how a photo that only moved position ends up
 * deleted from R2 in one file and not the other.
 */

// Private to this module, exactly as `library.ts` and `lib/media.ts` keep
// theirs: the component client is cheap to construct, and exporting it would
// invite a caller to reach past the auth-gated public API in `uploads.ts`.
const r2 = new R2(components.r2);

// -- Refusal ---------------------------------------------------------------

/**
 * Refuse with a code the portal can map to a sentence.
 *
 * A `ConvexError` carrying a code rather than a prose `Error`, because the
 * wording belongs to whichever surface is showing it;
 * `realEstateErrorMessage` in `@klt-cyber/shared` is the portal's mapping.
 */
export function refuse(code: RealEstateErrorCode, message?: string): never {
  throw new ConvexError({ code, ...(message ? { message } : {}) });
}

// -- The department, and who may act on it --------------------------------

/**
 * The Real Estate department document.
 *
 * Found by name through `by_name`, from the one literal in
 * `@klt-cyber/shared`. `.first()` rather than `.unique()` deliberately:
 * Convex has no unique indexes, and a duplicate seeded row should give the
 * team a working page rather than a thrown query.
 */
export async function realEstateDepartment(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"departments"> | null> {
  return await ctx.db
    .query("departments")
    .withIndex("by_name", (q) => q.eq("name", REAL_ESTATE_DEPARTMENT_NAME))
    .first();
}

/**
 * The caller as a Real Estate operator, or null when they are not one.
 *
 * NULL rather than a throw, for every operator QUERY. These back live
 * subscriptions: a page is mounted while its session drops, or while the HOD
 * looking at it has their appointment revoked, and the server re-runs the
 * subscription in that state. It has to deliver a value the page can render as
 * "signed out" rather than an exception thrown inside a mounted `useQuery`,
 * which takes the tree down with it. That is spec 0012's rule, kept here.
 *
 * Mutations use {@link requireRealEstateOperator}, which throws: a mutation
 * reaching that point is a real violation, not a teardown race.
 */
export async function realEstateOperatorOrNull(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const department = await realEstateDepartment(ctx);
  if (!department) return null;
  const role = await resolveDepartmentShellRole(ctx, user._id, department._id);
  if (!role) return null;
  return departmentCapabilities(role, department.name).manageRealEstate
    ? { user, department, role }
    : null;
}

/**
 * Assert the caller may run Real Estate, and hand back who they are.
 *
 * This is the boundary (AC-2). The portal hides the two pages from every other
 * department and the sidebar hides them from a caller without the capability,
 * but both are convenience: a forged request lands here.
 */
export async function requireRealEstateOperator(ctx: MutationCtx) {
  const department = await realEstateDepartment(ctx);
  if (!department) {
    throw new Error(
      `The ${REAL_ESTATE_DEPARTMENT_NAME} department is not seeded, so the Tower cannot be managed yet.`,
    );
  }
  const { actor } = await requireDepartmentCapability(
    ctx,
    department._id,
    "manageRealEstate",
  );
  return { actor, department };
}

// -- Text and phone validation --------------------------------------------

/** Trim, then refuse an over-long value. An empty result reads as absent. */
export function cleanText(
  value: string | undefined,
  max: number,
  tooLong: RealEstateErrorCode,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) refuse(tooLong);
  return trimmed;
}

/**
 * A phone number in strict E.164, or undefined when the field is being cleared.
 *
 * Refuses rather than normalises here on purpose. The PORTAL normalises what
 * the operator typed, through `normalizeE164Phone`, because a human types
 * "+256 700 123 456" and refusing that on a technicality teaches nothing. By
 * the time a value reaches the server it has either been normalised or it was
 * never typed by a human at all, and guessing at that point is how a
 * congregation ends up dialling the wrong continent.
 */
export function cleanPhone(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!E164_PHONE_REGEX.test(trimmed)) refuse("REAL_ESTATE_PHONE_INVALID");
  return trimmed;
}

// -- Photos ---------------------------------------------------------------

/**
 * Validate a gallery against R2 and hand back the keys to store (AC-11).
 *
 * Every check that matters is made against what R2 REPORTS, never against what
 * the client claimed: a browser will happily post a `.pdf` renamed `.jpg` with
 * a declared content type of `image/jpeg`, and a form that enforces a 5 MB cap
 * in JavaScript is one devtools pause away from not enforcing it at all.
 *
 * Refuses a gallery over the cap, a duplicate key within one gallery (which
 * would make `photos[0]` ambiguous as a cover and waste a slot), a key R2 does
 * not know, anything over `RE_PHOTO_MAX_BYTES`, and any content type outside
 * the allowlist.
 *
 * Returns the keys unchanged and in order, because the ORDER is the data:
 * `photos[0]` is the cover, so choosing a cover is a reorder and can never
 * point at a photo that was removed.
 */
export async function validatePhotos(
  ctx: MutationCtx,
  keys: readonly string[],
): Promise<string[]> {
  if (keys.length > RE_PHOTOS_MAX) refuse("REAL_ESTATE_PHOTOS_TOO_MANY");

  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) refuse("REAL_ESTATE_PHOTO_DUPLICATE");
    seen.add(key);

    // A legacy absolute URL passes straight through, unchecked.
    //
    // These are the covers the migration copied out of `imageUrl` and the ones
    // `churchAdminSeed` writes: external images we do not own and R2 knows
    // nothing about. Running them through `getMetadata` returns null, which
    // would refuse with REAL_ESTATE_PHOTO_MISSING and make every migrated
    // facility permanently un-editable — an operator fixing a phone number
    // would be told a photo "did not finish uploading", with deleting the
    // cover as the only way out.
    //
    // There is nothing to validate: we did not accept the upload, cannot read
    // its size, and will never delete it. `resolveMediaUrl` serves it and
    // `orphanedPhotoKeys` skips it, so this is the third place that has to
    // know an absolute URL is not ours, and `toR2Key` is the one answer all
    // three use.
    if (toR2Key(key) === null) continue;

    const metadata = await r2.getMetadata(ctx, key);
    if (!metadata) refuse("REAL_ESTATE_PHOTO_MISSING");

    const size = metadata.size ?? 0;
    if (size > RE_PHOTO_MAX_BYTES) refuse("REAL_ESTATE_PHOTO_TOO_LARGE");

    const contentType = metadata.contentType ?? "";
    if (!isRealEstatePhotoContentType(contentType)) {
      refuse("REAL_ESTATE_PHOTO_TYPE_UNSUPPORTED");
    }
  }

  return [...keys];
}

/**
 * The R2 keys an edit orphans: the old gallery minus the new one, as a SET.
 *
 * Set difference rather than positional comparison, which is the whole point:
 * an operator who drags the third photo to the front has changed every index
 * in the array while orphaning nothing, and a diff that compared by position
 * would delete real photos out from under them.
 *
 * A value that is an absolute URL rather than an R2 key (a backfilled
 * `imageUrl` the migration copied in) is dropped from the result, because
 * `toR2Key` already decides that question and there is nothing in OUR bucket
 * to delete: a seeded Unsplash cover is not ours to remove, and handing one to
 * `r2.deleteObject` only produces a reported error for a delete that could
 * never have worked (AC-11).
 *
 * That filter was missing in the first cut of this function while this comment
 * already claimed it, which is the kind of gap a comment can hide: the bug only
 * becomes reachable once the migration starts copying absolute URLs into
 * `photos`, which it now correctly does.
 */
export function orphanedPhotoKeys(
  oldKeys: readonly string[] | undefined,
  newKeys: readonly string[] | undefined,
): string[] {
  if (!oldKeys || oldKeys.length === 0) return [];
  const kept = new Set(newKeys ?? []);
  return oldKeys
    .filter((key) => !kept.has(key))
    // Only real R2 keys reach the bucket.
    .filter((key) => toR2Key(key) !== null);
}

// -- Ordering -------------------------------------------------------------

/**
 * Renumber a reorder contiguously from zero, absorbing anything it missed.
 *
 * Shared by floors (AC-5) and facilities within a floor (AC-12), because both
 * want the same forgiving behaviour for the same reason.
 *
 * The ids the caller gave take positions 0..n-1 in the order given. Any row
 * that exists but was NOT in the list is APPENDED after them, keeping its
 * previous relative order. That is the interesting half: a page loaded at
 * 10:00, a second operator creating a floor at 10:01, and the first operator
 * saving a reorder at 10:02 is an ordinary Tuesday, and rejecting the whole
 * save because the list is one row out of date would lose work for no reason.
 * Absorbing the newcomer costs nothing and the operator can move it next.
 *
 * Still refuses an id that does not belong to this collection at all, or one
 * listed twice, since neither can come from a stale page: those are a
 * malformed request rather than a race, and silently dropping them would
 * renumber rows the caller never meant to touch.
 */
export function absorbingOrder<T extends { _id: Id<Table>; order?: number }, Table extends
  | "realEstateFloors"
  | "facilities">(
  existing: readonly T[],
  orderedIds: readonly Id<Table>[],
): Map<Id<Table>, number> {
  const byId = new Map<string, T>();
  for (const row of existing) byId.set(row._id, row);

  const assigned = new Map<Id<Table>, number>();
  const listed = new Set<string>();

  let position = 0;
  for (const id of orderedIds) {
    if (!byId.has(id)) refuse("REAL_ESTATE_REORDER_MISMATCH");
    if (listed.has(id)) refuse("REAL_ESTATE_REORDER_MISMATCH");
    listed.add(id);
    assigned.set(id, position);
    position += 1;
  }

  // Whatever the caller did not mention, in its previous relative order. An
  // absent `order` sorts as zero, which is the same rule the read side uses,
  // and `_id` breaks a tie so the result is stable rather than reshuffling
  // between two saves that both change nothing.
  const missed = existing
    .filter((row) => !listed.has(row._id))
    .sort((a, b) => {
      const left = a.order ?? 0;
      const right = b.order ?? 0;
      if (left !== right) return left - right;
      if (a._id === b._id) return 0;
      return a._id < b._id ? -1 : 1;
    });

  for (const row of missed) {
    assigned.set(row._id, position);
    position += 1;
  }

  return assigned;
}

/**
 * Newest first, with ties broken by `_id` descending (AC-20).
 *
 * Two rows saved in the same millisecond is not hypothetical: a seed writes a
 * batch, and a create followed immediately by an edit can land on the same
 * tick. Without a second key the two swap places between reads, so a list
 * reshuffles under the reader for no reason they can see.
 */
export function newestFirst<T extends { createdAt: number; _id: string }>(
  a: T,
  b: T,
): number {
  if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
  if (a._id === b._id) return 0;
  return a._id > b._id ? -1 : 1;
}

/**
 * Within a floor: by `order` with an absent one treated as zero, then by name.
 *
 * The name tiebreak is what makes the order STABLE while a floor is still
 * being set up (AC-18): before anyone has reordered anything, every facility
 * on a floor has no `order` at all, so without a second key the group's
 * contents would shuffle on every read.
 */
export function byFloorPosition<T extends { order?: number; name: string }>(
  a: T,
  b: T,
): number {
  const left = a.order ?? 0;
  const right = b.order ?? 0;
  if (left !== right) return left - right;
  return a.name.localeCompare(b.name);
}
