import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  BADGE_CAP,
  HOSPITALITY_DEPARTMENT_NAME,
  kampalaDayStartMs,
  type ContactChannel,
  type ContactOutcome,
} from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import {
  assignFollowUpFor,
  clanBalance,
  contactOutcomes,
  dashboardOverview,
  hospitalityReport,
  visitorJourney,
  followUpHealth,
  insertWalkIn,
  recordVisitFor,
  sidebarBadges,
} from "./hospitality";

/**
 * The Hospitality Dashboard (spec 0025): the header numbers and the welcome
 * state, follow up health, team load, clan balance and the sidebar badges.
 * AC-7 to AC-10, AC-15 to AC-17, AC-22, AC-23.
 *
 * Visits are written with `today` set to the visit's own date, so the
 * spec 0024 AC-5 backdate window never gets in the way of building history.
 */

// Monday 16 November 2026. Its Kampala week starts Sunday 15 November, so the
// 4 week window is 25 October to today (23 days) and the previous one 2 to
// 24 October.
const MONDAY = "2026-11-16";

type T = ReturnType<typeof testConvex>;

async function operatorFor(t: T) {
  return await t.run(async (ctx) => {
    const departmentId = await ctx.db.insert("departments", {
      name: HOSPITALITY_DEPARTMENT_NAME,
      order: 1,
    });
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
    return { user: (await ctx.db.get(userId))!, departmentId, role: "hod" as const };
  });
}
type Operator = Awaited<ReturnType<typeof operatorFor>>;

/** A walk in visiting on each of these dates, the first being their first. */
async function visitorWith(t: T, operator: Operator, firstName: string, dates: string[]) {
  return await t.run(async (ctx) => {
    const [first, ...rest] = dates;
    const { visitorId } = await insertWalkIn(
      ctx,
      operator,
      { firstName, visitDate: first! },
      first!
    );
    for (const date of rest) {
      await recordVisitFor(ctx, operator, { visitorId, visitDate: date }, date);
    }
    return visitorId;
  });
}

/** A contact logged at noon Kampala time on `day`. */
async function contactOn(
  t: T,
  operator: Operator,
  visitorId: Id<"visitors">,
  day: string,
  channel: ContactChannel = "call"
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("visitorContacts", {
      visitorId,
      channel,
      outcome: channel === "in_app" ? undefined : "no_answer",
      byUserId: operator.user._id,
      at: kampalaDayStartMs(day) + 12 * 3_600_000,
    });
  });
}

