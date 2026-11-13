import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  HOSPITALITY_DEPARTMENT_NAME,
  regularMonthFrom,
  type HospitalityErrorCode,
} from "@klt-cyber/shared";
import {
  departmentCapabilities,
  getCurrentUser,
  requireDepartmentCapability,
  resolveDepartmentShellRole,
  type DepartmentShellRole,
} from "./authz";

// Hospitality's server helpers (spec 0024): who may act, how a refusal is
// raised, and the small text rules every mutation shares.

// -- Refusal ---------------------------------------------------------------

/**
 * Refuse with a code the portal maps to a sentence through
 * `hospitalityErrorMessage` in `@klt-cyber/shared`.
 */
export function refuse(code: HospitalityErrorCode): never {
  throw new ConvexError({ code });
}

// -- The department, and who may act on it --------------------------------

/**
 * Hospitality's department document, found by name (spec 0024 value
 * sourcing). `.first()` rather than `.unique()`: a duplicate seeded row
 * should give the team a working page, not a thrown query.
 */
export async function hospitalityDepartment(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"departments"> | null> {
  return await ctx.db
    .query("departments")
    .withIndex("by_name", (q) => q.eq("name", HOSPITALITY_DEPARTMENT_NAME))
    .first();
}

/** Just the id, for callers that only scope a write by it. */
export async function getHospitalityDepartmentId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"departments"> | null> {
  return (await hospitalityDepartment(ctx))?._id ?? null;
}

export interface HospitalityOperator {
  user: Doc<"users">;
  departmentId: Id<"departments">;
  role: DepartmentShellRole;
}

/**
 * The caller as a Hospitality operator, or null (AC-3).
 *
 * Null rather than a throw for every QUERY: these back live subscriptions
 * that re-run when a session drops or a role is revoked while a page is
 * open, and must deliver something the page can render (spec 0012's rule).
 */
export async function hospitalityOperatorOrNull(
  ctx: QueryCtx
): Promise<HospitalityOperator | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const department = await hospitalityDepartment(ctx);
  if (!department) return null;
  const role = await resolveDepartmentShellRole(ctx, user._id, department._id);
  if (!role) return null;
  return departmentCapabilities(role, department.name).manageHospitality
    ? { user, departmentId: department._id, role }
    : null;
}

/**
 * Assert the caller may run Hospitality (AC-3). Every Hospitality mutation
 * goes through `requireDepartmentCapability` here, so the portal's hidden
 * buttons are convenience and a forged request lands on this check.
 */
export async function requireHospitalityOperator(
  ctx: MutationCtx
): Promise<HospitalityOperator> {
  const departmentId = await getHospitalityDepartmentId(ctx);
  if (!departmentId) refuse("HOSPITALITY_NOT_SEEDED");
  const { actor, role } = await requireDepartmentCapability(
    ctx,
    departmentId,
    "manageHospitality"
  );
  return { user: actor, departmentId, role };
}

/**
 * What a paginated query returns to a caller without access.
 *
 * An empty, finished page rather than `null`, because Convex's
 * `usePaginatedQuery` reads `.page` off every result and would throw on null.
 * It still never throws and still reveals nothing, which is what AC-3 asks
 * for; `listRecordings` in `radio.ts` set this precedent.
 */
export function emptyPage<T>(): {
  page: T[];
  isDone: true;
  continueCursor: string;
} {
  return { page: [], isDone: true, continueCursor: "" };
}

// -- Text ------------------------------------------------------------------

/**
 * Trim, then refuse an over long value. An empty result reads as absent, so
 * a cleared input never stores an empty string.
 */
export function cleanText(
  value: string | undefined,
  max: number,
  tooLong: HospitalityErrorCode
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) refuse(tooLong);
  return trimmed;
}

/** "a former member", the spec 0012 label for a staff account that is gone. */
export const FORMER_MEMBER_LABEL = "a former member";

/**
 * A staff member's name for the record page, or "a former member" when the
 * account is gone (AC-14). Read from the `users` row, where profile names are
 * mirrored on write.
 */
export async function staffName(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users"> | undefined
): Promise<string | null> {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) return FORMER_MEMBER_LABEL;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

/**
 * The roles that may correct anyone's visit (AC-13): the HOD, a delegate and
 * a System Admin. A roster member may only delete what they recorded.
 */
export function isHospitalityLead(role: DepartmentShellRole): boolean {
  return role === "hod" || role === "delegate" || role === "system_admin";
}

/**
 * Refuse an inviter who is not a live, verified member (AC-4). Shared by the
 * walk in form and the record page's edit.
 */
export async function assertInviterValid(
  ctx: MutationCtx,
  inviterId: Id<"users">
): Promise<void> {
  const inviter = await ctx.db.get(inviterId);
  const profile = inviter
    ? await ctx.db
        .query("memberProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", inviter._id))
        .unique()
    : null;
  if (
    !inviter ||
    inviter.deletedAt !== undefined ||
    profile?.profileStatus !== "verified"
  ) {
    refuse("HOSPITALITY_INVITER_INVALID");
  }
}

