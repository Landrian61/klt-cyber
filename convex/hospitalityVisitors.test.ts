import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { HOSPITALITY_DEPARTMENT_NAME } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  deleteVisitFor,
  insertWalkIn,
  recordVisitFor,
  removeWalkInFor,
  setConsentFor,
  updateVisitorFor,
  visitorListPage,
  visitorRecord,
  withdrawConsentFor,
  type VisitorListFilters,
} from "./hospitality";
import {
  anonymiseVisitorsForDeletedUser,
  markVisitorMember,
  syncVisitorFromAccount,
} from "./lib/visitorAccount";

/**
 * Hospitality core, slices 2 to 5 (spec 0024): app visitor rows, visits,
 * the list filters and the visitor record.
 *
 * As in `hospitality.test.ts`, the mutations' bodies are driven directly
 * with a resolved operator, because this harness cannot stand up the Better
 * Auth identity `requireHospitalityOperator` reads. The authority half is
 * covered there.
 */

const now = Date.now();
const TODAY = "2026-11-13";

type T = ReturnType<typeof testConvex>;
type Role = "hod" | "delegate" | "system_admin" | "roster";

async function hospitalityId(t: T): Promise<Id<"departments">> {
  return await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("departments")
      .withIndex("by_name", (q) => q.eq("name", HOSPITALITY_DEPARTMENT_NAME))
      .first();
    return (
      existing?._id ??
      (await ctx.db.insert("departments", {
        name: HOSPITALITY_DEPARTMENT_NAME,
        order: 1,
      }))
    );
  });
}

/** A verified member acting as an operator with the given shell role. */
async function operatorFor(t: T, role: Role = "roster") {
  const departmentId = await hospitalityId(t);
  const user = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `op-${crypto.randomUUID().slice(0, 8)}@test.org`,
      firstName: "Op",
      lastName: "Erator",
      role: "member",
      profileCompleted: true,
    });
    return (await ctx.db.get(userId))!;
  });
  return { user, departmentId, role };
}
type Operator = Awaited<ReturnType<typeof operatorFor>>;

async function createAppUser(
  t: T,
  opts: { firstName?: string; lastName?: string; email?: string } = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: opts.email ?? `app-${crypto.randomUUID().slice(0, 8)}@test.org`,
      ...(opts.firstName ? { firstName: opts.firstName } : {}),
      ...(opts.lastName ? { lastName: opts.lastName } : {}),
      role: "visitor",
      profileCompleted: false,
    })
  );
}

async function appRow(t: T, userId: Id<"users">): Promise<Id<"visitors">> {
  const { visitorId } = await t.mutation(internal.hospitality.ensureAppVisitor, {
    userId,
  });
  return visitorId!;
}

async function visitorOf(t: T, visitorId: Id<"visitors">) {
  return await t.run(async (ctx) => (await ctx.db.get(visitorId))!);
}

async function followUpsOf(t: T, visitorId: Id<"visitors">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("followUps")
      .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
      .collect()
  );
}

