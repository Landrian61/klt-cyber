import { defineSchema, defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

// Shared with convex/notifications.ts (the dispatch action's arg validator)
// so the audience shape is defined exactly once — duplicating it across the
// table definition and the mutation validator is how the two would drift.
export const notificationAudienceValidator = v.union(
  v.object({ type: v.literal("all") }),
  v.object({
    type: v.literal("department"),
    departmentId: v.id("departments"),
  }),
  v.object({
    type: v.literal("users"),
    userIds: v.array(v.id("users")),
  }),
  v.object({
    type: v.literal("role"),
    // Mirrors the current `roleAssignments.roleType` union (see
    // convex/lib/authz.ts) rather than resolving to a fixed recipient list at
    // send time — membership of a role/department can change between send
    // and read.
    roleType: v.union(
      v.literal("system_admin"),
      v.literal("clan_elder"),
      v.literal("hod"),
      v.literal("department_admin")
    ),
  })
);
export type NotificationAudience = Infer<typeof notificationAudienceValidator>;

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

    // Mentorship — Step 3. Self-reported; `submitProfile` no longer requires
    // this to be "completed" before a profile can be submitted.
    mentorshipStatus: v.union(
      v.literal("not_enrolled"),
      v.literal("enrolled"),
      v.literal("completed")
    ),
    mentorshipProofUrl: v.optional(v.string()), // absent = admin follows up manually

    // Clan — Step 5
    clanId: v.optional(v.id("clans")),

    // Profession — Step 6
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
    // TRANSITIONAL: "in_progress" was renamed to "enrolled" (see
    // leadershipStatusValidator in convex/memberProfiles.ts and the
    // migration in convex/leadershipMigration.ts). Kept here only so
    // deployments still holding pre-rename rows pass schema validation —
    // no new row is ever written with "in_progress". Remove this literal
    // once verifyLeadershipMigration confirms 0 remaining on every
    // deployment, and redeploy.
    status: v.union(
      v.literal("in_progress"),
      v.literal("enrolled"),
      v.literal("completed")
    ),
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

  // The 13 fixed Areas of Service — seeded reference data (seed:departments).
  // See docs/Alignment.md, Increment 5. Mirrors `clans` below: no toggle, no
  // admin-created/edited rows.
  departments: defineTable({
    name: v.string(),
    order: v.number(),
    // A one-line hint of what the department does, shown on its picker card.
    // Still fixed/seeded, not admin-editable — same status as name/order.
    description: v.optional(v.string()),
  })
    .index("by_order", ["order"])
    .index("by_name", ["name"]),

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

  // Recurring (or one-off) program slots (Sunday Service, prayer meeting,
  // …). No stored occurrences — the calendar expands these virtually at
  // query time (see convex/lib/recurrence.ts).
  weeklyPrograms: defineTable({
    title: v.string(),
    description: v.optional(v.string()),

    // DEPRECATED — superseded by daysOfWeek/startTime/recurrence below.
    // Kept only so pre-migration rows still validate; createProgram/
    // updateProgram never write these anymore. Remove once
    // verifyWeeklyProgramsMigration confirms 0 remaining legacy-only rows
    // (see convex/weeklyProgramsMigration.ts) — follow-up PR.
    dayOfWeek: v.optional(v.number()), // 0 = Sunday … 6 = Saturday
    time: v.optional(v.string()), // "09:00", 24h HH:mm

    // Recurrence model. Optional at the table level for migration safety —
    // createProgram's arg validator requires these for every new row.
    recurrence: v.optional(
      v.union(
        v.literal("once"),
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly")
      )
    ),
    daysOfWeek: v.optional(v.array(v.number())), // 0=Sun..6=Sat; 1 entry for once/monthly, 1+ for weekly/biweekly
    // Weekday-position within the month (1st/2nd/3rd/4th, -1 = last) — only
    // meaningful when recurrence === "monthly".
    weekOfMonth: v.optional(
      v.union(
        v.literal(1),
        v.literal(2),
        v.literal(3),
        v.literal(4),
        v.literal(-1)
      )
    ),
    startDate: v.optional(v.number()), // unix ms, local start of day — required by the form for new rows
    endDate: v.optional(v.number()), // unix ms, inclusive — absent = open-ended
    startTime: v.optional(v.string()), // "HH:mm", church-local (Africa/Kampala, no DST) — supersedes `time`
    endTime: v.optional(v.string()), // "HH:mm" — optional

    location: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_dayOfWeek", ["dayOfWeek"]), // kept until the legacy field is dropped

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
    // Scheduled-function ids for the week-before/day-before reminder pushes
    // (docs/DATA_MODEL.md, Increment 7) — unset when the reminder was never
    // scheduled (already past at create/update time) or has been cancelled
    // (startDateTime changed, or the event was archived).
    weekBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
    dayBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
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
  // `hod`/`department_admin` are department-scoped (docs/Alignment.md,
  // Increment 5), replacing the free-floating `church_admin` role.
  roleAssignments: defineTable({
    userId: v.id("users"),
    roleType: v.union(
      v.literal("system_admin"),
      v.literal("clan_elder"),
      v.literal("hod"),
      v.literal("department_admin")
    ),
    // Set only for clan-scoped roles (currently clan_elder). Enforced by the
    // mutation layer, not the schema.
    clanId: v.optional(v.id("clans")),
    // Set only for department-scoped roles (hod, department_admin). Enforced
    // by the mutation layer, not the schema.
    departmentId: v.optional(v.id("departments")),
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
    .index("by_clanId", ["clanId"])
    .index("by_departmentId", ["departmentId"]),

  // Department roster (docs/Alignment.md, Increment 5). Separate from
  // `roleAssignments`: membership doesn't imply administrative authority.
  departmentMemberships: defineTable({
    userId: v.id("users"),
    departmentId: v.id("departments"),
    positionTitle: v.optional(v.string()),
    addedBy: v.id("users"),
    status: v.union(v.literal("active"), v.literal("removed")),
    removedBy: v.optional(v.id("users")),
    removedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_departmentId_status", ["departmentId", "status"]),

  // Year Planner (docs/Admin_Portal.md). Internal planning records — never
  // shown to members — distinct from `weeklyPrograms`/`events`. The planner
  // UI merges all three into one calendar. No stored `month`: it's derived
  // from `targetDate` at query/render time, same as "current theme" derives
  // from a period rather than a stored flag.
  plannedActivities: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    targetDate: v.number(), // unix ms, start of day (Africa/Kampala) — where it lands on the calendar
    departmentIds: v.array(v.id("departments")), // area(s) of service responsible; at least one
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_targetDate", ["targetDate"]),

  // ── Increment 6 — Push Notifications (@convex-dev/expo-push-notifications) ─
  // One row per notification *event*, not per recipient — `notificationReads`
  // below tracks per-user read state separately, and the component's own
  // internal tables (registered in convex.config.ts) track per-user push
  // tokens and delivery. No `createdAt` field: `_creationTime` covers it,
  // same as `activityLogs` — this is an append-only event log, not a document
  // with an independent lifecycle.
  notifications: defineTable({
    title: v.string(),
    body: v.string(),
    audience: notificationAudienceValidator,
    deepLink: v.object({
      type: v.string(),
      id: v.string(),
    }),
    createdBy: v.id("users"),
  }).index("by_audience_type", ["audience.type"]),

  // One row per (user, notification) once read. No row = unread — same
  // "don't store negative space" convention as `roleAssignments`/
  // `leadershipProgress` (no row for a level = not enrolled).
  notificationReads: defineTable({
    userId: v.id("users"),
    notificationId: v.id("notifications"),
    readAt: v.number(),
  })
    .index("by_userId_notificationId", ["userId", "notificationId"])
    .index("by_userId", ["userId"]),
});
