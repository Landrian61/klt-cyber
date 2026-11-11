import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  RADIO_AUTO_BROADCAST_EXTEND_MS,
  RADIO_BROADCAST_MAX_MS,
  RADIO_AUTO_BROADCAST_FALLBACK_TITLE,
  RADIO_BURST_PROBE_OFFSETS_MS,
  RADIO_LISTENER_WINDOW_MS,
  RADIO_LIVE_PUSH_LEAD_MS,
  RADIO_PROBE_FALLBACK_TIMEOUT_MS,
  RADIO_RECORDING_URL_TTL_SECONDS,
  RADIO_TARGET_TYPES,
  deriveRadioStatus,
  effectiveRadioFollow,
  isSuperTProgram,
  kampalaDateKeyAt,
  kampalaDayStartAt,
  radioScheduleWindow,
  resolveCurrentBroadcast,
  resolveNextBroadcast,
  type RadioDetectedState,
  type RadioErrorCode,
} from "@klt-cyber/shared";
import {
  getCurrentUser,
  getMediaDepartmentId,
  getRadioAuthorityOrNull,
  hasActiveDepartmentRole,
  isActiveSystemAdmin,
  requireUser,
  logActivity,
  requireRadioAuthority,
} from "./lib/authz";
import { resolveMediaUrl, signedKeyUrl } from "./lib/media";
import { reportError } from "./lib/sentry";
import { vRadioOverrideState } from "./lib/radioValidators";
import { materialiseProgram } from "./lib/radioSchedule";
import { applyBeat, sweepStaleStretches } from "./lib/radioListening";
import { deliverLivePush, sendDueLivePushes } from "./lib/radioLivePush";

/**
 * Radio core: the stream probe, the status row and what readers are shown
 * (spec 0019, build slice 4).
 *
 * The status a reader sees is DERIVED, never stored: the probe records what it
 * found and when, and `deriveRadioStatus` (packages/shared) turns that plus a
 * clock into Live, Off air or Stream interrupted. The server derives it for
 * the queries that need a figure now, and the phone derives it again from the
 * same row and its own clock, so a stalled cron reads Off air within three
 * minutes even on a screen nobody refreshed (AC-3, AC-39).
 */

const MINUTE_MS = 60_000;

/** How far around `now` the reader queries look for current and next rows. */
const NOW_PLAYING_LOOKBEHIND_MS = 24 * 60 * MINUTE_MS;
const NOW_PLAYING_LOOKAHEAD_MS = 7 * 24 * 60 * MINUTE_MS;
/** An auto row is extended once its end is this close (spec 0019, AC-17). */
const AUTO_EXTEND_WHEN_WITHIN_MS = 30 * MINUTE_MS;

/** The most broadcast rows the phone is handed to resolve current and next. */
const NOW_PLAYING_ROW_CAP = 12;

function refuse(code: RadioErrorCode): never {
  throw new ConvexError({ code });
}

// ── Reading the status row ────────────────────────────────────────────────

