// The website API's request plumbing (spec 0026): API keys, request
// signatures, JSON responses and the announcement payload. Pure functions
// over Web Crypto and plain values, so every rule here is unit tested without
// a deployment (convex/websiteApi.test.ts).
//
// Conventions mirror the website's own /api/v1 so its developer meets nothing
// new: an `X-Api-Key` header checked against a comma separated env list, fail
// closed when unset, JSON for every answer including errors.

import { ANNOUNCEMENT_CATEGORIES, isAnnouncementCategory } from "@klt-cyber/shared";

/** Env var: comma separated keys the website may send in `X-Api-Key`. */
export const API_KEYS_ENV = "KLT_WEBSITE_API_KEYS";
/** Env var: the shared secret behind `X-Klt-Signature` on POST requests. */
export const SIGNING_SECRET_ENV = "KLT_WEBSITE_SIGNING_SECRET";

/** How far a signed request's timestamp may sit from our clock, either way. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;
/** The largest POST body accepted, in bytes. An announcement is far smaller. */
export const MAX_BODY_BYTES = 64 * 1024;

export const ANNOUNCEMENT_LIMITS = {
  externalId: 64,
  title: 200,
  body: 10_000,
  links: 10,
  linkLabel: 100,
  url: 2048,
} as const;

/** Without `ends_at`, an announcement shows for this long from its start. */
export const DEFAULT_ANNOUNCEMENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Responses ────────────────────────────────────────────────────────────────

export type ErrorCode =
  | "not_configured"
  | "unauthorized"
  | "bad_signature"
  | "stale_request"
  | "payload_too_large"
  | "invalid_json"
  | "validation_failed"
  | "unsupported_audience"
  | "not_found"
  | "internal_error";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Every answer is per caller and some carry figures, so nothing in between
  // should keep a copy. The website caches on its own side.
  "Cache-Control": "no-store",
};

export function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details?: FieldError[]
): Response {
  return jsonResponse(status, {
    error: { code, message, ...(details && details.length ? { details } : {}) },
  });
}

// ── API keys ─────────────────────────────────────────────────────────────────

/** The configured keys: trimmed, empties dropped. Empty list = not configured. */
export function parseApiKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Compares two equal length byte arrays without stopping at the first difference. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Whether `presented` is one of `keys`. Compares SHA-256 digests, so the
 * time taken says nothing about how much of a key matched or how long the
 * real one is. Checks every key rather than returning at the first match.
 */
export async function isValidApiKey(
  presented: string | null,
  keys: string[]
): Promise<boolean> {
  if (!presented || keys.length === 0) return false;
  const presentedDigest = await sha256(presented.trim());
  let matched = false;
  for (const key of keys) {
    if (sameBytes(presentedDigest, await sha256(key))) matched = true;
  }
  return matched;
}

// ── Request signatures ───────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/**
 * The signature a sender puts in `X-Klt-Signature`: `sha256=` and the hex
 * HMAC-SHA256 of `<timestamp>.<raw body>` under the shared secret. Used by the
 * tests and documented for the website; the server only ever verifies.
 */
export async function signRequest(
  secret: string,
  timestamp: string,
  rawBody: string
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(`${timestamp}.${rawBody}`)
  );
  return `sha256=${bytesToHex(new Uint8Array(signature))}`;
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; code: "bad_signature" | "stale_request"; message: string };

/**
 * Checks `X-Klt-Timestamp` and `X-Klt-Signature` against the raw body.
 *
 * The timestamp is inside what is signed, and must be within
 * SIGNATURE_TOLERANCE_SECONDS of `nowMs`, so a captured request cannot be
 * replayed later. Inside that window a replay of the latest request changes
 * nothing (the receiving mutation is keyed on the website's id), and a replay
 * of an older one is refused when it carries `updated_at` (AC-18).
 * `crypto.subtle.verify` does the comparison, in constant time.
 */
