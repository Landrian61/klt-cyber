import { E164_PHONE_REGEX } from "@klt-cyber/shared";

import { internalMutation, internalQuery } from "./_generated/server";
import { toR2Key } from "./lib/media";

/**
 * The one-off backfill spec 0018 ships beside its single schema push (AC-25).
 *
 * Run once per deployment, after the schema that adds `photos`, `order` and
 * the rest lands:
 *
 *   pnpm exec convex run realEstateMigration:backfillFacilityPhotos
 *
 * Three jobs, each independent, none destructive:
 *
 * 1. Copy a facility's legacy `imageUrl` into `photos[0]`, so the one picture
 *    the old directory held survives into the gallery.
 * 2. Stamp an `order` on every row, from `_creationTime` ascending across the
 *    whole table, since no facility has a floor yet and a stable starting
 *    order beats an arbitrary one.
 * 3. REPORT, without rewriting, any `contactPhone` that fails the strict
 *    E.164 regex the feature now enforces.
 *
 * Why the third is a report and not a fix: a loose number like
 * "0700 123 456" cannot be turned into E.164 without guessing the country,
 * and guessing the country is how a congregation ends up dialling the wrong
 * continent. `normalizeE164Phone` deliberately refuses rather than guesses, so
 * the only honest move here is to name the rows and let Real Estate correct
 * them on first edit — knowing about them up front rather than meeting them
 * one at a time.
 *
 * Idempotent in all three jobs: a row that already has `photos` is left alone,
 * a row that already has an `order` keeps it, and the phone check never
 * writes. Safe to re-run, and safe to run before anyone has created a floor.
 *
 * `imageUrl` is left in place rather than cleared, so re-running is harmless
 * and the old value stays as evidence until the separate PR that drops the
 * four deprecated fields (see spec 0018's Follow-up).
 */
export const backfillFacilityPhotos = internalMutation({
  args: {},
  handler: async (ctx) => {
    // The whole table, oldest first. `_creationTime` ascending is the default
    // order of a full scan, which is exactly the order job 2 wants. One
    // building's facilities, so no pagination is owed here.
    const facilities = await ctx.db.query("facilities").collect();

    let photosBackfilled = 0;
    let photosSkippedAlreadySet = 0;
    let photosSkippedNoImage = 0;
    let photosBackfilledAsExternalUrl = 0;
    let ordersStamped = 0;
    let ordersAlreadySet = 0;

    /** Rows whose stored number predates the strict format. */
    const loosePhones: Array<{
      facilityId: string;
      name: string;
      contactPhone: string;
    }> = [];

    let index = 0;
    for (const facility of facilities) {
      const patch: {
        photos?: string[];
        order?: number;
        updatedAt?: number;
      } = {};

      // -- 1. imageUrl into photos[0] ------------------------------------
      if (facility.photos !== undefined && facility.photos.length > 0) {
        // Already carries a gallery. Never clobber it: this migration is the
        // junior partner to whatever an operator has since done by hand.
        photosSkippedAlreadySet += 1;
      } else if (!facility.imageUrl || facility.imageUrl.trim() === "") {
        photosSkippedNoImage += 1;
      } else {
        // Copied VERBATIM, an absolute URL just as readily as an R2 key.
        //
        // `toR2Key` deliberately does NOT gate this. It answers "is this ours
        // to delete from the bucket", which is a question for the delete path,
        // and AC-11 says so outright: a backfilled `imageUrl` that is an
        // absolute URL "is skipped by the delete path". That sentence only
        // means anything if such a value reached `photos` in the first place.
        //
        // Using it as a copy filter here was a real bug, caught by running the
        // migration: all three live facilities carry seeded Unsplash covers,
        // so every one of them was skipped and the gallery came out empty.
        // `resolveMediaUrl` serves both forms already (absolute URLs pass
        // through untouched), so an external cover keeps displaying exactly as
        // it does today.
        const value = facility.imageUrl.trim();
        patch.photos = [value];
        photosBackfilled += 1;
        // Worth counting separately: an external URL displays fine but is not
        // ours to delete, so it will outlive the facility that referenced it.
        if (toR2Key(value) === null) photosBackfilledAsExternalUrl += 1;
      }

      // -- 2. a starting order -------------------------------------------
      if (facility.order === undefined) {
        patch.order = index;
        ordersStamped += 1;
      } else {
        ordersAlreadySet += 1;
      }

      // -- 3. report a loose phone, never rewrite it ---------------------
      if (facility.contactPhone && !E164_PHONE_REGEX.test(facility.contactPhone)) {
        loosePhones.push({
          facilityId: facility._id,
          name: facility.name,
          contactPhone: facility.contactPhone,
        });
      }

      if (patch.photos !== undefined || patch.order !== undefined) {
        // `updatedAt` moves only when something actually changed, so a re-run
        // over an already-migrated table leaves every timestamp alone and the
        // activity trail stays honest about when a row last really changed.
        patch.updatedAt = Date.now();
        await ctx.db.patch(facility._id, patch);
      }

      index += 1;
    }

    return {
      facilitiesScanned: facilities.length,
      photosBackfilled,
      photosBackfilledAsExternalUrl,
      photosSkippedAlreadySet,
      photosSkippedNoImage,
      ordersStamped,
      ordersAlreadySet,
      loosePhoneCount: loosePhones.length,
      // Named in full rather than counted, because somebody has to go and fix
      // each one and a bare count tells them nothing about where to look.
      loosePhones,
    };
  },
});

/**
 * What the backfill would do, without doing any of it.
 *
 * Worth running first on staging and production: it answers "how many rows
 * does this touch, and is any of them a surprise" before a write happens.
 *
 *   pnpm exec convex run realEstateMigration:inspectFacilityBackfill
 */
export const inspectFacilityBackfill = internalQuery({
  args: {},
  handler: async (ctx) => {
    const facilities = await ctx.db.query("facilities").collect();

    // Mirrors the real run exactly: any non-blank `imageUrl` is copied,
    // whether it is an R2 key or an absolute URL. A dry run that predicted
    // something different from what the write does would be worse than none.
    const needsPhotos = facilities.filter(
      (f) =>
        (f.photos === undefined || f.photos.length === 0) &&
        !!f.imageUrl &&
        f.imageUrl.trim() !== "",
    );
    const externalUrlPhotos = needsPhotos.filter(
      (f) => toR2Key(f.imageUrl) === null,
    );
    const needsOrder = facilities.filter((f) => f.order === undefined);
    const loosePhones = facilities.filter(
      (f) => !!f.contactPhone && !E164_PHONE_REGEX.test(f.contactPhone),
    );

    return {
      facilitiesScanned: facilities.length,
      wouldBackfillPhotos: needsPhotos.length,
      ofWhichExternalUrls: externalUrlPhotos.length,
      wouldStampOrder: needsOrder.length,
      loosePhones: loosePhones.map((f) => ({
        facilityId: f._id,
        name: f.name,
        contactPhone: f.contactPhone,
      })),
      // A row with no floor is not a problem this migration fixes: only Real
      // Estate knows the Tower's real floor names, so every row stays
      // "Not yet placed" until they create them (AC-26, AC-27).
      unplacedCount: facilities.filter((f) => f.floorId === undefined).length,
    };
  },
});
