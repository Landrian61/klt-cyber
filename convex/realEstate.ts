import { ConvexError, v } from "convex/values";
import {
  REAL_ESTATE_LIST_CAP,
  REAL_ESTATE_TARGET_TYPES,
  RE_FLOOR_NAME_MAX_LENGTH,
  RE_SPACE_DESCRIPTION_MAX_LENGTH,
  RE_SPACE_TITLE_MAX_LENGTH,
  isFacilityIncomplete,
  isRealEstateSpaceStatus,
  isValidSpacePrice,
  isValidSpaceSize,
  normalizeFloorName,
  type RealEstateSpaceStatus,
} from "@klt-cyber/shared";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, logActivity } from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";
import {
  absorbingOrder,
  cleanPhone,
  cleanText,
  newestFirst,
  orphanedPhotoKeys,
  realEstateDepartment,
  realEstateOperatorOrNull,
  refuse,
  requireRealEstateOperator,
  validatePhotos,
} from "./lib/realEstateShared";

/**
 * The Tower of Faith's floors, and the spaces available to let (spec 0018).
 *
 * The facilities that sit ON these floors live in `convex/facilities.ts`,
 * because that table predates this feature and kept its name. The two files
 * share `convex/lib/realEstateShared.ts`, which owns the one department
 * lookup, the photo rules and the reorder rule both need.
 */

// -- Floors (RE1-01) ------------------------------------------------------

/**
 * Every floor, with how much sits on each (AC-5, AC-6).
 *
 * The counts are what make the delete button honest: AC-6 refuses a delete
 * while anything still references the floor, and an operator who can see "3
 * facilities, 1 space" before clicking does not have to discover that by being
 * refused.
 *
 * Hidden-but-not-removed rows count toward those numbers, because they are
 * still on the floor. A removed one does not: it is gone, and blocking a floor
 * delete on a row nobody can see or restore would be a dead end.
 */
export const listFloors = query({
  args: {},
  handler: async (ctx) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);

    return await Promise.all(
      floors.map(async (floor) => {
        const facilities = await ctx.db
          .query("facilities")
          .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
          .take(REAL_ESTATE_LIST_CAP);
        const spaces = await ctx.db
          .query("realEstateSpaces")
          .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
          .take(REAL_ESTATE_LIST_CAP);

        return {
          _id: floor._id,
          name: floor.name,
          order: floor.order,
          hidden: floor.hidden,
          facilityCount: facilities.filter((f) => f.deletedAt === undefined)
            .length,
          spaceCount: spaces.filter((s) => s.deletedAt === undefined).length,
        };
      }),
    );
  },
});

/**
 * The floors a new facility or space may be placed on (AC-7).
 *
 * Hidden floors are left out: offering one would let an operator place a
 * facility somewhere that is guaranteed to keep it out of the app, which is a
 * trap rather than a choice.
 */
export const listFloorOptions = query({
  args: {},
  handler: async (ctx) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);

    return floors
      .filter((floor) => !floor.hidden)
      .map((floor) => ({ _id: floor._id, name: floor.name }));
  },
});

/**
 * Whether a floor name is free, compared the way the save will compare it.
 *
 * Trimmed, lowercased, internal whitespace collapsed, by the same shared
 * `normalizeFloorName` the mutation uses — which is the point. A form that
 * normalised differently from the server would promise a name is available and
 * then watch the save fail on it.
 *
 * `exceptFloorId` lets a rename check itself without colliding with its own
 * current name.
 */
async function floorNameTaken(
  ctx: QueryCtx | MutationCtx,
  name: string,
  exceptFloorId?: Id<"realEstateFloors">,
): Promise<boolean> {
  const target = normalizeFloorName(name);
  const floors = await ctx.db
    .query("realEstateFloors")
    .withIndex("by_order")
    .take(REAL_ESTATE_LIST_CAP);
  return floors.some(
    (floor) =>
      floor._id !== exceptFloorId && normalizeFloorName(floor.name) === target,
  );
}

