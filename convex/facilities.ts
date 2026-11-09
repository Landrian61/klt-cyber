import { v } from "convex/values";
import {
  REAL_ESTATE_LIST_CAP,
  REAL_ESTATE_TARGET_TYPES,
  RE_FACILITY_DESCRIPTION_MAX_LENGTH,
  RE_FACILITY_NAME_MAX_LENGTH,
  RE_FACILITY_TAGLINE_MAX_LENGTH,
  RE_SERVICES_MAX,
  RE_SERVICE_MAX_LENGTH,
  facilityHiddenReason,
  openingHoursError,
} from "@klt-cyber/shared";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, logActivity } from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";
import {
  absorbingOrder,
  byFloorPosition,
  cleanPhone,
  cleanText,
  orphanedPhotoKeys,
  realEstateOperatorOrNull,
  refuse,
  requireRealEstateOperator,
  validatePhotos,
} from "./lib/realEstateShared";

/**
 * The Tower of Faith facilities directory (spec 0018, RE1-02 to RE1-06).
 *
 * This table predates the Real Estate feature and kept its name; the floors it
 * sits on and the spaces to let beside it live in `convex/realEstate.ts`.
 *
 * Authority moved here from Administration (AC-2): `createFacility` and
 * `updateFacility` used to call `canManageChurchAdmin` and now require
 * `manageRealEstate`, scoped to the Real Estate department. An Administration
 * HOD holding no Real Estate role is refused, deliberately and with no
 * replacement view — that is SRS 4.14.1.
 */

// -- Field validators ----------------------------------------------------

/**
 * The editable fields, as Convex validators.
 *
 * `floorId` is `v.union(v.id(...), v.literal("none"))` rather than a nullable
 * id, because a Convex id validator will not accept null and the feature still
 * needs a way to say "take this facility off its floor". The literal `"none"`
 * is that way (AC-8). Without this spelled out, "unpublish by clearing the
 * floor" has no defined behaviour at all.
 */
const facilityEditableFields = {
  name: v.optional(v.string()),
  tagline: v.optional(v.string()),
  description: v.optional(v.string()),
  servicesOffered: v.optional(v.array(v.string())),
  floorId: v.optional(v.union(v.id("realEstateFloors"), v.literal("none"))),
  photos: v.optional(v.array(v.string())),
  contactPhone: v.optional(v.string()),
  contactWhatsapp: v.optional(v.string()),
  responsibleUserId: v.optional(v.union(v.id("users"), v.literal("none"))),
  contactPerson: v.optional(v.string()),
  openingHours: v.optional(
    v.array(
      v.object({
        weekday: v.number(),
        closed: v.boolean(),
        openMinutes: v.optional(v.number()),
        closeMinutes: v.optional(v.number()),
      }),
    ),
  ),
};

/**
 * A member's display name, or "A former member" when there is nothing left.
 *
 * Deliberately NOT `displayName` from `lib/roleNotices.ts`, which falls back
 * to the user's EMAIL ADDRESS. That is right for an internal notice to a
 * role-holder and quite wrong here: this name is shown to the whole
 * congregation on a public facility screen, so an account with no name must
 * read as a former member rather than quietly publish an email address.
 *
 * Same wording and same arithmetic as `departmentShell.ts`'s activity feed,
 * because account deletion anonymises rather than removes and both surfaces
 * are describing the same absence.
 */
function memberName(user: Doc<"users">): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name === "" ? "A former member" : name;
}

/** The weekday entries, validated against AC-10's rules or refused. */
function cleanOpeningHours(
  entries: Array<{
    weekday: number;
    closed: boolean;
    openMinutes?: number;
    closeMinutes?: number;
  }>,
) {
  // `openingHoursError` is the shared rule, so the portal's editor and this
  // mutation refuse for the same reason with the same words.
  const error = openingHoursError(
    entries as Parameters<typeof openingHoursError>[0],
  );
  if (error) refuse(error);
  return entries;
}

