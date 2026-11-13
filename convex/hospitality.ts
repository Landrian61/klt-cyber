import { v, type ObjectType } from "convex/values";
import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { notificationCommon } from "./lib/reminders";
import {
  CONTACT_NOTE_MAX,
  HOSPITALITY_NOTE_MAX,
  IN_APP_MESSAGE_MAX,
  IN_APP_MESSAGE_MAX_RECIPIENTS,
  IN_APP_MESSAGE_TITLE,
  JOIN_MAX_ROWS,
  REGULAR_VISITS_PER_MONTH,
  WEEKLY_BIN_MAX_DAYS,
  cohortCompletionPercent,
  daysInRange,
  isValidReportRange,
  kampalaDayEndMs,
  kampalaDayStartMs,
  reportBins,
  clanAssignedElderNotice,
  clanAssignedMemberNotice,
  followUpAssignedNotice,
  smallestClanFlags,
  PROFILE_NAME_MAX,
  VISITOR_INVITED_BY_MAX,
  VISITOR_NOTES_MAX,
  buildVisitorSearchName,
  isAllowedVisitDate,
  isRegularOn,
  isDashboardPeriod,
  ATTENTION_LIST_SIZE,
  FOLLOW_UP_AGE_BUCKETS,
  FOLLOW_UP_OVERDUE_DAYS,
  REMOVED_VISITOR_LABEL,
  followUpAgeBucket,
  type FollowUpAgeBucket,
  BADGE_CAP,
  HOSPITALITY_DEPARTMENT_NAME,
  isContactOnTime,
  isOnTimeEligible,
  isBinSoFar,
  invitedSourceOf,
  MERGED_FOLLOW_UP_NOTE,
  CONTACT_OUTCOMES,
  INVITED_SOURCES,
  PERSONAL_CONTACT_CHANNELS,
  VISITOR_AGE_BRACKET_LABELS,
  VISITOR_KINDS,
  VISITOR_SEX_LABELS,
  type InvitedSource,
  type PersonalContactChannel,
  type VisitorJourneyStep,
  isPersonalContactChannel,
  dashboardWindow,
  daysBetweenKeys,
  kampalaDateKeyAt,
  medianOf,
  percentOf,
  type DashboardPeriod,
  type DateKeyRange,
  isValidDateKey,
  kampalaToday,
  normalizeMemberPhone,
  visitCountBucket,
  visitorDisplayName,
  type AgeBracket,
  type ContactChannel,
  type ContactOutcome,
  type FollowUpOutcome,
  type FollowUpStatus,
  type Sex,
  type VisitorKind,
  type VisitorListStatus,
} from "@klt-cyber/shared";
import { departmentCapabilities, logActivity } from "./lib/authz";
import {
  vAgeBracket,
  vContactOutcome,
  vLoggedContactChannel,
  vSex,
  vVisitCountBucket,
  vVisitorKind,
} from "./lib/hospitalityValidators";
import {
  assertInviterValid,
  cleanText,
  emptyPage,
  getVisitorOrRefuse,
  getWorkableVisitor,
  hasLiveConsent,
  hospitalityOperatorOrNull,
  isHospitalityLead,
  isHospitalityOperatorUser,
  openFollowUp,
  recomputeVisitorCounters,
  refuse,
  requireHospitalityOperator,
  staffName,
  withdrawConsentOn,
  type HospitalityOperator,
} from "./lib/hospitality";
import { anonymiseVisitor, ensureAppVisitorRow } from "./lib/visitorAccount";
import { binVisitors, type ReportBinRow } from "./lib/hospitalityStats";

// Hospitality core (spec 0024). Every function here is for an "operator": a
// caller holding `manageHospitality`, which only the Hospitality department
// grants (its HOD, delegates, verified roster and a System Admin). Mutations
// assert it through `requireHospitalityOperator`; queries resolve it through
// `hospitalityOperatorOrNull` and return nothing instead of throwing.
//
// Each mutation's body is an exported function taking the resolved operator,
// so the Convex tests drive the real rules without the Better Auth identity
// the harness cannot stand up (the same split `library.ts` uses).

type Operator = Pick<HospitalityOperator, "user" | "departmentId" | "role">;

// -- Visitors list ----------------------------------------------------------

export interface VisitorListRow {
  _id: Doc<"visitors">["_id"];
  displayName: string;
  kind: VisitorKind;
  visitCount: number;
  firstVisitDate?: string;
  lastVisitDate?: string;
  isFirstTimer: boolean;
  isRegular: boolean;
  followUpStatus: FollowUpStatus | null;
  contactAllowed: boolean;
  /** A walk in nobody has joined to an account: may get the app link. */
  canInvite: boolean;
  /** Has an app account, so may receive an in app message (AC-21). */
  canMessage: boolean;
  /** For the app link template's `{firstName}` (AC-29). */
  firstName: string;
  /**
   * The phone, only on a row that may get the app link right now: a walk in
   * with no account and a phone kept with consent (AC-29).
   */
  invitePhone?: string;
}

/** "Not recorded", for the sex and age filters (AC-11). */
const vNotRecorded = v.literal("none");

const listFilterArgs = {
  search: v.optional(v.string()),
  kind: v.optional(vVisitorKind),
  firstFrom: v.optional(v.string()),
  firstTo: v.optional(v.string()),
  visitBucket: v.optional(vVisitCountBucket),
  sex: v.optional(v.union(vSex, vNotRecorded)),
  ageBracket: v.optional(v.union(vAgeBracket, vNotRecorded)),
  followUp: v.optional(
    v.union(v.literal("open"), v.literal("done"), v.literal("none"))
  ),
  regular: v.optional(v.boolean()),
};
export type VisitorListFilters = ObjectType<typeof listFilterArgs>;

/**
 * The follow up that decides a visitor's status (value sourcing): the open
 * one when there is one, else the latest. After a join a visitor can hold
 * two rows (AC-28), and the one kept open may be the older of them.
 */
async function latestFollowUp(
  ctx: QueryCtx | MutationCtx,
  visitorId: Id<"visitors">
): Promise<Doc<"followUps"> | null> {
  const rows = await ctx.db
    .query("followUps")
    .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
    .order("desc")
    .collect();
  return rows.find((row) => row.status === "open") ?? rows[0] ?? null;
}

/**
 * The extra follow up a join closes (AC-28). It has no `closedBy`, since
 * nobody followed that visitor up, so it never counts as work done.
 */
function isMergedDuplicate(row: Doc<"followUps">): boolean {
  return row.closedBy === undefined && row.closeNote === MERGED_FOLLOW_UP_NOTE;
}

/**
 * One page of the Visitors list, after the authority check (AC-9 to AC-11).
 *
 * Only `listStatus` and `kind` reach the index (or the search filter); every
 * other filter runs over the page after the read, so a page can come back
 * short. The portal keeps loading while a page is short and more remain.
 * With a search term the search index orders by relevance and the date sort
 * no longer applies.
 */
export async function visitorListPage(
  ctx: QueryCtx,
  args: {
    paginationOpts: PaginationOptions;
    today: string;
  } & VisitorListFilters
) {
  const { paginationOpts, today } = args;
  const term = args.search ? buildVisitorSearchName(args.search) : "";

  const result = term
    ? await ctx.db
        .query("visitors")
        .withSearchIndex("search_name", (q) => {
          const base = q.search("searchName", term).eq("listStatus", "active");
          return args.kind ? base.eq("kind", args.kind) : base;
        })
        .paginate(paginationOpts)
    : await ctx.db
        .query("visitors")
        .withIndex("by_listStatus_lastVisitDate", (q) =>
          q.eq("listStatus", "active")
        )
        .order("desc")
        .paginate(paginationOpts);

  const rows = await Promise.all(
    result.page.map(async (visitor) => {
      const followUp = await latestFollowUp(ctx, visitor._id);
      const row: VisitorListRow = {
        _id: visitor._id,
        displayName: visitorDisplayName(visitor.firstName, visitor.lastName),
        kind: visitor.kind,
        visitCount: visitor.visitCount,
        firstVisitDate: visitor.firstVisitDate,
        lastVisitDate: visitor.lastVisitDate,
        isFirstTimer: visitor.visitCount === 1,
        isRegular: isRegularOn(visitor.lastRegularMonth, today),
        followUpStatus: followUp?.status ?? null,
        // A phone exists only with live consent (AC-22), so its presence is
        // the whole test.
        contactAllowed: visitor.phone !== undefined,
        canInvite: visitor.kind === "walk_in" && visitor.userId === undefined,
        canMessage: visitor.userId !== undefined,
        firstName: visitor.firstName,
        invitePhone:
          visitor.kind === "walk_in" && visitor.userId === undefined
            ? visitor.phone
            : undefined,
      };
      return { row, visitor };
    })
  );

  const page = rows
    .filter(({ row, visitor }) => matchesFilters(row, visitor, args))
    .map(({ row }) => row);

  return { ...result, page };
}

function matchesFilters(
  row: VisitorListRow,
  visitor: Doc<"visitors">,
  filters: VisitorListFilters
): boolean {
  if (filters.kind && visitor.kind !== filters.kind) return false;
  if (filters.firstFrom || filters.firstTo) {
    const first = visitor.firstVisitDate;
    if (!first) return false;
    if (filters.firstFrom && first < filters.firstFrom) return false;
    if (filters.firstTo && first > filters.firstTo) return false;
  }
  if (
    filters.visitBucket &&
    visitCountBucket(visitor.visitCount) !== filters.visitBucket
  ) {
    return false;
  }
  if (filters.sex && (visitor.sex ?? "none") !== filters.sex) return false;
  if (
    filters.ageBracket &&
    (visitor.ageBracket ?? "none") !== filters.ageBracket
  ) {
    return false;
  }
  if (filters.followUp && (row.followUpStatus ?? "none") !== filters.followUp) {
    return false;
  }
  if (filters.regular !== undefined && row.isRegular !== filters.regular) {
    return false;
  }
  return true;
}

/**
 * Every active visitor, walk in and app alike, newest `lastVisitDate` first
 * (AC-9), searchable and filterable (AC-11). App rows never recorded at a
 * service sort last, because an absent date is the lowest value in Convex
 * index order.
 *
 * `today` comes from the browser (`kampalaToday()` there), not the server
 * clock, so the subscription stays deterministic (spec 0012 convention). It
 * only decides `isRegular`.
 */
export const listVisitors = query({
  args: {
    paginationOpts: paginationOptsValidator,
    today: v.string(),
    ...listFilterArgs,
  },
  handler: async (ctx, args) => {
    if (!isValidDateKey(args.today)) refuse("HOSPITALITY_TODAY_INVALID");
    for (const date of [args.firstFrom, args.firstTo]) {
      if (date !== undefined && !isValidDateKey(date)) {
        refuse("HOSPITALITY_RANGE_INVALID");
      }
    }
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return emptyPage<VisitorListRow>();
    return await visitorListPage(ctx, args);
  },
});

/** How many matches the duplicate phone check returns, at most. */
const PHONE_MATCH_CAP = 5;

/**
 * Active visitors who already have this phone (AC-7), so the add walk in form
 * can offer "Record a visit for <name> instead". An unreadable phone matches
 * nothing rather than refusing, since the form calls this as the person types.
 */
