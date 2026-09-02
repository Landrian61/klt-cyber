import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { components } from "./_generated/api";
import {
  mutation, query, internalMutation,
} from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser, requireUser } from "./lib/authz";
import { notificationAudienceValidator, type NotificationAudience } from "./schema";

// Thin wrapper around @convex-dev/expo-push-notifications, scoped to the
// caller's own identity — every registration/status function below resolves
// `userId` from `ctx.auth` via convex/lib/authz.ts, never from a
// client-supplied argument.
//
// Real component API (verified fresh against node_modules/@convex-dev/expo-
// push-notifications/src/client/index.ts and src/component/{public,schema}.ts
// — the README's names are accurate except for one point): recordToken,
// getStatusForUser, pauseNotificationsForUser, and — note the name —
// unpauseNotificationsForUser (not "resume..."). Batch sending is
// sendPushNotificationBatch(ctx, { notifications: Array<{ userId,
// notification }>, allowUnregisteredTokens? }).
//
// NotificationFields (the per-recipient payload shape, from
// src/component/schema.ts) supports: title, body, data, sound, badge,
// priority, ttl, expiration, subtitle, interruptionLevel, channelId,
// categoryId, mutableContent, _contentAvailable. There is NO richContent/
// image field — Expo's push API itself can carry a rich-content image, but
// this component's schema doesn't expose it, so there is nothing to forward
// an image through. See `dispatch` below for how `imageUrl` is handled given
// that gap.
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

/**
 * Unregisters the caller's push token. Called on sign-out (see
 * apps/mobile/app/profile.tsx) so a device's token doesn't stay attached to
 * an account that's no longer signed in on it — the component's own
 * `pushTokens` table is keyed by userId, not by token, so without this a
 * second account signing in on the same device leaves BOTH users' rows
 * pointing at the same physical token, and an "all" dispatch pushes to that
 * one device twice (this is exactly what produced the duplicate pop-up: two
 * `users` rows had recorded the identical ExponentPushToken).
 */
export const unregisterMyPushNotificationToken = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await pushNotifications.removeToken(ctx, { userId: user._id });
  },
});

// ── Audience resolution (Part B) ─────────────────────────────────────────────
// Each resolver returns the Id<"users">[] for one audience type.
// `resolveAudience` is the single entry point both `dispatch` (bulk fan-out)
// and `userMatchesAudience` (per-notification match check, Part D) go
// through, so the two never define "who's in this audience" differently.

/**
 * Every user in the app. Intentionally NOT limited to verified members —
 * Updates/announcements are already visible to unverified and
 * authenticated-but-visitor sessions per the mobile tab-gating, so the
 * notification audience matches that, rather than being narrower.
 */
async function resolveAllAudience(ctx: QueryCtx | MutationCtx): Promise<Id<"users">[]> {
  const users = await ctx.db.query("users").collect();
  return users.map((u) => u._id);
}

/**
 * Approved members of a department. `departmentMemberships.status` is only
 * `"active" | "removed"` — there is no separate pending/approved distinction
 * on the membership itself (verified in convex/departmentMemberships.ts: a
 * membership is written as `status: "active"` immediately on creation,
 * whether self-added via `submitProfile` or admin-added via
 * `addDepartmentMember`; `pending_verification` only ever describes the
 * member's own `memberProfiles.profileStatus`, a different table). So
 * "approved" here means exactly `status === "active"`, same filter every
 * other roster read in that file uses (e.g. `listDepartmentMembersWithProfiles`).
 */
async function resolveDepartmentAudience(
  ctx: QueryCtx | MutationCtx,
  departmentId: Id<"departments">
): Promise<Id<"users">[]> {
  const memberships = await ctx.db
    .query("departmentMemberships")
    .withIndex("by_departmentId_status", (q) =>
      q.eq("departmentId", departmentId).eq("status", "active")
    )
    .collect();
  return [...new Set(memberships.map((m) => m.userId))];
}

/** The provided list, as-is — no existence/status check. */
function resolveUsersAudience(userIds: Id<"users">[]): Id<"users">[] {
  return userIds;
}

/**
 * Active holders of a role. The "role" audience variant carries no
 * `departmentId` (see docs/DATA_MODEL.md, Increment 6), so for the
 * department-scoped role types (`hod`, `department_admin`) this returns
 * holders across every department, not one. Deduped since a user can hold
 * more than one active assignment of the same `roleType` (e.g. hod of two
 * departments).
 *
 * `roleAssignments.by_roleType` isn't a compound index with `status`, so
 * matching is index-then-filter — the same shape `hasActiveDepartmentRole`
 * in convex/lib/authz.ts already uses for its own indexed-then-filtered
 * active-role lookups.
 */
