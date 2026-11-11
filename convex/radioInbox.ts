import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  RADIO_AUTO_BROADCAST_FALLBACK_TITLE,
  RADIO_INBOX_BODY_MAX_LENGTH,
  RADIO_INBOX_RATE_WINDOW_MS,
  RADIO_TARGET_TYPES,
  isRadioInboxRateLimited,
  type RadioErrorCode,
} from "@klt-cyber/shared";
import {
  getCurrentUser,
  getMediaDepartmentId,
  hasRadioAuthority,
  isPastoralLeader,
  logActivity,
  pastoralLeaderIds,
  requireRadioAuthority,
  requireUser,
} from "./lib/authz";
import { vRadioInboxType } from "./lib/radioValidators";
import { onAirBroadcast } from "./radio";

/**
 * The Radio inbox (spec 0019, AC-28 to AC-31, AC-38).
 *
 * A prayer request is anonymous to everyone: its `senderUserId` is stored so
 * the rate limit and account deletion can find it, and it never leaves the
 * backend in any payload, for any caller (AC-29). A testimony is named. The
 * one read serves Media (`manageRadio`) and Pastoral's HOD and delegates
 * alike, so feature 19 builds its page on this query rather than opening a
 * second one.
 */

function refuse(code: RadioErrorCode): never {
  throw new ConvexError({ code });
}

/** How many broadcasts one page of the inbox carries. */
const INBOX_BROADCASTS_PER_PAGE = 10;
/** Items read per step while finding the next broadcasts that have any. */
const INBOX_SCAN_CHUNK = 100;
/** The most items one page may scan before it stops looking. */
const INBOX_SCAN_LIMIT = 1000;

/** N34 waits at least this long between notices for the same broadcast. */
const DIGEST_MIN_GAP_MS = 55 * 60 * 1000;
/** How far back the digest looks for new items. */
const DIGEST_LOOKBACK_MS = 26 * 60 * 60 * 1000;

function personName(user: Doc<"users"> | null): string | null {
  if (!user || user.deletedAt !== undefined) return null;
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
}

async function broadcastTitle(ctx: QueryCtx, b: Doc<"radioBroadcasts">): Promise<string> {
  const program = b.programId ? await ctx.db.get(b.programId) : null;
  return program?.name ?? b.oneOffName ?? RADIO_AUTO_BROADCAST_FALLBACK_TITLE;
}

/**
 * Send a prayer request or a testimony while a broadcast is on air (AC-28).
 * Any signed in user, visitor or member. Refused off air, when empty or over
 * 1000 characters, and past five of either type in any rolling hour.
 */
export const submit = mutation({
  args: { type: vRadioInboxType, body: v.string() },
  handler: async (ctx, { type, body }) => {
    const user = await requireUser(ctx);
    const text = body.trim();
    if (!text) refuse("RADIO_INBOX_BODY_REQUIRED");
    if (text.length > RADIO_INBOX_BODY_MAX_LENGTH) refuse("RADIO_INBOX_BODY_TOO_LONG");

    const now = Date.now();
    const recent = await ctx.db
      .query("radioInboxItems")
      .withIndex("by_senderUserId", (q) =>
        q.eq("senderUserId", user._id).gt("createdAt", now - RADIO_INBOX_RATE_WINDOW_MS)
      )
      .collect();
    if (isRadioInboxRateLimited(recent.map((r) => r.createdAt), now)) {
      refuse("RADIO_INBOX_RATE_LIMITED");
    }

    const broadcast = await onAirBroadcast(ctx, now);
    if (!broadcast) refuse("RADIO_INBOX_OFF_AIR");

    await ctx.db.insert("radioInboxItems", {
      type,
      body: text,
      senderUserId: user._id,
      broadcastId: broadcast._id,
      createdAt: now,
    });
    return null;
  },
});

/**
 * The inbox, grouped by broadcast, newest broadcast first (AC-29, AC-38).
 * Open to `manageRadio` holders and to Pastoral's HOD and delegates; null to
 * anyone else. A testimony carries its sender's name; a prayer request
 * carries no sender field at all.
 *
 * Paged by broadcast. `cursor` is the earliest item time across the previous
 * page, and each page shows its broadcasts whole, so every item of a shown
 * broadcast sits at or after the cursor and the next page cannot list it again.
 */
