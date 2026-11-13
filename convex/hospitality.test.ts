import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { HOSPITALITY_DEPARTMENT_NAME } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import {
  DEPARTMENT_CAPABILITIES,
  departmentCapabilities,
  resolveDepartmentShellRole,
} from "./lib/authz";
import { insertWalkIn } from "./hospitality";

/**
 * Hospitality core, slice 1 (spec 0024): the authority matrix (AC-1, AC-3)
 * and the walk in rules (AC-4 to AC-6, AC-15, AC-22).
 *
 * As in `library.test.ts`, the mutations resolve their caller through the
 * Better Auth component, which this harness cannot stand up. So the
 * authority half is tested through `resolveDepartmentShellRole` and
 * `departmentCapabilities`, the exact pair `requireDepartmentCapability`
 * uses, and the write half through `insertWalkIn`, the body `addWalkIn`
 * runs once the check has passed.
 */

const now = Date.now();
const TODAY = "2026-11-13";

type T = ReturnType<typeof testConvex>;

async function seedDepartments(t: T) {
  return await t.run(async (ctx) => {
    const names = [HOSPITALITY_DEPARTMENT_NAME, "Finance", "Administration"];
    const ids: Record<string, Id<"departments">> = {};
    for (let i = 0; i < names.length; i++) {
      ids[names[i]] = await ctx.db.insert("departments", {
        name: names[i],
        order: i + 1,
      });
    }
    return ids;
  });
}

async function createUser(
  t: T,
  opts: { profileStatus?: "verified" | "pending_verification" | null } = {}
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `test-${crypto.randomUUID()}@test.org`,
      role: "member",
      profileCompleted: true,
    });
    if (opts.profileStatus !== null) {
      await ctx.db.insert("memberProfiles", {
        userId,
        firstName: "Test",
        lastName: "User",
        sex: "male",
        maritalStatus: "single",
        mentorshipStatus: "not_enrolled",
        profileStatus: opts.profileStatus ?? "verified",
        createdAt: now,
        updatedAt: now,
      });
    }
    return userId;
  });
}

async function addMembership(
  t: T,
  userId: Id<"users">,
  departmentId: Id<"departments">
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      addedBy: userId,
      status: "active",
    });
  });
}

async function grantRole(
  t: T,
  userId: Id<"users">,
  roleType: string,
  departmentId?: Id<"departments">
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("roleAssignments", {
      userId,
      roleType,
      assignedBy: userId,
      status: "active",
      ...(departmentId ? { departmentId } : {}),
    });
  });
}

async function holdsHospitality(
  t: T,
  userId: Id<"users">,
  departmentId: Id<"departments">
) {
  return await t.run(async (ctx) => {
    const role = await resolveDepartmentShellRole(ctx, userId, departmentId);
    if (!role) return false;
    const department = await ctx.db.get(departmentId);
    return departmentCapabilities(role, department?.name).manageHospitality;
  });
}

function codeOf(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    return (error.data as { code?: string }).code;
  }
  return undefined;
}

// ── AC-1, AC-3: who holds manageHospitality ───────────────────────────────

