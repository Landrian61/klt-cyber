import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RADIO_SEED_PROGRAMS } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import { internal } from "./_generated/api";
import { clearUntouchedFutureRows, materialiseProgram } from "./lib/radioSchedule";

/**
 * The schedule rules (spec 0019, build slice 5): the seed, the nightly
 * materialisation's insert only and hands off rules, and what an edit or a
 * deactivation may rewrite (AC-19, AC-21, AC-23).
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
// Wednesday 11 November 2026, 12:00 Kampala.
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = ReturnType<typeof testConvex>;

async function programBySeed(t: T, seedKey: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("radioPrograms")
      .withIndex("by_seedKey", (q) => q.eq("seedKey", seedKey))
      .first()
  );
}
async function rowsOf(t: T, programId: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("radioBroadcasts").collect())
      .filter((b) => b.programId === programId)
      .sort((a, b) => a.startsAt - b.startsAt)
  );
}

describe("seed.radioPrograms", () => {
  it("creates the eight programs active, and a second run changes nothing", async () => {
    const t = testConvex();
    const first = await t.mutation(internal.seed.radioPrograms, {});
    expect(first.created).toBe(RADIO_SEED_PROGRAMS.length);
    expect(first.broadcastsWritten).toBeGreaterThan(0);

    const programs = await t.run((ctx) => ctx.db.query("radioPrograms").collect());
    expect(programs).toHaveLength(8);
    expect(programs.every((p) => p.isActive)).toBe(true);
    const superT = programs.find((p) => p.seedKey === "super-t")!;
    expect(superT.durationMinutes).toBe(1440);
    expect(superT.recordByDefault).toBe(false);

    const before = await t.run((ctx) => ctx.db.query("radioBroadcasts").collect());
    const second = await t.mutation(internal.seed.radioPrograms, {});
    expect(second).toMatchObject({ created: 0, broadcastsWritten: 0 });
    const after = await t.run((ctx) => ctx.db.query("radioBroadcasts").collect());
    expect(after).toHaveLength(before.length);
  });
});

describe("materialiseBroadcasts", () => {
  it("is insert only: a second run inserts nothing", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    const run = await t.mutation(internal.radio.materialiseBroadcasts, {});
    expect(run.inserted).toBe(0);
  });

  it("never writes ahead an occasional program", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    await t.mutation(internal.radio.materialiseBroadcasts, {});
    const hgn = await programBySeed(t, "holy-ghost-night");
    expect(await rowsOf(t, hgn!._id)).toHaveLength(0);
  });

  it("writes Super T as one full day row, and never records it", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    const superT = await programBySeed(t, "super-t");
    const rows = await rowsOf(t, superT!._id);
    expect(rows).toHaveLength(1); // next Tuesday 06:00 Kampala
    expect(rows[0].endsAt - rows[0].startsAt).toBe(24 * HOUR);
    expect(rows[0].isRecorded).toBe(false);
  });

  it("leaves a moved broadcast alone and does not write its old slot again", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    const midweek = await programBySeed(t, "midweek-service");
    const [today] = await rowsOf(t, midweek!._id);
    // Media moves today's 16:00 Midweek Service to 17:00.
    await t.run((ctx) =>
      ctx.db.patch(today._id, {
        startsAt: today.startsAt + HOUR,
        endsAt: today.endsAt + HOUR,
        adjusted: true,
      })
    );
    const before = await rowsOf(t, midweek!._id);
    const run = await t.mutation(internal.radio.materialiseBroadcasts, {});
    expect(run.inserted).toBe(0);
    const after = await rowsOf(t, midweek!._id);
    expect(after).toHaveLength(before.length);
    expect(after.find((b) => b._id === today._id)?.startsAt).toBe(today.startsAt + HOUR);
  });

  it("writes rows only from now forward, up to the end of the Kampala day seven days out", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    const mg = await programBySeed(t, "morning-glory");
    const rows = await rowsOf(t, mg!._id);
    // Mon, Wed, Thu, Fri at 06:00. Today's Wednesday airing already started.
    // Thu 12, Fri 13, Mon 16, Wed 18: the horizon ends at the close of Wed 18.
    expect(rows.map((b) => new Date(b.startsAt + 3 * HOUR).getUTCDate())).toEqual([
      12, 13, 16, 18,
    ]);
    expect(rows.every((b) => b.startsAt > T0)).toBe(true);
  });
});

describe("clearUntouchedFutureRows", () => {
  it("removes only future rows nobody touched", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    const mg = await programBySeed(t, "morning-glory");
    const [a, b, c] = await rowsOf(t, mg!._id);
    await t.run(async (ctx) => {
      await ctx.db.patch(a._id, { adjusted: true });
      await ctx.db.patch(b._id, { status: "cancelled", adjusted: true });
    });
    // A past airing, which must never be removed.
    const pastId = await t.run((ctx) =>
      ctx.db.insert("radioBroadcasts", {
        programId: mg!._id,
        origin: "scheduled",
        startsAt: T0 - 30 * HOUR,
        endsAt: T0 - 29 * HOUR,
        slotStartsAt: T0 - 30 * HOUR,
        isRecorded: true,
        status: "scheduled",
        adjusted: false,
      })
    );
    const removed = await t.run((ctx) => clearUntouchedFutureRows(ctx, mg!._id, T0));
    const left = (await rowsOf(t, mg!._id)).map((r) => r._id);
    expect(removed).toBe(2); // c and the fourth untouched row
    expect(left).toEqual(expect.arrayContaining([a._id, b._id, pastId]));
    expect(left).not.toContain(c._id);
  });

  it("an edited program rewrites its untouched rows at the new time", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.radioPrograms, {});
    const mg = (await programBySeed(t, "morning-glory"))!;
    await t.run(async (ctx) => {
      await ctx.db.patch(mg._id, { startTime: "07:00" });
      await clearUntouchedFutureRows(ctx, mg._id, T0);
      await materialiseProgram(ctx, (await ctx.db.get(mg._id))!, T0);
    });
    const rows = await rowsOf(t, mg._id);
    expect(rows).toHaveLength(4);
    expect(rows.every((b) => new Date(b.startsAt + 3 * HOUR).getUTCHours() === 7)).toBe(
      true
    );
  });
});
