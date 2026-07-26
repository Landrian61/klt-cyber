import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { requireUser, canManageChurchAdmin } from "./lib/authz";

// The platform's shared storage service, backed by Cloudflare R2 through the
// `@convex-dev/r2` component. Provisioning and environment setup are documented
// in docs/STORAGE.md — the component reads R2_BUCKET / R2_ENDPOINT /
// R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (and R2_TOKEN) from the Convex
// deployment env, so no credentials live in the client bundle.
//
// Every feature that stores files — profile photos, mentorship/leadership
// proofs, Church Admin facility images, and future media — goes through this
// single auth-gated gateway rather than talking to R2 directly. The round trip:
//
//   generateUploadUrl()   → { key, url }          (mutation)
//   PUT the bytes to `url`                          (client, direct to R2)
//   syncMetadata({ key })                           (mutation — records the object)
//   getFileUrl / getMetadata → short-lived URL      (query — at display time)
//
// The durable value stored on documents is the object KEY, never a signed URL:
// signed URLs expire, so the URL is re-derived from the key when it's shown.

const r2 = new R2(components.r2);

/**
 * Client storage API, wired with authorization:
 *  - `generateUploadUrl` / `syncMetadata` / `getMetadata` (single key): any
 *    authenticated session. A visitor submitting mentorship proof has no role
 *    yet, so upload can't require one — what an uploaded key gets *attached* to
 *    is authorized separately by the mutation that stores it (`submitProfile`,
 *    `verifyProfile`, `updateFacility`, ...).
 *  - `listMetadata` (whole bucket) / `deleteObject`: Church Admin only, since
 *    both reach across every object in the bucket.
 */
export const {
  generateUploadUrl,
  syncMetadata,
  getMetadata,
  listMetadata,
  deleteObject,
} = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
  checkReadKey: async (ctx) => {
    await requireUser(ctx);
  },
  checkReadBucket: async (ctx) => {
    await canManageChurchAdmin(ctx);
  },
  checkDelete: async (ctx) => {
    await canManageChurchAdmin(ctx);
  },
});

/**
 * Resolve an uploaded object's key into a short-lived signed URL for display.
 * A thin convenience over `getMetadata` for callers that only need the URL
 * string. Any authenticated session may resolve a key it holds.
 */
export const getFileUrl = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireUser(ctx);
    return await r2.getUrl(key);
  },
});