/** A floor's name, trimmed and checked, or a refusal. */
function cleanFloorName(name: string): string {
  const cleaned = cleanText(
    name,
    RE_FLOOR_NAME_MAX_LENGTH,
    "REAL_ESTATE_FLOOR_NAME_TOO_LONG",
  );
  if (!cleaned) refuse("REAL_ESTATE_FLOOR_NAME_REQUIRED");
  return cleaned;
}

/**
 * Add a floor, appended at the end (AC-5).
 *
 * `max(order) + 1` rather than `count`, because a floor deleted earlier leaves
 * a gap and reusing the count would collide with an existing row.
 */
export const createFloor = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);
    const cleaned = cleanFloorName(name);

    if (await floorNameTaken(ctx, cleaned)) {
      refuse("REAL_ESTATE_FLOOR_NAME_TAKEN");
    }

    const existing = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);
    const nextOrder =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((floor) => floor.order)) + 1;

    const now = Date.now();
    const floorId = await ctx.db.insert("realEstateFloors", {
      name: cleaned,
      order: nextOrder,
      hidden: false,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "floor.created",
      targetType: REAL_ESTATE_TARGET_TYPES.floor,
      targetId: floorId,
      departmentId: department._id,
      metadata: { name: cleaned },
    });

    return floorId;
  },
});

/** Rename a floor, with the same uniqueness rule as a create (AC-5). */
export const renameFloor = mutation({
  args: { floorId: v.id("realEstateFloors"), name: v.string() },
  handler: async (ctx, { floorId, name }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);
    const floor = await ctx.db.get(floorId);
    if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");

    const cleaned = cleanFloorName(name);
    if (await floorNameTaken(ctx, cleaned, floorId)) {
      refuse("REAL_ESTATE_FLOOR_NAME_TAKEN");
    }

    const previous = floor.name;
    if (previous === cleaned) return { ok: true as const };

    await ctx.db.patch(floorId, { name: cleaned, updatedAt: Date.now() });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "floor.renamed",
      targetType: REAL_ESTATE_TARGET_TYPES.floor,
      targetId: floorId,
      departmentId: department._id,
      metadata: { from: previous, to: cleaned },
    });

    return { ok: true as const };
  },
});

/**
 * Reorder the floors, absorbing any the caller's page had not seen (AC-5).
 *
 * See `absorbingOrder`: a floor created between the page load and the save is
 * appended rather than rejecting the whole reorder, because losing an
 * operator's reorder over a one-row race would be the worse outcome. No two
 * floors can share an `order` afterwards, since the renumbering is contiguous
 * from zero across every row in one transaction.
 */
export const reorderFloors = mutation({
  args: { orderedIds: v.array(v.id("realEstateFloors")) },
  handler: async (ctx, { orderedIds }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);

    const assigned = absorbingOrder(floors, orderedIds);
    const now = Date.now();
    for (const floor of floors) {
      const next = assigned.get(floor._id);
      if (next !== undefined && next !== floor.order) {
        await ctx.db.patch(floor._id, { order: next, updatedAt: now });
      }
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "floor.reordered",
      targetType: REAL_ESTATE_TARGET_TYPES.floor,
      departmentId: department._id,
      metadata: { floorCount: floors.length, listedCount: orderedIds.length },
    });

    return { ok: true as const };
  },
});

/**
 * Hide or unhide a floor (AC-7).
 *
 * Always allowed, in both directions. Hiding takes everything on the floor out
 * of the app in one move, which is the point: it is the answer to "this floor
 * is being refurbished" without unpicking every facility on it. The portal
 * keeps listing them under the floor marked "Floor hidden" so nothing is
 * stranded or invisible to the team.
 */
export const setFloorHidden = mutation({
  args: { floorId: v.id("realEstateFloors"), hidden: v.boolean() },
  handler: async (ctx, { floorId, hidden }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);
    const floor = await ctx.db.get(floorId);
    if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");

    if (floor.hidden === hidden) return { ok: true as const };

    await ctx.db.patch(floorId, { hidden, updatedAt: Date.now() });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "floor.hidden",
      targetType: REAL_ESTATE_TARGET_TYPES.floor,
      targetId: floorId,
      departmentId: department._id,
      metadata: { name: floor.name, hidden },
    });

    return { ok: true as const };
  },
});

