import { internalMutation } from "./_generated/server";

// Spec 0021, migration phase 2: give every event written before feature 18
// an audience. Every such event was always for the whole church, so it becomes
// `{ type: "church" }`.
//
// Run once per deployment, after the phase 1 push (where `events.audience` is
// optional) and before the phase 3 push (where it becomes required):
//
//   pnpm exec convex run eventAudienceMigration:backfillEventAudience
//
// Idempotent: a re run finds nothing missing and returns `{ patched: 0 }`.
// One transaction, which is fine at the dozens of events the church has.
export const backfillEventAudience = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    let patched = 0;
    for (const event of events) {
      if (event.audience !== undefined) continue;
      await ctx.db.patch(event._id, { audience: { type: "church" } });
      patched += 1;
    }
    return { patched };
  },
});
