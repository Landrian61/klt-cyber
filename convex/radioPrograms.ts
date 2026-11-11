import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH,
  RADIO_PROGRAM_NAME_MAX_LENGTH,
  RADIO_TARGET_TYPES,
  isSuperTProgram,
  isValidRadioDays,
  isValidRadioDuration,
  isValidRadioStartTime,
  radioProgramNameKey,
} from "@klt-cyber/shared";
import {
  getMediaDepartmentId,
  getRadioAuthorityOrNull,
  logActivity,
  requireRadioAuthority,
} from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";
import { vRadioProgramRecurrence } from "./lib/radioValidators";
import {
  clearUntouchedFutureRows,
  materialiseProgram,
  refuse,
  resolveHostInput,
  vRadioHostInput,
} from "./lib/radioSchedule";

/**
 * Media's recurring programs (spec 0019, AC-18, AC-21, AC-22, AC-24). Every
 * function here re-checks `manageRadio` on the server (AC-33).
 */

/** The editable fields of a program, as the Programs form sends them. */
const programFields = {
  name: v.string(),
  description: v.string(),
  days: v.array(v.number()),
  startTime: v.string(),
  durationMinutes: v.number(),
  recurrence: vRadioProgramRecurrence,
  recordByDefault: v.boolean(),
  followedByDefault: v.boolean(),
  host: vRadioHostInput,
  // An R2 key from the image upload; absent clears it, so the bundled art
  // matched by seedKey (or the church theme) shows instead.
  imageKey: v.optional(v.string()),
};

/** How many verified members the host picker is handed at most. */
const HOST_PICKER_CAP = 50;
/** How many member profiles the picker search scans at most. */
const HOST_SCAN_CAP = 2000;

function displayName(user: Doc<"users"> | null): string | null {
  if (!user || user.deletedAt !== undefined) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

/**
 * The duplicate name check among ACTIVE programs (AC-18), in the mutation
 * because Convex has no unique index.
 */
async function assertNameFree(
  ctx: MutationCtx,
  nameKey: string,
  exceptId?: Id<"radioPrograms">
) {
  const clash = await ctx.db
    .query("radioPrograms")
    .withIndex("by_nameKey", (q) => q.eq("nameKey", nameKey))
    .filter((q) => q.eq(q.field("isActive"), true))
    .collect();
  if (clash.some((p) => p._id !== exceptId)) refuse("RADIO_PROGRAM_NAME_TAKEN");
}

/** The shape checks every program write runs before touching the table. */
function checkFields(args: {
  name: string;
  description: string;
  days: number[];
  startTime: string;
  durationMinutes: number;
}) {
  const name = args.name.trim();
  if (!name) refuse("RADIO_PROGRAM_NAME_REQUIRED");
  if (name.length > RADIO_PROGRAM_NAME_MAX_LENGTH) refuse("RADIO_PROGRAM_NAME_TOO_LONG");
  const description = args.description.trim();
  if (description.length > RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH) {
    refuse("RADIO_PROGRAM_DESCRIPTION_TOO_LONG");
  }
  if (!isValidRadioDays(args.days)) refuse("RADIO_DAYS_INVALID");
  if (!isValidRadioStartTime(args.startTime)) refuse("RADIO_START_TIME_INVALID");
  if (!isValidRadioDuration(args.durationMinutes)) refuse("RADIO_DURATION_INVALID");
  const days = [...new Set(args.days)].sort((a, b) => a - b);
  return { name, nameKey: radioProgramNameKey(name), description, days };
}

async function presentProgram(ctx: QueryCtx, p: Doc<"radioPrograms">) {
  const hostUser = p.hostUserId ? await ctx.db.get(p.hostUserId) : null;
  return {
    _id: p._id,
    name: p.name,
    description: p.description,
    days: p.days,
    startTime: p.startTime,
    durationMinutes: p.durationMinutes,
    recurrence: p.recurrence,
    recordByDefault: p.recordByDefault,
    followedByDefault: p.followedByDefault,
    isActive: p.isActive,
    seedKey: p.seedKey ?? null,
    isSuperT: isSuperTProgram(p),
    imageKey: p.imageKey ?? null,
    imageUrl: (await resolveMediaUrl(p.imageKey)) ?? null,
    hostUserId: p.hostUserId ?? null,
    hostGuestName: p.hostGuestName ?? null,
    hostName: p.hostUserId ? displayName(hostUser) : (p.hostGuestName ?? null),
    updatedAt: p.updatedAt,
  };
}

/** The Programs page: every program, active first then by name (AC-18). */
export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, { includeInactive }) => {
    if (!(await getRadioAuthorityOrNull(ctx))) return null;
    const rows = includeInactive
      ? await ctx.db.query("radioPrograms").collect()
      : await ctx.db
          .query("radioPrograms")
          .withIndex("by_isActive", (q) => q.eq("isActive", true))
          .collect();
    rows.sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)
    );
    return await Promise.all(rows.map((p) => presentProgram(ctx, p)));
  },
});

/**
 * Verified members a host can be chosen from (AC-22). Names only. Matching
 * happens before the cap, so a member is findable by typing their name.
 */
