import { ConvexError } from "convex/values";
import { RADIO_RECORDING_SIGN_BATCH } from "@klt-cyber/shared";
import type { Id } from "@/lib/api";

/**
 * The browser half of a recording upload (spec 0019, AC-25).
 *
 * The file goes straight to R2 in 8 MiB parts through urls the server signs.
 * The upload id is kept in localStorage against the broadcast, the file name
 * and its size, so picking the same file again after a dropped connection or
 * a closed tab resumes it. What has already arrived is asked of storage
 * (`listParts`), never taken from what this browser remembers, so no part is
 * sent twice and none is skipped.
 */

type SignedPart = { partNumber: number; url: string };
type DonePart = { partNumber: number; etag: string };

export interface RecordingUploadApi {
  startUpload: (args: {
    broadcastId: Id<"radioBroadcasts">;
    sizeBytes: number;
    contentType: string;
    durationSeconds?: number;
    replace?: boolean;
  }) => Promise<{
    uploadId: string;
    key: string;
    partSize: number;
    partCount: number;
    urls: SignedPart[];
  }>;
  listParts: (args: {
    broadcastId: Id<"radioBroadcasts">;
    uploadId: string;
    key: string;
  }) => Promise<{ parts: { partNumber: number; etag: string; sizeBytes: number }[] }>;
  signParts: (args: {
    broadcastId: Id<"radioBroadcasts">;
    uploadId: string;
    key: string;
    partNumbers: number[];
  }) => Promise<{ urls: SignedPart[] }>;
  completeUpload: (args: {
    broadcastId: Id<"radioBroadcasts">;
    uploadId: string;
    key: string;
    parts: DonePart[];
    durationSeconds?: number;
    replace?: boolean;
  }) => Promise<null>;
  abortUpload: (args: {
    broadcastId: Id<"radioBroadcasts">;
    uploadId: string;
    key: string;
  }) => Promise<null>;
}

export interface UploadProgress {
  /** Bytes storage has, including parts from an earlier attempt. */
  sentBytes: number;
  totalBytes: number;
  /** True when this run picked up an earlier, interrupted upload. */
  resumed: boolean;
}

interface Saved {
  uploadId: string;
  key: string;
  partSize: number;
}

/** How many parts travel at once. Three keeps a church office line usable. */
const CONCURRENCY = 3;

/** How long the browser may take to read the file's length before giving up. */
const DURATION_TIMEOUT_MS = 10_000;

function storageKey(broadcastId: string, file: File): string {
  return `klt.radio.upload:${broadcastId}:${file.name}:${file.size}`;
}

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (parsed.uploadId && parsed.key && parsed.partSize) return parsed as Saved;
  } catch {
    // Storage blocked or the entry is unreadable: start fresh.
  }
  return null;
}

function writeSaved(key: string, value: Saved | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Without storage the upload still works; it just cannot resume.
  }
}

/** True when the browser remembers an unfinished upload of this file. */
export function hasResumableUpload(broadcastId: string, file: File): boolean {
  return readSaved(storageKey(broadcastId, file)) !== null;
}

function errorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown } | null;
    if (data && typeof data.code === "string") return data.code;
  }
  return null;
}

/**
 * The recording's length in seconds, read in the browser from the file
 * itself (Value sourcing: display only). Undefined when the browser cannot
 * read it, which simply means no length is shown.
 */
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    let settled = false;
    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined), DURATION_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(undefined);
    };
    audio.src = url;
  });
}

