import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { HOSPITALITY_DEPARTMENT_NAME, REMOVED_VISITOR_LABEL } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assignClanFor,
  clanQueuePage,
  clanSizes,
  hospitalityReport,
  insertWalkIn,
  joinCandidates,
  joinWalkInFor,
  notYetMemberPage,
  recordContactFor,
  recordVisitFor,
  visitorListPage,
  visitorRecord,
} from "./hospitality";
import { anonymiseVisitorsForDeletedUser } from "./lib/visitorAccount";

/**
 * Hospitality core, slices 8 to 10 (spec 0024): joining a walk in to an
 * account, the "Not yet a member" view, and clan placement with N37.
 * AC-27, AC-28, AC-30, AC-32 to AC-34.
 *
 * Same split as the other Hospitality suites: bodies are driven with a
 * resolved operator, because the harness cannot stand up Better Auth.
 */

const now = Date.now();
const TODAY = "2026-11-13";
const EARLIER = "2026-11-08";
const page = { numItems: 50, cursor: null };

type T = ReturnType<typeof testConvex>;

async function hospitality(t: T) {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("departments")
          .withIndex("by_name", (q) => q.eq("name", HOSPITALITY_DEPARTMENT_NAME))
          .first()
      )?._id ??
      (await ctx.db.insert("departments", { name: HOSPITALITY_DEPARTMENT_NAME, order: 1 }))
  );
}

async function operatorFor(t: T) {
  const departmentId = await hospitality(t);
  const user = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `op-${crypto.randomUUID().slice(0, 8)}@test.org`,
      firstName: "Op",
      role: "member",
      profileCompleted: true,
    });
    await ctx.db.insert("roleAssignments", {
      userId,
      roleType: "hod",
      assignedBy: userId,
      status: "active",
      departmentId,
    });
    return (await ctx.db.get(userId))!;
  });
  return { user, departmentId, role: "hod" as const };
}
type Operator = Awaited<ReturnType<typeof operatorFor>>;

async function walkIn(t: T, operator: Operator, firstName = "Grace") {
  return await t.run(async (ctx) => {
    const { visitorId } = await insertWalkIn(
      ctx,
      operator,
      { firstName, visitDate: TODAY, phone: "0772123456", consent: true },
      TODAY
    );
    return visitorId;
  });
}

async function appAccount(
  t: T,
  { firstName = "Ruth", role = "visitor" as "visitor" | "member" } = {}
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `${firstName.toLowerCase()}-${crypto.randomUUID().slice(0, 6)}@test.org`,
      firstName,
      role,
      profileCompleted: false,
    })
  );
  const { visitorId } = await t.mutation(internal.hospitality.ensureAppVisitor, { userId });
  return { userId, visitorId: visitorId! };
}

async function profile(
  t: T,
  userId: Id<"users">,
  fields: {
    profileStatus?: "pending_verification" | "sent_back" | "verified";
    verifiedAt?: number;
    clanId?: Id<"clans">;
    firstName?: string;
  } = {}
) {
  return await t.run((ctx) =>
    ctx.db.insert("memberProfiles", {
      userId,
      firstName: fields.firstName ?? "Mem",
      lastName: "Ber",
      sex: "female",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus: fields.profileStatus ?? "verified",
      verifiedAt: fields.verifiedAt,
      clanId: fields.clanId,
      createdAt: now,
      updatedAt: now,
    })
  );
}

async function expectCode(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ConvexError);
  expect((caught as ConvexError<{ code: string }>).data.code).toBe(code);
}

async function scheduledDispatches(t: T) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.includes("notifications"))
      .map((job) => job.args[0] as { kind?: string; audience: { userIds: string[] } })
  );
}

// ── AC-27, AC-28: the join ──────────────────────────────────────────────────

describe("joinCandidates (AC-27)", () => {
  it("suggests a phone match and finds others by name, never a walk in", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator);
    const matched = await appAccount(t, { firstName: "Gracie" });
    await t.run((ctx) => ctx.db.patch(matched.visitorId, { accountPhone: "+256772123456" }));
    const searched = await appAccount(t, { firstName: "Ruth" });
    await walkIn(t, operator, "Ruth");

    const suggested = await t.run((ctx) => joinCandidates(ctx, { visitorId: grace }));
    expect(suggested.map((row) => row._id)).toEqual([matched.visitorId]);
    expect(suggested[0]).toMatchObject({ phoneMatch: true });
    expect(suggested[0]).not.toHaveProperty("accountPhone");

    const found = await t.run((ctx) => joinCandidates(ctx, { visitorId: grace, search: "ruth" }));
    expect(found.map((row) => row._id)).toEqual([matched.visitorId, searched.visitorId]);
    expect(found[1]).toMatchObject({ phoneMatch: false });
  });
});