export const searchHosts = query({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, { query: term }) => {
    if (!(await getRadioAuthorityOrNull(ctx))) return null;
    const needle = (term ?? "").trim().toLowerCase();
    const profiles = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
      .take(HOST_SCAN_CAP);
    const out: { _id: Id<"users">; name: string }[] = [];
    for (const profile of profiles) {
      const name = displayName(await ctx.db.get(profile.userId));
      if (!name) continue;
      if (needle && !name.toLowerCase().includes(needle)) continue;
      out.push({ _id: profile.userId, name });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out.slice(0, HOST_PICKER_CAP);
  },
});

/**
 * Add a program (AC-18). Its airings for the coming week are written at once
 * rather than waiting for the nightly job, so it shows on the schedule now.
 */
export const create = mutation({
  args: programFields,
  handler: async (ctx, args) => {
    const actor = await requireRadioAuthority(ctx);
    const checked = checkFields(args);
    await assertNameFree(ctx, checked.nameKey);
    const host = await resolveHostInput(ctx, args.host);
    const now = Date.now();
    const programId = await ctx.db.insert("radioPrograms", {
      ...checked,
      startTime: args.startTime,
      durationMinutes: args.durationMinutes,
      recurrence: args.recurrence,
      recordByDefault: args.recordByDefault,
      followedByDefault: args.followedByDefault,
      isActive: true,
      ...host,
      imageKey: args.imageKey?.trim() || undefined,
      createdBy: actor._id,
      updatedBy: actor._id,
      updatedAt: now,
    });
    const program = (await ctx.db.get(programId))!;
    const written = await materialiseProgram(ctx, program, now);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "radioProgram.created",
      targetType: RADIO_TARGET_TYPES.program,
      targetId: programId,
      metadata: { name: checked.name, broadcastsWritten: written },
      departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
    });
    return programId;
  },
});

/**
 * Edit a program (AC-18, AC-21, AC-24). When its timing or its record flag
 * changes, only its own future rows that nobody has touched are rewritten;
 * no past row and no adjusted, cancelled or recorded row ever moves.
 */
export const update = mutation({
  args: { programId: v.id("radioPrograms"), ...programFields },
  handler: async (ctx, { programId, ...args }) => {
    const actor = await requireRadioAuthority(ctx);
    const program = await ctx.db.get(programId);
    if (!program) refuse("RADIO_PROGRAM_NOT_FOUND");
    if (isSuperTProgram(program) && args.recordByDefault) {
      refuse("RADIO_SUPER_T_NOT_RECORDED");
    }
    const checked = checkFields(args);
    if (program.isActive) await assertNameFree(ctx, checked.nameKey, programId);
    const host = await resolveHostInput(ctx, args.host);
    const now = Date.now();

    const timingChanged =
      program.startTime !== args.startTime ||
      program.durationMinutes !== args.durationMinutes ||
      program.recurrence !== args.recurrence ||
      program.recordByDefault !== args.recordByDefault ||
      program.days.join(",") !== checked.days.join(",");

    await ctx.db.patch(programId, {
      ...checked,
      startTime: args.startTime,
      durationMinutes: args.durationMinutes,
      recurrence: args.recurrence,
      recordByDefault: args.recordByDefault,
      followedByDefault: args.followedByDefault,
      ...host,
      imageKey: args.imageKey?.trim() || undefined,
      updatedBy: actor._id,
      updatedAt: now,
    });

    let removed = 0;
    let written = 0;
    if (timingChanged) {
      removed = await clearUntouchedFutureRows(ctx, programId, now);
      written = await materialiseProgram(ctx, (await ctx.db.get(programId))!, now);
    }
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "radioProgram.updated",
      targetType: RADIO_TARGET_TYPES.program,
      targetId: programId,
      metadata: { name: checked.name, timingChanged, removed, written },
      departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
    });
    return programId;
  },
});

/**
 * Activate or deactivate a program (AC-21). Deactivating deletes its untouched
 * future rows; activating checks the name is still free among active programs
 * and writes its coming week.
 */
export const setActive = mutation({
  args: { programId: v.id("radioPrograms"), isActive: v.boolean() },
  handler: async (ctx, { programId, isActive }) => {
    const actor = await requireRadioAuthority(ctx);
    const program = await ctx.db.get(programId);
    if (!program) refuse("RADIO_PROGRAM_NOT_FOUND");
    if (program.isActive === isActive) return null;
    if (isActive) await assertNameFree(ctx, program.nameKey, programId);
    const now = Date.now();
    await ctx.db.patch(programId, { isActive, updatedBy: actor._id, updatedAt: now });
    const changed = isActive
      ? await materialiseProgram(ctx, { ...program, isActive: true }, now)
      : await clearUntouchedFutureRows(ctx, programId, now);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: isActive ? "radioProgram.activated" : "radioProgram.deactivated",
      targetType: RADIO_TARGET_TYPES.program,
      targetId: programId,
      metadata: { name: program.name, broadcastsChanged: changed },
      departmentId: (await getMediaDepartmentId(ctx)) ?? undefined,
    });
    return null;
  },
});