describe("getDashboardOverview (AC-7, AC-8, AC-10)", () => {
  it("counts the window's visitors, first timers, came back and on time", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);

    // Sunday 15 November: three first timers. One called the same day, one
    // called on day 3 (late), one not called yet.
    const ann = await visitorWith(t, operator, "Ann", ["2026-11-15"]);
    const ben = await visitorWith(t, operator, "Ben", ["2026-11-15"]);
    await visitorWith(t, operator, "Cal", ["2026-11-15"]);
    await contactOn(t, operator, ann, "2026-11-15");
    await contactOn(t, operator, ben, "2026-11-18");

    // An earlier first timer who came back, contacted on day 1.
    const dee = await visitorWith(t, operator, "Dee", ["2026-11-01", "2026-11-08"]);
    await contactOn(t, operator, dee, "2026-11-02");

    // A returning visitor from the previous window, back in this one.
    await visitorWith(t, operator, "Eve", ["2026-10-04", "2026-11-08"]);

    // On Monday the Sunday three are inside their deadline: not eligible.
    const monday = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "4w"));
    expect(monday.window).toEqual({ from: "2026-10-25", to: MONDAY });
    expect(monday.previousWindow).toEqual({ from: "2026-10-02", to: "2026-10-24" });
    expect(monday.hasAnyVisit).toBe(true);
    expect(monday.headline.current).toMatchObject({
      visitors: 5,
      firstTimers: 4,
      cameBackPercent: 25,
      onTime: { eligible: 1, percent: 100 },
    });
    // Contacted rows: Ann on day 0, Dee on day 1 (Ben's day 3 is still to come).
    expect(monday.headline.current.onTime.medianDays).toBe(0.5);
    expect(monday.headline.previous).toMatchObject({
      visitors: 1,
      firstTimers: 1,
      cameBackPercent: 100,
      onTime: { eligible: 1, percent: 0, medianDays: null },
    });

    // On Wednesday, day 3: all three are eligible. Ann on time, Ben late, Cal
    // not reached. With Dee, 2 of 4.
    const wednesday = await t.run((ctx) => dashboardOverview(ctx, "2026-11-18", "4w"));
    expect(wednesday.headline.current.onTime).toEqual({
      eligible: 4,
      percent: 50,
      medianDays: 1,
    });
  });

  it("day 2 is not eligible, day 3 is and counts late (AC-8)", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    await visitorWith(t, operator, "Fay", ["2026-11-14"]);

    const dayTwo = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "4w"));
    expect(dayTwo.headline.current.onTime).toEqual({ eligible: 0, percent: null, medianDays: null });

    const dayThree = await t.run((ctx) => dashboardOverview(ctx, "2026-11-17", "4w"));
    expect(dayThree.headline.current.onTime).toEqual({ eligible: 1, percent: 0, medianDays: null });
  });

  it("an in app message never counts as contact (AC-8)", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const gus = await visitorWith(t, operator, "Gus", ["2026-11-01"]);
    await contactOn(t, operator, gus, "2026-11-01", "in_app");
    await contactOn(t, operator, gus, "2026-11-05", "whatsapp");

    const overview = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "4w"));
    // The WhatsApp on day 4 is the first personal contact: late.
    expect(overview.headline.current.onTime).toEqual({ eligible: 1, percent: 0, medianDays: 4 });
  });

  it("a contact before the first visit never counts (AC-8)", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const hal = await visitorWith(t, operator, "Hal", ["2026-11-03"]);
    await contactOn(t, operator, hal, "2026-11-02");
    const overview = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "4w"));
    expect(overview.headline.current.onTime.percent).toBe(0);
  });

  it("counts removed rows and never merged ones in the cohort (AC-10)", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const removed = await visitorWith(t, operator, "Ivy", ["2026-11-01"]);
    const merged = await visitorWith(t, operator, "Jon", ["2026-11-02"]);
    await t.run(async (ctx) => {
      await ctx.db.patch(removed, { listStatus: "removed" });
      await ctx.db.patch(merged, { listStatus: "merged" });
    });
    const overview = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "4w"));
    expect(overview.headline.current.firstTimers).toBe(1);
  });

  it("reports no visit at all on a new deployment (AC-17)", async () => {
    const t = testConvex();
    await operatorFor(t);
    const overview = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "12w"));
    expect(overview.hasAnyVisit).toBe(false);
    expect(overview.headline.current).toEqual({
      visitors: 0,
      firstTimers: 0,
      cameBackPercent: null,
      onTime: { percent: null, medianDays: null, eligible: 0 },
    });
  });

  it("refuses a bad today or period, and returns null without access", async () => {
    const t = testConvex();
    await operatorFor(t);
    const codeOf = async (args: { today: string; period: string }) => {
      try {
        await t.query(api.hospitality.getDashboardOverview, args);
      } catch (error) {
        return (error as ConvexError<{ code: string }>).data.code;
      }
      return null;
    };
    expect(await codeOf({ today: "2026-13-01", period: "4w" })).toBe(
      "HOSPITALITY_TODAY_INVALID"
    );
    expect(await codeOf({ today: MONDAY, period: "1y" })).toBe("HOSPITALITY_PERIOD_INVALID");
    // No identity in the harness: not an operator.
    expect(
      await t.query(api.hospitality.getDashboardOverview, { today: MONDAY, period: "12w" })
    ).toBeNull();
  });
});

