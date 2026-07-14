import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { clanVerificationInputSchema } from "@klt-cyber/shared";
import type { Doc, Id } from "./_generated/dataModel";
import { logActivity, requireSystemAdmin } from "./lib/authz";

// ── Core logic (auth-free; the acting admin is passed in) ────────────────────

export async function suspendUserCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  userId: Id<"users">,
  note?: string
) {
  const target = await ctx.db.get(userId);
  if (!target) throw new Error("Target user not found");
  await ctx.db.patch(userId, { status: "suspended" });
  await logActivity(ctx, {
    actorUserId: caller._id,
    action: "user.suspended",
    targetType: "users",
    targetId: userId,
    ...(note ? { metadata: { note } } : {}),
  });
  return { ok: true as const };
}

export async function unsuspendUserCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  userId: Id<"users">
) {
  const target = await ctx.db.get(userId);
  if (!target) throw new Error("Target user not found");
  await ctx.db.patch(userId, { status: "active" });
  await logActivity(ctx, {
    actorUserId: caller._id,
    action: "user.unsuspended",
    targetType: "users",
    targetId: userId,
  });
  return { ok: true as const };
}

export async function verifyClanAffiliationCore(
  ctx: MutationCtx,
  caller: Doc<"users">,
  args: { userId: Id<"users">; status: "verified" | "rejected"; note?: string }
) {
  clanVerificationInputSchema.parse(args);

  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();
  if (!profile) throw new Error("Target user has no member profile");
  if (!profile.clanId) throw new Error("Target user has no clan to verify");

  await ctx.db.patch(profile._id, {
    clanApproval: {
      status: args.status,
      verifiedBy: caller._id,
      verifiedAt: Date.now(),
      ...(args.note ? { note: args.note } : {}),
    },
  });

  await logActivity(ctx, {
    actorUserId: caller._id,
    action:
      args.status === "verified"
        ? "clan.affiliation_verified"
        : "clan.affiliation_rejected",
    targetType: "memberProfiles",
    targetId: profile._id,
    metadata: { userId: args.userId, clanId: profile.clanId },
  });

  return { ok: true as const };
}

// ── Registered functions (auth wrappers) ─────────────────────────────────────

/** Suspend a user (reversible). system_admin only. Optional audit note. */
export const suspendUser = mutation({
  args: { userId: v.id("users"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await suspendUserCore(ctx, caller, args.userId, args.note);
  },
});

/** Reactivate a suspended user. system_admin only. */
export const unsuspendUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await unsuspendUserCore(ctx, caller, args.userId);
  },
});

/**
 * Verify or reject a member's self-selected clan affiliation. system_admin only
 * — an Elder-portal stand-in until that module ships.
 */
export const verifyClanAffiliation = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("verified"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSystemAdmin(ctx);
    return await verifyClanAffiliationCore(ctx, caller, args);
  },
});

// ── Dashboard read queries (system_admin only) ───────────────────────────────
// Pure reads powering the /system-admin dashboard. All direct-count / in-memory
// implementations — fine at the ~500-user scale this church operates at
// (upgrade to indexes / Convex full-text search only if that changes).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Public user fields safe to denormalize into admin views. */
function publicUser(user: Doc<"users">) {
  return {
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePictureUrl: user.profilePictureUrl,
    role: user.role,
    status: user.status,
  };
}

/** Map of clanId → clan name, for denormalizing clan-scoped records. */
async function clanNameMap(ctx: QueryCtx) {
  const clans = await ctx.db.query("clans").collect();
  return new Map(clans.map((clan) => [clan._id, clan.name]));
}

/** A role assignment with its clan name resolved (null for unscoped roles). */
async function enrichAssignments(
  ctx: QueryCtx,
  assignments: Doc<"roleAssignments">[]
) {
  const clanNames = await clanNameMap(ctx);
  return assignments.map((assignment) => ({
    ...assignment,
    clanName: assignment.clanId
      ? (clanNames.get(assignment.clanId) ?? null)
      : null,
  }));
}

/**
 * Denormalize activity-log entries for display: the actor's user record, the
 * target user (resolved from targetType/targetId or metadata.userId), and the
 * clan name when the event is clan-scoped.
 */
