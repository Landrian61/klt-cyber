import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The R2 client reads its config when its module loads, before any test runs.
// Nothing here signs a real URL, so placeholder credentials do.
vi.hoisted(() => {
  process.env.R2_BUCKET ??= "test-bucket";
  process.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID ??= "test-key";
  process.env.R2_SECRET_ACCESS_KEY ??= "test-secret";
});
import { testConvex } from "./test.setup";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

/**
 * `profile.getMyChurchLife` (spec 0023, AC-5, AC-26, AC-27): the roles list
 * and the web portal pointer on the mobile profile.
 */

const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
let currentAuthId: string | null = null;

beforeEach(() => {
  currentAuthId = null;
  vi.spyOn(authComponent, "safeGetAuthUser").mockImplementation(
    async () => (currentAuthId ? ({ _id: currentAuthId } as never) : undefined) as never
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

type T = ReturnType<typeof testConvex>;
interface Person {
  userId: Id<"users">;
  authId: string;
}

function as(person: Person | null) {
  currentAuthId = person?.authId ?? null;
}

async function seed(t: T) {
  return await t.run(async (ctx) => ({
    media: await ctx.db.insert("departments", { name: "Media", order: 1 }),
    hospitality: await ctx.db.insert("departments", { name: "Hospitality", order: 2 }),
    choir: await ctx.db.insert("departments", { name: "Choir", order: 3 }),
    judah: await ctx.db.insert("clans", { name: "Judah", order: 1 }),
  }));
}

async function createPerson(t: T, firstName: string): Promise<Person> {
  const authId = `test:${crypto.randomUUID()}`;
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      email: `${firstName.toLowerCase()}@test.org`,
      firstName,
      lastName: "Test",
      role: "member",
      profileCompleted: true,
    })
  );
  return { userId, authId };
}

async function grant(
  t: T,
  person: Person,
  roleType: Doc<"roleAssignments">["roleType"],
  scope: { departmentId?: Id<"departments">; clanId?: Id<"clans"> } = {},
  status: "active" | "revoked" = "active"
) {
  await t.run(async (ctx) =>
    ctx.db.insert("roleAssignments", {
      userId: person.userId,
      roleType,
      assignedBy: person.userId,
      status,
      ...scope,
    })
  );
}

async function seat(
  t: T,
  person: Person,
  departmentId: Id<"departments">,
  status: "active" | "pending_claim"
) {
  await t.run(async (ctx) =>
    ctx.db.insert("departmentMemberships", {
      userId: person.userId,
      departmentId,
      addedBy: person.userId,
      status,
      claimedAt: T0,
    })
  );
}

describe("profile.getMyChurchLife", () => {
  it("returns null when signed out", async () => {
    const t = testConvex();
    as(null);
    expect(await t.query(api.profile.getMyChurchLife, {})).toBeNull();
  });

  it("shows no roles and no pointer for a plain member", async () => {
    const t = testConvex();
    const d = await seed(t);
    const ruth = await createPerson(t, "Ruth");
    await seat(t, ruth, d.choir, "active");
    as(ruth);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.roles).toEqual([]);
    expect(result?.portal).toEqual({ show: false, reasons: [] });
  });

  it("labels roles with their scope and points a role holder at the portal", async () => {
    const t = testConvex();
    const d = await seed(t);
    const amos = await createPerson(t, "Amos");
    await grant(t, amos, "hod", { departmentId: d.choir });
    await grant(t, amos, "clan_elder", { clanId: d.judah });
    await grant(t, amos, "system_admin");
    as(amos);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.roles.map((r) => [r.label, r.scopeName])).toEqual([
      ["HOD", "Choir"],
      ["clan elder", "Judah"],
      ["System Admin", null],
    ]);
    expect(result?.portal).toEqual({
      show: true,
      reasons: ["HOD, Choir", "clan elder, Judah", "System Admin"],
    });
  });

  it("points a confirmed Media roster member at the portal", async () => {
    const t = testConvex();
    const d = await seed(t);
    const lydia = await createPerson(t, "Lydia");
    await seat(t, lydia, d.media, "active");
    as(lydia);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.roles).toEqual([]);
    expect(result?.portal).toEqual({ show: true, reasons: ["Media"] });
  });

  it("gives no pointer for a pending Hospitality claim", async () => {
    const t = testConvex();
    const d = await seed(t);
    const silas = await createPerson(t, "Silas");
    await seat(t, silas, d.hospitality, "pending_claim");
    as(silas);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.portal).toEqual({ show: false, reasons: [] });
  });

  it("gives no pointer for a revoked role", async () => {
    const t = testConvex();
    const d = await seed(t);
    const tim = await createPerson(t, "Tim");
    await grant(t, tim, "hod", { departmentId: d.media }, "revoked");
    as(tim);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.roles).toEqual([]);
    expect(result?.portal.show).toBe(false);
  });

  it("does not name a department twice when a role already scopes it", async () => {
    const t = testConvex();
    const d = await seed(t);
    const phoebe = await createPerson(t, "Phoebe");
    await grant(t, phoebe, "hod", { departmentId: d.media });
    await seat(t, phoebe, d.media, "active");
    await seat(t, phoebe, d.hospitality, "active");
    as(phoebe);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.portal.reasons).toEqual(["HOD, Media", "Hospitality"]);
  });

  it("returns only the caller's own rows", async () => {
    const t = testConvex();
    const d = await seed(t);
    const amos = await createPerson(t, "Amos");
    const ruth = await createPerson(t, "Ruth");
    await grant(t, amos, "hod", { departmentId: d.media });
    as(ruth);
    const result = await t.query(api.profile.getMyChurchLife, {});
    expect(result?.roles).toEqual([]);
    expect(result?.portal.show).toBe(false);
  });
});