describe("joinWalkInToAccount (AC-28)", () => {
  it("keeps the walk in, moves visits, drops a same date duplicate, keeps one open follow up", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator);
    await t.run((ctx) => recordVisitFor(ctx, operator, { visitorId: grace, visitDate: EARLIER }, TODAY));
    const app = await appAccount(t);
    await t.run((ctx) => ctx.db.patch(app.visitorId, { accountPhone: "+256772123456" }));
    // The app row's own visit is on the same date as one of the walk in's.
    await t.run((ctx) => recordVisitFor(ctx, operator, { visitorId: app.visitorId, visitDate: TODAY }, TODAY));
    await t.run((ctx) =>
      recordContactFor(ctx, operator, { visitorId: app.visitorId, channel: "in_person", outcome: "no_answer" })
    );

    const result = await t.run((ctx) =>
      joinWalkInFor(ctx, operator, { walkInId: grace, appVisitorId: app.visitorId })
    );
    expect(result.visitorId).toBe(grace);

    const state = await t.run(async (ctx) => ({
      survivor: (await ctx.db.get(grace))!,
      merged: (await ctx.db.get(app.visitorId))!,
      visits: await ctx.db
        .query("visitorVisits")
        .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", grace))
        .collect(),
      followUps: await ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", grace))
        .collect(),
      contacts: await ctx.db
        .query("visitorContacts")
        .withIndex("by_visitorId_at", (q) => q.eq("visitorId", grace))
        .collect(),
      logs: await ctx.db
        .query("activityLogs")
        .withIndex("by_action", (q) => q.eq("action", "hospitality.visitor_joined"))
        .collect(),
    }));

    expect(state.survivor).toMatchObject({
      kind: "walk_in",
      firstName: "Grace",
      userId: app.userId,
      accountPhone: "+256772123456",
      phone: "+256772123456",
      listStatus: "active",
      visitCount: 2,
      firstVisitDate: EARLIER,
      lastVisitDate: TODAY,
    });
    expect(state.survivor.searchName).toContain("@test.org");
    expect(state.merged).toMatchObject({ listStatus: "merged", mergedIntoId: grace });
    expect(state.merged.userId).toBeUndefined();
    expect(state.merged.accountPhone).toBeUndefined();
    expect(state.merged.visitCount).toBe(0);
    expect(state.visits.map((visit) => visit.visitDate)).toEqual([EARLIER, TODAY]);
    expect(state.contacts).toHaveLength(1);
    const open = state.followUps.filter((row) => row.status === "open");
    expect(state.followUps).toHaveLength(2);
    expect(open).toHaveLength(1);
    expect(open[0]!.firstVisitDate).toBe(EARLIER);
    expect(state.followUps.find((row) => row.status === "done")).toMatchObject({
      outcome: "closed",
      closeNote: "merged",
    });
    expect(state.logs.map((log) => log.targetId).sort()).toEqual([grace, app.visitorId].sort());
  });

  it("makes the survivor a member when the account already is one", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator);
    const app = await appAccount(t, { role: "member" });
    await t.run((ctx) => joinWalkInFor(ctx, operator, { walkInId: grace, appVisitorId: app.visitorId }));
    expect((await t.run((ctx) => ctx.db.get(grace)))!.listStatus).toBe("member");
  });

  it("refuses a joined walk in, a merged app row and a walk in as the account side", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator);
    const peter = await walkIn(t, operator, "Peter");
    const app = await appAccount(t);
    const other = await appAccount(t, { firstName: "Other" });

    await expectCode(
      t.run((ctx) => joinWalkInFor(ctx, operator, { walkInId: grace, appVisitorId: peter })),
      "HOSPITALITY_NOT_JOINABLE"
    );
    await t.run((ctx) => joinWalkInFor(ctx, operator, { walkInId: grace, appVisitorId: app.visitorId }));
    await expectCode(
      t.run((ctx) => joinWalkInFor(ctx, operator, { walkInId: grace, appVisitorId: other.visitorId })),
      "HOSPITALITY_ALREADY_JOINED"
    );
    await expectCode(
      t.run((ctx) => joinWalkInFor(ctx, operator, { walkInId: peter, appVisitorId: app.visitorId })),
      "HOSPITALITY_NOT_JOINABLE"
    );
  });
});