/** A verified member, placed in `clanId` or waiting; `deleted` marks the account gone. */
async function memberWith(t: T, options: { clanId?: Id<"clans">; deleted?: boolean } = {}) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `m-${crypto.randomUUID().slice(0, 8)}@test.org`,
      role: "member",
      profileCompleted: true,
      ...(options.deleted ? { deletedAt: Date.now() } : {}),
    });
    await ctx.db.insert("memberProfiles", {
      userId,
      firstName: "Mem",
      lastName: "Ber",
      sex: "male",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus: "verified",
      verifiedAt: Date.now(),
      clanId: options.clanId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

/** A pending claim on Hospitality's roster. */
async function claimOn(t: T, operator: Operator) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `c-${crypto.randomUUID().slice(0, 8)}@test.org`,
      role: "member",
      profileCompleted: true,
    });
    await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId: operator.departmentId,
      addedBy: userId,
      status: "pending_claim",
      claimedAt: Date.now(),
    });
  });
}

describe("getSidebarBadges (AC-22, AC-23)", () => {
  it("counts unassigned open follow ups, members waiting for a clan and claims", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    // Two first timers, so two open follow ups; one gets an assignee.
    await visitorWith(t, operator, "Ann", ["2026-11-15"]);
    const ben = await visitorWith(t, operator, "Ben", ["2026-11-15"]);
    await t.run(async (ctx) => {
      const followUp = await ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", ben))
        .first();
      await assignFollowUpFor(ctx, operator, {
        followUpId: followUp!._id,
        assigneeUserId: operator.user._id,
      });
    });

    const clanId = await t.run((ctx) => ctx.db.insert("clans", { name: "Judah", order: 0 }));
    await memberWith(t); // waiting
    await memberWith(t, { clanId }); // placed
    await memberWith(t, { deleted: true }); // account gone, never counted
    await claimOn(t, operator);

    const badges = await t.run((ctx) => sidebarBadges(ctx, operator));
    expect(badges).toEqual({ unassignedFollowUps: 1, waitingForClan: 1, requestsWaiting: 1 });
  });

  it("never tells a roster member the claim count", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    await claimOn(t, operator);
    const badges = await t.run((ctx) =>
      sidebarBadges(ctx, { departmentId: operator.departmentId, role: "roster" })
    );
    expect(badges.requestsWaiting).toBeNull();
  });

  it("stops reading at the cap", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    await t.run(async (ctx) => {
      const visitorId = await ctx.db.insert("visitors", {
        kind: "walk_in",
        firstName: "Many",
        searchName: "many",
        visitCount: 1,
        firstVisitDate: MONDAY,
        listStatus: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (let i = 0; i < BADGE_CAP + 5; i += 1) {
        await ctx.db.insert("followUps", {
          visitorId,
          firstVisitDate: MONDAY,
          status: "open",
          attemptCount: 0,
          openedAt: Date.now(),
        });
      }
    });
    const badges = await t.run((ctx) => sidebarBadges(ctx, operator));
    expect(badges.unassignedFollowUps).toBe(BADGE_CAP);
  });

  it("returns null to a caller without manageHospitality", async () => {
    const t = testConvex();
    await operatorFor(t);
    expect(await t.query(api.hospitality.getSidebarBadges, {})).toBeNull();
  });
});

/** A plain user with no Hospitality role. */
async function plainUser(t: T, firstName: string, deleted = false) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `u-${crypto.randomUUID().slice(0, 8)}@test.org`,
      firstName,
      role: "member",
      profileCompleted: true,
      ...(deleted ? { deletedAt: Date.now() } : {}),
    })
  );
}

/** The visitor's follow up, patched as given. */
async function patchFollowUp(
  t: T,
  visitorId: Id<"visitors">,
  patch: Partial<{
    assignedTo: Id<"users">;
    status: "done";
    closedAt: number;
    closedBy: Id<"users">;
  }>
) {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("followUps")
      .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
      .first();
    await ctx.db.patch(row!._id, patch);
  });
}

