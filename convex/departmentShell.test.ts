import { describe, expect, it } from "vitest";
import {
  LIBRARY_DEPARTMENT_NAME,
  MEDIA_DEPARTMENT_NAME,
} from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import {
  DEPARTMENT_CAPABILITIES,
  departmentCapabilities,
  hasRadioAuthority,
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

  // Capabilities that belong to ONE named department rather than to the shell
  // (spec 0015, AC-2; spec 0018, AC-1). They sit outside the HOD-only split
  // entirely: every shell role of the granting department holds them and no
  // role of any other department does, so "an HOD gets everything" has to mean
  // "everything the SHELL has" from here on. Each is asserted on its own below.
  //
  // Mirrors DEPARTMENT_SCOPED_CAPABILITIES in `lib/authz.ts`. A new scoped
  // capability added there and not here fails the three assertions below,
  // which is the point: it forces whoever adds one to say out loud that it is
  // scoped rather than letting it quietly look like a shell capability.
  const DEPARTMENT_SCOPED = ["manageLibrary", "manageRealEstate", "manageRadio"];
  const SHELL_CAPABILITIES = DEPARTMENT_CAPABILITIES.filter(
    (c) => !DEPARTMENT_SCOPED.includes(c)
  );

  it("gives an HOD everything the shell has", () => {
    const can = departmentCapabilities("hod");
    for (const capability of SHELL_CAPABILITIES) {
      expect(can[capability]).toBe(true);
    }
  });

  it("gives a System Admin everything the shell has", () => {
    const can = departmentCapabilities("system_admin");
    for (const capability of SHELL_CAPABILITIES) {
      expect(can[capability]).toBe(true);
    }
  });

  it("withholds exactly the eight decisions from a delegate", () => {
    const can = departmentCapabilities("delegate");
    const withheld = SHELL_CAPABILITIES.filter((c) => !can[c]);
    expect([...withheld].sort()).toEqual([...HOD_ONLY].sort());
  });

  // ── Department-scoped capabilities (spec 0015, AC-2) ─────────────────────

  it("grants manageLibrary to every role of Library & Information", () => {
    for (const role of ["system_admin", "hod", "delegate", "roster"] as const) {
      expect(
        departmentCapabilities(role, LIBRARY_DEPARTMENT_NAME).manageLibrary
      ).toBe(true);
    }
  });

  it("grants manageLibrary to nobody in any other department", () => {
    for (const role of ["system_admin", "hod", "delegate", "roster"] as const) {
      for (const name of ["Media", "Finance", "Administration"]) {
        expect(departmentCapabilities(role, name).manageLibrary).toBe(false);
      }
    }
  });

  it("reads manageLibrary as false when no department name is passed", () => {
    // This is what keeps the dozen untouched call sites safe: a caller that
    // does not know which department it is talking about cannot be handed a
    // scoped capability by accident.
    for (const role of ["system_admin", "hod", "delegate", "roster"] as const) {
      expect(departmentCapabilities(role).manageLibrary).toBe(false);
    }
  });

  it("gives a roster member manageLibrary and nothing else", () => {
    const can = departmentCapabilities("roster", LIBRARY_DEPARTMENT_NAME);
    expect(can.manageLibrary).toBe(true);
    for (const capability of SHELL_CAPABILITIES) {
      expect(can[capability]).toBe(false);
    }
  });

  it("gives a roster member of another department nothing at all", () => {
    // Hospitality: a roster portal department that grants no scoped
    // capability yet. (Media stopped being the example here once spec 0019
    // gave its roster `manageRadio`.)
    const can = departmentCapabilities("roster", "Hospitality");
    for (const capability of DEPARTMENT_CAPABILITIES) {
      expect(can[capability]).toBe(false);
    }
  });

  // ── manageRadio (spec 0019, AC-32) ───────────────────────────────────────

  it("grants manageRadio to every role of Media, the roster included", () => {
    for (const role of ["system_admin", "hod", "delegate", "roster"] as const) {
      expect(
        departmentCapabilities(role, MEDIA_DEPARTMENT_NAME).manageRadio
      ).toBe(true);
    }
  });

  it("grants manageRadio to nobody in any other department", () => {
    for (const role of ["system_admin", "hod", "delegate", "roster"] as const) {
      for (const name of [
        LIBRARY_DEPARTMENT_NAME,
        "Hospitality",
        "Pastoral",
        "Administration",
      ]) {
        expect(departmentCapabilities(role, name).manageRadio).toBe(false);
      }
      expect(departmentCapabilities(role).manageRadio).toBe(false);
    }
  });

  it("gives a Media roster member manageRadio and no shell capability", () => {
    const can = departmentCapabilities("roster", MEDIA_DEPARTMENT_NAME);
    expect(can.manageRadio).toBe(true);
    expect(can.manageLibrary).toBe(false);
    for (const capability of SHELL_CAPABILITIES) {
      expect(can[capability]).toBe(false);
    }
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
  // delegates. That rule is intact — a `roster` role holds no shell capability
  // whatsoever (see the matrix tests above) — but spec 0015, AC-1 deliberately
  // changed WHICH ROLE such a member resolves to, so this is no longer null
  // inside a ROSTER_PORTAL_DEPARTMENTS department. SRS 4.13.2 needs it: every
  // Library roster member has full operational access over the catalogue
  // without an appointment, and F3-19 needs Media's and Hospitality's roster
  // members to reach their own department's pages rather than being bounced.
  it("resolves a verified roster member of a roster-portal department as roster", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Media"], "active");

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Media"])
    );
    expect(role).toBe("roster");
  });

  it("gives a roster member of any other department no shell role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Finance"], "active");

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Finance"])
    );
    expect(role).toBeNull();
  });

  it("gives an UNVERIFIED roster member no shell role", async () => {
    // The gate that matters: `submitProfile` lets a user self-insert their own
    // roster memberships during the profile wizard, so without the verified
    // check any visitor could hand themselves the Library's catalogue by
    // ticking a box about where they would like to serve.
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, {
      profileStatus: "pending_verification",
    });
    await addMembership(t, userId, depts["Media"], "active");

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Media"])
    );
    expect(role).toBeNull();
  });

  it("gives a roster member with a non-active row no shell role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    for (const status of ["pending_claim", "removed", "declined"] as const) {
      const userId = await createUser(t);
      await addMembership(t, userId, depts["Media"], status);

      const role = await t.run((ctx) =>
        resolveDepartmentShellRole(ctx, userId, depts["Media"])
      );
      expect(role).toBeNull();
    }
  });

  it("prefers a real appointment over the roster role", async () => {
    // Someone can be both Library's HOD and on its roster. Resolving them as
    // `roster` would strip every capability they actually hold, which is why
    // precedence runs system_admin, hod, delegate, roster.
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addMembership(t, userId, depts["Media"], "active");
    await grantRole(t, userId, "hod", depts["Media"]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts["Media"])
    );
    expect(role).toBe("hod");
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

// ── hasRadioAuthority (spec 0019, AC-32, AC-33) ─────────────────────────────
// The resolver every radio function goes through. It asks the same matrix as
// every other scoped capability, so these cases prove the wiring: Media's
// whole verified roster holds it, nobody outside Media does.
describe("hasRadioAuthority", () => {
  async function setup() {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const libraryId = await t.run((ctx) =>
      ctx.db.insert("departments", { name: LIBRARY_DEPARTMENT_NAME, order: 9 })
    );
    return { t, depts, libraryId };
  }

  it("grants Media's HOD and delegates", async () => {
    const { t, depts } = await setup();
    const hod = await createUser(t);
    const delegate = await createUser(t);
    await grantRole(t, hod, "hod", depts.Media);
    await grantRole(t, delegate, "department_admin", depts.Media);
    await t.run(async (ctx) => {
      expect(await hasRadioAuthority(ctx, hod)).toBe(true);
      expect(await hasRadioAuthority(ctx, delegate)).toBe(true);
    });
  });

  it("grants a System Admin with no Media role", async () => {
    const { t } = await setup();
    const admin = await createUser(t);
    await grantRole(t, admin, "system_admin");
    await t.run(async (ctx) => {
      expect(await hasRadioAuthority(ctx, admin)).toBe(true);
    });
  });

  it("grants a verified Media roster member", async () => {
    const { t, depts } = await setup();
    const member = await createUser(t);
    await addMembership(t, member, depts.Media, "active");
    await t.run(async (ctx) => {
      expect(await hasRadioAuthority(ctx, member)).toBe(true);
    });
  });

  it("refuses a Media roster member whose profile is not verified", async () => {
    const { t, depts } = await setup();
    const member = await createUser(t, { profileStatus: "pending_verification" });
    await addMembership(t, member, depts.Media, "active");
    await t.run(async (ctx) => {
      expect(await hasRadioAuthority(ctx, member)).toBe(false);
    });
  });

  it("refuses a pending or removed Media roster row", async () => {
    const { t, depts } = await setup();
    const pending = await createUser(t);
    const removed = await createUser(t);
    await addMembership(t, pending, depts.Media, "pending_claim");
    await addMembership(t, removed, depts.Media, "removed");
    await t.run(async (ctx) => {
      expect(await hasRadioAuthority(ctx, pending)).toBe(false);
      expect(await hasRadioAuthority(ctx, removed)).toBe(false);
    });
  });

  it("refuses another department's roster member, HOD and delegate", async () => {
    const { t, depts, libraryId } = await setup();
    const libraryRoster = await createUser(t);
    const financeHod = await createUser(t);
    const adminDelegate = await createUser(t);
    await addMembership(t, libraryRoster, libraryId, "active");
    await grantRole(t, financeHod, "hod", depts.Finance);
    await grantRole(t, adminDelegate, "department_admin", depts.Administration);
    await t.run(async (ctx) => {
      expect(await hasRadioAuthority(ctx, libraryRoster)).toBe(false);
      expect(await hasRadioAuthority(ctx, financeHod)).toBe(false);
      expect(await hasRadioAuthority(ctx, adminDelegate)).toBe(false);
    });
  });
});