/**
 * Delete an empty floor outright, or refuse with both counts (AC-6).
 *
 * A hard delete rather than a soft one, because a floor carries no content of
 * its own: it is pure structure, nothing references it once it is empty, and
 * there is no history on it worth keeping readable.
 *
 * The refusal carries how many facilities and how many spaces still sit there,
 * so the message can name them rather than saying "in use" and leaving the
 * operator to go hunting. Hidden rows count, since they are still on the
 * floor; removed ones do not.
 */
export const deleteFloor = mutation({
  args: { floorId: v.id("realEstateFloors") },
  handler: async (ctx, { floorId }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);
    const floor = await ctx.db.get(floorId);
    if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");

    const facilities = await ctx.db
      .query("facilities")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .take(REAL_ESTATE_LIST_CAP);
    const spaces = await ctx.db
      .query("realEstateSpaces")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .take(REAL_ESTATE_LIST_CAP);

    const facilityCount = facilities.filter((f) => f.deletedAt === undefined)
      .length;
    const spaceCount = spaces.filter((s) => s.deletedAt === undefined).length;

    if (facilityCount > 0 || spaceCount > 0) {
      // Thrown directly rather than through `refuse`, which carries only a
      // code: these two counts ARE the message, and AC-6 asks for them.
      throw new ConvexError({
        code: "REAL_ESTATE_FLOOR_IN_USE" as const,
        facilityCount,
        spaceCount,
      });
    }

    await ctx.db.delete(floorId);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "floor.deleted",
      targetType: REAL_ESTATE_TARGET_TYPES.floor,
      targetId: floorId,
      departmentId: department._id,
      metadata: { name: floor.name },
    });

    return { ok: true as const };
  },
});

// -- The responsible-person picker ----------------------------------------

/**
 * How many `users` rows the member picker scans before matching.
 *
 * Larger than REAL_ESTATE_LIST_CAP on purpose: the cap bounds what is SENT to
 * the picker, this bounds what is searched. The two were the same number
 * originally, which is what made a late joiner unfindable.
 */
const MEMBER_SCAN_CAP = 2000;

/**
 * The members an operator may name as responsible for a facility (AC-9).
 *
 * Deliberately NOT restricted to verified members: a facility can reasonably
 * be run by someone who has not finished the profile wizard, and refusing to
 * list them would push the operator into typing the name as free text and
 * losing the link to the real person.
 *
 * Returns display names only. No phone number is read or returned, which is
 * the whole reason AC-9 stores a facility's contact numbers on the FACILITY
 * rather than borrowing the responsible member's personal one.
 *
 * Capability gated like every other operator read here, because a list of the
 * congregation's names is not public.
 */
export const searchResponsibleMembers = query({
  // The search term the picker types. Without it this query returned the
  // OLDEST `REAL_ESTATE_LIST_CAP` accounts by `_creationTime` and then sorted
  // them by name, so past 200 accounts the truncation was invisible and a
  // recently joined member simply could not be found — pushing the operator
  // into typing a free text name and losing the link to the real person, which
  // is the outcome AC-9 exists to avoid.
  args: { query: v.optional(v.string()) },
  handler: async (ctx, { query: term }) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const needle = (term ?? "").trim().toLowerCase();

    // Scanned rather than indexed: there is no name index on `users`, and a
    // full text one is more than a picker for ~50 ministers needs. The scan is
    // bounded by MEMBER_SCAN_CAP, and matching happens BEFORE the result cap so
    // a late joiner is findable by typing their name even when the
    // congregation is larger than the page.
    const users = await ctx.db.query("users").take(MEMBER_SCAN_CAP);

    return users
      .map((user) => ({
        _id: user._id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim(),
      }))
      // An anonymised account has no name left to show, so it is left out of
      // the picker rather than offered as a blank row.
      .filter((user) => user.name.length > 0)
      .filter((user) => needle === "" || user.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, REAL_ESTATE_LIST_CAP);
  },
});

