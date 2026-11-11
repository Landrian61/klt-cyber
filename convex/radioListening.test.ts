import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { applyBeat, sweepStaleStretches } from "./lib/radioListening";
import { radioFollowers, sendDueLivePushes } from "./lib/radioLivePush";

/**
 * Listening and the follow push (spec 0019, build slices 6 and 7): the beat
 * arithmetic, the device cap, the sweep, the city counter written once per
 * stretch, and N33's window and once per broadcast marker (AC-11 to AC-16).
 */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
// Wednesday 11 November 2026, 12:00 Kampala.
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof testConvex>;

async function user(t: T) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@test.org`,
      role: "member",
      profileCompleted: true,
    })
  );
}

async function program(t: T, followedByDefault = false) {
  return await t.run((ctx) =>
    ctx.db.insert("radioPrograms", {
      name: "Morning Glory",
      nameKey: "morning glory",
      description: "",
      days: [3],
      startTime: "11:00",
      durationMinutes: 120,
      recurrence: "weekly",
      recordByDefault: true,
      followedByDefault,
      isActive: true,
      updatedAt: T0,
    })
  );
}

async function broadcast(
  t: T,
  startsAt: number,
  endsAt: number,
  programId?: Id<"radioPrograms">
) {
  return await t.run((ctx) =>
    ctx.db.insert("radioBroadcasts", {
      ...(programId ? { programId } : { oneOffName: "A one off" }),
      origin: programId ? "scheduled" : "oneOff",
      startsAt,
      endsAt,
      isRecorded: false,
      status: "scheduled",
      adjusted: false,
    })
  );
}

const beatAt = (t: T, userId: Id<"users">, at: number, input: Parameters<typeof applyBeat>[2]) =>
  t.run((ctx) => applyBeat(ctx, userId, input, at));

const stretches = (t: T) => t.run((ctx) => ctx.db.query("listeningSessions").collect());
const cities = (t: T) => t.run((ctx) => ctx.db.query("listeningByCity").collect());

describe("applyBeat", () => {
  it("credits nothing on the first beat, then the capped delta", async () => {
    const t = testConvex();
    const u = await user(t);
    const b = await broadcast(t, T0 - HOUR, T0 + HOUR);
    expect((await beatAt(t, u, T0, { deviceId: "d1" })).secondsSoFar).toBe(0);
    expect((await beatAt(t, u, T0 + 30 * SEC, { deviceId: "d1" })).secondsSoFar).toBe(30);
    // A late beat (75s gap) credits only the 45s cap.
    const late = await beatAt(t, u, T0 + 105 * SEC, { deviceId: "d1" });
    expect(late).toEqual({ secondsSoFar: 75, broadcastId: b });
    expect(await stretches(t)).toHaveLength(1);
  });

  it("resolves the broadcast on the server and opens nothing outside one", async () => {
    const t = testConvex();
    const u = await user(t);
    const res = await beatAt(t, u, T0, { deviceId: "d1" });
    expect(res).toEqual({ secondsSoFar: 0, broadcastId: null });
    expect(await stretches(t)).toHaveLength(0);
  });

  it("a stopping beat credits its final delta and closes the stretch", async () => {
    const t = testConvex();
    const u = await user(t);
    await broadcast(t, T0 - HOUR, T0 + HOUR);
    await beatAt(t, u, T0, { deviceId: "d1" });
    await beatAt(t, u, T0 + 20 * SEC, { deviceId: "d1", stopped: true });
    const [s] = await stretches(t);
    expect(s.seconds).toBe(20);
    expect(s.closedAt).toBe(T0 + 20 * SEC);
  });

  it("splits at the broadcast's end, crediting the old row and opening a new one", async () => {
    const t = testConvex();
    const u = await user(t);
    const a = await broadcast(t, T0 - HOUR, T0 + 10 * SEC);
    const b = await broadcast(t, T0 + 10 * SEC, T0 + HOUR);
    await beatAt(t, u, T0, { deviceId: "d1" });
    const res = await beatAt(t, u, T0 + 30 * SEC, { deviceId: "d1" });
    expect(res.broadcastId).toBe(b);
    const rows = await stretches(t);
    expect(rows.find((s) => s.broadcastId === a)).toMatchObject({ seconds: 30, closedAt: T0 + 30 * SEC });
    expect(rows.find((s) => s.broadcastId === b)).toMatchObject({ seconds: 0 });
  });

  it("counts two devices as two stretches and refuses a sixth device", async () => {
    const t = testConvex();
    const u = await user(t);
    await broadcast(t, T0 - HOUR, T0 + HOUR);
    for (const d of ["d1", "d2", "d3", "d4", "d5"]) await beatAt(t, u, T0, { deviceId: d });
    expect(await stretches(t)).toHaveLength(5);
    await expect(beatAt(t, u, T0, { deviceId: "d6" })).rejects.toThrow();
    // A device already counted may keep beating.
    await expect(beatAt(t, u, T0 + 30 * SEC, { deviceId: "d1" })).resolves.toMatchObject({
      secondsSoFar: 30,
    });
  });

  it("after the stale gap, a beat closes the old stretch at its last beat and opens a new one", async () => {
    const t = testConvex();
    const u = await user(t);
    await broadcast(t, T0 - HOUR, T0 + HOUR);
    await beatAt(t, u, T0, { deviceId: "d1" });
    await beatAt(t, u, T0 + 30 * SEC, { deviceId: "d1" });
    await beatAt(t, u, T0 + 5 * MIN, { deviceId: "d1" });
    const rows = (await stretches(t)).sort((x, y) => x.startedAt - y.startedAt);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ seconds: 30, closedAt: T0 + 30 * SEC });
    expect(rows[1].seconds).toBe(0);
    expect(rows[1].closedAt).toBeUndefined();
  });
});

describe("sweepStaleStretches and the city counter", () => {
  it("closes a stretch at its last beat and adds its seconds to the city once", async () => {
    const t = testConvex();
    const u = await user(t);
    await broadcast(t, T0 - HOUR, T0 + HOUR);
    await beatAt(t, u, T0, { deviceId: "d1", city: " Kampala " });
    await beatAt(t, u, T0 + 30 * SEC, { deviceId: "d1", city: "Kampala" });
    // The phone is force quit. Nothing arrives.
    expect(await t.run((ctx) => sweepStaleStretches(ctx, T0 + 60 * SEC))).toBe(0);
    expect(await t.run((ctx) => sweepStaleStretches(ctx, T0 + 3 * MIN))).toBe(1);
    expect(await t.run((ctx) => sweepStaleStretches(ctx, T0 + 4 * MIN))).toBe(0);

    const [s] = await stretches(t);
    expect(s).toMatchObject({ seconds: 30, closedAt: T0 + 30 * SEC });
    expect(s.city).toBeUndefined();
    const counters = await cities(t);
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({ city: "Kampala", dateKey: "2026-11-11", seconds: 30 });
    expect(Object.keys(counters[0])).not.toContain("userId");
  });

  it("leaves the counter untouched when no city was passed", async () => {
    const t = testConvex();
    const u = await user(t);
    await broadcast(t, T0 - HOUR, T0 + HOUR);
    await beatAt(t, u, T0, { deviceId: "d1" });
    await beatAt(t, u, T0 + 30 * SEC, { deviceId: "d1", stopped: true });
    expect(await cities(t)).toHaveLength(0);
  });
});

describe("N33, the follow push", () => {
  it("resolves followers from choices and the program default", async () => {
    const t = testConvex();
    const [a, b, c] = [await user(t), await user(t), await user(t)];
    const optIn = await program(t, false);
    const byDefault = await program(t, true);
    await t.run(async (ctx) => {
      await ctx.db.insert("radioProgramFollows", { userId: a, programId: optIn, following: true, updatedAt: T0 });
      await ctx.db.insert("radioProgramFollows", { userId: b, programId: byDefault, following: false, updatedAt: T0 });
    });
    const optInList = await t.run(async (ctx) => radioFollowers(ctx, (await ctx.db.get(optIn))!));
    const defaultList = await t.run(async (ctx) => radioFollowers(ctx, (await ctx.db.get(byDefault))!));
    expect(optInList).toEqual([a]);
    expect(new Set(defaultList)).toEqual(new Set([a, c]));
  });

  it("waits for the window, then marks the broadcast once", async () => {
    const t = testConvex();
    const p = await program(t);
    const b = await broadcast(t, T0 + 20 * MIN, T0 + 2 * HOUR, p);
    const send = (at: number) =>
      t.run(async (ctx) => sendDueLivePushes(ctx, [(await ctx.db.get(b))!], at));

    // Soundcheck twenty minutes early: outside the window, nothing.
    expect(await send(T0)).toBe(0);
    // Fourteen minutes before the start: inside the window, once.
    expect(await send(T0 + 6 * MIN)).toBe(1);
    // The source drops and returns: nothing further.
    expect(await send(T0 + 30 * MIN)).toBe(0);
    const row = await t.run((ctx) => ctx.db.get(b));
    expect(row?.livePushSentAt).toBe(T0 + 6 * MIN);
  });

  it("never sends for a cancelled broadcast or one with no program", async () => {
    const t = testConvex();
    const p = await program(t);
    const cancelled = await broadcast(t, T0 - MIN, T0 + HOUR, p);
    await t.run((ctx) => ctx.db.patch(cancelled, { status: "cancelled" }));
    const oneOff = await broadcast(t, T0 - MIN, T0 + HOUR);
    const sent = await t.run(async (ctx) =>
      sendDueLivePushes(ctx, [(await ctx.db.get(cancelled))!, (await ctx.db.get(oneOff))!], T0)
    );
    expect(sent).toBe(0);
  });
});
