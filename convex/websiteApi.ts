// The website API (spec 0026): what KLT Cyber serves to the church website's
// Laravel backend, at https://<deployment>.convex.site/api/v1/...
//
//   GET  /api/v1/ping            key check and which deployment answered
//   GET  /api/v1/departments     the public department list
//   GET  /api/v1/figures         membership counts, never a name or contact
//   POST /api/v1/announcements   an approved announcement, pushed to phones once
//
// Every route needs `X-Api-Key` (KLT_WEBSITE_API_KEYS). The POST route is also
// signed (KLT_WEBSITE_SIGNING_SECRET), because one accepted call reaches every
// member's phone: a leaked key alone must not be enough to do that.
//
// Each Convex deployment (a developer's dev, staging, production) has its own
// `.convex.site` address and its own env vars, so each environment gets its
// own keys and secret with no code knowing which environment it is.
//
// The website's developer guide is docs/api/website-api.md.

import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { PAUSED_DEPARTMENTS, slugifyDepartmentName } from "@klt-cyber/shared";
import { pushOnFirstPublish } from "./announcements";
import {
  API_KEYS_ENV,
  MAX_BODY_BYTES,
  SIGNING_SECRET_ENV,
  errorResponse,
  isValidApiKey,
  jsonResponse,
  parseAnnouncementPayload,
  parseApiKeys,
  verifySignature,
} from "./lib/websiteApi";

const PAUSED: readonly string[] = PAUSED_DEPARTMENTS;

// ── Figures ──────────────────────────────────────────────────────────────────

type FiguresSnapshot = Omit<Doc<"websiteFigures">, "_id" | "_creationTime">;

/**
 * Counts the figures from the member tables.
 *
 * A **verified member** is a `memberProfiles` row with `profileStatus`
 * `verified` whose user still exists without `deletedAt` (AC-6). It counts in
 * its clan when it has one. **Serving** in a department is a verified member
 * with an `active` roster row there, each person once however many rows they
 * hold (AC-7), the same rule as the Administration Departments page.
 */
async function computeFigures(ctx: QueryCtx): Promise<FiguresSnapshot> {
  const profiles = await ctx.db
    .query("memberProfiles")
    .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
    .collect();

  const users = await Promise.all(profiles.map((profile) => ctx.db.get(profile.userId)));
  const verified = new Set<Id<"users">>();
  const perClan = new Map<Id<"clans">, number>();
  profiles.forEach((profile, i) => {
    const user = users[i];
    if (!user || user.deletedAt !== undefined) return;
    if (verified.has(profile.userId)) return; // one profile per user, defensively
    verified.add(profile.userId);
    if (profile.clanId) perClan.set(profile.clanId, (perClan.get(profile.clanId) ?? 0) + 1);
  });

  const clans = await ctx.db.query("clans").withIndex("by_order").collect();
  const departments = await ctx.db.query("departments").withIndex("by_order").collect();

  const departmentRows = await Promise.all(
    departments.map(async (department) => {
      const seats = await ctx.db
        .query("departmentMemberships")
        .withIndex("by_departmentId_status", (q) =>
          q.eq("departmentId", department._id).eq("status", "active")
        )
        .collect();
      const serving = new Set(seats.map((s) => s.userId).filter((id) => verified.has(id)));
      return {
        departmentId: department._id,
        name: department.name,
        serving: serving.size,
        paused: PAUSED.includes(department.name),
      };
    })
  );

  return {
    computedAt: Date.now(),
    verifiedMembers: verified.size,
    clans: clans.map((clan) => ({
      clanId: clan._id,
      name: clan.name,
      verified: perClan.get(clan._id) ?? 0,
    })),
    departments: departmentRows,
  };
}

// Mutations are serializable, so two first requests on an empty table
// conflict and one retries into the other's row: one row, always.
async function writeFigures(ctx: MutationCtx): Promise<FiguresSnapshot> {
  const snapshot = await computeFigures(ctx);
  const existing = await ctx.db.query("websiteFigures").first();
  if (existing) await ctx.db.replace(existing._id, snapshot);
  else await ctx.db.insert("websiteFigures", snapshot);
  return snapshot;
}

function withoutSystemFields(row: Doc<"websiteFigures">): FiguresSnapshot {
  const { _id, _creationTime, ...snapshot } = row;
  void _id;
  void _creationTime;
  return snapshot;
}

/** Recomputes the snapshot. Run by the 15 minute cron, and on demand when absent. */
export const refreshFigures = internalMutation({
  args: {},
  handler: async (ctx) => {
    await writeFigures(ctx);
  },
});