// -- Spaces to let (RE2-01 to RE2-04) -------------------------------------

/** The editable fields of a space, as Convex validators. */
const spaceEditableFields = {
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  floorId: v.optional(v.id("realEstateFloors")),
  // `"none"` clears, the same sentinel `facilities.floorId` uses. A number
  // field needs one just as much as an id does: `undefined` already means
  // "leave this alone", so without a sentinel a rent once entered could never
  // be taken back off a listing, and the form's own hint promises otherwise.
  sizeSqm: v.optional(v.union(v.number(), v.literal("none"))),
  priceUgxPerMonth: v.optional(v.union(v.number(), v.literal("none"))),
  photos: v.optional(v.array(v.string())),
  contactPhone: v.optional(v.string()),
  contactWhatsapp: v.optional(v.string()),
};

/** A rent, checked against AC-15's bounds, or a refusal. */
function cleanPrice(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!isValidSpacePrice(value)) refuse("REAL_ESTATE_PRICE_INVALID");
  return value;
}

/** An area, checked against AC-15's bounds, or a refusal. */
function cleanSize(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!isValidSpaceSize(value)) refuse("REAL_ESTATE_SIZE_INVALID");
  return value;
}

/**
 * Schedule the R2 cleanup for the keys an edit orphaned.
 *
 * Scheduled inside the mutation that patches, so a mutation that later throws
 * schedules nothing: the whole transaction rolls back together.
 */
async function scheduleSpaceOrphanCleanup(
  ctx: MutationCtx,
  oldKeys: readonly string[] | undefined,
  newKeys: readonly string[] | undefined,
): Promise<void> {
  const orphaned = orphanedPhotoKeys(oldKeys, newKeys);
  if (orphaned.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.uploads.deleteReplacedObjects, {
    keys: orphaned,
  });
}

/**
 * Every space the team may see, including the let ones (AC-16, AC-29).
 *
 * A `let` space stays listed here, marked "Let", precisely so it can be
 * flipped back to available without anyone retyping it. Only `photos[0]` is
 * signed; the full gallery reaches a client through `getSpace` alone.
 */
export const listSpacesForPortal = query({
  args: {},
  handler: async (ctx) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);
    const floorsById = new Map(floors.map((floor) => [floor._id, floor]));

    // Filtered in the QUERY, before the cap, so the 200 is 200 live listings.
    // Removal is a soft delete that never leaves the table, so capping first
    // would let years of removed rows crowd live ones off the page with no
    // pagination control and no signal that it had happened (AC-29).
    const live = (
      await ctx.db
        .query("realEstateSpaces")
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(REAL_ESTATE_LIST_CAP)
    ).sort(newestFirst);

    return await Promise.all(
      live.map(async (space) => {
        const floor = floorsById.get(space.floorId);
        return {
          _id: space._id,
          title: space.title,
          floorId: space.floorId,
          floorName: floor?.name,
          floorHidden: floor?.hidden ?? false,
          sizeSqm: space.sizeSqm,
          priceUgxPerMonth: space.priceUgxPerMonth,
          status: space.status as RealEstateSpaceStatus,
          coverUrl: await resolveMediaUrl(space.photos?.[0]),
          photoCount: space.photos?.length ?? 0,
          contactPhone: space.contactPhone,
          contactWhatsapp: space.contactWhatsapp,
          createdAt: space.createdAt,
        };
      }),
    );
  },
});

/** One space's full editable state, for the portal's form. */
export const getSpaceForPortal = query({
  args: { spaceId: v.string() },
  handler: async (ctx, { spaceId }) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const id = ctx.db.normalizeId("realEstateSpaces", spaceId);
    if (!id) return null;
    const space = await ctx.db.get(id);
    if (!space || space.deletedAt !== undefined) return null;

    return {
      _id: space._id,
      title: space.title,
      description: space.description,
      floorId: space.floorId,
      sizeSqm: space.sizeSqm,
      priceUgxPerMonth: space.priceUgxPerMonth,
      photos: await Promise.all(
        (space.photos ?? []).map(async (key) => ({
          key,
          url: await resolveMediaUrl(key),
        })),
      ),
      contactPhone: space.contactPhone,
      contactWhatsapp: space.contactWhatsapp,
      status: space.status as RealEstateSpaceStatus,
    };
  },
});