async function getStatusRow(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"radioStatus"> | null> {
  return await ctx.db.query("radioStatus").first();
}

/** First and last name, never an email: a host's name is shown to everyone. */
function hostName(user: Doc<"users"> | null): string | undefined {
  if (!user || user.deletedAt !== undefined) return undefined;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || undefined;
}

/** The override summary readers are shown: who set it, and when (AC-6). */
async function overrideSummary(
  ctx: QueryCtx,
  row: Doc<"radioStatus"> | null
) {
  if (!row?.override) return null;
  const by = await ctx.db.get(row.override.byUserId);
  return {
    state: row.override.state,
    setAt: row.override.setAt,
    byName: hostName(by) ?? "A Media team member",
  };
}

/** The raw reading a client needs to derive the status with its own clock. */
function statusReading(row: Doc<"radioStatus"> | null) {
  if (!row) return null;
  return {
    detected: row.detected,
    lastProbeAt: row.lastProbeAt,
    lastLiveAt: row.lastLiveAt,
    override: row.override ? { state: row.override.state } : undefined,
  };
}

/**
 * Broadcasts that could be current or next around `now`: anything still
 * running, and the soonest starts, cancelled rows included so the phone can
 * mark them rather than lose them. Ordered by start.
 */
async function broadcastsAround(ctx: QueryCtx | MutationCtx, now: number) {
  const rows = await ctx.db
    .query("radioBroadcasts")
    .withIndex("by_startsAt", (q) =>
      q
        .gte("startsAt", now - NOW_PLAYING_LOOKBEHIND_MS)
        .lt("startsAt", now + NOW_PLAYING_LOOKAHEAD_MS)
    )
    .collect();
  return rows.filter((b) => b.endsAt > now);
}

/**
 * A broadcast as a reader sees it: its title, host and artwork resolved, with
 * the program's own host and image standing in where the row has none
 * (AC-22, Value sourcing).
 */
async function presentBroadcast(ctx: QueryCtx, b: Doc<"radioBroadcasts">) {
  const program = b.programId ? await ctx.db.get(b.programId) : null;

  let host: string | undefined;
  if (b.hostUserId) host = hostName(await ctx.db.get(b.hostUserId));
  else if (b.hostGuestName) host = b.hostGuestName;
  else if (program?.hostUserId) {
    host = hostName(await ctx.db.get(program.hostUserId));
  } else if (program?.hostGuestName) host = program.hostGuestName;

  return {
    _id: b._id,
    title: program?.name ?? b.oneOffName ?? RADIO_AUTO_BROADCAST_FALLBACK_TITLE,
    host: host ?? null,
    description: program?.description ?? null,
    origin: b.origin,
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    programId: b.programId ?? null,
    seedKey: program?.seedKey ?? null,
    imageUrl: (await resolveMediaUrl(program?.imageKey)) ?? null,
  };
}

/**
 * The broadcast a prayer request or testimony arrives during (AC-28, AC-29),
 * or null when nothing is on air. "On air" is what a reader is shown (the
 * derived status, override included, so the server agrees with the phone's
 * enabled buttons) being anything but Off air, with a broadcast covering now
 * by the overlap order. Stream interrupted counts: the broadcast is still on,
 * only its audio dropped.
 */
export async function onAirBroadcast(
  ctx: QueryCtx | MutationCtx,
  now: number
): Promise<Doc<"radioBroadcasts"> | null> {
  const status = deriveRadioStatus(statusReading(await getStatusRow(ctx)), now);
  if (status === "off_air") return null;
  return resolveCurrentBroadcast(await broadcastsAround(ctx, now), now) ?? null;
}

// ── Reader queries ────────────────────────────────────────────────────────

/**
 * What the player needs to open the stream (Value sourcing). Read from Convex
 * env vars so the url changes without an app release. Null for a signed out
 * caller, so a reactive subscription survives sign out.
 */
export const getPlaybackConfig = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getCurrentUser(ctx))) return null;
    const streamUrl = process.env.RADIO_STREAM_URL?.trim() || null;
    const origin = process.env.PORTAL_ORIGIN?.trim().replace(/\/+$/, "");
    return {
      streamUrl,
      ...(origin ? { cityLookupUrl: `${origin}/api/where` } : {}),
      // Where the lock screen fetches program artwork when a program has no
      // uploaded image (spec 0020): the portal serves copies of the bundled
      // program photos at /radio/<seedKey>.jpg and /radio/default.jpg,
      // because Android loads notification artwork only from a web address.
      ...(origin ? { artworkBaseUrl: `${origin}/radio/` } : {}),
    };
  },
});

/**
 * The Now segment and Home's Live now card (AC-3, AC-7, AC-15, AC-35).
 *
 * Returns the raw status reading so the phone derives the status itself, the
 * server's own derivation for convenience, the override banner, the in app
 * listener figure from the status row (never from the beats), and the few
 * broadcasts around now so the phone decides current and next with its own
 * clock and the rollover never waits for a server write.
 */
export const getNowPlaying = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getCurrentUser(ctx))) return null;
    const now = Date.now();
    const row = await getStatusRow(ctx);
    const around = await broadcastsAround(ctx, now);

    const current = resolveCurrentBroadcast(around, now);
    const next = resolveNextBroadcast(around, now);
    // The rows the phone resolves from: everything running now, plus the next
    // few starts, so a rollover inside the next hours needs no refetch.
    const shortlist = around.slice(0, NOW_PLAYING_ROW_CAP);
    for (const b of [current, next]) {
      if (b && !shortlist.some((s) => s._id === b._id)) shortlist.push(b);
    }

    return {
      reading: statusReading(row),
      status: deriveRadioStatus(statusReading(row), now),
      override: await overrideSummary(ctx, row),
      inAppListeners: row?.inAppListeners ?? 0,
      broadcasts: await Promise.all(
        shortlist.map((b) => presentBroadcast(ctx, b))
      ),
      currentId: current?._id ?? null,
      nextId: next?._id ?? null,
      serverNow: now,
    };
  },
});

