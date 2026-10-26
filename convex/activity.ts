import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/authz";
import { ACTIVITY_REPORT_THROTTLE_MS } from "@klt-cyber/shared";

/**
 * "I am being used" (spec 0011, SRS F1-11).
 *
 * The one function in this feature any signed-in user may call. The mobile app
 * calls it on launch and on return to the foreground; the portal calls it on
 * mount and on tab focus. Both pass no identity: the caller is resolved from
 * `ctx.auth` through `requireUser`, never from an argument, so no caller can
 * report activity for anybody else.
 *
 * The 55-minute check is evaluated per target, not once per call. The activity
 * row is judged on its own `lastActiveAt` and a device row on its own
 * `lastSeenAt`, which is what lets a second phone reporting within the same
 * hour still get a row while the account's activity row is correctly left
 * alone (AC-1).
 *
 * The check is here rather than only on the client because the client's copy
 * is an optimisation and this one is the cap: a misbehaving or modified client
 * must not be able to drive write volume. That is also why no separate rate
 * limiter is needed.
 */
/**
 * Bounds on what one account can write here.
 *
 * `DEVICES_PER_USER_MAX` is generous on purpose: a phone, a tablet, a spare,
 * a replacement after a loss, and room to spare. It is a ceiling on abuse,
 * not a quota anybody should ever meet, and it counts rows rather than live
 * devices because a row is what costs us something.
 */
const DEVICE_ID_MAX = 64;
const APP_VERSION_MAX = 32;
const DEVICES_PER_USER_MAX = 20;

export const recordActivity = mutation({
  args: {
    // The device triple, present together or not at all. A phone sends all
    // three; the portal sends none, which is what keeps `userDevices` a table
    // of phones rather than a table of browsers.
    deviceId: v.optional(v.string()),
    platform: v.optional(v.union(v.literal("android"), v.literal("ios"))),
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, platform, appVersion }) => {
    const user = await requireUser(ctx);

    // The caller chooses its own `deviceId`, so these two bounds are the only
    // thing standing between one signed-in account and an unbounded table.
    // The 55-minute throttle cannot help here: a client that invents a fresh
    // id each call takes the insert branch every time, never the patch.
    if (deviceId !== undefined && deviceId.length > DEVICE_ID_MAX) {
      throw new Error("deviceId is too long");
    }
    if (appVersion !== undefined && appVersion.length > APP_VERSION_MAX) {
      throw new Error("appVersion is too long");
    }

    const deviceFields = [deviceId, platform, appVersion];
    const givenCount = deviceFields.filter((f) => f !== undefined).length;
    if (givenCount !== 0 && givenCount !== 3) {
      // Rejected rather than partly honoured: a row with a device id but no
      // platform would land in neither the Android nor the iPhone split and
      // quietly make the two stop summing to the total (AC-5).
      throw new Error(
        "deviceId, platform and appVersion must be given together or not at all"
      );
    }

    const now = Date.now();
    const staleBefore = now - ACTIVITY_REPORT_THROTTLE_MS;

    // ── The account's activity row ────────────────────────────────────────
    const activity = await ctx.db
      .query("userActivity")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!activity) {
      // No row means never reported, so always write. "Never reported" being
      // the absence of a row rather than a zero is the whole reason this is
      // its own table.
      await ctx.db.insert("userActivity", {
        userId: user._id,
        lastActiveAt: now,
      });
    } else if (activity.lastActiveAt <= staleBefore) {
      await ctx.db.patch(activity._id, { lastActiveAt: now });
    }

    // ── This phone's device row ───────────────────────────────────────────
    if (deviceId !== undefined && platform !== undefined && appVersion !== undefined) {
      const device = await ctx.db
        .query("userDevices")
        .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
        .unique();

      if (!device) {
        // Counted before inserting, because this is the one branch a client
        // can reach repeatedly. A real person replaces a phone every few
        // years; anybody past this cap is generating ids, and the honest
        // answer is to refuse rather than to let the Devices tile be driven
        // by whoever is doing it.
        const owned = await ctx.db
          .query("userDevices")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .take(DEVICES_PER_USER_MAX + 1);

        if (owned.length > DEVICES_PER_USER_MAX) {
          throw new Error("Too many devices recorded for this account");
        }

        await ctx.db.insert("userDevices", {
          deviceId,
          userId: user._id,
          platform,
          appVersion,
          lastSeenAt: now,
        });
      } else if (
        device.lastSeenAt <= staleBefore ||
        device.userId !== user._id ||
        device.appVersion !== appVersion ||
        device.platform !== platform
      ) {
        // Patched, never a second insert: exactly one row per device id. A
        // different account signing in on the same phone reassigns this row,
        // because the phone is what is being counted, not the pairing. The
        // version and platform are written through whatever the throttle says,
        // since an app that updated inside the hour has genuinely changed what
        // this row claims and the Devices split would otherwise show the old
        // version for up to another 55 minutes.
        await ctx.db.patch(device._id, {
          userId: user._id,
          platform,
          appVersion,
          lastSeenAt: now,
        });
      }
    }

    return null;
  },
});
