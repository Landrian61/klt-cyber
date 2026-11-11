import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  RADIO_AUTO_BROADCAST_FALLBACK_TITLE,
  RADIO_RECORDING_MAX_BYTES,
  RADIO_TARGET_TYPES,
  isRadioRecordingKeyFor,
  isSuperTProgram,
  type RadioErrorCode,
  type RadioFeedAction,
} from "@klt-cyber/shared";
import {
  getMediaDepartmentId,
  getRadioAuthorityOrNull,
  logActivity,
  requireRadioAuthority,
} from "./lib/authz";

/**
 * Recordings, the database side (spec 0019, AC-24 to AC-26).
 *
 * The bytes travel through `convex/recordings.ts`, a Node action that talks
 * to R2's multipart API directly, because the `@convex-dev/r2` component has
 * no multipart upload. A Node file can hold only actions, so the checks it
 * leans on, the write that attaches a finished upload, the removal and the
 * Media page's list live here.
 *
 * Every entry point re-checks `manageRadio` itself (AC-33). An internal query
 * or mutation run from an action inherits the caller's identity, so the
 * action's own check is not the only one.
 */

function refuse(code: RadioErrorCode): never {
  throw new ConvexError({ code });
}

/** How far back the Media Recordings page looks for finished broadcasts. */
const MEDIA_RECORDINGS_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;
/** The most finished broadcasts that page is handed. */
const MEDIA_RECORDINGS_CAP = 200;

/**
 * Whether a recording may be attached to this broadcast now (AC-24, AC-25):
 * it exists, it is not a Super T airing, and it has finished.
 */
async function loadUploadTarget(
  ctx: QueryCtx | MutationCtx,
  broadcastId: Id<"radioBroadcasts">,
  now: number
) {
  const broadcast = await ctx.db.get(broadcastId);
  if (!broadcast) refuse("RADIO_BROADCAST_NOT_FOUND");
  const program = broadcast.programId ? await ctx.db.get(broadcast.programId) : null;
  if (program && isSuperTProgram(program)) refuse("RADIO_SUPER_T_NOT_RECORDED");
  if (broadcast.endsAt > now) refuse("RADIO_RECORDING_NOT_FINISHED");
  return { broadcast, program };
}

function titleOf(
  broadcast: Doc<"radioBroadcasts">,
  program: Doc<"radioPrograms"> | null
): string {
  return program?.name ?? broadcast.oneOffName ?? RADIO_AUTO_BROADCAST_FALLBACK_TITLE;
}

async function log(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  action: RadioFeedAction,
  broadcastId: Id<"radioBroadcasts">,
  metadata: Record<string, unknown>
) {
  await logActivity(ctx, {
    actorUserId,
    action,
    targetType: RADIO_TARGET_TYPES.broadcast,
    targetId: broadcastId,
    metadata,
    departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
  });
}

/** Queue an old object for deletion, strictly after this write commits (AC-26). */
async function scheduleDelete(ctx: MutationCtx, key: string) {
  await ctx.scheduler.runAfter(0, internal.recordings.deleteObjects, { keys: [key] });
}

/**
 * The check `recordings.startUpload` runs before it opens a multipart upload,
 * and every later call runs again: authority, then the target rules. Reports
 * whether a recording is already there, which only `replace` may go over
 * (AC-26).
 */
export const checkUploadTarget = internalQuery({
  args: { broadcastId: v.id("radioBroadcasts"), now: v.number() },
  handler: async (ctx, { broadcastId, now }) => {
    await requireRadioAuthority(ctx);
    const { broadcast } = await loadUploadTarget(ctx, broadcastId, now);
    return { hasRecording: broadcast.recording !== undefined };
  },
});

/**
 * Attach a completed upload (AC-25, AC-26). The action has already finished
 * the multipart upload and read the stored object's real size, so `sizeBytes`
 * is storage's own figure, not the browser's. `durationSeconds` is the
 * browser's reading of the file and is accepted because it is display only
 * (Value sourcing).
 *
 * Writes `recording` and its indexed mirror together, and when it replaces a
 * recording it schedules the old object's deletion and logs a replacement
 * rather than an upload.
 */
