import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/authz";

// Lightweight authenticated reads over the base `users` table. Profile
// submission/verification lives in convex/memberProfiles.ts — this file only
// exposes the narrow lookups the mobile profile wizard needs (spouse linking).

/**
 * Search registered users by name or email, for the Step 2 spouse-linking
 * picker (docs/Profile-completion-mobile.md). Authenticated read.
 *
 * Deliberately NOT restricted to verified members: a spouse may be registered
 * but not have completed their own profile yet. The caller is excluded from
 * results (you can't link yourself), and only the minimal display fields are
 * returned — never the auth id, role, or status.
 *
 * Matching is a case-insensitive substring over first name, last name, the
 * combined full name, and email. `users` has no search index, so this scans
 * and filters in memory — fine at a single church's scale, and capped at
 * `LIMIT` results regardless.
 */
const LIMIT = 20;

export const searchUsersForSpouseLink = query({
  args: { query: v.string() },
  handler: async (ctx, { query: rawQuery }) => {
    const caller = await requireUser(ctx);

    const needle = rawQuery.trim().toLowerCase();
    // Require at least a couple of characters before returning anyone — an
    // empty/one-char query would otherwise dump the whole directory.
    if (needle.length < 2) return [];

    const everyone = await ctx.db.query("users").collect();

    const matches = everyone.filter((u) => {
      if (u._id === caller._id) return false;
      const first = (u.firstName ?? "").toLowerCase();
      const last = (u.lastName ?? "").toLowerCase();
      const full = `${first} ${last}`.trim();
      const email = u.email.toLowerCase();
      return (
        first.includes(needle) ||
        last.includes(needle) ||
        full.includes(needle) ||
        email.includes(needle)
      );
    });

    return matches.slice(0, LIMIT).map((u) => ({
      _id: u._id,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      email: u.email,
      profilePictureUrl: u.profilePictureUrl ?? null,
    }));
  },
});