/** The services list, trimmed, with blanks dropped and both caps applied. */
function cleanServices(values: string[]): string[] {
  const cleaned = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (cleaned.length > RE_SERVICES_MAX) refuse("REAL_ESTATE_SERVICES_TOO_MANY");
  for (const value of cleaned) {
    if (value.length > RE_SERVICE_MAX_LENGTH) {
      refuse("REAL_ESTATE_SERVICE_TOO_LONG");
    }
  }
  return cleaned;
}

/**
 * The next position on a floor: `max(order) + 1` among the rows already there.
 *
 * `max + 1` rather than a count, because a removed facility leaves a gap and
 * reusing the count would collide with a row that is still present.
 */
async function nextOrderOnFloor(
  ctx: MutationCtx,
  floorId: Id<"realEstateFloors">,
): Promise<number> {
  const siblings = await ctx.db
    .query("facilities")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .take(REAL_ESTATE_LIST_CAP);
  const live = siblings.filter((row) => row.deletedAt === undefined);
  return live.length === 0
    ? 0
    : Math.max(...live.map((row) => row.order ?? 0)) + 1;
}

/**
 * Close the gap a facility left when it moved off a floor (AC-12).
 *
 * Renumbered in the SAME mutation as the move, so a floor is never left with a
 * hole in its ordering that a later reorder would have to guess about.
 */
async function renumberFloor(
  ctx: MutationCtx,
  floorId: Id<"realEstateFloors">,
  now: number,
): Promise<void> {
  const siblings = await ctx.db
    .query("facilities")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .take(REAL_ESTATE_LIST_CAP);
  const live = siblings
    .filter((row) => row.deletedAt === undefined)
    .sort(byFloorPosition);

  for (const [index, row] of live.entries()) {
    if (row.order !== index) {
      await ctx.db.patch(row._id, { order: index, updatedAt: now });
    }
  }
}

/**
 * Schedule the R2 cleanup for the keys an edit or a removal orphaned.
 *
 * Scheduled INSIDE the mutation that patches, which is what makes it safe: a
 * mutation that later throws schedules nothing, because the whole transaction
 * rolls back. Doing it after the mutation returned would delete objects for a
 * write that never landed.
 */
async function scheduleOrphanCleanup(
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

// -- Operator reads ------------------------------------------------------

/**
 * Every facility the team may see, grouped by floor (AC-7, AC-27, AC-29).
 *
 * Carries MORE than the member query on purpose: hidden rows, unplaced drafts,
 * rows on a hidden floor, and the reason each one is not in the app. That is
 * the whole job of this page — nothing should be stranded or invisible to the
 * people responsible for finishing it.
 *
 * Only `photos[0]` is resolved to a signed URL. The full gallery reaches a
 * client only through `getFacility`, so a surface rendering one thumbnail is
 * not sent six signed URLs it will not use (AC-23).
 *
 * The cap is applied AFTER the visibility grouping rather than before, per
 * AC-29: truncating first would silently drop rows the operator needs to see.
 */
export const listForPortal = query({
  args: {},
  handler: async (ctx) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);
    const floorsById = new Map(floors.map((floor) => [floor._id, floor]));

    // Filtered before the cap, so the 200 is 200 LIVE facilities. Removal is a
    // soft delete that never leaves the table, so capping first would let
    // removed rows crowd live ones off the page with no signal (AC-29).
    const live = await ctx.db
      .query("facilities")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(REAL_ESTATE_LIST_CAP);

    const rows = await Promise.all(
      live.map(async (facility) => {
        const floor = facility.floorId
          ? floorsById.get(facility.floorId)
          : undefined;
        return {
          _id: facility._id,
          name: facility.name,
          tagline: facility.tagline,
          floorId: facility.floorId,
          floorName: floor?.name,
          order: facility.order,
          active: facility.active,
          coverUrl: await resolveMediaUrl(facility.photos?.[0]),
          photoCount: facility.photos?.length ?? 0,
          hasOpeningHours: (facility.openingHours?.length ?? 0) > 0,
          contactPhone: facility.contactPhone,
          contactWhatsapp: facility.contactWhatsapp,
          // The one rule, from `@klt-cyber/shared`, so this label and the
          // member query's filter and the dashboard's count cannot disagree
          // about the same facility.
          hiddenReason: facilityHiddenReason({
            active: facility.active,
            floorId: facility.floorId,
            floorHidden: floor?.hidden ?? false,
            contactPhone: facility.contactPhone,
            contactWhatsapp: facility.contactWhatsapp,
          }),
        };
      }),
    );

    // Grouped the way the page renders: floors in their own order, then the
    // unplaced drafts last under "Not yet placed" (AC-27). A seeded draft is
    // visibly unfinished rather than missing from the page entirely.
    const groups = floors.map((floor) => ({
      floorId: floor._id as Id<"realEstateFloors"> | null,
      floorName: floor.name,
      floorHidden: floor.hidden,
      facilities: rows
        .filter((row) => row.floorId === floor._id)
        .sort(byFloorPosition),
    }));

    const unplaced = rows
      .filter((row) => !row.floorId)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (unplaced.length > 0) {
      groups.push({
        floorId: null,
        floorName: "Not yet placed",
        floorHidden: false,
        facilities: unplaced,
      });
    }

    return groups;
  },
});