describe("the manageHospitality authority matrix (AC-1, AC-3)", () => {
  it("is granted inside Hospitality to every role, and nowhere else", () => {
    for (const role of ["hod", "delegate", "system_admin", "roster"] as const) {
      expect(
        departmentCapabilities(role, HOSPITALITY_DEPARTMENT_NAME)
          .manageHospitality
      ).toBe(true);
      expect(departmentCapabilities(role, "Finance").manageHospitality).toBe(
        false
      );
      expect(departmentCapabilities(role).manageHospitality).toBe(false);
    }
  });

  it("gives a Hospitality roster member manageHospitality and nothing else", () => {
    const can = departmentCapabilities("roster", HOSPITALITY_DEPARTMENT_NAME);
    for (const capability of DEPARTMENT_CAPABILITIES) {
      expect(can[capability]).toBe(capability === "manageHospitality");
    }
  });

  it("reaches the HOD, a delegate, a System Admin and a verified roster member", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const hospitality = depts[HOSPITALITY_DEPARTMENT_NAME];

    const hod = await createUser(t);
    await grantRole(t, hod, "hod", hospitality);
    const delegate = await createUser(t);
    await grantRole(t, delegate, "department_admin", hospitality);
    const admin = await createUser(t);
    await grantRole(t, admin, "system_admin");
    const roster = await createUser(t);
    await addMembership(t, roster, hospitality);

    for (const userId of [hod, delegate, admin, roster]) {
      expect(await holdsHospitality(t, userId, hospitality)).toBe(true);
    }
  });

  it("refuses an unverified roster member, another HOD and Administration authority", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const hospitality = depts[HOSPITALITY_DEPARTMENT_NAME];

    const unverified = await createUser(t, {
      profileStatus: "pending_verification",
    });
    await addMembership(t, unverified, hospitality);
    const financeHod = await createUser(t);
    await grantRole(t, financeHod, "hod", depts.Finance);
    const adminAuthority = await createUser(t);
    await grantRole(t, adminAuthority, "hod", depts.Administration);
    const nobody = await createUser(t);

    for (const userId of [unverified, financeHod, adminAuthority, nobody]) {
      expect(await holdsHospitality(t, userId, hospitality)).toBe(false);
    }
  });

  it("gives a System Admin no manageHospitality in another department", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const admin = await createUser(t);
    await grantRole(t, admin, "system_admin");
    expect(await holdsHospitality(t, admin, depts.Finance)).toBe(false);
  });
});

// ── AC-4 to AC-6, AC-15, AC-22: adding a walk in ──────────────────────────

