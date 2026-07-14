// TEMPORARY smoke-test harness for PR 11 — internal-only helpers, callable
// exclusively from the CLI/dashboard. DELETE THIS FILE before review; it must
// never ship. (Tracked in the PR 11 final report.)
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { completeProfileCore } from "./profile";

/** Grant an active system_admin assignment to the user with this email. */
export const grantSystemAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) throw new Error(`No user with email ${args.email}`);

    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("roleType"), "system_admin"),
          q.eq(q.field("status"), "active")
        )
      )
      .first();
    if (existing) return { ok: true, created: false };

    await ctx.db.insert("roleAssignments", {
      userId: user._id,
      roleType: "system_admin",
      assignedBy: user._id,
      status: "active",
      note: "smoke-test bootstrap",
    });
    return { ok: true, created: true };
  },
});

/** Complete a member profile on behalf of a test user (mobile-only in prod). */
export const completeTestProfile = internalMutation({
  args: {
    email: v.string(),
    clanName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) throw new Error(`No user with email ${args.email}`);

    let clanId: string | undefined;
    if (args.clanName) {
      const clan = await ctx.db
        .query("clans")
        .filter((q) => q.eq(q.field("name"), args.clanName))
        .unique();
      if (!clan) throw new Error(`No clan named ${args.clanName}`);
      clanId = clan._id;
    }

    return await completeProfileCore(ctx, user, {
      sex: "male",
      maritalStatus: "single",
      dateOfBirth: "1990-05-14",
      phone: "+256700000000",
      ...(clanId ? { clanId } : {}),
      children: [
        { name: "Test Child", ageBracket: "0-12", dateOfBirth: "2018-03-02" },
      ],
    });
  },
});