/** One facility's full editable state, for the portal's form. */
export const getForPortal = query({
  args: { facilityId: v.string() },
  handler: async (ctx, { facilityId }) => {
    const operator = await realEstateOperatorOrNull(ctx);
    if (!operator) return null;

    const id = ctx.db.normalizeId("facilities", facilityId);
    if (!id) return null;
    const facility = await ctx.db.get(id);
    if (!facility || facility.deletedAt !== undefined) return null;

    const responsible = facility.responsibleUserId
      ? await ctx.db.get(facility.responsibleUserId)
      : null;

    return {
      _id: facility._id,
      name: facility.name,
      tagline: facility.tagline,
      description: facility.description,
      servicesOffered: facility.servicesOffered ?? [],
      floorId: facility.floorId,
      photos: await Promise.all(
        (facility.photos ?? []).map(async (key) => ({
          key,
          url: await resolveMediaUrl(key),
        })),
      ),
      contactPhone: facility.contactPhone,
      contactWhatsapp: facility.contactWhatsapp,
      responsibleUserId: facility.responsibleUserId,
      responsibleUserName: responsible ? memberName(responsible) : undefined,
      contactPerson: facility.contactPerson,
      openingHours: facility.openingHours ?? [],
      active: facility.active,
    };
  },
});

// -- Operator writes -----------------------------------------------------

/**
 * Add a facility (AC-8).
 *
 * Starts `active: true`, because an operator filling in this form is
 * publishing. Only the seed writes `active: false`, and only because it is
 * writing a name with nothing else attached to it.
 *
 * Note that publishing is not the same as being visible: a facility with no
 * contact number is `active` and still absent from the app, by AC-18's
 * read-time gate. That separation is what lets an operator save work in
 * progress instead of being refused until every field is filled.
 */
