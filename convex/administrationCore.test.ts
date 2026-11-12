import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The R2 client reads its config when its module loads, before any test runs.
// Nothing here signs a real URL, so placeholder credentials do.
vi.hoisted(() => {
  process.env.R2_BUCKET ??= "test-bucket";
  process.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID ??= "test-key";
  process.env.R2_SECRET_ACCESS_KEY ??= "test-secret";
});
import pushNotificationsTest from "@convex-dev/expo-push-notifications/test";
import { CHURCH_ACTIVITY_ACTIONS } from "@klt-cyber/shared";
import { testConvex as baseTestConvex } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

/**
 * Administration core (spec 0021, build task 12): the critical test scenarios,
 * run against the real queries and mutations.
 *
 * The caller is chosen by stubbing the Better Auth lookup `getCurrentUser`
 * goes through, as convex/radioCore.test.ts does. `dispatch` pushes through
 * the Expo push component, so it is registered here.
 */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0); // 12:00 Kampala, Wednesday 11 November

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

function testConvex() {
  const t = baseTestConvex();
  pushNotificationsTest.register(t);
  return t;
}

type T = ReturnType<typeof testConvex>;

interface Person {
  userId: Id<"users">;
  authId: string;
}

function as(person: Person | null) {
  currentAuthId = person?.authId ?? null;
}

async function seed(t: T) {
  return await t.run(async (ctx) => ({
    administration: await ctx.db.insert("departments", { name: "Administration", order: 1 }),
    media: await ctx.db.insert("departments", { name: "Media", order: 2 }),
    choir: await ctx.db.insert("departments", { name: "Choir", order: 3 }),
    ushering: await ctx.db.insert("departments", { name: "Ushering", order: 4 }), // paused
    reuben: await ctx.db.insert("clans", { name: "Reuben", order: 1 }),
    judah: await ctx.db.insert("clans", { name: "Judah", order: 2 }),
  }));
}