/**
 * Whether a person is a Hospitality operator right now (AC-20): a live
 * account holding `manageHospitality` through the same resolver the
 * authority check uses. So an assignee is valid exactly when they could open
 * the Follow ups page themselves.
 */
export async function isHospitalityOperatorUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  departmentId: Id<"departments">
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) return false;
  const role = await resolveDepartmentShellRole(ctx, userId, departmentId);
  if (!role) return false;
  return departmentCapabilities(role, HOSPITALITY_DEPARTMENT_NAME).manageHospitality;
}

/** The visitor, or a refusal when it is gone. */
export async function getVisitorOrRefuse(
  ctx: MutationCtx,
  visitorId: Id<"visitors">
): Promise<Doc<"visitors">> {
  const visitor = await ctx.db.get(visitorId);
  if (!visitor) refuse("HOSPITALITY_VISITOR_NOT_FOUND");
  return visitor;
}

/**
 * The visitor, refused unless it still stands for a person (`active`, or
 * `member` for edits on the record page). Merged and removed rows are
 * history, not something to keep working on.
 */
export async function getWorkableVisitor(
  ctx: MutationCtx,
  visitorId: Id<"visitors">,
  { allowMember = false }: { allowMember?: boolean } = {}
): Promise<Doc<"visitors">> {
  const visitor = await getVisitorOrRefuse(ctx, visitorId);
  const ok =
    visitor.listStatus === "active" ||
    (allowMember && visitor.listStatus === "member");
  if (!ok) refuse("HOSPITALITY_VISITOR_NOT_ACTIVE");
  return visitor;
}

/** Whether a consent is live: given, and not withdrawn since. */
export function hasLiveConsent(visitor: Doc<"visitors">): boolean {
  return visitor.consent !== undefined && visitor.consent.withdrawnAt === undefined;
}

/**
 * Withdraw consent and clear the phone in one patch, so the AC-22 invariant
 * (a phone only with live consent) holds after every writer. Used by the
 * withdraw button and, in slice 6, by the `wrong_number` and
 * `do_not_contact` outcomes. Does nothing to a row with no live consent
 * except clear a stray phone.
 */
export async function withdrawConsentOn(
  ctx: MutationCtx,
  visitor: Doc<"visitors">,
  byUserId: Id<"users">
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(visitor._id, {
    phone: undefined,
    consent:
      visitor.consent && visitor.consent.withdrawnAt === undefined
        ? { ...visitor.consent, withdrawnAt: now, withdrawnBy: byUserId }
        : visitor.consent,
    updatedAt: now,
  });
}

// -- Visit counters and follow ups ----------------------------------------

/**
 * Recompute a visitor's stored counters from their visit rows (spec 0024 key
 * invariants). Every visit writer calls this in the same mutation, so
 * `visitCount`, the first and last dates and `lastRegularMonth` can never
 * drift from what the visits say.
 *
 * Returns the visit count before and after, which is how a writer knows the
 * visitor just went from 0 to 1 and needs a follow up (AC-15).
 */
export async function recomputeVisitorCounters(
  ctx: MutationCtx,
  visitorId: Id<"visitors">
): Promise<{ before: number; after: number; firstVisitDate?: string }> {
  const visitor = await ctx.db.get(visitorId);
  if (!visitor) refuse("HOSPITALITY_VISITOR_NOT_FOUND");
  const visits = await ctx.db
    .query("visitorVisits")
    .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", visitorId))
    .collect();
  // Index order is ascending by date, so the ends are the first and last.
  const dates = visits.map((visit) => visit.visitDate);
  const firstVisitDate = dates[0];
  const lastVisitDate = dates[dates.length - 1];
  await ctx.db.patch(visitorId, {
    visitCount: dates.length,
    firstVisitDate,
    lastVisitDate,
    lastRegularMonth: regularMonthFrom(dates),
    updatedAt: Date.now(),
  });
  return { before: visitor.visitCount, after: dates.length, firstVisitDate };
}

/**
 * Start a visitor's follow up on their first ever visit (AC-15).
 *
 * Reuses the row when one already exists (their visits were deleted back to
 * zero and recorded again): reopened if done, with the outcome and close
 * fields cleared and `firstVisitDate` refreshed. So a visitor never has more
 * than one follow up row, except after a join.
 */
export async function openFollowUp(
  ctx: MutationCtx,
  visitorId: Id<"visitors">,
  firstVisitDate: string
): Promise<Id<"followUps">> {
  const existing = await ctx.db
    .query("followUps")
    .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
    .order("desc")
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "open",
      firstVisitDate,
      outcome: undefined,
      closedAt: undefined,
      closedBy: undefined,
      closeNote: undefined,
    });
    return existing._id;
  }
  return await ctx.db.insert("followUps", {
    visitorId,
    firstVisitDate,
    status: "open",
    attemptCount: 0,
    openedAt: Date.now(),
  });
}