export const findVisitorsByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    const normalized = normalizeMemberPhone(phone.trim());
    if (!normalized) return [];
    const rows = await ctx.db
      .query("visitors")
      .withIndex("by_phone", (q) => q.eq("phone", normalized))
      .take(PHONE_MATCH_CAP * 4);
    return rows
      .filter((row) => row.listStatus === "active")
      .slice(0, PHONE_MATCH_CAP)
      .map((row) => ({
        _id: row._id,
        displayName: visitorDisplayName(row.firstName, row.lastName),
        visitCount: row.visitCount,
        lastVisitDate: row.lastVisitDate,
      }));
  },
});

// -- Add a walk in -----------------------------------------------------------

const addWalkInArgs = {
  firstName: v.string(),
  lastName: v.optional(v.string()),
  phone: v.optional(v.string()),
  consent: v.optional(v.boolean()),
  sex: v.optional(vSex),
  ageBracket: v.optional(vAgeBracket),
  invitedByText: v.optional(v.string()),
  invitedByUserId: v.optional(v.id("users")),
  notes: v.optional(v.string()),
  visitDate: v.string(),
};

/**
 * Record a walk in at the welcome desk (AC-4 to AC-6).
 *
 * One save writes the visitor, their first visit and their follow up, and
 * logs it. The phone rule is enforced here, not only in the form: a phone
 * sent without `consent: true` is refused, so no client can store a number
 * the visitor did not agree to (AC-6, AC-22).
 */
export const addWalkIn = mutation({
  args: addWalkInArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    // Today is the server's Kampala day: a write may read the clock.
    return await insertWalkIn(ctx, operator, args, kampalaToday());
  },
});

/** The body of {@link addWalkIn}, after the authority check. */
export async function insertWalkIn(
  ctx: MutationCtx,
  { user, departmentId }: Pick<HospitalityOperator, "user" | "departmentId">,
  args: ObjectType<typeof addWalkInArgs>,
  today: string
): Promise<{ visitorId: Id<"visitors"> }> {
  const firstName = cleanText(
    args.firstName,
    PROFILE_NAME_MAX,
    "HOSPITALITY_NAME_TOO_LONG"
  );
  if (!firstName) refuse("HOSPITALITY_FIRST_NAME_REQUIRED");
  const lastName = cleanText(
    args.lastName,
    PROFILE_NAME_MAX,
    "HOSPITALITY_NAME_TOO_LONG"
  );
  const invitedByText = cleanText(
    args.invitedByText,
    VISITOR_INVITED_BY_MAX,
    "HOSPITALITY_INVITED_BY_TOO_LONG"
  );
  const notes = cleanText(
    args.notes,
    VISITOR_NOTES_MAX,
    "HOSPITALITY_NOTES_TOO_LONG"
  );

  if (!isAllowedVisitDate(args.visitDate, today)) {
    refuse("HOSPITALITY_VISIT_DATE_INVALID");
  }

  let phone: string | undefined;
  const rawPhone = args.phone?.trim();
  if (rawPhone) {
    const normalized = normalizeMemberPhone(rawPhone);
    if (!normalized) refuse("HOSPITALITY_PHONE_INVALID");
    if (args.consent !== true) refuse("HOSPITALITY_CONSENT_REQUIRED");
    phone = normalized;
  }

  if (args.invitedByUserId) await assertInviterValid(ctx, args.invitedByUserId);

  const now = Date.now();
  const visitorId = await ctx.db.insert("visitors", {
    kind: "walk_in",
    firstName,
    lastName,
    searchName: buildVisitorSearchName(firstName, lastName),
    phone,
    sex: args.sex,
    ageBracket: args.ageBracket,
    invitedByText,
    invitedByUserId: args.invitedByUserId,
    notes,
    consent: phone ? { givenAt: now, givenBy: user._id } : undefined,
    visitCount: 0,
    listStatus: "active",
    createdBy: user._id,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("visitorVisits", {
    visitorId,
    visitDate: args.visitDate,
    recordedBy: user._id,
    recordedAt: now,
  });
  const counts = await recomputeVisitorCounters(ctx, visitorId);
  // 0 → 1, so the follow up opens (AC-15).
  const followUpId = await openFollowUp(
    ctx,
    visitorId,
    counts.firstVisitDate ?? args.visitDate
  );

  // No name or phone in the entry: the target id is enough to find the
  // record, and a later removal can then anonymise the row alone (AC-25).
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.walk_in_added",
    targetType: "visitor",
    targetId: visitorId,
    metadata: {
      visitDate: args.visitDate,
      withPhone: phone !== undefined,
      followUpId,
    },
    departmentId,
  });

  return { visitorId };
}

// -- Inviter picker ----------------------------------------------------------

/** How many verified profiles the inviter search reads, at most. */
const INVITER_SCAN_CAP = 2000;
/** How many matches it returns. */
const INVITER_RESULT_CAP = 20;

/**
 * Verified members an operator may name as the inviter (AC-4,
 * `invitedByUserId`). Names only: no phone or email leaves this query.
 *
 * Scanned through `by_profileStatus` rather than searched, the same bounded
 * approach as `searchResponsibleMembers`: there is no name index on profiles,
 * and matching happens before the cap so a late joiner is still findable.
 * Deleted accounts are left out, since they can no longer invite anyone.
 */
export const searchInviters = query({
  args: { query: v.string() },
  handler: async (ctx, { query: term }) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];

    const profiles = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
      .take(INVITER_SCAN_CAP);

    const matches = profiles
      .map((profile) => ({
        userId: profile.userId,
        name: visitorDisplayName(profile.firstName, profile.lastName),
      }))
      .filter((row) => row.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, INVITER_RESULT_CAP * 2);

    const live = await Promise.all(
      matches.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        return user && user.deletedAt === undefined ? row : null;
      })
    );
    return live
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .slice(0, INVITER_RESULT_CAP);
  },
});

// -- App visitors (slice 2) -------------------------------------------------

/**
 * The sign up hook's write (AC-8): scheduled from Better Auth's `onCreate`
 * with `runAfter(0, …)`, so it can never block a sign up. Idempotent.
 */
export const ensureAppVisitor = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return { visitorId: await ensureAppVisitorRow(ctx, userId) };
  },
});

// -- Visits (slice 3) --------------------------------------------------------

const recordVisitArgs = {
  visitorId: v.id("visitors"),
  visitDate: v.string(),
};

/**
 * A return visit, for a walk in or an app visitor alike (AC-12). A visitor's
 * first ever visit opens their follow up (AC-15).
 */
export const recordVisit = mutation({
  args: recordVisitArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await recordVisitFor(ctx, operator, args, kampalaToday());
  },
});

/** The body of {@link recordVisit}, after the authority check. */
export async function recordVisitFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { visitorId, visitDate }: ObjectType<typeof recordVisitArgs>,
  today: string
): Promise<{ visitId: Id<"visitorVisits">; openedFollowUp: boolean }> {
  await getWorkableVisitor(ctx, visitorId);
  if (!isAllowedVisitDate(visitDate, today)) {
    refuse("HOSPITALITY_VISIT_DATE_INVALID");
  }
  const existing = await ctx.db
    .query("visitorVisits")
    .withIndex("by_visitorId_visitDate", (q) =>
      q.eq("visitorId", visitorId).eq("visitDate", visitDate)
    )
    .first();
  if (existing) refuse("HOSPITALITY_VISIT_EXISTS");

  const visitId = await ctx.db.insert("visitorVisits", {
    visitorId,
    visitDate,
    recordedBy: user._id,
    recordedAt: Date.now(),
  });
  const counts = await recomputeVisitorCounters(ctx, visitorId);
  const openedFollowUp = counts.before === 0 && counts.after === 1;
  if (openedFollowUp) {
    await openFollowUp(ctx, visitorId, counts.firstVisitDate ?? visitDate);
  }

  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.visit_recorded",
    targetType: "visitor",
    targetId: visitorId,
    metadata: { visitDate, visitId, openedFollowUp },
    departmentId,
  });
  return { visitId, openedFollowUp };
}

const deleteVisitArgs = { visitId: v.id("visitorVisits") };

/**
 * Delete a visit recorded by mistake (AC-13). The recorder may delete their
 * own; the HOD, a delegate or a System Admin may delete any. When the
 * recorder's account is gone, only those three can, since nobody else is the
 * recorder.
 */
export const deleteVisit = mutation({
  args: deleteVisitArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await deleteVisitFor(ctx, operator, args);
  },
});

/** The body of {@link deleteVisit}, after the authority check. */
export async function deleteVisitFor(
  ctx: MutationCtx,
  { user, departmentId, role }: Operator,
  { visitId }: ObjectType<typeof deleteVisitArgs>
): Promise<{ ok: true }> {
  const visit = await ctx.db.get(visitId);
  if (!visit) refuse("HOSPITALITY_VISIT_NOT_FOUND");
  if (!isHospitalityLead(role) && visit.recordedBy !== user._id) {
    refuse("HOSPITALITY_NOT_ALLOWED");
  }
  await getWorkableVisitor(ctx, visit.visitorId);

  await ctx.db.delete(visitId);
  const counts = await recomputeVisitorCounters(ctx, visit.visitorId);

  const followUp = await latestFollowUp(ctx, visit.visitorId);
  let followUpDeleted = false;
  if (followUp) {
    if (counts.after === 0) {
      // Back to no visits: an untouched follow up was only ever about this
      // mistaken visit, so it goes with it. One with contacts is history.
      const contact = await ctx.db
        .query("visitorContacts")
        .withIndex("by_followUpId", (q) => q.eq("followUpId", followUp._id))
        .first();
      if (!contact) {
        await ctx.db.delete(followUp._id);
        followUpDeleted = true;
      }
    } else if (
      followUp.status === "open" &&
      counts.firstVisitDate &&
      followUp.firstVisitDate !== counts.firstVisitDate
    ) {
      // Keeps "longest waiting first" honest on the Follow ups page.
      await ctx.db.patch(followUp._id, { firstVisitDate: counts.firstVisitDate });
    }
  }

  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.visit_deleted",
    targetType: "visitor",
    targetId: visit.visitorId,
    metadata: { visitDate: visit.visitDate, followUpDeleted },
    departmentId,
  });
  return { ok: true };
}

// -- The visitor record (slice 5) ------------------------------------------

/** How many history entries the record page shows. */
const HISTORY_CAP = 50;

/**
 * Everything the visitor record page shows (AC-14): details, visits newest
 * first, the follow up, the contact history and the audit history. Staff
 * references whose account is gone read "a former member".
 *
 * `accountPhone` never leaves the server: it is only a join key.
 */
export const getVisitor = query({
  args: { visitorId: v.id("visitors") },
  handler: async (ctx, { visitorId }) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await visitorRecord(ctx, operator, visitorId);
  },
});