// ── AC-30: not yet a member ─────────────────────────────────────────────────

describe("notYetMemberPage (AC-30)", () => {
  it("lists account rows with no profile at all, oldest first", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const first = await appAccount(t, { firstName: "First" });
    const pending = await appAccount(t, { firstName: "Pending" });
    await profile(t, pending.userId, { profileStatus: "pending_verification" });
    const sentBack = await appAccount(t, { firstName: "Sent" });
    await profile(t, sentBack.userId, { profileStatus: "sent_back" });
    await walkIn(t, operator);
    const second = await appAccount(t, { firstName: "Second" });

    const result = await t.run((ctx) => notYetMemberPage(ctx, page));
    expect(result.page.map((row) => row._id)).toEqual([first.visitorId, second.visitorId]);
  });
});

// ── AC-32 to AC-34: clan placement ──────────────────────────────────────────

async function clans(t: T, names: string[]) {
  return await t.run(async (ctx) =>
    Promise.all(names.map((name, order) => ctx.db.insert("clans", { name, order })))
  );
}

describe("clan queue and sizes (AC-32, AC-33)", () => {
  it("orders by verifiedAt with legacy rows first and leaves out placed members", async () => {
    const t = testConvex();
    const [judah] = await clans(t, ["Judah"]);
    const late = await appAccount(t, { role: "member" });
    const early = await appAccount(t, { role: "member" });
    const legacy = await appAccount(t, { role: "member" });
    const placed = await appAccount(t, { role: "member" });
    const pending = await appAccount(t);
    const lateId = await profile(t, late.userId, { verifiedAt: 300 });
    const earlyId = await profile(t, early.userId, { verifiedAt: 100 });
    const legacyId = await profile(t, legacy.userId);
    await profile(t, placed.userId, { verifiedAt: 50, clanId: judah });
    await profile(t, pending.userId, { profileStatus: "pending_verification" });

    const result = await t.run((ctx) => clanQueuePage(ctx, page));
    expect(result.page.map((row) => row.profileId)).toEqual([legacyId, earlyId, lateId]);
  });

  it("counts verified members only and highlights the smallest, ties included", async () => {
    const t = testConvex();
    const ids = await clans(t, ["A", "B", "C", "D", "E"]);
    const counts = [5, 1, 2, 2, 0];
    for (const [index, count] of counts.entries()) {
      for (let n = 0; n < count; n++) {
        const { userId } = await appAccount(t, { role: "member" });
        await profile(t, userId, { clanId: ids[index], verifiedAt: n });
      }
    }
    // A wizard claim on a clan is not a member of it yet.
    const { userId } = await appAccount(t);
    await profile(t, userId, { clanId: ids[4], profileStatus: "pending_verification" });

    const sizes = await t.run((ctx) => clanSizes(ctx));
    expect(sizes.map((row) => [row.name, row.verifiedCount, row.highlighted])).toEqual([
      ["A", 5, false],
      ["B", 1, true],
      ["C", 2, true],
      ["D", 2, true],
      ["E", 0, true],
    ]);
  });
});