export const listByBroadcast = query({
  args: { cursor: v.optional(v.number()) },
  handler: async (ctx, { cursor }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const canManage = await hasRadioAuthority(ctx, user._id);
    if (!canManage && !(await isPastoralLeader(ctx, user._id))) return null;

    const chosen: Id<"radioBroadcasts">[] = [];
    const seen = new Set<Id<"radioBroadcasts">>();
    let before = cursor ?? Number.POSITIVE_INFINITY;
    let scanned = 0;
    let exhausted = false;

    while (chosen.length < INBOX_BROADCASTS_PER_PAGE && scanned < INBOX_SCAN_LIMIT) {
      const chunk = await ctx.db
        .query("radioInboxItems")
        .withIndex("by_createdAt", (q) => q.lt("createdAt", before))
        .order("desc")
        .take(INBOX_SCAN_CHUNK);
      if (chunk.length === 0) {
        exhausted = true;
        break;
      }
      scanned += chunk.length;
      for (const item of chunk) {
        if (seen.has(item.broadcastId)) continue;
        seen.add(item.broadcastId);
        chosen.push(item.broadcastId);
        if (chosen.length === INBOX_BROADCASTS_PER_PAGE) break;
      }
      before = chunk[chunk.length - 1].createdAt;
      if (chunk.length < INBOX_SCAN_CHUNK) {
        exhausted = chosen.length < INBOX_BROADCASTS_PER_PAGE;
        break;
      }
    }

    const names = new Map<Id<"users">, string | null>();
    const nameOf = async (id: Id<"users">) => {
      if (!names.has(id)) names.set(id, personName(await ctx.db.get(id)));
      return names.get(id) ?? null;
    };

    let earliestShown = Number.POSITIVE_INFINITY;
    const groups = [];
    for (const broadcastId of chosen) {
      const broadcast = await ctx.db.get(broadcastId);
      const items = await ctx.db
        .query("radioInboxItems")
        .withIndex("by_broadcastId_createdAt", (q) => q.eq("broadcastId", broadcastId))
        .order("desc")
        .collect();
      for (const item of items) earliestShown = Math.min(earliestShown, item.createdAt);
      groups.push({
        broadcast: broadcast
          ? {
              _id: broadcast._id,
              title: await broadcastTitle(ctx, broadcast),
              startsAt: broadcast.startsAt,
              endsAt: broadcast.endsAt,
            }
          : { _id: broadcastId, title: RADIO_AUTO_BROADCAST_FALLBACK_TITLE, startsAt: 0, endsAt: 0 },
        items: await Promise.all(
          items.map(async (item) => ({
            _id: item._id,
            type: item.type,
            body: item.body,
            createdAt: item.createdAt,
            prayedForAt: item.prayedForAt ?? null,
            prayedForByName: item.prayedForBy ? await nameOf(item.prayedForBy) : null,
            // The privacy rule (AC-29): only a testimony names its sender.
            ...(item.type === "testimony"
              ? { senderName: (await nameOf(item.senderUserId)) ?? "A member" }
              : {}),
          }))
        ),
      });
    }
    groups.sort((a, b) => b.broadcast.startsAt - a.broadcast.startsAt);

    return {
      groups,
      canMarkPrayedFor: canManage,
      nextCursor:
        exhausted || groups.length === 0 || !Number.isFinite(earliestShown)
          ? null
          : earliestShown,
    };
  },
});

/**
 * Mark a prayer request as prayed for (AC-31). `manageRadio` only; Pastoral
 * sees the mark through the read above. Returns nothing, so no sender can
 * ride back in the response. Marking twice keeps the first mark.
 */
export const markPrayedFor = mutation({
  args: { itemId: v.id("radioInboxItems") },
  handler: async (ctx, { itemId }) => {
    const actor = await requireRadioAuthority(ctx);
    const item = await ctx.db.get(itemId);
    if (!item) refuse("RADIO_INBOX_ITEM_NOT_FOUND");
    if (item.type !== "prayer_request") refuse("RADIO_INBOX_NOT_PRAYER_REQUEST");
    if (item.prayedForAt !== undefined) return null;

    await ctx.db.patch(itemId, { prayedForAt: Date.now(), prayedForBy: actor._id });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "radioInbox.prayed_for",
      targetType: RADIO_TARGET_TYPES.inboxItem,
      targetId: itemId,
      // Deliberately no sender and no body: the log is read by people the
      // prayer request is anonymous to.
      metadata: { broadcastId: item.broadcastId },
      departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
    });
    return null;
  },
});

/**
 * N34, the hourly inbox notice (AC-30). For each broadcast with items newer
 * than its `lastDigestAt` watermark, one push and web bell notice to
 * Pastoral's HOD and delegates, worded as a count, and the watermark moves to
 * now in the same write, so a repeated run sends nothing twice. At most one
 * notice per broadcast per hour. Not a category anyone can mute.
 */
export const sendInboxDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("radioInboxItems")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", now - DIGEST_LOOKBACK_MS))
      .collect();
    if (recent.length === 0) return null;

    const recipients = await pastoralLeaderIds(ctx);
    const byBroadcast = new Map<Id<"radioBroadcasts">, Doc<"radioInboxItems">[]>();
    for (const item of recent) {
      const list = byBroadcast.get(item.broadcastId) ?? [];
      list.push(item);
      byBroadcast.set(item.broadcastId, list);
    }

    for (const [broadcastId, items] of byBroadcast) {
      const broadcast = await ctx.db.get(broadcastId);
      if (!broadcast) continue;
      const watermark = broadcast.lastDigestAt ?? 0;
      if (now - watermark < DIGEST_MIN_GAP_MS) continue;
      const fresh = items.filter((i) => i.createdAt > watermark);
      if (fresh.length === 0) continue;

      await ctx.db.patch(broadcastId, { lastDigestAt: now });
      if (recipients.length === 0) continue;

      const prayers = fresh.filter((i) => i.type === "prayer_request").length;
      const testimonies = fresh.length - prayers;
      const parts = [
        prayers ? `${prayers} prayer ${prayers === 1 ? "request" : "requests"}` : null,
        testimonies ? `${testimonies} ${testimonies === 1 ? "testimony" : "testimonies"}` : null,
      ].filter(Boolean);

      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        title: "Radio inbox",
        body: `${parts.join(" and ")} came in during ${await broadcastTitle(ctx, broadcast)}.`,
        audience: { type: "users", userIds: recipients },
        deepLink: { type: "radio_inbox", id: broadcastId },
        // A cron has no acting user. Attributed to a recipient, never to a
        // sender: `createdBy` on a prayer request's notice would name them.
        createdBy: recipients[0],
        kind: "N34",
      });
    }
    return null;
  },
});
