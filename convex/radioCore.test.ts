import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The R2 client reads its config when its module loads, before any test runs.
// Signing a playback url is local arithmetic, so placeholder credentials do.
vi.hoisted(() => {
  process.env.R2_BUCKET ??= "test-bucket";
  process.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID ??= "test-key";
  process.env.R2_SECRET_ACCESS_KEY ??= "test-secret";
});
import { testConvex } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

/**
 * Radio core's remaining rules (spec 0019, slice 11): the `manageRadio`
 * authority matrix against real rows (AC-32, AC-33), the recording refusals
 * and their replace and remove bookkeeping (AC-24 to AC-27), the dashboard's
 * cards (AC-34) and the account deletion sweep (AC-36).
 *
 * The caller is chosen by stubbing the Better Auth lookup that
 * `getCurrentUser` goes through, as `radioInbox.test.ts` does.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0); // 12:00 Kampala, 11 November

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

function as(authId: string | null) {
  currentAuthId = authId;
}

async function seedDepartments(t: T) {
  return await t.run(async (ctx) => ({
    media: await ctx.db.insert("departments", { name: "Media", order: 1 }),
    pastoral: await ctx.db.insert("departments", { name: "Pastoral", order: 2 }),
    library: await ctx.db.insert("departments", { name: "Library & Information", order: 3 }),
  }));
}

async function createUser(
  t: T,
  firstName: string,
  profileStatus: "verified" | "pending_verification" = "verified"
) {
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
      sex: "male",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus,
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

async function addToRoster(t: T, userId: Id<"users">, departmentId: Id<"departments">) {
  await t.run((ctx) =>
    ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      addedBy: userId,
      status: "active",
    })
  );
}

async function insertProgram(t: T, opts: { seedKey?: string; name?: string } = {}) {
  return await t.run((ctx) =>
    ctx.db.insert("radioPrograms", {
      name: opts.name ?? "Morning Glory",
      nameKey: (opts.name ?? "Morning Glory").toLowerCase(),
      ...(opts.seedKey ? { seedKey: opts.seedKey } : {}),
      description: "A program",
      days: [1],
      startTime: "06:00",
      durationMinutes: 60,
      recurrence: "weekly",
      recordByDefault: !opts.seedKey,
      followedByDefault: false,
      isActive: true,
      updatedAt: T0,
    })
  );
}

async function insertBroadcast(
  t: T,
  opts: { programId?: Id<"radioPrograms">; startsAt: number; endsAt: number; cancelled?: boolean }
) {
  return await t.run((ctx) =>
    ctx.db.insert("radioBroadcasts", {
      ...(opts.programId ? { programId: opts.programId } : { oneOffName: "A one off" }),
      origin: opts.programId ? "scheduled" : "oneOff",
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      isRecorded: true,
      status: opts.cancelled ? "cancelled" : "scheduled",
      adjusted: false,
    })
  );
}

async function scheduled(t: T, fragment: string) {
  const rows = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return rows.filter((r) => r.name.includes(fragment));
}

// ── AC-32, AC-33: who holds manageRadio ──────────────────────────────────

describe("the manageRadio authority matrix (AC-32, AC-33)", () => {
  async function canManage(t: T, authId: string | null) {
    as(authId);
    // A management query returns null to anyone without the capability.
    return (await t.query(api.radioRecordings.listForMedia, {})) !== null;
  }

  it("is held by Media's HOD, a Media delegate, a verified Media roster member and a System Admin", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const hod = await createUser(t, "Hod");
    await grantRole(t, hod.userId, "hod", depts.media);
    const delegate = await createUser(t, "Delegate");
    await grantRole(t, delegate.userId, "department_admin", depts.media);
    const roster = await createUser(t, "Roster");
    await addToRoster(t, roster.userId, depts.media);
    const admin = await createUser(t, "Admin");
    await grantRole(t, admin.userId, "system_admin");

    for (const who of [hod, delegate, roster, admin]) {
      expect(await canManage(t, who.authId)).toBe(true);
    }
  });

  it("is refused to an unverified Media roster member, another department and a signed out caller", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const unverified = await createUser(t, "Unverified", "pending_verification");
    await addToRoster(t, unverified.userId, depts.media);
    const libraryRoster = await createUser(t, "Libraryroster");
    await addToRoster(t, libraryRoster.userId, depts.library);
    const libraryHod = await createUser(t, "Libraryhod");
    await grantRole(t, libraryHod.userId, "hod", depts.library);
    const pastoralHod = await createUser(t, "Pastoralhod");
    await grantRole(t, pastoralHod.userId, "hod", depts.pastoral);

    for (const who of [unverified, libraryRoster, libraryHod, pastoralHod]) {
      expect(await canManage(t, who.authId)).toBe(false);
    }
    expect(await canManage(t, null)).toBe(false);

    // And every radio mutation re-checks it on the server.
    const programId = await insertProgram(t);
    const broadcastId = await insertBroadcast(t, { programId, startsAt: T0 - 2 * HOUR, endsAt: T0 - HOUR });
    as(libraryRoster.authId);
    await expect(t.mutation(api.radioRecordings.remove, { broadcastId })).rejects.toThrow();
    await expect(t.mutation(api.radio.setOverride, { state: "live" })).rejects.toThrow();
    as(unverified.authId);
    await expect(t.mutation(api.radio.clearOverride, {})).rejects.toThrow();
    as(null);
    await expect(t.mutation(api.radioRecordings.remove, { broadcastId })).rejects.toThrow();
  });
});

// ── AC-24 to AC-27: recordings ───────────────────────────────────────────

describe("recordings (AC-24 to AC-27)", () => {
  async function setup() {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const hod = await createUser(t, "Hod");
    await grantRole(t, hod.userId, "hod", depts.media);
    as(hod.authId);
    return { t, hod };
  }

  it("refuses a Super T broadcast and one that has not finished", async () => {
    const { t } = await setup();
    const superT = await insertProgram(t, { seedKey: "super-t", name: "Super T" });
    const done = await insertBroadcast(t, { programId: superT, startsAt: T0 - 25 * HOUR, endsAt: T0 - HOUR });
    await expect(
      t.query(internal.radioRecordings.checkUploadTarget, { broadcastId: done, now: T0 })
    ).rejects.toMatchObject({ data: { code: "RADIO_SUPER_T_NOT_RECORDED" } });

    const program = await insertProgram(t);
    const running = await insertBroadcast(t, { programId: program, startsAt: T0 - MIN, endsAt: T0 + HOUR });
    await expect(
      t.query(internal.radioRecordings.checkUploadTarget, { broadcastId: running, now: T0 })
    ).rejects.toMatchObject({ data: { code: "RADIO_RECORDING_NOT_FINISHED" } });
  });

  it("refuses a key outside the broadcast's prefix and a size over 500 MB", async () => {
    const { t } = await setup();
    const program = await insertProgram(t);
    const a = await insertBroadcast(t, { programId: program, startsAt: T0 - 3 * HOUR, endsAt: T0 - 2 * HOUR });
    const b = await insertBroadcast(t, { programId: program, startsAt: T0 - 2 * HOUR, endsAt: T0 - HOUR });
    for (const key of [
      `radio/recordings/${b}/x.mp3`,
      `radio/recordings/${a}/../${b}/x.mp3`,
      `radio/recordings/${a}/nested/x.mp3`,
      `other/${a}/x.mp3`,
    ]) {
      await expect(
        t.mutation(internal.radioRecordings.attachRecording, { broadcastId: a, key, sizeBytes: 1000 })
      ).rejects.toMatchObject({ data: { code: "RADIO_RECORDING_KEY_INVALID" } });
    }
    await expect(
      t.mutation(internal.radioRecordings.attachRecording, {
        broadcastId: a,
        key: `radio/recordings/${a}/x.mp3`,
        sizeBytes: 500 * 1024 * 1024 + 1,
      })
    ).rejects.toMatchObject({ data: { code: "RADIO_RECORDING_TOO_LARGE" } });
  });

  it("attaches, replaces with cleanup and a log, then removes", async () => {
    const { t } = await setup();
    const program = await insertProgram(t);
    const id = await insertBroadcast(t, { programId: program, startsAt: T0 - 2 * HOUR, endsAt: T0 - HOUR });
    const first = `radio/recordings/${id}/first.mp3`;
    const second = `radio/recordings/${id}/second.mp3`;

    await t.mutation(internal.radioRecordings.attachRecording, {
      broadcastId: id,
      key: first,
      sizeBytes: 30_000_000,
      durationSeconds: 3599.6,
    });
    let row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.recording).toMatchObject({ key: first, durationSeconds: 3600, sizeBytes: 30_000_000 });
    expect(row?.recordingUploadedAt).toBe(T0);
    expect(await scheduled(t, "deleteObjects")).toHaveLength(0);

    vi.setSystemTime(T0 + MIN);
    await t.mutation(internal.radioRecordings.attachRecording, {
      broadcastId: id,
      key: second,
      sizeBytes: 20_000_000,
    });
    row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.recording?.key).toBe(second);
    expect(row?.recordingUploadedAt).toBe(T0 + MIN);
    const deletes = await scheduled(t, "deleteObjects");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0]).toEqual({ keys: [first] });

    await t.mutation(api.radioRecordings.remove, { broadcastId: id });
    row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.recording).toBeUndefined();
    expect(row?.recordingUploadedAt).toBeUndefined();
    expect(await scheduled(t, "deleteObjects")).toHaveLength(2);
    await expect(t.mutation(api.radioRecordings.remove, { broadcastId: id })).rejects.toMatchObject({
      data: { code: "RADIO_RECORDING_MISSING" },
    });

    const actions = (await t.run((ctx) => ctx.db.query("activityLogs").collect())).map((l) => l.action);
    expect(actions).toEqual([
      "radioRecording.uploaded",
      "radioRecording.replaced",
      "radioRecording.removed",
    ]);
  });

  it("lists recordings newest upload first, filters by program and pages twenty at a time", async () => {
    const { t } = await setup();
    const morning = await insertProgram(t);
    const evening = await insertProgram(t, { name: "English Service" });
    for (let i = 0; i < 25; i++) {
      const programId = i % 5 === 0 ? evening : morning;
      const id = await insertBroadcast(t, {
        programId,
        startsAt: T0 - (i + 2) * HOUR,
        endsAt: T0 - (i + 1) * HOUR,
      });
      vi.setSystemTime(T0 + i * MIN);
      await t.mutation(internal.radioRecordings.attachRecording, {
        broadcastId: id,
        key: `radio/recordings/${id}/r.mp3`,
        sizeBytes: 1000,
      });
    }
    // One broadcast with no recording never appears.
    await insertBroadcast(t, { programId: morning, startsAt: T0 - 40 * HOUR, endsAt: T0 - 39 * HOUR });

    const page = await t.query(api.radio.listRecordings, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page).toHaveLength(20);
    expect(page.isDone).toBe(false);
    const uploaded = page.page.map((r) => r.uploadedAt);
    expect([...uploaded].sort((a, b) => b - a)).toEqual(uploaded);
    expect(page.page[0].url).toEqual(expect.any(String));
    expect(page.page[0]).not.toHaveProperty("recording");

    const filtered = await t.query(api.radio.listRecordings, {
      programId: evening,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(filtered.page).toHaveLength(5);
    expect(filtered.page.every((r) => r.programId === evening)).toBe(true);

    as(null);
    const signedOut = await t.query(api.radio.listRecordings, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(signedOut.page).toHaveLength(0);
  });
});

// ── AC-34: the Media dashboard ───────────────────────────────────────────

describe("radio.getMediaDashboard (AC-34)", () => {
  it("reports nothing as null rather than zeros, and warns when tomorrow has no devotional", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const roster = await createUser(t, "Roster");
    await addToRoster(t, roster.userId, depts.media);
    as(roster.authId);

    const empty = await t.query(api.radio.getMediaDashboard, {});
    expect(empty?.lastBroadcast).toBeNull();
    // 12 November in Kampala is tomorrow; a roster member gets no link.
    expect(empty?.devotional).toEqual({ missingDate: "2026-11-12", canManageDevotionals: false });

    await t.run((ctx) =>
      ctx.db.insert("devotionals", {
        title: "Grace",
        scriptureReference: "John 1:16",
        body: "Grace upon grace.",
        date: "2026-11-12",
        createdBy: roster.userId,
        createdAt: T0,
        updatedAt: T0,
      })
    );
    const ready = await t.query(api.radio.getMediaDashboard, {});
    expect(ready?.devotional).toBeNull();
  });

  it("shows the last finished, not cancelled broadcast that had listeners", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const hod = await createUser(t, "Hod");
    await grantRole(t, hod.userId, "hod", depts.media);
    const a = await createUser(t, "A");
    const b = await createUser(t, "B");
    const program = await insertProgram(t);

    const older = await insertBroadcast(t, { programId: program, startsAt: T0 - 5 * HOUR, endsAt: T0 - 4 * HOUR });
    const cancelled = await insertBroadcast(t, {
      programId: program,
      startsAt: T0 - 3 * HOUR,
      endsAt: T0 - 2 * HOUR,
      cancelled: true,
    });
    // Finished, not cancelled, but nobody listened: skipped.
    await insertBroadcast(t, { programId: program, startsAt: T0 - 2 * HOUR, endsAt: T0 - HOUR });
    // Still running: skipped.
    const running = await insertBroadcast(t, { programId: program, startsAt: T0 - 10 * MIN, endsAt: T0 + HOUR });

    await t.run(async (ctx) => {
      const stretch = (userId: Id<"users">, broadcastId: Id<"radioBroadcasts">, deviceId: string, seconds: number) =>
        ctx.db.insert("listeningSessions", {
          userId,
          deviceId,
          broadcastId,
          startedAt: T0 - 5 * HOUR,
          lastBeatAt: T0 - 4 * HOUR,
          seconds,
          closedAt: T0 - 4 * HOUR,
        });
      // One person on two devices counts once; hours add every stretch.
      await stretch(a.userId, older, "phone", 1800);
      await stretch(a.userId, older, "tablet", 1800);
      await stretch(b.userId, older, "phone", 3600);
      await stretch(a.userId, cancelled, "phone", 900);
      await stretch(b.userId, running, "phone", 60);
    });

    as(hod.authId);
    const data = await t.query(api.radio.getMediaDashboard, {});
    expect(data?.lastBroadcast?.broadcast._id).toBe(older);
    expect(data?.lastBroadcast?.uniqueListeners).toBe(2);
    expect(data?.lastBroadcast?.hours).toBe(2);
    expect(data?.devotional?.canManageDevotionals).toBe(true);
  });

  it("is null to anyone without manageRadio", async () => {
    const t = testConvex();
    await seedDepartments(t);
    const member = await createUser(t, "Plain");
    as(member.authId);
    expect(await t.query(api.radio.getMediaDashboard, {})).toBeNull();
  });
});

// ── AC-36: account deletion ──────────────────────────────────────────────

describe("account deletion over radio rows (AC-36)", () => {
  it("deletes follows and inbox items, and keeps listening stretches", async () => {
    const t = testConvex();
    const leaving = await createUser(t, "Leaving");
    const staying = await createUser(t, "Staying");
    const program = await insertProgram(t);
    const broadcastId = await insertBroadcast(t, { programId: program, startsAt: T0 - 2 * HOUR, endsAt: T0 - HOUR });

    await t.run(async (ctx) => {
      for (const userId of [leaving.userId, staying.userId]) {
        await ctx.db.insert("radioProgramFollows", { userId, programId: program, following: true, updatedAt: T0 });
        await ctx.db.insert("radioInboxItems", {
          type: "testimony",
          body: "My name is in here",
          senderUserId: userId,
          broadcastId,
          createdAt: T0 - 90 * MIN,
        });
        await ctx.db.insert("listeningSessions", {
          userId,
          deviceId: "phone",
          broadcastId,
          startedAt: T0 - 2 * HOUR,
          lastBeatAt: T0 - HOUR,
          seconds: 3600,
          closedAt: T0 - HOUR,
        });
      }
    });

    // The audit scrub is passed as finished so this exercises only the
    // per user deletion page. (The scrub itself calls `.paginate()` twice in
    // one function, which convex-test refuses; that is spec 0008's code and
    // is flagged separately rather than worked around here.)
    await t.mutation(internal.accountDeletion.continueCleanup, {
      userId: leaving.userId,
      scrub: { actorCursor: null, targetCursor: null, actorDone: true, targetDone: true },
    });

    const remaining = await t.run(async (ctx) => ({
      follows: await ctx.db.query("radioProgramFollows").collect(),
      items: await ctx.db.query("radioInboxItems").collect(),
      stretches: await ctx.db.query("listeningSessions").collect(),
    }));
    expect(remaining.follows.map((f) => f.userId)).toEqual([staying.userId]);
    expect(remaining.items.map((i) => i.senderUserId)).toEqual([staying.userId]);
    // Past broadcast totals stay true.
    expect(remaining.stretches).toHaveLength(2);
    expect(remaining.stretches.reduce((s, r) => s + r.seconds, 0)).toBe(7200);
  });
});

// ── spec 0020: lock screen artwork comes from the portal ─────────────────

describe("radio.getPlaybackConfig artwork (spec 0020, AC-7)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("points the lock screen at the portal's hosted artwork, and omits it without a portal", async () => {
    const t = testConvex();
    const member = await createUser(t, "Plain");
    as(member.authId);

    vi.stubEnv("PORTAL_ORIGIN", "https://portal.example.org/");
    const withPortal = await t.query(api.radio.getPlaybackConfig, {});
    expect(withPortal?.artworkBaseUrl).toBe("https://portal.example.org/radio/");
    expect(withPortal?.cityLookupUrl).toBe("https://portal.example.org/api/where");

    vi.stubEnv("PORTAL_ORIGIN", "");
    const without = await t.query(api.radio.getPlaybackConfig, {});
    expect(without).not.toHaveProperty("artworkBaseUrl");
    expect(without).not.toHaveProperty("cityLookupUrl");

    as(null);
    expect(await t.query(api.radio.getPlaybackConfig, {})).toBeNull();
  });
});
