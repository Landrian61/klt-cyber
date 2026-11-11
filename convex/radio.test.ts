import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveRadioStatus } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import { internal } from "./_generated/api";

/**
 * The probe's write rules (spec 0019, build slice 4): what `recordProbe`
 * stores for each finding, and the `auto` broadcast it opens, extends and
 * closes (AC-5, AC-17, AC-39). The fetch itself is not exercised here; these
 * are the rules that decide what a finding means.
 */

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0); // 12:00 Kampala

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

async function status(t: ReturnType<typeof testConvex>) {
  return await t.run((ctx) => ctx.db.query("radioStatus").first());
}
async function broadcasts(t: ReturnType<typeof testConvex>) {
  return await t.run((ctx) => ctx.db.query("radioBroadcasts").collect());
}

describe("recordProbe", () => {
  it("creates the status row lazily and records a live finding", async () => {
    const t = testConvex();
    expect(await status(t)).toBeNull();
    await t.mutation(internal.radio.recordProbe, {
      outcome: "live",
      streamListeners: 12,
      streamTitle: "Morning Glory",
    });
    const row = await status(t);
    expect(row).toMatchObject({
      detected: "live",
      lastProbeAt: T0,
      lastLiveAt: T0,
      lastProbeOk: true,
      streamListeners: 12,
    });
  });

  it("keeps the last live reading when the stream cannot be reached", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, { outcome: "live", streamListeners: 9 });
    vi.setSystemTime(T0 + MIN);
    const first = await t.mutation(internal.radio.recordProbe, {
      outcome: "unknown",
      error: "timeout",
    });
    const row = await status(t);
    expect(row).toMatchObject({
      detected: "unknown",
      lastLiveAt: T0,
      lastProbeAt: T0 + MIN,
      lastProbeOk: false,
      probeError: "timeout",
      streamListeners: 9,
    });
    // The first failure starts an outage; the next one does not report again.
    expect(first.outageStarted).toBe(true);
    vi.setSystemTime(T0 + 2 * MIN);
    const second = await t.mutation(internal.radio.recordProbe, {
      outcome: "unknown",
      error: "timeout",
    });
    expect(second.outageStarted).toBe(false);
    // Inside the grace, an unreachable stream reads Interrupted.
    expect(deriveRadioStatus(await status(t), T0 + 2 * MIN)).toBe("interrupted");
  });

  it("opens one auto broadcast titled from the stream when nothing covers now", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, {
      outcome: "live",
      streamTitle: "Prayer night",
    });
    const rows = await broadcasts(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origin: "auto",
      oneOffName: "Prayer night",
      startsAt: T0,
      endsAt: T0 + 60 * MIN,
      wentLiveAt: T0,
      isRecorded: false,
    });
  });

  it("falls back to the fixed title, and extends rather than duplicating", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    vi.setSystemTime(T0 + 30 * MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    const rows = await broadcasts(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].oneOffName).toBe("Unscheduled broadcast");
    expect(rows[0].endsAt).toBe(T0 + 90 * MIN);
  });

  it("leaves the auto row alone until its end is near", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    vi.setSystemTime(T0 + 10 * MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    expect((await broadcasts(t))[0].endsAt).toBe(T0 + 60 * MIN);
  });

  it("caps an auto row at a full day, then opens a fresh one", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    // Live probes all day long: the row extends, but never past 24 hours.
    for (let m = 40; m < 24 * 60; m += 40) {
      vi.setSystemTime(T0 + m * MIN);
      await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    }
    let rows = await broadcasts(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].endsAt).toBe(T0 + 24 * 60 * MIN);
    vi.setSystemTime(T0 + 24 * 60 * MIN + MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    rows = await broadcasts(t);
    expect(rows).toHaveLength(2);
    expect(rows[1].startsAt).toBe(T0 + 24 * 60 * MIN + MIN);
  });

  it("keeps one auto row through a drop and return inside the grace", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    vi.setSystemTime(T0 + 2 * MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "off_air" });
    vi.setSystemTime(T0 + 4 * MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    expect(await broadcasts(t)).toHaveLength(1);
  });

  it("closes the auto row at the last live reading once the status is Off air", async () => {
    const t = testConvex();
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    vi.setSystemTime(T0 + 10 * MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    vi.setSystemTime(T0 + 16 * MIN); // six minutes after the last live reading
    await t.mutation(internal.radio.recordProbe, { outcome: "off_air" });
    const [row] = await broadcasts(t);
    expect(row.endsAt).toBe(T0 + 10 * MIN);
    expect((await status(t))?.currentBroadcastId).toBeUndefined();
    // A source returning later opens a fresh row.
    vi.setSystemTime(T0 + 30 * MIN);
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    expect(await broadcasts(t)).toHaveLength(2);
  });

  it("never opens an auto row while a scheduled broadcast covers now", async () => {
    const t = testConvex();
    const id = await t.run((ctx) =>
      ctx.db.insert("radioBroadcasts", {
        oneOffName: "Crusade",
        origin: "oneOff",
        startsAt: T0 - 10 * MIN,
        endsAt: T0 + 50 * MIN,
        isRecorded: true,
        status: "scheduled",
        adjusted: true,
      })
    );
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    const rows = await broadcasts(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].wentLiveAt).toBe(T0);
    expect((await status(t))?.currentBroadcastId).toBe(id);
  });

  it("opens an auto row when the only covering broadcast is cancelled", async () => {
    const t = testConvex();
    await t.run((ctx) =>
      ctx.db.insert("radioBroadcasts", {
        oneOffName: "Called off",
        origin: "oneOff",
        startsAt: T0 - 10 * MIN,
        endsAt: T0 + 50 * MIN,
        isRecorded: false,
        status: "cancelled",
        adjusted: true,
      })
    );
    await t.mutation(internal.radio.recordProbe, { outcome: "live" });
    const rows = await broadcasts(t);
    expect(rows.filter((b) => b.origin === "auto")).toHaveLength(1);
  });

  it("bursts while live or while a broadcast window is open, not otherwise", async () => {
    const t = testConvex();
    const quiet = await t.mutation(internal.radio.recordProbe, { outcome: "off_air" });
    expect(quiet.burst).toBe(false);
    await t.run((ctx) =>
      ctx.db.insert("radioBroadcasts", {
        oneOffName: "Soon",
        origin: "oneOff",
        startsAt: T0 + 10 * MIN, // inside the fifteen minute lead
        endsAt: T0 + 70 * MIN,
        isRecorded: false,
        status: "scheduled",
        adjusted: true,
      })
    );
    const lead = await t.mutation(internal.radio.recordProbe, { outcome: "off_air" });
    expect(lead.burst).toBe(true);
  });

  it("ignores the override when deciding the auto row", async () => {
    const t = testConvex();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authId: "test:override",
        email: "o@test.org",
        role: "member",
        profileCompleted: true,
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("radioStatus", {
        detected: "off_air",
        lastProbeAt: T0 - MIN,
        lastProbeOk: true,
        inAppListeners: 0,
        override: { state: "live", byUserId: userId, setAt: T0 - MIN },
      })
    );
    const result = await t.mutation(internal.radio.recordProbe, { outcome: "off_air" });
    expect(await broadcasts(t)).toHaveLength(0);
    expect(result.burst).toBe(false);
    // The override survives the probe untouched.
    expect((await status(t))?.override?.state).toBe("live");
  });
});

