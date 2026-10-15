import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { testConvex } from "./test.setup";
import { hasPortalAccess } from "./lib/authz";
import type { Id } from "./_generated/dataModel";

const now = Date.now();

async function seedDepartments(t: ReturnType<typeof testConvex>) {
  return await t.run(async (ctx) => {
    const names = [
      "Administration",
      "Media",
      "Hospitality",
      "Library & Information",
      "Finance",
      "Pastoral",
      "Real Estate",
      "Education",
      "Worship Ministry",
      "Ushering",
      "Missions & Outreach",
      "Children's Ministry",
      "Eagles Youth",
    ];
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
  scope?: { departmentId?: Id<"departments">; clanId?: Id<"clans"> }
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("roleAssignments", {
      userId,
      roleType,
      assignedBy: userId,
      status: "active",
      ...(scope?.departmentId ? { departmentId: scope.departmentId } : {}),
      ...(scope?.clanId ? { clanId: scope.clanId } : {}),
    });
  });
}

async function addToRoster(
  t: ReturnType<typeof testConvex>,
  userId: Id<"users">,
  departmentId: Id<"departments">
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("departmentMemberships", {
      userId,
      departmentId,
      addedBy: userId,
      status: "active",
    });
  });
}

// ── AC-1: Content query sign in gating ────────────────────────────────────

describe("content query sign-in gating (AC-1)", () => {
  it("listUpcomingEvents returns null without auth", async () => {
    const t = testConvex();
    const result = await t.query(api.events.listUpcomingEvents, {});
    expect(result).toBeNull();
  });

  it("listFeaturedEvents returns null without auth", async () => {
    const t = testConvex();
    const result = await t.query(api.events.listFeaturedEvents, {});
    expect(result).toBeNull();
  });

  it("getCurrentThemes returns null without auth", async () => {
    const t = testConvex();
    const result = await t.query(api.themes.getCurrentThemes, {});
    expect(result).toBeNull();
  });

  it("listActiveAnnouncements returns null without auth", async () => {
    const t = testConvex();
    const result = await t.query(api.announcements.listActiveAnnouncements, {});
    expect(result).toBeNull();
  });

  it("listActivePrograms returns null without auth", async () => {
    const t = testConvex();
    const result = await t.query(api.weeklyPrograms.listActivePrograms, {});
    expect(result).toBeNull();
  });

  it("listActiveFacilities returns null without auth", async () => {
    const t = testConvex();
    const result = await t.query(api.facilities.listActiveFacilities, {});
    expect(result).toBeNull();
  });
});

// ── AC-4: hasPortalAccess ──────────────────────────────────────────────────

describe("hasPortalAccess (AC-4)", () => {
  it("returns true when user holds an active role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "system_admin");

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(true);
  });

  it("returns true for a verified Media roster member with no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, { profileStatus: "verified" });
    await addToRoster(t, userId, depts["Media"]);

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(true);
  });

  it("returns true for a verified Hospitality roster member with no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, { profileStatus: "verified" });
    await addToRoster(t, userId, depts["Hospitality"]);

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(true);
  });

  it("returns true for a verified Library & Information roster member with no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, { profileStatus: "verified" });
    await addToRoster(t, userId, depts["Library & Information"]);

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(true);
  });

  it("returns false for an unverified visitor with a Media roster membership", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t, {
      profileStatus: "pending_verification",
    });
    await addToRoster(t, userId, depts["Media"]);

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(false);
  });

  it("returns false for a user on a non-portal department roster with no role", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const userId = await createUser(t);
    await addToRoster(t, userId, depts["Finance"]);

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(false);
  });

  it("returns false for a user with no roles and no roster membership", async () => {
    const t = testConvex();
    await seedDepartments(t);
    const userId = await createUser(t);

    const result = await t.run(async (ctx) => {
      return await hasPortalAccess(ctx, userId);
    });
    expect(result).toBe(false);
  });
});

// ── AC-6: Unscoped HOD rejected ────────────────────────────────────────────

describe("unscoped HOD rejection (AC-6)", () => {
  it("assignRole rejects hod without departmentId", async () => {
    const t = testConvex();
    await seedDepartments(t);
    const actorId = await createUser(t);
    await grantRole(t, actorId, "system_admin");
    const targetId = await createUser(t);

    await expect(
      t.mutation(api.roles.assignRole, {
        roleType: "hod",
        userId: targetId,
      })
    ).rejects.toThrow();
  });
});

// ── AC-2: Roster scoped reads ──────────────────────────────────────────────

describe("roster scoped reads (AC-2)", () => {
  it("listDepartmentMembers returns null without auth", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const result = await t.query(
      api.departmentMemberships.listDepartmentMembers,
      { departmentId: depts["Media"] }
    );
    expect(result).toBeNull();
  });

  it("listDepartmentMembersWithProfiles returns null without auth", async () => {
    const t = testConvex();
    const depts = await seedDepartments(t);
    const result = await t.query(
      api.departmentMemberships.listDepartmentMembersWithProfiles,
      { departmentId: depts["Media"] }
    );
    expect(result).toBeNull();
  });
});

// ── AC-5: Hub query ────────────────────────────────────────────────────────

describe("hub query (AC-5)", () => {
  it("listMyDepartmentsForHub returns null without auth", async () => {
    const t = testConvex();
    await seedDepartments(t);
    const result = await t.query(
      api.departmentMemberships.listMyDepartmentsForHub,
      {}
    );
    expect(result).toBeNull();
  });
});
