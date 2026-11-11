import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  RADIO_BROADCAST_MAX_MS,
  RADIO_ONE_OFF_NAME_MAX_LENGTH,
  RADIO_TARGET_TYPES,
  isSuperTProgram,
  type RadioFeedAction,
} from "@klt-cyber/shared";
import { getMediaDepartmentId, logActivity, requireRadioAuthority } from "./lib/authz";
import { refuse, resolveHostInput, vRadioHostInput } from "./lib/radioSchedule";

/**
 * Single broadcasts Media adds or changes by hand (spec 0019, AC-20 to
 * AC-22, AC-24). Every row a person writes or edits is marked `adjusted`, so
 * the nightly job leaves it alone. Every function re-checks `manageRadio`.
 */

function checkTimes(startsAt: number, endsAt: number) {
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt ||
    endsAt - startsAt > RADIO_BROADCAST_MAX_MS
  ) {
    refuse("RADIO_BROADCAST_TIMES_INVALID");
  }
}

function checkOneOffName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > RADIO_ONE_OFF_NAME_MAX_LENGTH) {
    refuse("RADIO_BROADCAST_NAME_AMBIGUOUS");
  }
  return trimmed;
}

async function loadBroadcast(ctx: MutationCtx, id: Id<"radioBroadcasts">) {
  const b = await ctx.db.get(id);
  if (!b) refuse("RADIO_BROADCAST_NOT_FOUND");
  return b;
}

async function programOf(ctx: MutationCtx, b: Pick<Doc<"radioBroadcasts">, "programId">) {
  return b.programId ? await ctx.db.get(b.programId) : null;
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

/**
 * Add a broadcast by hand (AC-20): a typed one off name, which never becomes
 * a recurring program, or an existing program, which is how an occasional
 * program such as Holy Ghost Night gets an airing.
 */
export const createByHand = mutation({
  args: {
    oneOffName: v.optional(v.string()),
    programId: v.optional(v.id("radioPrograms")),
    startsAt: v.number(),
    endsAt: v.number(),
    host: vRadioHostInput,
    isRecorded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRadioAuthority(ctx);
    const hasName = !!args.oneOffName?.trim();
    if (hasName === !!args.programId) refuse("RADIO_BROADCAST_NAME_AMBIGUOUS");
    checkTimes(args.startsAt, args.endsAt);

    let program: Doc<"radioPrograms"> | null = null;
    if (args.programId) {
      program = await ctx.db.get(args.programId);
      if (!program) refuse("RADIO_PROGRAM_NOT_FOUND");
      if (isSuperTProgram(program) && args.isRecorded) refuse("RADIO_SUPER_T_NOT_RECORDED");
    }
    const host = await resolveHostInput(ctx, args.host);

    const broadcastId = await ctx.db.insert("radioBroadcasts", {
      ...(program
        ? { programId: program._id }
        : { oneOffName: checkOneOffName(args.oneOffName ?? "") }),
      origin: program ? "scheduled" : "oneOff",
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      ...host,
      isRecorded: args.isRecorded,
      status: "scheduled",
      adjusted: true,
    });
    await log(ctx, actor._id, "radioBroadcast.created", broadcastId, {
      title: program?.name ?? args.oneOffName?.trim(),
      startsAt: args.startsAt,
      endsAt: args.endsAt,
    });
    return broadcastId;
  },
});

/**
 * Adjust one broadcast's times, host or record flag (AC-21, AC-22, AC-24).
 * Each field is optional and left alone when absent. A host of `none` clears
 * both host fields, returning the airing to its program's host. Times can no
 * longer change once a recording is attached.
 */
export const adjust = mutation({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    host: v.optional(vRadioHostInput),
    isRecorded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRadioAuthority(ctx);
    const b = await loadBroadcast(ctx, args.broadcastId);
    const program = await programOf(ctx, b);

    const startsAt = args.startsAt ?? b.startsAt;
    const endsAt = args.endsAt ?? b.endsAt;
    const timesChanged = startsAt !== b.startsAt || endsAt !== b.endsAt;
    if (timesChanged) {
      if (b.recording) refuse("RADIO_BROADCAST_HAS_RECORDING");
      checkTimes(startsAt, endsAt);
    }
    if (args.isRecorded && program && isSuperTProgram(program)) {
      refuse("RADIO_SUPER_T_NOT_RECORDED");
    }

    const patch: Partial<Doc<"radioBroadcasts">> = { adjusted: true };
    if (timesChanged) Object.assign(patch, { startsAt, endsAt });
    if (args.host) Object.assign(patch, await resolveHostInput(ctx, args.host));
    if (args.isRecorded !== undefined) patch.isRecorded = args.isRecorded;
    await ctx.db.patch(b._id, patch);

    await log(ctx, actor._id, "radioBroadcast.adjusted", b._id, {
      from: { startsAt: b.startsAt, endsAt: b.endsAt },
      to: { startsAt, endsAt },
      hostChanged: !!args.host,
      isRecorded: args.isRecorded ?? null,
    });
    return null;
  },
});

