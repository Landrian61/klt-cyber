import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { HOSPITALITY_DEPARTMENT_NAME } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assignFollowUpFor,
  closeFollowUpFor,
  followUpListPage,
  insertWalkIn,
  recordContactFor,
  recordVisitFor,
  sendInAppMessageFor,
} from "./hospitality";

/**
 * Hospitality core, slices 6 and 7 (spec 0024): follow ups, contacts,
 * assignment with N36, and the in app message (N41). AC-15 to AC-21.
 *
 * Same split as the other Hospitality suites: mutation bodies are driven with
 * a resolved operator, because the harness cannot stand up Better Auth.
 */

const now = Date.now();
const TODAY = "2026-11-13";

type T = ReturnType<typeof testConvex>;
type Role = "hod" | "delegate" | "system_admin" | "roster";

async function departments(t: T) {
  return await t.run(async (ctx) => {
    const find = async (name: string, order: number) =>
      (
        await ctx.db
          .query("departments")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first()
      )?._id ?? (await ctx.db.insert("departments", { name, order }));
    return {
      hospitality: await find(HOSPITALITY_DEPARTMENT_NAME, 1),
      finance: await find("Finance", 2),
    };
  });
}

/**
 * A real Hospitality operator: the role rows that make
 * `resolveDepartmentShellRole` say so, so assignment validation sees them.
 */
async function operatorFor(t: T, role: Role = "roster") {
  const { hospitality } = await departments(t);
  const user = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `op-${crypto.randomUUID().slice(0, 8)}@test.org`,
      firstName: "Op",
      lastName: role,
      role: "member",
      profileCompleted: true,
    });
    await ctx.db.insert("memberProfiles", {
      userId,
      firstName: "Op",
      lastName: role,
      sex: "male",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus: "verified",
      createdAt: now,
      updatedAt: now,
    });
    if (role === "roster") {
      await ctx.db.insert("departmentMemberships", {
        userId,
        departmentId: hospitality,
        addedBy: userId,
        status: "active",
      });
    } else {
      await ctx.db.insert("roleAssignments", {
        userId,
        roleType: role === "delegate" ? "department_admin" : role,
        assignedBy: userId,
        status: "active",
        ...(role === "system_admin" ? {} : { departmentId: hospitality }),
      });
    }
    return (await ctx.db.get(userId))!;
  });
  return { user, departmentId: hospitality, role };
}
type Operator = Awaited<ReturnType<typeof operatorFor>>;

async function walkIn(
  t: T,
  operator: Operator,
  extra: Partial<Parameters<typeof insertWalkIn>[2]> = {}
) {
  return await t.run(async (ctx) => {
    const { visitorId } = await insertWalkIn(
      ctx,
      operator,
      { firstName: "Grace", visitDate: TODAY, phone: "0772123456", consent: true, ...extra },
      TODAY
    );
    const followUp = await ctx.db
      .query("followUps")
      .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
      .first();
    return { visitorId, followUpId: followUp?._id as Id<"followUps"> };
  });
}

async function appVisitor(t: T, operator: Operator, firstName = "Ruth") {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `app-${crypto.randomUUID().slice(0, 8)}@test.org`,
      firstName,
      role: "visitor",
      profileCompleted: false,
    })
  );
  const { visitorId } = await t.mutation(internal.hospitality.ensureAppVisitor, { userId });
  await t.run((ctx) =>
    recordVisitFor(ctx, operator, { visitorId: visitorId!, visitDate: TODAY }, TODAY)
  );
  return { userId, visitorId: visitorId! };
}

const get = <Table extends "visitors" | "followUps">(t: T, id: Id<Table>) =>
  t.run(async (ctx) => (await ctx.db.get(id))!);

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

// ── AC-18: recording a contact ────────────────────────────────────────────