describe("insertWalkIn (AC-4 to AC-6, AC-15, AC-22)", () => {
  async function setup() {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const operatorId = await createUser(t);
    const user = await t.run(async (ctx) => (await ctx.db.get(operatorId))!);
    return {
      t,
      operator: { user, departmentId: depts[HOSPITALITY_DEPARTMENT_NAME] },
    };
  }

  it("writes the visitor, the first visit, an open follow up and a log entry", async () => {
    const { t, operator } = await setup();
    const result = await t.run(async (ctx) => {
      const { visitorId } = await insertWalkIn(
        ctx,
        operator,
        {
          firstName: "  Grace ",
          lastName: "Namata",
          phone: "0772 123456",
          consent: true,
          sex: "female",
          ageBracket: "20-35",
          visitDate: "2026-11-08",
        },
        TODAY
      );
      const visitor = await ctx.db.get(visitorId);
      const visits = await ctx.db
        .query("visitorVisits")
        .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", visitorId))
        .collect();
      const followUps = await ctx.db
        .query("followUps")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
        .collect();
      const logs = await ctx.db
        .query("activityLogs")
        .withIndex("by_department", (q) =>
          q.eq("departmentId", operator.departmentId)
        )
        .collect();
      return { visitor, visits, followUps, logs };
    });

    expect(result.visitor).toMatchObject({
      kind: "walk_in",
      firstName: "Grace",
      lastName: "Namata",
      searchName: "grace namata",
      phone: "+256772123456",
      visitCount: 1,
      firstVisitDate: "2026-11-08",
      lastVisitDate: "2026-11-08",
      listStatus: "active",
      createdBy: operator.user._id,
    });
    expect(result.visitor?.consent?.givenBy).toBe(operator.user._id);
    expect(result.visitor?.lastRegularMonth).toBeUndefined();
    expect(result.visits).toHaveLength(1);
    expect(result.followUps).toHaveLength(1);
    expect(result.followUps[0]).toMatchObject({
      status: "open",
      firstVisitDate: "2026-11-08",
      attemptCount: 0,
    });
    expect(result.followUps[0]!.assignedTo).toBeUndefined();
    expect(result.logs.map((log) => log.action)).toEqual([
      "hospitality.walk_in_added",
    ]);
    // No personal data in the audit entry.
    expect(JSON.stringify(result.logs[0]!.metadata)).not.toContain("Grace");
    expect(JSON.stringify(result.logs[0]!.metadata)).not.toContain("772");
  });

  it("refuses a phone sent without consent, on the server (AC-6)", async () => {
    const { t, operator } = await setup();
    const error = await t
      .run((ctx) =>
        insertWalkIn(
          ctx,
          operator,
          { firstName: "Grace", phone: "0772123456", visitDate: TODAY },
          TODAY
        )
      )
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe("HOSPITALITY_CONSENT_REQUIRED");
    const count = await t.run(
      async (ctx) => (await ctx.db.query("visitors").collect()).length
    );
    expect(count).toBe(0);
  });

  it("refuses an unparseable phone", async () => {
    const { t, operator } = await setup();
    const error = await t
      .run((ctx) =>
        insertWalkIn(
          ctx,
          operator,
          { firstName: "Grace", phone: "12", consent: true, visitDate: TODAY },
          TODAY
        )
      )
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe("HOSPITALITY_PHONE_INVALID");
  });

  it("stores no phone and no consent when none is given (AC-22)", async () => {
    const { t, operator } = await setup();
    const visitor = await t.run(async (ctx) => {
      const { visitorId } = await insertWalkIn(
        ctx,
        operator,
        { firstName: "Grace", consent: true, visitDate: TODAY },
        TODAY
      );
      return await ctx.db.get(visitorId);
    });
    expect(visitor?.phone).toBeUndefined();
    expect(visitor?.consent).toBeUndefined();
  });

  it("refuses a visit tomorrow or 31 days back, accepts 30 (AC-5)", async () => {
    const { t, operator } = await setup();
    for (const visitDate of ["2026-11-14", "2026-10-13", "not-a-date"]) {
      const error = await t
        .run((ctx) =>
          insertWalkIn(ctx, operator, { firstName: "Grace", visitDate }, TODAY)
        )
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe("HOSPITALITY_VISIT_DATE_INVALID");
    }
    await t.run((ctx) =>
      insertWalkIn(
        ctx,
        operator,
        { firstName: "Grace", visitDate: "2026-10-14" },
        TODAY
      )
    );
  });

  it("refuses a blank first name and over long text (AC-4)", async () => {
    const { t, operator } = await setup();
    const blank = await t
      .run((ctx) =>
        insertWalkIn(ctx, operator, { firstName: "   ", visitDate: TODAY }, TODAY)
      )
      .catch((caught: unknown) => caught);
    expect(codeOf(blank)).toBe("HOSPITALITY_FIRST_NAME_REQUIRED");

    const longNotes = await t
      .run((ctx) =>
        insertWalkIn(
          ctx,
          operator,
          { firstName: "Grace", notes: "x".repeat(1001), visitDate: TODAY },
          TODAY
        )
      )
      .catch((caught: unknown) => caught);
    expect(codeOf(longNotes)).toBe("HOSPITALITY_NOTES_TOO_LONG");
  });

  it("accepts a verified inviter and refuses an unverified one", async () => {
    const { t, operator } = await setup();
    const verified = await createUser(t);
    const pending = await createUser(t, {
      profileStatus: "pending_verification",
    });
    await t.run((ctx) =>
      insertWalkIn(
        ctx,
        operator,
        { firstName: "Grace", invitedByUserId: verified, visitDate: TODAY },
        TODAY
      )
    );
    const error = await t
      .run((ctx) =>
        insertWalkIn(
          ctx,
          operator,
          { firstName: "Grace", invitedByUserId: pending, visitDate: TODAY },
          TODAY
        )
      )
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe("HOSPITALITY_INVITER_INVALID");
  });
});
