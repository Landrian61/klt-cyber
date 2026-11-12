import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { EVENT_ERROR, PAUSED_DEPARTMENTS } from "@klt-cyber/shared";
import type { NotificationAudience } from "../schema";
import type { EligibleGroups } from "./groupMembership";

// Who a church event is for (spec 0021, AC-11 to AC-13).
//
// One `audience` value drives both who SEES the event in the app and who is
// PUSHED about it (invariant 2). The two still differ in one way, on purpose:
// the in-app rule follows `getEligibleGroups` (any active seat), while the
// push rule for `serving` and `departments` keeps F4-17's verified-only rule.
// `church` pushes to the existing `all` audience, visitors included, exactly
// as events always have.

/**
 * The Convex shape of `events.audience`, defined once and reused by the table
 * and by both event mutations' args. Mirrors `eventAudienceSchema` in
 * @klt-cyber/shared.
 */
export const eventAudienceValidator = v.union(
  v.object({ type: v.literal("church") }),
  v.object({ type: v.literal("serving") }),
  v.object({
    type: v.literal("departments"),
    departmentIds: v.array(v.id("departments")),
  })
);

export type EventAudience = Infer<typeof eventAudienceValidator>;

/**
 * The audience of a stored event. During the widen and backfill window
 * (spec 0021, migration phase 1) an event written before this feature has no
 * audience yet and is read as `church`, which is what it always was.
 */
export function audienceOf(event: Doc<"events">): EventAudience {
  return event.audience ?? { type: "church" };
}

function isPausedName(name: string): boolean {
  return (PAUSED_DEPARTMENTS as readonly string[]).includes(name);
}

function invalid(message: string): never {
  throw new Error(`${EVENT_ERROR.INVALID_EVENT_AUDIENCE}: ${message}`);
}

/**
 * Refuses an audience the church cannot address (AC-11): an empty or
 * duplicated department list, or a department that is missing or paused.
 * A department paused later keeps its old events (invariant 3); this only
 * runs at write time.
 */
export async function validateEventAudience(
  ctx: QueryCtx | MutationCtx,
  audience: EventAudience
): Promise<void> {
  if (audience.type !== "departments") return;
  const ids = audience.departmentIds;
  if (ids.length === 0) invalid("Choose at least one department.");
  if (new Set(ids).size !== ids.length) {
    invalid("A department is listed twice.");
  }
  for (const id of ids) {
    const department = await ctx.db.get(id);
    if (!department) invalid("One of the departments no longer exists.");
    if (isPausedName(department.name)) {
      invalid(`${department.name} is paused and cannot be addressed yet.`);
    }
  }
}

/**
 * Whether a signed in user, with these eligible groups, sees an event with
 * this audience (AC-12). Pure, so every member read evaluates it live.
 * `serving` counts a seat in any department, paused included.
 */
export function isInEventAudience(
  groups: EligibleGroups,
  audience: EventAudience
): boolean {
  switch (audience.type) {
    case "church":
      return true;
    case "serving":
      return groups.departmentIds.length > 0;
    case "departments":
      return audience.departmentIds.some((id) =>
        groups.departmentIds.includes(id)
      );
    default: {
      const exhaustive: never = audience;
      throw new Error(`Unhandled event audience: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * The verified, non deleted seat holders of the qualifying departments,
 * deduplicated (AC-13). `serving` qualifies every department, paused
 * included. Resolved at the moment of sending.
 */
async function servingRecipientIds(
  ctx: QueryCtx | MutationCtx,
  departmentIds: Id<"departments">[] | "every"
): Promise<Id<"users">[]> {
  const ids =
    departmentIds === "every"
      ? (await ctx.db.query("departments").collect()).map((d) => d._id)
      : departmentIds;

  const seatHolders = new Set<Id<"users">>();
  for (const departmentId of ids) {
    const seats = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", departmentId).eq("status", "active")
      )
      .collect();
    for (const seat of seats) seatHolders.add(seat.userId);
  }

  const kept = await Promise.all(
    [...seatHolders].map(async (userId) => {
      const user = await ctx.db.get(userId);
      if (!user || user.deletedAt !== undefined) return null;
      const profile = await ctx.db
        .query("memberProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      return profile?.profileStatus === "verified" ? userId : null;
    })
  );
  return kept.filter((id): id is Id<"users"> => id !== null);
}

/** Every non deleted account, the same set the `all` notification audience reaches. */
async function everyAccountId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users">[]> {
  const users = await ctx.db.query("users").collect();
  return users.filter((u) => u.deletedAt === undefined).map((u) => u._id);
}

/**
 * The user ids an event push would reach right now (AC-13, AC-15). For
 * `church`, every non deleted account, matching `all`.
 */
export async function pushRecipientIds(
  ctx: QueryCtx | MutationCtx,
  audience: EventAudience
): Promise<Id<"users">[]> {
  switch (audience.type) {
    case "church":
      return everyAccountId(ctx);
    case "serving":
      return servingRecipientIds(ctx, "every");
    case "departments":
      return servingRecipientIds(ctx, audience.departmentIds);
    default: {
      const exhaustive: never = audience;
      throw new Error(`Unhandled event audience: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * The notification audience to dispatch to (AC-13): the existing `all` for
 * `church`, else a frozen `users` list resolved now. `null` when that list is
 * empty, so the caller sends nothing.
 */
export async function resolveEventPushAudience(
  ctx: QueryCtx | MutationCtx,
  audience: EventAudience
): Promise<NotificationAudience | null> {
  if (audience.type === "church") return { type: "all" };
  const userIds = await pushRecipientIds(ctx, audience);
  return userIds.length > 0 ? { type: "users", userIds } : null;
}

/** One comparison, shared with the portal's change warning. */
export { sameEventAudience } from "@klt-cyber/shared";
