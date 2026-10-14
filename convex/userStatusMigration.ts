import { internalMutation, internalQuery } from "./_generated/server";

// Suspension removal (spec 0004): `users.status` is being dropped entirely.
//
// Deploy order per environment:
//   1. Deploy with schema.ts's `status` already widened to optional (PR A —
//      already the case once this file lands, since it was added in the
//      same pass) and every writer/reader of `status` removed.
//   2. Run `migrateUserStatus` once (`npx convex run
//      userStatusMigration:migrateUserStatus`).
//   3. Run `verifyUserStatusMigration` and confirm `staleCount: 0`.
//   4. Only once every environment reports `staleCount: 0`, remove `status`
//      from schema.ts's users validator and delete this file (PR B).
// Idempotent — safe to re-run; a second pass finds nothing to patch.
//
// Collects rather than paginates: fine at this church's user-table scale
// (~500 users per convex/admin.ts's own direct-count convention). Revisit
// with cursor-based pagination if the table ever approaches Convex's
// per-mutation write limit (~4,000 documents).
export const migrateUserStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("status"), undefined))
      .collect();
    for (const user of stale) {
      await ctx.db.patch(user._id, { status: undefined });
    }
    return { migrated: stale.length };
  },
});

export const verifyUserStatusMigration = internalQuery({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("status"), undefined))
      .collect();
    return { staleCount: stale.length }; // expect 0
  },
});
