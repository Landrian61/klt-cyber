import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// One-off backfill: make `users.firstName`/`lastName` agree with
// `memberProfiles` wherever they differ (SRS F1-07, spec 0014 AC-15).
//
// Why it is needed. The two copies have always existed and nothing kept them
// in step: `users` was written at sign up (or by Google), `memberProfiles` by
// the wizard and by a reviewer's corrections. So a person who corrected a
// misspelling in the wizard, or whom a reviewer renamed at verification, has
// been reading one name on their profile and a different one everywhere a
// `users` row is joined. From spec 0014 onwards `syncIdentityToUser` keeps
// them together on every write (convex/lib/identity.ts); this clears the drift
// that accumulated before it.
//
// **The profile wins.** There is no product reason for the two to differ and
// F1-07 says they must not, so the reviewed copy is the one that stands. The
// counts below make any surprise visible before it is a mystery.
//
// It does NOT touch `profilePictureUrl`. That half of F1-07 is solved on the
// READ side instead, because `resolveMediaUrl` returns a signed URL that
// expires, so there is nothing durable to copy. See convex/lib/identity.ts.
//
// Deploy order, per the spec's migration plan:
//   1. `pnpm exec convex run identityMigration:backfillUserNames` on dev
//   2. the same on staging, then production
//   3. `identityMigration:verifyUserNames` and confirm `driftCount: 0`
//
// Idempotent: a second pass finds nothing to patch. Pages through
// `memberProfiles` rather than collecting it whole, so it cannot outgrow a
// single mutation's read limit as the congregation grows — call it repeatedly,
// passing back the `cursor` it returns, until `isDone` is true.

/** How many profiles one pass reads. Small enough to stay well inside limits. */
const PAGE_SIZE = 200;

export const backfillUserNames = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("memberProfiles")
      .paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });

    let patched = 0;
    let skippedDeleted = 0;
    let skippedMissing = 0;
    let alreadyAgreed = 0;

    for (const profile of page.page) {
      const user = await ctx.db.get(profile.userId);
      if (!user) {
        skippedMissing++;
        continue;
      }
      // A deleted account is an anonymized row (spec 0008): writing a real
      // name back onto it would undo the deletion field by field.
      if (user.deletedAt !== undefined) {
        skippedDeleted++;
        continue;
      }

      const patch: { firstName?: string; lastName?: string } = {};
      if (user.firstName !== profile.firstName) {
        patch.firstName = profile.firstName;
      }
      if (user.lastName !== profile.lastName) {
        patch.lastName = profile.lastName;
      }
      if (Object.keys(patch).length === 0) {
        alreadyAgreed++;
        continue;
      }

      await ctx.db.patch(profile.userId, patch);
      patched++;
    }

    return {
      read: page.page.length,
      patched,
      alreadyAgreed,
      skippedDeleted,
      skippedMissing,
      isDone: page.isDone,
      // Pass this back in as `cursor` to continue. Null when done.
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/** How many rows still disagree. Expect 0 once the backfill has run to the end. */
export const verifyUserNames = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("memberProfiles").collect();
    let driftCount = 0;
    for (const profile of profiles) {
      const user = await ctx.db.get(profile.userId);
      if (!user || user.deletedAt !== undefined) continue;
      if (
        user.firstName !== profile.firstName ||
        user.lastName !== profile.lastName
      ) {
        driftCount++;
      }
    }
    return { profileCount: profiles.length, driftCount };
  },
});
