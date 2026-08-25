import { internalMutation, internalQuery } from "./_generated/server";

// One-time rename: `leadershipProgress.status` "in_progress" → "enrolled"
// (see the TRANSITIONAL note on that field in convex/schema.ts, and
// `leadershipStatusValidator` in convex/memberProfiles.ts, which no longer
// accepts "in_progress" for new submissions — only pre-existing rows can
// still hold it).
//
// Deploy order for a deployment that fails schema validation on this field:
//   1. Deploy with schema.ts's widened (3-literal) status union — already
//      the case once this file lands, since it was added in the same pass.
//   2. Run `migrateLeadershipStatus` once (`npx convex run
//      leadershipMigration:migrateLeadershipStatus`).
//   3. Run `verifyLeadershipMigration` and confirm `staleCount: 0`.
//   4. Remove the "in_progress" literal from schema.ts's status union and
//      redeploy.
// Idempotent — safe to re-run; a second pass finds nothing to patch.
export const migrateLeadershipStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("leadershipProgress")
      .filter((q) => q.eq(q.field("status"), "in_progress"))
      .collect();
    for (const row of stale) {
      await ctx.db.patch(row._id, { status: "enrolled" });
    }
    return { migrated: stale.length };
  },
});

export const verifyLeadershipMigration = internalQuery({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("leadershipProgress")
      .filter((q) => q.eq(q.field("status"), "in_progress"))
      .collect();
    return { staleCount: stale.length }; // expect 0
  },
});
