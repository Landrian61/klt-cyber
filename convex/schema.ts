import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

  // The rich church-domain profile submitted via the mobile 7-step wizard.
  // 1:1 with `users`; created once at final submission (not on first form
  // open) and gated by verification before the user becomes a member. See
  // docs/DATA_MODEL.md, Increment 4. Supersedes Increment 2's lightweight,
  // self-service `memberProfiles` design.
  memberProfiles: defineTable({
    userId: v.id("users"),

    // Personal — Step 1
    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    phone: v.optional(v.string()),
    sex: v.union(v.literal("male"), v.literal("female")),
    dateOfBirth: v.optional(
      v.object({
        day: v.number(), // 1–31
        month: v.number(), // 1–12
        year: v.optional(v.number()), // omitted if the member declines to share
      })
    ),
    maritalStatus: v.union(
      v.literal("single"),
      v.literal("married"),
      v.literal("widowed"),
      v.literal("divorced")
    ),
    shortBio: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    joinDate: v.optional(v.number()), // self-reported; distinct from _creationTime
    // Self-reported address. `line1` is the essential locator (village/zone,
    // plot & street); city/district/country refine it for pastoral visits and
    // geographic grouping. Absent when the member declines to share.
    address: v.optional(
      v.object({
        line1: v.string(),
        city: v.optional(v.string()),
        district: v.optional(v.string()),
        country: v.optional(v.string()),
      })
    ),

    // Family — Step 2
    spouseUserId: v.optional(v.id("users")),
    spouseNameUnlinked: v.optional(v.string()), // fallback when spouse isn't registered
    anniversaryDate: v.optional(v.number()),
    nextOfKin: v.optional(
      v.object({
        fullName: v.string(),
        relationship: v.string(),
        phone: v.string(),
      })
    ),

    // Mentorship — Step 3. Hard gate: `submitProfile` rejects unless completed.
    mentorshipStatus: v.union(
      v.literal("not_enrolled"),
      v.literal("enrolled"),
      v.literal("completed")
    ),
    mentorshipProofUrl: v.optional(v.string()), // absent = admin follows up manually

    // Departments / Clan — Steps 5–6
    departmentId: v.optional(v.id("departments")),
    clanId: v.optional(v.id("clans")),

    // Profession — Step 7
    occupation: v.optional(v.string()),
    industry: v.optional(v.string()),
    employer: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),

    // Verification. No "rejected" status — admin edits fields in place and
    // moves straight to verified rather than bouncing the submission back.
    profileStatus: v.union(
      v.literal("pending_verification"),
      v.literal("verified")
    ),
    verifiedBy: v.optional(v.id("users")),
    verifiedAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_profileStatus", ["profileStatus"])
    .index("by_spouseUserId", ["spouseUserId"]),

  // Per-level leadership-institute progress. A separate table (not an array on
  // the profile) since proof is tracked per level. No row for a level = not
  // enrolled in it. Sequential ordering is not enforced here.
  leadershipProgress: defineTable({
    userId: v.id("users"),
    level: v.union(
      v.literal("level_1"),
      v.literal("level_2"),
      v.literal("advanced")
    ),
    status: v.union(v.literal("in_progress"), v.literal("completed")),
    proofUrl: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Children of members — data records, not user accounts. Kept as its own
  // table (not embedded) so it can be queried standalone (birthday lists,
  // Children's Church age-bracket transitions). See DATA_MODEL.md Increment 4
  // — supersedes Increment 2's `ageBracket`/`guardianContact` shape.
  children: defineTable({
    parentUserId: v.id("users"),
    name: v.string(),
    dateOfBirth: v.optional(v.number()), // age derives at display time
    sex: v.union(v.literal("male"), v.literal("female")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_parentUserId", ["parentUserId"]),

  // Church Admin-owned department list. Deliberately not seeded like the 12
  // fixed clans — Church Admin populates this live.
  departments: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  // Tower of Faith facilities directory.
  facilities: defineTable({
    name: v.string(),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    servicesOffered: v.optional(v.array(v.string())),
    campusBlock: v.optional(v.string()),
    address: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()), // wa.me link built at render time
    imageUrl: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

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
    roleType: v.union(
      v.literal("system_admin"),
      v.literal("clan_elder"),
      v.literal("church_admin")
    ),
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
