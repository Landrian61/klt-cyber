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

describe("churchAdminSeed:seedChurchAdmin guard (AC-2)", () => {
  it("refuses with no writes when allowSampleData is false", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await expect(
      t.mutation(internal.churchAdminSeed.seedChurchAdmin, { allowSampleData: false })
    ).rejects.toThrow();

    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    expect(facilities).toHaveLength(0);
  });

  it("refuses with no writes when allowSampleData is omitted", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await expect(t.mutation(internal.churchAdminSeed.seedChurchAdmin, {})).rejects.toThrow(
      /allowSampleData/
    );

    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    expect(facilities).toHaveLength(0);
  });

  it("refuses and writes nothing when no users exist yet", async () => {
    const t = testConvex();
    const result = await t.mutation(internal.churchAdminSeed.seedChurchAdmin, {
      allowSampleData: true,
    });
    expect(result.ok).toBe(false);
  });
});

describe("churchAdminSeed:seedChurchAdmin already-seeded check (AC-7)", () => {
  it("keys off the seed user existing, not off any facility existing", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    const adminId = await seedAdminUser(t);

    // A facility already exists (e.g. facilityDrafts ran first) but the
    // seed user doesn't — seedChurchAdmin must still run, not short-circuit.
    await t.run((ctx) =>
      ctx.db.insert("facilities", {
        name: "KLT Media Studio",
        active: false,
        createdBy: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const result = await t.mutation(internal.churchAdminSeed.seedChurchAdmin, {
      allowSampleData: true,
    });
    expect(result.ok).toBe(true);

    const profiles = await t.run((ctx) => ctx.db.query("memberProfiles").collect());
    expect(profiles).toHaveLength(4);
  });

  it("is idempotent — a second run reports already seeded and writes nothing new", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await t.mutation(internal.churchAdminSeed.seedChurchAdmin, { allowSampleData: true });
    const second = await t.mutation(internal.churchAdminSeed.seedChurchAdmin, {
      allowSampleData: true,
    });
    expect(second.ok).toBe(false);

    const profiles = await t.run((ctx) => ctx.db.query("memberProfiles").collect());
    expect(profiles).toHaveLength(4);
  });
});
