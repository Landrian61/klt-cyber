import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pushNotificationsTest from "@convex-dev/expo-push-notifications/test";
import { testConvex as baseTestConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  DEFAULT_ANNOUNCEMENT_DAYS,
  isValidApiKey,
  parseAnnouncementPayload,
  parseApiKeys,
  signRequest,
  verifySignature,
} from "./lib/websiteApi";

// The website API (spec 0026). The pure rules are tested directly; the routes
// go through `t.fetch`, which runs the real http router, key check included.

const KEY = "test-key-staging";
const SECRET = "test-signing-secret";

function testConvex() {
  const t = baseTestConvex();
  pushNotificationsTest.register(t);
  return t;
}
type T = ReturnType<typeof testConvex>;

beforeEach(() => {
  vi.stubEnv("KLT_WEBSITE_API_KEYS", `other-key, ${KEY}`);
  vi.stubEnv("KLT_WEBSITE_SIGNING_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const now = Date.now();

// ── Pure rules ───────────────────────────────────────────────────────────────

describe("API keys (AC-2, AC-3)", () => {
  it("reads a comma separated list, dropping blanks", () => {
    expect(parseApiKeys(" a, ,b ,")).toEqual(["a", "b"]);
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys("")).toEqual([]);
  });

  it("accepts any configured key and nothing else", async () => {
    expect(await isValidApiKey("b", ["a", "b"])).toBe(true);
    expect(await isValidApiKey("c", ["a", "b"])).toBe(false);
    expect(await isValidApiKey(null, ["a"])).toBe(false);
    expect(await isValidApiKey("a", [])).toBe(false);
  });
});

describe("request signatures (AC-4)", () => {
  const body = '{"id":1}';
  const ts = String(Math.floor(now / 1000));

  it("accepts its own signature", async () => {
    const signature = await signRequest(SECRET, ts, body);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(await verifySignature({ secret: SECRET, timestamp: ts, signature, rawBody: body, nowMs: now })).toEqual({ ok: true });
  });

  it("refuses a changed body, a wrong secret and a malformed header", async () => {
    const signature = await signRequest(SECRET, ts, body);
    const changed = await verifySignature({ secret: SECRET, timestamp: ts, signature, rawBody: '{"id":2}', nowMs: now });
    expect(changed).toMatchObject({ ok: false, code: "bad_signature" });
    const wrongSecret = await verifySignature({ secret: "nope", timestamp: ts, signature, rawBody: body, nowMs: now });
    expect(wrongSecret).toMatchObject({ ok: false, code: "bad_signature" });
    const malformed = await verifySignature({ secret: SECRET, timestamp: ts, signature: "abc", rawBody: body, nowMs: now });
    expect(malformed).toMatchObject({ ok: false, code: "bad_signature" });
  });

  it("refuses a timestamp more than five minutes off, or missing", async () => {
    const old = String(Math.floor(now / 1000) - 301);
    const signature = await signRequest(SECRET, old, body);
    expect(await verifySignature({ secret: SECRET, timestamp: old, signature, rawBody: body, nowMs: now })).toMatchObject({
      ok: false,
      code: "stale_request",
    });
    expect(await verifySignature({ secret: SECRET, timestamp: null, signature, rawBody: body, nowMs: now })).toMatchObject({
      ok: false,
      code: "stale_request",
    });
  });
});

describe("parseAnnouncementPayload (AC-12)", () => {
  it("reads a full payload", () => {
    const result = parseAnnouncementPayload(
      {
        id: 42,
        title: " Harvest Sunday ",
        body: "Bring a gift.",
        priority: "high",
        category: "Event",
        image_url: "https://kltchurch.org/img/harvest.jpg",
        links: [{ label: "Details", url: "https://kltchurch.org/harvest" }],
        starts_at: "2026-11-20T09:00:00+03:00",
        ends_at: "2026-11-30T21:00:00Z",
      },
      now
    );
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "publish",
        externalId: "42",
        title: "Harvest Sunday",
        body: "Bring a gift.",
        priority: "high",
        category: "event",
        coverImageUrl: "https://kltchurch.org/img/harvest.jpg",
        links: [{ label: "Details", url: "https://kltchurch.org/harvest" }],
        startDate: Date.parse("2026-11-20T06:00:00Z"),
        endDate: Date.parse("2026-11-30T21:00:00Z"),
        dryRun: false,
        warnings: [],
      },
    });
  });

  it("defaults the window to now plus thirty days", () => {
    const result = parseAnnouncementPayload({ id: "a-1", title: "T", body: "B" }, now);
    expect(result.ok && result.value.kind === "publish" && result.value.startDate).toBe(now);
    expect(result.ok && result.value.kind === "publish" && result.value.endDate).toBe(
      now + DEFAULT_ANNOUNCEMENT_DAYS * 86_400_000
    );
  });

  it("drops an unknown category with a warning instead of refusing", () => {
    const result = parseAnnouncementPayload({ id: 1, title: "T", body: "B", category: "youth" }, now);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "publish") {
      expect(result.value.category).toBeUndefined();
      expect(result.value.warnings).toHaveLength(1);
    }
  });

  it("collects every field error at once", () => {
    const result = parseAnnouncementPayload(
      {
        title: "",
        body: 5,
        priority: "urgent",
        image_url: "http://insecure.example/x.jpg",
        links: [{ label: "", url: "ftp://x" }],
        starts_at: "2026-11-20 09:00",
      },
      now
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation_failed");
      expect(result.errors.map((e) => e.field).sort()).toEqual(
        ["body", "id", "image_url", "links[0].label", "links[0].url", "priority", "starts_at", "title"].sort()
      );
    }
  });

  it("refuses an end before the start", () => {
    const result = parseAnnouncementPayload(
      { id: 1, title: "T", body: "B", starts_at: "2026-11-20T09:00:00Z", ends_at: "2026-11-19T09:00:00Z" },
      now
    );
    expect(result).toMatchObject({ ok: false, errors: [{ field: "ends_at" }] });
  });

  it("refuses any audience but everyone, separately from field errors", () => {
    const result = parseAnnouncementPayload({ id: 1, title: "T", body: "B", audience: "graduates" }, now);
    expect(result).toMatchObject({ ok: false, code: "unsupported_audience" });
  });

  it("reports an unsupported audience alongside every other field error", () => {
    const result = parseAnnouncementPayload({ id: 1, title: "", body: "B", audience: "members" }, now);
    expect(result).toMatchObject({ ok: false, code: "validation_failed" });
    if (!result.ok) expect(result.errors.map((e) => e.field).sort()).toEqual(["audience", "title"]);
  });

  it("reads updated_at on a publish and a withdrawal, and refuses a malformed one", () => {
    const published = parseAnnouncementPayload({ id: 1, title: "T", body: "B", updated_at: "2026-11-19T09:00:00Z" }, now);
    expect(published.ok && published.value.sourceUpdatedAt).toBe(Date.parse("2026-11-19T09:00:00Z"));
    const withdrawn = parseAnnouncementPayload({ id: 1, status: "withdrawn", updated_at: "2026-11-19T10:00:00Z" }, now);
    expect(withdrawn.ok && withdrawn.value.sourceUpdatedAt).toBe(Date.parse("2026-11-19T10:00:00Z"));
    expect(parseAnnouncementPayload({ id: 1, title: "T", body: "B", updated_at: "yesterday" }, now)).toMatchObject({
      ok: false,
      errors: [{ field: "updated_at" }],
    });
  });

  it("reads a withdrawal from its id alone", () => {
    expect(parseAnnouncementPayload({ id: 7, status: "withdrawn" }, now)).toEqual({
      ok: true,
      value: { kind: "withdraw", externalId: "7", dryRun: false, warnings: [] },
    });
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────

function get(t: T, path: string, key: string | null = KEY) {
  return t.fetch(path, { method: "GET", headers: key ? { "X-Api-Key": key } : {} });
}

async function post(t: T, body: unknown, opts: { key?: string; secret?: string; timestamp?: number } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = String(Math.floor((opts.timestamp ?? Date.now()) / 1000));
  return t.fetch("/api/v1/announcements", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": opts.key ?? KEY,
      "X-Klt-Timestamp": ts,
      "X-Klt-Signature": await signRequest(opts.secret ?? SECRET, ts, raw),
    },
    body: raw,
  });
}

