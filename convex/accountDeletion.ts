import { ConvexError, v } from "convex/values";
import { R2 } from "@convex-dev/r2";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import {
  ACCOUNT_DELETION_ERRORS,
  ACCOUNT_DELETION_EXPIRY_SECONDS,
  ACCOUNT_DELETION_REQUEST_MAX,
  ACCOUNT_DELETION_REQUEST_WINDOW_SECONDS,
  DELETE_ACCOUNT_CONFIRM_PATH,
} from "@klt-cyber/shared";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent, createAuth } from "./auth";
import { getCurrentUser, isActiveSystemAdmin, logActivity } from "./lib/authz";
import { reportError } from "./lib/sentry";

// Account deletion (SRS F1-06, spec 0008).
//
// Deleting an account does NOT remove the `users` row. It anonymizes it in
// place and destroys everything personal around it, so church statistics, the
// giving trail and the audit record stay whole while nothing personal is left.
// Uganda's Data Protection and Privacy Act (NF-04) asks for anonymization, not
// erasure, which is why there is no hard delete anywhere in this file.
//
// Two doors reach the same mutation: the mobile app, behind the account's own
// password, and a public web page, behind a one hour link emailed to the
// address itself. No administrative role can delete somebody else, so there is
// no privilege path into this feature at all.
//
// The order of operations matters more than usual here, and it is the same on
// both paths:
//
//   1. every refusal check (last System Admin, password or token)
//   2. `performDeletion`, one atomic transaction over our own tables
//   3. destroy the Better Auth identity, which ends every session
//   4. delete the R2 objects, now that nothing points at them
//   5. queue the confirmation email
//
// Steps 1 and 2 are the irreversible boundary: nothing before step 2 writes
// anything, and a refusal therefore leaves every row and every file untouched
// (AC-23). Steps 3 to 5 happen after the commit and are each allowed to fail
// without undoing the deletion, because none of them can be rolled back into
// it anyway. See the `identityDeletePending` comments below for what happens
// when step 3 is the one that fails.

const r2 = new R2(components.r2);

// Its own handle on the push component, the same one convex/notifications.ts
// builds. The wrapper holds no state, so a second instance costs nothing and
// is cheaper than importing across two function modules.
const pushNotifications = new PushNotifications(components.pushNotifications);

/** How many rows of one unbounded collection a single transaction handles. */
const CLEANUP_PAGE = 200;

/**
 * The only `activityLogs` metadata keys that survive a deletion scrub.
 *
 * Deny by default, and that is the whole point (AC-24). Every key here is
 * structural: an id, a status, a template name, a flag. Nothing here can name
 * or identify a person. Any other key present on an entry is replaced with
 * `"[removed]"`, so a metadata key some future feature adds is anonymized
 * automatically rather than leaking until somebody remembers this list.
 *
 * Adding a key here is a deliberate claim that it can never carry personal
 * data. Think twice: a free text field is exactly what this is defending
 * against, and `roleAssignments.note` taught us that free text turns up in
 * places nobody expected.
 */
const SCRUB_ALLOWED_METADATA_KEYS = new Set([
  "template",
  "roleType",
  "status",
  "scope",
  "clanId",
  "departmentId",
  "eventType",
  "recurrence",
  "date",
  "ok",
  "selfService",
  "bootstrap",
  // Written by this feature's own deletion entry. It is on the list because a
  // later cleanup pass re-reads that entry, and without this the scrub would
  // replace the very fact the entry exists to record. A boolean cannot name
  // anybody, which is the test every key here has to pass.
  "viaPublicPage",
]);

const SCRUB_PLACEHOLDER = "[removed]";

/** Trim and lowercase, on every path into this feature (AC-21). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The address an anonymized row carries, derived from its own `_id`.
 *
 * `.invalid` is reserved by RFC 2606 and can never be delivered to, and the
 * id makes it unique without a counter. Deriving it rather than blanking the
 * field is what frees the real address for reuse (AC-11) while keeping
 * `users.email` a required, unique-ish string.
 */
function anonymizedEmail(userId: Id<"users">): string {
  return `deleted-${userId}@deleted.invalid`;
}

/**
 * The R2 object key behind a stored media value, or null when there is none.
 *
 * Uploaded files are stored as object KEYS, not URLs (convex/uploads.ts,
 * spec/STORAGE.md), but the same fields can also hold an absolute URL for
 * media we do not own: a Google avatar from social sign in, a seeded Unsplash
 * cover. Those are not ours to delete, and trying would fail, so an absolute
 * URL resolves to null and only real keys reach the bucket.
 */
function toR2Key(value?: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return null;
  return value;
}