/**
 * List a space to let (AC-15).
 *
 * A floor is REQUIRED here, unlike on a facility: one building, so a floor
 * places a space fully, and there is no seeded draft whose validity has to be
 * preserved. Starts `available`, since listing one is the act of offering it.
 */
export const createSpace = mutation({
  args: {
    ...spaceEditableFields,
    title: v.string(),
    floorId: v.id("realEstateFloors"),
  },
  handler: async (ctx, args) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const title = cleanText(
      args.title,
      RE_SPACE_TITLE_MAX_LENGTH,
      "REAL_ESTATE_SPACE_TITLE_TOO_LONG",
    );
    if (!title) refuse("REAL_ESTATE_SPACE_TITLE_REQUIRED");

    const floor = await ctx.db.get(args.floorId);
    if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");

    const photos =
      args.photos !== undefined ? await validatePhotos(ctx, args.photos) : [];

    const now = Date.now();
    const spaceId = await ctx.db.insert("realEstateSpaces", {
      title,
      description: cleanText(
        args.description,
        RE_SPACE_DESCRIPTION_MAX_LENGTH,
        "REAL_ESTATE_SPACE_DESCRIPTION_TOO_LONG",
      ),
      floorId: args.floorId,
      sizeSqm: args.sizeSqm === "none" ? undefined : cleanSize(args.sizeSqm),
      priceUgxPerMonth:
        args.priceUgxPerMonth === "none"
          ? undefined
          : cleanPrice(args.priceUgxPerMonth),
      photos,
      contactPhone: cleanPhone(args.contactPhone),
      contactWhatsapp: cleanPhone(args.contactWhatsapp),
      status: "available",
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "space.created",
      targetType: REAL_ESTATE_TARGET_TYPES.space,
      targetId: spaceId,
      departmentId: department._id,
      metadata: { title, floorName: floor.name },
    });

    return { spaceId };
  },
});

/** Edit a space, following the same clearing convention as a facility (AC-15). */
export const updateSpace = mutation({
  args: {
    spaceId: v.id("realEstateSpaces"),
    ...spaceEditableFields,
  },
  handler: async (ctx, { spaceId, ...args }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const existing = await ctx.db.get(spaceId);
    if (!existing || existing.deletedAt !== undefined) {
      refuse("REAL_ESTATE_SPACE_NOT_FOUND");
    }

    const patch: Partial<Doc<"realEstateSpaces">> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      const title = cleanText(
        args.title,
        RE_SPACE_TITLE_MAX_LENGTH,
        "REAL_ESTATE_SPACE_TITLE_TOO_LONG",
      );
      if (!title) refuse("REAL_ESTATE_SPACE_TITLE_REQUIRED");
      patch.title = title;
    }

    if (args.description !== undefined) {
      patch.description = cleanText(
        args.description,
        RE_SPACE_DESCRIPTION_MAX_LENGTH,
        "REAL_ESTATE_SPACE_DESCRIPTION_TOO_LONG",
      );
    }

    if (args.floorId !== undefined) {
      const floor = await ctx.db.get(args.floorId);
      if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");
      patch.floorId = args.floorId;
    }

    // Zero is a recorded value, not a clear ("free" is a real rent), so only
    // the explicit `"none"` sentinel removes one.
    if (args.sizeSqm !== undefined) {
      patch.sizeSqm =
        args.sizeSqm === "none" ? undefined : cleanSize(args.sizeSqm);
    }
    if (args.priceUgxPerMonth !== undefined) {
      patch.priceUgxPerMonth =
        args.priceUgxPerMonth === "none"
          ? undefined
          : cleanPrice(args.priceUgxPerMonth);
    }

    if (args.contactPhone !== undefined) {
      patch.contactPhone = cleanPhone(args.contactPhone);
    }
    if (args.contactWhatsapp !== undefined) {
      patch.contactWhatsapp = cleanPhone(args.contactWhatsapp);
    }

    let orphanedFrom: readonly string[] | undefined;
    let orphanedTo: readonly string[] | undefined;
    if (args.photos !== undefined) {
      const photos = await validatePhotos(ctx, args.photos);
      patch.photos = photos;
      orphanedFrom = existing.photos;
      orphanedTo = photos;
    }

    await ctx.db.patch(spaceId, patch);
    await scheduleSpaceOrphanCleanup(ctx, orphanedFrom, orphanedTo);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "space.updated",
      targetType: REAL_ESTATE_TARGET_TYPES.space,
      targetId: spaceId,
      departmentId: department._id,
      metadata: { title: patch.title ?? existing.title },
    });

    return { ok: true as const };
  },
});