describe("probeStream's mount choice (review finding)", () => {
  const stream = "https://radio.example.org:43348/listen.mp3?authn0123abcd";
  const stats = (sources: object[]) =>
    new Response(JSON.stringify({ icestats: { source: sources.length === 1 ? sources[0] : sources } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("matches our mount by path, across scheme and the listener pass, as Caster FM lists it", async () => {
    vi.stubEnv("RADIO_STATUS_URL", "https://radio.example.org:43348/status-json.xsl");
    vi.stubEnv("RADIO_STREAM_URL", stream);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        stats([{ listenurl: "http://radio.example.org:43348/listen.mp3", listeners: 7 }])
      )
    );
    const t = testConvex();
    await t.action(internal.radio.probeStream, {});
    expect(await status(t)).toMatchObject({ detected: "live", streamListeners: 7 });
  });

  it("never reads another mount being up as our stream being live", async () => {
    vi.stubEnv("RADIO_STATUS_URL", "https://radio.example.org:43348/status-json.xsl");
    vi.stubEnv("RADIO_STREAM_URL", stream);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        stats([{ listenurl: "http://radio.example.org:43348/autodj.mp3", listeners: 3 }])
      )
    );
    const t = testConvex();
    await t.action(internal.radio.probeStream, {});
    expect(await status(t)).toMatchObject({ detected: "off_air" });
    expect(await broadcasts(t)).toHaveLength(0);
  });
});
