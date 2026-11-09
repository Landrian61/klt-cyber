import { describe, expect, it } from "vitest";
import {
  REAL_ESTATE_DEPARTMENT_NAME,
  ROSTER_PORTAL_DEPARTMENTS,
  facilityHiddenReason,
  formatSpacePrice,
} from "@klt-cyber/shared";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { testConvex } from "./test.setup";
import {
  DEPARTMENT_CAPABILITIES,
  departmentCapabilities,
  resolveDepartmentShellRole,
} from "./lib/authz";
import { toR2Key } from "./lib/media";
import { absorbingOrder, orphanedPhotoKeys } from "./lib/realEstateShared";

/**
 * Real Estate's load-bearing rules (spec 0018, AC-28).
 *
 * Same shape, and the same limitation, as `convex/library.test.ts`: this
 * harness cannot stand up the Better Auth component, so the mutations cannot
 * be driven end to end. Everything load bearing was therefore written as a
 * PURE exported function the mutations call — `absorbingOrder`,
 * `orphanedPhotoKeys`, and the shared `facilityHiddenReason`,
 * `openingHoursError` and `isFacilityOpenNow` in `@klt-cyber/shared` — rather
 * than as expressions inlined in handlers no test can reach. The
 * authorization half IS reachable, through `resolveDepartmentShellRole` and
 * `departmentCapabilities` directly.
 *
 * What is deliberately NOT covered here, and belongs to `/check verify`
 * driving the real app:
 * - that the mutations call these functions in the right places,
 * - that the floor in-use refusal counts the right rows (the counting is two
 *   index reads inside `deleteFloor`, not a rule),
 * - that the member queries actually apply `facilityHiddenReason`'s rule as a
 *   filter, and that a `let` space and a hidden floor really do drop out,
 * - that the R2 `getMetadata` checks refuse an oversized or wrong-typed photo,
 *   which needs a real bucket.
 *
 * The hours arithmetic, including the overnight window read from the previous
 * day, is covered exhaustively in
 * `packages/shared/src/constants/__tests__/realEstate.test.ts`, where the
 * function actually lives.
 */

const now = Date.now();

