# KLT Cyber Church — Roles and Access Control

> The RBAC model, made explicit. Reference document. Lives alongside
> `docs/VISION.md` (product), `docs/ARCHITECTURE.md` (technical), and
> `docs/DATA_MODEL.md` (schema). Read this before adding a new role,
> extending an existing one, or building a permission check.

---

## 1. Purpose

This document is the source of truth for how permissions work in the KLT
Cyber Church system. It catalogs every role, what each can do, how each is
scoped, how assignment and revocation work, and how the model extends as new
modules ship.

It is a *living reference* — updated whenever a new role type is added or an
existing role's scope changes. Any contributor introducing a new role type or
modifying an existing one must update this document in the same PR.

---

## 2. Two orthogonal dimensions

Permissions in this system live along two independent axes.

**Consumer lifecycle** — held on the `users.role` field. Values: `visitor`,
`member`. Describes where the user sits in the visitor-to-member progression.
Governs *what the mobile app shows them*. See `docs/DATA_MODEL.md` for the
lifecycle diagram.

**Administrative authority** — held in the `roleAssignments` table. Zero or
more records per user. Each expresses a scoped or unscoped administrative
grant. Governs *what the web admin portal shows them*.

These two dimensions do not overlap. Consumer lifecycle is not authority.
Authority is not lifecycle. A user can be at any combination of coordinates.

Some combinations:

- **Visitor, no roles** — a new sign-up. Mobile: Home / Radio / Library.
  Web: `/unauthorized`.
- **Member, no roles** — a regular church member. Mobile: full app. Web:
  `/unauthorized`.
- **Visitor, system admin** — the seed-bootstrapped administrator who has
  never completed a member profile. Mobile: Home / Radio / Library (like any
  visitor). Web: full System Admin access.
- **Member, one role** — a church leader (e.g. Elder). Mobile: full app.
  Web: role picker → their assigned portal.
- **Member, multiple roles** — a leader with more than one responsibility.
  Mobile: full app. Web: role picker on every sign-in, one URL context per
  role.

This orthogonality is deliberate and must not be conflated in code. Never
put an authority check on `users.role`. Never gate consumer features on
`roleAssignments`.

---

## 3. Role catalog

All role types the system will eventually recognize. Each row lists the type,
its status, its scoping, its cardinality, and a one-line purpose.

**Status legend**
- **✅ Implemented** — the role type exists in code and can be assigned today.
- **🟡 MVP planned** — the role type will be implemented before MVP ships,
  alongside the module that requires it.
- **⏳ Post-MVP** — anticipated in the church spec but out of MVP scope.

| Role type | Status | Scope | Cardinality | Purpose |
|-----------|--------|-------|-------------|---------|
| `system_admin` | ✅ | Unscoped | Many | Technical steward. Assigns and revokes all other roles in MVP. |
| `clan_elder` | ✅ | `clanId` | One per clan | Manages members of one specific clan; delegates Super T representatives. |
| `church_administrator` | 🟡 | Unscoped | One | Runs the operational hub: events, weekly program, annual planner, church-wide communications. |
| `radio_admin` | 🟡 | Unscoped | One | Manages the Reign Radio broadcast schedule, banner images, and listenership. |
| `team_leader` | ⏳ | Unscoped | One | Overall leader of the church. Highest authority in the spec's hierarchy. |
| `first_lady` | ⏳ | Unscoped | One | Team Leader's spouse; recognized leadership role per spec. |
| `executive_pastor` | ⏳ | Unscoped | One | Assigns Elders, designates Pastors, appoints Chairperson of the Elders Council. |
| `resident_pastor` | ⏳ | Unscoped | One | Second-tier pastoral office; approves events alongside Executive Pastor. |
| `pastor` | ⏳ | Unscoped | Many | General pastoral designation with a Pastoral Badge on public profile. |
| `elder_council_chair` | ⏳ | Unscoped | One | Coordinating leader among the twelve Clan Elders. |
| `hod` | ⏳ | `departmentId` | One per department; one per person | Head of Department for a specific ministry or operational unit. |
| `tutor` | ⏳ | `classId` | Many | Mentorship class tutor (Luganda or English class). |
| `section_head` | ⏳ | `sectionId` | One per section | Leads a subdivision within a department. |

Post-MVP entries are documented for continuity — a future engineer building
the Mentorship module knows exactly what `tutor` will look like. Specific
details (exact powers, exact eligibility) are settled when the module lands.

---

## 4. Access matrix (MVP)

What each MVP role can access on the web admin portal. Rows are roles;
columns are the modules they can enter and the operations they can perform.

| Role | System Admin module | Church Admin module | Clans module | Radio Admin module |
|------|--------------------|--------------------|--------------|--------------------|
| `system_admin` | Full access — list/detail users, assign/revoke any role, suspend/reactivate, verify clan affiliations, activity log | Read-only (visibility for oversight) | Read-only (visibility for oversight) | Read-only (visibility for oversight) |
| `church_administrator` | No access | Full access — events, weekly program, annual planner, church-wide announcements, membership sorting views | No access | No access |
| `clan_elder` | No access | No access | Access to their assigned clan only — view members, add members, manage clan roster, Super T delegation | No access |
| `radio_admin` | No access | No access | No access | Full access — broadcast schedule, banner uploads, listenership, monitoring |

