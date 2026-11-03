import { describe, expect, it } from "vitest";
import {
  LIBRARY_DEPARTMENT_NAME,
  LIBRARY_LOW_STOCK_THRESHOLD,
  ROSTER_PORTAL_DEPARTMENTS,
} from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import {
  applyMovement,
  crossesPhysicalDigitalLine,
  lowStockTransition,
} from "./library";
import {
  DEPARTMENT_CAPABILITIES,
  departmentCapabilities,
  resolveDepartmentShellRole,
} from "./lib/authz";

/**
 * The Library's four load-bearing rules (spec 0015, AC-32).
 *
 * Each is tested against the exact function the mutation calls, not against a
 * restatement of it. That matters here more than usual: `recordStockMovement`,
 * `updateItem` and the rest resolve the caller through the Better Auth
 * component, which this harness cannot stand up (see
 * `convex/departmentShell.test.ts`'s header), so they cannot be driven end to
 * end. The rules were therefore written as pure, exported functions that the
 * mutations call — `applyMovement`, `crossesPhysicalDigitalLine` and
 * `lowStockTransition` — rather than as expressions inlined in handlers no
 * test can reach. The authorization half is reachable, through
 * `resolveDepartmentShellRole` and `departmentCapabilities` directly.
 *
 * What is NOT covered here, deliberately: that the mutations actually call
 * these functions in the right places, and that the movement and the item are
 * written in one transaction. Both are behaviour, not logic, and belong to
 * `/check verify` driving the real app.
 */

const now = Date.now();

async function seedDepartments(t: ReturnType<typeof testConvex>) {
  return await t.run(async (ctx) => {
    const names = [LIBRARY_DEPARTMENT_NAME, "Media", "Finance"];
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
  t: ReturnType<typeof testConvex>,
  opts: { profileStatus?: "verified" | "pending_verification" } = {}
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `test-${crypto.randomUUID()}@test.org`,
      role: "member",
      profileCompleted: true,
    });
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
    return userId;
  });
}

async function addMembership(
  t: ReturnType<typeof testConvex>,
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
  t: ReturnType<typeof testConvex>,
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

// ── AC-32: the authority matrix ───────────────────────────────────────────

describe("the Library authority matrix (AC-1, AC-2, AC-32)", () => {
  it("gives a verified Library roster member manageLibrary and nothing else", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts[LIBRARY_DEPARTMENT_NAME]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts[LIBRARY_DEPARTMENT_NAME])
    );
    expect(role).toBe("roster");

    const can = departmentCapabilities("roster", LIBRARY_DEPARTMENT_NAME);
    expect(can.manageLibrary).toBe(true);
    for (const capability of DEPARTMENT_CAPABILITIES) {
      if (capability === "manageLibrary") continue;
      expect(can[capability]).toBe(false);
    }
  });

  it("gives a roster member of a department outside the roster-portal list no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    expect(ROSTER_PORTAL_DEPARTMENTS as readonly string[]).not.toContain(
      "Finance"
    );

    const userId = await createUser(t);
    await addMembership(t, userId, depts["Finance"]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    expect(role).toBeNull();
  });

  it("gives an unverified Library roster member no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, {
      profileStatus: "pending_verification",
    });
    await addMembership(t, userId, depts[LIBRARY_DEPARTMENT_NAME]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts[LIBRARY_DEPARTMENT_NAME])
    );
    expect(role).toBeNull();
  });

  it("keeps manageLibrary false for every other department and with no name", async () => {
    for (const role of ["system_admin", "hod", "delegate", "roster"] as const) {
      expect(departmentCapabilities(role).manageLibrary).toBe(false);
      for (const name of ["Media", "Finance", "Administration", "Hospitality"]) {
        expect(departmentCapabilities(role, name).manageLibrary).toBe(false);
      }
      expect(
        departmentCapabilities(role, LIBRARY_DEPARTMENT_NAME).manageLibrary
      ).toBe(true);
    }
  });

  it("lets Library's own HOD and delegate keep their shell capabilities too", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);

    const hodId = await createUser(t);
    await grantRole(t, hodId, "hod", depts[LIBRARY_DEPARTMENT_NAME]);
    const hodRole = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, hodId, depts[LIBRARY_DEPARTMENT_NAME])
    );
    expect(hodRole).toBe("hod");

    const hodCan = departmentCapabilities("hod", LIBRARY_DEPARTMENT_NAME);
    expect(hodCan.manageLibrary).toBe(true);
    expect(hodCan.viewRoster).toBe(true);
    expect(hodCan.editDescription).toBe(true);

    // A delegate runs the catalogue and still makes none of the decisions
    // about who serves in the department.
    const delegateCan = departmentCapabilities("delegate", LIBRARY_DEPARTMENT_NAME);
    expect(delegateCan.manageLibrary).toBe(true);
    expect(delegateCan.viewRoster).toBe(true);
    expect(delegateCan.editDescription).toBe(false);
    expect(delegateCan.manageDelegates).toBe(false);
  });
});

// ── AC-24, AC-32: the negative stock guard ────────────────────────────────

