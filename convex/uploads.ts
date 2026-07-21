import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { requireUser } from "./lib/authz";

// One shared R2 upload utility (docs/DATA_MODEL.md, Increment 4 — "Media
// uploads"). Used by the mobile mentorship/leadership certificate upload flow
// and by the Church Admin facility-image upload — both go through the same
// generateUploadUrl → PUT → syncMetadata → getFileUrl round trip rather than
// growing separate implementations.

const r2 = new R2(components.r2);

/**
 * `generateUploadUrl` + `syncMetadata`, gated to any authenticated session —
 * any signed-in user may request an upload slot (a visitor submitting
 * mentorship proof has no role assignment yet). What the resulting file gets
 * attached to is authorized separately by the mutation that stores its URL
 * (`submitProfile`, `verifyProfile`, `updateFacility`, ...).
 */
export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
});

/** Resolve an uploaded object's key into a fetchable URL. */
export const getFileUrl = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireUser(ctx);
    return await r2.getUrl(key);
  },
});
