import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { HOSPITALITY_DEPARTMENT_NAME, kampalaDayStartMs } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import { api } from "./_generated/api";
import {
  hospitalityReport,
  insertWalkIn,
  recordVisitFor,
} from "./hospitality";

/**
 * Hospitality core, slice 12 (spec 0024): the Reports numbers, AC-36. The
 * slice 11 Dashboard cards (AC-35) were replaced by spec 0025, whose tests
 * live in `hospitalityDashboard.test.ts`.
 *
 * Visits are written with `today` set to the visit's own date, so the AC-5
 * backdate window never gets in the way of building history.
 */

// A Friday. Its Kampala week starts Sunday 8 November.
const TODAY = "2026-11-13";

type T = ReturnType<typeof testConvex>;

async function operatorFor(t: T) {
  return await t.run(async (ctx) => {
    const departmentId =
      (
        await ctx.db
          .query("departments")
          .withIndex("by_name", (q) => q.eq("name", HOSPITALITY_DEPARTMENT_NAME))
          .first()
      )?._id ??
      (await ctx.db.insert("departments", { name: HOSPITALITY_DEPARTMENT_NAME, order: 1 }));
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
    const followUp = await ctx.db
      .query("followUps")
      .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
      .first();
    return { visitorId, followUpId: followUp!._id };
  });
}

/** Three visitors with a known shape around TODAY. */
async function seedVisitors(t: T, operator: Operator) {
  // New this week: first ever visit on Tuesday 10 November.
  const newcomer = await visitorWith(t, operator, "Ann", ["2026-11-10"]);
  // Returning this month: first visit in October, back on 2 November.
  const returner = await visitorWith(t, operator, "Ben", ["2026-10-20", "2026-11-02"]);
  // Regular through November: three visits in October, none since.
  const regular = await visitorWith(t, operator, "Cal", [
    "2026-10-04",
    "2026-10-11",
    "2026-10-18",
  ]);
  return { newcomer, returner, regular };
}

describe("hospitalityReport (AC-36)", () => {
  it("bins by week, splits first timers from returning, and counts regulars from the range", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    await seedVisitors(t, operator);

    const report = await t.run((ctx) => hospitalityReport(ctx, "2026-10-01", TODAY));
    expect(report.weekly).toBe(true);
    expect(report.visitorsInRange).toBe(3);
    expect(report.regulars).toBe(1);

    const bin = (day: string) =>
      report.bins.find((row) => row.start <= day && row.end >= day)!;
    // Week of 1 November: Ben returns.
    expect(bin("2026-11-02")).toMatchObject({ visitors: 1, firstTimers: 0, returning: 1 });
    // Week of 8 November: Ann's first visit.
    expect(bin("2026-11-10")).toMatchObject({ visitors: 1, firstTimers: 1, returning: 0 });
    // The first bin is clipped to the range start.
    expect(report.bins[0]!.start).toBe("2026-10-01");

    // A range that starts after Cal's October visits no longer sees a regular.
    const later = await t.run((ctx) => hospitalityReport(ctx, "2026-11-01", TODAY));
    expect(later.regulars).toBe(0);
  });

  it("bins by month over 92 days", async () => {
    const t = testConvex();
    await operatorFor(t);
    const report = await t.run((ctx) => hospitalityReport(ctx, "2026-01-15", TODAY));
    expect(report.weekly).toBe(false);
    expect(report.bins[0]).toMatchObject({ key: "2026-01-01", start: "2026-01-15" });
  });

  it("counts the follow up cohort opened in range and contacts by channel", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const { newcomer, returner, regular } = await seedVisitors(t, operator);
    const inRange = kampalaDayStartMs("2026-11-05");
    const before = kampalaDayStartMs("2026-09-01");
    await t.run(async (ctx) => {
      await ctx.db.patch(newcomer.followUpId, { openedAt: inRange });
      await ctx.db.patch(returner.followUpId, {
        openedAt: inRange,
        status: "done",
        outcome: "reached",
        closedAt: inRange + 1000,
      });
      // Opened before the range: outside the cohort even though it is done.
      await ctx.db.patch(regular.followUpId, {
        openedAt: before,
        status: "done",
        outcome: "reached",
        closedAt: inRange,
      });
      for (const channel of ["call", "call", "in_app"] as const) {
        await ctx.db.insert("visitorContacts", {
          visitorId: newcomer.visitorId,
          channel,
          byUserId: operator.user._id,
          at: inRange,
        });
      }
      await ctx.db.insert("visitorContacts", {
        visitorId: newcomer.visitorId,
        channel: "sms",
        byUserId: operator.user._id,
        at: before,
      });
    });

    const report = await t.run((ctx) => hospitalityReport(ctx, "2026-11-01", TODAY));
    expect(report.followUps).toEqual({ opened: 2, done: 1, percentDone: 50 });
    expect(report.contacts).toEqual({ call: 2, whatsapp: 0, sms: 0, in_person: 0, in_app: 1 });
  });

  it("refuses a bad range and returns null to a caller without access (AC-3)", async () => {
    const t = testConvex();
    await operatorFor(t);
    let caught: unknown;
    try {
      await t.query(api.hospitality.getReport, { from: "2024-01-01", to: TODAY });
    } catch (error) {
      caught = error;
    }
    expect((caught as ConvexError<{ code: string }>).data.code).toBe(
      "HOSPITALITY_RANGE_INVALID"
    );
    expect(await t.query(api.hospitality.getReport, { from: "2026-11-01", to: TODAY })).toBeNull();
  });
});