async function walkIn(
  t: T,
  operator: Operator,
  extra: Partial<Parameters<typeof insertWalkIn>[2]> = {},
  today = TODAY
) {
  return await t.run(async (ctx) =>
    (
      await insertWalkIn(
        ctx,
        operator,
        { firstName: "Grace", visitDate: today, ...extra },
        today
      )
    ).visitorId
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

async function listIds(t: T, filters: VisitorListFilters = {}, today = TODAY) {
  return await t.run(async (ctx) => {
    const { page } = await visitorListPage(ctx, {
      paginationOpts: { numItems: 50, cursor: null },
      today,
      ...filters,
    });
    return page.map((row) => row._id);
  });
}

// ── Slice 2: app visitors (AC-8, AC-26, AC-31) ────────────────────────────

describe("app visitor rows (AC-8, AC-26, AC-31)", () => {
  it("creates one app row per sign up, idempotently, with the email fallback", async () => {
    const t = testConvex();
    const userId = await createAppUser(t, { email: "kato.john@test.org" });
    const first = await appRow(t, userId);
    const second = await appRow(t, userId);
    expect(second).toBe(first);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("visitors")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "app",
      firstName: "kato.john",
      visitCount: 0,
      listStatus: "active",
      searchName: "kato.john kato.john@test.org",
    });
    expect(rows[0]!.createdBy).toBeUndefined();
    // No visit yet, so no follow up.
    expect(await followUpsOf(t, first)).toHaveLength(0);
  });

  it("backfills visitor accounts only, and a second run adds nothing", async () => {
    const t = testConvex();
    const visitorUser = await createAppUser(t, { firstName: "Ruth" });
    await operatorFor(t); // a member account, never backfilled
    await t.mutation(internal.hospitalityMigration.backfillAppVisitors, {});
    await t.mutation(internal.hospitalityMigration.backfillAppVisitors, {});
    const all = await t.run(async (ctx) => ctx.db.query("visitors").collect());
    expect(all.map((row) => row.userId)).toEqual([visitorUser]);
    expect(
      await t.query(internal.hospitalityMigration.verifyAppVisitorBackfill, {})
    ).toEqual({ visitors: 1, missing: 0 });
  });

  it("refreshes names and accountPhone, and flips to member on verification", async () => {
    const t = testConvex();
    const userId = await createAppUser(t, { firstName: "Ruth" });
    const visitorId = await appRow(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { lastName: "Akello" });
      await ctx.db.insert("memberProfiles", {
        userId,
        firstName: "Ruth",
        lastName: "Akello",
        phone: "0701 234567",
        sex: "female",
        maritalStatus: "single",
        mentorshipStatus: "not_enrolled",
        profileStatus: "pending_verification",
        createdAt: now,
        updatedAt: now,
      });
      await syncVisitorFromAccount(ctx, userId);
    });
    const synced = await visitorOf(t, visitorId);
    expect(synced).toMatchObject({
      firstName: "Ruth",
      lastName: "Akello",
      accountPhone: "+256701234567",
      listStatus: "active",
    });
    // A join key only: it never becomes a contact phone.
    expect(synced.phone).toBeUndefined();

    await t.run(async (ctx) => markVisitorMember(ctx, userId));
    expect((await visitorOf(t, visitorId)).listStatus).toBe("member");
    expect(await listIds(t)).toEqual([]);
  });

  it("anonymises and unlinks the row on account deletion, keeping visits", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const userId = await createAppUser(t, { firstName: "Ruth" });
    const visitorId = await appRow(t, userId);
    await t.run((ctx) =>
      recordVisitFor(ctx, operator, { visitorId, visitDate: TODAY }, TODAY)
    );
    await t.run((ctx) => anonymiseVisitorsForDeletedUser(ctx, userId));
    const row = await visitorOf(t, visitorId);
    expect(row).toMatchObject({
      firstName: "Removed visitor",
      searchName: "",
      listStatus: "removed",
      visitCount: 1,
    });
    expect(row.userId).toBeUndefined();
    expect((await followUpsOf(t, visitorId))[0]).toMatchObject({
      status: "done",
      outcome: "closed",
    });
  });
});

// ── Slice 3: visits (AC-10, AC-12, AC-13) ─────────────────────────────────