async function hydrateActivity(ctx: QueryCtx, logs: Doc<"activityLogs">[]) {
  const clanNames = await clanNameMap(ctx);
  const userCache = new Map<
    Id<"users">,
    ReturnType<typeof publicUser> | null
  >();

  async function getUser(userId: Id<"users">) {
    if (!userCache.has(userId)) {
      const user = await ctx.db.get(userId);
      userCache.set(userId, user ? publicUser(user) : null);
    }
    return userCache.get(userId) ?? null;
  }

  const entries = [];
  for (const log of logs) {
    const metadata = (log.metadata ?? {}) as Record<string, unknown>;

    // Resolve the human target of the event, wherever this log shape put it.
    let targetUserId: Id<"users"> | null = null;
    if (log.targetType === "users" && log.targetId) {
      targetUserId = log.targetId as Id<"users">;
    } else if (typeof metadata.userId === "string") {
      targetUserId = metadata.userId as Id<"users">;
    }

    let clanId: Id<"clans"> | null = null;
    if (log.targetType === "clans" && log.targetId) {
      clanId = log.targetId as Id<"clans">;
    } else if (typeof metadata.clanId === "string") {
      clanId = metadata.clanId as Id<"clans">;
    }

    entries.push({
      _id: log._id,
      _creationTime: log._creationTime,
      action: log.action,
      targetType: log.targetType ?? null,
      targetId: log.targetId ?? null,
      actor: await getUser(log.actorUserId),
      targetUser: targetUserId ? await getUser(targetUserId) : null,
      clanName: clanId ? (clanNames.get(clanId) ?? null) : null,
      roleType: typeof metadata.roleType === "string" ? metadata.roleType : null,
    });
  }
  return entries;
}

/**
 * Enriched, filterable user directory for /system-admin/users. Search is a
 * simple case-insensitive includes over email + first/last name.
 */
export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    filter: v.optional(
      v.object({
        role: v.optional(v.union(v.literal("visitor"), v.literal("member"))),
        hasAnyRole: v.optional(v.boolean()),
        status: v.optional(
          v.union(v.literal("active"), v.literal("suspended"))
        ),
        profileCompleted: v.optional(v.boolean()),
        // Members whose self-selected clan still awaits verification — powers
        // the dashboard's "Attention Needed" link into a filtered list.
        pendingClan: v.optional(v.boolean()),
      })
    ),
    sort: v.optional(
      v.union(v.literal("recent"), v.literal("name"), v.literal("email"))
    ),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSystemAdmin(ctx);

    const roleFilter = args.filter?.role;
    let users = roleFilter
      ? await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", roleFilter))
          .collect()
      : await ctx.db.query("users").collect();

    // Active assignments, grouped by holder — powers both the hasAnyRole
    // filter and the role chips in the results.
    const activeAssignments = (
      await ctx.db.query("roleAssignments").collect()
    ).filter((assignment) => assignment.status === "active");
    const rolesByUser = new Map<Id<"users">, Doc<"roleAssignments">[]>();
    for (const assignment of activeAssignments) {
      const held = rolesByUser.get(assignment.userId) ?? [];
      held.push(assignment);
      rolesByUser.set(assignment.userId, held);
    }

    if (args.filter?.status !== undefined) {
      users = users.filter((user) => user.status === args.filter!.status);
    }
    if (args.filter?.profileCompleted !== undefined) {
      users = users.filter(
        (user) => user.profileCompleted === args.filter!.profileCompleted
      );
    }
    if (args.filter?.hasAnyRole !== undefined) {
      users = users.filter(
        (user) => rolesByUser.has(user._id) === args.filter!.hasAnyRole
      );
    }
    if (args.filter?.pendingClan) {
      const profiles = await ctx.db.query("memberProfiles").collect();
      const pendingIds = new Set(
        profiles
          .filter(
            (profile) =>
              profile.clanId && profile.clanApproval?.status === "pending"
          )
          .map((profile) => profile.userId)
      );
      users = users.filter((user) => pendingIds.has(user._id));
    }
    if (args.search) {
      const needle = args.search.trim().toLowerCase();
      if (needle) {
        users = users.filter((user) =>
          [user.email, user.firstName ?? "", user.lastName ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        );
      }
    }

    const displayName = (user: Doc<"users">) =>
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
    const sort = args.sort ?? "recent";
    users.sort((a, b) => {
      if (sort === "name") return displayName(a).localeCompare(displayName(b));
      if (sort === "email") return a.email.localeCompare(b.email);
      return b._creationTime - a._creationTime;
    });

    const total = users.length;
    const pageSize = Math.min(Math.max(args.pageSize ?? 25, 1), 100);
    const page = Math.max(args.page ?? 1, 1);
    const pageUsers = users.slice((page - 1) * pageSize, page * pageSize);

    const clanNames = await clanNameMap(ctx);
    const results = [];
    for (const user of pageUsers) {
      const profile = await ctx.db
        .query("memberProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique();
      results.push({
        user: publicUser(user),
        profile: profile ?? null,
        memberSince: profile?._creationTime ?? null,
        signedUpAt: user._creationTime,
        activeRoles: (rolesByUser.get(user._id) ?? []).map((assignment) => ({
          ...assignment,
          clanName: assignment.clanId
            ? (clanNames.get(assignment.clanId) ?? null)
            : null,
        })),
      });
    }

    return { users: results, total, page, pageSize };
  },
});

