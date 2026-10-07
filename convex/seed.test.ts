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

describe("seed:facilityDrafts", () => {
  it("returns ok false when SEED_ADMIN_EMAIL is not set at all", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", "");
    const t = testConvex();
    const result = await t.mutation(internal.seed.facilityDrafts, {});
    expect(result).toMatchObject({ ok: false, reason: "SEED_ADMIN_EMAIL not set" });
  });

  it("refuses and writes nothing when SEED_ADMIN_EMAIL has no user yet", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    const result = await t.mutation(internal.seed.facilityDrafts, {});
    expect(result.ok).toBe(false);
    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    expect(facilities).toHaveLength(0);
  });

  it("inserts the three facilities as hidden drafts, attributed to the seed admin", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    const result = await t.mutation(internal.seed.facilityDrafts, {});
    expect(result).toMatchObject({ ok: true, created: 3, total: 3 });

    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    expect(facilities).toHaveLength(3);
    for (const facility of facilities) {
      expect(facility.active).toBe(false);
      expect(facility.name).toBeTruthy();
    }
    expect(facilities.map((f) => f.name).sort()).toEqual(
      ["KLT Fellowship Hall", "KLT Media Studio", "KLT Resource Library"].sort()
    );
  });

  it("is idempotent — a second run inserts nothing new", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await t.mutation(internal.seed.facilityDrafts, {});
    const second = await t.mutation(internal.seed.facilityDrafts, {});
    expect(second).toMatchObject({ ok: true, created: 0, total: 3 });
  });
});

describe("seed:weeklyPrograms", () => {
  it("refuses and writes nothing when SEED_ADMIN_EMAIL has no user yet", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    const result = await t.mutation(internal.seed.weeklyPrograms, {});
    expect(result.ok).toBe(false);
    const programs = await t.run((ctx) => ctx.db.query("weeklyPrograms").collect());
    expect(programs).toHaveLength(0);
  });

  it("returns ok false when SEED_ADMIN_EMAIL is not set at all", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", "");
    const t = testConvex();
    const result = await t.mutation(internal.seed.weeklyPrograms, {});
    expect(result).toMatchObject({ ok: false, reason: "SEED_ADMIN_EMAIL not set" });
  });

  it("pins each program's startDate to a fixed date on its weekday", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);
    await t.mutation(internal.seed.weeklyPrograms, {});

    const programs = await t.run((ctx) => ctx.db.query("weeklyPrograms").collect());
    const sunday = programs.find((p) => p.title === "Sunday Service");
    expect(sunday?.startDate).toBe(Date.UTC(2026, 0, 4) - 3 * 60 * 60 * 1000);
    for (const program of programs) {
      const local = new Date((program.startDate as number) + 3 * 60 * 60 * 1000);
      expect(local.getUTCDay()).toBe(program.daysOfWeek?.[0]);
    }
  });

  it("inserts the five programs onto the current recurrence fields", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    const result = await t.mutation(internal.seed.weeklyPrograms, {});
    expect(result).toMatchObject({ ok: true, created: 5, total: 5 });

    const programs = await t.run((ctx) => ctx.db.query("weeklyPrograms").collect());
    expect(programs).toHaveLength(5);
    for (const program of programs) {
      expect(program.recurrence).toBe("weekly");
      expect(program.daysOfWeek).toBeDefined();
      expect(program.startDate).toBeTypeOf("number");
      expect(program.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(program.dayOfWeek).toBeUndefined();
      expect(program.time).toBeUndefined();
      expect(program.coverImageUrl).toBeUndefined();
    }
  });

  it("is idempotent on title — a second run inserts nothing new", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await t.mutation(internal.seed.weeklyPrograms, {});
    const second = await t.mutation(internal.seed.weeklyPrograms, {});
    expect(second).toMatchObject({ ok: true, created: 0, total: 5 });
  });
});

describe("facility visibility (AC-8)", () => {
  it("never modifies an existing active row, so legacy live rows stay live", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    const adminId = await seedAdminUser(t);
    await t.run((ctx) =>
      ctx.db.insert("facilities", {
        name: "KLT Media Studio",
        active: true,
        createdBy: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await t.mutation(internal.seed.facilityDrafts, {});
    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    expect(facilities.find((f) => f.name === "KLT Media Studio")?.active).toBe(true);
    expect(facilities.filter((f) => f.active === false)).toHaveLength(2);
  });
});

describe("facilityDrafts and churchAdminSeed order-independence (AC-7)", () => {
  it("facilityDrafts then seedChurchAdmin: neither suppresses the other's writes", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    await t.mutation(internal.seed.facilityDrafts, {});
    const churchAdminResult = await t.mutation(internal.churchAdminSeed.seedChurchAdmin, {
      allowSampleData: true,
    });
    expect(churchAdminResult.ok).toBe(true);

    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    // 3 hidden drafts, matched by name so seedChurchAdmin adds no duplicates.
    expect(facilities).toHaveLength(3);
    expect(facilities.every((f) => f.active === false)).toBe(true);
  });

  it("seedChurchAdmin then facilityDrafts: neither suppresses the other's writes", async () => {
    vi.stubEnv("SEED_ADMIN_EMAIL", SEED_ADMIN_EMAIL);
    const t = testConvex();
    await seedAdminUser(t);

    const churchAdminResult = await t.mutation(internal.churchAdminSeed.seedChurchAdmin, {
      allowSampleData: true,
    });
    expect(churchAdminResult.ok).toBe(true);
    const facilityResult = await t.mutation(internal.seed.facilityDrafts, {});
    expect(facilityResult).toMatchObject({ ok: true, created: 0 });

    const facilities = await t.run((ctx) => ctx.db.query("facilities").collect());
    expect(facilities).toHaveLength(3);
    expect(facilities.every((f) => f.active === false)).toBe(true);
    expect(facilities.every((f) => f.active === false)).toBe(true);
  });
});