/**
 * The mobile Recordings segment (AC-27): newest upload first, optionally one
 * program only, a page at a time (the phone asks for twenty). No playback url
 * here: a url signed inside a live query keeps being handed out after it
 * expires by a screen left open, so the phone asks `getRecordingUrl` at the
 * moment someone taps play. A signed out caller gets an empty, finished page
 * so the subscription survives sign out.
 */
export const listRecordings = query({
  args: {
    programId: v.optional(v.id("radioPrograms")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { programId, paginationOpts }) => {
    if (!(await getCurrentUser(ctx))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = programId
      ? await ctx.db
          .query("radioBroadcasts")
          .withIndex("by_programId_recordingUploadedAt", (q) =>
            q.eq("programId", programId).gt("recordingUploadedAt", 0)
          )
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("radioBroadcasts")
          .withIndex("by_recordingUploadedAt", (q) => q.gt("recordingUploadedAt", 0))
          .order("desc")
          .paginate(paginationOpts);

    const page = await Promise.all(
      result.page
        .filter((b) => b.recording !== undefined)
        .map(async (b) => {
          const recording = b.recording!;
          return {
            ...(await presentBroadcast(ctx, b)),
            durationSeconds: recording.durationSeconds ?? null,
            uploadedAt: recording.uploadedAt,
          };
        })
    );
    return { ...result, page };
  },
});

/**
 * A recording's playback url, signed for an hour from the stored key at the
 * moment someone taps play (AC-27). Never stored. Null when signed out or
 * when the broadcast has no recording any more.
 */
export const getRecordingUrl = query({
  args: { broadcastId: v.id("radioBroadcasts") },
  handler: async (ctx, { broadcastId }) => {
    if (!(await getCurrentUser(ctx))) return null;
    const b = await ctx.db.get(broadcastId);
    if (!b?.recording) return null;
    return await signedKeyUrl(b.recording.key, RADIO_RECORDING_URL_TTL_SECONDS);
  },
});

/**
 * The Media Radio page's live status bar (AC-6, AC-15): the derived status,
 * the override with who set it, both listener figures, and when the last
 * probe ran and whether it reached the stream. Null to anyone without
 * `manageRadio`.
 */
export const getMediaRadioStatus = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getRadioAuthorityOrNull(ctx))) return null;
    const now = Date.now();
    const row = await getStatusRow(ctx);
    const around = await broadcastsAround(ctx, now);
    const current = resolveCurrentBroadcast(around, now);
    return {
      reading: statusReading(row),
      status: deriveRadioStatus(statusReading(row), now),
      override: await overrideSummary(ctx, row),
      inAppListeners: row?.inAppListeners ?? 0,
      streamListeners: row?.streamListeners ?? null,
      streamTitle: row?.streamTitle ?? null,
      lastProbeAt: row?.lastProbeAt ?? null,
      lastProbeOk: row?.lastProbeOk ?? null,
      probeError: row?.probeError ?? null,
      current: current ? await presentBroadcast(ctx, current) : null,
      configured: !!process.env.RADIO_STATUS_URL && !!process.env.RADIO_STREAM_URL,
    };
  },
});

/** How many recent broadcasts the dashboard looks back through for one with listeners. */
const DASHBOARD_LAST_BROADCAST_SCAN = 60;

/**
 * Media's dashboard (AC-34, SRS 4.9.3): three cards, each null when it has
 * nothing to report so the page shows an empty state rather than zeros.
 *
 * 1. Live status: the reading the page derives again with its own clock, the
 *    override with who set it, and what is on now.
 * 2. The last broadcast: the most recent one that has finished, was not
 *    cancelled and had at least one listening stretch, with its unique
 *    listeners and hours summed over every stretch against it.
 * 3. The devotional warning: whether tomorrow's Kampala date has no
 *    devotional. The table has no draft state, so a row existing is the whole
 *    answer.
 *
 * Null without `manageRadio`.
 */