describe("recording and deleting visits (AC-10, AC-12, AC-13)", () => {
  it("refuses a same date visit and a date outside the window", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await walkIn(t, operator);
    await expectCode(
      t.run((ctx) =>
        recordVisitFor(ctx, operator, { visitorId, visitDate: TODAY }, TODAY)
      ),
      "HOSPITALITY_VISIT_EXISTS"
    );
    await expectCode(
      t.run((ctx) =>
        recordVisitFor(ctx, operator, { visitorId, visitDate: "2026-11-14" }, TODAY)
      ),
      "HOSPITALITY_VISIT_DATE_INVALID"
    );
    await expectCode(
      t.run((ctx) =>
        recordVisitFor(ctx, operator, { visitorId, visitDate: "2026-10-13" }, TODAY)
      ),
      "HOSPITALITY_VISIT_DATE_INVALID"
    );
    const result = await t.run((ctx) =>
      recordVisitFor(ctx, operator, { visitorId, visitDate: "2026-11-01" }, TODAY)
    );
    expect(result.openedFollowUp).toBe(false);
    expect(await visitorOf(t, visitorId)).toMatchObject({
      visitCount: 2,
      firstVisitDate: "2026-11-01",
      lastVisitDate: TODAY,
    });
    expect(await followUpsOf(t, visitorId)).toHaveLength(1);
  });

  it("opens the follow up on an app visitor's first visit", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await appRow(t, await createAppUser(t));
    const result = await t.run((ctx) =>
      recordVisitFor(ctx, operator, { visitorId, visitDate: TODAY }, TODAY)
    );
    expect(result.openedFollowUp).toBe(true);
    expect((await followUpsOf(t, visitorId))[0]).toMatchObject({
      status: "open",
      firstVisitDate: TODAY,
    });
  });

  it("makes three October visits regular through November, not December", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const october = "2026-10-25";
    const visitorId = await walkIn(t, operator, { visitDate: "2026-10-04" }, october);
    for (const date of ["2026-10-11", "2026-10-18"]) {
      await t.run((ctx) =>
        recordVisitFor(ctx, operator, { visitorId, visitDate: date }, october)
      );
    }
    expect((await visitorOf(t, visitorId)).lastRegularMonth).toBe("2026-10");
    expect(await listIds(t, { regular: true }, "2026-11-20")).toEqual([visitorId]);
    expect(await listIds(t, { regular: true }, "2026-12-01")).toEqual([]);
    expect(await listIds(t, { regular: false }, "2026-12-01")).toEqual([visitorId]);
  });

  it("deletes an untouched follow up with the only visit, keeps one with a contact", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const untouched = await walkIn(t, operator);
    const contacted = await walkIn(t, operator, { firstName: "Peter" });
    await t.run(async (ctx) => {
      const followUp = await ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", contacted))
        .first();
      await ctx.db.insert("visitorContacts", {
        visitorId: contacted,
        followUpId: followUp!._id,
        channel: "call",
        outcome: "no_answer",
        byUserId: operator.user._id,
        at: now,
      });
    });

    for (const visitorId of [untouched, contacted]) {
      await t.run(async (ctx) => {
        const visit = await ctx.db
          .query("visitorVisits")
          .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", visitorId))
          .first();
        await deleteVisitFor(ctx, operator, { visitId: visit!._id });
      });
    }

    expect(await followUpsOf(t, untouched)).toHaveLength(0);
    expect(await followUpsOf(t, contacted)).toHaveLength(1);
    const reset = await visitorOf(t, untouched);
    expect(reset.visitCount).toBe(0);
    expect(reset.firstVisitDate).toBeUndefined();
    expect(reset.lastVisitDate).toBeUndefined();
  });

  it("refuses another roster member's visit, allows the HOD and refreshes the follow up date", async () => {
    const t = testConvex();
    const recorder = await operatorFor(t);
    const other = await operatorFor(t, "roster");
    const hod = await operatorFor(t, "hod");
    const visitorId = await walkIn(t, recorder);
    const { visitId } = await t.run((ctx) =>
      recordVisitFor(ctx, recorder, { visitorId, visitDate: "2026-11-01" }, TODAY)
    );
    // The earlier visit now leads the follow up.
    expect((await followUpsOf(t, visitorId))[0]!.firstVisitDate).toBe(TODAY);

    await expectCode(
      t.run((ctx) => deleteVisitFor(ctx, other, { visitId })),
      "HOSPITALITY_NOT_ALLOWED"
    );
    await t.run((ctx) => deleteVisitFor(ctx, hod, { visitId }));
    expect(await visitorOf(t, visitorId)).toMatchObject({
      visitCount: 1,
      firstVisitDate: TODAY,
    });
    expect((await followUpsOf(t, visitorId))[0]!.firstVisitDate).toBe(TODAY);
  });
});

// ── Slice 4: search and filters (AC-9, AC-11) ─────────────────────────────

