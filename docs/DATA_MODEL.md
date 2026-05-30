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
> record.** Middleware enforces this on every request. After successful sign-in, the
> post-auth handler checks the user's active assignments; if there are none, the session
> is terminated and the user is redirected to a public `/unauthorized` page with a
> friendly message directing them to the mobile app.

**Consequences**
- A user whose last role is revoked while signed in is kicked out at their next request.
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
  Used by middleware on every web request, by the role-picker, and by the user-detail
  view in the admin dashboard.
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

### Next increment — System Admin Dashboard + Role Management UI (preview)

The web side of all this:

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

### Open / in-flux items (flagged, not settled)

1. ~~**Self-edit policy for `sex` and `dateOfBirth`**~~ — **Resolved.** `dateOfBirth` is
   optional at completion and freely self-editable thereafter. `sex` is admin-only.
   Members can also edit phone, profession, profilePictureUrl, firstName, lastName, and
   clanId (re-triggers approval).

2. **Last-role revocation while signed in** — middleware enforces the invariant on the
   next request. Server-pushed session invalidation is an enhancement, not MVP-required.

3. ~~**Multi-clan-elder conflict**~~ — **Resolved.** Revoke-and-replace at mutation
   time, with both events logged. The spec's "one Elder per clan" rule is enforced by
   mutations, not by a schema constraint.

4. **Children without DOB age statically** — without `dateOfBirth`, `ageBracket` is
   whatever the parent entered and never changes. Accept this; parents who want
   automatic progression provide DOB.

5. **Age-driven features depend on member-provided DOB.** With `dateOfBirth` optional,
   any feature that needs it (birthday celebration messages, automatic Youth/Adult
   reallocation, age-based eligibility checks) silently excludes members who left it
   blank. Modules that rely on age must design for this — either by treating "no DOB"
   as an exclusion, or by prompting members to add it when they need it.

6. **Eligibility rules beyond `profileCompleted`** remain deferred. Elder rules, HOD
   rules, etc. arrive with the modules that house their data sources.

7. **Super T broadcaster structure** — still flagged from Increment 1, still out of
   scope.