export const getMediaDashboard = query({
  args: {},
  handler: async (ctx) => {
    const user = await getRadioAuthorityOrNull(ctx);
    if (!user) return null;
    const now = Date.now();

    const row = await getStatusRow(ctx);
    const current = resolveCurrentBroadcast(await broadcastsAround(ctx, now), now);

    let lastBroadcast: {
      broadcast: Awaited<ReturnType<typeof presentBroadcast>>;
      uniqueListeners: number;
      hours: number;
    } | null = null;
    const recent = await ctx.db
      .query("radioBroadcasts")
      .withIndex("by_startsAt", (q) => q.lt("startsAt", now))
      .order("desc")
      .take(DASHBOARD_LAST_BROADCAST_SCAN);
    for (const b of recent) {
      if (b.endsAt > now || b.status === "cancelled") continue;
      const stretches = await ctx.db
        .query("listeningSessions")
        .withIndex("by_broadcastId", (q) => q.eq("broadcastId", b._id))
        .collect();
      if (stretches.length === 0) continue;
      const seconds = stretches.reduce((sum, s) => sum + s.seconds, 0);
      lastBroadcast = {
        broadcast: await presentBroadcast(ctx, b),
        uniqueListeners: new Set(stretches.map((s) => s.userId)).size,
        hours: Math.round((seconds / 3600) * 10) / 10,
      };
      break;
    }

    const tomorrowKey = kampalaDateKeyAt(kampalaDayStartAt(now) + 24 * 60 * MINUTE_MS);
    const tomorrowDevotional = await ctx.db
      .query("devotionals")
      .withIndex("by_date", (q) => q.eq("date", tomorrowKey))
      .first();
    // Devotionals stay with Media's leaders, so only they get the link.
    const canManageDevotionals =
      (await isActiveSystemAdmin(ctx, user._id)) ||
      (await hasActiveDepartmentRole(ctx, user._id, await getMediaDepartmentId(ctx), [
        "hod",
        "department_admin",
      ]));

    return {
      live: {
        reading: statusReading(row),
        override: await overrideSummary(ctx, row),
        inAppListeners: row?.inAppListeners ?? 0,
        current: current ? await presentBroadcast(ctx, current) : null,
      },
      lastBroadcast,
      devotional: tomorrowDevotional ? null : { missingDate: tomorrowKey, canManageDevotionals },
    };
  },
});

// ── The schedule (AC-8, AC-19, AC-20, AC-21) ─────────────────────────────

/**
 * Rows for the seven day schedule (AC-8): one still running from yesterday
 * included, anything already over left out, cancelled rows kept so they can
 * be shown marked Cancelled. Start order.
 */
async function scheduleRows(ctx: QueryCtx, now: number) {
  const { readFrom, until } = radioScheduleWindow(now);
  const rows = await ctx.db
    .query("radioBroadcasts")
    .withIndex("by_startsAt", (q) => q.gte("startsAt", readFrom).lt("startsAt", until))
    .collect();
  return rows.filter((b) => b.endsAt > now);
}

/**
 * The member Schedule segment (AC-8, AC-10): the next seven days from now,
 * each row with its program, host, length, status and the caller's effective
 * follow state. The phone groups the rows under Kampala day headings and
 * decides which one is current with its own clock (AC-7).
 */
export const listSchedule = query({
  args: { fromAt: v.optional(v.number()) },
  handler: async (ctx, { fromAt }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const now = fromAt ?? Date.now();
    const rows = await scheduleRows(ctx, now);

    const follows = await ctx.db
      .query("radioProgramFollows")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const choiceByProgram = new Map(follows.map((f) => [f.programId, f]));
    const defaults = new Map<Id<"radioPrograms">, boolean>();

    return await Promise.all(
      rows.map(async (b) => {
        let isFollowed: boolean | null = null;
        if (b.programId) {
          if (!defaults.has(b.programId)) {
            const program = await ctx.db.get(b.programId);
            defaults.set(b.programId, program?.followedByDefault ?? false);
          }
          isFollowed = effectiveRadioFollow(
            choiceByProgram.get(b.programId),
            defaults.get(b.programId)!
          );
        }
        return {
          ...(await presentBroadcast(ctx, b)),
          durationMinutes: Math.round((b.endsAt - b.startsAt) / MINUTE_MS),
          isFollowed,
        };
      })
    );
  },
});

/**
 * The Media Radio page's week (AC-20, AC-21, AC-22): from the start of today
 * in Kampala to seven days out, cancelled rows included, with what the forms
 * need to adjust, cancel, restore or rename each one. Null without
 * `manageRadio`.
 */