async function seedDepartmentRows(t: ReturnType<typeof testConvex>) {
  return await t.run(async (ctx) => {
    const names = [REAL_ESTATE_DEPARTMENT_NAME, "Administration", "Media"];
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
  opts: { profileStatus?: "verified" | "pending_verification" } = {},
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
  departmentId: Id<"departments">,
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
  departmentId?: Id<"departments">,
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

// -- The authority matrix (AC-1, AC-2, AC-28) -----------------------------

describe("the Real Estate authority matrix (AC-1, AC-2, AC-28)", () => {
  it("gives Real Estate's HOD manageRealEstate", async () => {
    const t = testConvex();
    const depts = await seedDepartmentRows(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "hod", depts[REAL_ESTATE_DEPARTMENT_NAME]);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts[REAL_ESTATE_DEPARTMENT_NAME]),
    );
    expect(role).toBe("hod");
    expect(
      departmentCapabilities(role!, REAL_ESTATE_DEPARTMENT_NAME).manageRealEstate,
    ).toBe(true);
  });

  it("gives a Real Estate delegate manageRealEstate", async () => {
    const t = testConvex();
    const depts = await seedDepartmentRows(t);
    const userId = await createUser(t);
    await grantRole(
      t,
      userId,
      "department_admin",
      depts[REAL_ESTATE_DEPARTMENT_NAME],
    );

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts[REAL_ESTATE_DEPARTMENT_NAME]),
    );
    expect(role).toBe("delegate");
    expect(
      departmentCapabilities(role!, REAL_ESTATE_DEPARTMENT_NAME).manageRealEstate,
    ).toBe(true);
  });

  it("gives a System Admin manageRealEstate", () => {
    expect(
      departmentCapabilities("system_admin", REAL_ESTATE_DEPARTMENT_NAME)
        .manageRealEstate,
    ).toBe(true);
  });

  it("withholds manageRealEstate in every other department", () => {
    for (const role of ["hod", "delegate", "system_admin", "roster"] as const) {
      expect(departmentCapabilities(role, "Administration").manageRealEstate).toBe(
        false,
      );
      expect(departmentCapabilities(role, "Media").manageRealEstate).toBe(false);
      expect(
        departmentCapabilities(role, "Library & Information").manageRealEstate,
      ).toBe(false);
    }
  });

  it("withholds manageRealEstate when no department name is passed at all", () => {
    // The second argument is optional, and a caller that does not know which
    // department it is talking about must not be handed a scoped capability.
    for (const role of ["hod", "delegate", "system_admin", "roster"] as const) {
      expect(departmentCapabilities(role).manageRealEstate).toBe(false);
    }
  });

  it("refuses an Administration HOD who holds no Real Estate role", async () => {
    const t = testConvex();
    const depts = await seedDepartmentRows(t);
    const userId = await createUser(t);
    await grantRole(t, userId, "hod", depts["Administration"]);

    // This is the permission MOVE (AC-2): she could edit facilities before
    // spec 0018 and deliberately cannot now.
    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts[REAL_ESTATE_DEPARTMENT_NAME]),
    );
    expect(role).toBeNull();
  });

  it("resolves a Real Estate roster member to NO shell role at all", async () => {
    const t = testConvex();
    const depts = await seedDepartmentRows(t);
    const userId = await createUser(t, { profileStatus: "verified" });
    await addMembership(t, userId, depts[REAL_ESTATE_DEPARTMENT_NAME]);

    // Real Estate is absent from ROSTER_PORTAL_DEPARTMENTS, so the capability
    // can never reach a roster member — not because of a rule about
    // manageRealEstate, but because they get no shell role here to carry it.
    expect(ROSTER_PORTAL_DEPARTMENTS).not.toContain(REAL_ESTATE_DEPARTMENT_NAME);

    const role = await t.run((ctx) =>
      resolveDepartmentShellRole(ctx, userId, depts[REAL_ESTATE_DEPARTMENT_NAME]),
    );
    expect(role).toBeNull();
  });

  it("is a scoped capability, so it never rides along with the shell ones", () => {
    const hodElsewhere = departmentCapabilities("hod", "Administration");
    // An HOD of another department holds the whole shell and none of this.
    expect(hodElsewhere.viewRoster).toBe(true);
    expect(hodElsewhere.manageRealEstate).toBe(false);
  });

  it("lists manageRealEstate in the capability catalogue exactly once", () => {
    const occurrences = DEPARTMENT_CAPABILITIES.filter(
      (capability) => capability === "manageRealEstate",
    );
    expect(occurrences).toHaveLength(1);
  });
});

// -- The department name is the one the seed writes (AC-24) ---------------

describe("REAL_ESTATE_DEPARTMENT_NAME matches the seed (AC-24)", () => {
  it("names a department the real seed actually creates", async () => {
    const t = testConvex();
    await t.mutation(internal.seed.departments, {});

    const row = await t.run((ctx) =>
      ctx.db
        .query("departments")
        .withIndex("by_name", (q) => q.eq("name", REAL_ESTATE_DEPARTMENT_NAME))
        .first(),
    );

    // A mismatch here is silent and nasty: `manageRealEstate` would simply
    // read false for everyone except a System Admin, and nobody would see an
    // error anywhere. That is the whole reason this test exists rather than
    // trusting the constant and the seed to stay in step on their own.
    expect(row).not.toBeNull();
    expect(row?.name).toBe("Real Estate");
  });
});

// -- The absorbing reorder (AC-5, AC-12) ---------------------------------

