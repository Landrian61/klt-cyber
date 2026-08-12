import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  canManageContent,
  getAdministrationAuthorityOrNull,
  logActivity,
} from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";

// Themes — annual & monthly. "Current" is derived from the validity period, not
// a stored toggle: the current theme for a scope is the row whose period spans
// `now`. Overlaps within a scope are an admin data-entry error, not something
// the schema prevents; we resolve them by preferring the latest-starting one.
// See docs/DATA_MODEL.md, Increment 3.

const scopeValidator = v.union(v.literal("annual"), v.literal("monthly"));

/** The current theme for a scope, or null. Latest-starting active row wins. */
async function currentForScope(
  ctx: QueryCtx,
  scope: "annual" | "monthly",
  now: number
): Promise<Doc<"themes"> | null> {
  const candidates = await ctx.db
    .query("themes")
    .withIndex("by_scope_period", (q) =>
      q.eq("scope", scope).lte("periodStart", now)
    )
    .order("desc")
    .collect();
  return candidates.find((theme) => theme.periodEnd >= now) ?? null;
}

// ── Reads (open to any authenticated session) ────────────────────────────────

/** The current annual and monthly themes (each null when none is in period). */
export const getCurrentThemes = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [annual, monthly] = await Promise.all([
      currentForScope(ctx, "annual", now),
      currentForScope(ctx, "monthly", now),
    ]);
    return {
      annual: annual
        ? { ...annual, coverImageUrl: await resolveMediaUrl(annual.coverImageUrl) }
        : null,
      monthly: monthly
        ? { ...monthly, coverImageUrl: await resolveMediaUrl(monthly.coverImageUrl) }
        : null,
    };
  },
});

/** Admin: every theme, newest period first. Gated by canManageContent. */
export const listThemes = query({
  args: {},
  handler: async (ctx) => {
    // Null when unauthenticated — live subscriptions outlast sign-out.
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;
    const themes = await ctx.db.query("themes").collect();
    return themes.sort((a, b) => b.periodStart - a.periodStart);
  },
});

// ── Mutations (content-admin only) ───────────────────────────────────────────

export const createTheme = mutation({
  args: {
    scope: scopeValidator,
    title: v.string(),
    scriptureReference: v.string(),
    scriptureText: v.string(),
    coverImageUrl: v.optional(v.string()),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await canManageContent(ctx);
    if (args.periodEnd < args.periodStart) {
      throw new Error("periodEnd must be on or after periodStart");
    }
    const now = Date.now();
    const themeId = await ctx.db.insert("themes", {
      scope: args.scope,
      title: args.title,
      scriptureReference: args.scriptureReference,
      scriptureText: args.scriptureText,
      ...(args.coverImageUrl ? { coverImageUrl: args.coverImageUrl } : {}),
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.theme_created",
      targetType: "themes",
      targetId: themeId,
      metadata: { scope: args.scope, title: args.title },
    });
    return { themeId };
  },
});

export const updateTheme = mutation({
  args: {
    themeId: v.id("themes"),
    scope: v.optional(scopeValidator),
    title: v.optional(v.string()),
    scriptureReference: v.optional(v.string()),
    scriptureText: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, { themeId, ...patch }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(themeId);
    if (!existing) throw new Error("Theme not found");

    const periodStart = patch.periodStart ?? existing.periodStart;
    const periodEnd = patch.periodEnd ?? existing.periodEnd;
    if (periodEnd < periodStart) {
      throw new Error("periodEnd must be on or after periodStart");
    }

    const fields: Partial<Doc<"themes">> = { updatedAt: Date.now() };
    if (patch.scope !== undefined) fields.scope = patch.scope;
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.scriptureReference !== undefined)
      fields.scriptureReference = patch.scriptureReference;
    if (patch.scriptureText !== undefined)
      fields.scriptureText = patch.scriptureText;
    if (patch.coverImageUrl !== undefined)
      fields.coverImageUrl = patch.coverImageUrl;
    if (patch.periodStart !== undefined) fields.periodStart = patch.periodStart;
    if (patch.periodEnd !== undefined) fields.periodEnd = patch.periodEnd;

    await ctx.db.patch(themeId, fields);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.theme_updated",
      targetType: "themes",
      targetId: themeId,
    });
    return { ok: true as const };
  },
});

export const deleteTheme = mutation({
  args: { themeId: v.id("themes") },
  handler: async (ctx, { themeId }) => {
    const actor = await canManageContent(ctx);
    const existing = await ctx.db.get(themeId);
    if (!existing) throw new Error("Theme not found");
    await ctx.db.delete(themeId);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "content.theme_deleted",
      targetType: "themes",
      targetId: themeId,
      metadata: { scope: existing.scope, title: existing.title },
    });
    return { ok: true as const };
  },
});
