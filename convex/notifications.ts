import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireUser } from "./lib/authz";

// Thin wrapper around @convex-dev/expo-push-notifications, scoped to the
// caller's own identity — every function below resolves `userId` from
// `ctx.auth` via convex/lib/authz.ts, never from a client-supplied argument.
// Sending notifications (fan-out to `notifications`/`notificationReads` in
// schema.ts) is not part of this file yet — this is registration/status only.
//
// Real component API (verified against node_modules/@convex-dev/expo-push-
// notifications/src/client/index.ts — the README's names are accurate except
// for one point): recordToken, getStatusForUser, pauseNotificationsForUser,
// and — note the name — unpauseNotificationsForUser (not "resume...").
const pushNotifications = new PushNotifications(components.pushNotifications);

/** Record (or update) the caller's Expo push token. */
export const recordPushNotificationToken = mutation({
  args: { pushToken: v.string() },
  handler: async (ctx, { pushToken }) => {
    const user = await requireUser(ctx);
    await pushNotifications.recordToken(ctx, { userId: user._id, pushToken });
  },
});

/**
 * The caller's app-level push status: whether a token is on file and whether
 * delivery is currently paused. OS-level permission is not Convex's concern —
 * the mobile client combines this with `Notifications.getPermissionsAsync()`
 * to resolve one of never-asked / granted-active / granted-paused / denied.
 *
 * Null (not an error) when unauthenticated, matching `profile.getMyAccount`'s
 * reactive-safe convention — a client subscribed to this query stays
 * subscribed through sign-out rather than crashing mid-teardown.
 */
export const getMyPushStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await pushNotifications.getStatusForUser(ctx, { userId: user._id });
  },
});

/** Pause push delivery for the caller (e.g. while the app is foregrounded). */
export const pauseMyPushNotifications = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await pushNotifications.pauseNotificationsForUser(ctx, { userId: user._id });
  },
});

/** Resume push delivery for the caller. */
export const resumeMyPushNotifications = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await pushNotifications.unpauseNotificationsForUser(ctx, { userId: user._id });
  },
});