describe("assignClan (AC-34, N37)", () => {
  it("fills an empty clan, logs it, and notifies the member and the clan's active elders", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const [judah, levi] = await clans(t, ["Judah", "Levi"]);
    const member = await appAccount(t, { role: "member" });
    const profileId = await profile(t, member.userId, { verifiedAt: 1, firstName: "Grace" });
    const elder = await appAccount(t, { firstName: "Elder", role: "member" });
    const retired = await appAccount(t, { firstName: "Retired", role: "member" });
    const otherClan = await appAccount(t, { firstName: "Other", role: "member" });
    await t.run(async (ctx) => {
      for (const [userId, clanId, status] of [
        [elder.userId, judah, "active"],
        [retired.userId, judah, "revoked"],
        [otherClan.userId, levi, "active"],
      ] as const) {
        await ctx.db.insert("roleAssignments", {
          userId,
          roleType: "clan_elder",
          clanId,
          assignedBy: operator.user._id,
          status,
        });
      }
    });

    const result = await t.run((ctx) => assignClanFor(ctx, operator, { profileId, clanId: judah }));
    expect(result.elderIds).toEqual([elder.userId]);
    expect((await t.run((ctx) => ctx.db.get(profileId)))!.clanId).toBe(judah);

    const dispatches = await scheduledDispatches(t);
    expect(dispatches.every((job) => job.kind === "N37")).toBe(true);
    expect(dispatches.map((job) => job.audience.userIds)).toEqual([
      [member.userId],
      [elder.userId],
    ]);
    const log = await t.run((ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_action", (q) => q.eq("action", "hospitality.clan_assigned"))
        .first()
    );
    expect(log).toMatchObject({ targetId: profileId, departmentId: operator.departmentId });
  });

  it("never overwrites a clan and refuses a profile that is not verified", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const [judah, levi] = await clans(t, ["Judah", "Levi"]);
    const placed = await appAccount(t, { role: "member" });
    const placedId = await profile(t, placed.userId, { clanId: judah, verifiedAt: 1 });
    const pending = await appAccount(t);
    const pendingId = await profile(t, pending.userId, { profileStatus: "pending_verification" });

    await expectCode(
      t.run((ctx) => assignClanFor(ctx, operator, { profileId: placedId, clanId: levi })),
      "HOSPITALITY_CLAN_ALREADY_SET"
    );
    await expectCode(
      t.run((ctx) => assignClanFor(ctx, operator, { profileId: pendingId, clanId: levi })),
      "HOSPITALITY_PROFILE_NOT_VERIFIED"
    );
    expect((await t.run((ctx) => ctx.db.get(placedId)))!.clanId).toBe(judah);
    expect(await scheduledDispatches(t)).toHaveLength(0);
  });
});

// ── Review fixes: join and account deletion side effects ────────────────────

describe("after a join (AC-28 review fixes)", () => {
  /** A walk in and an app row, each with an open follow up, joined. */
  async function joinedPair(t: T) {
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator);
    const app = await appAccount(t);
    // The app row's follow up is created after the walk in's, so it is the
    // newer row; the join keeps the walk in's (older) one open.
    await t.run((ctx) =>
      recordVisitFor(ctx, operator, { visitorId: app.visitorId, visitDate: EARLIER }, TODAY)
    );
    await t.run((ctx) =>
      joinWalkInFor(ctx, operator, { walkInId: grace, appVisitorId: app.visitorId })
    );
    return { operator, grace, app };
  }

  it("the record and the list still show the open follow up", async () => {
    const t = testConvex();
    const { operator, grace } = await joinedPair(t);

    const record = await t.run((ctx) => visitorRecord(ctx, operator, grace));
    expect(record!.followUp).toMatchObject({ status: "open" });

    const page = await t.run((ctx) =>
      visitorListPage(ctx, { followUp: "open", paginationOpts: { numItems: 50, cursor: null }, today: TODAY })
    );
    expect(page.page.map((row) => row._id)).toContain(grace);
  });

  it("the merged duplicate is nobody's work: no closer, not counted in Reports", async () => {
    const t = testConvex();
    const { grace } = await joinedPair(t);
    const followUps = await t.run((ctx) =>
      ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", grace))
        .collect()
    );
    const duplicate = followUps.find((row) => row.status === "done")!;
    expect(duplicate).toMatchObject({ outcome: "closed", closeNote: "merged" });
    expect(duplicate.closedBy).toBeUndefined();

    const report = await t.run((ctx) => hospitalityReport(ctx, EARLIER, TODAY));
    expect(report.followUps).toMatchObject({ opened: 1, done: 0 });
  });

  it("account deletion also strips the merged row and credits nobody", async () => {
    const t = testConvex();
    const { grace, app } = await joinedPair(t);

    await t.run((ctx) => anonymiseVisitorsForDeletedUser(ctx, app.userId));

    const state = await t.run(async (ctx) => ({
      survivor: (await ctx.db.get(grace))!,
      merged: (await ctx.db.get(app.visitorId))!,
      followUps: await ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", grace))
        .collect(),
    }));
    expect(state.survivor).toMatchObject({ firstName: REMOVED_VISITOR_LABEL, listStatus: "removed" });
    expect(state.survivor.userId).toBeUndefined();
    // The merged row loses the account's names and email but stays merged.
    expect(state.merged).toMatchObject({
      firstName: REMOVED_VISITOR_LABEL,
      searchName: "",
      listStatus: "merged",
    });
    expect(state.merged.lastName).toBeUndefined();
    // The open follow up closed with nobody as its closer.
    expect(state.followUps.every((row) => row.status === "done")).toBe(true);
    expect(state.followUps.every((row) => row.closedBy === undefined)).toBe(true);
  });
});
