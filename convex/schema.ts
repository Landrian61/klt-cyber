import { defineSchema, defineTable } from "convex/server";
import { v, type Infer } from "convex/values";
import {
  vBillingCycle,
  vCostCurrency,
  vCostServiceKey,
} from "./lib/costValidators";

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
  }),
  // Spec 0010. A clan audience resolves to the clan's VERIFIED members only,
  // because `memberProfiles.clanId` is self-selected in the profile wizard —
  // an unverified claim to a clan must not earn its pushes (F4-17, N27).
  // That is deliberately narrower than the in-app read rule in
  // convex/lib/groupMembership.ts. Adding a variant here without its case in
  // `resolveAudience` (convex/notifications.ts) will not compile: that switch
  // ends in an exhaustive `never` check.
  v.object({
    type: v.literal("clan"),
    clanId: v.id("clans"),
  })
);
export type NotificationAudience = Infer<typeof notificationAudienceValidator>;

// Who a group activity or group message belongs to (spec 0010, AC-11).
//
// A discriminated union rather than two optional id fields, so "exactly one
// owner" holds at the type level: there is no way to write a row owning both a
// department and a clan, or neither. Deliberately the same shape the
// `department` and `clan` notification audiences use, so a mutation can pass an
// owner straight through as an audience without reshaping it.
//
// Convex indexes the nested paths ("owner.departmentId"), which is what makes
// one indexed read per group possible without a separate join table.
export const groupOwnerValidator = v.union(
  v.object({ type: v.literal("department"), departmentId: v.id("departments") }),
  v.object({ type: v.literal("clan"), clanId: v.id("clans") })
);
export type GroupOwner = Infer<typeof groupOwnerValidator>;

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
    // Widened to optional ahead of removal (spec 0004): every writer has
    // stopped setting it and convex/userStatusMigration.ts backfills it away.
    // Narrow this back out once every environment's migration is clean.
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
    profileCompleted: v.boolean(),
    // Account deletion (spec 0008). A row is never removed; it is anonymized
    // in place, so church history, the giving trail and the audit record stay
    // whole. `deletedAt` set means the row carries no personal data in any
    // field and cannot authenticate (convex/lib/authz.ts enforces the second
    // part, whatever state the Better Auth identity is in).
    deletedAt: v.optional(v.number()),
    // True between anonymizing the row and destroying the Better Auth
    // identity. If the identity delete fails the data stays anonymized and
    // this is left set, which is the selector `retryIdentityDelete` sweeps.
    identityDeletePending: v.optional(v.boolean()),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    // The retry sweep's selector (spec 0008 AC-18). Indexed rather than
    // filtered so the sweep never scans the whole table.
    .index("by_identityDeletePending", ["identityDeletePending"]),

  activityLogs: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    // The department an entry concerns, at the top level and NOT inside
    // `metadata` (spec 0012 AC-37): `metadata` is `v.any()`, and Convex cannot
    // index a path inside an `any`. Every department-shell mutation writes it,
    // which is what makes each department's dashboard feed an indexed read
    // bounded by one department rather than a scan of all church activity.
    // Entries written before spec 0012 carry their department only inside
    // `metadata`, so the feed starts from this change forward — no backfill.
    departmentId: v.optional(v.id("departments")),
  })
    .index("by_actor", ["actorUserId"])
    .index("by_action", ["action"])
    // Deletion scrubs a leaving user's metadata on entries that *target* them,
    // not only the ones they acted on (spec 0008 AC-13). Indexed so the scrub
    // reads that user's entries instead of the whole audit trail.
    .index("by_target", ["targetType", "targetId"])
    .index("by_department", ["departmentId"]),

  // The rich church-domain profile submitted via the mobile 7-step wizard.
  // 1:1 with `users`; created once at final submission (not on first form
  // open) and gated by verification before the user becomes a member.
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
    // Spec 0010. The verified members of one clan, for the `clan` notification
    // audience. Compound rather than a bare `by_clanId` so the verified filter
    // is part of the index read: a clan audience must never widen to the people
    // who have merely claimed the clan in the wizard, and reading the whole
    // clan and filtering in memory would make that an easy mistake to make.
    .index("by_clanId_profileStatus", ["clanId", "profileStatus"])
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
  // Mirrors `clans` below for name and order: no toggle, no admin-created rows.
  departments: defineTable({
    name: v.string(),
    order: v.number(),
    // A one-line hint of what the department does, shown on its picker card.
    // Name and order stay fixed, but since spec 0012 this field is editable by
    // that department's HOD (AC-8). The seed still supplies the initial text,
    // so a department nobody edits reads exactly as it did before. Capped at
    // DEPARTMENT_DESCRIPTION_MAX_LENGTH; absent means the card renders no
    // description line.
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

  // Called-off single occurrences of a recurring program (spec 0009, A4-02 /
  // A4-03). One row = one cancelled occurrence; NO ROW = the occurrence is on,
  // and restore deletes the row rather than flipping a flag. An occurrence
  // itself is never stored (calendar.ts expands them at query time), so this is
  // the only place a per-occurrence fact can live.
  //
  // A row may outlive the occurrence it describes: editing a program's day
  // orphans its cancellations. Orphans are never read (every read path only
  // asks about dates the program actually occurs on) and are never pruned —
  // editing the day back brings the cancellation back with it, deliberately.
  programOccurrenceCancellations: defineTable({
    programId: v.id("weeklyPrograms"),
    // "YYYY-MM-DD", Kampala-local calendar day — the same shape as the
    // `occurrenceKey` suffix, so the two can never disagree about which day
    // an occurrence belongs to. ISO strings sort in calendar order, which is
    // what makes the `by_date` range query below work without a second field.
    date: v.string(),
    // Trimmed, capped at PROGRAM_CANCELLATION_REASON_MAX_LENGTH (@klt-cyber/
    // shared); empty after trimming is stored as absent, not "". Member-visible.
    reason: v.optional(v.string()),
    cancelledBy: v.id("users"),
    cancelledAt: v.number(),
    updatedAt: v.number(), // moves when the reason is corrected
    // Set when a member notification was scheduled on cancel — never cleared
    // while the row lives. Drives the restore dialog's "members were already
    // told" warning, so it records intent-to-send, not delivery.
    notifiedAt: v.optional(v.number()),
  })
    .index("by_program_date", ["programId", "date"]) // one occurrence, or one program's cancelled dates
    .index("by_date", ["date"]), // a week/month/year range across all programs

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
    // Scheduled-function ids for the week-before/day-before reminder pushes —
    // unset when the reminder was never scheduled (already past at create/update
    // time) or has been cancelled
    // (startDateTime changed, or the event was archived).
    weekBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
    dayBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
    // Cancellation (spec 0010, AC-12). Deliberately NOT folded into `active`:
    // cancelled means the event is still a real row on a real date and stays
    // listed, marked, until that date passes, while `active: false` means
    // archived and disappears at once. Collapsing the two would make
    // "cancelled" either invisible or permanent. Feature 18 writes these;
    // every read path here only reports them.
    cancelledAt: v.optional(v.number()), // set = cancelled; absent = it is on
    cancelledBy: v.optional(v.id("users")),
    cancellationReason: v.optional(v.string()), // shown to members, capped at CANCELLATION_REASON_MAX_LENGTH
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
  // `hod`/`department_admin` are department-scoped.
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

  // Department roster. Separate from
  // `roleAssignments`: membership doesn't imply administrative authority.
  // A person's seat on one department's roster, and — since spec 0012 — their
  // request for one. `status` carries the whole relationship, so confirming a
  // claim is a single patch and the row keeps its own history. At most one row
  // per user and department is ever `pending_claim` or `active`; every writer
  // either promotes the live row or rejects, since Convex has no unique
  // indexes. `declined` and `removed` are terminal, so a person who claims
  // again gets a fresh row and the sequence of decisions stays legible.
  departmentMemberships: defineTable({
    userId: v.id("users"),
    departmentId: v.id("departments"),
    positionTitle: v.optional(v.string()),
    addedBy: v.id("users"),
    // Mirrors DEPARTMENT_MEMBERSHIP_STATUSES in @klt-cyber/shared. Rows written
    // before spec 0012 are `active` or `removed` and stay valid — widening a
    // union needs no migration, and every existing read filters on
    // `status === "active"`, so none of them can mistake a claim for a member.
    status: v.union(
      v.literal("pending_claim"),
      v.literal("active"),
      v.literal("removed"),
      v.literal("declined")
    ),
    removedBy: v.optional(v.id("users")),
    removedAt: v.optional(v.number()),
    // Claim lifecycle (spec 0012 AC-14). All optional, so existing rows stay
    // valid. `claimedAt` orders the pending list oldest-first; a legacy row
    // without it falls back to `_creationTime`.
    claimedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    // Capped at CLAIM_DECLINE_REASON_MAX_LENGTH. Readable only by the claimant
    // and by that department's HOD, and cleared on account deletion (AC-39).
    declineReason: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_departmentId_status", ["departmentId", "status"]),

  // Year Planner. Internal planning records — never
  // shown to members — distinct from `weeklyPrograms`/`events`. The planner
  // UI merges all three into one calendar. No stored `month`: it's derived
  // from `targetDate` at query/render time, same as "current theme" derives
  // from a period rather than a stored flag.
  //
  // Not to be confused with `groupActivities` below (spec 0010): this table is
  // Administration's private planning record, that one is what a department or
  // clan actually puts in front of its members. Nothing planned here becomes
  // church-visible by itself.
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

  // ── Spec 0010 — group content (member-facing) ──────────────────────────────
  // Two tables that ship with no authoring interface: every read path a member
  // needs is built here, and features 17 (department) and 23 (clan) write
  // against this contract rather than each inventing their own shape. Sample
  // rows come from `contentSeed:seedGroupSamples` on dev and staging only.

  // One dated activity belonging to exactly one department or one clan — the
  // member-facing counterpart to `plannedActivities` above. Shares `events`'s
  // instant-based date fields so the two merge into one ordered list with a
  // single comparison (convex/upcoming.ts).
  groupActivities: defineTable({
    title: v.string(), // capped at ACTIVITY_TITLE_MAX_LENGTH
    description: v.optional(v.string()), // capped at ACTIVITY_DESCRIPTION_MAX_LENGTH
    startDateTime: v.number(), // unix ms instant, directly comparable with events.startDateTime
    endDateTime: v.number(), // at or after startDateTime; also the "has it finished" boundary
    location: v.optional(v.string()), // capped at ACTIVITY_LOCATION_MAX_LENGTH
    coverImageUrl: v.optional(v.string()), // an R2 key, resolved by resolveCoverUrls on the way out
    owner: groupOwnerValidator,
    // Cancellation, the same two-state split `events` carries: a cancelled
    // activity keeps its place in the list until its end time passes.
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancellationReason: v.optional(v.string()), // capped at CANCELLATION_REASON_MAX_LENGTH
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    // The one reminder tier spec 0012 decided on: about 24 hours before the
    // start (N23). The scheduled job's id is stored so moving the start time
    // can cancel and reschedule it, and cancelling the activity can stop it.
    // A job that fires anyway re-checks the activity's current start time,
    // existence and cancellation, so a stale one delivers nothing (AC-24).
    dayBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
  })
    // One equality plus one range read per group the caller belongs to. There
    // is deliberately NO bare ["startDateTime"] index: a single window read
    // across every activity in the church, filtered down in memory, would
    // scale with how many groups exist rather than with how many the caller is
    // in. Reading per eligible group bounds the work by the member's own
    // memberships, which is a handful.
    .index("by_department_start", ["owner.departmentId", "startDateTime"])
    .index("by_clan_start", ["owner.clanId", "startDateTime"]),

  // One message sent to one department or one clan. The in-app record behind a
  // group push: the notification can be cleared, this cannot (M3-03).
  groupMessages: defineTable({
    body: v.string(), // capped at GROUP_MESSAGE_MAX_LENGTH
    imageUrl: v.optional(v.string()), // an R2 key, resolved by resolveCoverUrls on the way out
    owner: groupOwnerValidator,
    sentBy: v.id("users"),
    // Soft delete, so S5-03 leaves an audit trail. A deleted message is never
    // purged; volume is a handful per group per year.
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
    // No `sentAt`: Convex appends `_creationTime` to every index, so
    // `by_department` plus a range on `_creationTime` gives the 90-day window
    // read directly. Same reasoning as the `notifications` table above.
  })
    .index("by_department", ["owner.departmentId"])
    .index("by_clan", ["owner.clanId"]),

  // ── Spec 0012 — HOD-to-HOD notices ────────────────────────────────────────
  // One-way word from one department's head to one, several, or all of the
  // others (F4-20). Deliberately no reply path and no thread: a notice is an
  // announcement between leaders, and a conversation belongs in a channel the
  // church does not run here.
  //
  // Recipients are stored as *department* ids, not user ids, so a notice
  // follows whoever currently holds the HOD seat rather than freezing to the
  // person who held it the day it was sent. A notice to a department with no
  // current HOD reaches nobody and waits unread until one is appointed.
  hodNotices: defineTable({
    fromUserId: v.id("users"),
    // Absent when a System Admin sends, since they hold no department seat.
    fromDepartmentId: v.optional(v.id("departments")),
    body: v.string(), // capped at HOD_NOTICE_MAX_LENGTH
    scope: v.union(v.literal("all"), v.literal("selected")),
    // Empty when `scope` is "all"; at least one entry when "selected".
    recipientDepartmentIds: v.array(v.id("departments")),
    // Stored rather than derived from `_creationTime` because the received list
    // is resolved at read time across the whole table, and reading one explicit
    // field keeps the sort obvious at both ends.
    sentAt: v.number(),
  })
    // The sender's own "sent" list.
    .index("by_from", ["fromUserId"])
    // The received list: newest first, paginated, with no time window, so a
    // notice is still readable long after it was sent (AC-32).
    .index("by_sentAt", ["sentAt"]),

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
    // How many users the resolved audience contained, written by `dispatch` at
    // insert time from the recipient list it already computes (spec 0011).
    // Without it the analytics page can count notifications but not reach:
    // "40 sent" and "40 sent to 1,200 people" are different facts and the page
    // shows both. Optional because rows written before this feature carry no
    // fan-out size, and the page's label says the figure counts only rows that
    // record one rather than quietly treating an absent field as zero.
    recipientCount: v.optional(v.number()),
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

  // ── Devotionals & Past Events (spec 0005) ───────────────────────────────────
  // Both are Media-department content: one devotional per date (enforced in the
  // mutation), past events are a YouTube archive. Separate tables, no
  // relationship between them.

  devotionals: defineTable({
    title: v.string(),
    scriptureReference: v.string(),
    body: v.string(),
    date: v.string(), // "YYYY-MM-DD" East Africa Time date key
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["date"]),

  pastEvents: defineTable({
    title: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    youtubeUrl: v.string(),
    youtubeVideoId: v.string(), // 11-char video ID, extracted on write
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["date"]),

  // ── Increment 8 — Per-user notification delete ──────────────────────────────
  // Same shape/index pattern as `notificationReads` above, and for the same
  // reason: `notifications` is one shared row per event, not per recipient
  // (see the Increment 6 comment above), so "delete" for one user can't be a
  // real document delete — it would remove the notification for every other
  // recipient too. This is a per-user overlay instead: a row here means "hide
  // this notification for this user," and `myNotificationsWithReadState`
  // (convex/notifications.ts) filters it out of both the list and the unread
  // count, same as an unread row filters into the count. No row = not
  // dismissed, same "don't store negative space" convention as
  // `notificationReads`.
  notificationDismissals: defineTable({
    userId: v.id("users"),
    notificationId: v.id("notifications"),
    dismissedAt: v.number(),
  })
    .index("by_userId_notificationId", ["userId", "notificationId"])
    .index("by_userId", ["userId"]),

  // ── Spec 0008 — Account deletion requests from the public web page ─────────
  // A person who has already removed the app cannot reach the in app flow, so
  // the public page issues a one hour link instead. The token is never stored
  // in plain text, only as a hash, and it binds to the `userId` resolved when
  // the link was issued rather than to the address. That matters because an
  // address can be reused after a deletion: binding to the address would let a
  // stale link delete whoever signed up next.
  accountDeletionRequests: defineTable({
    userId: v.id("users"),
    // Normalized (trimmed, lowercased). Kept for the rate limit count only.
    email: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    // Set when the link is claimed, inside the same transaction that performs
    // the deletion, so two concurrent confirmations cannot both succeed.
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_email", ["email"]),

  // ── Platform analytics & cost register (spec 0011) ─────────────────────────

  // One row per user who has ever reported activity. No row = never reported,
  // which is honest; a missing field on a shared document invites a zero.
  //
  // Deliberately NOT a field on `users`. An hourly write to a `users` document
  // would invalidate every live query reading that document — the role checks
  // in lib/authz.ts, Administration's dashboard, the member directory, every
  // profile subscription. Writing to a document nothing else subscribes to
  // keeps the cost of this feature inside this feature.
  userActivity: defineTable({
    userId: v.id("users"),
    lastActiveAt: v.number(), // unix ms
  })
    .index("by_userId", ["userId"])
    // The three nesting window reads (today / 7 days / 30 days), each a range
    // from its boundary rather than a scan of everyone who ever signed in.
    .index("by_lastActiveAt", ["lastActiveAt"]),

  // One row per phone that has reported while signed in. The row's identity is
  // `deviceId`, not the user: the same account on two phones is two rows, and
  // a different account signing in on one phone reassigns that row rather than
  // adding a second.
  userDevices: defineTable({
    // Generated once on the phone and kept in its own storage. Never derived
    // server-side, which is what makes two phones on one account countable.
    deviceId: v.string(),
    userId: v.id("users"),
    // Phones only. The portal writes no row here, so there is deliberately no
    // `web` member to let one in by accident.
    platform: v.union(v.literal("android"), v.literal("ios")),
    appVersion: v.string(), // from expo-constants; the app's string to define
    lastSeenAt: v.number(), // unix ms, throttled on this row's own value
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_userId", ["userId"]) // the deletion sweep (spec 0008)
    .index("by_lastSeenAt", ["lastSeenAt"]), // the 30-day window read

  // One row per external service the church uses (SRS §7). Maintained by hand
  // by a System Admin; the only automatic writer is the one-time reference
  // seed, which asserts a name, key and purpose and no money at all.
  costServices: defineTable({
    name: v.string(), // capped at COST_NAME_MAX; unique among non-archived rows
    // A COST_SERVICE_KEYS value, set by the seed. How a page finds a specific
    // service without matching on a name a System Admin may have edited:
    // Devices reads `play_console`/`app_store`, Health reads `sentry`, the
    // email allowance reads `resend`. Optional, since a System Admin may add a
    // service the set does not name.
    serviceKey: v.optional(vCostServiceKey),
    purpose: v.optional(v.string()), // capped at COST_PURPOSE_MAX
    plan: v.optional(v.string()), // capped at COST_PLAN_MAX; free text
    // A non-negative whole number of the currency's smallest unit: USD in
    // cents, UGX in shillings. Optional because a seeded row has no figure
    // until somebody reads the invoice.
    amountMinor: v.optional(v.number()),
    currency: v.optional(vCostCurrency),
    billingCycle: v.optional(vBillingCycle),
    // "YYYY-MM-DD" Africa/Kampala date key, the convention `devotionals` and
    // `pastEvents` already use. Required once the cycle is monthly or annual,
    // forbidden for the other three, validated as a real calendar date.
    renewalDate: v.optional(v.string()),
    // The plan's included allowance. Its unit is implied by `serviceKey`
    // through SERVICE_USAGE_METRIC, so there is no second unit field here to
    // contradict it.
    allowanceLimit: v.optional(v.number()),
    // Must start with https — enforced on write, because both pages render it
    // as an anchor and a `javascript:` value would execute in the browser.
    consoleUrl: v.optional(v.string()),
    accountHeldBy: v.optional(v.string()), // capped at COST_HELD_BY_MAX
    notes: v.optional(v.string()), // capped at COST_NOTES_MAX
    // Set means archived: out of the totals and out of the reminder sweep,
    // still readable. An explicit timestamp, not a soft-delete flag. Nothing
    // in this feature is ever deleted.
    archivedAt: v.optional(v.number()),
    archivedBy: v.optional(v.id("users")),
    // Also who the renewal sweep attributes its notification to, since a cron
    // has no acting user — the pattern convex/weeklyPrograms.ts already uses.
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_archivedAt", ["archivedAt"]) // the register list and the sweep
    .index("by_serviceKey", ["serviceKey"]), // the four analytics lookups

  // One row per reminder already sent. A row existing means that notice went
  // out; there is no "not sent" row, the same convention `notificationReads`
  // and `roleAssignments` follow.
  costRenewalNotices: defineTable({
    serviceId: v.id("costServices"),
    // The date the notice was about. In the key, which is what re-arms all
    // three stages when a renewal date moves forward.
    renewalDate: v.string(),
    stage: v.union(v.literal("t14"), v.literal("t3"), v.literal("due")),
    // The Africa/Kampala date the notice actually went out. In the key, which
    // is what lets `due` repeat once a day while a renewal is overdue without
    // `t14` or `t3` ever repeating, since those two are also keyed on stage.
    noticeDate: v.string(),
    sentAt: v.number(),
  }).index("by_service_renewal_stage", ["serviceId", "renewalDate", "stage"]),

  // Exactly one row, patched nightly. One row rather than a row per night
  // because the page shows current numbers only; a daily row would be storing
  // history nothing reads. Found with `.first()`, so no index.
  // The dollar rate the cost register converts with (spec 0011). One row per
  // pair, patched in place by the daily job, never appended to: the register
  // shows today's figure, and a history of rates is a different feature from
  // a register of costs.
  exchangeRates: defineTable({
    base: v.string(), // "USD"
    quote: v.string(), // "UGX"
    // Quote units per base unit, e.g. 4336.26 shillings per dollar. Not minor
    // units: a rate is a ratio, and rounding one to the shilling before it is
    // applied would lose more than it saves.
    rate: v.number(),
    // Shown beside every converted figure, because a rate without its moment
    // is a number nobody can check.
    fetchedAt: v.number(),
    source: v.string(), // the host that said so, shown once on the page
  }).index("by_pair", ["base", "quote"]),

  platformMetrics: defineTable({
    // Sum of every R2 object's size, treating a missing size as zero since the
    // component types it optional. Written only after a complete pass, so the
    // page never shows a partial sum.
    storageBytes: v.number(),
    storageObjectCount: v.number(),
    computedAt: v.number(), // shown beside the figure, because it is a day old
  }),
});