export const listMediaWeek = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getRadioAuthorityOrNull(ctx))) return null;
    const now = Date.now();
    const from = kampalaDayStartAt(now);
    const { readFrom, until } = radioScheduleWindow(now);
    const rows = (
      await ctx.db
        .query("radioBroadcasts")
        .withIndex("by_startsAt", (q) =>
          q.gte("startsAt", readFrom).lt("startsAt", until)
        )
        .collect()
    ).filter((b) => b.startsAt >= from || b.endsAt > now);

    return await Promise.all(
      rows.map(async (b) => {
        const program = b.programId ? await ctx.db.get(b.programId) : null;
        return {
          ...(await presentBroadcast(ctx, b)),
          oneOffName: b.oneOffName ?? null,
          adjusted: b.adjusted,
          isRecorded: b.isRecorded,
          hasRecording: b.recording !== undefined,
          isSuperT: program ? isSuperTProgram(program) : false,
          hostUserId: b.hostUserId ?? null,
          hostGuestName: b.hostGuestName ?? null,
          hostInherited: !b.hostUserId && !b.hostGuestName,
        };
      })
    );
  },
});

/**
 * The nightly materialisation (AC-19), at 21:30 UTC which is 00:30 Kampala:
 * every active weekly program's missing airings up to the end of the Kampala
 * day seven days out. Insert only, so running it twice changes nothing, and
 * it never touches a row a person adjusted, cancelled or recorded. Occasional
 * programs are never written ahead.
 */
export const materialiseBroadcasts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const programs = await ctx.db
      .query("radioPrograms")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();
    let inserted = 0;
    for (const program of programs) {
      inserted += await materialiseProgram(ctx, program, now);
    }
    return { programs: programs.length, inserted };
  },
});

// ── The override (AC-6) ───────────────────────────────────────────────────

/**
 * Force Live or Off air. Changes only what readers are shown: it never opens
 * a broadcast, never fires a follow push and never changes what listening
 * attaches to, all of which key on the probe's own finding. It has no expiry
 * and survives until a person clears it.
 */
export const setOverride = mutation({
  args: { state: vRadioOverrideState },
  handler: async (ctx, { state }) => {
    const actor = await requireRadioAuthority(ctx);
    const now = Date.now();
    const override = { state, byUserId: actor._id, setAt: now };
    const row = await getStatusRow(ctx);
    let statusId: Id<"radioStatus">;
    if (row) {
      statusId = row._id;
      await ctx.db.patch(row._id, { override });
    } else {
      // No probe has run yet. The row it would have created is written here
      // with a reading that is already stale, so only the override shows.
      statusId = await ctx.db.insert("radioStatus", {
        detected: "off_air",
        lastProbeAt: 0,
        lastProbeOk: false,
        inAppListeners: 0,
        override,
      });
    }
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "radio.override_set",
      targetType: RADIO_TARGET_TYPES.status,
      targetId: statusId,
      metadata: { state, previous: row?.override?.state ?? null },
      departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
    });
    return null;
  },
});

/** Return to automatic. Refused when there is no override to clear. */
export const clearOverride = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRadioAuthority(ctx);
    const row = await getStatusRow(ctx);
    if (!row?.override) refuse("RADIO_NO_OVERRIDE");
    await ctx.db.patch(row._id, { override: undefined });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "radio.override_cleared",
      targetType: RADIO_TARGET_TYPES.status,
      targetId: row._id,
      metadata: {
        state: row.override.state,
        setBy: row.override.byUserId,
        setAt: row.override.setAt,
      },
      departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
    });
    return null;
  },
});

// ── The probe (AC-5, AC-17, AC-39) ────────────────────────────────────────

/** One mount as Caster FM's (Icecast style) `publicstats.json` describes it. */
interface StatsSource {
  listenurl?: string;
  listeners?: number;
  "display-title"?: string;
  title?: string;
}

type ProbeFinding =
  | {
      outcome: "live";
      streamListeners?: number;
      streamTitle?: string;
      fromFallback: boolean;
    }
  | { outcome: "off_air"; streamListeners?: number }
  | { outcome: "unknown"; error: string };

/** The `source` entries of a stats body, whichever shape it arrived in. */
function statsSources(body: unknown): StatsSource[] | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const holder =
    root.icestats && typeof root.icestats === "object"
      ? (root.icestats as Record<string, unknown>)
      : root;
  // Recognisable as a stats document at all? Icecast always carries
  // `icestats`; a body with neither that nor `source` is not one, and is read
  // as a failure rather than as "no source", which would invent Off air.
  if (!("icestats" in root) && !("source" in holder)) return null;
  const source = holder.source;
  if (source === undefined || source === null) return [];
  if (Array.isArray(source)) return source as StatsSource[];
  if (typeof source === "object") return [source as StatsSource];
  return [];
}

