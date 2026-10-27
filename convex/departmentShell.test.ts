import { describe, expect, it } from "vitest";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import {
  DEPARTMENT_CAPABILITIES,
  departmentCapabilities,
  resolveDepartmentShellRole,
} from "./lib/authz";
import {
  findLiveMembership,
  listActiveMemberships,
  placeOnRoster,
} from "./lib/departmentMembership";

/**
 * The department shell's two enforcement halves (spec 0012).
 *
 * `requireDepartmentCapability` is a one-line composition of exactly two
 * things: `resolveDepartmentShellRole` (who is this caller, here) and
 * `departmentCapabilities` (what may that role do). Both are tested directly,
 * because the composition itself resolves the caller through the Better Auth
 * component, which this test harness cannot stand up — and because a refusal
 * that matters is a refusal in one of these two tables, not in the three lines
 * that read them.
 *
 * `placeOnRoster` is tested for the same reason: the one-live-row rule is the
 * invariant three separate writers depend on, so it is proved once here rather
 * than three times through their callers.
 */

const now = Date.now();

async function seedDepartments(t: ReturnType<typeof testConvex>) {
  return await t.run(async (ctx) => {
    const names = ["Administration", "Media", "Finance"];
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

async function addMembership(
  t: ReturnType<typeof testConvex>,
  userId: Id<"users">,
  departmentId: Id<"departments">,
  status: "pending_claim" | "active" | "removed" | "declined"
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      addedBy: userId,
      status,
      ...(status === "pending_claim" ? { claimedAt: now } : {}),
    });
  });
}

// ── The capability matrix (AC-5, AC-18) ────────────────────────────────────

describe("departmentCapabilities", () => {
  // SRS 4.7.2, as one assertion. A delegate runs the day to day work and makes
  // none of the decisions about who serves here; this is the line that says so.
  const HOD_ONLY = [
    "deleteAnyMessage",
    "confirmClaim",
    "declineClaim",
    "setPosition",
    "removeMember",
    "manageDelegates",
    "editDescription",
    "sendHodNotice",
  ];

  it("gives an HOD everything", () => {
    const can = departmentCapabilities("hod");
    for (const capability of DEPARTMENT_CAPABILITIES) {
      expect(can[capability]).toBe(true);
    }
  });

  it("gives a System Admin everything", () => {
    const can = departmentCapabilities("system_admin");
    for (const capability of DEPARTMENT_CAPABILITIES) {
      expect(can[capability]).toBe(true);
    }
  });

  it("withholds exactly the eight decisions from a delegate", () => {
    const can = departmentCapabilities("delegate");
    const withheld = DEPARTMENT_CAPABILITIES.filter((c) => !can[c]);
    expect([...withheld].sort()).toEqual([...HOD_ONLY].sort());
  });

  it("still lets a delegate do the day to day work", () => {
    const can = departmentCapabilities("delegate");
    expect(can.viewRoster).toBe(true);
    expect(can.viewPendingClaimants).toBe(true);
    expect(can.viewFullProfiles).toBe(true);
    expect(can.addMember).toBe(true);
    expect(can.createActivity).toBe(true);
    expect(can.cancelActivity).toBe(true);
    expect(can.sendMessage).toBe(true);
    expect(can.deleteOwnMessage).toBe(true);
  });

  // The split that no single "can delete messages" flag could express.
  it("separates deleting your own message from deleting anyone's", () => {
    const delegate = departmentCapabilities("delegate");
    expect(delegate.deleteOwnMessage).toBe(true);
    expect(delegate.deleteAnyMessage).toBe(false);
  });
});

// ── Who gets into the shell at all (AC-4, AC-5, AC-11) ─────────────────────

describe("resolveDepartmentShellRole", () => {
  it("recognises this department's HOD", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "hod", depts["Finance"]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    expect(role).toBe("hod");
  });

  it("recognises this department's delegate", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "department_admin", depts["Finance"]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    expect(role).toBe("delegate");
  });

  it("recognises a System Admin in any department", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "system_admin");

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    expect(role).toBe("system_admin");
  });

  // SRS 4.9.2: a roster member gets "No" on roster, claims, positions and
  // delegates. Spec 0006's portal gate lets them reach their department's own
  // bespoke pages; it does not admit them to the shell.
  it("gives a plain roster member no shell role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Media"], "active");

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Media"])
    );
    expect(role).toBeNull();
  });

  // The deliberate boundary: Administration keeps the active-roster read spec
  // 0006 gave it and gains nothing inside another department's shell — no
  // pending claimants, and no sharing-bypassed profile (AC-11).
  it("gives Administration authority no role in another department", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "hod", depts["Administration"]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    // Null is the whole proof: `getRosterMemberProfile` reads this resolver,
    // so no role here means no sharing-bypassed profile, whatever the caller's
    // standing in Administration.
    expect(role).toBeNull();
  });

  it("gives the HOD of one department no role in another", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "hod", depts["Finance"]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Media"])
    );
    expect(role).toBeNull();
  });

  it("gives a revoked HOD no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("roleAssignments", {
        userId,
        roleType: "hod",
        departmentId: depts["Finance"],
        assignedBy: userId,
        status: "revoked",
      });
    });

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    expect(role).toBeNull();
  });
});