async function resolveRoleAudience(
  ctx: QueryCtx | MutationCtx,
  roleType: Extract<NotificationAudience, { type: "role" }>["roleType"]
): Promise<Id<"users">[]> {
  const rows = await ctx.db
    .query("roleAssignments")
    .withIndex("by_roleType", (q) => q.eq("roleType", roleType))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
  return [...new Set(rows.map((r) => r.userId))];
}

/** Single entry point for all four audience types — see the note above. */
async function resolveAudience(
  ctx: QueryCtx | MutationCtx,
  audience: NotificationAudience
): Promise<Id<"users">[]> {
  switch (audience.type) {
    case "all":
      return resolveAllAudience(ctx);
    case "department":
      return resolveDepartmentAudience(ctx, audience.departmentId);
    case "users":
      return resolveUsersAudience(audience.userIds);
    case "role":
      return resolveRoleAudience(ctx, audience.roleType);
    default: {
      const exhaustive: never = audience;
      throw new Error(`Unhandled audience type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ── Unread count & in-app notification center (Part D + follow-up) ─────────────

/**
 * True when `userId` is in `audience`'s target set. Goes through the same
 * `resolveAudience` used for dispatch fan-out (Part B) rather than
 * re-deriving the matching rule a second time. For "all" this short-circuits
 * without a query at all — `resolveAllAudience`'s own definition is "every
 * user", so there's nothing to look up to prove a match. For the other three
 * it resolves the (small, at this app's scale — a department roster or a
 * role's holder list) recipient set and checks membership.
 */
async function userMatchesAudience(
  ctx: QueryCtx | MutationCtx,
  audience: NotificationAudience,
  userId: Id<"users">
): Promise<boolean> {
  if (audience.type === "all") return true;
  const recipients = await resolveAudience(ctx, audience);
  return recipients.includes(userId);
}

/**
 * Every `notifications` row targeting `userId` that the caller hasn't
 * dismissed, each annotated with whether they've read it — the shared base
 * both `getMyUnreadNotificationCount` (Part E's badge) and
 * `listMyNotifications`/`markAllNotificationsRead` (the in-app notification
 * center) build on, so "which notifications are mine," "have I read it," and
 * "have I deleted it" are never defined twice.
 *
 * A dismissed notification is excluded entirely, not just flagged — deleted
 * means gone from both the list and the unread count (Increment 8), the same
 * way `notificationReads` means read rather than merely "seen."
 *
 * Deliberately a flat scan over `notifications` rather than a join through a
 * per-recipient fan-out table — there isn't one (see schema.ts: "one row per
 * event, not per recipient"). That scan is the accepted cost of that schema
 * choice; at this app's expected notification volume (a single congregation)
 * it's cheap in absolute terms, and the "all" case (the common one) never
 * re-fetches a roster per row (see `userMatchesAudience`).
 */
async function myNotificationsWithReadState(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Array<Doc<"notifications"> & { read: boolean }>> {
  const [allNotifications, readRows, dismissedRows] = await Promise.all([
    ctx.db.query("notifications").collect(),
    ctx.db
      .query("notificationReads")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("notificationDismissals")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const readIds = new Set(readRows.map((r) => r.notificationId));
  const dismissedIds = new Set(dismissedRows.map((r) => r.notificationId));

  const mine: Array<Doc<"notifications"> & { read: boolean }> = [];
  for (const notification of allNotifications) {
    if (dismissedIds.has(notification._id)) continue;
    if (!(await userMatchesAudience(ctx, notification.audience, userId))) continue;
    mine.push({ ...notification, read: readIds.has(notification._id) });
  }
  return mine;
}

/**
 * Returns 0 (not null) when unauthenticated — a badge count has no
 * meaningful "loading"/"n/a" distinction worth surfacing to callers.
 */
export const getMyUnreadNotificationCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    const mine = await myNotificationsWithReadState(ctx, user._id);
    return mine.filter((n) => !n.read).length;
  },
});

/**
 * Every notification targeting the caller, newest first, for the bell-icon
 * notification center. Null (not []) when unauthenticated, matching this
 * file's `getMyPushStatus` convention — a client subscribed to this query
 * stays subscribed through sign-out rather than crashing mid-teardown.
 */
export const listMyNotifications = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const mine = await myNotificationsWithReadState(ctx, user._id);
    return mine.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/** Marks one notification read for the caller. Idempotent. */
export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("notificationReads")
      .withIndex("by_userId_notificationId", (q) =>
        q.eq("userId", user._id).eq("notificationId", notificationId)
      )
      .first();
    if (existing) return;
    await ctx.db.insert("notificationReads", {
      userId: user._id,
      notificationId,
      readAt: Date.now(),
    });
  },
});

/**
 * Deletes one notification for the caller only (Increment 8) — mirrors
 * `markNotificationRead` exactly, just against `notificationDismissals`
 * instead of `notificationReads`. Idempotent.
 */
export const dismissNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("notificationDismissals")
      .withIndex("by_userId_notificationId", (q) =>
        q.eq("userId", user._id).eq("notificationId", notificationId)
      )
      .first();
    if (existing) return;
    await ctx.db.insert("notificationDismissals", {
      userId: user._id,
      notificationId,
      dismissedAt: Date.now(),
    });
  },
});

/** Marks every notification currently targeting the caller as read. */
export const markAllNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const mine = await myNotificationsWithReadState(ctx, user._id);
    const now = Date.now();
    for (const notification of mine) {
      if (notification.read) continue;
      await ctx.db.insert("notificationReads", {
        userId: user._id,
        notificationId: notification._id,
        readAt: now,
      });
    }
  },
});

// ── Dispatch (Part C) ─────────────────────────────────────────────────────────

/**
 * Resolves the audience, records one `notifications` row (the event, not a
 * per-recipient fan-out), and pushes to every resolved recipient in one
 * batch call.
 *
 * Two deliberate deviations from the literal spec, both flagged in the task
 * report:
 *
 * 1. `createdBy` is a required arg here, even though it wasn't listed in the
 *    spec's arg list. `notifications.createdBy` is a required schema field,
 *    and `dispatch` runs as a scheduled internal mutation (`ctx.scheduler
 *    .runAfter` from `publishAnnouncement`) — there is no caller identity on
 *    `ctx.auth` to resolve it from at that point, so it has to come from the
 *    caller that still has one (the mutation that scheduled this).
 * 2. No `createdAt` is written. The spec's insert list includes it, but
 *    `notifications` was deliberately built without that field (Increment
 *    6 — `_creationTime` covers it, same as `activityLogs`); adding it back
 *    here would silently reintroduce a field the schema doesn't have and
 *    fail typecheck.
 *
 * `imageUrl` is accepted (per spec, and because `publishAnnouncement` has
 * one to offer) but is NOT forwarded into the push payload: the installed
 * `@convex-dev/expo-push-notifications` has no `richContent`/image field in
 * its `NotificationFields` (see the module comment above) — there's nothing
 * to hack around that without reaching into the component's internals, which
 * the task explicitly asked not to do. The `notifications` row also doesn't
 * store it — schema.ts's row shape (title, body, audience, deepLink,
 * createdBy) has no field for it either, and adding one is a schema change
 * out of scope for this task's "no deploy" constraint.
 */
export const dispatch = internalMutation({
  args: {
    title: v.string(),
    body: v.string(),
    audience: notificationAudienceValidator,
    deepLink: v.object({ type: v.string(), id: v.string() }),
    createdBy: v.id("users"),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, { title, body, audience, deepLink, createdBy, imageUrl }) => {
    // Unused until the component (or a bespoke rich-notification path)
    // supports an image field — see the doc comment above.
    void imageUrl;

    const recipients = await resolveAudience(ctx, audience);

    const notificationId = await ctx.db.insert("notifications", {
      title,
      body,
      audience,
      deepLink,
      createdBy,
    });

    if (recipients.length === 0) return;

    await pushNotifications.sendPushNotificationBatch(ctx, {
      notifications: recipients.map((userId) => ({
        userId,
        notification: {
          title,
          body,
          // `notificationId` rides alongside the deep-link target's own type/id
          // so the OS-tap listener (apps/mobile/app/_layout.tsx) can call
          // markNotificationRead without a second lookup. `data` is `v.any()`
          // on the push component's side, so this is additive, not a schema
          // change. Pushes delivered before this field existed simply lack it
          // — the tap handler guards for that and still navigates.
          data: { type: deepLink.type, id: deepLink.id, notificationId },
          sound: "default",
          // No badge field — the client sets the badge itself from
          // getMyUnreadNotificationCount (Part E), not per-push.
          // No channelId — a single default Android channel is fine for now.
        },
      })),
      // Most recipients of an "all"/"role"/"department" send have never
      // registered a push token (never granted OS permission). Without this,
      // sendPushNotificationHandler throws a ConvexError on the first
      // untokened recipient and aborts the whole batch — see
      // node_modules/@convex-dev/expo-push-notifications/src/component/public.ts.
      allowUnregisteredTokens: true,
    });
  },
});