/** The path of a stream url, `/listen.mp3`, or null when it is not a url. */
function mountPath(url: string): string | null {
  try {
    return new URL(url.trim()).pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return null;
  }
}

/**
 * Our mount among the sources the server lists. Matched on the mount PATH,
 * because the server lists `http://host:port/listen.mp3` while the app plays
 * `https://host:port/listen.mp3?authn...` with the station's listener pass.
 * With a stream url set and no mount matching, there is no source of ours:
 * another mount being up (a fallback, an AutoDJ) never reads as us being
 * Live. Without a stream url there is nothing to match, so the only mount.
 */
function chooseMount(
  sources: StatsSource[],
  streamUrl: string | undefined
): StatsSource | undefined {
  if (sources.length === 0) return undefined;
  const target = streamUrl ? mountPath(streamUrl) : null;
  if (!target) return sources.length === 1 ? sources[0] : undefined;
  return sources.find(
    (s) => typeof s.listenurl === "string" && mountPath(s.listenurl) === target
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The guarded byte fallback (Value sourcing): a ranged request to the stream
 * itself, abandoned after the headers, counting as live only when it answers
 * with an audio content type. Anything else is "could not tell", never Off
 * air, because a broken statistics url must not read as a silent radio.
 */
async function probeStreamBytes(streamUrl: string): Promise<boolean> {
  const response = await fetchWithTimeout(
    streamUrl,
    { method: "GET", headers: { Range: "bytes=0-1023" } },
    RADIO_PROBE_FALLBACK_TIMEOUT_MS
  );
  try {
    const type = response.headers.get("content-type") ?? "";
    return response.ok && /^audio\//i.test(type.trim());
  } finally {
    // An Icecast mount ignores Range and streams forever; never read it.
    await response.body?.cancel().catch(() => undefined);
  }
}

async function readStream(): Promise<ProbeFinding> {
  const statusUrl = process.env.RADIO_STATUS_URL?.trim();
  const streamUrl = process.env.RADIO_STREAM_URL?.trim();
  if (!statusUrl && !streamUrl) {
    return { outcome: "unknown", error: "RADIO_STATUS_URL and RADIO_STREAM_URL are unset" };
  }

  let statsError = "RADIO_STATUS_URL is unset";
  if (statusUrl) {
    try {
      const response = await fetchWithTimeout(
        statusUrl,
        { headers: { Accept: "application/json" } },
        RADIO_PROBE_FALLBACK_TIMEOUT_MS
      );
      if (!response.ok) throw new Error(`stats answered ${response.status}`);
      const sources = statsSources(await response.json());
      if (!sources) throw new Error("stats body is not a publicstats document");
      const mount = chooseMount(sources, streamUrl);
      if (!mount) return { outcome: "off_air" };
      const listeners =
        typeof mount.listeners === "number" && Number.isFinite(mount.listeners)
          ? mount.listeners
          : undefined;
      const title = (mount["display-title"] ?? mount.title)?.toString().trim();
      return {
        outcome: "live",
        streamListeners: listeners,
        streamTitle: title || undefined,
        fromFallback: false,
      };
    } catch (error) {
      statsError = error instanceof Error ? error.message : String(error);
    }
  }

  if (streamUrl) {
    try {
      if (await probeStreamBytes(streamUrl)) {
        return { outcome: "live", fromFallback: true };
      }
      return { outcome: "unknown", error: `${statsError}; stream answered without audio` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { outcome: "unknown", error: `${statsError}; stream: ${reason}` };
    }
  }
  return { outcome: "unknown", error: statsError };
}

/**
 * Probe the stream once and record what it found (AC-5).
 *
 * The minute cron calls this with `scheduleBurst`, and while the status is
 * Live or a broadcast window is open that same run schedules two more probes,
 * at twenty and forty seconds. Those two are called WITHOUT the flag, so no
 * probe ever schedules another: a probe that throws costs one reading and
 * never stops the loop, because the next minute's cron starts it again.
 */
export const probeStream = internalAction({
  args: { scheduleBurst: v.optional(v.boolean()) },
  handler: async (ctx, { scheduleBurst }) => {
    let finding: ProbeFinding;
    try {
      finding = await readStream();
    } catch (error) {
      finding = {
        outcome: "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const result = await ctx.runMutation(internal.radio.recordProbe, {
      outcome: finding.outcome,
      streamListeners:
        finding.outcome === "unknown" ? undefined : finding.streamListeners,
      streamTitle: finding.outcome === "live" ? finding.streamTitle : undefined,
      error: finding.outcome === "unknown" ? finding.error : undefined,
    });

    // Once per outage, not once per probe (AC-39): only the probe that turns
    // a reachable stream into an unreachable one reports.
    if (result.outageStarted && finding.outcome === "unknown") {
      await reportError(ctx, new Error(`Radio probe failed: ${finding.error}`), {
        fn: "radio.probeStream",
      });
    }

    if (scheduleBurst && result.burst) {
      for (const offset of RADIO_BURST_PROBE_OFFSETS_MS) {
        await ctx.scheduler.runAfter(offset, internal.radio.probeStream, {});
      }
    }
    return null;
  },
});

/**
 * Write one probe's finding (AC-5, AC-17, AC-39).
 *
 * Writes `lastProbeAt` on every run, which is what makes a subscribed reader
 * derive again. A probe that could not reach the stream records `unknown` and
 * leaves `lastLiveAt` in place rather than inventing a finding. A live finding
 * opens or extends the one `auto` broadcast when nothing covers now; the
 * `auto` row closes only once the derived status reaches Off air, so a drop
 * and return inside the five minute grace keeps one row.
 *
 * The override is ignored throughout: it changes what readers are shown, and
 * nothing here (auto rows, `wentLiveAt`, the N33 push) keys on
 * it (AC-6).
 */
/**
 * N33's delivery (spec 0019, AC-11), scheduled by the probe that marked the
 * broadcast. Separate from the probe's write so a failure here can never roll
 * back a status reading.
 */
export const sendLivePush = internalMutation({
  args: { broadcastId: v.id("radioBroadcasts") },
  handler: async (ctx, { broadcastId }) => {
    await deliverLivePush(ctx, broadcastId);
    return null;
  },
});

export const recordProbe = internalMutation({
  args: {
    outcome: v.union(v.literal("live"), v.literal("off_air"), v.literal("unknown")),
    streamListeners: v.optional(v.number()),
    streamTitle: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await getStatusRow(ctx);
    const detected: RadioDetectedState = args.outcome;
    const ok = args.outcome !== "unknown";
    const lastLiveAt = args.outcome === "live" ? now : row?.lastLiveAt;

    const inAppListeners = await countInAppListeners(ctx, now);

    const around = await broadcastsAround(ctx, now);
    let current = resolveCurrentBroadcast(around, now);

    if (args.outcome === "live") {
      current = await openOrExtendAuto(ctx, around, current, args.streamTitle, now);
      if (current && current.wentLiveAt === undefined) {
        await ctx.db.patch(current._id, { wentLiveAt: now });
      }
      // N33, once per broadcast, tested and set in this same write (AC-11).
      await sendDueLivePushes(ctx, around, now);
    }

    // Reading the PROBE's own state, with no override, so a forced status
    // can neither keep an auto row open nor close one.
    const derived = deriveRadioStatus(
      { detected, lastProbeAt: now, lastLiveAt },
      now
    );
    if (derived === "off_air") await closeOpenAuto(ctx, around, lastLiveAt, now);

    const patch = {
      detected,
      lastProbeAt: now,
      lastProbeOk: ok,
      probeError: ok ? undefined : args.error?.slice(0, 500),
      lastLiveAt,
      inAppListeners,
      // A failed probe keeps the last figures it had rather than zeroing them.
      streamListeners: ok ? args.streamListeners : row?.streamListeners,
      streamTitle:
        args.outcome === "live"
          ? args.streamTitle
          : ok
            ? undefined
            : row?.streamTitle,
      currentBroadcastId:
        derived === "off_air" ? undefined : (current?._id ?? row?.currentBroadcastId),
    };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("radioStatus", patch);

    // Burst while the probe sees Live or any broadcast window is open.
    const windowOpen = around.some(
      (b) =>
        b.status !== "cancelled" &&
        now >= b.startsAt - RADIO_LIVE_PUSH_LEAD_MS &&
        now < b.endsAt
    );
    return {
      burst: derived === "live" || windowOpen,
      outageStarted: !ok && (row === null || row.lastProbeOk),
    };
  },
});

/** Distinct users whose last beat is inside the last sixty seconds (AC-15). */
async function countInAppListeners(ctx: MutationCtx, now: number) {
  const recent = await ctx.db
    .query("listeningSessions")
    .withIndex("by_lastBeatAt", (q) =>
      q.gte("lastBeatAt", now - RADIO_LISTENER_WINDOW_MS)
    )
    .collect();
  return new Set(recent.filter((s) => s.closedAt === undefined).map((s) => s.userId))
    .size;
}

/**
 * The `auto` opener and extender (AC-17). Opens a row only when no scheduled,
 * one off or auto broadcast covers now, so a second auto row never opens while
 * anything covers now. A covering auto row is extended to an hour out.
 */
async function openOrExtendAuto(
  ctx: MutationCtx,
  around: Doc<"radioBroadcasts">[],
  current: Doc<"radioBroadcasts"> | null,
  streamTitle: string | undefined,
  now: number
): Promise<Doc<"radioBroadcasts"> | null> {
  const coveringAuto = around.find(
    (b) =>
      b.origin === "auto" &&
      b.status !== "cancelled" &&
      b.startsAt <= now &&
      now < b.endsAt
  );
  if (coveringAuto) {
    // A scheduled or one off row has taken over: leave the auto row to end at
    // its own `endsAt` rather than stretching it alongside the real show.
    if (current && current._id !== coveringAuto._id) return current;
    // Extend only once the end is near, not on every probe: each write wakes
    // every open schedule screen. And never past the longest a broadcast may
    // run, because every lookup looks back that far by start; at the cap the
    // row ends and the next live probe opens a fresh one.
    let endsAt = coveringAuto.endsAt;
    if (coveringAuto.endsAt - now <= AUTO_EXTEND_WHEN_WITHIN_MS) {
      endsAt = Math.min(
        now + RADIO_AUTO_BROADCAST_EXTEND_MS,
        coveringAuto.startsAt + RADIO_BROADCAST_MAX_MS
      );
      if (endsAt !== coveringAuto.endsAt) {
        await ctx.db.patch(coveringAuto._id, { endsAt });
      }
    }
    return current ?? { ...coveringAuto, endsAt };
  }
  if (current) return current;

  const id = await ctx.db.insert("radioBroadcasts", {
    // The stream's own title, else the fixed fallback. Stored as the one off
    // name so the "exactly one of programId and oneOffName" rule holds, and
    // Media can rename it or attach it to a program afterwards.
    oneOffName: streamTitle || RADIO_AUTO_BROADCAST_FALLBACK_TITLE,
    origin: "auto",
    startsAt: now,
    endsAt: now + RADIO_AUTO_BROADCAST_EXTEND_MS,
    isRecorded: false,
    status: "scheduled",
    adjusted: false,
  });
  return await ctx.db.get(id);
}

/**
 * Close the open `auto` row once the derived status reaches Off air (AC-17),
 * ending it at the last live reading so its length is the time actually on
 * air rather than the hour of headroom it was given.
 */
async function closeOpenAuto(
  ctx: MutationCtx,
  around: Doc<"radioBroadcasts">[],
  lastLiveAt: number | undefined,
  now: number
) {
  for (const b of around) {
    if (b.origin !== "auto" || b.endsAt <= now) continue;
    const endsAt = Math.min(now, Math.max(b.startsAt + 1, lastLiveAt ?? now));
    await ctx.db.patch(b._id, { endsAt });
  }
}

// ── Listening (AC-12 to AC-16) ────────────────────────────────────────────

/**
 * The phone's beat while audio is actually playing, every thirty seconds
 * (AC-12). It names only its device, and its city when it has one. The
 * server resolves the broadcast and credits the time from its own clock.
 * Signed in only, a visitor counting the same as a member.
 */
export const beat = mutation({
  args: {
    deviceId: v.string(),
    city: v.optional(v.string()),
    stopped: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await applyBeat(ctx, user._id, args, Date.now());
  },
});

/**
 * The listening sweep, every minute (AC-13): closes stretches whose last beat
 * is over ninety seconds old, at that last beat, so a phone that died or was
 * force quit accrues nothing further.
 */
export const sweepListening = internalMutation({
  args: {},
  handler: async (ctx) => ({ closed: await sweepStaleStretches(ctx, Date.now()) }),
});