export const createFacility = mutation({
  args: {
    // Spread first, then `name`, so the required string wins over the optional
    // one in the shared editable set rather than being overwritten by it.
    ...facilityEditableFields,
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const name = cleanText(
      args.name,
      RE_FACILITY_NAME_MAX_LENGTH,
      "REAL_ESTATE_FACILITY_NAME_TOO_LONG",
    );
    if (!name) refuse("REAL_ESTATE_FACILITY_NAME_REQUIRED");

    // Mutually exclusive, and refused only when ONE call sets both at once —
    // the normal path clears the other instead, so an operator switching from
    // a typed name to a chosen member is never refused (AC-9).
    const choosingUser =
      args.responsibleUserId !== undefined && args.responsibleUserId !== "none";
    const typingName =
      args.contactPerson !== undefined && args.contactPerson.trim() !== "";
    if (choosingUser && typingName) {
      refuse("REAL_ESTATE_RESPONSIBLE_AMBIGUOUS");
    }

    if (choosingUser) {
      const responsible = await ctx.db.get(
        args.responsibleUserId as Id<"users">,
      );
      if (!responsible) refuse("REAL_ESTATE_RESPONSIBLE_NOT_FOUND");
    }

    const floorId =
      args.floorId !== undefined && args.floorId !== "none"
        ? (args.floorId as Id<"realEstateFloors">)
        : undefined;
    if (floorId) {
      const floor = await ctx.db.get(floorId);
      if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");
    }

    const photos =
      args.photos !== undefined ? await validatePhotos(ctx, args.photos) : [];

    const now = Date.now();
    const facilityId = await ctx.db.insert("facilities", {
      name,
      tagline: cleanText(
        args.tagline,
        RE_FACILITY_TAGLINE_MAX_LENGTH,
        "REAL_ESTATE_TAGLINE_TOO_LONG",
      ),
      description: cleanText(
        args.description,
        RE_FACILITY_DESCRIPTION_MAX_LENGTH,
        "REAL_ESTATE_DESCRIPTION_TOO_LONG",
      ),
      servicesOffered:
        args.servicesOffered !== undefined
          ? cleanServices(args.servicesOffered)
          : undefined,
      floorId,
      order: floorId ? await nextOrderOnFloor(ctx, floorId) : undefined,
      photos,
      contactPhone: cleanPhone(args.contactPhone),
      contactWhatsapp: cleanPhone(args.contactWhatsapp),
      responsibleUserId: choosingUser
        ? (args.responsibleUserId as Id<"users">)
        : undefined,
      contactPerson: typingName
        ? cleanText(
            args.contactPerson,
            RE_FACILITY_NAME_MAX_LENGTH,
            "REAL_ESTATE_FACILITY_NAME_TOO_LONG",
          )
        : undefined,
      openingHours:
        args.openingHours !== undefined
          ? cleanOpeningHours(args.openingHours)
          : undefined,
      active: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      // Unchanged from before spec 0018, so rows already written stay readable.
      action: "facility.created",
      targetType: REAL_ESTATE_TARGET_TYPES.facility,
      targetId: facilityId,
      departmentId: department._id,
      metadata: { name },
    });

    return { facilityId };
  },
});

/**
 * Edit a facility (AC-8, AC-9, AC-11, AC-12).
 *
 * Clearing follows spec 0015's convention rather than inventing a second one:
 * an argument left `undefined` means "leave this alone", an empty string
 * clears a string field, an empty array clears `photos` or `servicesOffered`,
 * and `floorId` is cleared by the literal `"none"`.
 */
