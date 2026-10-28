import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pushNotificationsTest from "@convex-dev/expo-push-notifications/test";
import { testConvex as baseTestConvex } from "./test.setup";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { pushOnFirstPublish } from "./announcements";
import {
  endRoleAssignment,
  findIdenticalActiveAssignment,
  notifyAppointment,
  resolveNewLeaderRecipientIds,
} from "./lib/roleNotices";
import {
  notifyClaimActionable,
  resolveAdministrationReviewerIds,
} from "./lib/reviewerNotices";

/**
 * Who each notice reaches (spec 0013, AC-19).
 *
 * The helpers are exercised directly rather than through `roles.assignRole`,
 * for the reason convex/departmentShell.test.ts gives: the mutation resolves
 * its caller through the Better Auth component, which this harness cannot
 * stand up. The recipient rules all live in the helpers, so that is where the
 * exact sets are proved.
 */

const now = Date.now();

// `dispatch` pushes through the Expo push component, so these tests register
// it; the other suites never reach a dispatch and leave it out.
function testConvex() {
  const t = baseTestConvex();
  pushNotificationsTest.register(t);
  return t;
}

type T = ReturnType<typeof testConvex>;

async function seedGroups(t: T) {
  return await t.run(async (ctx) => {
    const media = await ctx.db.insert("departments", { name: "Media", order: 1 });
    const finance = await ctx.db.insert("departments", { name: "Finance", order: 2 });
    const judah = await ctx.db.insert("clans", { name: "Judah", order: 1 });
    return { media, finance, judah };
  });
}

async function createUser(
  t: T,
  opts: {
    profileStatus?: "verified" | "pending_verification";
    clanId?: Id<"clans">;
    deleted?: boolean;
    firstName?: string;
  } = {}
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `test-${crypto.randomUUID()}@test.org`,
      firstName: opts.firstName ?? "Test",
      lastName: "User",
      role: "member",
      profileCompleted: true,
      ...(opts.deleted ? { deletedAt: now } : {}),
    });
    await ctx.db.insert("memberProfiles", {
      userId,
      firstName: "Test",
      lastName: "User",
      sex: "male",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus: opts.profileStatus ?? "verified",
      ...(opts.clanId ? { clanId: opts.clanId } : {}),
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
}

async function addMembership(
  t: T,
  userId: Id<"users">,
  departmentId: Id<"departments">,
  status: "pending_claim" | "active" | "removed" = "active"
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      addedBy: userId,
      status,
      ...(status === "pending_claim" ? { claimedAt: now } : {}),
    });
  });
}

async function insertAssignment(
  t: T,
  row: Pick<Doc<"roleAssignments">, "userId" | "roleType"> &
    Partial<Pick<Doc<"roleAssignments">, "departmentId" | "clanId" | "status">>
) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert("roleAssignments", {
      assignedBy: row.userId,
      status: "active",
      ...row,
    });
    return (await ctx.db.get(id))!;
  });
}

/** Runs the scheduled dispatches and returns every notification row written. */
async function sentNotifications(t: T) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return await t.run(async (ctx) => await ctx.db.query("notifications").collect());
}

