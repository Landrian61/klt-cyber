import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { effectiveRadioFollow } from "@klt-cyber/shared";
import { getCurrentUser, requireUser } from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";
import { refuse } from "./lib/radioSchedule";

/**
 * Following radio programs (spec 0019, build slice 7, AC-9, AC-10). Any
 * signed in user, visitor or member alike, never gated on `users.role` or on
 * an authority role.
 *
 * A row exists only where somebody chose. Otherwise the program's own
 * `followedByDefault` applies, so no surface hardcodes which programs are
 * followed by default.
 */

/**
 * Every active program with the caller's effective follow state, for the
 * Followed radio programs screen. The schedule reads the same rows through
 * `radio.listSchedule`, so both surfaces agree without a refresh (AC-9).
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const programs = await ctx.db
      .query("radioPrograms")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();
    const choices = new Map(
      (
        await ctx.db
          .query("radioProgramFollows")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect()
      ).map((f) => [f.programId, f])
    );
    programs.sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(
      programs.map(async (p) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        days: p.days,
        startTime: p.startTime,
        recurrence: p.recurrence,
        seedKey: p.seedKey ?? null,
        imageUrl: (await resolveMediaUrl(p.imageKey)) ?? null,
        isFollowed: effectiveRadioFollow(choices.get(p._id), p.followedByDefault),
      }))
    );
  },
});

/** Follow or unfollow one program (AC-9). Upserts the caller's one row. */
export const set = mutation({
  args: { programId: v.id("radioPrograms"), following: v.boolean() },
  handler: async (ctx, { programId, following }) => {
    const user = await requireUser(ctx);
    const program = await ctx.db.get(programId);
    if (!program) refuse("RADIO_PROGRAM_NOT_FOUND");
    const existing = await ctx.db
      .query("radioProgramFollows")
      .withIndex("by_userId_programId", (q) =>
        q.eq("userId", user._id).eq("programId", programId)
      )
      .unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { following, updatedAt: now });
    else {
      await ctx.db.insert("radioProgramFollows", {
        userId: user._id,
        programId,
        following,
        updatedAt: now,
      });
    }
    return null;
  },
});