/** The body of {@link getVisitor}, after the authority check. */
export async function visitorRecord(
  ctx: QueryCtx,
  { user, role }: Operator,
  visitorId: Id<"visitors">
) {
  const visitor = await ctx.db.get(visitorId);
  if (!visitor) return null;

  const account = visitor.userId ? await ctx.db.get(visitor.userId) : null;
  const liveAccount = account && account.deletedAt === undefined ? account : null;

  const visits = await ctx.db
    .query("visitorVisits")
    .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", visitorId))
    .order("desc")
    .collect();
  const lead = isHospitalityLead(role);

  const followUp = await latestFollowUp(ctx, visitorId);
  const contacts = await ctx.db
    .query("visitorContacts")
    .withIndex("by_visitorId_at", (q) => q.eq("visitorId", visitorId))
    .order("desc")
    .collect();
  const history = await ctx.db
    .query("activityLogs")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "visitor").eq("targetId", visitorId)
    )
    .order("desc")
    .take(HISTORY_CAP);

  const consent = visitor.consent;
  const live = hasLiveConsent(visitor);

  return {
    _id: visitor._id,
    kind: visitor.kind,
    listStatus: visitor.listStatus as VisitorListStatus,
    displayName: visitorDisplayName(visitor.firstName, visitor.lastName),
    firstName: visitor.firstName,
    lastName: visitor.lastName,
    hasAccount: visitor.userId !== undefined,
    accountEmail: liveAccount?.email,
    phone: visitor.phone,
    sex: visitor.sex as Sex | undefined,
    ageBracket: visitor.ageBracket as AgeBracket | undefined,
    invitedByText: visitor.invitedByText,
    invitedByUserId: visitor.invitedByUserId,
    invitedByName: await staffName(ctx, visitor.invitedByUserId),
    notes: visitor.notes,
    visitCount: visitor.visitCount,
    firstVisitDate: visitor.firstVisitDate,
    lastVisitDate: visitor.lastVisitDate,
    lastRegularMonth: visitor.lastRegularMonth,
    createdAt: visitor.createdAt,
    consent: consent
      ? {
          live,
          givenAt: consent.givenAt,
          givenByName: await staffName(ctx, consent.givenBy),
          note: consent.note,
          withdrawnAt: consent.withdrawnAt,
          withdrawnByName: await staffName(ctx, consent.withdrawnBy),
        }
      : null,
    // Removal is for walk ins with no account (AC-25).
    canRemove:
      visitor.kind === "walk_in" &&
      visitor.userId === undefined &&
      visitor.listStatus === "active",
    canEditName: visitor.kind === "walk_in",
    // A walk in nobody has joined yet may be joined to an account (AC-27).
    canJoin:
      visitor.kind === "walk_in" &&
      visitor.userId === undefined &&
      visitor.listStatus === "active",
    visits: await Promise.all(
      visits.map(async (visit) => ({
        _id: visit._id,
        visitDate: visit.visitDate,
        recordedAt: visit.recordedAt,
        recordedByName: await staffName(ctx, visit.recordedBy),
        canDelete: lead || visit.recordedBy === user._id,
      }))
    ),
    followUp: followUp
      ? {
          _id: followUp._id,
          status: followUp.status as FollowUpStatus,
          outcome: followUp.outcome as FollowUpOutcome | undefined,
          attemptCount: followUp.attemptCount,
          firstVisitDate: followUp.firstVisitDate,
          assignedTo: followUp.assignedTo,
          assignedToName: await staffName(ctx, followUp.assignedTo),
          openedAt: followUp.openedAt,
          closedAt: followUp.closedAt,
          closedByName: await staffName(ctx, followUp.closedBy),
          closeNote: followUp.closeNote,
        }
      : null,
    contacts: await Promise.all(
      contacts.map(async (contact) => ({
        _id: contact._id,
        channel: contact.channel as ContactChannel,
        outcome: contact.outcome as ContactOutcome | undefined,
        note: contact.note,
        at: contact.at,
        byName: await staffName(ctx, contact.byUserId),
      }))
    ),
    history: await Promise.all(
      history.map(async (entry) => ({
        _id: entry._id,
        action: entry.action,
        at: entry._creationTime,
        byName: await staffName(ctx, entry.actorUserId),
      }))
    ),
  };
}

/** The optional fields the record page can clear. */
const vClearableField = v.union(
  v.literal("lastName"),
  v.literal("sex"),
  v.literal("ageBracket"),
  v.literal("invitedByText"),
  v.literal("invitedByUserId"),
  v.literal("notes")
);

const updateVisitorArgs = {
  visitorId: v.id("visitors"),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  sex: v.optional(vSex),
  ageBracket: v.optional(vAgeBracket),
  invitedByText: v.optional(v.string()),
  invitedByUserId: v.optional(v.id("users")),
  notes: v.optional(v.string()),
  clear: v.optional(v.array(vClearableField)),
  // Accepted only to be refused: the phone changes through `setConsent`, so
  // the consent is always recorded with it (AC-24).
  phone: v.optional(v.string()),
};

/**
 * Edit a visitor's details (AC-14). Walk ins: every AC-4 field. App
 * visitors: everything but the name, which belongs to the account.
 */
export const updateVisitor = mutation({
  args: updateVisitorArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await updateVisitorFor(ctx, operator, args);
  },
});

type EditableField =
  | "firstName"
  | "lastName"
  | "sex"
  | "ageBracket"
  | "invitedByText"
  | "invitedByUserId"
  | "notes";

/** The body of {@link updateVisitor}, after the authority check. */
export async function updateVisitorFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  args: ObjectType<typeof updateVisitorArgs>
): Promise<{ ok: true; changed: EditableField[] }> {
  if (args.phone !== undefined) refuse("HOSPITALITY_PHONE_VIA_CONSENT");
  const visitor = await getWorkableVisitor(ctx, args.visitorId, {
    allowMember: true,
  });
  const clear = new Set(args.clear ?? []);

  const next: Partial<Pick<Doc<"visitors">, EditableField>> = {};
  if (args.firstName !== undefined) {
    const firstName = cleanText(
      args.firstName,
      PROFILE_NAME_MAX,
      "HOSPITALITY_NAME_TOO_LONG"
    );
    if (!firstName) refuse("HOSPITALITY_FIRST_NAME_REQUIRED");
    next.firstName = firstName;
  }
  if (args.lastName !== undefined) {
    next.lastName = cleanText(
      args.lastName,
      PROFILE_NAME_MAX,
      "HOSPITALITY_NAME_TOO_LONG"
    );
  }
  if (args.sex !== undefined) next.sex = args.sex;
  if (args.ageBracket !== undefined) next.ageBracket = args.ageBracket;
  if (args.invitedByText !== undefined) {
    next.invitedByText = cleanText(
      args.invitedByText,
      VISITOR_INVITED_BY_MAX,
      "HOSPITALITY_INVITED_BY_TOO_LONG"
    );
  }
  if (args.invitedByUserId !== undefined) {
    await assertInviterValid(ctx, args.invitedByUserId);
    next.invitedByUserId = args.invitedByUserId;
  }
  if (args.notes !== undefined) {
    next.notes = cleanText(
      args.notes,
      VISITOR_NOTES_MAX,
      "HOSPITALITY_NOTES_TOO_LONG"
    );
  }
  for (const field of clear) next[field] = undefined;

  // Only what really moved counts, so an unchanged save is quiet.
  const changed = (Object.keys(next) as EditableField[]).filter(
    (field) => next[field] !== visitor[field]
  );
  if (changed.length === 0) return { ok: true, changed };

  const touchesName = changed.includes("firstName") || changed.includes("lastName");
  if (touchesName && visitor.kind === "app") refuse("HOSPITALITY_APP_NAME_LOCKED");

  const patch: Partial<Doc<"visitors">> = { updatedAt: Date.now() };
  for (const field of changed) {
    (patch as Record<string, unknown>)[field] = next[field];
  }
  if (touchesName) {
    const account = visitor.userId ? await ctx.db.get(visitor.userId) : null;
    patch.searchName = buildVisitorSearchName(
      next.firstName ?? visitor.firstName,
      "lastName" in next ? next.lastName : visitor.lastName,
      account && account.deletedAt === undefined ? account.email : undefined
    );
  }
  await ctx.db.patch(visitor._id, patch);

  // Field names only, never the values: the audit trail carries no personal
  // data (spec 0024 key invariants).
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.visitor_updated",
    targetType: "visitor",
    targetId: visitor._id,
    metadata: { fields: changed },
    departmentId,
  });
  return { ok: true, changed };
}

// -- Consent and removal -----------------------------------------------------

const setConsentArgs = {
  visitorId: v.id("visitors"),
  phone: v.string(),
  consent: v.optional(v.boolean()),
  note: v.optional(v.string()),
};

/**
 * The one way a phone is set or changed (AC-24).
 *
 * - Consent live: the phone changes, the consent stays, no note needed.
 * - No consent ever: consent ticked, no note needed.
 * - Consent withdrawn before: consent ticked AND a note saying why.
 */
export const setConsent = mutation({
  args: setConsentArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await setConsentFor(ctx, operator, args);
  },
});

/** The body of {@link setConsent}, after the authority check. */
export async function setConsentFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  args: ObjectType<typeof setConsentArgs>
): Promise<{ ok: true }> {
  const visitor = await getWorkableVisitor(ctx, args.visitorId, {
    allowMember: true,
  });
  const phone = normalizeMemberPhone(args.phone.trim());
  if (!phone) refuse("HOSPITALITY_PHONE_INVALID");
  const now = Date.now();

  if (hasLiveConsent(visitor)) {
    if (phone === visitor.phone) return { ok: true };
    await ctx.db.patch(visitor._id, { phone, updatedAt: now });
    await logActivity(ctx, {
      actorUserId: user._id,
      action: "hospitality.phone_changed",
      targetType: "visitor",
      targetId: visitor._id,
      departmentId,
    });
    return { ok: true };
  }

  if (args.consent !== true) refuse("HOSPITALITY_CONSENT_REQUIRED");
  const again = visitor.consent !== undefined;
  const note = cleanText(args.note, HOSPITALITY_NOTE_MAX, "HOSPITALITY_NOTE_TOO_LONG");
  if (again && !note) refuse("HOSPITALITY_NOTE_REQUIRED");

  await ctx.db.patch(visitor._id, {
    phone,
    consent: { givenAt: now, givenBy: user._id, note },
    updatedAt: now,
  });
  await logActivity(ctx, {
    actorUserId: user._id,
    action: again
      ? "hospitality.consent_given_again"
      : "hospitality.consent_given",
    targetType: "visitor",
    targetId: visitor._id,
    departmentId,
  });
  return { ok: true };
}

const withdrawConsentArgs = { visitorId: v.id("visitors") };

/**
 * Withdraw consent on the visitor's request (AC-23): the phone goes, so the
 * call, WhatsApp and SMS buttons go with it, and so does any SMS eligibility.
 */
export const withdrawConsent = mutation({
  args: withdrawConsentArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await withdrawConsentFor(ctx, operator, args);
  },
});

/** The body of {@link withdrawConsent}, after the authority check. */
export async function withdrawConsentFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { visitorId }: ObjectType<typeof withdrawConsentArgs>
): Promise<{ ok: true }> {
  const visitor = await getVisitorOrRefuse(ctx, visitorId);
  if (!hasLiveConsent(visitor)) refuse("HOSPITALITY_NO_LIVE_CONSENT");
  await withdrawConsentOn(ctx, visitor, user._id);
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.consent_withdrawn",
    targetType: "visitor",
    targetId: visitorId,
    departmentId,
  });
  return { ok: true };
}

const removeWalkInArgs = {
  visitorId: v.id("visitors"),
  confirm: v.string(),
};

/**
 * Remove a walk in on request (AC-25), after a typed confirmation. The row is
 * anonymised rather than deleted, so its visit dates keep report totals true.
 * A row with an account is refused: that person leaves through account
 * deletion.
 */
export const removeWalkIn = mutation({
  args: removeWalkInArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await removeWalkInFor(ctx, operator, args);
  },
});