describe("getFollowUpHealth (AC-9, AC-15)", () => {
  it("groups open follow ups, lists who needs attention and the team load", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const gone = await plainUser(t, "Gone", true);
    const left = await plainUser(t, "Lena");

    await visitorWith(t, operator, "Ann", ["2026-11-15"]); // 1 day, unassigned
    const ben = await visitorWith(t, operator, "Ben", ["2026-11-10"]); // 6 days, assigned
    const cal = await visitorWith(t, operator, "Cal", ["2026-10-25"]); // 22 days, overdue
    await visitorWith(t, operator, "Dee", ["2026-11-05"]); // 11 days, unassigned
    const eve = await visitorWith(t, operator, "Eve", ["2026-11-01"]);
    const fay = await visitorWith(t, operator, "Fay", ["2026-11-02"]);
    const old = await visitorWith(t, operator, "Old", ["2026-09-01"]);
    await patchFollowUp(t, ben, { assignedTo: operator.user._id });
    // Lena no longer holds manageHospitality but still has Cal.
    await patchFollowUp(t, cal, { assignedTo: left });
    const noon = (day: string) => kampalaDayStartMs(day) + 12 * 3_600_000;
    await patchFollowUp(t, eve, { status: "done", closedAt: noon("2026-11-03"), closedBy: left });
    await patchFollowUp(t, fay, { status: "done", closedAt: noon("2026-11-04"), closedBy: gone });
    // Closed before the 4 week window: never counted as done in period.
    await patchFollowUp(t, old, { status: "done", closedAt: noon("2026-09-02"), closedBy: left });

    const health = await t.run((ctx) => followUpHealth(ctx, operator, MONDAY, "4w"));
    expect(health.buckets).toEqual([
      { key: "0-2", count: 1 },
      { key: "3-7", count: 1 },
      { key: "8-14", count: 1 },
      { key: "15+", count: 1 },
    ]);
    expect(health.unassigned).toBe(2);
    // Unassigned or waiting 15 days or more, oldest first visit first.
    expect(health.attention.map((row) => [row.name, row.daysWaiting, row.assignee])).toEqual([
      ["Cal", 22, "Lena"],
      ["Dee", 11, null],
      ["Ann", 1, null],
    ]);
    expect(health.attention[0]!.visitorId).toBe(cal);

    expect(health.teamLoad.unassignedOpen).toBe(2);
    expect(
      health.teamLoad.rows.map((row) => [row.name, row.formerOperator, row.open, row.doneInPeriod])
    ).toEqual([
      ["Lena", true, 1, 1],
      ["Op", false, 1, 0],
      ["a former member", false, 0, 1],
    ]);
  });

  it("an empty list when nobody is waiting too long (AC-9)", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const ann = await visitorWith(t, operator, "Ann", ["2026-11-15"]);
    await patchFollowUp(t, ann, { assignedTo: operator.user._id });
    const health = await t.run((ctx) => followUpHealth(ctx, operator, MONDAY, "4w"));
    expect(health.attention).toEqual([]);
    expect(health.unassigned).toBe(0);
  });

  it("lists at most five (AC-9)", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    for (const name of ["A", "B", "C", "D", "E", "F", "G"]) {
      await visitorWith(t, operator, name, ["2026-11-14"]);
    }
    const health = await t.run((ctx) => followUpHealth(ctx, operator, MONDAY, "4w"));
    expect(health.attention).toHaveLength(5);
  });
});

describe("getClanBalance (AC-16)", () => {
  it("lists clans smallest first, highlights the smallest three and counts the wait", async () => {
    const t = testConvex();
    await operatorFor(t);
    const ids = await t.run(async (ctx) => ({
      a: await ctx.db.insert("clans", { name: "Asher", order: 0 }),
      b: await ctx.db.insert("clans", { name: "Benjamin", order: 1 }),
      c: await ctx.db.insert("clans", { name: "Caleb", order: 2 }),
      d: await ctx.db.insert("clans", { name: "Dan", order: 3 }),
    }));
    for (let i = 0; i < 2; i += 1) await memberWith(t, { clanId: ids.a });
    await memberWith(t, { clanId: ids.c });
    for (let i = 0; i < 5; i += 1) await memberWith(t, { clanId: ids.d });
    await memberWith(t);
    await memberWith(t);
    await memberWith(t, { deleted: true });

    const balance = await t.run((ctx) => clanBalance(ctx));
    expect(balance.clans.map((clan) => [clan.name, clan.verifiedCount, clan.highlighted])).toEqual([
      ["Benjamin", 0, true],
      ["Caleb", 1, true],
      ["Asher", 2, true],
      ["Dan", 5, false],
    ]);
    expect(balance.waitingForClan).toBe(2);
  });

  it("returns null without access, like every Dashboard query", async () => {
    const t = testConvex();
    await operatorFor(t);
    expect(await t.query(api.hospitality.getClanBalance, {})).toBeNull();
    expect(
      await t.query(api.hospitality.getFollowUpHealth, { today: MONDAY, period: "4w" })
    ).toBeNull();
  });
});