function recipientsOf(row: Doc<"notifications">) {
  if (row.audience.type !== "users") throw new Error(`audience ${row.audience.type}`);
  return [...row.audience.userIds].sort();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("notifyAppointment (AC-1, AC-2, AC-3, AC-17)", () => {
  it("sends N13 to the appointee and N14 to the verified roster only", async () => {
    const t = testConvex();
    const { media, finance } = await seedGroups(t);
    const actor = await createUser(t);
    const delegate = await createUser(t, { firstName: "Dee" });
    const verified = await createUser(t);
    const unverified = await createUser(t, { profileStatus: "pending_verification" });
    const claimant = await createUser(t);
    const removed = await createUser(t);
    const deleted = await createUser(t, { deleted: true });
    const elsewhere = await createUser(t);
    for (const id of [delegate, verified, unverified, deleted]) await addMembership(t, id, media);
    await addMembership(t, claimant, media, "pending_claim");
    await addMembership(t, removed, media, "removed");
    await addMembership(t, elsewhere, finance);

    const assignment = await insertAssignment(t, {
      userId: delegate,
      roleType: "department_admin",
      departmentId: media,
    });
    await t.run(async (ctx) => await notifyAppointment(ctx, assignment, actor));

    const rows = await sentNotifications(t);
    expect(rows.every((r) => r.audience.type !== "all")).toBe(true);

    const n13 = rows.find((r) => r.kind === "N13")!;
    expect(recipientsOf(n13)).toEqual([delegate]);
    expect(n13.deepLink).toEqual({ type: "role_assignment", id: assignment._id });

    const n14 = rows.find((r) => r.kind === "N14")!;
    expect(recipientsOf(n14)).toEqual([verified]);
    expect(n14.deepLink).toEqual({ type: "new_leader", id: assignment._id });
    expect(n14.body).toBe("Dee User is now the delegate for Media.");
    expect(rows).toHaveLength(2);
  });

  it("sends N14 for a clan elder to the clan's verified members", async () => {
    const t = testConvex();
    const { judah } = await seedGroups(t);
    const actor = await createUser(t);
    const elder = await createUser(t, { clanId: judah });
    const member = await createUser(t, { clanId: judah });
    await createUser(t, { clanId: judah, profileStatus: "pending_verification" });
    await createUser(t, { clanId: judah, deleted: true });
    await createUser(t);

    const assignment = await insertAssignment(t, { userId: elder, roleType: "clan_elder", clanId: judah });
    expect(await t.run(async (ctx) => await resolveNewLeaderRecipientIds(ctx, assignment))).toEqual([member]);
  });

  it("sends a System Admin appointment to the appointee and nothing else", async () => {
    const t = testConvex();
    const actor = await createUser(t);
    const admin = await createUser(t);
    const assignment = await insertAssignment(t, { userId: admin, roleType: "system_admin" });
    await t.run(async (ctx) => await notifyAppointment(ctx, assignment, actor));

    const rows = await sentNotifications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("N13");
    expect(recipientsOf(rows[0])).toEqual([admin]);
  });

  it("writes no N14 row when the group has nobody else in it", async () => {
    const t = testConvex();
    const { finance } = await seedGroups(t);
    const actor = await createUser(t);
    const hod = await createUser(t);
    await addMembership(t, hod, finance);
    const assignment = await insertAssignment(t, { userId: hod, roleType: "hod", departmentId: finance });
    await t.run(async (ctx) => await notifyAppointment(ctx, assignment, actor));

    const rows = await sentNotifications(t);
    expect(rows.map((r) => r.kind)).toEqual(["N13"]);
  });
});

describe("findIdenticalActiveAssignment (AC-4)", () => {
  it("finds the sitting HOD's own seat and nothing broader", async () => {
    const t = testConvex();
    const { media, finance, judah } = await seedGroups(t);
    const hod = await createUser(t);
    const seat = await insertAssignment(t, { userId: hod, roleType: "hod", departmentId: media });
    await insertAssignment(t, { userId: hod, roleType: "clan_elder", clanId: judah });

    const find = (args: Parameters<typeof findIdenticalActiveAssignment>[1]) =>
      t.run(async (ctx) => (await findIdenticalActiveAssignment(ctx, args))?._id ?? null);

    expect(await find({ userId: hod, roleType: "hod", departmentId: media })).toBe(seat._id);
    expect(await find({ userId: hod, roleType: "hod", departmentId: finance })).toBeNull();
    expect(await find({ userId: hod, roleType: "department_admin", departmentId: media })).toBeNull();
    expect(await find({ userId: hod, roleType: "clan_elder", clanId: judah })).not.toBeNull();
  });

  it("ignores a revoked row", async () => {
    const t = testConvex();
    const { judah } = await seedGroups(t);
    const elder = await createUser(t);
    await insertAssignment(t, { userId: elder, roleType: "clan_elder", clanId: judah, status: "revoked" });
    const found = await t.run(
      async (ctx) => await findIdenticalActiveAssignment(ctx, { userId: elder, roleType: "clan_elder", clanId: judah })
    );
    expect(found).toBeNull();
  });
});

describe("endRoleAssignment (AC-5, AC-7)", () => {
  it("revokes, logs and sends one private N15 per assignment", async () => {
    const t = testConvex();
    const { media } = await seedGroups(t);
    const actor = await createUser(t);
    const hod = await createUser(t);
    const bystander = await createUser(t);
    await addMembership(t, bystander, media);
    const row = await insertAssignment(t, { userId: hod, roleType: "hod", departmentId: media });

    const ended = await t.run(
      async (ctx) => await endRoleAssignment(ctx, row, { actorId: actor, reason: "replaced_department_hod" })
    );
    expect(ended).toBe(true);

    const rows = await sentNotifications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("N15");
    expect(recipientsOf(rows[0])).toEqual([hod]);
    expect(rows[0].title).toBe("Your role as HOD for Media has ended");
    expect(rows[0].body).toBe("Someone else now holds this role.");

    const { status, log } = await t.run(async (ctx) => ({
      status: (await ctx.db.get(row._id))!.status,
      log: await ctx.db.query("activityLogs").collect(),
    }));
    expect(status).toBe("revoked");
    expect(log.map((l) => l.action)).toEqual(["role.revoked"]);
    expect(log[0].metadata).toMatchObject({ reason: "replaced_department_hod", userId: hod });
  });

  it("tells a plain revoke, or a move to another department, to speak to Administration", async () => {
    const t = testConvex();
    const actor = await createUser(t);
    const admin = await createUser(t);
    const row = await insertAssignment(t, { userId: admin, roleType: "system_admin" });
    await t.run(async (ctx) => await endRoleAssignment(ctx, row, { actorId: actor, reason: "replaced_person_hod" }));

    const [n15] = await sentNotifications(t);
    expect(n15.title).toBe("Your role as System Admin has ended");
    expect(n15.body).toBe("Speak to Administration if this looks wrong.");
  });

  it("sends nothing when suppressed, as roster removal and account deletion ask", async () => {
    const t = testConvex();
    const { media } = await seedGroups(t);
    const delegate = await createUser(t);
    const row = await insertAssignment(t, { userId: delegate, roleType: "department_admin", departmentId: media });
    await t.run(
      async (ctx) =>
        await endRoleAssignment(ctx, row, { actorId: delegate, note: null, revokedAt: 1, suppressNotice: true })
    );

    expect(await sentNotifications(t)).toHaveLength(0);
    const after = await t.run(async (ctx) => await ctx.db.get(row._id));
    expect(after).toMatchObject({ status: "revoked", revokedAt: 1, revokedBy: delegate });
    expect(after!.note).toBeUndefined();
  });

  it("does nothing for an assignment that is already revoked, even when handed in twice", async () => {
    const t = testConvex();
    const { judah } = await seedGroups(t);
    const actor = await createUser(t);
    const elder = await createUser(t);
    const row = await insertAssignment(t, { userId: elder, roleType: "clan_elder", clanId: judah });

    const results = await t.run(async (ctx) => [
      await endRoleAssignment(ctx, row, { actorId: actor }),
      await endRoleAssignment(ctx, row, { actorId: actor }),
    ]);
    expect(results).toEqual([true, false]);

    expect(await sentNotifications(t)).toHaveLength(1);
    const logs = await t.run(async (ctx) => await ctx.db.query("activityLogs").collect());
    expect(logs).toHaveLength(1);
  });
});

describe("resolveAdministrationReviewerIds (AC-8)", () => {
  async function seedAdministration(t: T) {
    return await t.run(
      async (ctx) => await ctx.db.insert("departments", { name: "Administration", order: 0 })
    );
  }

  it("reaches the Administration HOD and delegates, once each, and no System Admin", async () => {
    const t = testConvex();
    const { media } = await seedGroups(t);
    const administration = await seedAdministration(t);
    const hod = await createUser(t);
    const delegate = await createUser(t);
    const admin = await createUser(t);
    const mediaHod = await createUser(t);
    const formerDelegate = await createUser(t);
    await insertAssignment(t, { userId: hod, roleType: "hod", departmentId: administration });
    await insertAssignment(t, { userId: delegate, roleType: "department_admin", departmentId: administration });
    // The same person holding both seats is still one recipient.
    await insertAssignment(t, { userId: hod, roleType: "department_admin", departmentId: administration });
    await insertAssignment(t, {
      userId: formerDelegate,
      roleType: "department_admin",
      departmentId: administration,
      status: "revoked",
    });
    await insertAssignment(t, { userId: admin, roleType: "system_admin" });
    await insertAssignment(t, { userId: mediaHod, roleType: "hod", departmentId: media });

    const ids = await t.run(async (ctx) => await resolveAdministrationReviewerIds(ctx));
    expect([...ids].sort()).toEqual([hod, delegate].sort());
  });

  it("falls back to the active System Admins when Administration has nobody", async () => {
    const t = testConvex();
    const administration = await seedAdministration(t);
    const admin = await createUser(t);
    const formerAdmin = await createUser(t);
    const formerHod = await createUser(t);
    await insertAssignment(t, { userId: admin, roleType: "system_admin" });
    await insertAssignment(t, { userId: formerAdmin, roleType: "system_admin", status: "revoked" });
    await insertAssignment(t, { userId: formerHod, roleType: "hod", departmentId: administration, status: "revoked" });

    expect(await t.run(async (ctx) => await resolveAdministrationReviewerIds(ctx))).toEqual([admin]);
  });

  it("returns nobody when there is no reviewer at all", async () => {
    const t = testConvex();
    expect(await t.run(async (ctx) => await resolveAdministrationReviewerIds(ctx))).toEqual([]);
  });
});

describe("notifyClaimActionable (AC-9, AC-17)", () => {
  async function pendingClaim(t: T, userId: Id<"users">, departmentId: Id<"departments">) {
    await addMembership(t, userId, departmentId, "pending_claim");
    return await t.run(
      async (ctx) =>
        (await ctx.db
          .query("departmentMemberships")
          .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "pending_claim"))
          .first())!
    );
  }

  it("sends N10 to the department's active HOD only", async () => {
    const t = testConvex();
    const { media } = await seedGroups(t);
    const actor = await createUser(t);
    const hod = await createUser(t);
    const delegate = await createUser(t);
    const claimant = await createUser(t, { firstName: "Cara" });
    await insertAssignment(t, { userId: hod, roleType: "hod", departmentId: media });
    await insertAssignment(t, { userId: delegate, roleType: "department_admin", departmentId: media });
    const claim = await pendingClaim(t, claimant, media);

    await t.run(async (ctx) => await notifyClaimActionable(ctx, claim, actor));

    const rows = await sentNotifications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("N10");
    expect(recipientsOf(rows[0])).toEqual([hod]);
    expect(rows[0].deepLink).toEqual({ type: "department_claim", id: media });
    expect(rows[0].title).toBe("Someone asked to serve in Media");
    expect(rows[0].body).toBe("Cara User wants to join the Media roster.");
  });

  it("writes no row when the department has no active HOD", async () => {
    const t = testConvex();
    const { media } = await seedGroups(t);
    const actor = await createUser(t);
    const formerHod = await createUser(t);
    const claimant = await createUser(t);
    await insertAssignment(t, { userId: formerHod, roleType: "hod", departmentId: media, status: "revoked" });
    const claim = await pendingClaim(t, claimant, media);

    await t.run(async (ctx) => await notifyClaimActionable(ctx, claim, actor));
    expect(await sentNotifications(t)).toHaveLength(0);
  });

  it("skips a claim on a department the claimant leads, and a row that is no longer a claim", async () => {
    const t = testConvex();
    const { media, finance } = await seedGroups(t);
    const actor = await createUser(t);
    const hod = await createUser(t);
    const financeHod = await createUser(t);
    const member = await createUser(t);
    await insertAssignment(t, { userId: hod, roleType: "hod", departmentId: media });
    await insertAssignment(t, { userId: financeHod, roleType: "hod", departmentId: finance });
    const ownClaim = await pendingClaim(t, hod, media);
    await addMembership(t, member, finance, "active");
    const activeRow = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("departmentMemberships")
          .withIndex("by_userId_status", (q) => q.eq("userId", member).eq("status", "active"))
          .first())!
    );

    await t.run(async (ctx) => {
      await notifyClaimActionable(ctx, ownClaim, actor);
      await notifyClaimActionable(ctx, activeRow, actor);
    });
    expect(await sentNotifications(t)).toHaveLength(0);
  });
});