/** The stored snapshot, or null on a fresh deployment. A read, not a write. */
export const getFigures = internalQuery({
  args: {},
  handler: async (ctx): Promise<FiguresSnapshot | null> => {
    const row = await ctx.db.query("websiteFigures").first();
    return row ? withoutSystemFields(row) : null;
  },
});

/** Writes the first snapshot when there is none, and returns it. */
export const ensureFigures = internalMutation({
  args: {},
  handler: async (ctx): Promise<FiguresSnapshot> => {
    const row = await ctx.db.query("websiteFigures").first();
    return row ? withoutSystemFields(row) : writeFigures(ctx);
  },
});

// ── Departments ──────────────────────────────────────────────────────────────

/**
 * The public department list (AC-9). Leaves out who leads each department and
 * its contact number: the website publishes its own leaders, and putting a
 * department's phone on a public page is the church's call to make first.
 */
export const listDepartments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const departments = await ctx.db.query("departments").withIndex("by_order").collect();
    return departments.map((department) => ({
      id: department._id,
      name: department.name,
      slug: slugifyDepartmentName(department.name),
      description: department.description ?? null,
      order: department.order,
      paused: PAUSED.includes(department.name),
    }));
  },
});

// ── Announcements ────────────────────────────────────────────────────────────

const vLinks = v.array(v.object({ label: v.string(), url: v.string() }));

/**
 * Creates, updates or withdraws the announcement the website sent (AC-11 to
 * AC-15), keyed on its own id, so a resend or a retried job changes the same
 * row and never adds a second one or a second push.
 *
 * No `activityLogs` row: the log's actor is a KLT Cyber user and the website
 * is not one. The row itself records the source, and `notifications` records
 * the push.
 */