export const updateFacility = mutation({
  args: {
    facilityId: v.id("facilities"),
    ...facilityEditableFields,
  },
  handler: async (ctx, { facilityId, ...args }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const existing = await ctx.db.get(facilityId);
    // A removed facility refuses every later mutation, so it can never be
    // edited back into existence with its photos already gone from R2 (AC-13).
    if (!existing || existing.deletedAt !== undefined) {
      refuse("REAL_ESTATE_FACILITY_NOT_FOUND");
    }

    const patch: Partial<Doc<"facilities">> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = cleanText(
        args.name,
        RE_FACILITY_NAME_MAX_LENGTH,
        "REAL_ESTATE_FACILITY_NAME_TOO_LONG",
      );
      if (!name) refuse("REAL_ESTATE_FACILITY_NAME_REQUIRED");
      patch.name = name;
    }

    if (args.tagline !== undefined) {
      patch.tagline = cleanText(
        args.tagline,
        RE_FACILITY_TAGLINE_MAX_LENGTH,
        "REAL_ESTATE_TAGLINE_TOO_LONG",
      );
    }

    if (args.description !== undefined) {
      patch.description = cleanText(
        args.description,
        RE_FACILITY_DESCRIPTION_MAX_LENGTH,
        "REAL_ESTATE_DESCRIPTION_TOO_LONG",
      );
    }

    if (args.servicesOffered !== undefined) {
      const cleaned = cleanServices(args.servicesOffered);
      patch.servicesOffered = cleaned.length > 0 ? cleaned : undefined;
    }

    if (args.contactPhone !== undefined) {
      patch.contactPhone = cleanPhone(args.contactPhone);
    }
    if (args.contactWhatsapp !== undefined) {
      patch.contactWhatsapp = cleanPhone(args.contactWhatsapp);
    }

    if (args.openingHours !== undefined) {
      patch.openingHours =
        args.openingHours.length > 0
          ? cleanOpeningHours(args.openingHours)
          : undefined;
    }

    // The responsible person. Setting either side clears the other, so the
    // normal path never refuses; only one call setting both at once does.
    const settingUser =
      args.responsibleUserId !== undefined && args.responsibleUserId !== "none";
    const settingName =
      args.contactPerson !== undefined && args.contactPerson.trim() !== "";
    if (settingUser && settingName) {
      refuse("REAL_ESTATE_RESPONSIBLE_AMBIGUOUS");
    }
    if (settingUser) {
      const responsible = await ctx.db.get(
        args.responsibleUserId as Id<"users">,
      );
      if (!responsible) refuse("REAL_ESTATE_RESPONSIBLE_NOT_FOUND");
      patch.responsibleUserId = args.responsibleUserId as Id<"users">;
      patch.contactPerson = undefined;
    } else if (settingName) {
      patch.contactPerson = cleanText(
        args.contactPerson,
        RE_FACILITY_NAME_MAX_LENGTH,
        "REAL_ESTATE_FACILITY_NAME_TOO_LONG",
      );
      patch.responsibleUserId = undefined;
    } else {
      // An explicit clear of either one, without setting the other.
      if (args.responsibleUserId === "none") patch.responsibleUserId = undefined;
      if (args.contactPerson !== undefined && args.contactPerson.trim() === "") {
        patch.contactPerson = undefined;
      }
    }

    // Photos. Validate the new gallery BEFORE scheduling any delete, so a
    // refused edit never takes an object with it.
    let orphanedFrom: readonly string[] | undefined;
    let orphanedTo: readonly string[] | undefined;
    if (args.photos !== undefined) {
      const photos = await validatePhotos(ctx, args.photos);
      patch.photos = photos;
      orphanedFrom = existing.photos;
      orphanedTo = photos;
    }

    // The floor. Moving to another floor appends at the new floor's end and
    // renumbers the one left behind, both in this transaction (AC-12).
    const previousFloorId = existing.floorId;
    let movedOffFloor: Id<"realEstateFloors"> | undefined;
    if (args.floorId !== undefined) {
      if (args.floorId === "none") {
        patch.floorId = undefined;
        patch.order = undefined;
        if (previousFloorId) movedOffFloor = previousFloorId;
      } else {
        const nextFloorId = args.floorId as Id<"realEstateFloors">;
        const floor = await ctx.db.get(nextFloorId);
        if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");
        if (nextFloorId !== previousFloorId) {
          patch.floorId = nextFloorId;
          patch.order = await nextOrderOnFloor(ctx, nextFloorId);
          if (previousFloorId) movedOffFloor = previousFloorId;
        }
      }
    }

    await ctx.db.patch(facilityId, patch);

    if (movedOffFloor) {
      await renumberFloor(ctx, movedOffFloor, patch.updatedAt as number);
    }

    // Only the keys the new gallery dropped, as a set difference, so a photo
    // that merely moved position is never deleted (AC-11).
    await scheduleOrphanCleanup(ctx, orphanedFrom, orphanedTo);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.updated",
      targetType: REAL_ESTATE_TARGET_TYPES.facility,
      targetId: facilityId,
      departmentId: department._id,
      metadata: { name: patch.name ?? existing.name },
    });

    return { ok: true as const };
  },
});

