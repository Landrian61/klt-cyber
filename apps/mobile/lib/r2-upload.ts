import { useMutation } from 'convex/react';
import { api } from '@/lib/api';

/**
 * Client half of the shared R2 upload utility (docs/DATA_MODEL.md, Increment 4;
 * backend in convex/uploads.ts). The mobile profile wizard is the first
 * consumer — the photo, mentorship certificate, and leadership-proof slots all
 * go through this same round trip:
 *
 *   generateUploadUrl()  → { key, url }   (mutation)
 *   PUT the bytes to `url`
 *   syncMetadata({ key }) → records the object in the R2 component
 *
 * We store and return the **key**, not a signed URL: signed URLs expire, so the
 * durable value in `memberProfiles` is the key, resolved to a fetchable URL at
 * display time via `api.uploads.getFileUrl` (see convex/uploads.ts).
 *
 * `@convex-dev/r2/react`'s `useUploadFile` expects a browser `File`, which React
 * Native doesn't have — so we drive the same three calls by hand, sending a Blob
 * read from the local file URI the image picker returns.
 */
export function useR2Upload() {
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const syncMetadata = useMutation(api.uploads.syncMetadata);

  /**
   * Upload a local file (an image-picker URI) to R2 and return its object key.
   * Throws on any failed step so callers can surface a retry.
   */
  return async function upload(
    localUri: string,
    contentType = 'image/jpeg',
  ): Promise<string> {
    const { key, url } = await generateUploadUrl();

    // Read the local file into a Blob for the raw PUT body. A presigned R2/S3
    // PUT takes the object bytes directly — not multipart/form-data.
    const fileRes = await fetch(localUri);
    const blob = await fileRes.blob();

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed (${putRes.status})`);
    }

    await syncMetadata({ key });
    return key;
  };
}