export async function verifySignature(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs: number;
}): Promise<SignatureCheck> {
  const { secret, timestamp, signature, rawBody, nowMs } = params;
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) {
    return {
      ok: false,
      code: "stale_request",
      message: "X-Klt-Timestamp must be the current time in Unix seconds.",
    };
  }
  const skew = Math.abs(nowMs / 1000 - Number(timestamp));
  if (skew > SIGNATURE_TOLERANCE_SECONDS) {
    return {
      ok: false,
      code: "stale_request",
      message: `X-Klt-Timestamp is more than ${SIGNATURE_TOLERANCE_SECONDS} seconds from the server's clock.`,
    };
  }
  const match = signature?.trim().match(/^sha256=([0-9a-fA-F]{64})$/);
  const bytes = match ? hexToBytes(match[1]) : null;
  if (!bytes) {
    return {
      ok: false,
      code: "bad_signature",
      message: "X-Klt-Signature must be sha256= followed by 64 hex characters.",
    };
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    bytes,
    encoder.encode(`${timestamp}.${rawBody}`)
  );
  return valid
    ? { ok: true }
    : {
        ok: false,
        code: "bad_signature",
        message: "X-Klt-Signature does not match the body and timestamp.",
      };
}

// ── The announcement payload ─────────────────────────────────────────────────

export type FieldError = { field: string; message: string };

export type AnnouncementPayload =
  | {
      kind: "publish";
      externalId: string;
      title: string;
      body: string;
      priority?: "low" | "normal" | "high";
      category?: string;
      coverImageUrl?: string;
      links?: { label: string; url: string }[];
      startDate: number;
      endDate: number;
      /** The website's last edit time, when sent: orders out of order requests. */
      sourceUpdatedAt?: number;
      dryRun: boolean;
      /** Fields we accepted but could not use, reported back to the sender. */
      warnings: string[];
    }
  | {
      kind: "withdraw";
      externalId: string;
      sourceUpdatedAt?: number;
      dryRun: boolean;
      warnings: string[];
    };

export type ParseResult =
  | { ok: true; value: AnnouncementPayload }
  | { ok: false; code: "validation_failed" | "unsupported_audience"; errors: FieldError[] };

/** The audiences this version delivers. The website's names, not ours. */
export const SUPPORTED_AUDIENCES = ["everyone"] as const;

function isHttpsUrl(value: string): boolean {
  if (value.length > ANNOUNCEMENT_LIMITS.url) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** ISO 8601 with an explicit offset or `Z`, so no clock's zone is guessed. */
function parseInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function requiredText(
  input: Record<string, unknown>,
  field: string,
  max: number,
  errors: FieldError[]
): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ field, message: "Required, as non-empty text." });
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field, message: `At most ${max} characters.` });
  }
  return trimmed;
}

/**
 * Reads and checks a `POST /api/v1/announcements` body.
 *
 * `status` is `published` (create or update) or `withdrawn` (take it down).
 * A withdrawal needs only `id`. Every error is collected, not just the first,
 * so the sender fixes the payload in one round.
 */
