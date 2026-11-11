import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testConvex } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

/**
 * The Radio inbox (spec 0019, AC-28 to AC-31, AC-38): who may send and when,
 * the shared rolling hour budget, the sender privacy rule on every read and
 * response, who may read and mark, and N34's once per watermark digest.
 *
 * The caller is chosen by stubbing the Better Auth lookup `getCurrentUser`
 * goes through, so the public functions run exactly as a signed in user
 * would reach them.
 */

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0); // 12:00 Kampala

let currentAuthId: string | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  currentAuthId = null;
  vi.spyOn(authComponent, "safeGetAuthUser").mockImplementation(
    async () => (currentAuthId ? ({ _id: currentAuthId } as never) : undefined) as never
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type T = ReturnType<typeof testConvex>;

async function seedDepartments(t: T) {
  return await t.run(async (ctx) => ({
    media: await ctx.db.insert("departments", { name: "Media", order: 1 }),
    pastoral: await ctx.db.insert("departments", { name: "Pastoral", order: 2 }),
    library: await ctx.db.insert("departments", { name: "Library & Information", order: 3 }),
  }));
}

async function createUser(t: T, firstName: string) {
  const authId = `test:${crypto.randomUUID()}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      authId,
      email: `${authId}@test.org`,
      firstName,
      lastName: "Test",
      role: "member",
      profileCompleted: true,
    });
    await ctx.db.insert("memberProfiles", {
      userId: id,
      firstName,
      lastName: "Test",
      sex: "female",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus: "verified",
      createdAt: T0,
      updatedAt: T0,
    });
    return id;
  });
  return { userId, authId };
}

async function grantRole(
  t: T,
  userId: Id<"users">,
  roleType: string,
  departmentId?: Id<"departments">
) {
  await t.run((ctx) =>
    ctx.db.insert("roleAssignments", {
      userId,
      roleType,
      assignedBy: userId,
      status: "active",
      ...(departmentId ? { departmentId } : {}),
    })
  );
}

/** A broadcast covering now, and a live status row, so the radio is on air. */
async function goOnAir(t: T, name = "Morning Glory") {
  return await t.run(async (ctx) => {
    await ctx.db.insert("radioStatus", {
      detected: "live",
      lastLiveAt: T0,
      lastProbeAt: T0,
      lastProbeOk: true,
      inAppListeners: 0,
    });
    return await ctx.db.insert("radioBroadcasts", {
      oneOffName: name,
      origin: "oneOff",
      startsAt: T0 - 30 * MIN,
      endsAt: T0 + 90 * MIN,
      isRecorded: false,
      status: "scheduled",
      adjusted: true,
    });
  });
}

/** Move the clock, keeping the probe fresh so the stream still reads live. */
async function liveAt(t: T, at: number) {
  vi.setSystemTime(at);
  await t.run(async (ctx) => {
    const row = await ctx.db.query("radioStatus").first();
    if (row) await ctx.db.patch(row._id, { lastProbeAt: at, lastLiveAt: at });
  });
}

/** The N34 notices the digest scheduled, as `dispatch` would receive them. */
async function scheduledNotices(t: T) {
  const rows = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return rows
    .filter((r) => r.name.includes("notifications") && r.name.includes("dispatch"))
    .map((r) => r.args[0] as Record<string, unknown> & { body: string });
}

function as(authId: string | null) {
  currentAuthId = authId;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

describe("radioInbox.submit (AC-28)", () => {
  it("refuses everything while nothing is on air", async () => {
    const t = testConvex();
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await expectCode(
      t.mutation(api.radioInbox.submit, { type: "prayer_request", body: "Pray for my exams" }),
      "RADIO_INBOX_OFF_AIR"
    );
  });

  it("stores the item against the broadcast on air, trimmed, with its sender", async () => {
    const t = testConvex();
    const broadcastId = await goOnAir(t);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "  Healed!  " });
    const items = await t.run((ctx) => ctx.db.query("radioInboxItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      body: "Healed!",
      broadcastId,
      senderUserId: sender.userId,
      createdAt: T0,
    });
  });

  it("refuses an empty body and one over 1000 characters", async () => {
    const t = testConvex();
    await goOnAir(t);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await expectCode(
      t.mutation(api.radioInbox.submit, { type: "testimony", body: "   " }),
      "RADIO_INBOX_BODY_REQUIRED"
    );
    await expectCode(
      t.mutation(api.radioInbox.submit, { type: "testimony", body: "x".repeat(1001) }),
      "RADIO_INBOX_BODY_TOO_LONG"
    );
  });

  it("shares one budget of five across both types in a rolling hour", async () => {
    const t = testConvex();
    await goOnAir(t);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    for (let i = 0; i < 5; i++) {
      await liveAt(t, T0 + i * MIN);
      await t.mutation(api.radioInbox.submit, {
        type: i % 2 ? "testimony" : "prayer_request",
        body: `item ${i}`,
      });
    }
    await liveAt(t, T0 + 10 * MIN);
    await expectCode(
      t.mutation(api.radioInbox.submit, { type: "testimony", body: "sixth" }),
      "RADIO_INBOX_RATE_LIMITED"
    );
    // Once the first falls out of the hour, one more is allowed.
    await liveAt(t, T0 + 61 * MIN);
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "sixth" });
  });

  it("refuses a signed out caller", async () => {
    const t = testConvex();
    await goOnAir(t);
    as(null);
    await expect(
      t.mutation(api.radioInbox.submit, { type: "testimony", body: "hello" })
    ).rejects.toThrow();
  });
});

describe("radioInbox.listByBroadcast (AC-29, AC-38)", () => {
  async function setup() {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const broadcastId = await goOnAir(t);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await t.mutation(api.radioInbox.submit, { type: "prayer_request", body: "Pray for my mum" });
    vi.setSystemTime(T0 + MIN);
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "I got the job" });
    return { t, depts, broadcastId, sender };
  }

  it("groups by broadcast and never carries a prayer request's sender", async () => {
    const { t, depts, broadcastId, sender } = await setup();
    const hod = await createUser(t, "Mediahod");
    await grantRole(t, hod.userId, "hod", depts.media);
    as(hod.authId);

    const page = await t.query(api.radioInbox.listByBroadcast, {});
    expect(page?.groups).toHaveLength(1);
    expect(page?.groups[0].broadcast).toMatchObject({ _id: broadcastId, title: "Morning Glory" });
    const prayer = page!.groups[0].items.find((i) => i.type === "prayer_request")!;
    const testimony = page!.groups[0].items.find((i) => i.type === "testimony")!;
    expect(testimony).toMatchObject({ senderName: "Grace Test" });
    expect(prayer).not.toHaveProperty("senderName");

    // Nothing anywhere in the payload names or identifies the prayer's sender,
    // and the testimony is the only place the sender's name appears.
    const prayerJson = JSON.stringify(prayer);
    expect(prayerJson).not.toContain(sender.userId);
    expect(prayerJson).not.toContain("Grace");
    expect(JSON.stringify(page)).not.toContain(sender.userId);
    expect(page?.canMarkPrayedFor).toBe(true);
  });

  it("serves Pastoral's HOD and delegates, read only", async () => {
    const { t, depts } = await setup();
    const delegate = await createUser(t, "Pastoraldelegate");
    await grantRole(t, delegate.userId, "department_admin", depts.pastoral);
    as(delegate.authId);
    const page = await t.query(api.radioInbox.listByBroadcast, {});
    expect(page?.groups[0].items).toHaveLength(2);
    expect(page?.canMarkPrayedFor).toBe(false);
  });

  it("returns null to another department, a plain member and a signed out caller", async () => {
    const { t, depts } = await setup();
    const libraryHod = await createUser(t, "Libraryhod");
    await grantRole(t, libraryHod.userId, "hod", depts.library);
    as(libraryHod.authId);
    expect(await t.query(api.radioInbox.listByBroadcast, {})).toBeNull();
    const member = await createUser(t, "Plain");
    as(member.authId);
    expect(await t.query(api.radioInbox.listByBroadcast, {})).toBeNull();
    as(null);
    expect(await t.query(api.radioInbox.listByBroadcast, {})).toBeNull();
  });

  it("pages by broadcast without listing one twice", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const sender = await createUser(t, "Grace");
    const ids = await t.run(async (ctx) => {
      const out: Id<"radioBroadcasts">[] = [];
      for (let i = 0; i < 12; i++) {
        const startsAt = T0 - (i + 1) * 120 * MIN;
        const id = await ctx.db.insert("radioBroadcasts", {
          oneOffName: `Show ${i}`,
          origin: "oneOff",
          startsAt,
          endsAt: startsAt + 60 * MIN,
          isRecorded: false,
          status: "scheduled",
          adjusted: true,
        });
        await ctx.db.insert("radioInboxItems", {
          type: "testimony",
          body: `t${i}`,
          senderUserId: sender.userId,
          broadcastId: id,
          createdAt: startsAt + 10 * MIN,
        });
        out.push(id);
      }
      return out;
    });
    const hod = await createUser(t, "Mediahod");
    await grantRole(t, hod.userId, "hod", depts.media);
    as(hod.authId);
    const first = await t.query(api.radioInbox.listByBroadcast, {});
    expect(first?.groups).toHaveLength(10);
    expect(first?.nextCursor).not.toBeNull();
    const second = await t.query(api.radioInbox.listByBroadcast, {
      cursor: first!.nextCursor!,
    });
    expect(second?.groups).toHaveLength(2);
    expect(second?.nextCursor).toBeNull();
    const shown = [...first!.groups, ...second!.groups].map((g) => g.broadcast._id);
    expect(new Set(shown).size).toBe(12);
    expect(shown[0]).toBe(ids[0]);
  });
});

describe("radioInbox.listByBroadcast paging across overlapping broadcasts", () => {
  it("never skips a broadcast that sits between an older shown one and the cursor", async () => {
    // The review's case: A has items at 1 and 100; B to J at 50 to 99; K at 40.
    // A page of ten picks A to J and shows A whole; K must still reach page two.
    const t = testConvex();
    const depts = await seedDepartments(t);
    const sender = await createUser(t, "Grace");
    const base = T0 - 10 * 60 * MIN;
    const at = (n: number) => base + n * MIN;
    const ids = await t.run(async (ctx) => {
      const make = async (name: string, times: number[]) => {
        const id = await ctx.db.insert("radioBroadcasts", {
          oneOffName: name,
          origin: "oneOff",
          startsAt: at(Math.min(...times)),
          endsAt: at(Math.max(...times)) + 1,
          isRecorded: false,
          status: "scheduled",
          adjusted: true,
        });
        for (const n of times) {
          await ctx.db.insert("radioInboxItems", {
            type: "testimony",
            body: `${name}${n}`,
            senderUserId: sender.userId,
            broadcastId: id,
            createdAt: at(n),
          });
        }
        return id;
      };
      const out: Record<string, Id<"radioBroadcasts">> = {};
      out.A = await make("A", [1, 100]);
      let n = 99;
      for (const name of "BCDEFGHIJ") {
        out[name] = await make(name, [n]);
        n -= 5;
      }
      out.K = await make("K", [40]);
      return out;
    });

    const hod = await createUser(t, "Mediahod");
    await grantRole(t, hod.userId, "hod", depts.media);
    as(hod.authId);
    const first = await t.query(api.radioInbox.listByBroadcast, {});
    expect(first?.groups).toHaveLength(10);
    const second = await t.query(api.radioInbox.listByBroadcast, { cursor: first!.nextCursor! });
    const shown = [...first!.groups, ...second!.groups].map((g) => g.broadcast._id);
    expect(shown).toContain(ids.K);
    expect(new Set(shown).size).toBe(shown.length);
    expect(new Set(shown).size).toBe(11);
    // A is shown whole, both items, exactly once.
    const a = [...first!.groups, ...second!.groups].filter((g) => g.broadcast._id === ids.A);
    expect(a).toHaveLength(1);
    expect(a[0].items).toHaveLength(2);
  });
});

describe("radioInbox.markPrayedFor (AC-29, AC-31)", () => {
  it("lets manageRadio mark a prayer request, returning no sender", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    await goOnAir(t);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await t.mutation(api.radioInbox.submit, { type: "prayer_request", body: "Pray for rain" });
    const itemId = (await t.run((ctx) => ctx.db.query("radioInboxItems").first()))!._id;

    const hod = await createUser(t, "Mediahod");
    await grantRole(t, hod.userId, "hod", depts.media);
    as(hod.authId);
    const response = await t.mutation(api.radioInbox.markPrayedFor, { itemId });
    expect(response).toBeNull();
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({ prayedForAt: T0, prayedForBy: hod.userId });

    // The log row carries no sender and no body.
    const logs = await t.run((ctx) => ctx.db.query("activityLogs").collect());
    const log = logs.find((l) => l.action === "radioInbox.prayed_for");
    expect(JSON.stringify(log)).not.toContain(sender.userId);
    expect(JSON.stringify(log)).not.toContain("Pray for rain");
  });

  it("refuses a testimony and a Pastoral delegate", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    await goOnAir(t);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "Thank you" });
    await t.mutation(api.radioInbox.submit, { type: "prayer_request", body: "Pray" });
    const items = await t.run((ctx) => ctx.db.query("radioInboxItems").collect());
    const testimony = items.find((i) => i.type === "testimony")!;
    const prayer = items.find((i) => i.type === "prayer_request")!;

    const hod = await createUser(t, "Mediahod");
    await grantRole(t, hod.userId, "hod", depts.media);
    as(hod.authId);
    await expectCode(
      t.mutation(api.radioInbox.markPrayedFor, { itemId: testimony._id }),
      "RADIO_INBOX_NOT_PRAYER_REQUEST"
    );

    const delegate = await createUser(t, "Pastoraldelegate");
    await grantRole(t, delegate.userId, "department_admin", depts.pastoral);
    as(delegate.authId);
    await expect(
      t.mutation(api.radioInbox.markPrayedFor, { itemId: prayer._id })
    ).rejects.toThrow();
  });
});

describe("radioInbox.sendInboxDigest (AC-30)", () => {
  it("sends one count to Pastoral's leaders and never twice for the same items", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const broadcastId = await goOnAir(t);
    const pastoralHod = await createUser(t, "Pastoralhod");
    await grantRole(t, pastoralHod.userId, "hod", depts.pastoral);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await t.mutation(api.radioInbox.submit, { type: "prayer_request", body: "one" });
    await t.mutation(api.radioInbox.submit, { type: "prayer_request", body: "two" });
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "three" });

    vi.setSystemTime(T0 + 20 * MIN);
    await t.mutation(internal.radioInbox.sendInboxDigest, {});

    const sent = await scheduledNotices(t);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: "N34",
      audience: { type: "users", userIds: [pastoralHod.userId] },
      createdBy: pastoralHod.userId,
    });
    expect(sent[0].body).toBe("2 prayer requests and 1 testimony came in during Morning Glory.");
    expect(JSON.stringify(sent[0])).not.toContain(sender.userId);
    const broadcast = await t.run((ctx) => ctx.db.get(broadcastId));
    expect(broadcast?.lastDigestAt).toBe(T0 + 20 * MIN);

    // A repeated run, and one an hour on with nothing new, send nothing.
    await t.mutation(internal.radioInbox.sendInboxDigest, {});
    vi.setSystemTime(T0 + 80 * MIN);
    await t.mutation(internal.radioInbox.sendInboxDigest, {});
    expect(await scheduledNotices(t)).toHaveLength(1);
  });

  it("waits an hour before a second notice for the same broadcast", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    await goOnAir(t);
    const pastoralHod = await createUser(t, "Pastoralhod");
    await grantRole(t, pastoralHod.userId, "hod", depts.pastoral);
    const sender = await createUser(t, "Grace");
    as(sender.authId);
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "one" });
    await t.mutation(internal.radioInbox.sendInboxDigest, {});

    await liveAt(t, T0 + 10 * MIN);
    await t.mutation(api.radioInbox.submit, { type: "testimony", body: "two" });
    await t.mutation(internal.radioInbox.sendInboxDigest, {});
    expect(await scheduledNotices(t)).toHaveLength(1);

    vi.setSystemTime(T0 + 60 * MIN);
    await t.mutation(internal.radioInbox.sendInboxDigest, {});
    const sent = await scheduledNotices(t);
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toBe("1 testimony came in during Morning Glory.");
  });
});
