import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The reusable approval-state shape (DATA_MODEL.md, Increment 2). Attached to any
// record needing authority verification; in this increment it backs
// `memberProfiles.clanApproval`.
const approvalState = v.object({
  status: v.union(
    v.literal("pending"),
    v.literal("verified"),
    v.literal("rejected")
  ),
  verifiedBy: v.optional(v.id("users")),
  verifiedAt: v.optional(v.number()),
  note: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    // Base consumer-lifecycle role only. Administrative authority (system_admin,
    // clan_elder, ...) lives in `roleAssignments` — see DATA_MODEL.md Increment 2.
    role: v.union(v.literal("visitor"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("suspended")),
    profileCompleted: v.boolean(),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  activityLogs: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_actor", ["actorUserId"])
    .index("by_action", ["action"]),

  // The church-domain bio. 1:1 with `users`; its presence marks a member.
  memberProfiles: defineTable({
    userId: v.id("users"),
    sex: v.union(v.literal("male"), v.literal("female")),
    dateOfBirth: v.optional(v.string()),
    maritalStatus: v.union(
      v.literal("single"),
      v.literal("married"),
      v.literal("widowed"),
      v.literal("divorced")
    ),
    phone: v.optional(v.string()),
    profession: v.optional(v.string()),
    clanId: v.optional(v.id("clans")),
    // Present iff `clanId` is set; defaults to { status: "pending" }.
    clanApproval: v.optional(approvalState),
  })
    .index("by_userId", ["userId"])
    .index("by_clanId", ["clanId"]),

  // Children of members — data records, not user accounts.
  children: defineTable({
    parentUserId: v.id("users"),
    name: v.string(),
    dateOfBirth: v.optional(v.string()),
    ageBracket: v.union(
      v.literal("0-12"),
      v.literal("13-19"),
      v.literal("20-35"),
      v.literal("36+")
    ),
    guardianContact: v.optional(v.string()),
  }).index("by_parentUserId", ["parentUserId"]),

  // The 12 fixed clans — seeded reference data (seed:clans).
  clans: defineTable({
    name: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  // ── Increment 3 — Content & Home Feed ──────────────────────────────────────
  // All content here is global (not per-user) and readable by any authenticated
  // session. Writes are gated by `canManageContent` (see convex/lib/authz.ts).

  // Annual & monthly themes. "Current" is derived from the validity period
  // (periodStart <= now <= periodEnd) rather than a manual toggle.
  themes: defineTable({
    scope: v.union(v.literal("annual"), v.literal("monthly")),
    title: v.string(),
    scriptureReference: v.string(),
    scriptureText: v.string(),
    coverImageUrl: v.optional(v.string()),
    periodStart: v.number(), // unix ms, start of day
    periodEnd: v.number(), // unix ms, end of day
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_period", ["scope", "periodStart"]),

  // Recurring weekly slots (Sunday Service, prayer meeting, …). No stored
  // occurrences — the calendar expands these virtually at query time.
  weeklyPrograms: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    dayOfWeek: v.number(), // 0 = Sunday … 6 = Saturday
    time: v.string(), // "09:00", 24h HH:mm, church-local (Africa/Kampala, no DST)
    location: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_dayOfWeek", ["dayOfWeek"]),

  // One-off events. Separate from weeklyPrograms — events grow event-specific
  // features (ICS export, RSVPs) that programs never need.
  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startDateTime: v.number(), // unix ms — stored as an instant, for future ICS export
    endDateTime: v.number(),
    coverImageUrl: v.optional(v.string()),
    featured: v.boolean(), // surfaces in the Home tab event slider
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_startDateTime", ["startDateTime"])
    .index("by_featured", ["featured", "startDateTime"]),

  // Announcements. draft → published → active → expired/disabled → archived is
  // derived at query time; only draft/published/archived are stored.
  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    category: v.optional(v.string()),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("normal"), v.literal("high"))
    ),
    coverImageUrl: v.optional(v.string()),
    links: v.optional(
      v.array(
        v.object({
          label: v.string(),
          url: v.string(),
        })
      )
    ),
    startDate: v.number(),
    endDate: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived")
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status_startDate", ["status", "startDate"]),

  // Scoped administrative role grants. A user may hold any number of these.
  roleAssignments: defineTable({
    userId: v.id("users"),
    roleType: v.union(v.literal("system_admin"), v.literal("clan_elder")),
    // Set only for clan-scoped roles (currently clan_elder). Enforced by the
    // mutation layer, not the schema.
    clanId: v.optional(v.id("clans")),
    assignedBy: v.id("users"),
    status: v.union(v.literal("active"), v.literal("revoked")),
    revokedBy: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    // Content-management gate (Increment 3): active-role lookup for a user.
    .index("by_userId_status", ["userId", "status"])
    .index("by_roleType", ["roleType"])
    .index("by_clanId", ["clanId"]),
});