/** The body of {@link removeWalkIn}, after the authority check. */
export async function removeWalkInFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { visitorId, confirm }: ObjectType<typeof removeWalkInArgs>
): Promise<{ ok: true }> {
  if (confirm !== "REMOVE") refuse("HOSPITALITY_REMOVE_CONFIRM");
  const visitor = await getVisitorOrRefuse(ctx, visitorId);
  if (visitor.userId !== undefined) refuse("HOSPITALITY_REMOVE_ACCOUNT_ROW");
  if (visitor.listStatus !== "active") refuse("HOSPITALITY_VISITOR_NOT_ACTIVE");

  await anonymiseVisitor(ctx, visitorId, user._id);

  // No personal data: the id alone (AC-25).
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.visitor_removed",
    targetType: "visitor",
    targetId: visitorId,
    departmentId,
  });
  return { ok: true };
}

export type VisitorRecord = NonNullable<Awaited<ReturnType<typeof visitorRecord>>>;

// -- Follow ups (slice 6) ----------------------------------------------------

export interface FollowUpListRow {
  _id: Id<"followUps">;
  status: FollowUpStatus;
  outcome?: FollowUpOutcome;
  firstVisitDate: string;
  attemptCount: number;
  closedAt?: number;
  closedByName: string | null;
  closeNote?: string;
  assignedTo?: Id<"users">;
  assignedToName: string | null;
  /** Assigned to someone who is no longer an operator (AC-20). */
  assigneeFormer: boolean;
  visitor: {
    _id: Id<"visitors">;
    displayName: string;
    firstName: string;
    kind: VisitorKind;
    hasAccount: boolean;
    phone?: string;
    lastVisitDate?: string;
    listStatus: VisitorListStatus;
  };
}

const vFollowUpTab = v.union(v.literal("open"), v.literal("done"));

/**
 * The Follow ups page (AC-16). Open: longest waiting first, optionally only
 * the caller's ("Mine"). Done: most recently closed first.
 */
export const listFollowUps = query({
  args: {
    paginationOpts: paginationOptsValidator,
    tab: vFollowUpTab,
    mine: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return emptyPage<FollowUpListRow>();
    return await followUpListPage(ctx, operator, args);
  },
});

/** The body of {@link listFollowUps}, after the authority check. */
export async function followUpListPage(
  ctx: QueryCtx,
  { user, departmentId }: Operator,
  {
    paginationOpts,
    tab,
    mine,
  }: { paginationOpts: PaginationOptions; tab: "open" | "done"; mine?: boolean }
) {
  const result =
    tab === "open"
      ? mine
        ? await ctx.db
            .query("followUps")
            .withIndex("by_assignedTo_status_firstVisitDate", (q) =>
              q.eq("assignedTo", user._id).eq("status", "open")
            )
            .order("asc")
            .paginate(paginationOpts)
        : await ctx.db
            .query("followUps")
            .withIndex("by_status_firstVisitDate", (q) => q.eq("status", "open"))
            .order("asc")
            .paginate(paginationOpts)
      : await ctx.db
          .query("followUps")
          .withIndex("by_status_closedAt", (q) => q.eq("status", "done"))
          .order("desc")
          .paginate(paginationOpts);

  // An assignee's operator standing is read once per person, not per row.
  const standing = new Map<Id<"users">, boolean>();
  const isOperator = async (userId: Id<"users">) => {
    if (!standing.has(userId)) {
      standing.set(userId, await isHospitalityOperatorUser(ctx, userId, departmentId));
    }
    return standing.get(userId)!;
  };

  const page = (
    await Promise.all(
      result.page.map(async (followUp): Promise<FollowUpListRow | null> => {
        const visitor = await ctx.db.get(followUp.visitorId);
        if (!visitor) return null;
        return {
          _id: followUp._id,
          status: followUp.status,
          outcome: followUp.outcome,
          firstVisitDate: followUp.firstVisitDate,
          attemptCount: followUp.attemptCount,
          closedAt: followUp.closedAt,
          closedByName: await staffName(ctx, followUp.closedBy),
          closeNote: followUp.closeNote,
          assignedTo: followUp.assignedTo,
          assignedToName: await staffName(ctx, followUp.assignedTo),
          assigneeFormer: followUp.assignedTo
            ? !(await isOperator(followUp.assignedTo))
            : false,
          visitor: {
            _id: visitor._id,
            displayName: visitorDisplayName(visitor.firstName, visitor.lastName),
            firstName: visitor.firstName,
            kind: visitor.kind,
            hasAccount: visitor.userId !== undefined,
            phone: visitor.phone,
            lastVisitDate: visitor.lastVisitDate,
            listStatus: visitor.listStatus,
          },
        };
      })
    )
  ).filter((row): row is FollowUpListRow => row !== null);

  return { ...result, page };
}

/**
 * Who a follow up can be given to (AC-20, value sourcing): Hospitality's
 * active HOD and delegates, plus its active roster members whose profile is
 * verified. Live accounts only, sorted by name.
 */
export const listAssignableOperators = query({
  args: {},
  handler: async (ctx) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    const { departmentId } = operator;

    const candidates = new Set<Id<"users">>();
    const roles = await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .collect();
    for (const role of roles) {
      if (
        role.status === "active" &&
        (role.roleType === "hod" || role.roleType === "department_admin")
      ) {
        candidates.add(role.userId);
      }
    }
    const memberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", departmentId).eq("status", "active")
      )
      .collect();
    for (const membership of memberships) candidates.add(membership.userId);

    const rows = await Promise.all(
      [...candidates].map(async (userId) =>
        (await isHospitalityOperatorUser(ctx, userId, departmentId))
          ? { userId, name: (await staffName(ctx, userId)) ?? "" }
          : null
      )
    );
    return rows
      .filter((row): row is { userId: Id<"users">; name: string } => row !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

async function openFollowUpOrRefuse(
  ctx: MutationCtx,
  followUpId: Id<"followUps">
): Promise<Doc<"followUps">> {
  const followUp = await ctx.db.get(followUpId);
  if (!followUp) refuse("HOSPITALITY_FOLLOW_UP_NOT_FOUND");
  if (followUp.status !== "open") refuse("HOSPITALITY_FOLLOW_UP_CLOSED");
  return followUp;
}

const assignFollowUpArgs = {
  followUpId: v.id("followUps"),
  assigneeUserId: v.id("users"),
};

/**
 * Give an open follow up to a Hospitality operator (AC-20). The assignee
 * hears about it through N36 unless they took it themselves.
 */
export const assignFollowUp = mutation({
  args: assignFollowUpArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await assignFollowUpFor(ctx, operator, args);
  },
});

/** The body of {@link assignFollowUp}, after the authority check. */
export async function assignFollowUpFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { followUpId, assigneeUserId }: ObjectType<typeof assignFollowUpArgs>
): Promise<{ ok: true; notified: boolean }> {
  const followUp = await openFollowUpOrRefuse(ctx, followUpId);
  if (!(await isHospitalityOperatorUser(ctx, assigneeUserId, departmentId))) {
    refuse("HOSPITALITY_ASSIGNEE_INVALID");
  }
  if (followUp.assignedTo === assigneeUserId) return { ok: true, notified: false };

  await ctx.db.patch(followUpId, {
    assignedTo: assigneeUserId,
    assignedBy: user._id,
    assignedAt: Date.now(),
  });
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.follow_up_assigned",
    targetType: "visitor",
    targetId: followUp.visitorId,
    metadata: { followUpId, assigneeUserId },
    departmentId,
  });

  const notified = assigneeUserId !== user._id;
  if (notified) {
    const visitor = await ctx.db.get(followUp.visitorId);
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      ...followUpAssignedNotice(visitor?.firstName ?? "a visitor"),
      ...notificationCommon({
        audience: { type: "users", userIds: [assigneeUserId] },
        deepLink: { type: "hospitality_follow_up", id: followUpId },
        createdBy: user._id,
        kind: "N36",
      }),
    });
  }
  return { ok: true, notified };
}

const recordContactArgs = {
  visitorId: v.id("visitors"),
  followUpId: v.optional(v.id("followUps")),
  channel: vLoggedContactChannel,
  outcome: vContactOutcome,
  note: v.optional(v.string()),
};

/**
 * Log one contact attempt and apply its outcome (AC-18).
 *
 * The follow up is the one the client names, never inferred: a contact with
 * a regular, or after the follow up closed, is logged with no follow up. A
 * wrong number or a "please don't contact me" clears the phone whether or not
 * a follow up is attached, which keeps the AC-22 invariant.
 */
export const recordContact = mutation({
  args: recordContactArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await recordContactFor(ctx, operator, args);
  },
});

/** The body of {@link recordContact}, after the authority check. */
export async function recordContactFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  args: ObjectType<typeof recordContactArgs>
): Promise<{ contactId: Id<"visitorContacts">; followUpStatus: FollowUpStatus | null }> {
  const visitor = await getWorkableVisitor(ctx, args.visitorId, { allowMember: true });
  const note = cleanText(args.note, CONTACT_NOTE_MAX, "HOSPITALITY_NOTE_TOO_LONG");

  let followUp: Doc<"followUps"> | null = null;
  if (args.followUpId) {
    followUp = await ctx.db.get(args.followUpId);
    if (!followUp || followUp.visitorId !== visitor._id) {
      refuse("HOSPITALITY_FOLLOW_UP_NOT_FOUND");
    }
    if (followUp.status !== "open") refuse("HOSPITALITY_FOLLOW_UP_CLOSED");
  }
  // A call, WhatsApp or SMS needs the phone kept with consent; in person
  // needs nothing.
  if (args.channel !== "in_person" && visitor.phone === undefined) {
    refuse("HOSPITALITY_CONTACT_NEEDS_PHONE");
  }

  const now = Date.now();
  const contactId = await ctx.db.insert("visitorContacts", {
    visitorId: visitor._id,
    followUpId: followUp?._id,
    channel: args.channel,
    outcome: args.outcome,
    note,
    byUserId: user._id,
    at: now,
  });

  let followUpStatus: FollowUpStatus | null = followUp?.status ?? null;
  if (followUp) {
    if (args.outcome === "no_answer") {
      await ctx.db.patch(followUp._id, { attemptCount: followUp.attemptCount + 1 });
    } else {
      await ctx.db.patch(followUp._id, {
        status: "done",
        outcome: args.outcome,
        closedAt: now,
        closedBy: user._id,
      });
      followUpStatus = "done";
    }
  }

  if (args.outcome === "do_not_contact") {
    // They asked: consent is withdrawn, on the record, with the phone gone.
    await withdrawConsentOn(ctx, visitor, user._id);
  } else if (args.outcome === "wrong_number") {
    // Not theirs: the number and the consent attached to it are cleared, so
    // a correct number later is a first consent, not a re-consent.
    await ctx.db.patch(visitor._id, {
      phone: undefined,
      consent: undefined,
      updatedAt: now,
    });
  }

  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.contact_logged",
    targetType: "visitor",
    targetId: visitor._id,
    metadata: {
      contactId,
      channel: args.channel,
      outcome: args.outcome,
      followUpId: followUp?._id,
    },
    departmentId,
  });
  return { contactId, followUpStatus };
}

const closeFollowUpArgs = {
  followUpId: v.id("followUps"),
  note: v.string(),
};

/** Close an open follow up by hand, with a reason (AC-19). */
export const closeFollowUp = mutation({
  args: closeFollowUpArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await closeFollowUpFor(ctx, operator, args);
  },
});