/**
 * Whether `userId` is the last person holding an active `system_admin` grant.
 *
 * There must always be at least one, or the church locks itself out of its own
 * portal with no way back in (AC-9). Counted over distinct users rather than
 * rows, because one person can hold more than one grant and two rows held by
 * the same person are still one System Admin.
 */
async function isLastSystemAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  if (!(await isActiveSystemAdmin(ctx, userId))) return false;

  const active = await ctx.db
    .query("roleAssignments")
    .withIndex("by_roleType", (q) => q.eq("roleType", "system_admin"))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();

  const holders = new Set<string>();
  for (const row of active) {
    // A row belonging to an already deleted account does not count: that
    // person cannot sign in, so they are not a System Admin anybody can reach.
    const holder = await ctx.db.get(row.userId);
    if (holder && holder.deletedAt === undefined) holders.add(row.userId);
  }
  return holders.size <= 1;
}

/**
 * Whether the Better Auth identity behind `authId` has a password credential.
 *
 * Read through the component API rather than guessed from our own tables: a
 * Google-only account has no password to confirm, and the confirm screen has
 * to know that BEFORE the person types anything (AC-17), so it can offer the
 * emailed link instead of a password field it would only reject.
 */
async function hasPasswordCredential(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  authId: string
): Promise<boolean> {
  const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "account",
    where: [
      { field: "userId", value: authId },
      { field: "providerId", value: "credential" },
    ],
  });
  return account !== null && account !== undefined;
}

/**
 * The caller context shape, written out rather than inferred.
 *
 * Both actions below read it through `internal.accountDeletion.callerContext`,
 * which lives in this same file, so inferring the type would ask TypeScript to
 * resolve this file's API while still building it. Annotating the call sites
 * breaks that cycle.
 */
type CallerContext = {
  userId: Id<"users">;
  authId: string;
  email: string;
  canDelete: boolean;
  blockedReason?: string;
  hasPassword: boolean;
};

/** The shape both doors read before offering anything destructive. */
const precheckResult = v.object({
  canDelete: v.boolean(),
  blockedReason: v.optional(v.string()),
  hasPassword: v.boolean(),
});

/**
 * What the confirm screen needs before it renders: may this account be
 * deleted, and if so, is a password the way to prove it (AC-9, AC-17, AC-23).
 *
 * Reports rather than throws, so the screen can explain a refusal instead of
 * showing an error. Resolves `null` when the caller is unauthenticated, which
 * is this repo's standard contract for a query a client subscribes to: on the
 * signed out transition the token drops while the subscription is still live,
 * and that re-run must deliver a value rather than an error the app surfaces
 * as a crash. That matters here more than anywhere else, because the sign out
 * this screen causes happens while the screen is still mounted.
 */
export const precheck = query({
  args: {},
  returns: v.union(precheckResult, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const lastAdmin = await isLastSystemAdmin(ctx, user._id);
    const hasPassword = await hasPasswordCredential(ctx, user.authId);

    return {
      canDelete: !lastAdmin,
      ...(lastAdmin
        ? { blockedReason: ACCOUNT_DELETION_ERRORS.LAST_SYSTEM_ADMIN }
        : {}),
      hasPassword,
    };
  },
});

/**
 * The caller's own identity, for the action that cannot read the database.
 *
 * `deleteMyAccount` runs as an action (it has to reach Better Auth and R2), so
 * it gets its context through this instead of `ctx.db`.
 */
export const callerContext = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      authId: v.string(),
      email: v.string(),
      canDelete: v.boolean(),
      blockedReason: v.optional(v.string()),
      hasPassword: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const lastAdmin = await isLastSystemAdmin(ctx, user._id);
    return {
      userId: user._id,
      authId: user.authId,
      email: user.email,
      canDelete: !lastAdmin,
      ...(lastAdmin
        ? { blockedReason: ACCOUNT_DELETION_ERRORS.LAST_SYSTEM_ADMIN }
        : {}),
      hasPassword: await hasPasswordCredential(ctx, user.authId),
    };
  },
});

// ── The deletion itself ─────────────────────────────────────────────────────

/**
 * Collect the R2 keys this deletion orphans, before the rows holding them go.
 *
 * Returned to the action rather than deleted here, because a mutation that
 * deleted the file would have destroyed it even if the transaction then rolled
 * back, leaving a live account with a missing photo. Orphaned bytes are the
 * better failure (AC-5).
 */
