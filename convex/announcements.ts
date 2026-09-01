import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { resolveCoverUrls } from "./lib/media";

// Push-notification body excerpt length — a full announcement body would
// blow well past what a push notification renders anyway. Named so it's a
// one-line change later.
const PUSH_BODY_EXCERPT_LENGTH = 140;

/** Truncates on a word boundary at or before `maxLength`, appending an
 * ellipsis only when it actually cut something off. */
function excerpt(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Schedules the "announcement published" push (Increment 6). Shared by both
 * ways an announcement reaches "published": `publishAnnouncement` (draft →
 * published) and `createAnnouncement` when called with `status: "published"`
 * directly — the admin dialog's one-step "create and publish" action, which
 * skips `publishAnnouncement` entirely. Originally this was only wired into
 * `publishAnnouncement`, which silently missed that second path.
 */
function schedulePublishNotification(
  ctx: MutationCtx,
  announcementId: Id<"announcements">,
  announcement: { title: string; body: string; coverImageUrl?: string },
  actorId: Id<"users">
) {
  return ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: announcement.title,
    body: excerpt(announcement.body, PUSH_BODY_EXCERPT_LENGTH),
    audience: { type: "all" as const },
    deepLink: { type: "announcement", id: announcementId },
    createdBy: actorId,
    ...(announcement.coverImageUrl ? { imageUrl: announcement.coverImageUrl } : {}),
  });
}

// Announcements. The lifecycle draft → published → active → expired/disabled →
// archived (spec §10.8) is derived at query time; only draft/published/archived
// are stored. See docs/DATA_MODEL.md, Increment 3.
//
//   active   = status "published" AND startDate <= now <= endDate
//   expired  = status "published" AND now > endDate
//   disabled = admin returned it to "draft" (taken down, still editable)
//   archived = status "archived" (terminal)

const priorityValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high")
);
const linksValidator = v.array(
  v.object({ label: v.string(), url: v.string() })
);

const PRIORITY_RANK: Record<string, number> = { high: 3, normal: 2, low: 1 };

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Open: currently-active announcements (published, within the start/end window),
 * highest priority first then most recent.
 */
export const listActiveAnnouncements = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const published = await ctx.db
      .query("announcements")
      .withIndex("by_status_startDate", (q) =>
        q.eq("status", "published").lte("startDate", now)
      )
      .collect();
    return resolveCoverUrls(
      published
        .filter((a) => a.endDate >= now)
        .sort(
          (a, b) =>
            (PRIORITY_RANK[b.priority ?? "normal"] ?? 2) -
              (PRIORITY_RANK[a.priority ?? "normal"] ?? 2) ||
            b.startDate - a.startDate
        )
    );
  },
});

/** Admin: every announcement, newest first. Gated by canManageContent. */
export const listAllAnnouncements = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const all = await ctx.db.query("announcements").collect();
    return resolveCoverUrls(all.sort((a, b) => b.startDate - a.startDate));
  },
});

// ── Mutations (content-admin only) ───────────────────────────────────────────

export const createAnnouncement = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    category: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    coverImageUrl: v.optional(v.string()),
    links: v.optional(linksValidator),
    startDate: v.number(),
    endDate: v.number(),
    // Defaults to draft; a create-and-publish caller may pass "published".
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    if (args.endDate < args.startDate) {
      throw new Error("endDate must be on or after startDate");
    }
    const now = Date.now();
    const announcementId = await ctx.db.insert("announcements", {
      title: args.title,
      body: args.body,
      ...(args.category ? { category: args.category } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.coverImageUrl ? { coverImageUrl: args.coverImageUrl } : {}),
      ...(args.links && args.links.length ? { links: args.links } : {}),
      startDate: args.startDate,
      endDate: args.endDate,
      status: args.status ?? "draft",
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.announcement_created",
      targetType: "announcements",
      targetId: announcementId,
      metadata: { title: args.title, status: args.status ?? "draft" },
    });
    if (args.status === "published") {
      await schedulePublishNotification(
        ctx,
        announcementId,
        { title: args.title, body: args.body, coverImageUrl: args.coverImageUrl },
        actor._id
      );
    }
    return { announcementId };
  },
});

export const updateAnnouncement = mutation({
  args: {
    announcementId: v.id("announcements"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    category: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    coverImageUrl: v.optional(v.string()),
    links: v.optional(linksValidator),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, { announcementId, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(announcementId);
    if (!existing) throw new Error("Announcement not found");

    const startDate = patch.startDate ?? existing.startDate;
    const endDate = patch.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new Error("endDate must be on or after startDate");
    }

    const fields: Partial<Doc<"announcements">> = { updatedAt: Date.now() };
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.body !== undefined) fields.body = patch.body;
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.priority !== undefined) fields.priority = patch.priority;
    if (patch.coverImageUrl !== undefined)
      fields.coverImageUrl = patch.coverImageUrl;
    if (patch.links !== undefined) fields.links = patch.links;
    if (patch.startDate !== undefined) fields.startDate = patch.startDate;
    if (patch.endDate !== undefined) fields.endDate = patch.endDate;

    await ctx.db.patch(announcementId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.announcement_updated",
      targetType: "announcements",
      targetId: announcementId,
    });
    return { ok: true as const };
  },
});

/** Shared status transition + audit for publish/disable/archive. */
async function setStatus(
  ctx: MutationCtx,
  announcementId: Id<"announcements">,
  status: "draft" | "published" | "archived",
  action: string
) {
  const actor = await canManageContent(ctx);
  const existing = await ctx.db.get(announcementId);
  if (!existing) throw new Error("Announcement not found");
  await ctx.db.patch(announcementId, { status, updatedAt: Date.now() });
  await logActivity(ctx, {
    actorUserId: actor._id,
    action,
    targetType: "announcements",
    targetId: announcementId,
    metadata: { title: existing.title, from: existing.status, to: status },
  });
  return { ok: true as const, status, actorId: actor._id, announcement: existing };
}

/**
 * Make an announcement live (draft → published), and fire the first
 * real end-to-end notification trigger (docs/DATA_MODEL.md, Increment 6):
 * schedule `internal.notifications.dispatch` to fan the announcement out to
 * everyone. Scheduled (not awaited inline) so a slow/failed push dispatch
 * never blocks or fails the publish itself — publishing is the source of
 * truth; the notification is a best-effort side effect of it.
 */
export const publishAnnouncement = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const result = await setStatus(
      ctx,
      announcementId,
      "published",
      "content.announcement_published"
    );
    // `createdBy` on the notification event is whoever published it (the
    // resolved actor), not necessarily the announcement's original author —
    // same "actor, not content owner" convention as activityLogs.actorUserId.
    await schedulePublishNotification(
      ctx,
      announcementId,
      result.announcement,
      result.actorId
    );
    return result;
  },
});

/**
 * Take a published announcement down early without archiving it — returns it to
 * draft so it drops out of the active feed but stays editable and re-publishable.
 */
export const disableAnnouncement = mutation({
  args: { announcementId: v.id("announcements") },
  handler: (ctx, { announcementId }) =>
    setStatus(ctx, announcementId, "draft", "content.announcement_disabled"),
});

/** Archive an announcement (terminal). */
export const archiveAnnouncement = mutation({
  args: { announcementId: v.id("announcements") },
  handler: (ctx, { announcementId }) =>
    setStatus(ctx, announcementId, "archived", "content.announcement_archived"),
});