/** The body of {@link closeFollowUp}, after the authority check. */
export async function closeFollowUpFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { followUpId, note }: ObjectType<typeof closeFollowUpArgs>
): Promise<{ ok: true }> {
  const followUp = await openFollowUpOrRefuse(ctx, followUpId);
  const closeNote = cleanText(note, HOSPITALITY_NOTE_MAX, "HOSPITALITY_NOTE_TOO_LONG");
  if (!closeNote) refuse("HOSPITALITY_NOTE_REQUIRED");
  await ctx.db.patch(followUpId, {
    status: "done",
    outcome: "closed",
    closedAt: Date.now(),
    closedBy: user._id,
    closeNote,
  });
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.follow_up_closed",
    targetType: "visitor",
    targetId: followUp.visitorId,
    metadata: { followUpId },
    departmentId,
  });
  return { ok: true };
}

// -- In app message (slice 7) -----------------------------------------------

const sendInAppMessageArgs = {
  visitorIds: v.array(v.id("visitors")),
  body: v.string(),
};

/**
 * Send an in app message to selected app visitors (AC-21, H2-05, N41).
 *
 * All or nothing: every selected row must still be an active or member row
 * with a live account, or nothing is sent. The contacts are written in this
 * mutation and the push is scheduled after it, so a push failure never undoes
 * the logged contacts. Follow up attempt counts are left alone.
 */
export const sendInAppMessage = mutation({
  args: sendInAppMessageArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await sendInAppMessageFor(ctx, operator, args);
  },
});

/** The body of {@link sendInAppMessage}, after the authority check. */
export async function sendInAppMessageFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  args: ObjectType<typeof sendInAppMessageArgs>
): Promise<{ sent: number }> {
  const visitorIds = [...new Set(args.visitorIds)];
  if (visitorIds.length < 1 || visitorIds.length > IN_APP_MESSAGE_MAX_RECIPIENTS) {
    refuse("HOSPITALITY_RECIPIENT_COUNT");
  }
  const body = args.body.trim();
  if (!body) refuse("HOSPITALITY_MESSAGE_REQUIRED");
  if (body.length > IN_APP_MESSAGE_MAX) refuse("HOSPITALITY_MESSAGE_TOO_LONG");

  // Check every recipient before writing anything.
  const recipients: { visitorId: Id<"visitors">; userId: Id<"users"> }[] = [];
  for (const visitorId of visitorIds) {
    const visitor = await ctx.db.get(visitorId);
    const live =
      visitor &&
      visitor.userId !== undefined &&
      (visitor.listStatus === "active" || visitor.listStatus === "member");
    const account = live ? await ctx.db.get(visitor.userId!) : null;
    if (!live || !account || account.deletedAt !== undefined) {
      refuse("HOSPITALITY_RECIPIENT_INVALID");
    }
    recipients.push({ visitorId, userId: account._id });
  }

  const now = Date.now();
  for (const { visitorId } of recipients) {
    // The message itself is the note, so the record shows what was said.
    await ctx.db.insert("visitorContacts", {
      visitorId,
      channel: "in_app",
      note: body,
      byUserId: user._id,
      at: now,
    });
    await logActivity(ctx, {
      actorUserId: user._id,
      action: "hospitality.in_app_message_sent",
      targetType: "visitor",
      targetId: visitorId,
      metadata: { recipients: recipients.length },
      departmentId,
    });
  }

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: IN_APP_MESSAGE_TITLE,
    body,
    ...notificationCommon({
      audience: { type: "users", userIds: recipients.map((row) => row.userId) },
      // Read in place in the notification list; mobile has no screen for it.
      deepLink: { type: "hospitality_message", id: departmentId },
      createdBy: user._id,
      kind: "N41",
    }),
  });
  return { sent: recipients.length };
}

// -- Join a walk in to an account (slice 8) ---------------------------------

/** How many manual search hits the join panel shows. */
const JOIN_SEARCH_CAP = 10;

export interface JoinCandidate {
  _id: Id<"visitors">;
  displayName: string;
  email?: string;
  listStatus: VisitorListStatus;
  visitCount: number;
  lastVisitDate?: string;
  /** Suggested because the account's profile phone equals the walk in's. */
  phoneMatch: boolean;
}

/** An app row that can still be the account side of a join (AC-28). */
function isJoinableAppRow(row: Doc<"visitors">): boolean {
  return (
    row.kind === "app" &&
    row.userId !== undefined &&
    (row.listStatus === "active" || row.listStatus === "member")
  );
}

/**
 * The accounts a walk in could be joined to (AC-27): app rows whose profile
 * phone equals the walk in's phone, plus a manual search by name or email.
 * `accountPhone` is only the join key; it never leaves the server.
 */
export const listJoinCandidates = query({
  args: { visitorId: v.id("visitors"), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await joinCandidates(ctx, args);
  },
});

/** The body of {@link listJoinCandidates}, after the authority check. */
export async function joinCandidates(
  ctx: QueryCtx,
  { visitorId, search }: { visitorId: Id<"visitors">; search?: string }
): Promise<JoinCandidate[]> {
  const walkIn = await ctx.db.get(visitorId);
  if (
    !walkIn ||
    walkIn.kind !== "walk_in" ||
    walkIn.userId !== undefined ||
    walkIn.listStatus !== "active"
  ) {
    return [];
  }

  const found = new Map<
    Id<"visitors">,
    { row: Doc<"visitors">; phoneMatch: boolean }
  >();
  if (walkIn.phone) {
    const phone = walkIn.phone;
    const matches = await ctx.db
      .query("visitors")
      .withIndex("by_accountPhone", (q) => q.eq("accountPhone", phone))
      .take(JOIN_SEARCH_CAP * 2);
    for (const row of matches) {
      if (isJoinableAppRow(row)) found.set(row._id, { row, phoneMatch: true });
    }
  }

  const term = search ? buildVisitorSearchName(search) : "";
  if (term.length >= 2) {
    for (const listStatus of ["active", "member"] as const) {
      const hits = await ctx.db
        .query("visitors")
        .withSearchIndex("search_name", (q) =>
          q
            .search("searchName", term)
            .eq("listStatus", listStatus)
            .eq("kind", "app")
        )
        .take(JOIN_SEARCH_CAP);
      for (const row of hits) {
        if (isJoinableAppRow(row) && !found.has(row._id)) {
          found.set(row._id, { row, phoneMatch: false });
        }
      }
    }
  }

  const rows = await Promise.all(
    [...found.values()].map(async ({ row, phoneMatch }) => {
      const account = await ctx.db.get(row.userId!);
      if (!account || account.deletedAt !== undefined) return null;
      const candidate: JoinCandidate = {
        _id: row._id,
        displayName: visitorDisplayName(row.firstName, row.lastName),
        email: account.email,
        listStatus: row.listStatus,
        visitCount: row.visitCount,
        lastVisitDate: row.lastVisitDate,
        phoneMatch,
      };
      return candidate;
    })
  );
  return rows
    .filter((row): row is JoinCandidate => row !== null)
    .sort((a, b) => Number(b.phoneMatch) - Number(a.phoneMatch));
}

const joinArgs = {
  walkInId: v.id("visitors"),
  appVisitorId: v.id("visitors"),
};

/**
 * Join a walk in to the app account they turned out to have (AC-28).
 *
 * The walk in row survives, because it holds what the team recorded (names,
 * phone, consent, notes). The app row's account link, visits, contacts and
 * follow ups move onto it, and the app row is kept as `merged` history.
 */
export const joinWalkInToAccount = mutation({
  args: joinArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await joinWalkInFor(ctx, operator, args);
  },
});

/** The body of {@link joinWalkInToAccount}, after the authority check. */
export async function joinWalkInFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { walkInId, appVisitorId }: ObjectType<typeof joinArgs>
): Promise<{ visitorId: Id<"visitors"> }> {
  const walkIn = await getVisitorOrRefuse(ctx, walkInId);
  if (walkIn.userId !== undefined) refuse("HOSPITALITY_ALREADY_JOINED");
  if (walkIn.kind !== "walk_in") refuse("HOSPITALITY_NOT_JOINABLE");
  if (walkIn.listStatus !== "active") refuse("HOSPITALITY_VISITOR_NOT_ACTIVE");

  const app = await ctx.db.get(appVisitorId);
  if (!app || app._id === walkIn._id || !isJoinableAppRow(app)) {
    refuse("HOSPITALITY_NOT_JOINABLE");
  }
  const account = await ctx.db.get(app.userId!);
  if (!account || account.deletedAt !== undefined) {
    refuse("HOSPITALITY_NOT_JOINABLE");
  }

  // Count what would move before moving anything, so a refusal writes nothing.
  const limit = JOIN_MAX_ROWS + 1;
  const appVisits = await ctx.db
    .query("visitorVisits")
    .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", app._id))
    .take(limit);
  const appContacts = await ctx.db
    .query("visitorContacts")
    .withIndex("by_visitorId_at", (q) => q.eq("visitorId", app._id))
    .take(limit);
  const appFollowUps = await ctx.db
    .query("followUps")
    .withIndex("by_visitorId", (q) => q.eq("visitorId", app._id))
    .take(limit);
  const moving = appVisits.length + appContacts.length + appFollowUps.length;
  if (moving > JOIN_MAX_ROWS) refuse("HOSPITALITY_JOIN_TOO_LARGE");

  // Visits: one per date, so a date both rows have keeps the walk in's.
  const walkInVisits = await ctx.db
    .query("visitorVisits")
    .withIndex("by_visitorId_visitDate", (q) => q.eq("visitorId", walkIn._id))
    .collect();
  const walkInDates = new Set(walkInVisits.map((visit) => visit.visitDate));
  let droppedVisits = 0;
  for (const visit of appVisits) {
    if (walkInDates.has(visit.visitDate)) {
      await ctx.db.delete(visit._id);
      droppedVisits += 1;
    } else {
      await ctx.db.patch(visit._id, { visitorId: walkIn._id });
    }
  }
  for (const contact of appContacts) {
    await ctx.db.patch(contact._id, { visitorId: walkIn._id });
  }

  // Follow ups move too. Two open ones would break "one open follow up per
  // visitor", so the one opened first stays and the other closes as merged.
  // No `closedBy`: nobody did that work, so Reports and team load skip it.
  const walkInFollowUps = await ctx.db
    .query("followUps")
    .withIndex("by_visitorId", (q) => q.eq("visitorId", walkIn._id))
    .collect();
  for (const followUp of appFollowUps) {
    await ctx.db.patch(followUp._id, { visitorId: walkIn._id });
  }
  const now = Date.now();
  const open = [...walkInFollowUps, ...appFollowUps]
    .filter((row) => row.status === "open")
    .sort((a, b) => a.openedAt - b.openedAt);
  for (const newer of open.slice(1)) {
    await ctx.db.patch(newer._id, {
      status: "done",
      outcome: "closed",
      closedAt: now,
      closeNote: MERGED_FOLLOW_UP_NOTE,
    });
  }

  // The app row becomes history; its account link moves to the survivor, so
  // there is still exactly one live row for this user.
  await ctx.db.patch(app._id, {
    listStatus: "merged",
    mergedIntoId: walkIn._id,
    userId: undefined,
    accountPhone: undefined,
    updatedAt: now,
  });
  await ctx.db.patch(walkIn._id, {
    userId: account._id,
    accountPhone: app.accountPhone,
    searchName: buildVisitorSearchName(
      walkIn.firstName,
      walkIn.lastName,
      account.email
    ),
    listStatus: account.role === "member" ? "member" : "active",
    updatedAt: now,
  });

  const counts = await recomputeVisitorCounters(ctx, walkIn._id);
  // Its visits moved away, so the merged row's counters fall to zero too.
  await recomputeVisitorCounters(ctx, app._id);
  // Keep "longest waiting first" honest for the follow up that stayed open.
  const kept = open[0];
  if (
    kept &&
    counts.firstVisitDate &&
    kept.firstVisitDate !== counts.firstVisitDate
  ) {
    await ctx.db.patch(kept._id, { firstVisitDate: counts.firstVisitDate });
  }

  const metadata = {
    walkInId: walkIn._id,
    appVisitorId: app._id,
    movedVisits: appVisits.length - droppedVisits,
    droppedVisits,
    movedContacts: appContacts.length,
    movedFollowUps: appFollowUps.length,
  };
  // One entry on each record, so both histories show the join.
  for (const targetId of [walkIn._id, app._id]) {
    await logActivity(ctx, {
      actorUserId: user._id,
      action: "hospitality.visitor_joined",
      targetType: "visitor",
      targetId,
      metadata,
      departmentId,
    });
  }
  return { visitorId: walkIn._id };
}