function collectR2Keys(
  user: Doc<"users">,
  profile: Doc<"memberProfiles"> | null,
  leadership: Doc<"leadershipProgress">[]
): string[] {
  const keys = [
    toR2Key(profile?.photoUrl),
    toR2Key(profile?.mentorshipProofUrl),
    toR2Key(user.profilePictureUrl),
    ...leadership.map((row) => toR2Key(row.proofUrl)),
  ].filter((key): key is string => key !== null);

  return [...new Set(keys)];
}

/**
 * Replace every metadata value whose key is not structurally safe (AC-24).
 *
 * Returns `null` when nothing needed changing, so an unchanged entry is not
 * rewritten for no reason.
 */
function scrubMetadata(metadata: unknown): Record<string, unknown> | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    // A non object metadata value cannot be inspected key by key, so it is
    // replaced wholesale. Deny by default applies to shapes too.
    return metadata === undefined ? null : { value: SCRUB_PLACEHOLDER };
  }

  let changed = false;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (SCRUB_ALLOWED_METADATA_KEYS.has(key)) {
      scrubbed[key] = value;
      continue;
    }
    scrubbed[key] = SCRUB_PLACEHOLDER;
    // Only a value that is not ALREADY the placeholder counts as a change.
    // Without this test an entry scrubbed on an earlier pass still reports as
    // changed, gets rewritten identically every pass, and keeps the cleanup
    // loop below alive forever.
    if (value !== SCRUB_PLACEHOLDER) changed = true;
  }
  return changed ? scrubbed : null;
}

/**
 * Where a split page says to resume, mirroring the Better Auth component's own
 * `handlePagination`.
 *
 * Convex can answer a page request with only part of the range when the page
 * would be too large to read, flagging it through `pageStatus` and marking the
 * midpoint it did reach with `splitCursor`. Advancing on `continueCursor` in
 * that case steps over everything between the two and silently skips rows, so
 * a split is resumed from `splitCursor` and is never treated as done.
 */
function nextCursor(result: {
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: string | null;
}): { cursor: string; done: boolean } {
  const split =
    result.pageStatus === "SplitRequired" ||
    result.pageStatus === "SplitRecommended"
      ? result.splitCursor
      : null;
  return split
    ? { cursor: split, done: false }
    : { cursor: result.continueCursor, done: result.isDone };
}

/**
 * How far the audit scrub has got, on each of the two indexes it walks.
 *
 * Carried across scheduler hops because the scrub cannot tell "already clean"
 * from "not reached yet" by reading rows: nothing on an entry records whether
 * it has been scrubbed. The cursors are the only thing that guarantees every
 * page is visited exactly once and that the walk terminates.
 */
type ScrubProgress = {
  actorCursor: string | null;
  targetCursor: string | null;
  actorDone: boolean;
  targetDone: boolean;
};

const scrubProgressValidator = v.object({
  actorCursor: v.union(v.string(), v.null()),
  targetCursor: v.union(v.string(), v.null()),
  actorDone: v.boolean(),
  targetDone: v.boolean(),
});

const SCRUB_PROGRESS_START: ScrubProgress = {
  actorCursor: null,
  targetCursor: null,
  actorDone: false,
  targetDone: false,
};

const SCRUB_PROGRESS_DONE: ScrubProgress = {
  actorCursor: null,
  targetCursor: null,
  actorDone: true,
  targetDone: true,
};

/**
 * Scrub one page of this user's audit metadata, on both the entries they acted
 * on and the entries that targeted them (AC-13).
 *
 * The entries themselves survive: `activityLogs` is append only, so "who did
 * what in March" stays answerable after the person has left. Only the values
 * that could name them are replaced.
 *
 * Returns where to resume, or null once both indexes are exhausted, so the
 * caller can come back for another page instead of reading an unbounded number
 * of rows in one transaction.
 *
 * Paginated rather than capped with `.take`: a capped read always returns the
 * SAME first page, so entries behind it would never be scrubbed at all, and
 * whether to come back again could only be guessed at from how many rows the
 * pass happened to rewrite.
 */
