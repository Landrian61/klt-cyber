import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  MERGED_FOLLOW_UP_NOTE,
  REMOVED_VISITOR_LABEL,
  buildVisitorSearchName,
  normalizeMemberPhone,
} from "@klt-cyber/shared";

// The account side of Hospitality's `visitors` table (spec 0024, slice 2).
//
// These run inside OTHER features' mutations (sign up, profile submit and
// edit, verification, account deletion), so this file deliberately imports
// nothing from `authz.ts`: those callers have already decided who may act, and
// a Hospitality authority check here would refuse the person editing their own
// profile. Every function is a quiet no op when there is nothing to do, so a
// caller never has to know whether this person ever had a visitor row.

/** A row that still stands for the person: not merged away, not removed. */
function isLive(row: Doc<"visitors">): boolean {
  return row.listStatus === "active" || row.listStatus === "member";
}

/**
 * The person's one live visitor row, or null (spec 0024 key invariants: at
 * most one `active` or `member` row per `userId`).
 */
export async function liveVisitorForUser(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Doc<"visitors"> | null> {
  const rows = await ctx.db
    .query("visitors")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return rows.find(isLive) ?? null;
}

/**
 * An app row's names (value sourcing): the account's names, with the part of
 * the email before the `@` standing in for a first name the provider never
 * gave, so a row is never nameless.
 */
export function appVisitorNames(user: Doc<"users">): {
  firstName: string;
  lastName?: string;
} {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  return {
    firstName: first || user.email.split("@")[0] || user.email,
    lastName: last || undefined,
  };
}

/** The profile phone as E.164, or undefined when absent or unreadable. */
function accountPhoneOf(
  profile: Doc<"memberProfiles"> | null
): string | undefined {
  if (!profile?.phone) return undefined;
  return normalizeMemberPhone(profile.phone) ?? undefined;
}

async function profileOf(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Doc<"memberProfiles"> | null> {
  return await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Create the person's app visitor row, once (AC-8).
 *
 * Idempotent: when ANY row already carries this `userId` it does nothing and
 * returns that row, so the sign up hook, a retry and the backfill can all run
 * for the same person without a duplicate. A deleted or missing account gets
 * no row.
 */
export async function ensureAppVisitorRow(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Id<"visitors"> | null> {
  const existing = await ctx.db
    .query("visitors")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (existing) return existing._id;

  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) return null;

  const { firstName, lastName } = appVisitorNames(user);
  const now = Date.now();
  return await ctx.db.insert("visitors", {
    kind: "app",
    userId,
    firstName,
    lastName,
    searchName: buildVisitorSearchName(firstName, lastName, user.email),
    accountPhone: accountPhoneOf(await profileOf(ctx, userId)),
    visitCount: 0,
    // Only visitors are created or backfilled, but a member reaching here
    // must still never sit in the Visitors list.
    listStatus: user.role === "member" ? "member" : "active",
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Bring the person's visitor row up to date with their account (AC-8, AC-31).
 *
 * Called by every profile writer after its own write: the names (app rows
 * only, since a joined walk in keeps the names the team recorded, AC-28), the
 * search text, and `accountPhone`, the join suggestion key. Patches only what
 * moved.
 */
export async function syncVisitorFromAccount(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const row = await liveVisitorForUser(ctx, userId);
  if (!row) return;
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) return;

  const names =
    row.kind === "app"
      ? appVisitorNames(user)
      : { firstName: row.firstName, lastName: row.lastName };
  const searchName = buildVisitorSearchName(
    names.firstName,
    names.lastName,
    user.email
  );
  const accountPhone = accountPhoneOf(await profileOf(ctx, userId));

  if (
    names.firstName === row.firstName &&
    names.lastName === row.lastName &&
    searchName === row.searchName &&
    accountPhone === row.accountPhone
  ) {
    return;
  }
  await ctx.db.patch(row._id, {
    firstName: names.firstName,
    lastName: names.lastName,
    searchName,
    accountPhone,
    updatedAt: Date.now(),
  });
}

/**
 * The person was verified: their row leaves the Visitors list (AC-31).
 * Called from `verifyProfile`, in the same mutation that makes them a member.
 */
export async function markVisitorMember(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const row = await liveVisitorForUser(ctx, userId);
  if (row && row.listStatus === "active") {
    await ctx.db.patch(row._id, { listStatus: "member", updatedAt: Date.now() });
  }
  await syncVisitorFromAccount(ctx, userId);
}

/**
 * Strip every personal detail from a visitor row (AC-25, AC-26).
 *
 * The visit dates stay, so report totals remain true. The names become the
 * removed label, every optional personal field is cleared, an open follow up
 * closes as `closed`, and every contact note on the record is cleared, since a
 * note is free text that can describe the person.
 *
 * `clearUserId` is for account deletion, which also cuts the link to the
 * leaving account. `actorId` is the operator who removed the visitor, or
 * null for account deletion: nobody on the team closed that follow up, so it
 * gets no `closedBy` and never counts as their work. `keepListStatus` is for
 * a merged row, which stays merged so it never rejoins a list or a cohort.
 */
export async function anonymiseVisitor(
  ctx: MutationCtx,
  visitorId: Id<"visitors">,
  actorId: Id<"users"> | null,
  {
    clearUserId = false,
    keepListStatus = false,
  }: { clearUserId?: boolean; keepListStatus?: boolean } = {}
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(visitorId, {
    firstName: REMOVED_VISITOR_LABEL,
    lastName: undefined,
    searchName: "",
    phone: undefined,
    accountPhone: undefined,
    notes: undefined,
    invitedByText: undefined,
    invitedByUserId: undefined,
    sex: undefined,
    ageBracket: undefined,
    consent: undefined,
    ...(keepListStatus ? {} : { listStatus: "removed" as const }),
    ...(clearUserId ? { userId: undefined } : {}),
    updatedAt: now,
  });

  const followUps = await ctx.db
    .query("followUps")
    .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
    .collect();
  for (const followUp of followUps) {
    // A close note is free text, so it goes; the join's fixed marker is not
    // about the person and keeps the duplicate out of the counts.
    const patch: Partial<Doc<"followUps">> =
      followUp.closeNote === MERGED_FOLLOW_UP_NOTE ? {} : { closeNote: undefined };
    if (followUp.status === "open") {
      Object.assign(patch, {
        status: "done",
        outcome: "closed",
        closedAt: now,
        ...(actorId ? { closedBy: actorId } : {}),
      });
    }
    if (Object.keys(patch).length === 0) continue;
    await ctx.db.patch(followUp._id, patch);
  }

  const contacts = await ctx.db
    .query("visitorContacts")
    .withIndex("by_visitorId_at", (q) => q.eq("visitorId", visitorId))
    .collect();
  for (const contact of contacts) {
    if (contact.note !== undefined) {
      await ctx.db.patch(contact._id, { note: undefined });
    }
  }
}

/**
 * Account deletion's part (AC-26): every row tied to the leaving account is
 * anonymised and unlinked, in the caller's transaction.
 *
 * That includes an app row an earlier join merged into one of them: the join
 * moved its `userId` to the survivor but left the account's names and email
 * (in `searchName`) on it. Merged rows are few (one per join), so they are
 * read by status rather than through a new index.
 */
export async function anonymiseVisitorsForDeletedUser(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const rows = await ctx.db
    .query("visitors")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    await anonymiseVisitor(ctx, row._id, null, { clearUserId: true });
  }

  const survivors = new Set<Id<"visitors">>(rows.map((row) => row._id));
  if (survivors.size === 0) return;
  const merged = await ctx.db
    .query("visitors")
    .withIndex("by_listStatus_createdAt", (q) => q.eq("listStatus", "merged"))
    .collect();
  for (const row of merged) {
    if (row.mergedIntoId && survivors.has(row.mergedIntoId)) {
      await anonymiseVisitor(ctx, row._id, null, { keepListStatus: true });
    }
  }
}
