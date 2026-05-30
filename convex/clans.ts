import { query } from "./_generated/server";

/** Public — the 12 clans in display order. Used by the profile-completion UI. */
export const listClans = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("clans").withIndex("by_order").collect();
  },
});