async function scrubAuditPage(
  ctx: MutationCtx,
  userId: Id<"users">,
  progress: ScrubProgress
): Promise<ScrubProgress | null> {
  if (progress.actorDone && progress.targetDone) return null;

  const next: ScrubProgress = { ...progress };

  const scrubPage = async (page: Doc<"activityLogs">[]) => {
    for (const entry of page) {
      const scrubbed = scrubMetadata(entry.metadata);
      if (scrubbed === null) continue;
      await ctx.db.patch(entry._id, { metadata: scrubbed });
    }
  };

  if (!next.actorDone) {
    const result = await ctx.db
      .query("activityLogs")
      .withIndex("by_actor", (q) => q.eq("actorUserId", userId))
      .paginate({ cursor: next.actorCursor, numItems: CLEANUP_PAGE });
    await scrubPage(result.page);
    const advanced = nextCursor(result);
    next.actorCursor = advanced.cursor;
    next.actorDone = advanced.done;
  }

  if (!next.targetDone) {
    const result = await ctx.db
      .query("activityLogs")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "user").eq("targetId", userId)
      )
      .paginate({ cursor: next.targetCursor, numItems: CLEANUP_PAGE });
    // An entry the user both acted on and was targeted by appears on both
    // walks. Scrubbing it twice is harmless: the second pass sees the
    // placeholder already in place and leaves the entry alone.
    await scrubPage(result.page);
    const advanced = nextCursor(result);
    next.targetCursor = advanced.cursor;
    next.targetDone = advanced.done;
  }

  return next.actorDone && next.targetDone ? null : next;
}

/**
 * Delete one page of the user's notification overlay rows (AC-8).
 *
 * These are per-user rows over shared `notifications` documents, so they are
 * genuinely deletable, unlike almost everything else in this file. Returns
 * true when a page came back full and there may be more.
 */
