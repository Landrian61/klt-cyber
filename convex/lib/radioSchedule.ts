import { ConvexError, v, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  RADIO_HOST_GUEST_NAME_MAX_LENGTH,
  isSuperTProgram,
  radioMaterialiseHorizonEnd,
  radioProgramOccurrences,
  type RadioErrorCode,
} from "@klt-cyber/shared";

/**
 * The schedule rules shared by the program functions, the by hand broadcast
 * functions, the nightly job and the seed (spec 0019, build slice 5).
 */

export function refuse(code: RadioErrorCode): never {
  throw new ConvexError({ code });
}

/**
 * A host as a form submits it (AC-22). One field rather than two optional
 * ones, so "both set" cannot even be sent. On a program `none` means no host
 * listed; on a broadcast it means inherit the program's host.
 */
export const vRadioHostInput = v.union(
  v.object({ kind: v.literal("none") }),
  v.object({ kind: v.literal("member"), userId: v.id("users") }),
  v.object({ kind: v.literal("guest"), name: v.string() })
);
export type RadioHostInput = Infer<typeof vRadioHostInput>;

/** True when a user may be named as a host: a verified member, not deleted. */
export async function isVerifiedMember(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) return false;
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return profile?.profileStatus === "verified";
}

/**
 * The stored host fields for a host input, exactly one set or neither
 * (AC-22). A member must be verified; a guest name is trimmed and capped.
 */
export async function resolveHostInput(
  ctx: MutationCtx,
  host: RadioHostInput
): Promise<{ hostUserId?: Id<"users">; hostGuestName?: string }> {
  if (host.kind === "none") return { hostUserId: undefined, hostGuestName: undefined };
  if (host.kind === "member") {
    if (!(await isVerifiedMember(ctx, host.userId))) refuse("RADIO_HOST_NOT_FOUND");
    return { hostUserId: host.userId, hostGuestName: undefined };
  }
  const name = host.name.trim();
  if (!name) return { hostUserId: undefined, hostGuestName: undefined };
  if (name.length > RADIO_HOST_GUEST_NAME_MAX_LENGTH) refuse("RADIO_HOST_AMBIGUOUS");
  return { hostUserId: undefined, hostGuestName: name };
}

/**
 * Whether a person or an event has touched a row, so no automatic writer may
 * move or remove it (AC-21): adjusted by hand, cancelled, recorded, or already
 * live once.
 */
export function isTouchedBroadcast(b: Doc<"radioBroadcasts">): boolean {
  return (
    b.adjusted ||
    b.status === "cancelled" ||
    b.recording !== undefined ||
    b.wentLiveAt !== undefined ||
    b.livePushSentAt !== undefined
  );
}

/**
 * Write ahead one program's missing airings, from `now` to the end of the
 * Kampala day seven days out (AC-19). Insert only, matched on program plus
 * the slot the row was written for, so a second run changes nothing and a
 * moved airing is not written again at its old time. An occasional or
 * inactive program writes nothing.
 */
export async function materialiseProgram(
  ctx: MutationCtx,
  program: Doc<"radioPrograms">,
  now: number
): Promise<number> {
  if (!program.isActive || program.recurrence !== "weekly") return 0;
  const isRecorded = program.recordByDefault && !isSuperTProgram(program);
  let inserted = 0;
  for (const slot of radioProgramOccurrences(
    program,
    now,
    radioMaterialiseHorizonEnd(now)
  )) {
    const existing = await ctx.db
      .query("radioBroadcasts")
      .withIndex("by_programId_slotStartsAt", (q) =>
        q.eq("programId", program._id).eq("slotStartsAt", slot.startsAt)
      )
      .first();
    if (existing) continue;
    await ctx.db.insert("radioBroadcasts", {
      programId: program._id,
      origin: "scheduled",
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      slotStartsAt: slot.startsAt,
      isRecorded,
      status: "scheduled",
      adjusted: false,
    });
    inserted++;
  }
  return inserted;
}

/**
 * Delete a program's future rows that nobody has touched (AC-21): what an
 * edit rewrites and what deactivating removes. Only rows the nightly job
 * wrote, only rows that have not started, never a touched row.
 */
export async function clearUntouchedFutureRows(
  ctx: MutationCtx,
  programId: Id<"radioPrograms">,
  now: number
): Promise<number> {
  const future = await ctx.db
    .query("radioBroadcasts")
    .withIndex("by_programId_startsAt", (q) =>
      q.eq("programId", programId).gt("startsAt", now)
    )
    .collect();
  let removed = 0;
  for (const b of future) {
    if (b.origin !== "scheduled" || b.slotStartsAt === undefined) continue;
    if (isTouchedBroadcast(b)) continue;
    await ctx.db.delete(b._id);
    removed++;
  }
  return removed;
}