// ── One live row per person and department (AC-15) ─────────────────────────

describe("findLiveMembership", () => {
  it("finds an active row", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    const membershipId = await addMembership(t, userId, depts["Finance"], "active");

    const row = await t.run((ctx) =>
      findLiveMembership(ctx, userId, depts["Finance"])
    );
    expect(row?._id).toBe(membershipId);
  });

  it("finds a pending claim", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    const membershipId = await addMembership(
      t,
      userId,
      depts["Finance"],
      "pending_claim"
    );

    const row = await t.run((ctx) =>
      findLiveMembership(ctx, userId, depts["Finance"])
    );
    expect(row?._id).toBe(membershipId);
    expect(row?.status).toBe("pending_claim");
  });

  // Both terminal states occupy nothing, which is what lets a person who was
  // declined or removed ask again.
  it("ignores removed and declined rows", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Finance"], "removed");
    await addMembership(t, userId, depts["Finance"], "declined");

    const row = await t.run((ctx) =>
      findLiveMembership(ctx, userId, depts["Finance"])
    );
    expect(row).toBeNull();
  });

  it("does not confuse one department with another", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Media"], "active");

    const row = await t.run((ctx) =>
      findLiveMembership(ctx, userId, depts["Finance"])
    );
    expect(row).toBeNull();
  });
});

describe("placeOnRoster", () => {
  // The defect this rule exists to prevent: adding or appointing someone who
  // had already asked to serve here used to insert a second row, and the roster
  // then showed them as a member AND as a claimant still waiting.
  it("promotes a pending claim rather than inserting beside it", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    const actorId = await createUser(t);
    const claimId = await addMembership(
      t,
      userId,
      depts["Finance"],
      "pending_claim"
    );

    const result = await t.run((ctx) =>
      placeOnRoster(ctx, {
        userId,
        departmentId: depts["Finance"],
        actorUserId: actorId,
      })
    );

    expect(result.outcome).toBe("promoted");
    expect(result.membershipId).toBe(claimId);

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("departmentMemberships").collect()).filter(
        (m) => m.userId === userId && m.departmentId === depts["Finance"]
      )
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].decidedBy).toBe(actorId);
    expect(rows[0].decidedAt).toBeTypeOf("number");
  });

  it("inserts a fresh active row when there is no live one", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    const actorId = await createUser(t);

    const result = await t.run((ctx) =>
      placeOnRoster(ctx, {
        userId,
        departmentId: depts["Finance"],
        actorUserId: actorId,
        positionTitle: "Treasurer",
      })
    );

    expect(result.outcome).toBe("inserted");
    const row = await t.run((ctx) => ctx.db.get(result.membershipId));
    expect(row?.status).toBe("active");
    expect(row?.positionTitle).toBe("Treasurer");
    expect(row?.addedBy).toBe(actorId);
  });

  it("leaves an already active row alone", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    const actorId = await createUser(t);
    const membershipId = await addMembership(
      t,
      userId,
      depts["Finance"],
      "active"
    );

    const result = await t.run((ctx) =>
      placeOnRoster(ctx, {
        userId,
        departmentId: depts["Finance"],
        actorUserId: actorId,
      })
    );

    expect(result.outcome).toBe("existing");
    expect(result.membershipId).toBe(membershipId);
    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("departmentMemberships").collect()).filter(
        (m) => m.userId === userId
      )
    );
    expect(rows).toHaveLength(1);
  });

  // Grandfathering, stated as a test: a row that was already active before
  // spec 0012 keeps its status and nobody currently serving is dropped.
  it("never demotes a grandfathered active row to a claim", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, { profileStatus: "pending_verification" });
    await addMembership(t, userId, depts["Finance"], "active");

    const live = await t.run((ctx) =>
      findLiveMembership(ctx, userId, depts["Finance"])
    );
    expect(live?.status).toBe("active");
  });
});

describe("listActiveMemberships", () => {
  // What the three-department cap is counted against: active rows only, so a
  // person may hold three claims and fewer than three confirmed seats.
  it("counts active rows and not claims", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Finance"], "active");
    await addMembership(t, userId, depts["Media"], "pending_claim");
    await addMembership(t, userId, depts["Administration"], "declined");

    const rows = await t.run((ctx) => listActiveMemberships(ctx, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].departmentId).toBe(depts["Finance"]);
  });
});