async function deleteNotificationPage(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const reads = await ctx.db
    .query("notificationReads")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(CLEANUP_PAGE);
  for (const row of reads) await ctx.db.delete(row._id);

  const dismissals = await ctx.db
    .query("notificationDismissals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(CLEANUP_PAGE);
  for (const row of dismissals) await ctx.db.delete(row._id);

  return reads.length === CLEANUP_PAGE || dismissals.length === CLEANUP_PAGE;
}

/**
 * Finish any cleanup that did not fit in the deletion transaction.
 *
 * Reschedules itself until both collections are exhausted. Deletion volume at
 * launch is around fifty people, so this will almost never run a second pass;
 * it exists so a member with years of notification history cannot hit a
 * transaction limit and fail the deletion outright.
 */
export const continueCleanup = internalMutation({
  args: {
    userId: v.id("users"),
    // Both optional so the first hop can be scheduled with just a userId.
    notificationsDone: v.optional(v.boolean()),
    scrub: v.optional(scrubProgressValidator),
  },
  returns: v.null(),
  handler: async (ctx, { userId, notificationsDone, scrub }) => {
    const moreNotifications = notificationsDone
      ? false
      : await deleteNotificationPage(ctx, userId);
    const nextScrub = await scrubAuditPage(
      ctx,
      userId,
      scrub ?? SCRUB_PROGRESS_START
    );

    if (moreNotifications || nextScrub !== null) {
      await ctx.scheduler.runAfter(
        0,
        internal.accountDeletion.continueCleanup,
        {
          userId,
          notificationsDone: !moreNotifications,
          // Passed explicitly when finished rather than left undefined: an
          // absent value means "start from the beginning", which would send
          // the scrub round the whole audit trail again on every later hop.
          scrub: nextScrub ?? SCRUB_PROGRESS_DONE,
        }
      );
    }
    return null;
  },
});

/**
 * Anonymize the account and everything personal around it, in one transaction.
 *
 * Internal only: both doors reach it, and each is responsible for proving the
 * caller owns the account before it gets here. The refusal checks it does run
 * (last System Admin, and claiming the token when there is one) are the ones
 * that must be inside the transaction to be race free.
 *
 * Returns what the confirmation email needs, captured BEFORE the row was
 * anonymized (AC-12) — afterwards the address is `@deleted.invalid` and the
 * first name is gone, so reading them later would send mail nowhere. The
 * `deletedAt` it returns is the same value it wrote, because
 * `sendAccountDeleted` builds its idempotency key from it.
 */
export const performDeletion = internalMutation({
  args: {
    userId: v.id("users"),
    requestId: v.optional(v.id("accountDeletionRequests")),
  },
  returns: v.object({
    email: v.string(),
    firstName: v.optional(v.string()),
    deletedAt: v.number(),
    r2Keys: v.array(v.string()),
  }),
  handler: async (ctx, { userId, requestId }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.deletedAt !== undefined) {
      throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.ACCOUNT_GONE });
    }

    // ── Refusal checks, before anything is written ────────────────────────
    // Convex rolls the whole mutation back on a throw, so a later failure
    // cannot leave half a deletion behind. These still run first because the
    // cheapest refusal should not pay for the expensive reads.
    if (await isLastSystemAdmin(ctx, userId)) {
      throw new ConvexError({
        code: ACCOUNT_DELETION_ERRORS.LAST_SYSTEM_ADMIN,
      });
    }

    // Claiming the token INSIDE this transaction is what makes a link single
    // use under a race (AC-15): two concurrent confirmations both read
    // `usedAt` unset, both try to write it, and Convex's optimistic
    // concurrency control retries the loser, which then reads the claim and
    // refuses. Checking it in the action instead would let both through.
    if (requestId) {
      const request = await ctx.db.get(requestId);
      if (!request || request.userId !== userId) {
        throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.TOKEN_INVALID });
      }
      if (request.usedAt !== undefined) {
        throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.TOKEN_USED });
      }
      if (request.expiresAt <= Date.now()) {
        throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.TOKEN_EXPIRED });
      }
      await ctx.db.patch(requestId, { usedAt: Date.now() });
    }

    // ── Everything below this line is the irreversible part ───────────────
    const email = user.email;
    const firstName = user.firstName;
    const deletedAt = Date.now();

    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const leadership = await ctx.db
      .query("leadershipProgress")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const r2Keys = collectR2Keys(user, profile, leadership);

    // The profile, the children and the leadership rows are wholly personal:
    // there is no anonymized version of "next of kin" worth keeping, so these
    // are the one place this feature really does delete (AC-4).
    if (profile) await ctx.db.delete(profile._id);
    for (const row of leadership) await ctx.db.delete(row._id);

    const children = await ctx.db
      .query("children")
      .withIndex("by_parentUserId", (q) => q.eq("parentUserId", userId))
      .collect();
    for (const child of children) await ctx.db.delete(child._id);

    // Another member's profile may point at this one as their spouse. Left
    // alone it would be a reference to a row that no longer describes a
    // person (AC-6).
    const spouseRefs = await ctx.db
      .query("memberProfiles")
      .withIndex("by_spouseUserId", (q) => q.eq("spouseUserId", userId))
      .collect();
    for (const ref of spouseRefs) {
      await ctx.db.patch(ref._id, { spouseUserId: undefined });
    }

    // Roles and memberships are transitioned, never deleted (AC-7), so "who
    // was the Elder in March" survives the person leaving. `revokedBy` and
    // `removedBy` are the leaving user's own id: self deletion is the only
    // path into this feature, including the public one, where the token
    // proves the same ownership a session would.
    const roles = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .collect();
    for (const role of roles) {
      await ctx.db.patch(role._id, {
        status: "revoked",
        revokedAt: deletedAt,
        revokedBy: userId,
        // Free text that can name a person, on a row we are keeping (AC-20).
        note: undefined,
      });
    }

    const memberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .collect();
    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        status: "removed",
        removedAt: deletedAt,
        removedBy: userId,
        // Free text again, same reason (AC-20).
        positionTitle: undefined,
      });
    }

    const moreNotifications = await deleteNotificationPage(ctx, userId);

    // This device's push token, removed here rather than from the client.
    // Inside the transaction it is atomic with the deletion, so a refusal
    // cannot leave somebody unregistered for push on an account they still
    // have (AC-23), and it covers the emailed-link door too, which has no app
    // session to unregister itself. The component's table is keyed by userId
    // and the call is a no-op when there is no token, so an account that never
    // registered one is fine. An Expo push token is a device identifier, and
    // nothing personal is meant to survive this (AC-3).
    await pushNotifications.removeToken(ctx, { userId });

    const auditProgress = await scrubAuditPage(
      ctx,
      userId,
      SCRUB_PROGRESS_START
    );

    // The anonymized row itself (AC-3). `role` and `authId` are left alone:
    // `role` is a lifecycle value with no personal content, and `authId` is
    // the link the retry sweep needs to find the identity it still has to
    // destroy.
    await ctx.db.patch(userId, {
      email: anonymizedEmail(userId),
      firstName: undefined,
      lastName: undefined,
      profilePictureUrl: undefined,
      profileCompleted: false,
      deletedAt,
      identityDeletePending: true,
    });

    await logActivity(ctx, {
      actorUserId: userId,
      action: "account.deleted",
      targetType: "user",
      targetId: userId,
      metadata: { selfService: true, viaPublicPage: requestId !== undefined },
    });

    if (moreNotifications || auditProgress !== null) {
      await ctx.scheduler.runAfter(
        0,
        internal.accountDeletion.continueCleanup,
        {
          userId,
          notificationsDone: !moreNotifications,
          scrub: auditProgress ?? SCRUB_PROGRESS_DONE,
        }
      );
    }

    return { email, firstName, deletedAt, r2Keys };
  },
});

/** Clear the retry flag once the identity really is gone. */
export const markIdentitySettled = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    await ctx.db.patch(userId, { identityDeletePending: undefined });
    return null;
  },
});

// ── Destroying the Better Auth identity ─────────────────────────────────────

