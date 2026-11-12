import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The R2 client reads its config when its module loads, before any test runs.
// Nothing here signs a real URL, so placeholder credentials do.
vi.hoisted(() => {
  process.env.R2_BUCKET ??= "test-bucket";
  process.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID ??= "test-key";
  process.env.R2_SECRET_ACCESS_KEY ??= "test-secret";
});
import { ConvexError } from "convex/values";
import { DIRECTORY_ERROR_CODES } from "@klt-cyber/shared";
import { testConvex } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";

/**
 * The member directory's privacy gate (spec 0022, AC-17), run against the
 * real `directory.list` and `directory.getCard`.
 *
 * The caller is chosen by stubbing the Better Auth lookup `getCurrentUser`
 * goes through, as convex/administrationCore.test.ts does.
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
    media: await ctx.db.insert("departments", { name: "Media", order: 2 }),
    choir: await ctx.db.insert("departments", { name: "Choir", order: 1 }),
    judah: await ctx.db.insert("clans", { name: "Judah", order: 1 }),
  }));
}

async function createPerson(
  t: T,
  opts: {
    firstName: string;
    lastName?: string;
    sharing?: boolean; // undefined means the field is absent
    role?: "member" | "visitor";
    profileStatus?: "verified" | "pending_verification" | "sent_back";
    deleted?: boolean;
    noProfile?: boolean;
    clanId?: Id<"clans">;
    phone?: string;
  }
): Promise<Person> {
  const authId = `test:${crypto.randomUUID()}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      authId,
      email: `${opts.firstName.toLowerCase()}@test.org`,
      firstName: opts.firstName,
      lastName: opts.lastName ?? "Test",
      role: opts.role ?? "member",
      profileCompleted: true,
      ...(opts.deleted ? { deletedAt: T0 } : {}),
    });
    if (!opts.noProfile) {
      await ctx.db.insert("memberProfiles", {
        userId: id,
        firstName: opts.firstName,
        lastName: opts.lastName ?? "Test",
        sex: "female",
        maritalStatus: "married",
        mentorshipStatus: "enrolled",
        profileStatus: opts.profileStatus ?? "verified",
        dateOfBirth: { day: 12, month: 3, year: 1990 },
        occupation: "Engineer",
        employer: "Umeme",
        shortBio: "Loves the choir",
        ...(opts.phone ? { phone: opts.phone } : {}),
        ...(opts.clanId ? { clanId: opts.clanId } : {}),
        ...(opts.sharing !== undefined ? { directorySharing: opts.sharing } : {}),
        createdAt: T0,
        updatedAt: T0,
      });
    }
    return id;
  });
  return { userId, authId };
}

function codeOf(error: unknown): string | undefined {
  return error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;
}

async function expectMembersOnly(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(codeOf(error)).toBe(DIRECTORY_ERROR_CODES.MEMBERS_ONLY);
}

const FORBIDDEN_KEYS = [
  "address",
  "year",
  "maritalStatus",
  "spouse",
  "children",
  "nextOfKin",
  "mentorshipStatus",
  "roles",
];

function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      allKeys(inner, keys);
    }
  }
  return keys;
}

describe("who may read the directory (AC-2)", () => {
  it("refuses an unauthenticated caller on both queries", async () => {
    const t = testConvex();
    const target = await createPerson(t, { firstName: "Grace" });
    as(null);
    await expectMembersOnly(t.query(api.directory.list, {}));
    await expectMembersOnly(t.query(api.directory.getCard, { userId: target.userId }));
  });

  it("refuses a visitor, a pending member and a deleted account", async () => {
    const t = testConvex();
    const target = await createPerson(t, { firstName: "Grace" });
    for (const opts of [
      { firstName: "Visitor", role: "visitor" as const },
      { firstName: "Pending", profileStatus: "pending_verification" as const },
      { firstName: "Gone", deleted: true },
      { firstName: "Bare", noProfile: true },
    ]) {
      as(await createPerson(t, opts));
      await expectMembersOnly(t.query(api.directory.list, {}));
      await expectMembersOnly(t.query(api.directory.getCard, { userId: target.userId }));
    }
  });
});

describe("who is in the list (AC-1, AC-3)", () => {
  it("lists only verified members, sorted, with the viewer pinned apart", async () => {
    const t = testConvex();
    const ids = await seed(t);
    const viewer = await createPerson(t, { firstName: "Andrew", sharing: true });
    await createPerson(t, { firstName: "zoe", lastName: "Bbosa" });
    await createPerson(t, { firstName: "Grace", lastName: "Nambi", clanId: ids.judah });
    await createPerson(t, { firstName: "Grace", lastName: "Akello" });
    await createPerson(t, { firstName: "Visitor", role: "visitor" });
    await createPerson(t, { firstName: "Pending", profileStatus: "pending_verification" });
    await createPerson(t, { firstName: "Gone", deleted: true });

    as(viewer);
    const result = await t.query(api.directory.list, {});
    expect(result.rows.map((r) => `${r.name.first} ${r.name.last}`)).toEqual([
      "Grace Akello",
      "Grace Nambi",
      "zoe Bbosa",
    ]);
    expect(result.self.userId).toBe(viewer.userId);
    expect(result.rows.some((r) => r.userId === viewer.userId)).toBe(false);
    expect(result.rows[1].clan).toEqual({ id: ids.judah, name: "Judah" });
    expect(result.departments.map((d) => d.name)).toEqual(["Choir", "Media"]);
  });

  it("shows active Areas of Service only, never a pending claim", async () => {
    const t = testConvex();
    const ids = await seed(t);
    const viewer = await createPerson(t, { firstName: "Andrew" });
    const grace = await createPerson(t, { firstName: "Grace" });
    await t.run(async (ctx) => {
      await ctx.db.insert("departmentMemberships", {
        userId: grace.userId,
        departmentId: ids.media,
        addedBy: grace.userId,
        status: "active",
      });
      await ctx.db.insert("departmentMemberships", {
        userId: grace.userId,
        departmentId: ids.choir,
        addedBy: grace.userId,
        status: "pending_claim",
      });
    });
    as(viewer);
    const { rows } = await t.query(api.directory.list, {});
    expect(rows[0].departmentIds).toEqual([ids.media]);
  });
});

describe("share to see (AC-7, AC-8, AC-11)", () => {
  it("between two sharers: a contact mark, occupation, and a full card", async () => {
    const t = testConvex();
    const a = await createPerson(t, { firstName: "Andrew", sharing: true });
    const b = await createPerson(t, { firstName: "Grace", sharing: true, phone: "0772 123 456" });
    as(a);

    const { rows, viewerSharing } = await t.query(api.directory.list, {});
    expect(viewerSharing).toBe(true);
    expect(rows[0].contactable).toBe(true);
    expect(rows[0].occupation).toBe("Engineer");
    // The list never carries contact details.
    expect(allKeys(rows).has("phone")).toBe(false);
    expect(allKeys(rows).has("email")).toBe(false);

    const card = await t.query(api.directory.getCard, { userId: b.userId });
    expect(card?.targetSharing).toBe(true);
    expect(card?.shared).toEqual({
      email: "grace@test.org",
      phone: { raw: "0772 123 456", dial: "+256772123456", whatsappDigits: "256772123456" },
      occupation: "Engineer",
      employer: "Umeme",
      shortBio: "Loves the choir",
      birthday: { day: 12, month: 3 },
    });
  });

  it("a sharing viewer gets no shared fields from a private member", async () => {
    const t = testConvex();
    const a = await createPerson(t, { firstName: "Andrew", sharing: true });
    const c = await createPerson(t, { firstName: "Cathy", sharing: false });
    as(a);
    const { rows } = await t.query(api.directory.list, {});
    expect(rows[0].contactable).toBeUndefined();
    expect(rows[0].occupation).toBeUndefined();
    const card = await t.query(api.directory.getCard, { userId: c.userId });
    expect(card?.targetSharing).toBe(false);
    expect(card && "shared" in card).toBe(false);
  });

  it("a private viewer sees no sharing indicator on anyone", async () => {
    const t = testConvex();
    const c = await createPerson(t, { firstName: "Cathy", sharing: false });
    const b = await createPerson(t, { firstName: "Grace", sharing: true });
    await createPerson(t, { firstName: "Hope", sharing: false });
    as(c);
    const { rows } = await t.query(api.directory.list, {});
    for (const row of rows) {
      expect("contactable" in row).toBe(false);
      expect("occupation" in row).toBe(false);
    }
    const card = await t.query(api.directory.getCard, { userId: b.userId });
    expect(card && "targetSharing" in card).toBe(false);
    expect(card && "shared" in card).toBe(false);
  });

  it("treats an absent flag as private on both sides (AC-17)", async () => {
    const t = testConvex();
    const absentViewer = await createPerson(t, { firstName: "Andrew" });
    const sharer = await createPerson(t, { firstName: "Grace", sharing: true });
    const absentTarget = await createPerson(t, { firstName: "Hope" });

    as(absentViewer);
    expect((await t.query(api.directory.list, {})).viewerSharing).toBe(false);
    const fromAbsent = await t.query(api.directory.getCard, { userId: sharer.userId });
    expect(fromAbsent && "shared" in fromAbsent).toBe(false);

    as(sharer);
    const toAbsent = await t.query(api.directory.getCard, { userId: absentTarget.userId });
    expect(toAbsent?.targetSharing).toBe(false);
    expect(toAbsent && "shared" in toAbsent).toBe(false);
  });

  it("always shows a member their own shared fields, even when private", async () => {
    const t = testConvex();
    const c = await createPerson(t, { firstName: "Cathy", sharing: false });
    as(c);
    const { self } = await t.query(api.directory.list, {});
    expect(self.occupation).toBe("Engineer");
    const card = await t.query(api.directory.getCard, { userId: c.userId });
    expect(card?.isSelf).toBe(true);
    expect(card?.targetSharing).toBe(false);
    expect(card?.shared?.email).toBe("cathy@test.org");
  });

  it("never sends the forbidden fields to anyone", async () => {
    const t = testConvex();
    const a = await createPerson(t, { firstName: "Andrew", sharing: true });
    const b = await createPerson(t, { firstName: "Grace", sharing: true });
    as(a);
    const list = await t.query(api.directory.list, {});
    const card = await t.query(api.directory.getCard, { userId: b.userId });
    const own = await t.query(api.directory.getCard, { userId: a.userId });
    for (const payload of [list, card, own]) {
      const keys = allKeys(payload);
      for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("refuses a phone it cannot normalize for WhatsApp but still dials it", async () => {
    const t = testConvex();
    const a = await createPerson(t, { firstName: "Andrew", sharing: true });
    const b = await createPerson(t, { firstName: "Grace", sharing: true, phone: "12345" });
    as(a);
    const card = await t.query(api.directory.getCard, { userId: b.userId });
    expect(card?.shared?.phone).toEqual({ raw: "12345", dial: "12345" });
  });
});

describe("cards for people not in the directory (AC-14)", () => {
  it("returns null, never throws, for every kind of absent target", async () => {
    const t = testConvex();
    const viewer = await createPerson(t, { firstName: "Andrew", sharing: true });
    const targets = [
      await createPerson(t, { firstName: "Visitor", role: "visitor", sharing: true }),
      await createPerson(t, { firstName: "Pending", profileStatus: "pending_verification" }),
      await createPerson(t, { firstName: "SentBack", profileStatus: "sent_back" }),
      await createPerson(t, { firstName: "Gone", deleted: true, sharing: true }),
      await createPerson(t, { firstName: "Bare", noProfile: true }),
    ];
    const missing = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        authId: "test:missing",
        email: "missing@test.org",
        role: "member",
        profileCompleted: true,
      });
      await ctx.db.delete(id);
      return id;
    });
    as(viewer);
    for (const target of [...targets.map((p) => p.userId), missing]) {
      expect(await t.query(api.directory.getCard, { userId: target })).toBeNull();
    }
  });

  it("returns null for a malformed id or an id from another table", async () => {
    const t = testConvex();
    const ids = await seed(t);
    const viewer = await createPerson(t, { firstName: "Andrew" });
    as(viewer);
    expect(await t.query(api.directory.getCard, { userId: "not-an-id" })).toBeNull();
    expect(await t.query(api.directory.getCard, { userId: ids.media })).toBeNull();
  });

  it("resolves the card's own Areas of Service names in department order", async () => {
    const t = testConvex();
    const ids = await seed(t);
    const viewer = await createPerson(t, { firstName: "Andrew" });
    const grace = await createPerson(t, { firstName: "Grace" });
    await t.run(async (ctx) => {
      for (const departmentId of [ids.media, ids.choir]) {
        await ctx.db.insert("departmentMemberships", {
          userId: grace.userId,
          departmentId,
          addedBy: grace.userId,
          status: "active",
        });
      }
    });
    as(viewer);
    const card = await t.query(api.directory.getCard, { userId: grace.userId });
    expect(card?.areas.map((a) => a.name)).toEqual(["Choir", "Media"]);
  });
});
