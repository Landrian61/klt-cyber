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

// The 13 Areas of Service (docs/Alignment.md, Increment 5). "Administration"
// must be first/present — convex/lib/authz.ts looks it up by exact name.
// `description` is a one-line hint of what the department does, shown on its
// picker card — still fixed/seeded data, not admin-editable. Phrased in
// first person/imperative ("Lead", not "Leads") — each card reads as that
// department introducing itself, not a third-party summary of it.
const DEPARTMENTS = [
  {
    name: "Administration",
    description:
      "Coordinate church operations, governance, and cross-department support.",
  },
  {
    name: "Pastoral",
    description: "Shepherd the congregation through counsel, prayer, and pastoral care.",
  },
  {
    name: "Finance",
    description: "Steward church resources, budgeting, and financial accountability.",
  },
  {
    name: "Education",
    description: "Lead discipleship, Bible study, and teaching ministries.",
  },
  {
    name: "Media",
    description: "Capture and share services through photography, livestream, and broadcast.",
  },
  {
    name: "Worship Ministry",
    description: "Lead the congregation in praise, worship, and musical ministry.",
  },
  {
    name: "Ushering",
    description: "Welcome and guide the congregation before, during, and after service.",
  },
  {
    name: "Missions & Outreach",
    description: "Carry the gospel beyond the church through local and cross-border outreach.",
  },
  {
    name: "Hospitality",
    description: "Care for guests, fellowship meals, and church events.",
  },
  {
    name: "Children's Ministry",
    description: "Nurture the youngest members through age-appropriate discipleship and care.",
  },
  {
    name: "Eagles Youth",
    description: "Disciple and mentor teens and young adults.",
  },
  {
    name: "Real Estate",
    description: "Oversee church property, facilities, and physical infrastructure.",
  },
  {
    name: "Library & Information",
    description: "Maintain the church's resource library and information access.",
  },
] as const;

/**
 * Ensure the 13 fixed department records exist with their canonical names,
 * 1..13 order, and description. Idempotent — inserts missing rows, and
 * patches `order`/`description` on existing ones so re-running safely
 * backfills fields added after the initial seed (e.g. `description` itself,
 * added post-launch). Mirrors `clans` above, plus the backfill.
 */
export const departments = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    let updated = 0;
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      const { name, description } = DEPARTMENTS[i];
      const order = i + 1;
      const existing = await ctx.db
        .query("departments")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (!existing) {
        await ctx.db.insert("departments", { name, order, description });
        created++;
      } else if (existing.order !== order || existing.description !== description) {
        await ctx.db.patch(existing._id, { order, description });
        updated++;
      }
    }
    const total = (await ctx.db.query("departments").collect()).length;
    return { created, updated, total };
  },
});