describe("pushOnFirstPublish (AC-11)", () => {
  async function insertAnnouncement(
    t: T,
    createdBy: Id<"users">,
    fields: Partial<Doc<"announcements">> = {}
  ) {
    return await t.run(
      async (ctx) =>
        await ctx.db.insert("announcements", {
          title: "Harvest Sunday",
          body: "Bring a gift.",
          startDate: now,
          endDate: now + 86_400_000,
          status: "published",
          createdBy,
          createdAt: now,
          updatedAt: now,
          ...fields,
        })
    );
  }

  it("pushes N21 once across publish, disable and publish again", async () => {
    const t = testConvex();
    const actor = await createUser(t);
    const id = await insertAnnouncement(t, actor);

    const results = await t.run(async (ctx) => {
      const first = await pushOnFirstPublish(ctx, id, actor);
      await ctx.db.patch(id, { status: "draft" });
      await ctx.db.patch(id, { status: "published" });
      const second = await pushOnFirstPublish(ctx, id, actor);
      return [first, second];
    });
    expect(results).toEqual([true, false]);

    const rows = await sentNotifications(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("N21");
    expect(rows[0].deepLink).toEqual({ type: "announcement", id });
    const after = await t.run(async (ctx) => await ctx.db.get(id));
    expect(after!.firstPublishedAt).toBeTypeOf("number");
  });

  it("stays silent for a row the backfill already marked", async () => {
    const t = testConvex();
    const actor = await createUser(t);
    const id = await insertAnnouncement(t, actor, { firstPublishedAt: 1 });

    expect(await t.run(async (ctx) => await pushOnFirstPublish(ctx, id, actor))).toBe(false);
    expect(await sentNotifications(t)).toHaveLength(0);
    const after = await t.run(async (ctx) => await ctx.db.get(id));
    expect(after!.firstPublishedAt).toBe(1);
  });
});

describe("notificationTargetingMigration (AC-3, AC-11)", () => {
  it("backfills published, archived and once published drafts, and leaves a never published draft", async () => {
    const t = testConvex();
    const actor = await createUser(t);
    const ids = await t.run(async (ctx) => {
      const base = {
        body: "b",
        startDate: now,
        endDate: now,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      };
      const published = await ctx.db.insert("announcements", { ...base, title: "p", status: "published" });
      const archived = await ctx.db.insert("announcements", { ...base, title: "a", status: "archived" });
      const disabled = await ctx.db.insert("announcements", { ...base, title: "d", status: "draft" });
      const neverPublished = await ctx.db.insert("announcements", { ...base, title: "n", status: "draft" });
      const createdPublished = await ctx.db.insert("announcements", { ...base, title: "c", status: "draft" });
      await ctx.db.insert("activityLogs", {
        actorUserId: actor,
        action: "content.announcement_published",
        targetType: "announcements",
        targetId: disabled,
      });
      await ctx.db.insert("activityLogs", {
        actorUserId: actor,
        action: "content.announcement_created",
        targetType: "announcements",
        targetId: neverPublished,
        metadata: { status: "draft" },
      });
      await ctx.db.insert("activityLogs", {
        actorUserId: actor,
        action: "content.announcement_created",
        targetType: "announcements",
        targetId: createdPublished,
        metadata: { status: "published" },
      });
      return { published, archived, disabled, neverPublished, createdPublished };
    });

    expect(await t.query(internal.notificationTargetingMigration.verify, {})).toMatchObject({
      announcementsMissing: 4,
    });
    expect(await t.mutation(internal.notificationTargetingMigration.backfillFirstPublishedAt, {})).toEqual({
      patched: 4,
    });
    expect(await t.mutation(internal.notificationTargetingMigration.backfillFirstPublishedAt, {})).toEqual({
      patched: 0,
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("announcements").collect());
    const marked = Object.fromEntries(rows.map((r) => [r._id, r.firstPublishedAt !== undefined]));
    expect(marked).toEqual({
      [ids.published]: true,
      [ids.archived]: true,
      [ids.disabled]: true,
      [ids.neverPublished]: false,
      [ids.createdPublished]: true,
    });
    expect(await t.query(internal.notificationTargetingMigration.verify, {})).toMatchObject({
      announcementsMissing: 0,
    });
  });

  it("narrows a broadcast appointment notice to its appointee and leaves other broadcasts", async () => {
    const t = testConvex();
    const actor = await createUser(t);
    const elder = await createUser(t);
    const { judah } = await seedGroups(t);
    const assignment = await insertAssignment(t, { userId: elder, roleType: "clan_elder", clanId: judah });
    const { appointment, other } = await t.run(async (ctx) => ({
      appointment: await ctx.db.insert("notifications", {
        title: "New elder",
        body: "b",
        audience: { type: "all" },
        deepLink: { type: "role_assignment", id: assignment._id },
        createdBy: actor,
      }),
      other: await ctx.db.insert("notifications", {
        title: "Harvest",
        body: "b",
        audience: { type: "all" },
        deepLink: { type: "announcement", id: "x" },
        createdBy: actor,
      }),
    }));

    expect(await t.query(internal.notificationTargetingMigration.verify, {})).toMatchObject({
      appointmentRowsToAll: 1,
    });
    expect(await t.mutation(internal.notificationTargetingMigration.retargetAppointmentNotices, {})).toEqual({
      patched: 1,
    });

    const after = await t.run(async (ctx) => ({
      appointment: (await ctx.db.get(appointment))!,
      other: (await ctx.db.get(other))!,
    }));
    expect(after.appointment.audience).toEqual({ type: "users", userIds: [elder] });
    expect(after.other.audience).toEqual({ type: "all" });
    expect(await t.query(internal.notificationTargetingMigration.verify, {})).toEqual({
      announcementsMissing: 0,
      appointmentRowsToAll: 0,
    });
  });
});