export function parseAnnouncementPayload(input: unknown, nowMs: number): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      code: "validation_failed",
      errors: [{ field: "(body)", message: "Must be a JSON object." }],
    };
  }
  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  const warnings: string[] = [];

  const rawId = body.id;
  let externalId = "";
  if (typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId >= 0) {
    externalId = String(rawId);
  } else if (typeof rawId === "string" && /^[A-Za-z0-9_-]+$/.test(rawId.trim())) {
    externalId = rawId.trim();
  } else {
    errors.push({ field: "id", message: "Required: the website's announcement id (a number or text of letters, digits, - and _)." });
  }
  if (externalId.length > ANNOUNCEMENT_LIMITS.externalId) {
    errors.push({ field: "id", message: `At most ${ANNOUNCEMENT_LIMITS.externalId} characters.` });
  }

  const dryRun = body.dry_run === true;
  if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") {
    errors.push({ field: "dry_run", message: "Must be true or false." });
  }

  const status = body.status ?? "published";
  if (status !== "published" && status !== "withdrawn") {
    errors.push({ field: "status", message: 'Must be "published" or "withdrawn".' });
  }

  let sourceUpdatedAt: number | undefined;
  if (body.updated_at !== undefined && body.updated_at !== null) {
    const parsed = parseInstant(body.updated_at);
    if (parsed === null) {
      errors.push({ field: "updated_at", message: "Must be ISO 8601 with a zone, e.g. 2026-11-19T09:00:00Z." });
    } else {
      sourceUpdatedAt = parsed;
    }
  }

  if (status === "withdrawn") {
    if (errors.length) return { ok: false, code: "validation_failed", errors };
    return {
      ok: true,
      value: {
        kind: "withdraw",
        externalId,
        ...(sourceUpdatedAt !== undefined ? { sourceUpdatedAt } : {}),
        dryRun,
        warnings,
      },
    };
  }

  // Collected like every other field (AC-12). The code says `unsupported_audience`
  // only when it is the one thing wrong, so the sender still sees every error.
  const audience = body.audience ?? "everyone";
  const audienceUnsupported = !(SUPPORTED_AUDIENCES as readonly unknown[]).includes(audience);
  if (audienceUnsupported) {
    errors.push({
      field: "audience",
      message: `Only ${SUPPORTED_AUDIENCES.map((a) => `"${a}"`).join(", ")} is delivered in this version.`,
    });
  }

  const title = requiredText(body, "title", ANNOUNCEMENT_LIMITS.title, errors);
  const text = requiredText(body, "body", ANNOUNCEMENT_LIMITS.body, errors);

  let priority: "low" | "normal" | "high" | undefined;
  if (body.priority !== undefined && body.priority !== null) {
    if (body.priority === "low" || body.priority === "normal" || body.priority === "high") {
      priority = body.priority;
    } else {
      errors.push({ field: "priority", message: 'Must be "low", "normal" or "high".' });
    }
  }

  // An unknown category is not an error: the website's list may differ from
  // ours, and the announcement is still worth delivering. It is dropped and
  // reported, so the two lists can be reconciled.
  let category: string | undefined;
  if (typeof body.category === "string" && body.category.trim() !== "") {
    const trimmed = body.category.trim().toLowerCase();
    if (isAnnouncementCategory(trimmed)) {
      category = trimmed;
    } else {
      warnings.push(
        `category "${body.category}" is not one of ${ANNOUNCEMENT_CATEGORIES.join(", ")}, so it was left out.`
      );
    }
  }

  let coverImageUrl: string | undefined;
  if (body.image_url !== undefined && body.image_url !== null) {
    if (typeof body.image_url === "string" && isHttpsUrl(body.image_url)) {
      coverImageUrl = body.image_url;
    } else {
      errors.push({ field: "image_url", message: "Must be an https URL." });
    }
  }

  let links: { label: string; url: string }[] | undefined;
  if (body.links !== undefined && body.links !== null) {
    if (!Array.isArray(body.links) || body.links.length > ANNOUNCEMENT_LIMITS.links) {
      errors.push({ field: "links", message: `Must be a list of at most ${ANNOUNCEMENT_LIMITS.links} links.` });
    } else {
      links = [];
      body.links.forEach((link: unknown, i: number) => {
        const item = (link ?? {}) as Record<string, unknown>;
        const label = typeof item.label === "string" ? item.label.trim() : "";
        const url = typeof item.url === "string" ? item.url.trim() : "";
        if (!label || label.length > ANNOUNCEMENT_LIMITS.linkLabel) {
          errors.push({ field: `links[${i}].label`, message: `Required, at most ${ANNOUNCEMENT_LIMITS.linkLabel} characters.` });
        }
        if (!isHttpsUrl(url)) {
          errors.push({ field: `links[${i}].url`, message: "Must be an https URL." });
        }
        links!.push({ label, url });
      });
    }
  }

  let startDate = nowMs;
  if (body.starts_at !== undefined && body.starts_at !== null) {
    const parsed = parseInstant(body.starts_at);
    if (parsed === null) {
      errors.push({ field: "starts_at", message: "Must be ISO 8601 with a zone, e.g. 2026-11-20T09:00:00+03:00." });
    } else {
      startDate = parsed;
    }
  }
  let endDate = startDate + DEFAULT_ANNOUNCEMENT_DAYS * DAY_MS;
  if (body.ends_at !== undefined && body.ends_at !== null) {
    const parsed = parseInstant(body.ends_at);
    if (parsed === null) {
      errors.push({ field: "ends_at", message: "Must be ISO 8601 with a zone, e.g. 2026-12-20T23:59:00+03:00." });
    } else {
      endDate = parsed;
    }
  }
  if (endDate < startDate) {
    errors.push({ field: "ends_at", message: "Must be on or after starts_at." });
  }

  if (errors.length) {
    return {
      ok: false,
      code: audienceUnsupported && errors.length === 1 ? "unsupported_audience" : "validation_failed",
      errors,
    };
  }
  return {
    ok: true,
    value: {
      kind: "publish",
      externalId,
      title,
      body: text,
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      ...(coverImageUrl ? { coverImageUrl } : {}),
      ...(links && links.length ? { links } : {}),
      startDate,
      endDate,
      ...(sourceUpdatedAt !== undefined ? { sourceUpdatedAt } : {}),
      dryRun,
      warnings,
    },
  };
}