/** Everything the /system-admin/users/[userId] detail page needs. */
export const getUserDetail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireSystemAdmin(ctx);

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const children = await ctx.db
      .query("children")
      .withIndex("by_parentUserId", (q) => q.eq("parentUserId", user._id))
      .collect();

    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const enriched = await enrichAssignments(ctx, assignments);

    // Attach grantor/revoker names so the roles card reads as prose.
    const detailedRoles = [];
    for (const assignment of enriched) {
      const assignedBy = await ctx.db.get(assignment.assignedBy);
      const revokedBy = assignment.revokedBy
        ? await ctx.db.get(assignment.revokedBy)
        : null;
      detailedRoles.push({
        ...assignment,
        assignedByUser: assignedBy ? publicUser(assignedBy) : null,
        revokedByUser: revokedBy ? publicUser(revokedBy) : null,
      });
    }
    const activeRoles = detailedRoles.filter(
      (assignment) => assignment.status === "active"
    );
    const pastRoles = detailedRoles
      .filter((assignment) => assignment.status === "revoked")
      .sort((a, b) => (b.revokedAt ?? 0) - (a.revokedAt ?? 0));

    // Recent activity involving this user as actor or target. No index covers
    // "target", so scan the recent tail — bounded and fine at this scale.
    const recentLogs = await ctx.db
      .query("activityLogs")
      .order("desc")
      .take(1000);
    const involving = recentLogs
      .filter((log) => {
        if (log.actorUserId === user._id) return true;
        if (log.targetType === "users" && log.targetId === user._id)
          return true;
        const metadata = (log.metadata ?? {}) as Record<string, unknown>;
        return metadata.userId === user._id;
      })
      .slice(0, 20);

    const clanNames = await clanNameMap(ctx);
    return {
      user: { ...publicUser(user), profileCompleted: user.profileCompleted },
      signedUpAt: user._creationTime,
      profile: profile
        ? {
            ...profile,
            clanName: profile.clanId
              ? (clanNames.get(profile.clanId) ?? null)
              : null,
          }
        : null,
      children,
      activeRoles,
      pastRoles,
      recentActivity: await hydrateActivity(ctx, involving),
    };
  },
});

/** Aggregate counts for the dashboard landing. Direct counts, no aggregates. */
export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await requireSystemAdmin(ctx);

    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("memberProfiles").collect();
    const activeAssignments = (
      await ctx.db.query("roleAssignments").collect()
    ).filter((assignment) => assignment.status === "active");

    const memberIds = new Set(
      users.filter((user) => user.role === "member").map((user) => user._id)
    );
    const roleHolderIds = new Set(
      activeAssignments.map((assignment) => assignment.userId)
    );
    const membersWithRoles = [...memberIds].filter((id) =>
      roleHolderIds.has(id)
    ).length;

    return {
      totalUsers: users.length,
      totalVisitors: users.filter((user) => user.role === "visitor").length,
      totalMembers: memberIds.size,
      totalMembersWithRoles: membersWithRoles,
      signupsLast7Days: users.filter(
        (user) => user._creationTime >= now - 7 * DAY_MS
      ).length,
      signupsLast30Days: users.filter(
        (user) => user._creationTime >= now - 30 * DAY_MS
      ).length,
      profileCompletionsLast7Days: profiles.filter(
        (profile) => profile._creationTime >= now - 7 * DAY_MS
      ).length,
      pendingClanAffiliations: profiles.filter(
        (profile) => profile.clanId && profile.clanApproval?.status === "pending"
      ).length,
      suspendedUsers: users.filter((user) => user.status === "suspended")
        .length,
    };
  },
});

/**
 * Recent activity-log entries, denormalized for display. `actionFilter`
 * restricts to the given action strings; `offset` enables simple offset
 * pagination on the /system-admin/activity page.
 */
export const listRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    actionFilter: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireSystemAdmin(ctx);

    let logs = await ctx.db.query("activityLogs").order("desc").collect();
    if (args.actionFilter && args.actionFilter.length > 0) {
      const allowed = new Set(args.actionFilter);
      logs = logs.filter((log) => allowed.has(log.action));
    }

    const total = logs.length;
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const offset = Math.max(args.offset ?? 0, 0);
    const pageLogs = logs.slice(offset, offset + limit);

    return { entries: await hydrateActivity(ctx, pageLogs), total };
  },
});
