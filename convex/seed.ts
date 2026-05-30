import { internalMutation, type MutationCtx } from "./_generated/server";

// The 12 clans in birth order (Genesis 29–30, 35). See docs/DATA_MODEL.md,
// Increment 2 — "clans".
const CLAN_NAMES = [
  "Reuben",
  "Simeon",
  "Levi",
  "Judah",
  "Dan",
  "Naphtali",
  "Gad",
  "Asher",
  "Issachar",
  "Zebulun",
  "Joseph",
  "Benjamin",
] as const;

/**
 * Ensure the 12 clan records exist with their canonical names and 1..12 order.
 * Idempotent — inserts only the missing ones.
 */
export const clans = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    for (let i = 0; i < CLAN_NAMES.length; i++) {
      const name = CLAN_NAMES[i];
      const order = i + 1;
      const existing = await ctx.db
        .query("clans")
        .filter((q) => q.eq(q.field("name"), name))
        .first();
      if (!existing) {
        await ctx.db.insert("clans", { name, order });
        created++;
      }
    }
    const total = (await ctx.db.query("clans").collect()).length;
    return { created, total };
  },
});

/**
 * Bootstrap the first system admin from SEED_ADMIN_EMAIL. Ensures exactly one
 * active `roleAssignments` row with roleType=system_admin for that user, and
 * migrates any legacy `users.role === "system_admin"` (from Increment 1) back to
 * "visitor". Idempotent.
 */
async function bootstrapSystemAdminHandler(ctx: MutationCtx) {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) throw new Error("SEED_ADMIN_EMAIL not set");

  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!user) return { ok: false as const, reason: "no user" };

  // Migrate any legacy base-role system_admin to visitor (role union no longer
  // permits it). Cast: the field is typed visitor|member after the amendment.
  if ((user.role as string) === "system_admin") {
    await ctx.db.patch(user._id, { role: "visitor" });
  }

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
  if (existing) {
    return {
      ok: true as const,
      created: false,
      userId: user._id,
      roleAssignmentId: existing._id,
    };
  }

  const roleAssignmentId = await ctx.db.insert("roleAssignments", {
    userId: user._id,
    roleType: "system_admin",
    assignedBy: user._id,
    status: "active",
  });
  await ctx.db.insert("activityLogs", {
    actorUserId: user._id,
    action: "role.assigned",
    targetType: "roleAssignments",
    targetId: roleAssignmentId,
    metadata: { roleType: "system_admin", bootstrap: true },
  });

  return {
    ok: true as const,
    created: true,
    userId: user._id,
    roleAssignmentId,
  };
}

export const bootstrapSystemAdmin = internalMutation({
  args: {},
  handler: (ctx) => bootstrapSystemAdminHandler(ctx),
});

/**
 * @deprecated Increment 1's bootstrap. Superseded by `bootstrapSystemAdmin`,
 * which it now delegates to. Kept so existing CI/docs references keep working;
 * remove in a follow-up.
 */
export const promoteSeedAdmin = internalMutation({
  args: {},
  handler: (ctx) => bootstrapSystemAdminHandler(ctx),
});