async function createUser(
  t: T,
  opts: {
    firstName?: string;
    profileStatus?: "verified" | "pending_verification";
    clanId?: Id<"clans">;
    phone?: string;
  } = {}
): Promise<Person> {
  const authId = `test:${crypto.randomUUID()}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      authId,
      email: `${authId}@test.org`,
      firstName: opts.firstName ?? "Test",
      lastName: "User",
      role: "member",
      profileCompleted: true,
    });
    await ctx.db.insert("memberProfiles", {
      userId: id,
      firstName: opts.firstName ?? "Test",
      lastName: "User",
      sex: "male",
      maritalStatus: "single",
      mentorshipStatus: "enrolled",
      profileStatus: opts.profileStatus ?? "verified",
      dateOfBirth: { day: 1, month: 1, year: 1990 },
      ...(opts.phone ? { phone: opts.phone } : {}),
      ...(opts.clanId ? { clanId: opts.clanId } : {}),
      createdAt: T0,
      updatedAt: T0,
    });
    return id;
  });
  return { userId, authId };
}

async function grant(
  t: T,
  person: Person,
  roleType: Doc<"roleAssignments">["roleType"],
  scope: { departmentId?: Id<"departments">; clanId?: Id<"clans"> } = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("roleAssignments", {
      userId: person.userId,
      roleType,
      assignedBy: person.userId,
      status: "active",
      ...scope,
    })
  );
}

async function seat(
  t: T,
  person: Person,
  departmentId: Id<"departments">,
  status: "active" | "pending_claim" = "active"
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("departmentMemberships", {
      userId: person.userId,
      departmentId,
      addedBy: person.userId,
      status,
      ...(status === "pending_claim" ? { claimedAt: T0 } : {}),
    });
  });
}

/** Moves the clock forward and runs whatever came due, including chained runAfter(0) jobs. */
async function advance(t: T, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
  for (let i = 0; i < 3; i++) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function notifications(t: T, kind?: string) {
  const rows = await t.run(async (ctx) => ctx.db.query("notifications").collect());
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

function usersOf(row: Doc<"notifications">): Id<"users">[] {
  if (row.audience.type !== "users") throw new Error(`audience ${row.audience.type}`);
  return row.audience.userIds;
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a rejection");
}

async function setupChurch(t: T) {
  const ids = await seed(t);
  const adminHod = await createUser(t, { firstName: "Ada" });
  await grant(t, adminHod, "hod", { departmentId: ids.administration });
  const delegate = await createUser(t, { firstName: "Dee" });
  await grant(t, delegate, "department_admin", { departmentId: ids.administration });
  const mediaHod = await createUser(t, { firstName: "Mo" });
  await grant(t, mediaHod, "hod", { departmentId: ids.media });
  return { ids, adminHod, delegate, mediaHod };
}

function eventArgs(
  audience:
    | { type: "church" }
    | { type: "serving" }
    | { type: "departments"; departmentIds: Id<"departments">[] },
  overrides: Partial<{ startDateTime: number; endDateTime: number; location: string }> = {}
) {
  return {
    title: "Media retreat",
    startDateTime: overrides.startDateTime ?? T0 + 10 * DAY,
    endDateTime: overrides.endDateTime ?? T0 + 10 * DAY + 3 * 60 * MIN,
    ...(overrides.location ? { location: overrides.location } : {}),
    audience,
  };
}

// ── Event audiences ─────────────────────────────────────────────────────────

describe("event audiences (AC-11, AC-12, AC-13)", () => {
  it("a departments event reaches and shows to that department only", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    const mediaMember = await createUser(t, { firstName: "Mia" });
    await seat(t, mediaMember, ids.media);
    const outsider = await createUser(t, { firstName: "Oz" });
    await seat(t, outsider, ids.choir);

    as(adminHod);
    const { eventId } = await t.mutation(
      api.events.createEvent,
      eventArgs({ type: "departments", departmentIds: [ids.media] })
    );
    await advance(t, 1);

    const [n16] = await notifications(t, "N16");
    expect(usersOf(n16)).toContain(mediaMember.userId);
    expect(usersOf(n16)).not.toContain(outsider.userId);

    as(mediaMember);
    expect(await t.query(api.events.getEvent, { eventId })).not.toBeNull();
    expect((await t.query(api.events.listUpcomingEvents, {}))?.map((e) => e._id)).toContain(eventId);

    as(outsider);
    expect(await t.query(api.events.getEvent, { eventId })).toBeNull();
    expect(await t.query(api.events.listUpcomingEvents, {})).toEqual([]);
    expect(await t.query(api.upcoming.listUpcomingForMember, {})).toEqual([]);
  });

  it("serving: an unverified seat holder sees it but is not pushed; a verified member with no seat sees nothing", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    const unverified = await createUser(t, { profileStatus: "pending_verification" });
    await seat(t, unverified, ids.choir);
    const verifiedServing = await createUser(t);
    await seat(t, verifiedServing, ids.ushering); // a paused department still counts
    const noSeat = await createUser(t);

    as(adminHod);
    const { eventId } = await t.mutation(api.events.createEvent, eventArgs({ type: "serving" }));
    await advance(t, 1);

    const [n16] = await notifications(t, "N16");
    expect(usersOf(n16)).toEqual([verifiedServing.userId]);
    expect(usersOf(n16)).not.toContain(unverified.userId);
    expect(usersOf(n16)).not.toContain(noSeat.userId);

    as(unverified);
    expect(await t.query(api.events.getEvent, { eventId })).not.toBeNull();
    as(noSeat);
    expect(await t.query(api.events.getEvent, { eventId })).toBeNull();
  });

  it("an empty push audience sends nothing", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    as(adminHod);
    await t.mutation(
      api.events.createEvent,
      eventArgs({ type: "departments", departmentIds: [ids.choir] })
    );
    await advance(t, 1);
    expect(await notifications(t, "N16")).toHaveLength(0);
  });

  it("church events still dispatch to the all audience", async () => {
    const t = testConvex();
    const { adminHod } = await setupChurch(t);
    as(adminHod);
    await t.mutation(api.events.createEvent, eventArgs({ type: "church" }));
    await advance(t, 1);
    const [n16] = await notifications(t, "N16");
    expect(n16.audience).toEqual({ type: "all" });
  });

  it("a caller who is not signed in gets church events only from the calendar", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    as(adminHod);
    const church = await t.mutation(api.events.createEvent, eventArgs({ type: "church" }));
    const media = await t.mutation(
      api.events.createEvent,
      eventArgs({ type: "departments", departmentIds: [ids.media] })
    );

    as(null);
    const items = await t.query(api.calendar.getCalendarRange, {
      startDate: T0,
      endDate: T0 + 20 * DAY,
    });
    const eventIds = items.filter((i) => i.type === "event").map((i) => i.eventId);
    expect(eventIds).toContain(church.eventId);
    expect(eventIds).not.toContain(media.eventId);
  });

  it("refuses an empty list, a duplicate, a paused department and an unknown id", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    const gone = await t.run(async (ctx) => {
      const id = await ctx.db.insert("departments", { name: "Gone", order: 99 });
      await ctx.db.delete(id);
      return id;
    });
    as(adminHod);
    for (const departmentIds of [[], [ids.media, ids.media], [ids.ushering], [gone]]) {
      const message = await rejection(
        t.mutation(api.events.createEvent, eventArgs({ type: "departments", departmentIds }))
      );
      expect(message).toContain("INVALID_EVENT_AUDIENCE:");
    }
  });
});

// ── Reminders and edits ─────────────────────────────────────────────────────

describe("reminders and edits (AC-14, AC-15)", () => {
  it("resolves the audience when the reminder fires", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    as(adminHod);
    await t.mutation(
      api.events.createEvent,
      eventArgs(
        { type: "departments", departmentIds: [ids.media] },
        { startDateTime: T0 + 3 * DAY, endDateTime: T0 + 3 * DAY + 60 * MIN }
      )
    );
    await advance(t, 1);

    const newcomer = await createUser(t, { firstName: "Nia" });
    await seat(t, newcomer, ids.media);

    await advance(t, 2 * DAY + MIN); // past the day before reminder
    const [n18] = await notifications(t, "N18");
    expect(usersOf(n18)).toContain(newcomer.userId);
  });

  it("delivers nothing for a cancelled or moved event", async () => {
    const t = testConvex();
    const { adminHod } = await setupChurch(t);
    as(adminHod);
    const { eventId } = await t.mutation(api.events.createEvent, eventArgs({ type: "church" }));

    const moved = await t.mutation(internal.events.deliverEventReminder, {
      eventId,
      expectedStart: T0 + 99 * DAY,
      which: "day",
    });
    expect(moved).toEqual({ delivered: false, reason: "moved" });

    await t.mutation(api.events.cancelEvent, { eventId });
    const cancelled = await t.mutation(internal.events.deliverEventReminder, {
      eventId,
      expectedStart: T0 + 10 * DAY,
      which: "day",
    });
    expect(cancelled).toEqual({ delivered: false, reason: "cancelled" });
  });

  it("an audience change sends N16 to newcomers only, and N17 only on a relevant change", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    const mediaMember = await createUser(t);
    await seat(t, mediaMember, ids.media);
    const choirMember = await createUser(t);
    await seat(t, choirMember, ids.choir);

    as(adminHod);
    const args = eventArgs({ type: "departments", departmentIds: [ids.media] });
    const { eventId } = await t.mutation(api.events.createEvent, args);
    await advance(t, 1);
    const before = await t.run(async (ctx) => ctx.db.get(eventId));

    await t.mutation(api.events.updateEvent, {
      eventId,
      title: args.title,
      startDateTime: args.startDateTime,
      endDateTime: args.endDateTime,
      audience: { type: "serving" },
    });
    await advance(t, 1);

    const n16 = await notifications(t, "N16");
    expect(n16).toHaveLength(2);
    expect(usersOf(n16[1])).toContain(choirMember.userId);
    expect(usersOf(n16[1])).not.toContain(mediaMember.userId);
    expect(await notifications(t, "N17")).toHaveLength(0);

    // The reminder jobs were replaced.
    const after = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(after?.dayBeforeReminderJobId).toBeDefined();
    expect(after?.dayBeforeReminderJobId).not.toEqual(before?.dayBeforeReminderJobId);

    // A title only edit sends nothing.
    await t.mutation(api.events.updateEvent, {
      eventId,
      title: "Retreat, renamed",
      audience: { type: "serving" },
    });
    await advance(t, 1);
    expect(await notifications(t, "N17")).toHaveLength(0);

    // A location edit sends N17.
    await t.mutation(api.events.updateEvent, {
      eventId,
      location: "Main hall",
      audience: { type: "serving" },
    });
    await advance(t, 1);
    expect(await notifications(t, "N17")).toHaveLength(1);
  });
});

describe("review regressions (AC-11, AC-15)", () => {
  it("an event for a department paused later can still be edited", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    as(adminHod);
    const { eventId } = await t.mutation(
      api.events.createEvent,
      eventArgs({ type: "departments", departmentIds: [ids.media] })
    );
    // Pausing works by name, so stand the event's department in for a paused one.
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { audience: { type: "departments", departmentIds: [ids.ushering] } });
    });
    await t.mutation(api.events.updateEvent, {
      eventId,
      title: "Typo fixed",
      audience: { type: "departments", departmentIds: [ids.ushering] },
    });
    expect((await t.run(async (ctx) => ctx.db.get(eventId)))?.title).toBe("Typo fixed");
  });

  it("editing an event that has ended notifies nobody", async () => {
    const t = testConvex();
    const { adminHod } = await setupChurch(t);
    as(adminHod);
    const { eventId } = await t.mutation(
      api.events.createEvent,
      eventArgs({ type: "church" }, { startDateTime: T0 - 2 * DAY, endDateTime: T0 - DAY })
    );
    await advance(t, 1);
    const before = (await notifications(t)).length;
    await t.mutation(api.events.updateEvent, {
      eventId,
      location: "Moved hall",
      audience: { type: "serving" },
    });
    await advance(t, 1);
    expect(await notifications(t)).toHaveLength(before);
  });
});

// ── Cancel ──────────────────────────────────────────────────────────────────

describe("cancelEvent (AC-17, AC-18, AC-19)", () => {
  it("cancels, notifies, clears reminders, stays listed and is final", async () => {
    const t = testConvex();
    const { adminHod } = await setupChurch(t);
    const member = await createUser(t);
    as(adminHod);
    const { eventId } = await t.mutation(api.events.createEvent, eventArgs({ type: "church" }));
    await advance(t, 1);

    await t.mutation(api.events.cancelEvent, { eventId, reason: "  Heavy rain  " });
    await advance(t, 1);

    const row = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(row?.cancelledAt).toBeDefined();
    expect(row?.cancellationReason).toBe("Heavy rain");
    expect(row?.dayBeforeReminderJobId).toBeUndefined();
    expect(row?.weekBeforeReminderJobId).toBeUndefined();

    const [n17] = await notifications(t, "N17");
    expect(n17.title).toBe("Cancelled: Media retreat");
    expect(n17.body).toBe("Heavy rain");

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_action", (q) => q.eq("action", "content.event_cancelled"))
        .collect()
    );
    expect(logs).toHaveLength(1);

    as(member);
    const listed = await t.query(api.events.listUpcomingEvents, {});
    expect(listed?.[0]?.cancelledAt).toBeDefined();

    as(adminHod);
    expect(await rejection(t.mutation(api.events.cancelEvent, { eventId }))).toContain(
      "EVENT_ALREADY_CANCELLED:"
    );
    expect(
      await rejection(
        t.mutation(api.events.updateEvent, { eventId, title: "x", audience: { type: "church" } })
      )
    ).toContain("EVENT_CANCELLED_LOCKED:");
    await t.mutation(api.events.archiveEvent, { eventId });
    expect((await t.run(async (ctx) => ctx.db.get(eventId)))?.active).toBe(false);
  });

  it("refuses an ended or archived event", async () => {
    const t = testConvex();
    const { adminHod } = await setupChurch(t);
    as(adminHod);
    const ended = await t.mutation(
      api.events.createEvent,
      eventArgs({ type: "church" }, { startDateTime: T0 - 2 * DAY, endDateTime: T0 - DAY })
    );
    expect(await rejection(t.mutation(api.events.cancelEvent, { eventId: ended.eventId }))).toContain(
      "EVENT_ALREADY_ENDED:"
    );

    const archived = await t.mutation(api.events.createEvent, eventArgs({ type: "church" }));
    await t.mutation(api.events.archiveEvent, { eventId: archived.eventId });
    expect(
      await rejection(t.mutation(api.events.cancelEvent, { eventId: archived.eventId }))
    ).toContain("EVENT_ARCHIVED:");
  });
});

// ── Backfill ────────────────────────────────────────────────────────────────

describe("backfillEventAudience (AC-11)", () => {
  it("makes every pre existing event church, and a re run patches nothing", async () => {
    const t = testConvex();
    const { adminHod } = await setupChurch(t);
    await t.run(async (ctx) => {
      for (const title of ["Old one", "Old two"]) {
        await ctx.db.insert("events", {
          title,
          startDateTime: T0 + DAY,
          endDateTime: T0 + DAY + MIN,
          featured: false,
          active: true,
          createdBy: adminHod.userId,
          createdAt: T0,
          updatedAt: T0,
        });
      }
    });
    expect(await t.mutation(internal.eventAudienceMigration.backfillEventAudience, {})).toEqual({
      patched: 2,
    });
    expect(await t.mutation(internal.eventAudienceMigration.backfillEventAudience, {})).toEqual({
      patched: 0,
    });
    const events = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(events.every((e) => e.audience?.type === "church")).toBe(true);
  });
});

// ── Dashboard ───────────────────────────────────────────────────────────────

describe("listChurchActivity (AC-1, AC-22)", () => {
  it("gives a delegate the allowlist, never a System Admin grant, and a Media HOD null", async () => {
    const t = testConvex();
    const { delegate, mediaHod } = await setupChurch(t);
    await t.run(async (ctx) => {
      const actorUserId = delegate.userId;
      await ctx.db.insert("activityLogs", { actorUserId, action: "profile.verified" });
      await ctx.db.insert("activityLogs", { actorUserId, action: "user.signup" });
      await ctx.db.insert("activityLogs", {
        actorUserId,
        action: "role.assigned",
        metadata: { roleType: "system_admin" },
      });
      await ctx.db.insert("activityLogs", {
        actorUserId,
        action: "role.assigned",
        metadata: { roleType: "hod" },
      });
    });

    as(delegate);
    const entries = await t.query(api.admin.listChurchActivity, {});
    expect(entries?.map((e) => [e.action, e.roleType]).sort()).toEqual([
      ["profile.verified", null],
      ["role.assigned", "hod"],
    ]);

    as(mediaHod);
    expect(await t.query(api.admin.listChurchActivity, {})).toBeNull();
  });

  it("every allowlisted action is written somewhere in convex/", () => {
    const sources = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./_generated/**"], {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const all = Object.values(sources).join("\n");
    const missing = CHURCH_ACTIVITY_ACTIONS.filter((action) => !all.includes(`"${action}"`));
    expect(missing).toEqual([]);
  });
});

// ── Elders ──────────────────────────────────────────────────────────────────

describe("clan elders (AC-8, AC-9, AC-10)", () => {
  it("the Administration HOD appoints, replaces and removes; the clan rule holds; a delegate cannot", async () => {
    const t = testConvex();
    const { ids, adminHod, delegate } = await setupChurch(t);
    const reubenA = await createUser(t, { firstName: "Ruth", clanId: ids.reuben });
    const reubenB = await createUser(t, { firstName: "Reed", clanId: ids.reuben });
    const judah = await createUser(t, { firstName: "Jude", clanId: ids.judah });

    as(adminHod);
    expect(
      await rejection(
        t.mutation(api.roles.assignRole, {
          roleType: "clan_elder",
          userId: judah.userId,
          clanId: ids.reuben,
        })
      )
    ).toContain("ELDER_NOT_IN_CLAN:");

    await t.mutation(api.roles.assignRole, {
      roleType: "clan_elder",
      userId: reubenA.userId,
      clanId: ids.reuben,
    });
    const { roleAssignmentId } = await t.mutation(api.roles.assignRole, {
      roleType: "clan_elder",
      userId: reubenB.userId,
      clanId: ids.reuben,
    });
    await advance(t, 1);
    const kinds = new Set((await notifications(t)).map((n) => n.kind));
    expect(kinds).toContain("N13");
    expect(kinds).toContain("N14");
    expect(kinds).toContain("N15");

    const clans = await t.query(api.clans.listForAdministration, {});
    expect(clans?.find((c) => c._id === ids.reuben)?.elder?.userId).toBe(reubenB.userId);

    as(delegate);
    expect(await rejection(t.mutation(api.roles.revokeRole, { roleAssignmentId }))).toContain(
      "Not authorized"
    );
    expect(
      await rejection(
        t.mutation(api.roles.assignRole, {
          roleType: "clan_elder",
          userId: reubenA.userId,
          clanId: ids.reuben,
        })
      )
    ).toContain("Not authorized");

    as(adminHod);
    await t.mutation(api.roles.revokeRole, { roleAssignmentId });
    const after = await t.query(api.clans.listForAdministration, {});
    expect(after?.find((c) => c._id === ids.reuben)?.elder).toBeNull();
  });
});

// ── Year planner ────────────────────────────────────────────────────────────

describe("year planner (AC-20, AC-21, AC-22)", () => {
  it("deletes with a logged snapshot, and refuses a Media HOD", async () => {
    const t = testConvex();
    const { ids, adminHod, mediaHod } = await setupChurch(t);
    as(adminHod);
    const { activityId } = await t.mutation(api.plannedActivities.createActivity, {
      title: "Fund drive",
      targetDate: T0 + 5 * DAY,
      departmentIds: [ids.media],
    });

    as(mediaHod);
    await expect(t.mutation(api.plannedActivities.deleteActivity, { activityId })).rejects.toThrow();

    as(adminHod);
    await t.mutation(api.plannedActivities.deleteActivity, { activityId });
    const [log] = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_action", (q) => q.eq("action", "content.activity_deleted"))
        .collect()
    );
    expect(log.metadata).toMatchObject({ title: "Fund drive", status: "planned" });
    expect(await t.run(async (ctx) => ctx.db.get(activityId))).toBeNull();
    expect(
      await rejection(t.mutation(api.plannedActivities.deleteActivity, { activityId }))
    ).toContain("NOT_FOUND:");
  });

  it("shows department and clan activities that overlap the range, with owners and cancelled flags", async () => {
    const t = testConvex();
    const { ids, adminHod } = await setupChurch(t);
    await t.run(async (ctx) => {
      const base = { createdBy: adminHod.userId, createdAt: T0, updatedAt: T0 };
      await ctx.db.insert("groupActivities", {
        ...base,
        title: "Media camp",
        startDateTime: T0 - 2 * DAY, // started before the range, still running
        endDateTime: T0 + DAY,
        owner: { type: "department", departmentId: ids.media },
      });
      await ctx.db.insert("groupActivities", {
        ...base,
        title: "Reuben supper",
        startDateTime: T0 + 2 * DAY,
        endDateTime: T0 + 2 * DAY + MIN,
        owner: { type: "clan", clanId: ids.reuben },
        cancelledAt: T0,
      });
      await ctx.db.insert("groupActivities", {
        ...base,
        title: "Far away",
        startDateTime: T0 + 40 * DAY,
        endDateTime: T0 + 40 * DAY + MIN,
        owner: { type: "department", departmentId: ids.choir },
      });
    });

    as(adminHod);
    const range = await t.query(api.plannedActivities.getYearPlannerRange, {
      startDate: T0,
      endDate: T0 + 7 * DAY,
    });
    expect(
      range?.groupActivities.map((a) => [a.title, a.ownerType, a.ownerName, a.cancelled])
    ).toEqual([
      ["Media camp", "department", "Media", false],
      ["Reuben supper", "clan", "Reuben", true],
    ]);
  });
});

// ── Directory and departments ───────────────────────────────────────────────

describe("directory and departments (AC-3, AC-5)", () => {
  it("the directory carries phone, email and mentorship, never date of birth", async () => {
    const t = testConvex();
    const { delegate } = await setupChurch(t);
    await createUser(t, { firstName: "Pat", phone: "+256700000001" });
    as(delegate);
    const rows = await t.query(api.memberProfiles.listVerifiedMembersWithRoles, {});
    const pat = rows?.find((r) => r.profile.firstName === "Pat");
    expect(pat?.profile.phone).toBe("+256700000001");
    expect(pat?.email).toMatch(/@test\.org$/);
    expect(pat?.profile.mentorshipStatus).toBe("enrolled");
    expect(pat?.profile).not.toHaveProperty("dateOfBirth");
  });

  it("a department with only delegates shows no HOD, and paused departments come last", async () => {
    const t = testConvex();
    const { ids, delegate } = await setupChurch(t);
    const choirDelegate = await createUser(t);
    await grant(t, choirDelegate, "department_admin", { departmentId: ids.choir });
    const claimant = await createUser(t);
    await seat(t, claimant, ids.choir, "pending_claim");

    as(delegate);
    const rows = await t.query(api.departments.listForAdministration, {});
    const choir = rows?.find((r) => r._id === ids.choir);
    expect(choir?.hod).toBeNull();
    expect(choir?.delegateCount).toBe(1);
    expect(choir?.claimsWaiting).toBe(1);
    expect(rows?.at(-1)).toMatchObject({ name: "Ushering", paused: true });
    expect(rows?.find((r) => r._id === ids.media)?.hod?.name).toBe("Mo User");
  });
});