export const receiveAnnouncement = internalMutation({
  args: {
    payload: v.union(
      v.object({
        kind: v.literal("publish"),
        externalId: v.string(),
        title: v.string(),
        body: v.string(),
        priority: v.optional(v.union(v.literal("low"), v.literal("normal"), v.literal("high"))),
        category: v.optional(v.string()),
        coverImageUrl: v.optional(v.string()),
        links: v.optional(vLinks),
        startDate: v.number(),
        endDate: v.number(),
        sourceUpdatedAt: v.optional(v.number()),
        dryRun: v.boolean(),
        warnings: v.array(v.string()),
      }),
      v.object({
        kind: v.literal("withdraw"),
        externalId: v.string(),
        sourceUpdatedAt: v.optional(v.number()),
        dryRun: v.boolean(),
        warnings: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, { payload }) => {
    const existing = await ctx.db
      .query("announcements")
      .withIndex("by_source_externalId", (q) =>
        q.eq("source", "website").eq("externalId", payload.externalId)
      )
      .first();

    // Out of order (AC-18): a request whose `updated_at` is older than the one
    // last applied changes nothing. Without `updated_at` the latest arrival wins.
    if (
      existing &&
      payload.sourceUpdatedAt !== undefined &&
      existing.sourceUpdatedAt !== undefined &&
      payload.sourceUpdatedAt < existing.sourceUpdatedAt
    ) {
      return {
        outcome: "ok" as const,
        announcementId: existing._id,
        result: "superseded" as const,
        pushed: false,
      };
    }
    const order =
      payload.sourceUpdatedAt !== undefined ? { sourceUpdatedAt: payload.sourceUpdatedAt } : {};

    if (payload.kind === "withdraw") {
      if (!existing) return { outcome: "not_found" as const };
      if (!payload.dryRun) {
        await ctx.db.patch(existing._id, { status: "draft", ...order, updatedAt: Date.now() });
      }
      return {
        outcome: "ok" as const,
        announcementId: existing._id,
        result: "withdrawn" as const,
        pushed: false,
      };
    }

    const fields = {
      title: payload.title,
      body: payload.body,
      category: payload.category,
      priority: payload.priority,
      coverImageUrl: payload.coverImageUrl,
      links: payload.links,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: "published" as const,
    };

    if (payload.dryRun) {
      return {
        outcome: "ok" as const,
        announcementId: existing?._id ?? null,
        result: existing ? ("updated" as const) : ("created" as const),
        pushed: existing?.firstPublishedAt === undefined,
      };
    }

    const now = Date.now();
    let announcementId: Id<"announcements">;
    if (existing) {
      // Patching an optional field to `undefined` removes it, so a field the
      // website stopped sending is cleared here too, as the website intends.
      await ctx.db.patch(existing._id, { ...fields, ...order, updatedAt: now });
      announcementId = existing._id;
    } else {
      announcementId = await ctx.db.insert("announcements", {
        title: fields.title,
        body: fields.body,
        ...(fields.category ? { category: fields.category } : {}),
        ...(fields.priority ? { priority: fields.priority } : {}),
        ...(fields.coverImageUrl ? { coverImageUrl: fields.coverImageUrl } : {}),
        ...(fields.links ? { links: fields.links } : {}),
        startDate: fields.startDate,
        endDate: fields.endDate,
        status: "published",
        source: "website",
        externalId: payload.externalId,
        ...order,
        createdAt: now,
        updatedAt: now,
      });
    }
    const pushed = await pushOnFirstPublish(ctx, announcementId, undefined);
    return {
      outcome: "ok" as const,
      announcementId,
      result: existing ? ("updated" as const) : ("created" as const),
      pushed,
    };
  },
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

type Handler = Parameters<typeof httpAction>[0];

/**
 * Wraps a route in the key check (AC-2, AC-3): 503 when this deployment has
 * no keys set, 401 for a missing or wrong key, and a JSON 500 rather than
 * Convex's plain text one when the handler throws.
 */
function withApiKey(handler: Handler): Handler {
  return async (ctx, request) => {
    const keys = parseApiKeys(process.env[API_KEYS_ENV]);
    if (keys.length === 0) {
      return errorResponse(503, "not_configured", "The website API is not configured on this deployment.");
    }
    if (!(await isValidApiKey(request.headers.get("X-Api-Key"), keys))) {
      return errorResponse(401, "unauthorized", "Missing or unknown X-Api-Key.");
    }
    try {
      return await handler(ctx, request);
    } catch (error) {
      console.error("website api handler failed", error);
      return errorResponse(500, "internal_error", "Something went wrong on our side. Try again shortly.");
    }
  };
}

export const ping = httpAction(
  withApiKey(async () =>
    jsonResponse(200, {
      data: {
        ok: true,
        deployment: process.env.CONVEX_SITE_URL ?? null,
        time: new Date().toISOString(),
        signing_configured: !!process.env[SIGNING_SECRET_ENV],
      },
    })
  )
);

export const departments = httpAction(
  withApiKey(async (ctx) => {
    const data = await ctx.runQuery(internal.websiteApi.listDepartments, {});
    return jsonResponse(200, { data });
  })
);

export const figures = httpAction(
  withApiKey(async (ctx) => {
    const snapshot: FiguresSnapshot =
      (await ctx.runQuery(internal.websiteApi.getFigures, {})) ??
      (await ctx.runMutation(internal.websiteApi.ensureFigures, {}));
    return jsonResponse(200, {
      data: {
        as_of: new Date(snapshot.computedAt).toISOString(),
        members: { verified: snapshot.verifiedMembers },
        clans: snapshot.clans.map((c) => ({ id: c.clanId, name: c.name, verified: c.verified })),
        departments: snapshot.departments.map((d) => ({
          id: d.departmentId,
          name: d.name,
          slug: slugifyDepartmentName(d.name),
          serving: d.serving,
          paused: d.paused,
        })),
      },
    });
  })
);

export const announcements = httpAction(
  withApiKey(async (ctx, request) => {
    const secret = process.env[SIGNING_SECRET_ENV];
    if (!secret) {
      return errorResponse(503, "not_configured", "Signed requests are not configured on this deployment.");
    }

    const declared = Number(request.headers.get("Content-Length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", `The body must be at most ${MAX_BODY_BYTES} bytes.`);
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", `The body must be at most ${MAX_BODY_BYTES} bytes.`);
    }

    const now = Date.now();
    const check = await verifySignature({
      secret,
      timestamp: request.headers.get("X-Klt-Timestamp"),
      signature: request.headers.get("X-Klt-Signature"),
      rawBody,
      nowMs: now,
    });
    if (!check.ok) return errorResponse(401, check.code, check.message);

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return errorResponse(400, "invalid_json", "The body is not valid JSON.");
    }

    const parsed = parseAnnouncementPayload(json, now);
    if (!parsed.ok) {
      return errorResponse(
        422,
        parsed.code,
        parsed.code === "unsupported_audience"
          ? "This audience is not delivered yet."
          : "The announcement has fields that need fixing.",
        parsed.errors
      );
    }

    const result = await ctx.runMutation(internal.websiteApi.receiveAnnouncement, {
      payload: parsed.value,
    });
    if (result.outcome === "not_found") {
      return errorResponse(404, "not_found", `No announcement with id "${parsed.value.externalId}" was received from the website.`);
    }
    return jsonResponse(200, {
      data: {
        id: parsed.value.externalId,
        announcement_id: result.announcementId,
        result: result.result,
        pushed: result.pushed,
        dry_run: parsed.value.dryRun,
      },
      warnings: parsed.value.warnings,
    });
  })
);

/** Any other /api/v1 path or method: a JSON 404 instead of Convex's plain text. */
export const notFound = httpAction(async () =>
  errorResponse(404, "not_found", "No such endpoint. See the website API guide for the routes.")
);