/** A contact with a given outcome, at noon Kampala time on `day`. */
async function outcomeOn(
  t: T,
  operator: Operator,
  visitorId: Id<"visitors">,
  day: string,
  channel: ContactChannel,
  outcome?: ContactOutcome
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("visitorContacts", {
      visitorId,
      channel,
      outcome,
      byUserId: operator.user._id,
      at: kampalaDayStartMs(day) + 12 * 3_600_000,
    });
  });
}

describe("attendance trend (AC-11)", () => {
  it("bins the window like Reports does and marks the bin holding today", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    await visitorWith(t, operator, "Ann", ["2026-10-25", "2026-11-01", "2026-11-15"]);
    await visitorWith(t, operator, "Ben", ["2026-11-08"]);
    // First visit before the window: returning whenever seen inside it.
    await visitorWith(t, operator, "Cal", ["2026-10-04", "2026-11-15"]);

    // A Wednesday: the week of 15 November is still filling in.
    const today = "2026-11-18";
    const overview = await t.run((ctx) => dashboardOverview(ctx, today, "4w"));
    expect(overview.trend.weekly).toBe(true);
    expect(
      overview.trend.bins.map((bin) => [bin.key, bin.firstTimers, bin.returning, bin.soFar])
    ).toEqual([
      ["2026-10-25", 1, 0, false],
      ["2026-11-01", 0, 1, false],
      ["2026-11-08", 1, 0, false],
      ["2026-11-15", 0, 2, true],
    ]);

    // Reports over the same range gives the same numbers.
    const report = await t.run((ctx) =>
      hospitalityReport(ctx, overview.window.from, overview.window.to)
    );
    expect(report.bins).toEqual(overview.trend.bins.map(({ soFar: _soFar, ...bin }) => bin));
  });

  it("bins by month over 6 months", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    await visitorWith(t, operator, "Ann", ["2026-11-01"]);
    const overview = await t.run((ctx) => dashboardOverview(ctx, MONDAY, "6m"));
    expect(overview.trend.weekly).toBe(false);
    expect(overview.trend.bins.map((bin) => bin.key)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(overview.trend.bins.at(-1)).toMatchObject({ firstTimers: 1, soFar: true });
  });
});