describe("applyMovement (AC-23, AC-24, AC-32)", () => {
  it("adds an `in` movement to the count", () => {
    expect(applyMovement(0, "in", 30)).toBe(30);
    expect(applyMovement(30, "in", 5)).toBe(35);
  });

  it("subtracts an `out` movement from the count", () => {
    expect(applyMovement(30, "out", 5)).toBe(25);
    expect(applyMovement(3, "out", 3)).toBe(0);
  });

  it("refuses an `out` movement larger than the count", () => {
    // The spec's own failure case: an out of 5 against a count of 3.
    expect(applyMovement(3, "out", 5)).toBe("insufficient");
    expect(applyMovement(0, "out", 1)).toBe("insufficient");
  });

  it("never returns a count below zero", () => {
    for (let before = 0; before <= 5; before++) {
      for (let quantity = 1; quantity <= 10; quantity++) {
        const result = applyMovement(before, "out", quantity);
        if (result !== "insufficient") expect(result).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("lands on zero rather than minus one when two movements race", () => {
    // Two operators each record an `out` of 1 against a count of 1. Convex's
    // optimistic concurrency retry means the loser re-reads, so it sees 0 and
    // calls this with before=0 — which is the case that has to refuse.
    expect(applyMovement(1, "out", 1)).toBe(0);
    expect(applyMovement(0, "out", 1)).toBe("insufficient");
  });
});

// ── AC-8, AC-32: the format immutability rule ─────────────────────────────

describe("crossesPhysicalDigitalLine (AC-8, AC-32)", () => {
  it("allows a move within the physical side", () => {
    expect(crossesPhysicalDigitalLine("physical", "physical")).toBe(false);
  });

  it("allows a move within the digital side", () => {
    expect(crossesPhysicalDigitalLine("pdf", "audio")).toBe(false);
    expect(crossesPhysicalDigitalLine("audio", "pdf")).toBe(false);
    expect(crossesPhysicalDigitalLine("pdf", "pdf")).toBe(false);
  });

  it("refuses a move across the line, both ways", () => {
    // A priced book with 30 on the shelf becoming a PDF would strand its price
    // and its count on a row where neither belongs.
    expect(crossesPhysicalDigitalLine("physical", "pdf")).toBe(true);
    expect(crossesPhysicalDigitalLine("physical", "audio")).toBe(true);
    expect(crossesPhysicalDigitalLine("pdf", "physical")).toBe(true);
    expect(crossesPhysicalDigitalLine("audio", "physical")).toBe(true);
  });
});

// ── AC-26, AC-27, AC-32: the N43 crossing latch, both directions ──────────

describe("lowStockTransition (AC-26, AC-27, AC-32)", () => {
  const T = LIBRARY_LOW_STOCK_THRESHOLD;

  it("alerts on the crossing from above the threshold to at or below it", () => {
    const result = lowStockTransition(T + 2, T - 2, undefined, now);
    expect(result.alert).toBe(true);
    expect(result.lowStockNotifiedAt).toBe(now);
  });

  it("alerts when the count lands exactly on the threshold", () => {
    // "At or below", not "below": ten is low.
    expect(lowStockTransition(T + 1, T, undefined, now).alert).toBe(true);
  });

  it("sends nothing while the count stays low, including reaching zero", () => {
    const stamped = now - 1000;
    expect(lowStockTransition(T - 2, T - 4, stamped, now)).toEqual({
      alert: false,
      lowStockNotifiedAt: stamped,
    });
    // The movement that empties the shelf is still not a second notice.
    expect(lowStockTransition(1, 0, stamped, now)).toEqual({
      alert: false,
      lowStockNotifiedAt: stamped,
    });
  });

  it("clears the latch when a movement lifts the count back above", () => {
    const result = lowStockTransition(T - 4, T + 4, now - 1000, now);
    expect(result.alert).toBe(false);
    expect(result.lowStockNotifiedAt).toBeUndefined();
  });

  it("alerts again on the next crossing after the latch cleared", () => {
    // The spec's own scenario: 12 → 8 → 6 → 14 → 9 sends exactly two notices.
    const counts = [12, 8, 6, 14, 9];
    let stamp: number | undefined = undefined;
    let alerts = 0;
    for (let i = 1; i < counts.length; i++) {
      const result = lowStockTransition(counts[i - 1], counts[i], stamp, now + i);
      if (result.alert) alerts++;
      stamp = result.lowStockNotifiedAt;
    }
    expect(alerts).toBe(2);
  });

  it("alerts at creation for an item born at or below the threshold", () => {
    // AC-27 falls out of the same rule: the previous count is "unbounded", so
    // being born low IS a crossing.
    expect(lowStockTransition("unbounded", 5, undefined, now).alert).toBe(true);
    expect(lowStockTransition("unbounded", 0, undefined, now).alert).toBe(true);
    expect(lowStockTransition("unbounded", T, undefined, now).alert).toBe(true);
  });

  it("does not alert at creation for an item born with plenty", () => {
    const result = lowStockTransition("unbounded", 30, undefined, now);
    expect(result.alert).toBe(false);
    expect(result.lowStockNotifiedAt).toBeUndefined();
  });

  it("never alerts twice from one already-stamped state", () => {
    // Belt and braces on the latch: whatever the counts, a stamped item that
    // stays low is silent.
    for (let before = 0; before <= T; before++) {
      for (let after = 0; after <= T; after++) {
        expect(lowStockTransition(before, after, now - 1, now).alert).toBe(false);
      }
    }
  });
});
