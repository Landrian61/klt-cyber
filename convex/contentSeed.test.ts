import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { testConvex, SEED_ADMIN_EMAIL } from "./test.setup";

async function seedAdminUser(t: ReturnType<typeof testConvex>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      authId: "seed:admin",
      email: SEED_ADMIN_EMAIL,
      firstName: "Admin",
      lastName: "Seed",
      role: "visitor",
      status: "active",
      profileCompleted: false,
    });
  });
}

describe("contentSeed:seedContent guard (AC-2)", () => {
  it("refuses with no writes when allowSampleData is false", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await expect(
      t.mutation(internal.contentSeed.seedContent, { allowSampleData: false })
    ).rejects.toThrow();

    const themes = await t.run((ctx) => ctx.db.query("themes").collect());
    expect(themes).toHaveLength(0);
  });

  it("refuses with no writes when allowSampleData is omitted", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await expect(t.mutation(internal.contentSeed.seedContent, {})).rejects.toThrow(
      /allowSampleData/
    );

    const themes = await t.run((ctx) => ctx.db.query("themes").collect());
    expect(themes).toHaveLength(0);
  });

  // The "allowSampleData: true but this deployment is production" branch is
  // covered as a pure-function test of assertSampleSeedAllowed itself
  // (convex/lib/environment.test.ts) — PRODUCTION_CONVEX_URL is a hardcoded,
  // currently-empty constant (not an env var, per spec 0001), so it can't be
  // flipped to "production" from here without either touching that constant
  // or mocking across the convex-test module boundary.

  it("seeds themes/events/announcements, never a roleAssignments row (AC-1, AC-5)", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    const result = await t.mutation(internal.contentSeed.seedContent, {
      allowSampleData: true,
    });
    expect(result).toMatchObject({ ok: true, themes: 2 });

    const roleAssignments = await t.run((ctx) =>
      ctx.db.query("roleAssignments").collect()
    );
    expect(roleAssignments).toHaveLength(0);

    const programs = await t.run((ctx) => ctx.db.query("weeklyPrograms").collect());
    expect(programs).toHaveLength(0); // moved to seed.ts:weeklyPrograms

    // Re-running never grants a role either (regression, AC-1).
    await t.mutation(internal.contentSeed.seedContent, { allowSampleData: true });
    const roleAssignmentsAfterRerun = await t.run((ctx) =>
      ctx.db.query("roleAssignments").collect()
    );
    expect(roleAssignmentsAfterRerun).toHaveLength(0);
  });
});
