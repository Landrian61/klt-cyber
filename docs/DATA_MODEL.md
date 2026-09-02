# KLT Cyber — Data Model

> **Living document.** The schema grows one increment at a time. This is deliberate: the
> core identity tables are designed with foresight so they stay stable, while
> feature-specific tables are added only once that feature's rules are settled. Many
> domain rules remain in flux; we do not model them until they are.

---

## Increment 1 — Authentication & Sign-Up

### Scope

**In this increment**
- Sign-up via **email/password** and **Google OAuth** — both produce a *visitor* account
- The minimal app-level `users` record created at sign-up
- The relationship between Better Auth's identity and our domain record
- The foundational `activityLogs` table
- Shared types and validators backing sign-up / sign-in

**Not in this increment** (next increment: *Profile Completion*)
- The rich church profile (`memberProfiles`): sex, date of birth, marital status, phone,
  and later clan / departments / mentorship. Completing this profile is what promotes a
  visitor to a member — see "Account lifecycle" below.

**Later increments**
- Clans, departments, role assignments, mentorship, ushering, radio, notifications,
  announcements, events, children, spouse links, professional info.

---

### Design principles (decisions recorded for the whole system)

Agreed before writing; these govern every future increment so they are not relitigated.

1. **Authentication is not membership.** Signing up (Google or email/password) creates an
   authenticated **visitor** — an account with no church-domain identity. Completing the
   member profile is a separate, deliberate action that promotes the visitor to a
   **member**. The data mirrors this exactly: *no profile record = visitor; profile record
   exists = member.*

2. **App identity is separate from auth identity.** Better Auth's Convex component owns the
   authentication tables (credentials, sessions, OAuth accounts). Our app owns a separate
   `users` table linked by `authId`. This keeps Better Auth (currently alpha) upgradeable
   without touching domain data.

3. **Scoped roles will be modeled as assignment records, not role strings.** A future
   `roleAssignments` table will express "Elder of Clan Reuben," "HOD of Mentorship," etc.
   Not built now — but `users.role` holds only the *base* role precisely to leave room for it.

4. **Notifications will be modeled richly** (type registry, scheduled vs. immediate,
   multi-channel routing, read receipts) when we reach that increment.

5. **Accountability is a first-class pattern.** An **approval-state shape** on any record
   requiring verification (introduced with the first such feature), plus a lightweight
   **`activityLogs`** table (introduced now). Hard immutability is deferred (a finance concern).

6. **Embed small fixed value-objects; reference unbounded collections.** Fixed-size nested
   data embeds in the parent document; anything that grows without bound or is queried
   independently becomes its own table.

---

### Account lifecycle

```
  sign up (Google / email+password)
        │
        ▼
  ┌──────────────┐     completes member profile      ┌────────────┐
  │   VISITOR    │ ────────────────────────────────▶ │   MEMBER   │
  │ users row,   │   (creates memberProfiles row,     │ users row +│
  │ no profile   │    flips role → member,            │ profile row│
  │              │    profileCompleted → true)        │            │
  └──────────────┘                                    └────────────┘
```

Basic visitor→member promotion is **self-service** — completing the required profile
fields is sufficient. Deeper affiliations (departments, clan, mentorship, leadership)
carry their own approval workflows in later increments and are *not* required for baseline
membership.

---

### Tables

#### Better Auth component tables — *managed, not defined by us*

The `@convex-dev/better-auth` component creates and owns these. We interact via the Better
Auth API and component client, never writing to them directly.

| Table | Holds |
|---|---|
| `user` | Auth identity: email, hashed password, verification flags |
| `session` | Active sessions / tokens |
| `account` | Linked credential and OAuth provider accounts (**Google used in this increment**) |
| `verification` | Email verification / reset tokens |

> Source of truth for **authentication**. Our `users` table is the source of truth for
> **base identity and authorization**; `memberProfiles` (next increment) for the rich
> church profile.

---

#### `users` — account identity (created at sign-up)

The minimal record created the instant someone signs up. A freshly signed-up user is a
**visitor**. Church-domain detail is deliberately absent here — it lives in
`memberProfiles`, created later at profile completion.

| Field | Type | Required | Notes |
|---|---|---|---|
| `authId` | `string` | yes | Better Auth user id — the link between systems |
| `email` | `string` | yes | Mirrored from Better Auth on creation for convenient querying/display. Better Auth remains source of truth. |
| `firstName` | `string` | no | populated from Google if available; otherwise set at profile completion |
| `lastName` | `string` | no | same |
| `profilePictureUrl` | `string` | no | from Google avatar if available |
| `role` | `"visitor" \| "member" \| "system_admin"` | yes | **base** role; defaults to `visitor` at sign-up |
| `status` | `"active" \| "suspended"` | yes | defaults to `active`; enables suspension without deletion |
| `profileCompleted` | `boolean` | yes | defaults to `false`; set `true` when the member profile is created |

System fields `_id` and `_creationTime` are automatic (Convex).

**Indexes**
- `by_authId` on `["authId"]` — primary lookup from an authenticated session
- `by_email` on `["email"]` — admin lookup / search
- `by_role` on `["role"]` — membership sorting (e.g. find all system admins)

**Relationships**
- 1:1 with the Better Auth `user` via `authId`.
- 1:1 with `memberProfiles` (next increment) via `userId`; absence of that row means visitor.

**Sync pattern**
- On auth-identity creation, Better Auth's `onCreateUser` internal mutation creates the
  matching `users` row, copying `email` (and name/avatar when the provider supplies them,
  e.g. Google). `role` is set to `visitor`, `profileCompleted` to `false`.

---

#### `activityLogs` — administrative audit trail

Foundational accountability table. Append-only by convention.

| Field | Type | Required | Notes |
|---|---|---|---|
| `actorUserId` | `id("users")` | yes | Who performed the action |
| `action` | `string` | yes | e.g. `"user.signup"`, `"user.profile_completed"`, `"user.role_changed"` |
| `targetType` | `string` | no | The kind of entity acted upon |
| `targetId` | `string` | no | Id of the entity acted upon |
| `metadata` | `object` | no | Free-form details |

**Indexes**
- `by_actor` on `["actorUserId"]`
- `by_action` on `["action"]`

---

### Shared types & validators — `packages/shared`

Single source of truth, imported by mobile, admin, and Convex.

**Enums / literal unions**
- `UserRole`: `visitor | member | system_admin`
- `UserStatus`: `active | suspended`

**Zod schemas**
- `signUpInputSchema` — email, password (email/password path only; Google path needs none of this)
- `signInInputSchema` — email, password
- `accountSchema` — the shape of a `users` document, for client typing

> Note: profile-related enums (Sex, MaritalStatus, age handling) are intentionally **not**
> defined here. They belong to the Profile Completion increment alongside `memberProfiles`.

