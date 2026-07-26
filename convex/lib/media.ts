import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";

// Shared media-URL resolver. Uploaded files are stored as R2 object KEYS (see
// convex/uploads.ts + docs/STORAGE.md); this turns a stored value into a
// display-ready URL at query time, so client display code never has to know
// whether a value is a key or a URL.
//
// Absolute http(s) values pass through untouched — legacy/seeded covers
// (Unsplash), Google avatar URLs, and any externally hosted image keep working,
// and a field can hold either form during and after migration to R2.

const r2 = new R2(components.r2);

// Content images live in a reactive feed that may stay mounted for a while
// without the query re-running, so a long-lived signed URL avoids the image
// 403-ing mid-session. These are public church content, so a multi-day link is
// acceptable. (Private profile/proof objects keep the short default expiry via
// api.uploads.getFileUrl.)
const CONTENT_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — R2's max

/** Resolve a stored media value (R2 key or absolute URL) to a display URL. */
export async function resolveMediaUrl(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value; // external / legacy absolute URL
  return await r2.getUrl(value, { expiresIn: CONTENT_URL_TTL_SECONDS });
}

/**
 * Resolve `coverImageUrl` on every row of a list, leaving all other fields
 * intact. For the content feeds (themes, events, programs, announcements,
 * calendar) whose rows share that field name.
 */
export async function resolveCoverUrls<T extends { coverImageUrl?: string }>(
  rows: T[]
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      coverImageUrl: await resolveMediaUrl(row.coverImageUrl),
    }))
  );
}