describe("the Visitors list filters (AC-9, AC-11)", () => {
  it("combines kind, sex, bucket and follow up filters with AND", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator, { sex: "female" });
    const peter = await walkIn(t, operator, { firstName: "Peter", sex: "male" });
    await t.run((ctx) =>
      recordVisitFor(ctx, operator, { visitorId: peter, visitDate: "2026-11-01" }, TODAY)
    );
    const ruth = await appRow(t, await createAppUser(t, { firstName: "Ruth" }));

    expect(await listIds(t, { kind: "app" })).toEqual([ruth]);
    expect(await listIds(t, { sex: "female" })).toEqual([grace]);
    expect(await listIds(t, { sex: "none" })).toEqual([ruth]);
    expect(await listIds(t, { visitBucket: "2-4" })).toEqual([peter]);
    expect(await listIds(t, { followUp: "none" })).toEqual([ruth]);
    expect(await listIds(t, { kind: "walk_in", visitBucket: "1" })).toEqual([grace]);
    expect(await listIds(t, { firstFrom: "2026-11-02" })).toEqual([grace]);
    // Never visited app rows sort last.
    const all = await listIds(t);
    expect(all).toHaveLength(3);
    expect(all[all.length - 1]).toBe(ruth);
  });

  it("searches names through the search index", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const grace = await walkIn(t, operator, { lastName: "Namata" });
    await walkIn(t, operator, { firstName: "Peter" });
    expect(await listIds(t, { search: "Namata" })).toEqual([grace]);
  });
});

// ── Slice 5: the visitor record (AC-14, AC-23 to AC-25) ───────────────────

