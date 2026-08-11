import { query } from "./_generated/server";

// Fixed reference data — the 13 Areas of Service (docs/Alignment.md,
// Increment 5). Seeded via seed:departments. No mutations: not admin-created,
// not admin-edited, no deactivation. Mirrors clans.ts exactly.
export const listDepartments = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("departments").withIndex("by_order").collect(),
});
