import { internalMutation, internalQuery } from "./_generated/server";

// One-time backfill: `weeklyPrograms.dayOfWeek`/`time` → `daysOfWeek`/
// `startTime`/`recurrence` (see the DEPRECATED note on those fields in
// convex/schema.ts, and the new recurrence model in convex/weeklyPrograms.ts).
// Mirrors the convex/leadershipMigration.ts / convex/departmentMigration.ts
// pattern for the same kind of additive-schema-then-migrate rollout.
//
// Deploy order:
//   1. Deploy with schema.ts's additive (optional) new fields — already the
//      case once this file lands, since it was added in the same pass.
//   2. Run `migrateWeeklyPrograms` once (`npx convex run
//      weeklyProgramsMigration:migrateWeeklyPrograms [--prod]`).
//   3. Run `verifyWeeklyProgramsMigration` and confirm `staleCount: 0`.
//   4. Follow-up PR: drop `dayOfWeek`/`time` from schema.ts and redeploy.
// Idempotent — safe to re-run; already-migrated rows (recurrence already
// set) are skipped.
export const migrateWeeklyPrograms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("weeklyPrograms").collect();
    let migrated = 0;
    for (const row of rows) {
      if (row.recurrence !== undefined) continue; // already migrated
      if (row.dayOfWeek === undefined || row.time === undefined) continue; // shouldn't happen
      await ctx.db.patch(row._id, {
        recurrence: "weekly",
        daysOfWeek: [row.dayOfWeek],
        startTime: row.time,
      });
      migrated++;
    }
    return { migrated };
  },
});

export const verifyWeeklyProgramsMigration = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("weeklyPrograms").collect();
    const stale = rows.filter((r) => r.recurrence === undefined);
    return { staleCount: stale.length }; // expect 0
  },
});