describe("getVisitorJourney (AC-12, AC-14)", () => {
  it("counts each step against the cohort, on its own", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    // Ann: called and reached, three visits in November (a regular).
    const ann = await visitorWith(t, operator, "Ann", ["2026-11-01", "2026-11-08", "2026-11-15"]);
    await outcomeOn(t, operator, ann, "2026-11-02", "call", "reached");
    // Ben: only an in app message, never a contact or a reach.
    const ben = await visitorWith(t, operator, "Ben", ["2026-11-08"]);
    await outcomeOn(t, operator, ben, "2026-11-08", "in_app");
    // Cal: WhatsApp, no answer; on the app and a member.
    const cal = await visitorWith(t, operator, "Cal", ["2026-11-10"]);
    await outcomeOn(t, operator, cal, "2026-11-11", "whatsapp", "no_answer");
    // Dee: reached the day before her first visit, which never counts.
    const dee = await visitorWith(t, operator, "Dee", ["2026-11-12"]);
    await outcomeOn(t, operator, dee, "2026-11-11", "call", "reached");
    const calUser = await plainUser(t, "Cal");
    await t.run((ctx) => ctx.db.patch(cal, { userId: calUser, listStatus: "member" }));

    const journey = await t.run((ctx) => visitorJourney(ctx, MONDAY, "4w"));
    expect(journey.cohortSize).toBe(4);
    expect(Object.fromEntries(journey.steps.map((step) => [step.key, step.count]))).toEqual({
      first_visit: 4,
      contacted: 2,
      reached: 1,
      came_back: 1,
      regular: 1,
      on_app: 1,
      member: 1,
    });
  });

  it("splits the cohort by age, sex, source and who invited them", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const inviter = await plainUser(t, "Sam");
    const ann = await visitorWith(t, operator, "Ann", ["2026-11-01"]);
    const ben = await visitorWith(t, operator, "Ben", ["2026-11-02"]);
    await visitorWith(t, operator, "Cal", ["2026-11-03"]);
    await t.run(async (ctx) => {
      await ctx.db.patch(ann, {
        ageBracket: "20-35",
        sex: "female",
        invitedByUserId: inviter,
        invitedByText: "Sam",
      });
      await ctx.db.patch(ben, { kind: "app", sex: "male", invitedByText: "A friend" });
    });

    const { mix } = await t.run((ctx) => visitorJourney(ctx, MONDAY, "4w"));
    const asMap = (rows: { key: string; count: number }[]) =>
      Object.fromEntries(rows.map((row) => [row.key, row.count]));
    expect(asMap(mix.age)).toEqual({ "0-12": 0, "13-19": 0, "20-35": 1, "36+": 0, none: 2 });
    expect(asMap(mix.sex)).toEqual({ male: 1, female: 1, none: 1 });
    expect(asMap(mix.source)).toEqual({ walk_in: 2, app: 1 });
    expect(asMap(mix.invited)).toEqual({ member: 1, name: 1, none: 1 });
  });
});

describe("getContactOutcomes (AC-13)", () => {
  it("counts personal contacts in the window by outcome and channel", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const ann = await visitorWith(t, operator, "Ann", ["2026-09-06"]);
    const ben = await visitorWith(t, operator, "Ben", ["2026-11-01"]);
    await outcomeOn(t, operator, ann, "2026-11-02", "call", "reached");
    await outcomeOn(t, operator, ann, "2026-11-03", "call", "no_answer");
    await outcomeOn(t, operator, ben, "2026-11-04", "whatsapp", "reached");
    await outcomeOn(t, operator, ben, "2026-11-05", "sms", "wrong_number");
    // Never counted: an in app message, and a call before the window.
    await outcomeOn(t, operator, ben, "2026-11-05", "in_app");
    await outcomeOn(t, operator, ann, "2026-10-01", "call", "reached");
    // A removed visitor's contacts still count.
    await t.run((ctx) => ctx.db.patch(ann, { listStatus: "removed" }));

    const outcomes = await t.run((ctx) => contactOutcomes(ctx, MONDAY, "4w"));
    const reached = outcomes.byOutcome.find((row) => row.outcome === "reached")!;
    expect(reached.byChannel).toEqual({ call: 1, whatsapp: 1, sms: 0, in_person: 0 });
    expect(outcomes.byOutcome.find((row) => row.outcome === "wrong_number")!.byChannel.sms).toBe(1);
    expect(outcomes.reachRate).toEqual([
      { channel: "call", reached: 1, total: 2 },
      { channel: "whatsapp", reached: 1, total: 1 },
      { channel: "sms", reached: 0, total: 1 },
      { channel: "in_person", reached: 0, total: 0 },
    ]);
  });

  it("returns null without access, and refuses a bad period", async () => {
    const t = testConvex();
    await operatorFor(t);
    const args = { today: MONDAY, period: "12w" };
    expect(await t.query(api.hospitality.getContactOutcomes, args)).toBeNull();
    expect(await t.query(api.hospitality.getVisitorJourney, args)).toBeNull();
    await expect(
      t.query(api.hospitality.getVisitorJourney, { today: MONDAY, period: "1y" })
    ).rejects.toThrow();
  });
});