/** PUT one part, reporting bytes as they go. Resolves to the part's ETag. */
function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onBytes: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else if (xhr.status >= 200 && xhr.status < 300) {
        // Uploaded, but the bucket's CORS does not expose ETag.
        reject(new Error("Storage did not expose the part's ETag. Check the bucket CORS rules."));
      } else reject(new Error(`A part failed to upload (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The connection dropped. Pick the same file to resume."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/**
 * Upload `file` as this broadcast's recording, resuming an earlier attempt of
 * the same file when the browser remembers one. Throws on failure; the saved
 * upload id is kept so the next attempt resumes.
 */
export async function uploadRecording(opts: {
  api: RecordingUploadApi;
  broadcastId: Id<"radioBroadcasts">;
  file: File;
  replace: boolean;
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}): Promise<void> {
  const { api, broadcastId, file, replace, signal, onProgress } = opts;
  const saveKey = storageKey(broadcastId, file);
  const contentType = file.type || "audio/mpeg";
  const durationSeconds = await readAudioDuration(file);

  let saved = readSaved(saveKey);
  let done = new Map<number, string>();
  let signed = new Map<number, string>();
  let resumed = false;

  if (saved) {
    try {
      const { parts } = await api.listParts({ broadcastId, uploadId: saved.uploadId, key: saved.key });
      done = new Map(parts.map((p) => [p.partNumber, p.etag]));
      resumed = true;
    } catch (error) {
      if (errorCode(error) !== "RADIO_RECORDING_UPLOAD_UNKNOWN") throw error;
      // Storage no longer has it (completed, aborted or expired): start over.
      writeSaved(saveKey, null);
      saved = null;
    }
  }

  if (!saved) {
    const started = await api.startUpload({
      broadcastId,
      sizeBytes: file.size,
      contentType,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      replace,
    });
    saved = { uploadId: started.uploadId, key: started.key, partSize: started.partSize };
    writeSaved(saveKey, saved);
    signed = new Map(started.urls.map((u) => [u.partNumber, u.url]));
  }

  const { uploadId, key, partSize } = saved;
  const partCount = Math.max(1, Math.ceil(file.size / partSize));
  const partBytes = (n: number) => Math.min(partSize, file.size - (n - 1) * partSize);

  const inFlight = new Map<number, number>();
  let doneBytes = [...done.keys()].reduce((sum, n) => sum + partBytes(n), 0);
  const report = () => {
    const live = [...inFlight.values()].reduce((a, b) => a + b, 0);
    onProgress({ sentBytes: Math.min(file.size, doneBytes + live), totalBytes: file.size, resumed });
  };
  report();

  const pending: number[] = [];
  for (let n = 1; n <= partCount; n++) if (!done.has(n)) pending.push(n);

  const urlFor = async (n: number): Promise<string> => {
    const cached = signed.get(n);
    if (cached) {
      signed.delete(n);
      return cached;
    }
    // Sign this part and the next few still waiting, in one call.
    const batch = [n, ...pending.filter((p) => p !== n && !signed.has(p))].slice(
      0,
      RADIO_RECORDING_SIGN_BATCH,
    );
    const { urls } = await api.signParts({ broadcastId, uploadId, key, partNumbers: batch });
    for (const u of urls) signed.set(u.partNumber, u.url);
    const url = signed.get(n);
    if (!url) throw new Error("Storage did not sign a part url.");
    signed.delete(n);
    return url;
  };

  const queue = [...pending];
  const worker = async () => {
    for (;;) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const n = queue.shift();
      if (n === undefined) return;
      const start = (n - 1) * partSize;
      const body = file.slice(start, start + partBytes(n));
      const url = await urlFor(n);
      inFlight.set(n, 0);
      const etag = await putPart(url, body, signal, (loaded) => {
        inFlight.set(n, loaded);
        report();
      });
      inFlight.delete(n);
      done.set(n, etag);
      doneBytes += partBytes(n);
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

  await api.completeUpload({
    broadcastId,
    uploadId,
    key,
    parts: [...done.entries()].map(([partNumber, etag]) => ({ partNumber, etag })),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    // This attempt's own choice, not the one saved when it started: if a
    // recording appeared meanwhile, only a person who chose replace replaces.
    replace,
  });
  writeSaved(saveKey, null);
}

/** Give up on a saved upload of this file: storage drops its parts. */
export async function discardUpload(
  api: RecordingUploadApi,
  broadcastId: Id<"radioBroadcasts">,
  file: File,
): Promise<void> {
  const saveKey = storageKey(broadcastId, file);
  const saved = readSaved(saveKey);
  writeSaved(saveKey, null);
  if (!saved) return;
  try {
    await api.abortUpload({ broadcastId, uploadId: saved.uploadId, key: saved.key });
  } catch {
    // The seven day lifecycle rule on the bucket cleans up what this misses.
  }
}