describe("the key gate (AC-2, AC-3)", () => {
  it("answers 503 on a deployment with no keys set", async () => {
    vi.stubEnv("KLT_WEBSITE_API_KEYS", "");
    const response = await get(testConvex(), "/api/v1/ping");
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
  });

  it("answers 401 for a missing or wrong key", async () => {
    const t = testConvex();
    expect((await get(t, "/api/v1/ping", null)).status).toBe(401);
    const wrong = await get(t, "/api/v1/ping", "guess");
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error.code).toBe("unauthorized");
  });

  it("pings with a valid key", async () => {
    const response = await get(testConvex(), "/api/v1/ping");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect((await response.json()).data).toMatchObject({ ok: true, signing_configured: true });
  });

  it("answers an unknown path with a JSON 404", async () => {
    const response = await get(testConvex(), "/api/v1/members");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("answers any other method under /api/v1/ with a JSON 404 (AC-1)", async () => {
    const t = testConvex();
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const response = await t.fetch("/api/v1/announcements", { method, headers: { "X-Api-Key": KEY } });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    }
  });
});

async function seedChurch(t: T) {
  return await t.run(async (ctx) => {
    const media = await ctx.db.insert("departments", { name: "Media", order: 1, description: "Sound and screens" });
    const education = await ctx.db.insert("departments", { name: "Education", order: 2 });
    const judah = await ctx.db.insert("clans", { name: "Judah", order: 1 });
    const levi = await ctx.db.insert("clans", { name: "Levi", order: 2 });

    async function person(profileStatus: "verified" | "pending_verification", clanId?: Id<"clans">, deleted = false) {
      const userId = await ctx.db.insert("users", {
        authId: `test:${crypto.randomUUID()}`,
        email: `${crypto.randomUUID()}@test.org`,
        role: "member",
        profileCompleted: true,
        ...(deleted ? { deletedAt: now } : {}),
      });
      await ctx.db.insert("memberProfiles", {
        userId,
        firstName: "Secret",
        lastName: "Name",
        phone: "+256700000000",
        sex: "female",
        maritalStatus: "single",
        mentorshipStatus: "completed",
        profileStatus,
        ...(clanId ? { clanId } : {}),
        createdAt: now,
        updatedAt: now,
      });
      return userId;
    }

    const a = await person("verified", judah);
    const b = await person("verified", judah);
    const c = await person("verified"); // no clan yet
    const pending = await person("pending_verification", judah);
    const gone = await person("verified", levi, true);

    const seat = (userId: Id<"users">, departmentId: Id<"departments">, status: "active" | "removed" | "pending_claim" = "active") =>
      ctx.db.insert("departmentMemberships", { userId, departmentId, addedBy: userId, status });
    await seat(a, media);
    await seat(a, media); // a duplicate row counts once
    await seat(b, media, "removed");
    await seat(c, media, "pending_claim");
    await seat(pending, media); // unverified people never count
    await seat(gone, media);
    await seat(c, education);

    return { media, education, judah, levi };
  });
}