---

### System admin bootstrap

The first `system_admin` is established by a Convex seed script keyed off an env var
(`SEED_ADMIN_EMAIL`). On run, if a user with that email exists, their `role` is set to
`system_admin`. Reproducible across environments; no hard-coded identities.

---

### Next increment — Profile Completion (preview, not built yet)

- New table `memberProfiles` (1:1 with `users`), holding sex, marital status, phone, and
  the date-of-birth handling. Creating this record is the visitor→member promotion.
- **Date of birth vs. age bracket** is decided *here*, not now. The spec asks for an "age
  bracket," but birthday messages and automatic age-based reallocation need a real
  birthdate. Recommendation: store `dateOfBirth`, derive the bracket. Confirm with the
  church (privacy); if bracket-only is required, those two features must be cut.

---

### Open / in-flux items (flagged, not settled)

1. **Member promotion approval** — assumed self-service (complete required fields → member).
   Confirm baseline membership does not require admin sign-off.
2. **Super T broadcaster structure** — *flagged, out of scope here.* Spec is internally
   inconsistent (24 hourly host slots vs. 12 clans × 2 members; "one user hosts every hour").
   To be resolved before the Radio increment.
3. Numerous later-feature rules remain in flux and will be settled per-increment:
   mentorship milestone validation, the ushering extension period (stated as both 2 and 3
   months), Elder eligibility edge cases, and others.

---
---

## Increment 2 — Profile Completion & Role Assignment

### Scope

**In this increment**
- The `memberProfiles` table — bio data captured when a visitor decides to become a member
- The `children` table — records of a member's children (children are data, not user accounts)
- The `clans` table — the 12 fixed clans, seeded reference data
- The `roleAssignments` table — scoped administrative role grants supporting multi-role users
- The **approval-state pattern**, formalized
- The **web portal authorization invariant**, formalized
- Amendments to Increment 1: `users.role` enum and the seed-script behavior

**Not in this increment** (added later, with their respective module increments)
- `departments`, `departmentMemberships` — arrive with the Departments module
- Mentorship tables (classes, enrollments, milestone records) — arrive with Mentorship
- Leadership-institute records — arrive with Leadership Institute
- The Reign Radio domain (broadcasts, super-T nominations, listening sessions, messages)
- Notifications (richly modeled), announcements, events
- Spouse linking
- Finance, library, missions, construction, hospitality, etc.

---

### Amendments to Increment 1

**`users.role` reduced to consumer lifecycle only.**

The earlier `users.role` value `"system_admin"` is dropped. The field now describes only
where the user sits in the consumer lifecycle:

```
role: "visitor" | "member"
```

System admin — and every other administrative authority — lives in `roleAssignments`
from this increment onward. The two are orthogonal dimensions:

| Dimension | Field/Table | Values |
|---|---|---|
| Consumer lifecycle | `users.role` | visitor, member |
| Administrative authority | `roleAssignments` | zero or more grants |

A system admin who never completes a member profile is *still a visitor* on the consumer
axis — they have a `system_admin` role assignment but no `memberProfiles` row. That's
fine and expected.

**Seed script supersedes Increment 1's bootstrap.**

The old seed script patched `users.role` to `"system_admin"`. The new flow:

- `seed:bootstrapSystemAdmin` — for the user matching `SEED_ADMIN_EMAIL`: ensures
  exactly one active `roleAssignments` record with `roleType: "system_admin"`; if
  `users.role` is still `"system_admin"` from before, flips it to `"visitor"`.
  Idempotent.
- `seed:clans` — ensures the 12 clan records exist with their canonical names and order.
  Idempotent.

Both run on every deploy and converge on the correct state.

---

### Design principles (additions and clarifications)

7. **Consumer lifecycle and administrative authority are orthogonal.** A person sits at
   coordinates on both axes independently. Don't conflate them in code or queries.

8. **Web portal access is gated by role, not by membership.** See "Web portal
   authorization invariant" below.

9. **Multi-role is structural.** A user may hold any number of `roleAssignments`. The
   web portal handles multi-role with a role-picker on every login; the chosen role
   scopes what the portal shows.

10. **Profile completion is mobile-only.** There is no web path to becoming a member.
    Users who only use the web have no `memberProfiles` row and remain visitors — they
    don't need member features because they have administrative roles instead.

11. **Authorities own the structural data.** Mentorship status, leadership-institute
    progress, department membership are *not* user-claimable fields on `memberProfiles`.
    Each is managed by the appropriate authority via that module's portal when it ships.
    `memberProfiles` stays bio-only.

---

### The approval-state pattern (formalized)

Many records in the domain need verification by an authority before becoming operational.
A consistent shape lets the same UX patterns and queries work across them.

**The shape** (used as a nested object on records that need approval, not as its own table):

```ts
{
  status: "pending" | "verified" | "rejected",
  verifiedBy?: id("users"),   // who approved/rejected
  verifiedAt?: number,         // when
  note?: string,               // optional reason or remark
}
```