/** Reorder the facilities on one floor, absorbing any it missed (AC-12). */
export const reorderFacilities = mutation({
  args: {
    floorId: v.id("realEstateFloors"),
    orderedIds: v.array(v.id("facilities")),
  },
  handler: async (ctx, { floorId, orderedIds }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const floor = await ctx.db.get(floorId);
    if (!floor) refuse("REAL_ESTATE_FLOOR_NOT_FOUND");

    const siblings = await ctx.db
      .query("facilities")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .take(REAL_ESTATE_LIST_CAP);
    const live = siblings.filter((row) => row.deletedAt === undefined);

    const assigned = absorbingOrder(live, orderedIds);
    const now = Date.now();
    for (const row of live) {
      const next = assigned.get(row._id);
      if (next !== undefined && next !== row.order) {
        await ctx.db.patch(row._id, { order: next, updatedAt: now });
      }
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.reordered",
      targetType: REAL_ESTATE_TARGET_TYPES.facility,
      departmentId: department._id,
      metadata: {
        floorId,
        floorName: floor.name,
        facilityCount: live.length,
      },
    });

    return { ok: true as const };
  },
});

/**
 * Hide or unhide a facility (AC-13).
 *
 * Replaces the old `archiveFacility`, which conflated hiding with deleting.
 *
 * Unhiding ALWAYS succeeds and never checks completeness. Visibility is
 * derived on read from AC-18's conditions and nothing else, so an operator can
 * publish a half-finished facility and simply see that it is not live yet,
 * rather than being blocked from saving until it is perfect.
 */
export const setFacilityHidden = mutation({
  args: { facilityId: v.id("facilities"), hidden: v.boolean() },
  handler: async (ctx, { facilityId, hidden }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const facility = await ctx.db.get(facilityId);
    if (!facility || facility.deletedAt !== undefined) {
      refuse("REAL_ESTATE_FACILITY_NOT_FOUND");
    }

    if (facility.active === !hidden) return { ok: true as const };

    await ctx.db.patch(facilityId, { active: !hidden, updatedAt: Date.now() });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.hidden",
      targetType: REAL_ESTATE_TARGET_TYPES.facility,
      targetId: facilityId,
      departmentId: department._id,
      metadata: { name: facility.name, hidden },
    });

    return { ok: true as const };
  },
});

/**
 * Remove a facility (AC-13).
 *
 * Sets `deletedAt`, schedules the R2 cleanup for every photo and clears
 * `photos`, while the ROW stays readable so its activity log entries still
 * resolve to something. Terminal: every later mutation refuses.
 */
export const removeFacility = mutation({
  args: { facilityId: v.id("facilities") },
  handler: async (ctx, { facilityId }) => {
    const { actor, department } = await requireRealEstateOperator(ctx);

    const facility = await ctx.db.get(facilityId);
    if (!facility || facility.deletedAt !== undefined) {
      refuse("REAL_ESTATE_FACILITY_NOT_FOUND");
    }

    const now = Date.now();
    await ctx.db.patch(facilityId, {
      deletedAt: now,
      photos: [],
      updatedAt: now,
    });

    // Every key it held, since nothing keeps any of them now.
    await scheduleOrphanCleanup(ctx, facility.photos, []);

    if (facility.floorId) {
      await renumberFloor(ctx, facility.floorId, now);
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "facility.removed",
      targetType: REAL_ESTATE_TARGET_TYPES.facility,
      targetId: facilityId,
      departmentId: department._id,
      metadata: { name: facility.name },
    });

    return { ok: true as const };
  },
});

// -- Member reads --------------------------------------------------------

/**
 * The Tower as the congregation browses it, grouped by floor (AC-18, AC-29).
 *
 * Open to any signed in user, visitor or member: what it exposes is public
 * church information, a facility's published desk number, its photos and its
 * hours. Returns null with no session, per F3-08.
 *
 * A facility reaches this list only when ALL of these hold: `active`, no
 * `deletedAt`, a `floorId`, that floor not hidden, and at least one contact
 * number. Opening hours are deliberately NOT part of the gate — a facility
 * with none still reaches the app and reads "Hours not listed", because
 * labelling an unknown schedule "Closed" tells the member something false.
 *
 * The open status is NOT computed here. `openingHours` is the data and
 * `isFacilityOpenNow` in `@klt-cyber/shared` does the rest on the client,
 * because a Convex query result caches on its arguments and a server-computed
 * flag would not flip as the clock passed closing time.
 */