export const attachRecording = internalMutation({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    key: v.string(),
    sizeBytes: v.number(),
    durationSeconds: v.optional(v.number()),
    // Checked here, at the end, not only when the upload started: someone
    // else may have attached a recording while this one was paused, and a
    // resumed upload must not silently replace and delete theirs (AC-26).
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRadioAuthority(ctx);
    const now = Date.now();
    const { broadcast, program } = await loadUploadTarget(ctx, args.broadcastId, now);
    if (!isRadioRecordingKeyFor(args.key, args.broadcastId)) {
      refuse("RADIO_RECORDING_KEY_INVALID");
    }
    if (args.sizeBytes <= 0 || args.sizeBytes > RADIO_RECORDING_MAX_BYTES) {
      refuse("RADIO_RECORDING_TOO_LARGE");
    }

    const previous = broadcast.recording;
    if (previous && previous.key !== args.key && !args.replace) refuse("RADIO_RECORDING_EXISTS");
    const duration =
      args.durationSeconds !== undefined &&
      Number.isFinite(args.durationSeconds) &&
      args.durationSeconds > 0
        ? Math.round(args.durationSeconds)
        : undefined;

    await ctx.db.patch(args.broadcastId, {
      recording: {
        key: args.key,
        ...(duration !== undefined ? { durationSeconds: duration } : {}),
        sizeBytes: args.sizeBytes,
        uploadedBy: actor._id,
        uploadedAt: now,
      },
      recordingUploadedAt: now,
    });

    if (previous && previous.key !== args.key) await scheduleDelete(ctx, previous.key);

    await log(
      ctx,
      actor._id,
      previous ? "radioRecording.replaced" : "radioRecording.uploaded",
      args.broadcastId,
      {
        title: titleOf(broadcast, program),
        sizeBytes: args.sizeBytes,
        ...(duration !== undefined ? { durationSeconds: duration } : {}),
      }
    );
    return null;
  },
});

/**
 * Remove a broadcast's recording (AC-26). Clears the recording and its mirror
 * together, schedules the stored object's deletion and logs it. Nothing
 * expires on its own; this is the only way a recording goes.
 */
export const remove = mutation({
  args: { broadcastId: v.id("radioBroadcasts") },
  handler: async (ctx, { broadcastId }) => {
    const actor = await requireRadioAuthority(ctx);
    const broadcast = await ctx.db.get(broadcastId);
    if (!broadcast) refuse("RADIO_BROADCAST_NOT_FOUND");
    const recording = broadcast.recording;
    if (!recording) refuse("RADIO_RECORDING_MISSING");

    await ctx.db.patch(broadcastId, {
      recording: undefined,
      recordingUploadedAt: undefined,
    });
    await scheduleDelete(ctx, recording.key);

    const program = broadcast.programId ? await ctx.db.get(broadcast.programId) : null;
    await log(ctx, actor._id, "radioRecording.removed", broadcastId, {
      title: titleOf(broadcast, program),
    });
    return null;
  },
});

/**
 * The Media Recordings page (AC-24 to AC-26): finished broadcasts from the
 * last sixty days, newest first, each with whether it can take a recording
 * and the one it already has. Null without `manageRadio`.
 */
export const listForMedia = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getRadioAuthorityOrNull(ctx))) return null;
    const now = Date.now();
    const rows = await ctx.db
      .query("radioBroadcasts")
      .withIndex("by_startsAt", (q) =>
        q.gte("startsAt", now - MEDIA_RECORDINGS_LOOKBACK_MS).lt("startsAt", now)
      )
      .order("desc")
      .take(MEDIA_RECORDINGS_CAP);

    const programs = new Map<Id<"radioPrograms">, Doc<"radioPrograms"> | null>();
    const programOf = async (id: Id<"radioPrograms">) => {
      if (!programs.has(id)) programs.set(id, await ctx.db.get(id));
      return programs.get(id) ?? null;
    };

    const finished = rows.filter((b) => b.endsAt <= now);
    return await Promise.all(
      finished.map(async (b) => {
        const program = b.programId ? await programOf(b.programId) : null;
        return {
          _id: b._id,
          title: titleOf(b, program),
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          status: b.status,
          isRecorded: b.isRecorded,
          isSuperT: program ? isSuperTProgram(program) : false,
          recording: b.recording
            ? {
                durationSeconds: b.recording.durationSeconds ?? null,
                sizeBytes: b.recording.sizeBytes,
                uploadedAt: b.recording.uploadedAt,
              }
            : null,
        };
      })
    );
  },
});