describe("GET /api/v1/departments (AC-9)", () => {
  it("lists departments in order with slugs, and nobody's details", async () => {
    const t = testConvex();
    const { media } = await seedChurch(t);
    const body = await (await get(t, "/api/v1/departments")).json();
    expect(body.data).toEqual([
      { id: media, name: "Media", slug: "media", description: "Sound and screens", order: 1, paused: false },
      expect.objectContaining({ name: "Education", slug: "education", description: null, paused: true }),
    ]);
  });
});

describe("GET /api/v1/figures (AC-6 to AC-8)", () => {
  it("counts verified, living members by clan and department, each person once", async () => {
    const t = testConvex();
    const { media, education, judah, levi } = await seedChurch(t);
    const response = await get(t, "/api/v1/figures");
    expect(response.status).toBe(200);
    const raw = await response.text();
    const { data } = JSON.parse(raw);

    expect(data.members).toEqual({ verified: 3 });
    expect(data.clans).toEqual([
      { id: judah, name: "Judah", verified: 2 },
      { id: levi, name: "Levi", verified: 0 },
    ]);
    expect(data.departments).toEqual([
      { id: media, name: "Media", slug: "media", serving: 1, paused: false },
      { id: education, name: "Education", slug: "education", serving: 1, paused: true },
    ]);
    expect(Date.parse(data.as_of)).not.toBeNaN();
    // Counts only: nothing personal is anywhere in the body.
    expect(raw).not.toMatch(/Secret|Name|\+256|@test\.org|users/);
  });

  it("serves the stored snapshot until the cron refreshes it", async () => {
    const t = testConvex();
    await seedChurch(t);
    const first = (await (await get(t, "/api/v1/figures")).json()).data;

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { authId: "x", email: "x@test.org", role: "member", profileCompleted: true });
      await ctx.db.insert("memberProfiles", {
        userId, firstName: "N", lastName: "M", sex: "male", maritalStatus: "single",
        mentorshipStatus: "completed", profileStatus: "verified", createdAt: now, updatedAt: now,
      });
    });
    expect((await (await get(t, "/api/v1/figures")).json()).data.members.verified).toBe(first.members.verified);

    await t.mutation(internal.websiteApi.refreshFigures, {});
    expect((await (await get(t, "/api/v1/figures")).json()).data.members.verified).toBe(first.members.verified + 1);
    expect(await t.run(async (ctx) => (await ctx.db.query("websiteFigures").collect()).length)).toBe(1);
  });
});