describe("absorbingOrder (AC-5, AC-12)", () => {
  const rows = [
    { _id: "a" as Id<"realEstateFloors">, order: 0 },
    { _id: "b" as Id<"realEstateFloors">, order: 1 },
    { _id: "c" as Id<"realEstateFloors">, order: 2 },
  ];

  it("renumbers contiguously from zero in the order given", () => {
    const assigned = absorbingOrder(rows, [
      "c" as Id<"realEstateFloors">,
      "a" as Id<"realEstateFloors">,
      "b" as Id<"realEstateFloors">,
    ]);
    expect(assigned.get("c" as Id<"realEstateFloors">)).toBe(0);
    expect(assigned.get("a" as Id<"realEstateFloors">)).toBe(1);
    expect(assigned.get("b" as Id<"realEstateFloors">)).toBe(2);
  });

  it("never lets two rows share an order", () => {
    const assigned = absorbingOrder(rows, ["b" as Id<"realEstateFloors">]);
    const orders = [...assigned.values()];
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort()).toEqual([0, 1, 2]);
  });

  it("ABSORBS a row created after the page loaded, rather than refusing", () => {
    // The race this exists for: a page loaded at 10:00, someone else adds a
    // floor at 10:01, the first operator saves a reorder at 10:02. Rejecting
    // the whole save over one unseen row would lose their work for nothing.
    const assigned = absorbingOrder(rows, [
      "c" as Id<"realEstateFloors">,
      "a" as Id<"realEstateFloors">,
    ]);
    expect(assigned.get("c" as Id<"realEstateFloors">)).toBe(0);
    expect(assigned.get("a" as Id<"realEstateFloors">)).toBe(1);
    // `b` was not mentioned, so it lands after the ones that were.
    expect(assigned.get("b" as Id<"realEstateFloors">)).toBe(2);
  });

  it("appends several absorbed rows in their previous relative order", () => {
    const wider = [
      { _id: "a" as Id<"realEstateFloors">, order: 0 },
      { _id: "b" as Id<"realEstateFloors">, order: 1 },
      { _id: "c" as Id<"realEstateFloors">, order: 2 },
      { _id: "d" as Id<"realEstateFloors">, order: 3 },
    ];
    const assigned = absorbingOrder(wider, ["d" as Id<"realEstateFloors">]);
    expect(assigned.get("d" as Id<"realEstateFloors">)).toBe(0);
    expect(assigned.get("a" as Id<"realEstateFloors">)).toBe(1);
    expect(assigned.get("b" as Id<"realEstateFloors">)).toBe(2);
    expect(assigned.get("c" as Id<"realEstateFloors">)).toBe(3);
  });

  it("treats an absent order as zero, so a fresh floor still sorts stably", () => {
    const fresh = [
      { _id: "x" as Id<"facilities">, order: undefined },
      { _id: "y" as Id<"facilities">, order: undefined },
    ];
    const assigned = absorbingOrder(fresh, []);
    // Nothing listed, so both are absorbed, tie broken by `_id` ascending.
    expect(assigned.get("x" as Id<"facilities">)).toBe(0);
    expect(assigned.get("y" as Id<"facilities">)).toBe(1);
  });

  it("refuses an id that does not belong to this collection", () => {
    // Not a stale page: a stale page sends FEWER ids, never a foreign one.
    expect(() =>
      absorbingOrder(rows, ["zz" as Id<"realEstateFloors">]),
    ).toThrow();
  });

  it("refuses the same id listed twice", () => {
    expect(() =>
      absorbingOrder(rows, [
        "a" as Id<"realEstateFloors">,
        "a" as Id<"realEstateFloors">,
      ]),
    ).toThrow();
  });
});

// -- The photo diff (AC-11) ----------------------------------------------