export const listTowerFacilities = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getCurrentUser(ctx))) return null;

    const floors = await ctx.db
      .query("realEstateFloors")
      .withIndex("by_order")
      .take(REAL_ESTATE_LIST_CAP);
    const visibleFloors = floors.filter((floor) => !floor.hidden);

    const all = await ctx.db
      .query("facilities")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(REAL_ESTATE_LIST_CAP);

    const groups = await Promise.all(
      visibleFloors.map(async (floor) => {
        const onFloor = all
          .filter(
            (facility) =>
              facility.deletedAt === undefined &&
              facility.floorId === floor._id &&
              // One number is enough; a facility with neither would offer the
              // member a card that cannot be acted on.
              (!!facility.contactPhone || !!facility.contactWhatsapp),
          )
          .sort(byFloorPosition);

        return {
          floorId: floor._id,
          floorName: floor.name,
          facilities: await Promise.all(
            onFloor.map(async (facility) => ({
              _id: facility._id,
              name: facility.name,
              tagline: facility.tagline,
              // Only the cover is signed on a list (AC-23).
              coverUrl: await resolveMediaUrl(facility.photos?.[0]),
              openingHours: facility.openingHours,
            })),
          ),
        };
      }),
    );

    // A floor with nothing visible on it is left out rather than rendered as
    // an empty header, which would read as a mistake to the member.
    return groups.filter((group) => group.facilities.length > 0);
  },
});

/**
 * One facility in full, or null (AC-19, AC-23).
 *
 * Null rather than a throw for every absent case: hidden, removed, unplaced,
 * on a hidden floor, or a malformed id. The id arrives as a string and is
 * resolved with `normalizeId`, so a malformed one is a null the screen can say
 * "no longer available" about, rather than a thrown argument validation error
 * that takes the tree down.
 */
export const getFacility = query({
  args: { facilityId: v.string() },
  handler: async (ctx, { facilityId }) => {
    if (!(await getCurrentUser(ctx))) return null;

    const id = ctx.db.normalizeId("facilities", facilityId);
    if (!id) return null;

    const facility = await ctx.db.get(id);
    if (!facility) return null;
    if (facility.deletedAt !== undefined) return null;
    if (!facility.active) return null;
    if (!facility.floorId) return null;
    if (!facility.contactPhone && !facility.contactWhatsapp) return null;

    const floor = await ctx.db.get(facility.floorId);
    if (!floor || floor.hidden) return null;

    // The responsible person's DISPLAY NAME only, never their personal number:
    // AC-9 keeps contact numbers on the facility precisely so this join cannot
    // leak one. A row that has been anonymised by account deletion, or has no
    // name left, reads as "a former member" rather than blank — the same
    // wording spec 0015 uses for a deleted stock actor.
    let responsibleName: string | undefined;
    if (facility.responsibleUserId) {
      const responsible = await ctx.db.get(facility.responsibleUserId);
      responsibleName = responsible ? memberName(responsible) : "A former member";
    } else if (facility.contactPerson) {
      responsibleName = facility.contactPerson;
    }

    return {
      _id: facility._id,
      name: facility.name,
      tagline: facility.tagline,
      description: facility.description,
      servicesOffered: facility.servicesOffered ?? [],
      floorName: floor.name,
      // The full gallery is signed only here, never on a list (AC-23).
      photoUrls: (
        await Promise.all(
          (facility.photos ?? []).map((key) => resolveMediaUrl(key)),
        )
      ).filter((url): url is string => !!url),
      responsibleName,
      contactPhone: facility.contactPhone,
      contactWhatsapp: facility.contactWhatsapp,
      openingHours: facility.openingHours,
    };
  },
});