describe("POST /api/v1/announcements (AC-4, AC-10 to AC-15)", () => {
  const announcement = { id: 101, title: "Harvest Sunday", body: "Bring a gift.", category: "event" };

  async function websiteRows(t: T) {
    return await t.run(async (ctx) =>
      (await ctx.db.query("announcements").collect()).filter((a) => a.source === "website")
    );
  }
  async function pushes(t: T) {
    return await t.run(async (ctx) => (await ctx.db.query("notifications").collect()).length);
  }

  it("refuses a bad signature, a stale request and a missing secret", async () => {
    const t = testConvex();
    const badSig = await post(t, announcement, { secret: "wrong" });
    expect(badSig.status).toBe(401);
    expect((await badSig.json()).error.code).toBe("bad_signature");

    const stale = await post(t, announcement, { timestamp: Date.now() - 10 * 60_000 });
    expect((await stale.json()).error.code).toBe("stale_request");

    vi.stubEnv("KLT_WEBSITE_SIGNING_SECRET", "");
    expect((await post(t, announcement)).status).toBe(503);
    expect(await websiteRows(t)).toHaveLength(0);
  });

  it("answers 400 for broken JSON and 422 with every field error", async () => {
    const t = testConvex();
    expect((await post(t, "{not json")).status).toBe(400);
    const invalid = await post(t, { id: 1, title: "" });
    expect(invalid.status).toBe(422);
    const body = await invalid.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details.map((d: { field: string }) => d.field)).toEqual(["title", "body"]);
    const audience = await post(t, { ...announcement, audience: "ministry" });
    expect(audience.status).toBe(422);
    expect((await audience.json()).error.code).toBe("unsupported_audience");
  });

  it("creates the row once and pushes once, however often it is sent", async () => {
    const t = testConvex();
    const first = await post(t, announcement);
    expect(first.status).toBe(200);
    const created = await first.json();
    expect(created.data).toMatchObject({ id: "101", result: "created", pushed: true, dry_run: false });

    const again = await (await post(t, { ...announcement, title: "Harvest Sunday (updated)" })).json();
    expect(again.data).toMatchObject({ result: "updated", pushed: false, announcement_id: created.data.announcement_id });

    const rows = await websiteRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Harvest Sunday (updated)",
      status: "published",
      externalId: "101",
      category: "event",
    });
    expect(rows[0].createdBy).toBeUndefined();

    vi.useFakeTimers();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await pushes(t)).toBe(1);
  });

  it("withdraws to draft, republishes without a second push, and 404s an unknown id", async () => {
    const t = testConvex();
    await post(t, announcement);
    const withdrawn = await (await post(t, { id: 101, status: "withdrawn" })).json();
    expect(withdrawn.data).toMatchObject({ result: "withdrawn", pushed: false });
    expect((await websiteRows(t))[0].status).toBe("draft");

    const back = await (await post(t, announcement)).json();
    expect(back.data).toMatchObject({ result: "updated", pushed: false });
    expect((await websiteRows(t))[0].status).toBe("published");

    const unknown = await post(t, { id: 999, status: "withdrawn" });
    expect(unknown.status).toBe(404);
  });

  it("ignores a request older than the last one applied (AC-18)", async () => {
    const t = testConvex();
    await post(t, { ...announcement, updated_at: "2026-11-19T09:00:00Z" });
    const withdrawn = await (await post(t, { id: 101, status: "withdrawn", updated_at: "2026-11-19T10:00:00Z" })).json();
    expect(withdrawn.data.result).toBe("withdrawn");

    // The retried publish from 09:00 lands after the 10:00 withdrawal.
    const late = await (await post(t, { ...announcement, title: "Old", updated_at: "2026-11-19T09:00:00Z" })).json();
    expect(late.data).toMatchObject({ result: "superseded", pushed: false });
    const [row] = await websiteRows(t);
    expect(row).toMatchObject({ status: "draft", title: "Harvest Sunday" });

    // A newer publish still goes through.
    const newer = await (await post(t, { ...announcement, updated_at: "2026-11-19T11:00:00Z" })).json();
    expect(newer.data.result).toBe("updated");
    expect((await websiteRows(t))[0].status).toBe("published");
  });

  it("writes nothing on a dry run but says what would happen", async () => {
    const t = testConvex();
    const dry = await (await post(t, { ...announcement, dry_run: true })).json();
    expect(dry.data).toMatchObject({ result: "created", pushed: true, dry_run: true, announcement_id: null });
    expect(await websiteRows(t)).toHaveLength(0);
  });

  it("reports an unknown category as a warning and still delivers", async () => {
    const t = testConvex();
    const body = await (await post(t, { ...announcement, category: "youth" })).json();
    expect(body.data.result).toBe("created");
    expect(body.warnings).toHaveLength(1);
    expect((await websiteRows(t))[0].category).toBeUndefined();
  });
});