/**
 * Destroy the Better Auth identity behind `authId`, ending every session.
 *
 * Done through the component's own adapter API rather than Better Auth's
 * `deleteUser` endpoint, deliberately. Enabling that endpoint would expose a
 * public route any signed in client could call directly, which would destroy
 * the identity while leaving our `users` row live and full of personal data —
 * exactly the state this whole file exists to prevent. Reaching the component
 * from inside our own action keeps the surface closed.
 *
 * Sessions and accounts go first so that even a partial failure cannot leave
 * a usable credential behind a destroyed user row. `deleteMany` is paginated
 * because a long lived account can hold a surprising number of session rows.
 */
async function destroyIdentity(ctx: ActionCtx, authId: string): Promise<void> {
  for (const model of ["session", "account"] as const) {
    let cursor: string | null = null;
    for (;;) {
      const page: {
        isDone: boolean;
        continueCursor: string;
        splitCursor?: string | null;
        pageStatus?: string | null;
      } = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        input: {
          model,
          where: [{ field: "userId", value: authId }],
        },
        paginationOpts: { numItems: CLEANUP_PAGE, cursor },
      });
      // Through `nextCursor` rather than `continueCursor` directly, so a split
      // page resumes from the midpoint it actually reached. A long lived
      // account can hold enough session rows to trigger one, and advancing
      // past the unreturned half would leave live sessions behind — the one
      // thing this function exists to prevent.
      const advanced = nextCursor(page);
      if (advanced.done) break;
      cursor = advanced.cursor;
    }
  }

  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: {
      model: "user",
      where: [{ field: "_id", value: authId }],
    },
  });
}

/**
 * Everything that happens after the transaction commits, on both doors.
 *
 * Each step is allowed to fail without undoing the deletion, because none of
 * them can be rolled back into it. What they must not do is throw: the data is
 * already anonymized, and a throw here would tell the person their deletion
 * failed when it did not.
 */
async function finishDeletion(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    authId: string;
    email: string;
    firstName?: string;
    deletedAt: number;
    r2Keys: string[];
    viaPublicPage: boolean;
  }
): Promise<void> {
  // Step 3: the identity. If this fails the deletion still stands, the failure
  // reaches Sentry, and `identityDeletePending` stays set so
  // `retryIdentityDelete` can find it later (AC-18). The account cannot act in
  // the meantime: `getCurrentUser` treats a row with `deletedAt` as signed out
  // whatever state the identity is in (AC-19).
  try {
    await destroyIdentity(ctx, args.authId);
    await ctx.runMutation(internal.accountDeletion.markIdentitySettled, {
      userId: args.userId,
    });
  } catch (error) {
    console.error(
      "accountDeletion: identity destroy failed, data is anonymized and the retry will settle it",
      error
    );
    await reportError(ctx, error, {
      fn: "accountDeletion.destroyIdentity",
      userId: args.userId,
      tags: { viaPublicPage: String(args.viaPublicPage) },
    });
  }

  // Step 4: the files, now that the rows pointing at them are gone (AC-5).
  // One failed key must not stop the rest, so each is caught on its own. The
  // worst case is orphaned bytes nothing references, which is the tradeoff the
  // spec accepted over losing a file beside a live account.
  for (const key of args.r2Keys) {
    try {
      await r2.deleteObject(ctx, key);
    } catch (error) {
      console.error(`accountDeletion: could not delete R2 object ${key}`, error);
      await reportError(ctx, error, {
        fn: "accountDeletion.deleteR2Object",
        userId: args.userId,
      });
    }
  }

  // Step 5: the confirmation (AC-12), with the address and name captured
  // before anonymization. Scheduled rather than awaited, same as every other
  // send in this codebase: a Resend outage must not fail the deletion.
  await ctx.scheduler.runAfter(0, internal.emails.sendAccountDeleted, {
    userId: args.userId,
    email: args.email,
    ...(args.firstName ? { firstName: args.firstName } : {}),
    deletedAt: args.deletedAt,
  });
}

// ── Door one: inside the app, behind the account's password ─────────────────

/**
 * Delete the signed in caller's own account (AC-2).
 *
 * The password is the only thing standing between a tap and an irreversible
 * deletion, so it is verified against Better Auth itself rather than against
 * anything we store. Verification is a real sign in attempt, because Better
 * Auth exposes no "check this password" call; the session it creates is
 * destroyed moments later along with every other one.
 */