/**
 * Move a space between available, reserved and let (AC-16).
 *
 * All six directions are allowed, and each is logged carrying BOTH the
 * previous and the new status, because "it was let, now it is available" is
 * the one transition anyone will later want to read back out of the trail.
 */
export const setSpaceStatus = mutation({
  args: { spaceId: v.id("realEstateSpaces"), status: v.string() },
  handler: async (ctx, { spaceId, status }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    if (!isRealEstateSpaceStatus(status)) refuse("REAL_ESTATE_STATUS_INVALID");

    const space = await ctx.db.get(spaceId);
    if (!space || space.deletedAt !== undefined) {
      refuse("REAL_ESTATE_SPACE_NOT_FOUND");
    }

    const previous = space.status;
    if (previous === status) return { ok: true as const };

    await ctx.db.patch(spaceId, { status, updatedAt: Date.now() });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "space.status_changed",
      targetType: REAL_ESTATE_TARGET_TYPES.space,
      targetId: spaceId,
      departmentId: department._id,
      metadata: { title: space.title, from: previous, to: status },
    });

    return { ok: true as const };
  },
});

/** Remove a space, with the same photo cleanup and finality as a facility. */
export const removeSpace = mutation({
  args: { spaceId: v.id("realEstateSpaces") },
  handler: async (ctx, { spaceId }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const space = await ctx.db.get(spaceId);
    if (!space || space.deletedAt !== undefined) {
      refuse("REAL_ESTATE_SPACE_NOT_FOUND");
    }

    const now = Date.now();
    await ctx.db.patch(spaceId, {
      deletedAt: now,
      photos: [],
      updatedAt: now,
    });

    await scheduleSpaceOrphanCleanup(ctx, space.photos, []);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "space.removed",
      targetType: REAL_ESTATE_TARGET_TYPES.space,
      targetId: spaceId,
      departmentId: department._id,
      metadata: { title: space.title },
    });

    return { ok: true as const };
  },
});

// -- Member reads ---------------------------------------------------------

/**
 * The spaces a member may browse (AC-20).
 *
 * Reads the `available` and `reserved` ranges SEPARATELY and merges them,
 * because `by_status ["status", "createdAt"]` cannot express two statuses in
 * one read and scanning the whole table to filter would be the lazy
 * alternative. A `let` space is simply never read.
 *
 * Newest first, ties broken by `_id`, so the order is stable between reads.
 */
export const listSpacesToLet = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getCurrentUser(ctx))) return null;

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);
    const floorsById = new Map(floors.map((floor) => [floor._id, floor]));

    const ranges = await Promise.all(
      (["available", "reserved"] as const).map((status) =>
        ctx.db
          .query("realEstateSpaces")
          .withIndex("by_status", (q) => q.eq("status", status))
          // DESC: `by_status` is ["status", "createdAt"] ascending, so a plain
          // `.take()` would return the OLDEST rows in each range and the sort
          // below could only reorder what had already been fetched. Past the
          // cap that drops exactly the newest listings a member wants to see.
          .order("desc")
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .take(REAL_ESTATE_LIST_CAP),
      ),
    );

    const visible = ranges
      .flat()
      .filter((space) => {
        if (space.deletedAt !== undefined) return false;
        const floor = floorsById.get(space.floorId);
        return !!floor && !floor.hidden;
      })
      .sort(newestFirst)
      // Capped AFTER the visibility filter, per AC-29.
      .slice(0, REAL_ESTATE_LIST_CAP);

    return await Promise.all(
      visible.map(async (space) => ({
        _id: space._id,
        title: space.title,
        floorName: floorsById.get(space.floorId)?.name ?? "",
        sizeSqm: space.sizeSqm,
        priceUgxPerMonth: space.priceUgxPerMonth,
        status: space.status as RealEstateSpaceStatus,
        coverUrl: await resolveMediaUrl(space.photos?.[0]),
      })),
    );
  },
});