/**
 * Cancel one broadcast (AC-21). It stays visible marked Cancelled, is never
 * the current broadcast, and its follow push never fires. Reversible.
 */
export const cancel = mutation({
  args: { broadcastId: v.id("radioBroadcasts") },
  handler: async (ctx, { broadcastId }) => {
    const actor = await requireRadioAuthority(ctx);
    const b = await loadBroadcast(ctx, broadcastId);
    if (b.status === "cancelled") return null;
    await ctx.db.patch(b._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: actor._id,
      adjusted: true,
    });
    await log(ctx, actor._id, "radioBroadcast.cancelled", b._id, {
      startsAt: b.startsAt,
    });
    return null;
  },
});

/** Restore a cancelled broadcast. It stays `adjusted`, so the job leaves it. */
export const restore = mutation({
  args: { broadcastId: v.id("radioBroadcasts") },
  handler: async (ctx, { broadcastId }) => {
    const actor = await requireRadioAuthority(ctx);
    const b = await loadBroadcast(ctx, broadcastId);
    if (b.status !== "cancelled") return null;
    await ctx.db.patch(b._id, {
      status: "scheduled",
      cancelledAt: undefined,
      cancelledBy: undefined,
      adjusted: true,
    });
    await log(ctx, actor._id, "radioBroadcast.restored", b._id, {
      startsAt: b.startsAt,
    });
    return null;
  },
});

/**
 * Rename a one off or `auto` row, or attach it to a program (AC-17). A row
 * the schedule wrote takes its name from its program and is refused here.
 * Attaching to Super T switches the record flag off (AC-24).
 */
export const rename = mutation({
  args: {
    broadcastId: v.id("radioBroadcasts"),
    oneOffName: v.optional(v.string()),
    programId: v.optional(v.id("radioPrograms")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRadioAuthority(ctx);
    const b = await loadBroadcast(ctx, args.broadcastId);
    if (b.origin !== "auto" && b.origin !== "oneOff") {
      refuse("RADIO_BROADCAST_NOT_RENAMEABLE");
    }
    const hasName = !!args.oneOffName?.trim();
    if (hasName === !!args.programId) refuse("RADIO_BROADCAST_NAME_AMBIGUOUS");

    if (args.programId) {
      const program = await ctx.db.get(args.programId);
      if (!program) refuse("RADIO_PROGRAM_NOT_FOUND");
      await ctx.db.patch(b._id, {
        programId: program._id,
        oneOffName: undefined,
        adjusted: true,
        ...(isSuperTProgram(program) ? { isRecorded: false } : {}),
      });
    } else {
      await ctx.db.patch(b._id, {
        programId: undefined,
        oneOffName: checkOneOffName(args.oneOffName ?? ""),
        adjusted: true,
      });
    }
    await log(ctx, actor._id, "radioBroadcast.renamed", b._id, {
      from: b.programId ?? b.oneOffName ?? null,
      to: args.programId ?? args.oneOffName?.trim() ?? null,
    });
    return null;
  },
});