export const deleteMyAccount = action({
  args: { password: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { password }): Promise<{ ok: true }> => {
    const caller: CallerContext | null = await ctx.runQuery(
      internal.accountDeletion.callerContext,
      {}
    );
    if (!caller) throw new Error("Not authenticated");
    if (!caller.canDelete) {
      throw new ConvexError({
        code: caller.blockedReason ?? ACCOUNT_DELETION_ERRORS.LAST_SYSTEM_ADMIN,
      });
    }
    if (!caller.hasPassword) {
      throw new ConvexError({
        code: ACCOUNT_DELETION_ERRORS.NO_PASSWORD_CREDENTIAL,
      });
    }

    const { auth } = await authComponent.getAuth(createAuth, ctx);
    try {
      await auth.api.signInEmail({
        body: { email: caller.email, password },
      });
    } catch {
      // Deliberately not reported to Sentry and deliberately not detailed: a
      // mistyped password is ordinary, and nothing has been written yet, so
      // the account is exactly as it was (AC-23).
      throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.INVALID_PASSWORD });
    }

    const result = await ctx.runMutation(
      internal.accountDeletion.performDeletion,
      { userId: caller.userId }
    );

    await finishDeletion(ctx, {
      userId: caller.userId,
      authId: caller.authId,
      ...result,
      viaPublicPage: false,
    });

    return { ok: true } as const;
  },
});

// ── Door two: the emailed link ──────────────────────────────────────────────

/** 32 cryptographically random bytes as hex, and its SHA-256 hash. */
async function mintToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, tokenHash: await hashToken(token) };
}

/**
 * Hash a token for storage and lookup.
 *
 * The plain token exists only in the email. A stored hash means a leaked
 * database snapshot cannot be used to delete anybody's account, which is the
 * same standard the reset flow sets.
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Record a deletion request, or decline to, without saying which.
 *
 * Returns the row id only when a link should actually be sent. An unknown
 * address and a rate limited one both return null, and the action replies with
 * the same fixed string either way (AC-14, AC-16).
 */
export const issueRequest = internalMutation({
  args: { email: v.string(), tokenHash: v.string() },
  returns: v.union(
    v.object({
      requestId: v.id("accountDeletionRequests"),
      userId: v.id("users"),
    }),
    v.null()
  ),
  handler: async (ctx, { email, tokenHash }) => {
    const normalized = normalizeEmail(email);

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    // An already deleted row is not a target: its address is the
    // `@deleted.invalid` form, so this is belt and braces rather than a real
    // path, but the guard costs nothing.
    if (!user || user.deletedAt !== undefined) return null;

    const since = Date.now() - ACCOUNT_DELETION_REQUEST_WINDOW_SECONDS * 1000;
    const recent = await ctx.db
      .query("accountDeletionRequests")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .filter((q) => q.gt(q.field("createdAt"), since))
      .collect();
    if (recent.length >= ACCOUNT_DELETION_REQUEST_MAX) return null;

    const createdAt = Date.now();
    const requestId = await ctx.db.insert("accountDeletionRequests", {
      // Bound to the user resolved NOW, not to the address (AC-15). An address
      // is reusable after a deletion, so a token bound to the address could
      // delete whoever signed up next with it.
      userId: user._id,
      email: normalized,
      tokenHash,
      expiresAt: createdAt + ACCOUNT_DELETION_EXPIRY_SECONDS * 1000,
      createdAt,
    });
    return { requestId, userId: user._id };
  },
});

/** Resolve a presented token to the request it belongs to. */
export const requestByTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.object({
      requestId: v.id("accountDeletionRequests"),
      userId: v.id("users"),
    }),
    v.null()
  ),
  handler: async (ctx, { tokenHash }) => {
    const request = await ctx.db
      .query("accountDeletionRequests")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!request) return null;
    return { requestId: request._id, userId: request.userId };
  },
});

/** The identity the confirm path needs, for an account it has not signed into. */
export const identityFor = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ authId: v.string() }), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.deletedAt !== undefined) return null;
    return { authId: user.authId };
  },
});

/**
 * Send the deletion link, and say the same thing however it went (AC-14).
 *
 * The reply is one shared constant for a hit, a miss and a rate limited call,
 * so the page cannot be used to find out who belongs to the church. The token
 * is minted before the lookup so the work is the same shape either way.
 */