/**
 * One space in full, with its effective contact resolved (AC-21, AC-23).
 *
 * The fallback is PER FIELD, not all or nothing: each of `contactPhone` and
 * `contactWhatsapp` falls back independently to the Real Estate department's
 * own number, so a listing that overrides only its phone still offers
 * WhatsApp. `departments` carries one number and no separate WhatsApp field,
 * which is right here because a Ugandan mobile number serves both.
 *
 * Resolved SERVER side so the two surfaces cannot disagree about which number
 * a member is about to dial. When a field has neither an override nor a
 * fallback that button simply does not render, and when neither does, the
 * screen still shows everything else.
 */
export const getSpace = query({
  args: { spaceId: v.string() },
  handler: async (ctx, { spaceId }) => {
    if (!(await getCurrentUser(ctx))) return null;

    const id = ctx.db.normalizeId("realEstateSpaces", spaceId);
    if (!id) return null;

    const space = await ctx.db.get(id);
    if (!space) return null;
    if (space.deletedAt !== undefined) return null;
    // A let space leaves the app, so a deep link to one resolves to null and
    // the screen says it is no longer available.
    if (space.status === "let") return null;

    const floor = await ctx.db.get(space.floorId);
    if (!floor || floor.hidden) return null;

    const department = await realEstateDepartment(ctx);
    const fallback = department?.contactPhone;

    return {
      _id: space._id,
      title: space.title,
      description: space.description,
      floorName: floor.name,
      sizeSqm: space.sizeSqm,
      priceUgxPerMonth: space.priceUgxPerMonth,
      status: space.status as RealEstateSpaceStatus,
      photoUrls: (
        await Promise.all(
          (space.photos ?? []).map((key) => resolveMediaUrl(key)),
        )
      ).filter((url): url is string => !!url),
      contactPhone: space.contactPhone ?? fallback,
      contactWhatsapp: space.contactWhatsapp ?? fallback,
    };
  },
});

// -- The dashboard cards (AC-4) -------------------------------------------

/**
 * The three numbers Real Estate's dashboard shows (AC-4).
 *
 * "Facilities listed" counts every row that is not removed, hidden ones
 * INCLUDED, because this is the team's own view of their own work rather than
 * the congregation's view of the building.
 *
 * "Incomplete" is derived at read time by the shared `isFacilityIncomplete`,
 * never stored: a flag would go stale the moment someone filled the missing
 * field in. Reading it from the same shared rule the page's reason labels use
 * is what makes the card and the page agree about the same facility.
 */
export const getDashboardCards = query({
  args: {},
  handler: async (ctx) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    // Live rows only, filtered before the cap: see `listSpacesForPortal`.
    const liveFacilities = await ctx.db
      .query("facilities")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(REAL_ESTATE_LIST_CAP);

    const spaces = await ctx.db
      .query("realEstateSpaces")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(REAL_ESTATE_LIST_CAP);

    return {
      facilitiesListed: liveFacilities.length,
      incompleteCount: liveFacilities.filter((facility) =>
        isFacilityIncomplete({
          floorId: facility.floorId,
          photos: facility.photos,
          openingHours: facility.openingHours,
          contactPhone: facility.contactPhone,
          contactWhatsapp: facility.contactWhatsapp,
        }),
      ).length,
      spacesAvailable: spaces.filter((row) => row.deletedAt === undefined)
        .length,
    };
  },
});