describe("recordContact outcomes (AC-18, AC-22, AC-23)", () => {
  it("closes on reached, counts no answer, refuses a closed follow up", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const { visitorId, followUpId } = await walkIn(t, operator);

    await t.run((ctx) =>
      recordContactFor(ctx, operator, { visitorId, followUpId, channel: "call", outcome: "no_answer" })
    );
    expect(await get(t, followUpId)).toMatchObject({ status: "open", attemptCount: 1 });

    const result = await t.run((ctx) =>
      recordContactFor(ctx, operator, {
        visitorId,
        followUpId,
        channel: "whatsapp",
        outcome: "reached",
        note: "Coming on Sunday",
      })
    );
    expect(result.followUpStatus).toBe("done");
    expect(await get(t, followUpId)).toMatchObject({
      status: "done",
      outcome: "reached",
      closedBy: operator.user._id,
    });

    await expectCode(
      t.run((ctx) =>
        recordContactFor(ctx, operator, { visitorId, followUpId, channel: "call", outcome: "reached" })
      ),
      "HOSPITALITY_FOLLOW_UP_CLOSED"
    );
    // Without a follow up, a later contact is still logged.
    const later = await t.run((ctx) =>
      recordContactFor(ctx, operator, { visitorId, channel: "sms", outcome: "reached" })
    );
    expect(later.followUpStatus).toBeNull();
  });

  it("withdraws consent on do not contact, clears consent on a wrong number", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const asked = await walkIn(t, operator);
    const wrong = await walkIn(t, operator, { firstName: "Peter", phone: "0701234567" });

    await t.run((ctx) =>
      recordContactFor(ctx, operator, {
        visitorId: asked.visitorId,
        followUpId: asked.followUpId,
        channel: "call",
        outcome: "do_not_contact",
      })
    );
    const askedRow = await get(t, asked.visitorId);
    expect(askedRow.phone).toBeUndefined();
    expect(askedRow.consent?.withdrawnBy).toBe(operator.user._id);
    expect(await get(t, asked.followUpId)).toMatchObject({ outcome: "do_not_contact" });

    await t.run((ctx) =>
      recordContactFor(ctx, operator, {
        visitorId: wrong.visitorId,
        channel: "sms",
        outcome: "wrong_number",
      })
    );
    const wrongRow = await get(t, wrong.visitorId);
    expect(wrongRow.phone).toBeUndefined();
    expect(wrongRow.consent).toBeUndefined();
    // No follow up named, none inferred: it stays open.
    expect(await get(t, wrong.followUpId)).toMatchObject({ status: "open" });
  });

  it("needs a phone for call, WhatsApp and SMS, but not in person", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const { visitorId, followUpId } = await walkIn(t, operator, { phone: undefined, consent: undefined });
    await expectCode(
      t.run((ctx) =>
        recordContactFor(ctx, operator, { visitorId, followUpId, channel: "call", outcome: "reached" })
      ),
      "HOSPITALITY_CONTACT_NEEDS_PHONE"
    );
    const ok = await t.run((ctx) =>
      recordContactFor(ctx, operator, { visitorId, followUpId, channel: "in_person", outcome: "reached" })
    );
    expect(ok.followUpStatus).toBe("done");
  });
});

// ── AC-19: closing by hand ────────────────────────────────────────────────

describe("closeFollowUp (AC-19)", () => {
  it("needs a note and closes as closed", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const { followUpId } = await walkIn(t, operator);
    await expectCode(
      t.run((ctx) => closeFollowUpFor(ctx, operator, { followUpId, note: "  " })),
      "HOSPITALITY_NOTE_REQUIRED"
    );
    await t.run((ctx) => closeFollowUpFor(ctx, operator, { followUpId, note: "Moved away" }));
    expect(await get(t, followUpId)).toMatchObject({
      status: "done",
      outcome: "closed",
      closeNote: "Moved away",
    });
  });
});

// ── AC-20: assignment and N36 ─────────────────────────────────────────────

describe("assignFollowUp (AC-20, N36)", () => {
  it("assigns to a roster member and schedules N36 to them only", async () => {
    const t = testConvex();
    const hod = await operatorFor(t, "hod");
    const roster = await operatorFor(t, "roster");
    const { followUpId } = await walkIn(t, hod);

    const result = await t.run((ctx) =>
      assignFollowUpFor(ctx, hod, { followUpId, assigneeUserId: roster.user._id })
    );
    expect(result.notified).toBe(true);
    expect(await get(t, followUpId)).toMatchObject({
      assignedTo: roster.user._id,
      assignedBy: hod.user._id,
    });
    const dispatches = await scheduledDispatches(t);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({ kind: "N36" });
    expect(dispatches[0]!.audience.userIds).toEqual([roster.user._id]);
  });

  it("sends nothing when you take it yourself", async () => {
    const t = testConvex();
    const roster = await operatorFor(t);
    const { followUpId } = await walkIn(t, roster);
    const result = await t.run((ctx) =>
      assignFollowUpFor(ctx, roster, { followUpId, assigneeUserId: roster.user._id })
    );
    expect(result.notified).toBe(false);
    expect(await scheduledDispatches(t)).toHaveLength(0);
  });

  it("refuses a non operator, a deleted account and a closed follow up", async () => {
    const t = testConvex();
    const hod = await operatorFor(t, "hod");
    const { finance } = await departments(t);
    const financeHod = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authId: `test:${crypto.randomUUID()}`,
        email: "fin@test.org",
        role: "member",
        profileCompleted: true,
      });
      await ctx.db.insert("roleAssignments", {
        userId,
        roleType: "hod",
        assignedBy: userId,
        status: "active",
        departmentId: finance,
      });
      return userId;
    });
    const gone = await operatorFor(t, "roster");
    await t.run((ctx) => ctx.db.patch(gone.user._id, { deletedAt: now }));
    const { followUpId } = await walkIn(t, hod);

    for (const assigneeUserId of [financeHod, gone.user._id]) {
      await expectCode(
        t.run((ctx) => assignFollowUpFor(ctx, hod, { followUpId, assigneeUserId })),
        "HOSPITALITY_ASSIGNEE_INVALID"
      );
    }
    await t.run((ctx) => closeFollowUpFor(ctx, hod, { followUpId, note: "Done" }));
    await expectCode(
      t.run((ctx) => assignFollowUpFor(ctx, hod, { followUpId, assigneeUserId: hod.user._id })),
      "HOSPITALITY_FOLLOW_UP_CLOSED"
    );
  });
});