describe("the visitor record (AC-14, AC-23 to AC-25)", () => {
  it("edits a walk in's details, logging field names only", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await walkIn(t, operator, { notes: "Came with family" });
    const result = await t.run((ctx) =>
      updateVisitorFor(ctx, operator, {
        visitorId,
        lastName: "Namata",
        ageBracket: "36+",
        clear: ["notes"],
      })
    );
    expect([...result.changed].sort()).toEqual(["ageBracket", "lastName", "notes"]);
    const row = await visitorOf(t, visitorId);
    expect(row).toMatchObject({ lastName: "Namata", searchName: "grace namata" });
    expect(row.notes).toBeUndefined();
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_action", (q) => q.eq("action", "hospitality.visitor_updated"))
        .first()
    );
    expect(JSON.stringify(log?.metadata)).not.toContain("Namata");

    // An unchanged save is quiet.
    const again = await t.run((ctx) =>
      updateVisitorFor(ctx, operator, { visitorId, lastName: "Namata" })
    );
    expect(again.changed).toEqual([]);
  });

  it("refuses a phone in updateVisitor and a name edit on an app row", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await walkIn(t, operator);
    await expectCode(
      t.run((ctx) => updateVisitorFor(ctx, operator, { visitorId, phone: "0772123456" })),
      "HOSPITALITY_PHONE_VIA_CONSENT"
    );
    const app = await appRow(t, await createAppUser(t, { firstName: "Ruth" }));
    await expectCode(
      t.run((ctx) => updateVisitorFor(ctx, operator, { visitorId: app, firstName: "Rita" })),
      "HOSPITALITY_APP_NAME_LOCKED"
    );
    const ok = await t.run((ctx) =>
      updateVisitorFor(ctx, operator, { visitorId: app, sex: "female" })
    );
    expect(ok.changed).toEqual(["sex"]);
  });

  it("keeps the consent invariant through give, change, withdraw and give again", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await walkIn(t, operator);

    await expectCode(
      t.run((ctx) => setConsentFor(ctx, operator, { visitorId, phone: "0772123456" })),
      "HOSPITALITY_CONSENT_REQUIRED"
    );
    // First ever consent: no note needed.
    await t.run((ctx) =>
      setConsentFor(ctx, operator, { visitorId, phone: "0772123456", consent: true })
    );
    expect((await visitorOf(t, visitorId)).phone).toBe("+256772123456");

    // A new number while consent is live keeps the same consent.
    const givenAt = (await visitorOf(t, visitorId)).consent!.givenAt;
    await t.run((ctx) =>
      setConsentFor(ctx, operator, { visitorId, phone: "0701234567" })
    );
    expect(await visitorOf(t, visitorId)).toMatchObject({
      phone: "+256701234567",
      consent: { givenAt },
    });

    await t.run((ctx) => withdrawConsentFor(ctx, operator, { visitorId }));
    const withdrawn = await visitorOf(t, visitorId);
    expect(withdrawn.phone).toBeUndefined();
    expect(withdrawn.consent?.withdrawnBy).toBe(operator.user._id);
    await expectCode(
      t.run((ctx) => withdrawConsentFor(ctx, operator, { visitorId })),
      "HOSPITALITY_NO_LIVE_CONSENT"
    );

    // Given again: the tick AND a note.
    await expectCode(
      t.run((ctx) =>
        setConsentFor(ctx, operator, { visitorId, phone: "0701234567", consent: true })
      ),
      "HOSPITALITY_NOTE_REQUIRED"
    );
    await t.run((ctx) =>
      setConsentFor(ctx, operator, {
        visitorId,
        phone: "0701234567",
        consent: true,
        note: "Asked us to call again",
      })
    );
    const again = await visitorOf(t, visitorId);
    expect(again.phone).toBe("+256701234567");
    expect(again.consent?.withdrawnAt).toBeUndefined();

    const actions = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("activityLogs")
          .withIndex("by_target", (q) =>
            q.eq("targetType", "visitor").eq("targetId", visitorId)
          )
          .collect()
      ).map((log) => log.action)
    );
    expect(actions).toEqual([
      "hospitality.walk_in_added",
      "hospitality.consent_given",
      "hospitality.phone_changed",
      "hospitality.consent_withdrawn",
      "hospitality.consent_given_again",
    ]);
  });

  it("removes a walk in by anonymising it, keeping visit dates", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await walkIn(t, operator, {
      lastName: "Namata",
      phone: "0772123456",
      consent: true,
      notes: "Lives in Ntinda",
      invitedByText: "Sarah",
    });
    await expectCode(
      t.run((ctx) => removeWalkInFor(ctx, operator, { visitorId, confirm: "remove" })),
      "HOSPITALITY_REMOVE_CONFIRM"
    );
    await t.run((ctx) =>
      removeWalkInFor(ctx, operator, { visitorId, confirm: "REMOVE" })
    );
    const row = await visitorOf(t, visitorId);
    expect(row).toMatchObject({
      firstName: "Removed visitor",
      listStatus: "removed",
      visitCount: 1,
      firstVisitDate: TODAY,
    });
    for (const field of ["phone", "notes", "invitedByText", "consent", "lastName"] as const) {
      expect(row[field]).toBeUndefined();
    }
    expect((await followUpsOf(t, visitorId))[0]).toMatchObject({
      status: "done",
      outcome: "closed",
    });
    expect(await listIds(t)).toEqual([]);
    // The audit entry names nobody.
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_action", (q) => q.eq("action", "hospitality.visitor_removed"))
        .first()
    );
    expect(JSON.stringify(log)).not.toContain("Grace");
  });

  it("refuses to remove a row with an account", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const visitorId = await appRow(t, await createAppUser(t));
    await expectCode(
      t.run((ctx) => removeWalkInFor(ctx, operator, { visitorId, confirm: "REMOVE" })),
      "HOSPITALITY_REMOVE_ACCOUNT_ROW"
    );
  });

  it("shows a deleted recorder as a former member, and who may delete each visit", async () => {
    const t = testConvex();
    const recorder = await operatorFor(t);
    const viewer = await operatorFor(t, "roster");
    const hod = await operatorFor(t, "hod");
    const visitorId = await walkIn(t, recorder);
    await t.run((ctx) => ctx.db.patch(recorder.user._id, { deletedAt: now }));

    const record = await t.run((ctx) => visitorRecord(ctx, viewer, visitorId));
    expect(record?.visits[0]).toMatchObject({
      recordedByName: "a former member",
      canDelete: false,
    });
    expect(record).not.toHaveProperty("accountPhone");
    const asHod = await t.run((ctx) => visitorRecord(ctx, hod, visitorId));
    expect(asHod?.visits[0]?.canDelete).toBe(true);
  });
});
