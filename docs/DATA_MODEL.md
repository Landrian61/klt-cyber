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
| `email` | `string` | yes | from the auth identity |
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
- `by_role` on `["role"]` — sorting (e.g. find all system admins)

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