A user with multiple roles sees each portal on selecting the corresponding
role from the picker. Roles are independent — being both a system admin and
a clan elder means seeing System Admin on one selection and their clan
portal on the other, not seeing them combined.

**Mobile app.** Every role-holder still uses the mobile app as their
consumer surface, and their mobile access is governed *only* by
`users.role`. Being a `clan_elder` does not change what the mobile app
looks like. This is the orthogonality from §2 in action.

---

## 5. URL structure and route-level scoping

Each role has a URL prefix on the web portal. The chosen Area of Service from
the picker navigates to that prefix. The prefix's own server component (its
route-group layout, or the page where there is no layout) validates that the
caller holds an active `roleAssignment` matching it — see §9.

**MVP prefixes**

| Role | URL prefix | Scoping |
|------|-----------|---------|
| `system_admin` | `/system-admin/*` | None — path is fixed |
| `church_administrator` | `/church-admin/*` | None |
| `clan_elder` | `/elder/{clanId}/*` | `clanId` in path; the route's server component verifies the caller has an active `clan_elder` assignment for *that* clan |
| `radio_admin` | `/radio-admin/*` | None |

**Post-MVP prefixes (anticipated)**

- `hod`: `/hod/{departmentId}/*`
- `tutor`: `/tutor/{classId}/*`
- `section_head`: `/section-head/{sectionId}/*`
- Unscoped pastoral / leadership roles: `/pastoral/*` (a shared shell) or
  per-role prefixes — to be settled when the Pastoral Team Portal is
  designed.

The URL is the source of truth for role context. There is no "currently
selected role" cookie or session field — a user managing two clans as an
elder navigates between them by changing the URL, not by flipping a
setting. This makes state debuggable, deep-linkable, and shareable.

---

## 6. Assignment and revocation

### 6.1 Who can assign what

**In MVP, only `system_admin` assigns and revokes roles.** This is a
deliberate simplification.

The church spec describes a delegation model where the Church Administrator
appoints HODs, the Executive Pastor appoints Elders, HODs appoint tutors
and section heads, and so on. This delegation is not implemented for MVP,
for two reasons:

1. Delegating role authority requires the delegate's role itself to exist.
   Since most of the delegating roles (Executive Pastor, HODs) are post-MVP,
   there is no one to delegate *to* yet.
2. Consolidating all role assignment under system admin lets us ship the
   RBAC model with one enforcement path, not many.

When post-MVP roles land with their respective modules, delegation will be
added at that point. Each module ships with its assignment-authority
extensions documented here.

### 6.2 Eligibility for assignment (MVP)

The `assignRole` mutation enforces one check today:

- The target user must have `profileCompleted: true`.

That's it. All other eligibility considerations — Elder requires
male + married + age 35+ + mentorship complete; HOD requires mentorship
complete + verified; Event Lead requires 5+ years as a member — are
described in the church spec but **not enforced by the system** in MVP.
The system admin exercises judgment.

The full eligibility rules will be enforced automatically once the modules
that hold their data sources (Mentorship, Church Admin) are built. Each new
module extends the eligibility check for its associated role.

### 6.3 Cardinality enforcement

Convex has no unique indexes, so cardinality (one Elder per clan, one Church
Administrator, etc.) is enforced at the mutation level, not the schema
level. The pattern used:

- **"One per scope" roles** (`clan_elder`, future `hod` per department):
  when a new assignment is created and an active one already exists for the
  same scope, the existing one is **revoked-and-replaced** in the same
  transaction. Both events are logged in `activityLogs` (`role.revoked`
  and `role.assigned`).
- **"One per person" constraints** (future: a person can hold at most one
  active `hod` assignment across all departments): the mutation checks the
  caller's own existing assignments and rejects the new one if it would
  violate the limit.
- **"One system-wide" roles** (`church_administrator`, `radio_admin`,
  future `team_leader`, etc.): same revoke-and-replace pattern, scoped
  system-wide instead of to a clan.

### 6.4 Revocation

Any active `roleAssignments` row can be revoked by a user with the
`system_admin` role. Revocation:

- Patches `status: "revoked"`, sets `revokedBy` and `revokedAt`.
- Writes an `activityLogs` entry with `action: "role.revoked"`.
- Takes effect on the target's *next Convex call* for data: every gated query
  and mutation re-checks authority, so access to information stops at once.
  The portal shell persists until they cross route segments, hard-navigate, or
  refresh — that is when a layout re-runs and redirects them to
  `/unauthorized`. See `docs/ARCHITECTURE.md` §5.2.

Revocation does not delete the record — it flips its status. This preserves
the assignment history for audit and future reporting.

---

## 7. Multi-role interaction

Any user may hold multiple simultaneous active `roleAssignments`. The web
portal handles this via:

**Role picker on every sign-in.** After successful authentication, users
land on `/select-role`, which lists their active assignments with a human-
readable label (e.g. "System Administrator", "Elder of Clan Reuben").
Clicking one navigates to that role's URL prefix.