**Used in this increment** on `memberProfiles.clanApproval` (the approval state of the
user's self-selected clan).

**Will be used in later increments** on `departmentMemberships`, mentorship completion,
leadership-institute progress, and other authority-verified records. Each adds a
`*Approval` field with this shape.

---

### The web portal authorization invariant

Captured here so no future increment violates it.

> **A web portal session is valid only when the user has ≥1 active `roleAssignments`
> record.** Enforced by the server component for each route — the two portal layouts,
> the `/areas-of-service` page, and `getDepartmentAccess` for `/departments/{id}` —
> and re-checked inside every gated Convex function. If there are none, the user is
> redirected to a public `/unauthorized` page with a friendly message directing them
> to the mobile app.

Middleware only checks that a session cookie is present; it does not read roles.
Routing is UX, not the security boundary — the enforceable check is the one inside
the Convex function, which holds even for a client that calls Convex directly.

A route added under `app/(admin)/` does **not** inherit the gate. Enforce the
invariant in its own server component, and put the real check in the Convex
function it reads from.

**Consequences**
- A user whose last role is revoked while signed in loses data access immediately
  (every gated Convex function throws), but keeps the portal shell until they cross
  route segments, hard-navigate, or refresh. See `docs/ARCHITECTURE.md` §5.2.
- A user who signs up via web and is never assigned a role cannot enter the portal.
- The mobile app is unaffected — it has its own gating (tab-level, based on
  `users.profileCompleted`).

---

### Updated account lifecycle

```
  sign up (mobile or web; email or Google)
        │
        ▼
  ┌──────────────┐
  │   VISITOR    │  Mobile: Home, Radio, Library. Soft nudge on gated tabs.
  │              │  Web: blocked — redirected to /unauthorized.
  └──────────────┘
        │
        │  completes profile on MOBILE
        ▼
  ┌──────────────┐
  │    MEMBER    │  Mobile: full app. Web: still blocked unless role-assigned.
  │              │  Creates `memberProfiles` row.
  │              │  users.role → "member"; users.profileCompleted → true.
  └──────────────┘
        │
        │  system admin assigns one or more roles
        ▼
  ┌────────────────┐
  │ MEMBER + ROLES │  Mobile: same. Web: role picker → that role's portal.
  │                │  One or more `roleAssignments` records.
  └────────────────┘
```

System admin is special: bootstrapped via seed regardless of consumer-lifecycle stage.
A bootstrapped admin who has never used the mobile app is still a `visitor` on
`users.role` but holds a `system_admin` role assignment and can use the web portal.

---

### Tables

#### `memberProfiles` — the church-domain bio (created at profile completion)

1:1 with `users`. Absence of this row means the user is a visitor; presence means member.

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | `id("users")` | yes | Link to the auth identity |
| `sex` | `"male" \| "female"` | yes | |
| `dateOfBirth` | `string` (ISO date `YYYY-MM-DD`) | no | Optional; freely editable by the member. Age-driven features (birthday messages, auto-reallocation between Youth/Adult) only fire for members who provided it. |
| `maritalStatus` | `"single" \| "married" \| "widowed" \| "divorced"` | yes | `married` is later load-bearing (Elder eligibility) |
| `phone` | `string` | no | Editable from the profile page |
| `profession` | `string` | no | Editable; added later from the profile page rather than at completion |
| `clanId` | `id("clans")` | no | Optional — the user may not identify with a clan yet |
| `clanApproval` | approval-state shape | conditional | Present iff `clanId` is set. Defaults to `{ status: "pending" }` on first self-selection. |

System fields `_id` and `_creationTime` are automatic.

**Indexes**
- `by_userId` on `["userId"]` — primary lookup
- `by_clanId` on `["clanId"]` — "all members in clan X"

**Relationships**
- 1:1 with `users` via `userId`.
- N:1 with `clans` via `clanId` (optional).
- 1:N with `children` via `children.parentUserId`.

**Creation effect**

Creating a `memberProfiles` row is a single atomic mutation that also:
- patches `users.role` from `"visitor"` to `"member"`
- patches `users.profileCompleted` from `false` to `true`
- writes an `activityLogs` row with `action: "profile.completed"`

**Editability**

After creation, the member may edit from their profile page:
- `dateOfBirth` (freely)
- `phone`, `profession`, `clanId` (with `clanApproval` re-set to `pending`)
- `profilePictureUrl` and `firstName` / `lastName` (which live on `users`, not here)

The member **cannot** self-edit `sex` — admin intervention is required if genuinely
wrong. Sex is treated as effectively immutable from the member's side because it
affects downstream eligibility logic (Elder, Men's/Women's department assignments,
etc.) and accidental changes are easier to prevent than to detect.

---

#### `children` — children of members (data records, not user accounts)

Children are not users. Each is a record owned by a parent user.

| Field | Type | Required | Notes |
|---|---|---|---|
| `parentUserId` | `id("users")` | yes | The parent's user record |
| `name` | `string` | yes | |
| `dateOfBirth` | `string` (ISO date) | no | If known, enables automatic age-bracket progression and birthday recognition |
| `ageBracket` | `"0-12" \| "13-19" \| "20-35" \| "36+"` | yes | Computed from `dateOfBirth` if given; otherwise as entered by the parent |
| `guardianContact` | `string` | no | Per spec section 5.19.2 |

**Indexes**
- `by_parentUserId` on `["parentUserId"]` — "all children of this parent"

**Editability**

Parents may freely add, edit, and remove their own children records from the profile
page. Authorities (HOD Children's Church, etc.) may also create child records directly
in later increments — those may or may not be linked to a parent account.

---

#### `clans` — the 12 fixed clans (seeded reference data)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | One of the twelve sons of Jacob |
| `order` | `number` | yes | 1–12, display order |

**Indexes**
- `by_order` on `["order"]`

**Seed data** (in birth order per Genesis 29–30, 35):

| Order | Name |
|---|---|
| 1 | Reuben |
| 2 | Simeon |
| 3 | Levi |
| 4 | Judah |
| 5 | Dan |
| 6 | Naphtali |
| 7 | Gad |
| 8 | Asher |
| 9 | Issachar |
| 10 | Zebulun |
| 11 | Joseph |
| 12 | Benjamin |

Seeded on first deploy via `seed:clans`. Idempotent on subsequent deploys.

---

#### `roleAssignments` — scoped administrative role grants

The structural answer to multi-role. A user may hold any number of these.

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | `id("users")` | yes | The assignee |
| `roleType` | union (see below) | yes | The kind of role |
| `clanId` | `id("clans")` | conditional | Set when `roleType` requires clan scope (currently: `clan_elder`) |
| `assignedBy` | `id("users")` | yes | Who granted the assignment |
| `status` | `"active" \| "revoked"` | yes | |
| `revokedBy` | `id("users")` | no | Set when `status` is `"revoked"` |
| `revokedAt` | `number` | no | Timestamp of revocation |
| `note` | `string` | no | Optional reason / context |

`_creationTime` is the `assignedAt`.

**`roleType` values supported in this increment**

```
roleType: "system_admin" | "clan_elder"
```

The union extends as later modules land. Adding a new role type is a deliberate schema
migration.

**Future `roleType` values anticipated** (added with their respective modules):
- `team_leader`, `first_lady`, `executive_pastor`, `resident_pastor`, `pastor`,
  `church_administrator`, `elder_council_chair` — unscoped or singleton roles
- `hod` (scope: department) — when the Departments module ships, adds `departmentId`
- `tutor` (scope: class) — when the Mentorship module ships, adds `classId`
- `section_head` (scope: section) — when subdepartment structure ships
- `radio_admin` — when the Media module ships

When a new `roleType` is added, its scope (if any) joins as an optional field. The
schema-level type union is updated in the same migration.

**Indexes**
- `by_userId` on `["userId"]` — the central query: "what roles does this user hold?"
  Used by the authorization helpers in `convex/lib/authz.ts` (and so by every gated
  query and mutation), by the Areas of Service picker, and by the user-detail view in
  the admin dashboard.
- `by_roleType` on `["roleType"]` — "all system admins," "all clan elders"
- `by_clanId` on `["clanId"]` — "who is elder of clan X?" (only meaningful for
  `clan_elder` rows)

**Eligibility for assignment (MVP rule)**

A `roleAssignments` row may only be created for a user whose `users.profileCompleted`
is `true`. The system admin uses judgment beyond that until per-role eligibility
automation lands (e.g. Elder requires male + married + 35+ + mentorship complete — those
checks come with the Mentorship module and others).

**Conflict resolution on conflicting roles**

When assigning `clan_elder` for `clanId` X, if an active `clan_elder` already exists for
the same clan, the existing one is **revoked-and-replaced** in the same mutation
(`status → revoked`, `revokedBy/revokedAt` set), with both events logged. The spec's
"one elder per clan" rule is enforced at mutation time, not by a schema constraint.

**Activity logging**

Every assignment writes an `activityLogs` row with `action: "role.assigned"`. Every
revocation writes `action: "role.revoked"`. `actorUserId` is the `assignedBy` /
`revokedBy`.

---

### `activityLogs` — new actions in this increment

The table itself is unchanged. New `action` values introduced:

- `"profile.completed"` — written when a `memberProfiles` row is created
- `"child.added"`, `"child.updated"`, `"child.removed"`
- `"clan.affiliation_claimed"` — user selected a clan
- `"clan.affiliation_verified"` — authority verified
- `"clan.affiliation_rejected"` — authority rejected
- `"role.assigned"` — `roleAssignments` row created
- `"role.revoked"` — status flipped to revoked
- `"user.suspended"` / `"user.unsuspended"` — `users.status` flipped

---

### Shared types & validators — `packages/shared` additions

**New enums / literal unions**

- `Sex`: `male | female`
- `MaritalStatus`: `single | married | widowed | divorced`
- `AgeBracket`: `0-12 | 13-19 | 20-35 | 36+`
- `RoleType`: `system_admin | clan_elder` (extends as modules ship)
- `ApprovalStatus`: `pending | verified | rejected`

**Updated**

- `UserRole`: now `visitor | member` (was `visitor | member | system_admin` in Increment 1)

**New zod schemas**

- `profileCompletionInputSchema` — sex, maritalStatus (required); dateOfBirth, phone,
  clanId, children array (all optional). firstName / lastName optional inputs that
  populate `users` if not already set from a Google sign-up.
- `childInputSchema` — name, dateOfBirth (opt), ageBracket, guardianContact (opt)
- `profileUpdateInputSchema` — the fields a member may self-edit: phone, profession,
  profilePictureUrl, clanId
- `roleAssignmentInputSchema` — userId, roleType, and the scope field corresponding to
  the role type (currently clanId for clan_elder)
- `approvalStateShape` — reusable zod object for `{ status, verifiedBy?, verifiedAt?, note? }`

---

### Following Increment 2 — System Admin Dashboard + Role Management UI

*Status: implemented in PRs 8–11 (Convex schema mutations, mobile profile
completion, web middleware refactor, System Admin dashboard). No new tables
were introduced; those PRs consumed Increment 2's schema.*

The web side of Increment 2's schema:

- `/select-role` page shown after sign-in to users with ≥1 active assignment; users
  with none are redirected to `/unauthorized`.
- `/system-admin/` route group with middleware enforcing the `system_admin` role.
- Dashboard landing showing total users, visitors vs. members, sign-ups in the last
  7 days, recent activity-log entries.
- Users list with search and filters (role state, member state, suspended).
- User detail with role-assignment UI (grant + revoke, with note).
- Mobile profile-completion flow wired against `memberProfiles`.
- Mobile tab-level gating (Home/Radio/Library open; member-rooted tabs prompt
  "Complete your profile" for visitors, non-blocking).

---
Increment 3: Content & Home Feed
 
## Status
Implemented (PR7). This revision (PR7a) replaces the original temporary access-control mechanism
— an environment-variable allowlist — with a minimal slice of Increment 2's `roleAssignments`
table, pulled forward for the reasons described below. The rest of Increment 2 —
`memberProfiles`, `children`, `clans`, the role picker UI, and Clan Elder's revoke-and-replace
mutation logic — is untouched by this and still lands in PR8–11.
 
## Purpose
Powers the visitor-facing Home tab: leadership welcome, theme/scripture, weekly programs,
upcoming events, and announcements. All content in this increment is global (not per-user) and
readable by every authenticated session, visitor or member, per current tab-gating policy (Home
is open to visitors).
 
Explicitly out of scope for this increment: activity check-in / live attendee counts (12.3.4),
the Giving section (deferred per MVP phasing), "Join the Ministry" lead capture / visitor
inquiries (pending stakeholder discussion), and `programExceptions` (see note under
`weeklyPrograms` below).
 
---
 
## Tables
 
### `themes`
Annual and monthly themes, each with scripture and an explicit validity period rather than a
manual toggle — a theme naturally stops applying once `periodEnd` passes, and a theme can span
multiple months by widening the period.
 
```ts
themes: defineTable({
  scope: v.union(v.literal("annual"), v.literal("monthly")),
  title: v.string(),
  scriptureReference: v.string(),
  scriptureText: v.string(),
  coverImageUrl: v.optional(v.string()),
  periodStart: v.number(),   // unix ms, start of day
  periodEnd: v.number(),     // unix ms, end of day
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_scope_period", ["scope", "periodStart"])
```
 
"Current theme" for a given scope = the row where `periodStart <= now <= periodEnd`. Overlapping
periods within the same scope are an admin data-entry error, not something the schema prevents —
fine at this scale, revisit if it becomes a real problem.
 
### `weeklyPrograms`
Program slots (Sunday Service, prayer meeting, etc.) — either recurring (indefinitely or bounded
to a date range) or a single one-off occurrence. No stored occurrences — the calendar view
expands these virtually at query time (see below and `convex/lib/recurrence.ts`).
 
```ts
weeklyPrograms: defineTable({
  title: v.string(),
  description: v.optional(v.string()),

  // DEPRECATED — superseded by daysOfWeek/startTime/recurrence below. Kept
  // only so pre-migration rows still validate; no longer written. Remove
  // once verifyWeeklyProgramsMigration confirms 0 remaining legacy-only
  // rows (see convex/weeklyProgramsMigration.ts) — follow-up PR.
  dayOfWeek: v.optional(v.number()),  // 0 = Sunday … 6 = Saturday
  time: v.optional(v.string()),       // "09:00", 24h HH:mm

  // Recurrence model. Optional at the table level for migration safety —
  // createProgram's arg validator requires these for every new row.
  recurrence: v.optional(v.union(
    v.literal("once"), v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")
  )),
  daysOfWeek: v.optional(v.array(v.number())), // 0=Sun..6=Sat; 1 entry for once/monthly, 1+ for weekly/biweekly
  weekOfMonth: v.optional(v.union(              // weekday-position ("1st"/.../"last") — monthly only
    v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(-1)
  )),
  startDate: v.optional(v.number()),  // unix ms, local start of day — required by the form for new rows
  endDate: v.optional(v.number()),    // unix ms, inclusive — absent = open-ended
  startTime: v.optional(v.string()),  // "HH:mm", church-local (Africa/Kampala, no DST) — supersedes `time`
  endTime: v.optional(v.string()),    // "HH:mm" — optional

  location: v.optional(v.string()),
  coverImageUrl: v.optional(v.string()),
  active: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_active", ["active"])
  .index("by_dayOfWeek", ["dayOfWeek"])  // kept until the legacy field is dropped
```
 
**Recurrence types:** `once` (a single dated occurrence — `daysOfWeek` holds the one matching
weekday, `endDate` unset), `weekly` (every week on one or more `daysOfWeek` — this is also how
"Monday–Friday for a term" is expressed: `daysOfWeek: [1,2,3,4,5]` plus a bounded
`startDate`/`endDate`), `biweekly` (every 2 weeks, anchored to `startDate`), `monthly` (once a
month by weekday position — `weekOfMonth` + a single `daysOfWeek` entry, e.g. "the first Sunday").
`startDate`/`endDate` apply uniformly across all types; either or both may be unbounded.
 
**`programExceptions` remains out of scope** — a one-off *change* to an otherwise-recurring
program (e.g. this Sunday only, service moves to 11am) is still handled by creating a one-time
`events` row and leaving the program as-is, not by suppressing/overriding a single occurrence.
That's a different concept from `recurrence: "once"` above, which is the base program row itself
being non-recurring by design, not an exception to a recurring one. Revisit exceptions only if
they prove painful in practice — don't build that machinery preemptively.
 
**Occurrence key convention:** when a program is expanded into a calendar occurrence for a
specific date, use `${programId}_${YYYY-MM-DD}` as its identifier (unchanged by the recurrence
model above — it only changes which dates a program expands onto). Nothing consumes this yet, but
future check-in / attendance features (12.3.4) will need a stable key per occurrence, so the
expansion logic should produce this consistently from day one.
 
### `events`
One-off events. Kept as a separate table from `weeklyPrograms` even though the fields overlap
today, since events are expected to grow event-specific features (calendar export, RSVPs, etc.)
that programs won't need.
 
```ts
events: defineTable({
  title: v.string(),
  description: v.optional(v.string()),
  location: v.optional(v.string()),
  startDateTime: v.number(),  // unix ms — stored as an instant, not date+time strings, for future ICS export
  endDateTime: v.number(),
  coverImageUrl: v.optional(v.string()),
  featured: v.boolean(),      // surfaces in the Home tab event slider
  active: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_startDateTime", ["startDateTime"])
  .index("by_featured", ["featured", "startDateTime"])
```
 
### `announcements`
```ts
announcements: defineTable({
  title: v.string(),
  body: v.string(),
  category: v.optional(v.string()),
  priority: v.optional(v.union(v.literal("low"), v.literal("normal"), v.literal("high"))),
  coverImageUrl: v.optional(v.string()),
  links: v.optional(v.array(v.object({
    label: v.string(),
    url: v.string(),
  }))),
  startDate: v.number(),
  endDate: v.number(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_status_startDate", ["status", "startDate"])
```
 
`draft → published → active → expired/disabled → archived` (per spec §10.8) is derived at query
time, not stored as separate states: "active" = `status == "published" AND startDate <= now <=
endDate`; "expired" = `status == "published" AND now > endDate`; "disabled" = admin sets `status`
to `"archived"` before `endDate` passes. Only `draft`, `published`, `archived` need to be actual
stored values.
 
### `visitorInquiries` — deferred
Not created this increment. Schema TBD pending stakeholder discussion on what "Join the Ministry"
is actually meant to capture, and whether it's distinct from mobile profile completion.
 
---
 
## Access Control
 
All five reads (theme, programs, events, announcements, calendar) are open to any authenticated
session — visitor or member — matching current tab-gating for Home.
 
Writes are gated by a single helper, `canManageContent(ctx)`, called from every content mutation.
It checks for an active row in `roleAssignments` (see below) with `roleType` in
`["system_admin", "church_admin"]` for the caller's `userId` — `church_admin` is anticipated but
not yet a defined value in the union; adding it later is a one-line union extension, not a
rewrite of this helper or its callers.
 
This replaces the original design, which checked the caller's `authId` against an
environment-variable allowlist (`CONTENT_ADMIN_AUTH_IDS`). That approach was dropped once a
second developer joined working against a shared dev deployment: granting or revoking admin
access meant editing deployment configuration, which doesn't hold up for day-to-day
collaboration. A `roleAssignments` row is just data — visible and editable directly in the
Convex dashboard's table view, no redeploy and no code change either direction.
 
Church Administrator and System Administrator share identical content-management permissions in
this increment — no distinction is enforced yet, consistent with the note that system admin can
also perform this role.
 
### Minimal `roleAssignments` slice
 
Only the table and a lookup are needed here — not the rest of Increment 2.
 
```ts
roleAssignments: defineTable({
  userId: v.id("users"),
  roleType: v.union(v.literal("system_admin"), v.literal("clan_elder")), // church_admin planned
  clanId: v.optional(v.id("clans")),   // unused by this increment; reserved for clan_elder scoping
  assignedBy: v.optional(v.id("users")),
  status: v.union(v.literal("active"), v.literal("revoked")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId_status", ["userId", "status"])
```
 
`canManageContent(ctx)` resolves the caller's `userId`, then looks up `roleAssignments` via the
`by_userId_status` index for a row with `status: "active"` and `roleType` in
`["system_admin", "church_admin"]`. No `assignRole`/`revokeRole` mutation ships in this
increment — granting access is a manual dashboard insert (see `WEB_COLLABORATOR_SETUP.md` for
the exact steps). A proper mutation with its own authorization belongs to Increment 2, alongside
the role picker UI and Clan Elder's revoke-and-replace semantics.
 
## Calendar (view, not a table)
 
The calendar is a query, `getCalendarRange(startDate, endDate)`, not a stored entity — avoids a
redundant table that could drift from `events` / `weeklyPrograms`. It:
 
1. Expands every `active` `weeklyPrograms` row into virtual occurrences for each matching
   `dayOfWeek` within the range (computed on the fly, nothing persisted).
2. Pulls `events` rows whose `startDateTime` falls within the range.
3. Merges both into one sorted list, each item tagged `type: "program" | "event"`, programs
   carrying the `occurrenceKey` described above.
This is also the shape future departmental calendars (Missions, Creative Arts, etc.) will plug
into later — extend the merge, don't build a parallel structure.
 
## Audit logging
Content create/update/publish/archive mutations should write to the existing `activityLogs`
table (Increment 1) for consistency with the audit pattern already in place, rather than
introducing a separate content-log table.
 
## Media
`coverImageUrl` fields store a plain URL for this increment. If R2 upload wiring isn't already
available from earlier PRs, admin UI accepts a pasted URL for v1; a dedicated upload flow can
follow once needed rather than being built as a prerequisite here.

# DATA_MODEL.md — Increment 4: Member Profiles, Verification & Tower of Faith

## Status
Proposed. Depends on Increment 3's `roleAssignments` table (extends its `roleType` union) and
the fixed `clans` reference table. Mobile submission (the 7-step form + uploads) ships this week,
owned outside this doc. This increment covers the backend schema and the web-side verification
workflow Naomi is building.

---

## `roleAssignments` — activate `church_admin`

Increment 3 left `church_admin` as a planned-but-undefined union member. It's real now:

```ts
roleType: v.union(v.literal("system_admin"), v.literal("clan_elder"), v.literal("church_admin"))
```

No other change to that table.

---

## `memberProfiles`

One row per user, created on final submission (not on first form open — see "Open questions"
below on whether partial drafts need persisting).

```ts
memberProfiles: defineTable({
  userId: v.id("users"),

  // Personal — Step 1
  firstName: v.string(),
  middleName: v.optional(v.string()),
  lastName: v.string(),
  phone: v.optional(v.string()),
  sex: v.union(v.literal("male"), v.literal("female")),
  dateOfBirth: v.optional(v.object({
    day: v.number(),                 // 1–31
    month: v.number(),               // 1–12
    year: v.optional(v.number()),    // omitted if the member declines to share birth year
  })),
  maritalStatus: v.union(
    v.literal("single"), v.literal("married"), v.literal("widowed"), v.literal("divorced")
  ),
  shortBio: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  joinDate: v.optional(v.number()),  // self-reported; distinct from this record's own createdAt
  address: v.optional(v.object({     // self-reported; line1 essential, rest refine for grouping
    line1: v.string(),               // village/zone, plot & street
    city: v.optional(v.string()),
    district: v.optional(v.string()),
    country: v.optional(v.string()),
  })),

  // Family — Step 2
  spouseUserId: v.optional(v.id("users")),       // linked via search, only if spouse is registered
  spouseNameUnlinked: v.optional(v.string()),     // fallback free text — confirm this is wanted
  anniversaryDate: v.optional(v.number()),
  nextOfKin: v.optional(v.object({
    fullName: v.string(),
    relationship: v.string(),
    phone: v.string(),
  })),

  // Mentorship — Step 3. Self-reported; no submission gate on status.
  mentorshipStatus: v.union(
    v.literal("not_enrolled"), v.literal("enrolled"), v.literal("completed")
  ),
  mentorshipProofUrl: v.optional(v.string()),     // absent = admin must follow up manually

  // Clan — Step 5
  clanId: v.optional(v.id("clans")),

  // Note: Areas of Service (Step 6) is NOT a field here. The wizard writes
  // up to MAX_ACTIVE_DEPARTMENTS selections directly into
  // `departmentMemberships` as part of `submitProfile` (self-added,
  // `addedBy` = the member) — see the `departmentMemberships` section below.
  // `memberProfiles` never had a `departmentId` field; an earlier draft of
  // this doc incorrectly showed one.

  // Profession — Step 7
  occupation: v.optional(v.string()),
  industry: v.optional(v.string()),
  employer: v.optional(v.string()),
  skills: v.optional(v.array(v.string())),

  // Verification
  profileStatus: v.union(v.literal("pending_verification"), v.literal("verified")),
  verifiedBy: v.optional(v.id("users")),
  verifiedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_profileStatus", ["profileStatus"])
  .index("by_spouseUserId", ["spouseUserId"])
```

No `rejected` status, per the "no formal rejection" rule — admin edits fields in place and moves
a profile straight to `verified` rather than bouncing it back.

---

## `leadershipProgress`

Separate table, not an array on the profile, since proof is tracked per level as someone
progresses through Level 1 → Level 2 → Advanced.

```ts
leadershipProgress: defineTable({
  userId: v.id("users"),
  level: v.union(v.literal("level_1"), v.literal("level_2"), v.literal("advanced")),
  // TRANSITIONAL: "in_progress" was renamed to "enrolled". The schema still
  // accepts it so deployments with pre-rename rows pass validation, but no
  // new row is ever written with it — see convex/leadershipMigration.ts for
  // the one-time data fix and the removal plan for this literal.
  status: v.union(
    v.literal("in_progress"), v.literal("enrolled"), v.literal("completed")
  ),
  proofUrl: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
```

No row for a level = not enrolled in it — same "don't store negative space" convention as
`roleAssignments`. The mobile wizard's Leadership step shows a third "Not Enrolled" choice per
level (matching mentorship's vocabulary), but it's UI-only: choosing it just omits that level from
`submitProfile`'s `leadershipEntries`, rather than persisting a third status value. Sequential
ordering (can't be mid-Level-2 without a completed Level 1) isn't enforced at the schema level;
treat it as a mutation-time check if you want it enforced at all.

---

## `children`

```ts
children: defineTable({
  parentUserId: v.id("users"),
  name: v.string(),
  dateOfBirth: v.optional(v.number()),   // simplified to a single optional date; age derives at display time
  sex: v.union(v.literal("male"), v.literal("female")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_parentUserId", ["parentUserId"])
```

Kept as its own table (not embedded in `memberProfiles`) — the Children's Church spec needs to
query children as a standalone collection (birthday lists, age-based transition to Youth at 13),
which doesn't work cleanly if they only exist nested inside a parent's document.

---

## `departments`

```ts
departments: defineTable({
  name: v.string(),
  description: v.optional(v.string()),
  active: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_active", ["active"])
```

Deliberately **not** seeded, unlike the fixed 12 clans — Church Admin owns and populates this
list live. This also makes a clean, self-contained second task for Naomi: same CRUD shape as the
four content tables, but simpler (no dates, no lifecycle), good for applying the pattern herself.

---

## `facilities` (Tower of Faith)

```ts
facilities: defineTable({
  name: v.string(),
  tagline: v.optional(v.string()),
  description: v.optional(v.string()),
  servicesOffered: v.optional(v.array(v.string())),
  campusBlock: v.optional(v.string()),
  address: v.optional(v.string()),
  contactPerson: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),   // wa.me link is built from this at render time, not stored separately
  imageUrl: v.optional(v.string()),
  active: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_active", ["active"])
```

No separate `facilityId` field — Convex's generated document ID covers it; add one only if you
need a human-readable code for something printed physically at the facility.

---

## Verification mutation

`verifyProfile(profileId, edits?)`:
1. If `edits` is provided, apply the admin's corrections to the relevant fields first.
2. Set `profileStatus: "verified"`, `verifiedBy`, `verifiedAt`.
3. In the same mutation, flip the linked `users.role` from `"visitor"` to `"member"`.
4. Does **not** touch `roleAssignments` — membership and admin authority stay fully orthogonal,
   exactly as already established. Verifying someone's profile never grants them any authority.

## Media uploads

Mentorship proof, leadership proof, and facility images all need the same underlying capability:
upload to R2, get back a URL, attach it to the relevant mutation. Worth building this once as a
shared utility (client requests an upload URL, uploads directly to R2, submits the resulting URL)
rather than three separate implementations — mobile needs it for certificates this week, web
needs it for facility images around the same time.

> Built. The shared gateway is `convex/uploads.ts` (backed by the `@convex-dev/r2`
> component); the durable value stored on documents is the object **key**, resolved to a
> short-lived signed URL at display time. Provisioning, environment setup, and usage across
> backend / mobile / admin are documented in [STORAGE.md](./STORAGE.md).

## Access control

Introduce `canManageChurchAdmin(ctx)`, checking for an active `roleAssignment` with `roleType` in
`["system_admin", "church_admin"]` — same check Increment 3's `canManageContent` already
performs. Use it for `verifyProfile`, and for the `departments` and `facilities` mutations.
`canManageContent` can either be refactored to call this directly, or left alone — functionally
identical, just avoiding duplicated authorization logic going forward.

---

## Open questions to confirm

- **`spouseNameUnlinked`** — kept as a fallback so an unregistered spouse's name isn't lost
  entirely. Drop it if you'd rather the field be link-only.
- **No draft persistence** — assumed the 7-step form submits atomically at the end; no partial
  progress saved server-side. If you want someone to close the app mid-form and resume later,
  that's a real addition (a `draft` `profileStatus`, partial-save mutations) worth deciding now.
- **`joinDate`** treated as optional, matching the pattern of only marking fields required when
  explicitly marked so in your spec.
- **Children's date of birth** simplified to a single optional date rather than the
  DOB-or-age ambiguity in the original wording — confirm that's fine.

---

## `plannedActivities` — Year Planner (Increment 5)

Backs the Year Planner page (docs/Admin_Portal.md). Internal planning records — never surfaced to
members — distinct from the member-facing `weeklyPrograms`/`events`/`announcements` content in the
Increment 3 section above.

```ts
plannedActivities: defineTable({
  title: v.string(),
  description: v.optional(v.string()),
  targetDate: v.number(),              // unix ms, start of day (Africa/Kampala) — where it lands on the calendar
  departmentIds: v.array(v.id("departments")), // area(s) of service responsible; at least one
  status: v.union(v.literal("planned"), v.literal("in_progress"), v.literal("done")),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_targetDate", ["targetDate"])
```

No stored `month` field — the spec's "which month" is derived from `targetDate` at render time,
the same way `themes`' "current theme" derives from a validity period rather than a stored flag.

**Reads/writes.** Same gate as the rest of Administration's content
(`canManageContent`/`getAdministrationAuthorityOrNull` in `convex/lib/authz.ts`): Administration
HOD, delegate, or `system_admin`. `plannedActivities.getYearPlannerRange` is the planner's single
data source — it reuses the occurrence-expansion helpers exported from `convex/calendar.ts`
(`kampalaParts`, `occurrenceInstant`, `ymd`, `DAY_MS`) to merge active weekly-program occurrences,
in-range events, and in-range activities into one sorted list per the calendar day they land on.
This is a *separate* query from `calendar.getCalendarRange`, not an extension of it — the public
calendar is open to any authenticated session (including mobile), and `plannedActivities` must
never leak into that surface.

**Future addition, not needed for this to already be useful** (per docs/Admin_Portal.md): notify
everyone responsible for a month's activities automatically when the month begins. No table or
field changes anticipated for that — it reads `plannedActivities` + `departmentIds` as they stand.

---

## `notifications` & `notificationReads` — Push Notifications (Increment 6)

Installs `@convex-dev/expo-push-notifications` (registered in `convex/convex.config.ts` alongside
`betterAuth` and `r2`) and adds the domain-side tables the component itself doesn't provide: what a
notification *says* and *who it's for*, and which users have read it. The component's own internal
tables (device push tokens, delivery/retry state) live in its own namespace and aren't part of this
schema. `EXPO_ACCESS_TOKEN` (optional, enhanced push security) is not yet generated — the component
works without it; add it as a Convex environment variable when it exists.

```ts
notifications: defineTable({
  title: v.string(),
  body: v.string(),
  // Mirrors the current `roleAssignments.roleType` union (system_admin |
  // clan_elder | hod | department_admin — see convex/lib/authz.ts) rather
  // than resolving to a fixed recipient list at send time.
  audience: v.union(
    v.object({ type: v.literal("all") }),
    v.object({ type: v.literal("department"), departmentId: v.id("departments") }),
    v.object({ type: v.literal("users"), userIds: v.array(v.id("users")) }),
    v.object({
      type: v.literal("role"),
      roleType: v.union(
        v.literal("system_admin"), v.literal("clan_elder"),
        v.literal("hod"), v.literal("department_admin")
      ),
    })
  ),
  deepLink: v.object({ type: v.string(), id: v.string() }),
  createdBy: v.id("users"),
})
  .index("by_audience_type", ["audience.type"])

notificationReads: defineTable({
  userId: v.id("users"),
  notificationId: v.id("notifications"),
  readAt: v.number(),
})
  .index("by_userId_notificationId", ["userId", "notificationId"])
  .index("by_userId", ["userId"])
```

One `notifications` row per event, not per recipient — fan-out to individual devices is the
component's job once a send mutation is written (not part of this increment). `notificationReads`
follows the same "no row = unread" convention as `leadershipProgress`'s "no row = not enrolled" —
no explicit `read: false` state is ever stored. Neither table has a `createdAt`/`updatedAt` pair;
`notifications` is append-only-by-convention like `activityLogs`, and `notificationReads` rows are
themselves immutable once written (`readAt` is set once, at creation).

**Role-audience note.** `convex/schema.ts`'s `roleAssignments.roleType` union was already current at
the time of this increment — `hod`/`department_admin` (department-scoped, checked against
`departmentId` on the same row) replaced the free-floating `church_admin` before this increment
started, per `convex/lib/authz.ts`. The `role` audience variant above reuses that union as-is.

**Deliberately out of scope.** `weeklyPrograms` and `events` are currently global-only — neither
table carries a `departmentId` (see the Increment 3 section above). Department-scoped meeting
notifications ("remind the Ushering department about their Saturday setup") aren't representable
with the `department` audience variant against those tables yet. That's a separate decision pending
on whether/how program-level department scoping gets added, not something this increment resolves.

**Doc/code note.** `convex/schema.ts` and `convex/lib/authz.ts` cite "docs/Alignment.md, Increment
5" for the `hod`/`department_admin` restructure, but no `docs/Alignment.md` exists in this repo, and
this doc's own Increment 4 section (above) still shows the superseded `church_admin` roleType. Not
resolved as part of this increment — flagging per the doc/code parity rule in CLAUDE.md rather than
silently rewriting Increment 4's history.
 

---

## `events` Reminder Scheduling & weeklyPrograms Reminder Cron (Increment 7)

Wires event creation into the notification pipeline (Increment 6): an immediate "new event" push,
plus week-before/day-before reminders that are cancelled and rescheduled if the event's
`startDateTime` is edited. Adds a daily cron doing the analogous day-before/hour-before reminders
for `weeklyPrograms` occurrences — those have no per-row reminder tracking, since an occurrence is
virtual (expanded at query/cron time, not a stored row), so there's nothing to cancel/reschedule the
way an event's fixed `startDateTime` requires.

```ts
events: defineTable({
  title: v.string(),
  description: v.optional(v.string()),
  location: v.optional(v.string()),
  startDateTime: v.number(),
  endDateTime: v.number(),
  coverImageUrl: v.optional(v.string()),
  featured: v.boolean(),
  active: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  weekBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
  dayBeforeReminderJobId: v.optional(v.id("_scheduled_functions")),
})
  .index("by_startDateTime", ["startDateTime"])
  .index("by_featured", ["featured", "startDateTime"])
```

**Reminder scheduling.** `createEvent` fires `internal.notifications.dispatch` immediately
(`runAfter(0, ...)`, audience `{type: "all"}`, `deepLink: {type: "event", id: eventId}`) and
schedules week-before/day-before reminders via `runAt` — but only for a reminder whose computed time
(`startDateTime - 7d` / `startDateTime - 1d`) is still in the future; a reminder that's already past
is silently skipped, leaving its job-id field unset rather than scheduling a notification in the
past. `updateEvent` cancels both existing job ids (`ctx.scheduler.cancel`, each guarded for the
field being unset) whenever `startDateTime` is part of the patch, then re-runs the same
schedule-if-future logic against the new time — explicitly clearing (not just leaving stale) a job-id
field whose reminder is now skipped-as-past. `archiveEvent` cancels both job ids unconditionally
(same guard) so an archived event never still pushes a reminder.

**`deepLink` types.** `"event"` and `"program"` were already wired into the mobile notification
resolver (`apps/mobile/app/notifications.tsx`) ahead of any dispatch source producing them — this
increment is the first to actually populate them, targeting the existing `/event-detail?id=` and
`/program-detail?id=` routes.

**weeklyPrograms cron.** `convex/crons.ts` registers a daily cron at 06:00 UTC (09:00 Kampala — see
`KAMPALA_OFFSET_MS`, no DST to account for) calling `internal.weeklyPrograms.checkWeeklyProgramReminders`.
It walks every active `weeklyPrograms` row and reuses `weeklyProgramOccursOn`
(`convex/lib/recurrence.ts` — the same recurrence-matching helper `getCalendarRange` uses) against
tomorrow's Kampala date, rather than a naive day-of-week check, so `once`/`biweekly`/`monthly` and
`startDate`/`endDate`-bounded programs are handled correctly. A match dispatches the day-before
notification immediately (the cron's own run time already *is* the day-before moment) and schedules
the hour-before notification via `runAt` against the program's exact occurrence instant
(`occurrenceInstant`) minus one hour.

**`createdBy` for cron-triggered dispatches.** `internal.notifications.dispatch` requires a
`createdBy: v.id("users")`, but a cron run has no acting user. Rather than invent a "system user"
concept, `checkWeeklyProgramReminders` reuses `program.createdBy` (the program's own author) —
already a required field on every row.

**Known gap — no `programExceptions` mechanism exists.** `programExceptions` was explicitly deferred
in Increment 3 (a called-off single occurrence is handled today by *not* touching the recurring
`weeklyPrograms` row at all — see the Increment 3 section above) and remains undefined as of this
increment — grepped repo-wide, it appears only as prose in this doc. That means
`checkWeeklyProgramReminders` has no way to know a specific tomorrow-occurrence was called off by
some other means and will still dispatch its day-before/hour-before reminders regardless. This is a
real, live gap, not something this increment works around — flagged per the doc/code parity rule in
CLAUDE.md rather than silently building exception machinery that Increment 3 deliberately deferred.
Since a weeklyProgram occurrence is virtual (not a stored row), there's also no id to persist for
cancellation the way `events` does — an admin editing/deactivating a program between the cron run and
the occurrence does not retract an already-scheduled reminder either.

## Per-User Notification Delete (Increment 8)

Adds a "Delete" affordance (long-press on a notification row) alongside the existing "mark as read."
`notifications` is one shared row per event, not one row per recipient (Increment 6) — a real
document delete would remove the notification for every other recipient too, so "delete" is a
per-user overlay, the same shape as `notificationReads`' read tracking, not an actual delete.

```ts
notificationDismissals: defineTable({
  userId: v.id("users"),
  notificationId: v.id("notifications"),
  dismissedAt: v.number(),
})
  .index("by_userId_notificationId", ["userId", "notificationId"])
  .index("by_userId", ["userId"]),
```

**Behavior.** `dismissNotification(notificationId)` mirrors `markNotificationRead` exactly —
`requireUser`-scoped, checks `by_userId_notificationId` first, idempotent no-op if already dismissed.
`myNotificationsWithReadState` (the shared base both `getMyUnreadNotificationCount` and
`listMyNotifications` build on) now also fetches the caller's `notificationDismissals` and excludes
any dismissed notification from the result entirely — a deleted notification neither shows in the
list nor counts toward the unread badge. No row = not dismissed, same "don't store negative space"
convention as `notificationReads`.

**Mobile.** `apps/mobile/app/notifications.tsx` adds `onLongPress` to each row, presenting an
`Alert.alert` action sheet (this app's existing pattern for a native multi-choice menu — see
`components/ui/image-upload-field.tsx`) with "Mark as read" (only if unread), "Delete"
(destructive-styled), and "Cancel" — matching `INTERFACE_SPEC.md` §9's "Long-press: 'Mark as read' /
'Delete'" guidance.

## Shared Notification-Payload / Reminder-Tier Helpers

`convex/lib/reminders.ts` extracts two patterns that were previously hand-rolled independently at
every `internal.notifications.dispatch` call site (`announcements.ts`, `events.ts`,
`weeklyPrograms.ts`, `roles.ts`, `memberProfiles.ts`): `notificationCommon(...)`, the
`{audience, deepLink, createdBy, imageUrl?}` dispatch-args shape every call site built by hand, and
`scheduleReminderEntries(ctx, entries, common)`, the "compute a time, skip the tier if it's already
past, `runAt` each remaining tier concurrently, return job ids positionally" block that was
copy-pasted between `events.ts`'s week-before/day-before pair and `weeklyPrograms.ts`'s
day-before/hour-before pair. Pure extraction — no behavior change at any call site.