async function sendDeletionLink(
  ctx: ActionCtx,
  email: string
): Promise<{ ok: true }> {
  const { token, tokenHash } = await mintToken();

  const issued: {
    requestId: Id<"accountDeletionRequests">;
    userId: Id<"users">;
  } | null = await ctx.runMutation(internal.accountDeletion.issueRequest, {
    email,
    tokenHash,
  });
  if (!issued) return { ok: true } as const;

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    // Logged rather than thrown: the caller must not be able to tell a
    // misconfigured deployment from an unknown address.
    console.error(
      "accountDeletion: SITE_URL is not set, deletion link not sent"
    );
    return { ok: true } as const;
  }

  await ctx.scheduler.runAfter(
    0,
    internal.emails.sendAccountDeletionRequested,
    {
      requestId: issued.requestId,
      userId: issued.userId,
      email: normalizeEmail(email),
      url: `${siteUrl}${DELETE_ACCOUNT_CONFIRM_PATH}?token=${token}`,
    }
  );

  return { ok: true } as const;
}

/**
 * The public page's endpoint. Unauthenticated by design: somebody who has
 * already removed the app cannot sign in, and forcing a reinstall to leave is
 * the thing this door exists to avoid.
 */
export const requestByEmail = action({
  args: { email: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { email }): Promise<{ ok: true }> =>
    await sendDeletionLink(ctx, email),
});

/**
 * The same link, for a signed in account with no password to confirm (AC-17).
 *
 * Sent to the account's own address, read from the account rather than taken
 * from the caller, so this cannot be used to mail anybody else.
 */
export const requestEmailedLink = action({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx): Promise<{ ok: true }> => {
    const caller: CallerContext | null = await ctx.runQuery(
      internal.accountDeletion.callerContext,
      {}
    );
    if (!caller) throw new Error("Not authenticated");
    if (!caller.canDelete) {
      throw new ConvexError({
        code: caller.blockedReason ?? ACCOUNT_DELETION_ERRORS.LAST_SYSTEM_ADMIN,
      });
    }
    return await sendDeletionLink(ctx, caller.email);
  },
});

/**
 * Claim a link and delete the account behind it.
 *
 * Possession of the token is the proof of ownership here, which is the same
 * standard the password reset flow sets: the link went to the address, so
 * whoever holds it can read that mailbox.
 */
export const confirmByToken = action({
  args: { token: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { token }): Promise<{ ok: true }> => {
    const found: { requestId: Id<"accountDeletionRequests">; userId: Id<"users"> } | null =
      await ctx.runQuery(
      internal.accountDeletion.requestByTokenHash,
      { tokenHash: await hashToken(token) }
    );
    if (!found) {
      throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.TOKEN_INVALID });
    }

    const identity = await ctx.runQuery(
      internal.accountDeletion.identityFor,
      { userId: found.userId }
    );
    if (!identity) {
      throw new ConvexError({ code: ACCOUNT_DELETION_ERRORS.ACCOUNT_GONE });
    }

    // Expiry and single use are both checked inside the mutation, not here,
    // so two confirmations racing cannot both pass the check and then both
    // delete (AC-15).
    const result = await ctx.runMutation(
      internal.accountDeletion.performDeletion,
      { userId: found.userId, requestId: found.requestId }
    );

    await finishDeletion(ctx, {
      userId: found.userId,
      authId: identity.authId,
      ...result,
      viaPublicPage: true,
    });

    return { ok: true } as const;
  },
});

// ── The sweep ───────────────────────────────────────────────────────────────

/**
 * Settle accounts whose data was anonymized but whose identity survived
 * (AC-18).
 *
 * Selects on `identityDeletePending` through its own index, so this reads the
 * handful of stuck rows rather than the whole user table. Safe to run as often
 * as you like: an account whose identity is already gone simply has its flag
 * cleared.
 */
export const retryIdentityDelete = internalAction({
  args: {},
  returns: v.object({ settled: v.number(), failed: v.number() }),
  handler: async (ctx): Promise<{ settled: number; failed: number }> => {
    const pending: { userId: Id<"users">; authId: string }[] = await ctx.runQuery(
      internal.accountDeletion.pendingIdentityDeletes,
      {}
    );

    let settled = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await destroyIdentity(ctx, row.authId);
        await ctx.runMutation(internal.accountDeletion.markIdentitySettled, {
          userId: row.userId,
        });
        settled += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `accountDeletion.retryIdentityDelete: ${row.userId} still pending`,
          error
        );
        await reportError(ctx, error, {
          fn: "accountDeletion.retryIdentityDelete",
          userId: row.userId,
        });
      }
    }
    return { settled, failed };
  },
});

/** The rows the sweep has to settle. */
export const pendingIdentityDeletes = internalQuery({
  args: {},
  returns: v.array(v.object({ userId: v.id("users"), authId: v.string() })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("users")
      .withIndex("by_identityDeletePending", (q) =>
        q.eq("identityDeletePending", true)
      )
      .take(CLEANUP_PAGE);
    return rows.map((row) => ({ userId: row._id, authId: row.authId }));
  },
});
