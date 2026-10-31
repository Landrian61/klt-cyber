import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import { internalAction, query } from "./_generated/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { requireUser, canManageChurchAdmin } from "./lib/authz";
import { reportError } from "./lib/sentry";

// The platform's shared storage service, backed by Cloudflare R2 through the
// `@convex-dev/r2` component. Provisioning and environment setup are documented
// in spec/STORAGE.md — the component reads R2_BUCKET / R2_ENDPOINT /
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

/**
 * Delete objects nothing points at any more (spec 0014, AC-18).
 *
 * Replacing a profile photo, a mentorship certificate or a leadership
 * certificate used to leave the old object in the bucket forever: nothing
 * pointed at it and nothing would ever clean it up, so the bucket grew by one
 * orphan per re-upload.
 *
 * An ACTION scheduled by the mutation doing the replacing, because a Convex
 * mutation cannot reach the bucket. The delete therefore runs strictly after
 * the new key has committed, which is the ordering we want anyway.
 *
 * Each key is caught on its own so one failure does not strand the rest, and
 * a failure is reported rather than swallowed. A FAILED delete leaves an
 * orphan object rather than a row pointing at nothing — the same tradeoff
 * spec 0008 chose for account deletion: bytes nobody references cost a little
 * storage, while a row pointing at a deleted file is a broken image on
 * somebody's screen with no way to fix it.
 *
 * Internal only. The public `deleteObject` above is Church Admin gated and
 * reaches any object in the bucket; this one is called by a mutation that has
 * already established the object was the caller's own.
 */
export const deleteReplacedObjects = internalAction({
  args: { keys: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { keys }) => {
    for (const key of keys) {
      try {
        await r2.deleteObject(ctx, key);
      } catch (error) {
        console.error(`uploads: could not delete replaced object ${key}`, error);
        await reportError(ctx, error, {
          fn: "uploads.deleteReplacedObjects",
        });
      }
    }
    return null;
  },
});