// -- Toward membership (slice 9) --------------------------------------------

export interface NotYetMemberRow {
  _id: Id<"visitors">;
  displayName: string;
  kind: VisitorKind;
  email?: string;
  createdAt: number;
  visitCount: number;
  lastVisitDate?: string;
}

/**
 * "Not yet a member" (AC-30, H4-03): active rows with an account whose user
 * has started no member profile at all, oldest first. Anyone who has
 * submitted (pending or sent back) is already on their way and is left out.
 * The profile check runs after the read, so pages can come back short; the
 * portal keeps loading as it does for the Visitors list.
 */
export const listNotYetMembers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return emptyPage<NotYetMemberRow>();
    return await notYetMemberPage(ctx, paginationOpts);
  },
});

/** The body of {@link listNotYetMembers}, after the authority check. */
export async function notYetMemberPage(
  ctx: QueryCtx,
  paginationOpts: PaginationOptions
) {
  const result = await ctx.db
    .query("visitors")
    .withIndex("by_listStatus_createdAt", (q) => q.eq("listStatus", "active"))
    .order("asc")
    .paginate(paginationOpts);

  const rows = await Promise.all(
    result.page.map(async (visitor): Promise<NotYetMemberRow | null> => {
      if (!visitor.userId) return null;
      const account = await ctx.db.get(visitor.userId);
      if (!account || account.deletedAt !== undefined) return null;
      const profile = await ctx.db
        .query("memberProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", account._id))
        .first();
      if (profile) return null;
      return {
        _id: visitor._id,
        displayName: visitorDisplayName(visitor.firstName, visitor.lastName),
        kind: visitor.kind,
        email: account.email,
        createdAt: visitor.createdAt,
        visitCount: visitor.visitCount,
        lastVisitDate: visitor.lastVisitDate,
      };
    })
  );
  return {
    ...result,
    page: rows.filter((row): row is NotYetMemberRow => row !== null),
  };
}

// -- Clan placement (slice 10) ----------------------------------------------

export interface ClanQueueRow {
  profileId: Id<"memberProfiles">;
  userId: Id<"users">;
  displayName: string;
  photoUrl?: string;
  verifiedAt?: number;
}

/**
 * Verified members with no clan, longest waiting first (AC-32, H5-02). Read
 * through `by_profileStatus_verifiedAt`, so a legacy row with no
 * `verifiedAt` comes first; rows that already have a clan are filtered after
 * the read, so pages can come back short.
 */
export const listClanQueue = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return emptyPage<ClanQueueRow>();
    return await clanQueuePage(ctx, paginationOpts);
  },
});

/** The body of {@link listClanQueue}, after the authority check. */
export async function clanQueuePage(
  ctx: QueryCtx,
  paginationOpts: PaginationOptions
) {
  const result = await ctx.db
    .query("memberProfiles")
    .withIndex("by_profileStatus_verifiedAt", (q) =>
      q.eq("profileStatus", "verified")
    )
    .order("asc")
    .paginate(paginationOpts);

  const rows = await Promise.all(
    result.page.map(async (profile): Promise<ClanQueueRow | null> => {
      if (profile.clanId !== undefined) return null;
      const account = await ctx.db.get(profile.userId);
      if (!account || account.deletedAt !== undefined) return null;
      return {
        profileId: profile._id,
        userId: profile.userId,
        displayName: visitorDisplayName(profile.firstName, profile.lastName),
        photoUrl: profile.photoUrl,
        verifiedAt: profile.verifiedAt,
      };
    })
  );
  return {
    ...result,
    page: rows.filter((row): row is ClanQueueRow => row !== null),
  };
}

export interface ClanSizeRow {
  clanId: Id<"clans">;
  name: string;
  verifiedCount: number;
  /** Among the smallest, ties included (AC-33). */
  highlighted: boolean;
}

/**
 * Every clan with its verified member count (AC-33), in the clans' own
 * order, the smallest highlighted so placements even the clans out.
 */
export const getClanSizes = query({
  args: {},
  handler: async (ctx) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await clanSizes(ctx);
  },
});

/** The body of {@link getClanSizes}, after the authority check. */
export async function clanSizes(ctx: QueryCtx): Promise<ClanSizeRow[]> {
  const clans = await ctx.db.query("clans").withIndex("by_order").collect();
  const counts = await Promise.all(
    clans.map(
      async (clan) =>
        (
          await ctx.db
            .query("memberProfiles")
            .withIndex("by_clanId_profileStatus", (q) =>
              q.eq("clanId", clan._id).eq("profileStatus", "verified")
            )
            .collect()
        ).length
    )
  );
  const flags = smallestClanFlags(counts);
  return clans.map((clan, index) => ({
    clanId: clan._id,
    name: clan.name,
    verifiedCount: counts[index],
    highlighted: flags[index],
  }));
}

const assignClanArgs = {
  profileId: v.id("memberProfiles"),
  clanId: v.id("clans"),
};

/**
 * Place a verified member with no clan into one (AC-34, H5-04).
 *
 * Hospitality only ever fills an empty `clanId`: a clan set a moment ago (by
 * the member, or a teammate) is refused rather than overwritten. The member
 * and every active elder of that clan hear about it through N37.
 */
export const assignClan = mutation({
  args: assignClanArgs,
  handler: async (ctx, args) => {
    const operator = await requireHospitalityOperator(ctx);
    return await assignClanFor(ctx, operator, args);
  },
});

/** The body of {@link assignClan}, after the authority check. */
export async function assignClanFor(
  ctx: MutationCtx,
  { user, departmentId }: Operator,
  { profileId, clanId }: ObjectType<typeof assignClanArgs>
): Promise<{ ok: true; elderIds: Id<"users">[] }> {
  const profile = await ctx.db.get(profileId);
  if (!profile || profile.profileStatus !== "verified") {
    refuse("HOSPITALITY_PROFILE_NOT_VERIFIED");
  }
  if (profile.clanId !== undefined) refuse("HOSPITALITY_CLAN_ALREADY_SET");
  const member = await ctx.db.get(profile.userId);
  if (!member || member.deletedAt !== undefined) {
    refuse("HOSPITALITY_PROFILE_NOT_VERIFIED");
  }
  const clan = await ctx.db.get(clanId);
  if (!clan) refuse("HOSPITALITY_CLAN_NOT_FOUND");

  await ctx.db.patch(profileId, { clanId, updatedAt: Date.now() });
  await logActivity(ctx, {
    actorUserId: user._id,
    action: "hospitality.clan_assigned",
    targetType: "memberProfile",
    targetId: profileId,
    metadata: { clanId, userId: profile.userId },
    departmentId,
  });

  // The member's notice opens their own profile, where the clan now shows.
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    ...clanAssignedMemberNotice(clan.name),
    ...notificationCommon({
      audience: { type: "users", userIds: [profile.userId] },
      deepLink: { type: "profile", id: profile.userId },
      createdBy: user._id,
      kind: "N37",
    }),
  });

  const elderRoles = await ctx.db
    .query("roleAssignments")
    .withIndex("by_clanId", (q) => q.eq("clanId", clanId))
    .collect();
  const elderIds = [
    ...new Set(
      elderRoles
        .filter(
          (role) => role.roleType === "clan_elder" && role.status === "active"
        )
        .map((role) => role.userId)
        // A member who is their own clan's elder already has their notice.
        .filter((userId) => userId !== profile.userId)
    ),
  ];
  if (elderIds.length > 0) {
    // No mobile screen owns this link type yet, so a tap lands on Home; the
    // web bell (feature 28) can route it to the clan's roster.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      ...clanAssignedElderNotice(profile.firstName, clan.name),
      ...notificationCommon({
        audience: { type: "users", userIds: elderIds },
        deepLink: { type: "clan_member", id: clanId },
        createdBy: user._id,
        kind: "N37",
      }),
    });
  }
  return { ok: true, elderIds };
}

// -- Dashboard (spec 0025) --------------------------------------------------

/** The visits recorded on Kampala days `from` to `to`, both ends included. */
async function visitsBetween(
  ctx: QueryCtx,
  from: string,
  to: string
): Promise<Doc<"visitorVisits">[]> {
  return await ctx.db
    .query("visitorVisits")
    .withIndex("by_visitDate", (q) => q.gte("visitDate", from).lte("visitDate", to))
    .collect();
}

/** Each distinct visitor in these visits, read once. */
async function visitorsOf(
  ctx: QueryCtx,
  visits: Doc<"visitorVisits">[]
): Promise<Map<Id<"visitors">, Doc<"visitors">>> {
  const ids = [...new Set(visits.map((visit) => visit.visitorId))];
  const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
  const map = new Map<Id<"visitors">, Doc<"visitors">>();
  for (const row of rows) if (row) map.set(row._id, row);
  return map;
}

/** The rows that make a window's first timers (AC-10): merged rows never count. */
const COHORT_STATUSES = ["active", "member", "removed"] as const;

/**
 * The cohort for a window (AC-10): every visitor whose `firstVisitDate` falls
 * in it and whose row is active, a member, or removed. A removed row still
 * counts, since its visits stay; a merged row's visits moved to the survivor.
 */
export async function cohortOf(
  ctx: QueryCtx,
  range: DateKeyRange
): Promise<Doc<"visitors">[]> {
  const parts = await Promise.all(
    COHORT_STATUSES.map((listStatus) =>
      ctx.db
        .query("visitors")
        .withIndex("by_listStatus_firstVisitDate", (q) =>
          q
            .eq("listStatus", listStatus)
            .gte("firstVisitDate", range.from)
            .lte("firstVisitDate", range.to)
        )
        .collect()
    )
  );
  return parts.flat();
}

/**
 * The Kampala day of a visitor's first personal contact (AC-8) on or after
 * their first visit and no later than today, or null. Contacts are read in
 * time order and the walk stops at the first personal one, so an in app
 * message before it is skipped, never counted.
 */