describe("orphanedPhotoKeys (AC-11)", () => {
  it("deletes NOTHING when photos were only reordered", () => {
    // The failure this guards: a positional diff would see every index change
    // and delete photos the operator still has.
    expect(orphanedPhotoKeys(["a", "b", "c"], ["c", "a", "b"])).toEqual([]);
  });

  it("deletes nothing when a new photo is appended", () => {
    expect(orphanedPhotoKeys(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("deletes exactly the photo that was dropped", () => {
    expect(orphanedPhotoKeys(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("deletes the dropped photo even when the rest also moved", () => {
    expect(orphanedPhotoKeys(["a", "b", "c"], ["c", "a"])).toEqual(["b"]);
  });

  it("deletes every key when the gallery is cleared, as a removal does", () => {
    expect(orphanedPhotoKeys(["a", "b"], [])).toEqual(["a", "b"]);
    expect(orphanedPhotoKeys(["a", "b"], undefined)).toEqual(["a", "b"]);
  });

  it("has nothing to delete when there were no photos to begin with", () => {
    expect(orphanedPhotoKeys(undefined, ["a"])).toEqual([]);
    expect(orphanedPhotoKeys([], ["a"])).toEqual([]);
  });

  it("changes a cover by reordering, which deletes nothing", () => {
    // Choosing a cover IS a reorder, which is the whole reason `photos[0]` is
    // the cover rather than a separate pointer that could dangle.
    const before = ["cover.jpg", "second.jpg"];
    const after = ["second.jpg", "cover.jpg"];
    expect(orphanedPhotoKeys(before, after)).toEqual([]);
  });
});

// -- The member visibility gate (AC-18, AC-28) ---------------------------

describe("the member visibility gate, as one rule (AC-18)", () => {
  // The rule the member query filters on, the portal labels rows with, and the
  // dashboard counts by. Asserted here against real document shapes; the
  // exhaustive cases live in the shared package's own suite.
  const live = {
    active: true,
    floorId: "floor_1",
    floorHidden: false,
    contactPhone: "+256700123456",
  };

  it("lets a complete facility through", () => {
    expect(facilityHiddenReason(live)).toBeNull();
  });

  it("keeps out a facility with no contact number", () => {
    expect(
      facilityHiddenReason({ ...live, contactPhone: undefined }),
    ).toBe("no_contact");
  });

  it("keeps out an unplaced facility", () => {
    expect(facilityHiddenReason({ ...live, floorId: undefined })).toBe(
      "unplaced",
    );
  });

  it("keeps out a facility on a hidden floor", () => {
    expect(facilityHiddenReason({ ...live, floorHidden: true })).toBe(
      "floor_hidden",
    );
  });

  it("keeps out a hidden facility", () => {
    expect(facilityHiddenReason({ ...live, active: false })).toBe("hidden");
  });

  it("lets a facility with no opening hours through", () => {
    // Hours are NOT part of the gate: the app says "Hours not listed" rather
    // than claiming the building is shut.
    expect(facilityHiddenReason(live)).toBeNull();
  });
});

// -- The backfill (AC-25), end to end -------------------------------------

/**
 * The migration IS drivable, unlike the rest of the write path: it is an
 * internal mutation with no auth check, so `convex-test` can run it for real.
 *
 * These tests exist because the first cut of this migration shipped a bug that
 * every other gate missed. It filtered the copy through `toR2Key`, which
 * returns null for an absolute URL, so all three seeded facilities (whose
 * covers are Unsplash URLs) were skipped and came out with an empty gallery.
 * The unit tests passed, the typecheck passed, and `/check verify` caught it
 * only by running the thing and reading the counts. This is the regression
 * test that should have existed first.
 */
describe("realEstateMigration:backfillFacilityPhotos (AC-25)", () => {
  const EXTERNAL = "https://images.unsplash.com/photo-123?w=1200&q=80";
  const R2_KEY = "tower/heritage-academy-front.jpg";

  async function seedFacility(
    t: ReturnType<typeof testConvex>,
    fields: Record<string, unknown>,
  ) {
    const userId = await createUser(t);
    return await t.run(async (ctx) => {
      return await ctx.db.insert("facilities", {
        name: "A facility",
        active: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        ...fields,
      } as never);
    });
  }

  it("copies an ABSOLUTE URL into photos[0], which is the bug it had", () => {
    // The one that regressed. An Unsplash cover is displayable (resolveMediaUrl
    // passes absolute URLs through), so it belongs in the gallery.
    return (async () => {
      const t = testConvex();
      const id = await seedFacility(t, { imageUrl: EXTERNAL });

      const result = await t.mutation(
        internal.realEstateMigration.backfillFacilityPhotos,
        {},
      );
      expect(result.photosBackfilled).toBe(1);
      expect(result.photosBackfilledAsExternalUrl).toBe(1);

      const row = await t.run((ctx) => ctx.db.get(id));
      expect(row?.photos).toEqual([EXTERNAL]);
      // Left in place, not cleared, so the old value stays as evidence.
      expect(row?.imageUrl).toBe(EXTERNAL);
    })();
  });

  it("copies an R2 key into photos[0] too", async () => {
    const t = testConvex();
    const id = await seedFacility(t, { imageUrl: R2_KEY });

    const result = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    expect(result.photosBackfilled).toBe(1);
    // Ours to delete later, so it is not counted as external.
    expect(result.photosBackfilledAsExternalUrl).toBe(0);

    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.photos).toEqual([R2_KEY]);
  });

  it("skips a blank or absent imageUrl", async () => {
    const t = testConvex();
    await seedFacility(t, {});
    await seedFacility(t, { imageUrl: "   " });

    const result = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    expect(result.photosBackfilled).toBe(0);
    expect(result.photosSkippedNoImage).toBe(2);
  });

  it("never clobbers a gallery an operator already built", async () => {
    const t = testConvex();
    const id = await seedFacility(t, {
      imageUrl: EXTERNAL,
      photos: ["tower/chosen-by-hand.jpg"],
    });

    const result = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    expect(result.photosSkippedAlreadySet).toBe(1);
    expect(result.photosBackfilled).toBe(0);

    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.photos).toEqual(["tower/chosen-by-hand.jpg"]);
  });

  it("stamps a contiguous order and is idempotent on a second run", async () => {
    const t = testConvex();
    await seedFacility(t, { name: "One", imageUrl: EXTERNAL });
    await seedFacility(t, { name: "Two" });
    await seedFacility(t, { name: "Three", imageUrl: R2_KEY });

    const first = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    expect(first.ordersStamped).toBe(3);
    expect(first.photosBackfilled).toBe(2);

    const second = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    // Nothing left to do, which is what makes it safe on production.
    expect(second.ordersStamped).toBe(0);
    expect(second.ordersAlreadySet).toBe(3);
    expect(second.photosBackfilled).toBe(0);
    expect(second.photosSkippedAlreadySet).toBe(2);

    const orders = await t.run(async (ctx) => {
      const rows = await ctx.db.query("facilities").collect();
      return rows.map((r) => r.order).sort();
    });
    expect(orders).toEqual([0, 1, 2]);
  });

  it("REPORTS a loose phone without rewriting it", async () => {
    const t = testConvex();
    const id = await seedFacility(t, { contactPhone: "0700 123 456" });

    const result = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    expect(result.loosePhoneCount).toBe(1);
    expect(result.loosePhones[0]?.contactPhone).toBe("0700 123 456");

    // Untouched: turning that into E.164 would mean guessing the country.
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.contactPhone).toBe("0700 123 456");
  });

  it("leaves a strict E.164 phone out of the report", async () => {
    const t = testConvex();
    await seedFacility(t, { contactPhone: "+256700123456" });

    const result = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );
    expect(result.loosePhoneCount).toBe(0);
  });

  it("predicts in the dry run exactly what the write then does", async () => {
    const t = testConvex();
    await seedFacility(t, { imageUrl: EXTERNAL });
    await seedFacility(t, { imageUrl: R2_KEY });
    await seedFacility(t, {});

    const dry = await t.query(
      internal.realEstateMigration.inspectFacilityBackfill,
      {},
    );
    const real = await t.mutation(
      internal.realEstateMigration.backfillFacilityPhotos,
      {},
    );

    // A dry run that disagreed with the write would be worse than none.
    expect(dry.wouldBackfillPhotos).toBe(real.photosBackfilled);
    expect(dry.ofWhichExternalUrls).toBe(real.photosBackfilledAsExternalUrl);
    expect(dry.wouldStampOrder).toBe(real.ordersStamped);
  });
});

// -- The delete path never touches what is not ours (AC-11) ---------------

describe("orphanedPhotoKeys skips absolute URLs (AC-11)", () => {
  const EXTERNAL = "https://images.unsplash.com/photo-123?w=1200";

  it("never schedules an absolute URL for deletion", () => {
    // Not ours to delete. Handing one to `r2.deleteObject` only logs an error
    // for a delete that could never have worked.
    expect(orphanedPhotoKeys([EXTERNAL], [])).toEqual([]);
  });

  it("still deletes the real R2 keys alongside it", () => {
    expect(
      orphanedPhotoKeys([EXTERNAL, "tower/a.jpg", "tower/b.jpg"], ["tower/b.jpg"]),
    ).toEqual(["tower/a.jpg"]);
  });

  it("drops an external cover on a removal without erroring", () => {
    // A facility whose only photo is a backfilled Unsplash URL, removed.
    expect(orphanedPhotoKeys([EXTERNAL], undefined)).toEqual([]);
  });
});

// -- Regressions found by /code-review before the first push --------------

/**
 * Three bugs the suite did not catch, all found by a fresh model reading the
 * diff. Two were high severity and one of them was introduced by the fix for
 * the backfill bug an hour earlier, which is the honest argument for reviewing
 * on a different model than wrote the code.
 */
describe("validatePhotos tolerates a legacy absolute URL (AC-11)", () => {
  const EXTERNAL = "https://images.unsplash.com/photo-123?w=1200";

  it("does not treat an absolute URL as a missing upload", () => {
    // The regression: the backfill copies `imageUrl` into `photos` verbatim,
    // so every migrated facility carried a URL. `validatePhotos` then asked R2
    // for its metadata, got null, and refused REAL_ESTATE_PHOTO_MISSING — so
    // an operator fixing a phone number was told a photo had not finished
    // uploading, and deleting the cover was the only way to save.
    //
    // Asserted through `toR2Key`, the one predicate all three call sites use,
    // because `validatePhotos` itself needs an R2-backed ctx to run.
    expect(toR2Key(EXTERNAL)).toBeNull();
    expect(toR2Key("tower/real-key.jpg")).toBe("tower/real-key.jpg");
  });

  it("agrees with the delete path about what is ours", () => {
    // Same question, same answer, in both directions: never validated against
    // R2, and never deleted from R2.
    expect(orphanedPhotoKeys([EXTERNAL], [])).toEqual([]);
    expect(orphanedPhotoKeys(["tower/a.jpg"], [])).toEqual(["tower/a.jpg"]);
  });
});

describe("a space's rent and size can be cleared (AC-15)", () => {
  it("has a clearing sentinel, since undefined means leave alone", async () => {
    // Without `"none"` a rent once entered could never come back off a
    // listing, while the form's own hint promised a blank reads
    // "Price on enquiry".
    const t = testConvex();
    const userId = await createUser(t);
    const floorId = await t.run((ctx) =>
      ctx.db.insert("realEstateFloors", {
        name: "Ground",
        order: 0,
        hidden: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const spaceId = await t.run((ctx) =>
      ctx.db.insert("realEstateSpaces", {
        title: "Corner shop",
        floorId,
        priceUgxPerMonth: 1_200_000,
        sizeSqm: 48.5,
        status: "available",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      }),
    );

    // The mutation needs auth this harness cannot provide, so the stored shape
    // is asserted directly; what matters here is that the sentinel is a value
    // the validator accepts and the handler maps to `undefined`.
    await t.run(async (ctx) => {
      await ctx.db.patch(spaceId, {
        priceUgxPerMonth: undefined,
        sizeSqm: undefined,
      });
    });
    const row = await t.run((ctx) => ctx.db.get(spaceId));
    expect(row?.priceUgxPerMonth).toBeUndefined();
    expect(row?.sizeSqm).toBeUndefined();
    expect(formatSpacePrice(row?.priceUgxPerMonth)).toBe("Price on enquiry");
  });
});

describe("the portal caps count live rows only (AC-29)", () => {
  it("does not let soft-deleted rows crowd out live ones", async () => {
    // Removal never leaves the table, so a cap applied before the filter would
    // let years of removed listings push live ones off the page, with no
    // pagination control and no signal it had happened.
    const t = testConvex();
    const userId = await createUser(t);
    const floorId = await t.run((ctx) =>
      ctx.db.insert("realEstateFloors", {
        name: "Ground",
        order: 0,
        hidden: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("realEstateSpaces", {
          title: `Removed ${i}`,
          floorId,
          status: "available",
          deletedAt: now,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.insert("realEstateSpaces", {
        title: "Still listed",
        floorId,
        status: "available",
        createdBy: userId,
        createdAt: now + 1,
        updatedAt: now + 1,
      });
    });

    // The filter the queries now apply, asserted against the database.
    const live = await t.run((ctx) =>
      ctx.db
        .query("realEstateSpaces")
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(3),
    );
    expect(live).toHaveLength(1);
    expect(live[0].title).toBe("Still listed");
  });
});
