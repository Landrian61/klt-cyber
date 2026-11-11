"use node";

import { randomUUID } from "node:crypto";
import { ConvexError, v } from "convex/values";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  RADIO_RECORDING_MAX_BYTES,
  RADIO_RECORDING_PART_SIZE_BYTES,
  RADIO_RECORDING_SIGN_BATCH,
  isRadioAudioContentType,
  isRadioRecordingKeyFor,
  radioRecordingKeyPrefix,
  radioRecordingPartCount,
  type RadioErrorCode,
} from "@klt-cyber/shared";
import { reportError } from "./lib/sentry";

/**
 * Recording uploads, the storage side (spec 0019, AC-24 to AC-26).
 *
 * A resumable multipart upload straight from the browser to R2, in 8 MiB
 * parts, over the S3 API. The `@convex-dev/r2` component does not expose
 * multipart, so this file uses `@aws-sdk/client-s3` directly with the four
 * `R2_*` variables the deployment already holds (spec 0019, Configuration).
 *
 * The round trip:
 *
 *   startUpload   → uploadId, key, the first batch of signed part urls
 *   PUT each part to its url (browser, direct to R2, reading each ETag)
 *   signParts     → more part urls, ten at a time
 *   listParts     → which parts storage already holds, for a resume
 *   completeUpload→ storage stitches the parts; the broadcast gets the key
 *   abortUpload   → storage drops the parts
 *
 * Every call re-checks `manageRadio` and the target rules through
 * `radioRecordings.checkUploadTarget`, and refuses a key outside
 * `radio/recordings/<broadcastId>/` (AC-25). Storage itself rejects an upload
 * id that does not belong to the key.
 *
 * Bucket prerequisite: CORS allowing PUT from the portal's origin with `ETag`
 * in the exposed headers, else the browser cannot read a part's etag.
 */

/** A part url stays valid long enough for a slow connection to send 8 MiB. */
const PART_URL_TTL_SECONDS = 60 * 60;

/** The highest part number a 500 MB file can need. */
const MAX_PART_NUMBER = radioRecordingPartCount(RADIO_RECORDING_MAX_BYTES);

function refuse(code: RadioErrorCode): never {
  throw new ConvexError({ code });
}

function storage() {
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

/** True for the S3 error storage returns for an upload id it does not hold. */
function isNoSuchUpload(error: unknown): boolean {
  const name = (error as { name?: string; Code?: string } | null)?.name;
  const code = (error as { Code?: string } | null)?.Code;
  return name === "NoSuchUpload" || code === "NoSuchUpload";
}

function isInvalidPart(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "InvalidPart" || name === "InvalidPartOrder" || name === "EntityTooSmall";
}

/** Authority plus the target rules, through the database side. */
async function checkTarget(ctx: ActionCtx, broadcastId: Id<"radioBroadcasts">) {
  return await ctx.runQuery(internal.radioRecordings.checkUploadTarget, {
    broadcastId,
    now: Date.now(),
  });
}

function checkKey(key: string, broadcastId: Id<"radioBroadcasts">) {
  if (!isRadioRecordingKeyFor(key, broadcastId)) refuse("RADIO_RECORDING_KEY_INVALID");
}

/** A file extension from the content type, only for a readable key. */
function extensionFor(contentType: string): string {
  const subtype = contentType.trim().toLowerCase().split("/")[1] ?? "";
  const known: Record<string, string> = {
    mpeg: "mp3",
    mp3: "mp3",
    mp4: "m4a",
    "x-m4a": "m4a",
    aac: "aac",
    ogg: "ogg",
    opus: "opus",
    wav: "wav",
    "x-wav": "wav",
    webm: "webm",
    flac: "flac",
  };
  return known[subtype] ?? "audio";
}

async function signPartUrls(
  client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumbers: number[]
) {
  return await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        client,
        new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: PART_URL_TTL_SECONDS }
      ),
    }))
  );
}

/**
 * Open a multipart upload for a finished broadcast (AC-24, AC-25, AC-26).
 * Refuses Super T, an unfinished broadcast, a file over 500 MB, anything not
 * `audio/*`, and a broadcast that already has a recording unless `replace`
 * says this is a deliberate replacement.
 */
export const startUpload = action({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    sizeBytes: v.number(),
    contentType: v.string(),
    durationSeconds: v.optional(v.number()),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { hasRecording } = await checkTarget(ctx, args.broadcastId);
    if (!Number.isFinite(args.sizeBytes) || args.sizeBytes <= 0) {
      refuse("RADIO_RECORDING_TOO_LARGE");
    }
    if (args.sizeBytes > RADIO_RECORDING_MAX_BYTES) refuse("RADIO_RECORDING_TOO_LARGE");
    if (!isRadioAudioContentType(args.contentType)) refuse("RADIO_RECORDING_TYPE_UNSUPPORTED");
    if (hasRecording && !args.replace) refuse("RADIO_RECORDING_EXISTS");

    const { client, bucket } = storage();
    const key = `${radioRecordingKeyPrefix(args.broadcastId)}${Date.now()}-${randomUUID()}.${extensionFor(args.contentType)}`;
    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: args.contentType.trim(),
      })
    );
    const uploadId = created.UploadId;
    if (!uploadId) throw new Error("Storage did not return an upload id");

    const partCount = radioRecordingPartCount(args.sizeBytes);
    const first = Array.from(
      { length: Math.min(RADIO_RECORDING_SIGN_BATCH, partCount) },
      (_, i) => i + 1
    );
    return {
      uploadId,
      key,
      partSize: RADIO_RECORDING_PART_SIZE_BYTES,
      partCount,
      urls: await signPartUrls(client, bucket, key, uploadId, first),
    };
  },
});

