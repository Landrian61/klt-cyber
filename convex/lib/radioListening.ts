import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  RADIO_MAX_DEVICES_PER_BROADCAST,
  RADIO_STRETCH_STALE_MS,
  kampalaDateKeyAt,
  normalizeRadioCity,
  radioBeatCreditSeconds,
  resolveCurrentBroadcast,
  RADIO_BROADCAST_MAX_MS,
} from "@klt-cyber/shared";
import { refuse } from "./radioSchedule";

/**
 * Listening stretches (spec 0019, build slice 6, AC-12 to AC-16).
 *
 * Every figure here is computed from the server's own clock against the
 * stored last beat. The phone only says "I am still playing on this device"
 * (and its city, which is held only while the stretch is open). It never
 * names a broadcast and never claims a number of seconds.
 */

/** How far back a beat or the sweep looks for open stretches. */
const OPEN_LOOKBACK_MS = 60 * 60 * 1000;
/** The most stale stretches one sweep closes. The next minute takes the rest. */
const SWEEP_BATCH = 500;
/** A device id is the app's own random string; anything longer is not one. */
const DEVICE_ID_MAX_LENGTH = 128;

/**
 * Close a stretch: credit its final seconds, clear its city, and add its
 * whole total to the city counter once (AC-13, AC-16). The counter row is
 * keyed by city and the Kampala day the stretch started, and holds no user.
 */
export async function closeStretch(
  ctx: MutationCtx,
  stretch: Doc<"listeningSessions">,
  closedAt: number,
  extraSeconds: number
): Promise<number> {
  const seconds = stretch.seconds + Math.max(0, extraSeconds);
  await ctx.db.patch(stretch._id, {
    seconds,
    lastBeatAt: Math.max(stretch.lastBeatAt, closedAt),
    closedAt,
    city: undefined,
  });
  if (stretch.city && seconds > 0) {
    const dateKey = kampalaDateKeyAt(stretch.startedAt);
    const counter = await ctx.db
      .query("listeningByCity")
      .withIndex("by_city_dateKey", (q) =>
        q.eq("city", stretch.city!).eq("dateKey", dateKey)
      )
      .unique();
    if (counter) await ctx.db.patch(counter._id, { seconds: counter.seconds + seconds });
    else await ctx.db.insert("listeningByCity", { city: stretch.city, dateKey, seconds });
  }
  return seconds;
}

/** Broadcasts that could cover `now`, for the server side resolution. */
async function broadcastsCovering(ctx: MutationCtx, now: number) {
  const rows = await ctx.db
    .query("radioBroadcasts")
    .withIndex("by_startsAt", (q) =>
      q.gte("startsAt", now - RADIO_BROADCAST_MAX_MS).lte("startsAt", now)
    )
    .collect();
  return rows.filter((b) => b.endsAt > now);
}

export interface BeatInput {
  deviceId: string;
  city?: string;
  stopped?: boolean;
}

/**
 * One beat (AC-12 to AC-14). The broadcast is resolved here from the beat's
 * own moment by the overlap order, never passed in.
 *
 * - The first beat of a stretch credits nothing.
 * - Each later beat credits `min(now - lastBeatAt, 45s)`.
 * - A beat marked as stopping credits its final delta and closes.
 * - A beat that has crossed into a different broadcast credits its delta to
 *   the row the last beat fell in, closes it, and opens a new stretch for the
 *   row covering now.
 * - A stretch whose last beat is over ninety seconds old is closed at that
 *   last beat with nothing more, and a new one opens, so a revived phone never
 *   back fills the gap.
 * - A beat that falls in no broadcast credits nothing and opens nothing.
 * - At most five devices per user per broadcast.
 */
export async function applyBeat(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: BeatInput,
  now: number
): Promise<{ secondsSoFar: number; broadcastId: Id<"radioBroadcasts"> | null }> {
  const deviceId = input.deviceId.trim();
  if (!deviceId || deviceId.length > DEVICE_ID_MAX_LENGTH) {
    throw new Error("A device id is required");
  }
  const city = normalizeRadioCity(input.city);
  const current = resolveCurrentBroadcast(await broadcastsCovering(ctx, now), now);

  const open = (
    await ctx.db
      .query("listeningSessions")
      .withIndex("by_lastBeatAt", (q) => q.gte("lastBeatAt", now - OPEN_LOOKBACK_MS))
      .collect()
  ).filter(
    (s) => s.userId === userId && s.deviceId === deviceId && s.closedAt === undefined
  );

  let kept: Doc<"listeningSessions"> | null = null;
  for (const s of open) {
    if (now - s.lastBeatAt > RADIO_STRETCH_STALE_MS) {
      // Swept late or not yet: time stops at the last beat (AC-13).
      await closeStretch(ctx, s, s.lastBeatAt, 0);
      continue;
    }
    const credit = radioBeatCreditSeconds(s.lastBeatAt, now);
    if (!current || s.broadcastId !== current._id || input.stopped || kept) {
      await closeStretch(ctx, s, now, credit);
      continue;
    }
    const seconds = s.seconds + credit;
    await ctx.db.patch(s._id, {
      seconds,
      lastBeatAt: now,
      ...(city ? { city } : {}),
    });
    kept = { ...s, seconds, lastBeatAt: now };
  }

  if (kept) return { secondsSoFar: kept.seconds, broadcastId: kept.broadcastId };
  if (!current || input.stopped) {
    return { secondsSoFar: 0, broadcastId: current?._id ?? null };
  }

  // The device cap (AC-14), counted over every stretch this user has on this
  // broadcast, open or closed, so a sixth phone cannot slip in by taking turns.
  const mine = await ctx.db
    .query("listeningSessions")
    .withIndex("by_userId_broadcastId", (q) =>
      q.eq("userId", userId).eq("broadcastId", current._id)
    )
    .collect();
  const devices = new Set(mine.map((s) => s.deviceId));
  if (!devices.has(deviceId) && devices.size >= RADIO_MAX_DEVICES_PER_BROADCAST) {
    refuse("RADIO_TOO_MANY_DEVICES");
  }

  await ctx.db.insert("listeningSessions", {
    userId,
    deviceId,
    broadcastId: current._id,
    startedAt: now,
    lastBeatAt: now,
    seconds: 0,
    ...(city ? { city } : {}),
  });
  return { secondsSoFar: 0, broadcastId: current._id };
}

/**
 * The sweep (AC-13): close every open stretch whose last beat is more than
 * ninety seconds old, crediting time only up to that last beat, and add its
 * seconds to the city counter once.
 */
export async function sweepStaleStretches(ctx: MutationCtx, now: number): Promise<number> {
  const stale = await ctx.db
    .query("listeningSessions")
    .withIndex("by_lastBeatAt", (q) =>
      q
        .gte("lastBeatAt", now - RADIO_STRETCH_STALE_MS - OPEN_LOOKBACK_MS)
        .lt("lastBeatAt", now - RADIO_STRETCH_STALE_MS)
    )
    .filter((q) => q.eq(q.field("closedAt"), undefined))
    .take(SWEEP_BATCH);
  for (const s of stale) await closeStretch(ctx, s, s.lastBeatAt, 0);
  return stale.length;
}
