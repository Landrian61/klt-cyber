import { internalMutation } from "./_generated/server";

export const promoteSeedAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const email = process.env.SEED_ADMIN_EMAIL;
    if (!email) throw new Error("SEED_ADMIN_EMAIL not set");
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) return { promoted: false, reason: "no user with that email yet" };
    if (user.role === "system_admin") return { promoted: false, reason: "already admin" };
    await ctx.db.patch(user._id, { role: "system_admin" });
    return { promoted: true, userId: user._id };
  },
});