**No default role.** Users choose the role every time. Consistency over
efficiency — an in-header role switcher may add "remember my last choice"
later, but the picker itself is not skipped.

**Switching mid-session.** A "Switch role" affordance in the admin portal's
top bar returns the user to `/select-role`.

**Role reflection is real-time.** If an admin assigns a new role to a
signed-in user, that user's next sign-in (or next visit to `/select-role`)
shows it. Convex's reactive queries mean the assignment appears without
manual refresh in most cases.

---

## 8. Extending the model

When a new role type is added — usually as part of shipping a new module —
follow this checklist:

1. **Update `packages/shared/src/enums/roles.ts`.** Add the new value to
   `ROLE_TYPES`.
2. **Update `convex/schema.ts`.** Add the new value to the `roleType` union
   in `roleAssignments`. If the role is scoped to a new entity, add the
   scope field (e.g. `departmentId: v.optional(v.id("departments"))`).
3. **Update `packages/shared/src/schemas/roles.ts`.** Extend the discriminated
   union in `roleAssignmentInputSchema` with the new variant.
4. **Update `convex/roles.ts`.** Extend the `assignRole` mutation with:
   - Any new eligibility checks the role requires
   - Any new cardinality enforcement (revoke-and-replace or reject-on-conflict)
5. **Update this document.** Add a row to the catalog in §3, an entry to
   the access matrix in §4, and a URL prefix in §5.
6. **Update `docs/DATA_MODEL.md`.** Move the role from "anticipated" to
   "supported" in the `roleType` values list.

None of these steps is optional. A new role that's added in code but not
documented here is a role that no reviewer can check for correctness.

---

## 9. Enforcement layers

Permissions are enforced at three layers. Understanding this helps when
debugging why something is or isn't accessible.

**Layer 1 — Middleware (per request).** Checks only that a session cookie is
present, with no network call. No cookie → `/sign-in`. It does **not** read
roles; the cookie is not signature-verified here. This is a routing
convenience, not a gate.

**Layer 2 — Server components (per route).** The top-level invariant —
authenticated + ≥ 1 active role assignment — is enforced by the server
component for each route, alongside the module-specific role check:

| Route | Enforced in |
|---|---|
| `/admin/*` | `app/(admin)/admin/layout.tsx` |
| `/system-admin/*` | `app/(admin)/system-admin/layout.tsx` |
| `/areas-of-service` | the page itself |
| `/departments/{id}` | `getDepartmentAccess` (Convex) |

Users failing the invariant land on `/unauthorized`; users holding a role but
not the one a module requires are redirected to `/areas-of-service`. Each of
these already fetches the caller's `activeRoles` for its own rendering, so the
check costs nothing extra.

A new route under `app/(admin)/` does **not** inherit this. Enforce the
invariant in its own server component.

**Layer 3 — Convex functions (per operation).** Every mutation and
sensitive query verifies the caller's identity and role via
`ctx.auth.getUserIdentity()` plus a role lookup helper
(`assertSystemAdmin(ctx)`, `assertClanElder(ctx, clanId)`, etc.). This is
the ultimate guard — even if a client-side check is bypassed, the server
rejects unauthorized operations.

Never rely on any single layer. Each is a check, not a substitute for the
others — and only Layer 3 is a security boundary. Layers 1 and 2 decide what
to render and where to send someone; a client that calls Convex directly
never passes through either, so any query or mutation returning non-public
data must gate itself.

---

## 10. Open items

Recorded honestly.

1. **Delegation model.** Post-MVP, non-system-admins will be able to
   assign scoped roles (Church Admin → HOD; Executive Pastor → Elder; HOD →
   Tutor). The specific delegation graph is documented in the church spec
   but not implemented. It arrives per-module.

2. **Per-role eligibility automation.** Currently only `profileCompleted`
   is enforced. Elder eligibility, HOD eligibility, and Event Lead
   eligibility are stated in the church spec but arrive with the modules
   that own their data sources (Mentorship, Church Admin).

3. **Role revocation cascade.** When a user's mentorship completion is
   later invalidated (a hypothetical edge case), should their downstream
   role assignments (Elder, HOD) be automatically revoked? Currently the
   answer is no — revocation is manual. Worth revisiting if the situation
   arises.

4. **Pastoral role scoping.** Team Leader, First Lady, Executive Pastor,
   Resident Pastor — precise powers, exact assignment authority, and URL
   layout deferred pending the Pastoral Team Portal design discussion.

5. **Cross-role visibility.** In MVP, `system_admin` has read-only
   visibility into other modules (per the access matrix). Do
   `church_administrator` or `radio_admin` need read visibility into each
   other's modules? Assumed no; confirm as needs surface.

---

## 11. Related documents

- `docs/VISION.md` — MVP scope, guiding principles
- `docs/ARCHITECTURE.md` — technical shape, enforcement locations
- `docs/DATA_MODEL.md` — `roleAssignments` schema and evolution
- `docs/CONTRIBUTING.md` — how to add a role type in a PR