export async function firstPersonalContactDay(
  ctx: QueryCtx,
  visitorId: Id<"visitors">,
  firstVisitDate: string,
  today: string
): Promise<string | null> {
  const contacts = ctx.db
    .query("visitorContacts")
    .withIndex("by_visitorId_at", (q) =>
      q
        .eq("visitorId", visitorId)
        .gte("at", kampalaDayStartMs(firstVisitDate))
        .lte("at", kampalaDayEndMs(today))
    );
  for await (const contact of contacts) {
    if (isPersonalContactChannel(contact.channel)) return kampalaDateKeyAt(contact.at);
  }
  return null;
}

export interface OnTimeFigures {
  /** Eligible rows contacted by the deadline, as a whole percent; null with none eligible. */
  percent: number | null;
  /** The median days to a first personal contact, over every contacted row. */
  medianDays: number | null;
  /** Rows past their deadline, so measurable at all. */
  eligible: number;
}

export interface HeadlineFigures {
  visitors: number;
  firstTimers: number;
  /** Cohort rows with a second visit, as a whole percent; null for an empty cohort. */
  cameBackPercent: number | null;
  onTime: OnTimeFigures;
}

/** The four headline numbers for one window (AC-7, AC-8, AC-10). */
async function headlineFor(
  ctx: QueryCtx,
  range: DateKeyRange,
  today: string,
  /** The window's visits, when the caller has already read them. */
  preloaded?: Doc<"visitorVisits">[]
): Promise<HeadlineFigures> {
  const visits = preloaded ?? (await visitsBetween(ctx, range.from, range.to));
  const visitors = new Set(visits.map((visit) => visit.visitorId)).size;

  const cohort = await cohortOf(ctx, range);
  const cameBack = cohort.filter((row) => row.visitCount >= 2).length;

  let eligible = 0;
  let onTime = 0;
  const daysToContact: number[] = [];
  await Promise.all(
    cohort.map(async (row) => {
      const first = row.firstVisitDate!;
      const contactDay = await firstPersonalContactDay(ctx, row._id, first, today);
      if (contactDay !== null) daysToContact.push(daysBetweenKeys(first, contactDay));
      if (!isOnTimeEligible(first, today)) return;
      eligible += 1;
      if (contactDay !== null && isContactOnTime(first, contactDay)) onTime += 1;
    })
  );

  return {
    visitors,
    firstTimers: cohort.length,
    cameBackPercent: percentOf(cameBack, cohort.length),
    onTime: {
      percent: percentOf(onTime, eligible),
      medianDays: medianOf(daysToContact),
      eligible,
    },
  };
}

export interface DashboardOverview {
  period: DashboardPeriod;
  window: DateKeyRange;
  previousWindow: DateKeyRange;
  /** False until Hospitality has recorded any visit at all (AC-17). */
  hasAnyVisit: boolean;
  headline: { current: HeadlineFigures; previous: HeadlineFigures };
  /** Visitors per bin across the window (AC-11). */
  trend: { weekly: boolean; bins: TrendBinRow[] };
}

export interface TrendBinRow extends ReportBinRow {
  /** The bin holding today, still filling in (AC-11). */
  soFar: boolean;
}

/** Refuses a `today` or `period` the Dashboard could not have sent. */
function dashboardArgsOrRefuse(today: string, period: string): DashboardPeriod {
  if (!isValidDateKey(today)) refuse("HOSPITALITY_TODAY_INVALID");
  if (!isDashboardPeriod(period)) refuse("HOSPITALITY_PERIOD_INVALID");
  return period;
}

/**
 * The Hospitality Dashboard's header numbers (spec 0025, AC-7, AC-8, AC-17).
 * `today` is the browser's `kampalaToday()`, so the subscription stays
 * deterministic (spec 0012 convention); the window comes from it and the
 * period through `dashboardWindow`.
 */
export const getDashboardOverview = query({
  args: { today: v.string(), period: v.string() },
  handler: async (ctx, args) => {
    const period = dashboardArgsOrRefuse(args.today, args.period);
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await dashboardOverview(ctx, args.today, period);
  },
});

/** The body of {@link getDashboardOverview}, after the authority check. */
export async function dashboardOverview(
  ctx: QueryCtx,
  today: string,
  period: DashboardPeriod
): Promise<DashboardOverview> {
  const window = dashboardWindow(today, period);
  const previousWindow = window.previous;
  const anyVisit = await ctx.db.query("visitorVisits").withIndex("by_visitDate").first();
  const visits = await visitsBetween(ctx, window.from, window.to);
  const [current, previous, visitors] = await Promise.all([
    headlineFor(ctx, window, today, visits),
    headlineFor(ctx, previousWindow, today),
    visitorsOf(ctx, visits),
  ]);
  // The same bins and counting as Reports over this range (AC-11).
  const bins = binVisitors(reportBins(window.from, window.to), visits, visitors).map(
    (bin): TrendBinRow => ({ ...bin, soFar: isBinSoFar(bin, today) })
  );
  return {
    period,
    window: { from: window.from, to: window.to },
    previousWindow,
    hasAnyVisit: anyVisit !== null,
    headline: { current, previous },
    trend: { weekly: daysInRange(window.from, window.to) <= WEEKLY_BIN_MAX_DAYS, bins },
  };
}

/** A count under a key, the shape every journey step and mix bar takes. */
export interface KeyedCount<K extends string> {
  key: K;
  count: number;
}

export interface VisitorJourney {
  cohortSize: number;
  /** All seven steps, in order, each counted against the cohort (AC-12). */
  steps: KeyedCount<VisitorJourneyStep>[];
  /** Who the cohort is (AC-14); "none" is "Not recorded". */
  mix: {
    age: KeyedCount<AgeBracket | "none">[];
    sex: KeyedCount<Sex | "none">[];
    source: KeyedCount<VisitorKind>[];
    invited: KeyedCount<InvitedSource>[];
  };
}

/** Counts in a fixed key order, so empty keys still show as 0. */
function countBy<K extends string>(keys: readonly K[], values: readonly K[]): KeyedCount<K>[] {
  const counts = new Map<K, number>(keys.map((key) => [key, 0]));
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

/**
 * Whether a visitor had a personal contact (AC-8) and a reached contact of
 * any channel (AC-12), both on or after their first visit, up to today. One
 * read of the visitor's contacts serves both.
 */
async function contactStepsFor(
  ctx: QueryCtx,
  visitorId: Id<"visitors">,
  firstVisitDate: string,
  today: string
): Promise<{ contacted: boolean; reached: boolean }> {
  const contacts = await ctx.db
    .query("visitorContacts")
    .withIndex("by_visitorId_at", (q) =>
      q
        .eq("visitorId", visitorId)
        .gte("at", kampalaDayStartMs(firstVisitDate))
        .lte("at", kampalaDayEndMs(today))
    )
    .collect();
  return {
    contacted: contacts.some((contact) => isPersonalContactChannel(contact.channel)),
    reached: contacts.some((contact) => contact.outcome === "reached"),
  };
}

/**
 * The visitor journey and visitor mix for the window's cohort (spec 0025,
 * AC-12, AC-14). Counts only: no names leave the server here.
 */
export const getVisitorJourney = query({
  args: { today: v.string(), period: v.string() },
  handler: async (ctx, args) => {
    const period = dashboardArgsOrRefuse(args.today, args.period);
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await visitorJourney(ctx, args.today, period);
  },
});

/** The body of {@link getVisitorJourney}, after the authority check. */
export async function visitorJourney(
  ctx: QueryCtx,
  today: string,
  period: DashboardPeriod
): Promise<VisitorJourney> {
  const window = dashboardWindow(today, period);
  const cohort = await cohortOf(ctx, window);
  const contactSteps = await Promise.all(
    cohort.map((row) => contactStepsFor(ctx, row._id, row.firstVisitDate!, today))
  );

  const stepCounts: Record<VisitorJourneyStep, number> = {
    first_visit: cohort.length,
    contacted: contactSteps.filter((steps) => steps.contacted).length,
    reached: contactSteps.filter((steps) => steps.reached).length,
    came_back: cohort.filter((row) => row.visitCount >= 2).length,
    // Has ever had a regular month, not "regular right now".
    regular: cohort.filter((row) => row.lastRegularMonth !== undefined).length,
    on_app: cohort.filter((row) => row.userId !== undefined).length,
    member: cohort.filter((row) => row.listStatus === "member").length,
  };

  const ageKeys = [...(Object.keys(VISITOR_AGE_BRACKET_LABELS) as AgeBracket[]), "none"] as const;
  const sexKeys = [...(Object.keys(VISITOR_SEX_LABELS) as Sex[]), "none"] as const;

  return {
    cohortSize: cohort.length,
    steps: (Object.keys(stepCounts) as VisitorJourneyStep[]).map((key) => ({
      key,
      count: stepCounts[key],
    })),
    mix: {
      age: countBy<AgeBracket | "none">(ageKeys, cohort.map((row) => row.ageBracket ?? "none")),
      sex: countBy<Sex | "none">(sexKeys, cohort.map((row) => row.sex ?? "none")),
      source: countBy<VisitorKind>(VISITOR_KINDS, cohort.map((row) => row.kind)),
      invited: countBy<InvitedSource>(INVITED_SOURCES, cohort.map(invitedSourceOf)),
    },
  };
}

export interface ContactOutcomes {
  /** One row per outcome, split by personal channel (AC-13). */
  byOutcome: { outcome: ContactOutcome; byChannel: Record<PersonalContactChannel, number> }[];
  /** Reached over all personal contacts, per channel. */
  reachRate: { channel: PersonalContactChannel; reached: number; total: number }[];
}

/**
 * How the window's personal contacts went (spec 0025, AC-13): every personal
 * contact with `at` in the window's Kampala day bounds, whatever the
 * visitor's status. In app messages never count.
 */
export const getContactOutcomes = query({
  args: { today: v.string(), period: v.string() },
  handler: async (ctx, args) => {
    const period = dashboardArgsOrRefuse(args.today, args.period);
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await contactOutcomes(ctx, args.today, period);
  },
});

/** The body of {@link getContactOutcomes}, after the authority check. */
export async function contactOutcomes(
  ctx: QueryCtx,
  today: string,
  period: DashboardPeriod
): Promise<ContactOutcomes> {
  const window = dashboardWindow(today, period);
  const rows = await ctx.db
    .query("visitorContacts")
    .withIndex("by_at", (q) =>
      q.gte("at", kampalaDayStartMs(window.from)).lte("at", kampalaDayEndMs(window.to))
    )
    .collect();

  const emptyChannels = () =>
    Object.fromEntries(PERSONAL_CONTACT_CHANNELS.map((channel) => [channel, 0])) as Record<
      PersonalContactChannel,
      number
    >;
  const byOutcome = new Map(CONTACT_OUTCOMES.map((outcome) => [outcome, emptyChannels()]));
  const totals = emptyChannels();
  const reached = emptyChannels();

  for (const row of rows) {
    if (!isPersonalContactChannel(row.channel)) continue;
    totals[row.channel] += 1;
    if (row.outcome === undefined) continue;
    byOutcome.get(row.outcome)![row.channel] += 1;
    if (row.outcome === "reached") reached[row.channel] += 1;
  }

  return {
    byOutcome: CONTACT_OUTCOMES.map((outcome) => ({
      outcome,
      byChannel: byOutcome.get(outcome)!,
    })),
    reachRate: PERSONAL_CONTACT_CHANNELS.map((channel) => ({
      channel,
      reached: reached[channel],
      total: totals[channel],
    })),
  };
}

export interface AttentionRow {
  followUpId: Id<"followUps">;
  /** The follow up's visitor; after a join, the surviving record. */
  visitorId: Id<"visitors">;
  name: string;
  daysWaiting: number;
  /** Null when nobody has it. */
  assignee: string | null;
}

export interface TeamLoadRow {
  userId: Id<"users">;
  name: string;
  /** A live person who no longer holds `manageHospitality`. */
  formerOperator: boolean;
  open: number;
  doneInPeriod: number;
}

export interface FollowUpHealth {
  buckets: { key: FollowUpAgeBucket; count: number }[];
  /** Open follow ups with no assignee. */
  unassigned: number;
  attention: AttentionRow[];
  teamLoad: { unassignedOpen: number; rows: TeamLoadRow[] };
}

/**
 * Follow up health, needs attention and team load (spec 0025, AC-9, AC-15).
 * Everything open is the present; only "done in period" reads the window.
 */
export const getFollowUpHealth = query({
  args: { today: v.string(), period: v.string() },
  handler: async (ctx, args) => {
    const period = dashboardArgsOrRefuse(args.today, args.period);
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await followUpHealth(ctx, operator, args.today, period);
  },
});

/** The body of {@link getFollowUpHealth}, after the authority check. */
export async function followUpHealth(
  ctx: QueryCtx,
  operator: Pick<HospitalityOperator, "departmentId">,
  today: string,
  period: DashboardPeriod
): Promise<FollowUpHealth> {
  const open = await ctx.db
    .query("followUps")
    .withIndex("by_status_firstVisitDate", (q) => q.eq("status", "open"))
    .collect();
  const waiting = (row: Doc<"followUps">) => daysBetweenKeys(row.firstVisitDate, today);

  const bucketCounts = new Map<FollowUpAgeBucket, number>(
    FOLLOW_UP_AGE_BUCKETS.map((key) => [key, 0])
  );
  for (const row of open) {
    const key = followUpAgeBucket(waiting(row));
    bucketCounts.set(key, bucketCounts.get(key)! + 1);
  }
  const unassigned = open.filter((row) => row.assignedTo === undefined).length;

  const needing = open
    .filter((row) => row.assignedTo === undefined || waiting(row) >= FOLLOW_UP_OVERDUE_DAYS)
    .sort(
      (a, b) =>
        a.firstVisitDate.localeCompare(b.firstVisitDate) || a.openedAt - b.openedAt
    )
    .slice(0, ATTENTION_LIST_SIZE);
  const attention = await Promise.all(
    needing.map(async (row): Promise<AttentionRow> => {
      const visitor = await ctx.db.get(row.visitorId);
      // An open follow up never belongs to a removed or merged visitor (spec
      // 0024 AC-25, AC-28); the label is a guard, not a path.
      const name =
        visitor && visitor.listStatus !== "removed"
          ? visitorDisplayName(visitor.firstName, visitor.lastName)
          : REMOVED_VISITOR_LABEL;
      return {
        followUpId: row._id,
        visitorId: row.visitorId,
        name,
        daysWaiting: waiting(row),
        assignee: await staffName(ctx, row.assignedTo),
      };
    })
  );

  // Team load: open now per assignee, and closed in the window per closer.
  const window = dashboardWindow(today, period);
  const closed = await ctx.db
    .query("followUps")
    .withIndex("by_status_closedAt", (q) =>
      q
        .eq("status", "done")
        .gte("closedAt", kampalaDayStartMs(window.from))
        .lte("closedAt", kampalaDayEndMs(window.to))
    )
    .collect();
  const load = new Map<Id<"users">, { open: number; doneInPeriod: number }>();
  const entry = (userId: Id<"users">) => {
    let row = load.get(userId);
    if (!row) load.set(userId, (row = { open: 0, doneInPeriod: 0 }));
    return row;
  };
  for (const row of open) if (row.assignedTo) entry(row.assignedTo).open += 1;
  for (const row of closed) if (row.closedBy) entry(row.closedBy).doneInPeriod += 1;

  const rows = await Promise.all(
    [...load].map(async ([userId, counts]): Promise<TeamLoadRow> => {
      const user = await ctx.db.get(userId);
      const live = user !== null && user.deletedAt === undefined;
      return {
        userId,
        name: (await staffName(ctx, userId))!,
        // A gone account already reads "a former member"; only a live
        // person can be a former operator.
        formerOperator:
          live && !(await isHospitalityOperatorUser(ctx, userId, operator.departmentId)),
        ...counts,
      };
    })
  );
  rows.sort(
    (a, b) =>
      b.open - a.open || b.doneInPeriod - a.doneInPeriod || a.name.localeCompare(b.name)
  );

  return {
    buckets: FOLLOW_UP_AGE_BUCKETS.map((key) => ({ key, count: bucketCounts.get(key)! })),
    unassigned,
    attention,
    teamLoad: { unassignedOpen: unassigned, rows },
  };
}

export interface ClanBalance {
  /** Smallest first, the smallest few highlighted (ties included). */
  clans: ClanSizeRow[];
  waitingForClan: number;
}

/** Clan balance (spec 0025, AC-16). Always the present. */
export const getClanBalance = query({
  args: {},
  handler: async (ctx) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await clanBalance(ctx);
  },
});

