import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ensureAppVisitorRow,
  syncVisitorFromAccount,
} from "./lib/visitorAccount";

// Hospitality core (spec 0024, AC-8): give every existing app visitor their
// `visitors` row, since the sign up hook only covers people who sign up after
// it ships.
//
// Deploy order per environment:
//   1. Deploy with the `visitors` table in the schema.
//   2. `npx convex run hospitalityMigration:backfillAppVisitors` once. It
//      walks users 100 at a time and reschedules itself with a cursor until
//      the table is done.
//   3. `npx convex run hospitalityMigration:verifyAppVisitorBackfill` and
//      confirm `missing: 0`.
// Idempotent: a second run finds a row for everyone and writes only what
// `syncVisitorFromAccount` finds out of date.
//
// Only `role: "visitor"` accounts are backfilled. Members verified before
// this shipped get no row (a consequence the spec records).

const BATCH_SIZE = 100;

export const backfillAppVisitors = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("users")
      .paginate({ numItems: BATCH_SIZE, cursor: cursor ?? null });

    let ensured = 0;
    for (const user of result.page) {
      if (user.deletedAt !== undefined || user.role !== "visitor") continue;
      const visitorId = await ensureAppVisitorRow(ctx, user._id);
      if (!visitorId) continue;
      // Also writes `accountPhone` from any profile they already submitted.
      await syncVisitorFromAccount(ctx, user._id);
      ensured += 1;
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.hospitalityMigration.backfillAppVisitors,
        { cursor: result.continueCursor }
      );
    }
    return { scanned: result.page.length, ensured, done: result.isDone };
  },
});

/** Visitor accounts still without a `visitors` row. Expect `missing: 0`. */
export const verifyAppVisitorBackfill = internalQuery({
  args: {},
  handler: async (ctx) => {
    const visitors = await ctx.db
      .query("users")
      .filter((q) =>
        q.and(
          q.eq(q.field("role"), "visitor"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();
    let missing = 0;
    for (const user of visitors) {
      const row = await ctx.db
        .query("visitors")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .first();
      if (!row) missing += 1;
    }
    return { visitors: visitors.length, missing };
  },
});