// ── AC-16: the list ───────────────────────────────────────────────────────

describe("listFollowUps (AC-16, AC-20)", () => {
  it("orders open longest waiting first, filters Mine, flags a former operator", async () => {
    const t = testConvex();
    const hod = await operatorFor(t, "hod");
    const roster = await operatorFor(t, "roster");
    const older = await t.run(async (ctx) => {
      const { visitorId } = await insertWalkIn(
        ctx,
        hod,
        { firstName: "Older", visitDate: "2026-11-01" },
        TODAY
      );
      return visitorId;
    });
    const newer = await walkIn(t, hod, { firstName: "Newer" });
    await t.run((ctx) =>
      assignFollowUpFor(ctx, hod, { followUpId: newer.followUpId, assigneeUserId: roster.user._id })
    );

    const page = (operator: Operator, tab: "open" | "done", mine?: boolean) =>
      t.run(async (ctx) =>
        (
          await followUpListPage(ctx, operator, {
            paginationOpts: { numItems: 20, cursor: null },
            tab,
            mine,
          })
        ).page
      );

    const open = await page(hod, "open");
    expect(open.map((row) => row.visitor._id)).toEqual([older, newer.visitorId]);
    expect((await page(roster, "open", true)).map((row) => row._id)).toEqual([newer.followUpId]);

    // The assignee leaves the roster: still assigned, shown as former.
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) => q.eq("userId", roster.user._id).eq("status", "active"))
        .first();
      await ctx.db.patch(membership!._id, { status: "removed" });
    });
    const after = await page(hod, "open");
    expect(after.find((row) => row._id === newer.followUpId)).toMatchObject({
      assignedTo: roster.user._id,
      assigneeFormer: true,
    });

    await t.run((ctx) => closeFollowUpFor(ctx, hod, { followUpId: newer.followUpId, note: "Done" }));
    expect((await page(hod, "done")).map((row) => row._id)).toEqual([newer.followUpId]);
  });
});

// ── AC-21: in app message ─────────────────────────────────────────────────

describe("sendInAppMessage (AC-21, N41)", () => {
  it("writes one in app contact per recipient and schedules one N41", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const ruth = await appVisitor(t, operator, "Ruth");
    const kato = await appVisitor(t, operator, "Kato");

    const result = await t.run((ctx) =>
      sendInAppMessageFor(ctx, operator, {
        visitorIds: [ruth.visitorId, kato.visitorId, ruth.visitorId],
        body: "See you on Sunday!",
      })
    );
    expect(result.sent).toBe(2);
    const contacts = await t.run(async (ctx) =>
      (await ctx.db.query("visitorContacts").collect()).filter((row) => row.channel === "in_app")
    );
    expect(contacts).toHaveLength(2);
    expect(contacts[0]!.outcome).toBeUndefined();
    const dispatches = await scheduledDispatches(t);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({ kind: "N41" });
    expect([...dispatches[0]!.audience.userIds].sort()).toEqual([ruth.userId, kato.userId].sort());

    // Attempt counts are untouched.
    const followUp = await t.run(async (ctx) =>
      ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", ruth.visitorId))
        .first()
    );
    expect(followUp?.attemptCount).toBe(0);
  });

  it("refuses the whole send when one recipient has no account", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const ruth = await appVisitor(t, operator);
    const { visitorId: walkInId } = await walkIn(t, operator);
    await expectCode(
      t.run((ctx) =>
        sendInAppMessageFor(ctx, operator, { visitorIds: [ruth.visitorId, walkInId], body: "Hello" })
      ),
      "HOSPITALITY_RECIPIENT_INVALID"
    );
    const contacts = await t.run(async (ctx) =>
      (await ctx.db.query("visitorContacts").collect()).filter((row) => row.channel === "in_app")
    );
    expect(contacts).toHaveLength(0);
    expect(await scheduledDispatches(t)).toHaveLength(0);
  });

  it("refuses an empty send, an empty body and an over long one", async () => {
    const t = testConvex();
    const operator = await operatorFor(t);
    const ruth = await appVisitor(t, operator);
    await expectCode(
      t.run((ctx) => sendInAppMessageFor(ctx, operator, { visitorIds: [], body: "Hi" })),
      "HOSPITALITY_RECIPIENT_COUNT"
    );
    await expectCode(
      t.run((ctx) => sendInAppMessageFor(ctx, operator, { visitorIds: [ruth.visitorId], body: " " })),
      "HOSPITALITY_MESSAGE_REQUIRED"
    );
    await expectCode(
      t.run((ctx) =>
        sendInAppMessageFor(ctx, operator, { visitorIds: [ruth.visitorId], body: "x".repeat(501) })
      ),
      "HOSPITALITY_MESSAGE_TOO_LONG"
    );
  });
});
