import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";

// Lightweight authenticated reads over the base `users` table. Profile
// submission/verification lives in convex/memberProfiles.ts — this file only
// exposes the narrow lookups the mobile profile wizard needs (spouse linking).

/**
 * Search verified members by name, for the Step 2 spouse-linking picker.
 * Authenticated read.
 *
 * Two things changed here in spec 0014 (AC-29), and both reverse an earlier
 * decision, so the reasoning is worth keeping:
 *
 * **It no longer returns an email address at all.** It used to return every
 * match's email, and to MATCH on email, which meant a visitor typing two
 * letters into a spouse picker was handed a page of other people's addresses.
 * The field is gone from the projection rather than hidden at render time:
 * filtering at the edge is a thing somebody can undo by accident, and a field
 * that never leaves the server cannot leak.
 *
 * **It is now restricted to verified members.** The old comment said this was
 * deliberate, so that a spouse registered but not yet verified could still be
 * linked. In practice it meant the picker searched every account that had ever
 * signed up, and `spouseUserId` could point at somebody with no reviewed
 * identity. The step already has a free-text fallback, which is the right
 * answer for a spouse who is not a verified member: their name is recorded,
 * and nothing is linked to an unreviewed row.
 *
 * Read over `memberProfiles` by `by_profileStatus`, and the NAME comes from
 * the profile rather than the `users` copy, because the profile holds the
 * version a reviewer actually looked at.
 *
 * Still scans and filters in memory, now over `memberProfiles` instead of
 * `users`. Fine at a single church's scale, and capped at `LIMIT` regardless;
 * worth a search index if the congregation ever passes a few thousand
 * verified members.
 */
const LIMIT = 20;

export const searchUsersForSpouseLink = query({
  args: { query: v.string() },
  handler: async (ctx, { query: rawQuery }) => {
    const caller = await requireUser(ctx);

    const needle = rawQuery.trim().toLowerCase();
    // Require at least a couple of characters before returning anyone — an
    // empty or one-character query would otherwise dump the whole directory.
    if (needle.length < 2) return [];

    const verified = await ctx.db
      .query("memberProfiles")
      .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
      .collect();

    const matches = verified.filter((profile) => {
      // You cannot link yourself.
      if (profile.userId === caller._id) return false;
      const first = profile.firstName.toLowerCase();
      const last = profile.lastName.toLowerCase();
      const full = `${first} ${last}`.trim();
      return (
        first.includes(needle) ||
        last.includes(needle) ||
        full.includes(needle)
      );
    });

    const rows = await Promise.all(
      matches.slice(0, LIMIT).map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        // A deleted account is an anonymized row, never a spouse to link to
        // (spec 0008 AC-22).
        if (!user || user.deletedAt !== undefined) return null;
        return {
          _id: profile.userId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          // Resolved here, and the profile's own upload rather than the
          // account picture, per the one-photo rule in convex/lib/identity.ts.
          photoUrl:
            (await resolveMediaUrl(profile.photoUrl)) ??
            user.profilePictureUrl ??
            null,
        };
      })
    );

    return rows.filter((row) => row !== null);
  },
});