/**
 * Which parts storage already holds for an upload (AC-25). A resume asks
 * this rather than trusting what the browser remembers, so no part is sent
 * twice and none is skipped.
 */
export const listParts = action({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    uploadId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await checkTarget(ctx, args.broadcastId);
    checkKey(args.key, args.broadcastId);
    const { client, bucket } = storage();

    const parts: { partNumber: number; etag: string; sizeBytes: number }[] = [];
    let marker: string | undefined;
    try {
      for (;;) {
        const page = await client.send(
          new ListPartsCommand({
            Bucket: bucket,
            Key: args.key,
            UploadId: args.uploadId,
            ...(marker ? { PartNumberMarker: marker } : {}),
          })
        );
        for (const part of page.Parts ?? []) {
          if (part.PartNumber && part.ETag) {
            parts.push({
              partNumber: part.PartNumber,
              etag: part.ETag,
              sizeBytes: part.Size ?? 0,
            });
          }
        }
        if (!page.IsTruncated || !page.NextPartNumberMarker) break;
        marker = page.NextPartNumberMarker;
      }
    } catch (error) {
      if (isNoSuchUpload(error)) refuse("RADIO_RECORDING_UPLOAD_UNKNOWN");
      throw error;
    }
    return { parts };
  },
});

/** Sign up to ten more part urls for an open upload. */
export const signParts = action({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    uploadId: v.string(),
    key: v.string(),
    partNumbers: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await checkTarget(ctx, args.broadcastId);
    checkKey(args.key, args.broadcastId);
    const numbers = [...new Set(args.partNumbers)];
    if (
      numbers.length === 0 ||
      numbers.length > RADIO_RECORDING_SIGN_BATCH ||
      numbers.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PART_NUMBER)
    ) {
      refuse("RADIO_RECORDING_PART_MISMATCH");
    }
    const { client, bucket } = storage();
    return { urls: await signPartUrls(client, bucket, args.key, args.uploadId, numbers) };
  },
});

/**
 * Finish an upload (AC-25, AC-26): storage stitches the parts, then the
 * stored object's real size and type are read back, so a browser that sent
 * more than it declared at the start is caught here, and only then is the
 * recording attached to the broadcast.
 */
export const completeUpload = action({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    uploadId: v.string(),
    key: v.string(),
    parts: v.array(v.object({ partNumber: v.number(), etag: v.string() })),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await checkTarget(ctx, args.broadcastId);
    checkKey(args.key, args.broadcastId);
    if (args.parts.length === 0) refuse("RADIO_RECORDING_PART_MISMATCH");
    const { client, bucket } = storage();

    const parts = [...args.parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }));
    try {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: args.key,
          UploadId: args.uploadId,
          MultipartUpload: { Parts: parts },
        })
      );
    } catch (error) {
      if (isNoSuchUpload(error)) refuse("RADIO_RECORDING_UPLOAD_UNKNOWN");
      if (isInvalidPart(error)) refuse("RADIO_RECORDING_PART_MISMATCH");
      throw error;
    }

    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: args.key }));
    const sizeBytes = head.ContentLength ?? 0;
    const typeOk = isRadioAudioContentType(head.ContentType ?? "");
    if (sizeBytes <= 0 || sizeBytes > RADIO_RECORDING_MAX_BYTES || !typeOk) {
      // Never leave an object nothing points at and nobody may keep.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: args.key }));
      refuse(typeOk ? "RADIO_RECORDING_TOO_LARGE" : "RADIO_RECORDING_TYPE_UNSUPPORTED");
    }

    try {
      await ctx.runMutation(internal.radioRecordings.attachRecording, {
        broadcastId: args.broadcastId,
        key: args.key,
        sizeBytes,
        ...(args.durationSeconds !== undefined ? { durationSeconds: args.durationSeconds } : {}),
      });
    } catch (error) {
      // The broadcast changed under the upload (cancelled into Super T, the
      // caller lost authority): drop the stitched object rather than strand it.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: args.key }));
      throw error;
    }
    return null;
  },
});

/** Drop an upload's parts, when Media cancels one partway. */
export const abortUpload = action({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    uploadId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await checkTarget(ctx, args.broadcastId);
    checkKey(args.key, args.broadcastId);
    const { client, bucket } = storage();
    try {
      await client.send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: args.key, UploadId: args.uploadId })
      );
    } catch (error) {
      // Already gone is the outcome we wanted.
      if (!isNoSuchUpload(error)) throw error;
    }
    return null;
  },
});

/**
 * Delete recordings nothing points at any more (AC-26), scheduled by the
 * mutation that replaced or removed them, so it runs strictly after that
 * write commits. Each key is caught on its own and a failure is reported: a
 * failed delete leaves an orphan object, never a row pointing at nothing.
 */
export const deleteObjects = internalAction({
  args: { keys: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { keys }) => {
    const { client, bucket } = storage();
    for (const key of keys) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        console.error(`recordings: could not delete ${key}`, error);
        await reportError(ctx, error, { fn: "recordings.deleteObjects" });
      }
    }
    return null;
  },
});
