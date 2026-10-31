import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { PROFILE_LIFECYCLE_ERRORS } from "@klt-cyber/shared";
import { logActivity, requireUser } from "./lib/authz";
import { touchMyProfile } from "./lib/identity";
import { scheduleReplacedMediaCleanup } from "./lib/mediaCleanup";

// A member's own leadership-institute progress (spec 0014, AC-13).
//
// The counterpart to convex/children.ts, with the same three rules: row
// scoped (each mutation checks the row belongs to the caller), patched rather
// than replaced (so an id survives an edit), and bumping
// `memberProfiles.updatedAt` even though none of them writes that table, so a
// reviewer's stale guard covers the whole submission (AC-7).
//
// Before this, these rows could only be written as part of a whole submission.
// A verified member who finished a level had no way to record it.
//
// There is no row for a level a person is not enrolled in — the "don't store
// negative space" convention on the table (convex/schema.ts). So "I am no
// longer enrolled" is `removeMine`, not a status value.

const levelValidator = v.union(
  v.literal("level_1"),
  v.literal("level_2"),
  v.literal("advanced")
);

// Narrower than the table's own union on purpose: schema.ts still accepts a
// legacy "in_progress" on rows written before the rename, but no new write may
// ever produce one (see convex/leadershipMigration.ts).
const statusValidator = v.union(v.literal("enrolled"), v.literal("completed"));

/** Record a level the caller has started or finished. */
export const addMine = mutation({
  args: {
    level: levelValidator,
    status: statusValidator,
    proofUrl: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // One row per person and level. Without this, pressing Add twice leaves
    // two rows for one level, and the stage derivation that reads "the highest
    // level touched" would depend on which it saw first.
    //
    // An existing row is PATCHED rather than rejected, deliberately. The
    // alternative needs a rejection code, and the level is not something a
    // person can be wrong about twice: "I have done level 1" said again is the
    // same statement, not a conflict. Patching also keeps the row id stable,
    // which is the rule for every member-owned write here.
    const existing = await ctx.db
      .query("leadershipProgress")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("level"), args.level))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        proofUrl: args.proofUrl,
        completedAt: args.completedAt,
        updatedAt: Date.now(),
      });
      await scheduleReplacedMediaCleanup(ctx, existing.proofUrl, args.proofUrl);
      await touchMyProfile(ctx, user._id);
      await logActivity(ctx, {
        actorUserId: user._id,
        action: "leadership.updated",
        targetType: "leadershipProgress",
        targetId: existing._id,
        metadata: { userId: user._id, level: args.level, status: args.status },
      });
      return { leadershipId: existing._id };
    }

    const now = Date.now();
    const rowId = await ctx.db.insert("leadershipProgress", {
      userId: user._id,
      level: args.level,
      status: args.status,
      ...(args.proofUrl ? { proofUrl: args.proofUrl } : {}),
      ...(args.completedAt !== undefined
        ? { completedAt: args.completedAt }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    await touchMyProfile(ctx, user._id, now);

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "leadership.updated",
      targetType: "leadershipProgress",
      targetId: rowId,
      metadata: { userId: user._id, level: args.level, status: args.status },
    });

    return { leadershipId: rowId };
  },
});

/** Change one of the caller's own leadership rows. */
export const updateMine = mutation({
  args: {
    leadershipId: v.id("leadershipProgress"),
    status: statusValidator,
    proofUrl: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, { leadershipId, status, proofUrl, completedAt }) => {
    const user = await requireUser(ctx);

    const row = await ctx.db.get(leadershipId);
    if (!row) throw new Error("Leadership record not found");
    if (row.userId !== user._id) {
      throw new ConvexError({ code: PROFILE_LIFECYCLE_ERRORS.NOT_YOUR_ROW });
    }

    await ctx.db.patch(leadershipId, {
      status,
      proofUrl,
      completedAt,
      updatedAt: Date.now(),
    });

    // The certificate they just replaced is nothing's any more (AC-18).
    await scheduleReplacedMediaCleanup(ctx, row.proofUrl, proofUrl);
    await touchMyProfile(ctx, user._id);

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "leadership.updated",
      targetType: "leadershipProgress",
      targetId: leadershipId,
      metadata: { userId: user._id, level: row.level, status },
    });

    return { ok: true as const };
  },
});

/** Remove one of the caller's own leadership rows — "no longer enrolled". */
export const removeMine = mutation({
  args: { leadershipId: v.id("leadershipProgress") },
  handler: async (ctx, { leadershipId }) => {
    const user = await requireUser(ctx);

    const row = await ctx.db.get(leadershipId);
    if (!row) throw new Error("Leadership record not found");
    if (row.userId !== user._id) {
      throw new ConvexError({ code: PROFILE_LIFECYCLE_ERRORS.NOT_YOUR_ROW });
    }

    await ctx.db.delete(leadershipId);
    await scheduleReplacedMediaCleanup(ctx, row.proofUrl, undefined);
    await touchMyProfile(ctx, user._id);

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "leadership.removed",
      targetType: "leadershipProgress",
      targetId: leadershipId,
      metadata: { userId: user._id, level: row.level },
    });

    return { ok: true as const };
  },
});