/** The body of {@link getClanBalance}, after the authority check. */
export async function clanBalance(ctx: QueryCtx): Promise<ClanBalance> {
  const clans = (await clanSizes(ctx)).sort(
    (a, b) => a.verifiedCount - b.verifiedCount || a.name.localeCompare(b.name)
  );
  return { clans, waitingForClan: await countWaitingForClan(ctx) };
}

/**
 * Verified members waiting for a clan (AC-16): a verified profile with no
 * `clanId` whose user still exists without `deletedAt`. With `limit`, the
 * read stops at that many matches (the sidebar badge, AC-22).
 */
export async function countWaitingForClan(ctx: QueryCtx, limit?: number): Promise<number> {
  let count = 0;
  const verified = ctx.db
    .query("memberProfiles")
    .withIndex("by_profileStatus_verifiedAt", (q) => q.eq("profileStatus", "verified"));
  for await (const profile of verified) {
    if (profile.clanId !== undefined) continue;
    const user = await ctx.db.get(profile.userId);
    if (!user || user.deletedAt !== undefined) continue;
    count += 1;
    if (limit !== undefined && count >= limit) break;
  }
  return count;
}

export interface SidebarBadges {
  /** Open follow ups with no assignee, read up to `BADGE_CAP`. */
  unassignedFollowUps: number;
  /** Verified members with no clan, read up to `BADGE_CAP`. */
  waitingForClan: number;
  /** Pending claims for Hospitality; null for a caller without `viewRoster`. */
  requestsWaiting: number | null;
}

/**
 * The count badges on Hospitality's grouped sidebar (spec 0025, AC-22,
 * AC-23). Each count stops at `BADGE_CAP` rows, so the subscription every
 * Hospitality page holds stays small.
 */
export const getSidebarBadges = query({
  args: {},
  handler: async (ctx) => {
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await sidebarBadges(ctx, operator);
  },
});

/** The body of {@link getSidebarBadges}, after the authority check. */
export async function sidebarBadges(
  ctx: QueryCtx,
  operator: Pick<HospitalityOperator, "departmentId" | "role">
): Promise<SidebarBadges> {
  const unassigned = await ctx.db
    .query("followUps")
    .withIndex("by_assignedTo_status_firstVisitDate", (q) =>
      q.eq("assignedTo", undefined).eq("status", "open")
    )
    .take(BADGE_CAP);

  // Only a caller the shell would show the Roster to learns the claim count.
  const canViewRoster = departmentCapabilities(
    operator.role,
    HOSPITALITY_DEPARTMENT_NAME
  ).viewRoster;
  const requestsWaiting = canViewRoster
    ? (
        await ctx.db
          .query("departmentMemberships")
          .withIndex("by_departmentId_status", (q) =>
            q.eq("departmentId", operator.departmentId).eq("status", "pending_claim")
          )
          .take(BADGE_CAP)
      ).length
    : null;

  return {
    unassignedFollowUps: unassigned.length,
    waitingForClan: await countWaitingForClan(ctx, BADGE_CAP),
    requestsWaiting,
  };
}

// -- Reports (slice 12) -----------------------------------------------------

export type { ReportBinRow };

export interface HospitalityReport {
  from: string;
  to: string;
  weekly: boolean;
  bins: ReportBinRow[];
  /** Distinct visitors with a visit anywhere in the range. */
  visitorsInRange: number;
  /** Visitors with at least the regular count of visits in some month of the range. */
  regulars: number;
  followUps: { opened: number; done: number; percentDone: number };
  contacts: Record<ContactChannel, number>;
}

/**
 * The Reports page and its print view (AC-36). Every number is computed
 * from rows inside the range: visits by `visitDate`, follow ups by
 * `openedAt`, contacts by `at`. Regulars are counted from the range's own
 * visit rows per month, not from `lastRegularMonth`, so a past range reads
 * the same tomorrow as today.
 */
export const getReport = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    if (!isValidReportRange(from, to)) refuse("HOSPITALITY_RANGE_INVALID");
    const operator = await hospitalityOperatorOrNull(ctx);
    if (!operator) return null;
    return await hospitalityReport(ctx, from, to);
  },
});

/** The body of {@link getReport}, after the authority check. */
export async function hospitalityReport(
  ctx: QueryCtx,
  from: string,
  to: string
): Promise<HospitalityReport> {
  const ranges = reportBins(from, to);
  const visits = await visitsBetween(ctx, from, to);
  const visitors = await visitorsOf(ctx, visits);

  // The same counting the Dashboard's attendance trend uses (spec 0025, AC-11).
  const bins = binVisitors(ranges, visits, visitors);

  // Per visitor, per month, from the range's own rows.
  const perMonth = new Map<string, number>();
  for (const visit of visits) {
    const key = `${visit.visitorId}|${visit.visitDate.slice(0, 7)}`;
    perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
  }
  const regularIds = new Set<string>();
  for (const [key, count] of perMonth) {
    if (count >= REGULAR_VISITS_PER_MONTH) regularIds.add(key.split("|")[0]!);
  }

  const startMs = kampalaDayStartMs(from);
  const endMs = kampalaDayEndMs(to);
  // A join's duplicate is the same person twice, so it is neither opened nor
  // done work (AC-28).
  const opened = (
    await ctx.db
      .query("followUps")
      .withIndex("by_openedAt", (q) => q.gte("openedAt", startMs).lte("openedAt", endMs))
      .collect()
  ).filter((row) => !isMergedDuplicate(row));
  const done = opened.filter(
    (row) => row.status === "done" && row.closedAt !== undefined && row.closedAt <= endMs
  ).length;

  const contactRows = await ctx.db
    .query("visitorContacts")
    .withIndex("by_at", (q) => q.gte("at", startMs).lte("at", endMs))
    .collect();
  const contacts: Record<ContactChannel, number> = {
    call: 0,
    whatsapp: 0,
    sms: 0,
    in_person: 0,
    in_app: 0,
  };
  for (const row of contactRows) contacts[row.channel as ContactChannel] += 1;

  return {
    from,
    to,
    // The same rule `reportBins` used to choose its bins.
    weekly: daysInRange(from, to) <= WEEKLY_BIN_MAX_DAYS,
    bins,
    visitorsInRange: visitors.size,
    regulars: regularIds.size,
    followUps: {
      opened: opened.length,
      done,
      percentDone: cohortCompletionPercent(opened.length, done),
    },
    contacts,
  };
}
