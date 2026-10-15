# 0006. Department scoped permissions, portal access rules, permission tests

**Date**: 2026-10-15
**Status**: In Progress

## Summary

This spec closes the gaps between the permission rules the SRS defines and what the backend and portal actually enforce today. It adds sign in gating on every content query, widens the portal access gate so Media, Hospitality and Library roster members can enter without holding a role, scopes roster reads to the caller's own department, prevents unscoped HOD appointments, and covers all of this with automated backend permission tests. No new tables are needed; the changes are validation tightening, query gate widening, and a new `hasPortalAccess` helper.

## Requirements

**User stories**:
- As any user, I can only read church content when I am signed in, so unauthenticated access to member data is not possible.
- As an HOD, I see my own department's roster with full profiles, so I can manage my people without needing Administration access.
- As a delegate, I only see buttons I can actually use, so the interface does not mislead me.
- As a roster member of Media, Hospitality or Library, I can sign in to the portal and open my department, so I can do department specific work.
- As a portal user, I see every department on the hub including paused ones marked "Coming soon", so I know the full church structure.
- As anyone appointing an HOD, the appointment always names a department, so there are no orphaned roles.

**Acceptance criteria**:
- **AC-1**: Every ungated content read query (`listUpcomingEvents`, `listFeaturedEvents`, `getCurrentThemes`, `listActiveAnnouncements`, `listActivePrograms`, `listActiveFacilities`) returns `null` when the caller is not signed in, instead of returning data. (Devotional and past event public reads, `getToday`, `listRecent`, `listPastEventsPublic`, already gate on `getCurrentUser`; `listDevotionals` already gates on Media authority. These are not in scope.)
- **AC-2**: `listDepartmentMembersWithProfiles` and `listDepartmentMembers` accept a `departmentId` and return data when the caller is System Admin (any department), Administration authority (any department), or the given department's own HOD or delegate. They reject callers without any of these.
- **AC-3**: The admin UI conditionally renders HOD only actions (confirm/decline claims, set positions, remove roster members, appoint/remove delegates, edit department description, send HOD to HOD notices) based on the caller's role for that department. Delegates see only delegate allowed actions (view roster, add members, create/edit/cancel activities, send/view messages, delete own messages).
- **AC-4**: A Convex helper `hasPortalAccess` returns true when the caller holds at least one active `roleAssignment` OR is on the active roster of Media, Hospitality or Library & Information with a verified member profile (`profileStatus === "verified"`). The Areas of Service hub page uses it instead of `activeRoles.length > 0`.
- **AC-5**: The Areas of Service hub shows all 13 departments: active departments the caller can enter as linked tiles, and the six paused departments (Education, Worship Ministry, Ushering, Missions & Outreach, Children's Ministry, Eagles Youth) as greyed out "Coming soon" tiles for all portal users.
- **AC-6**: `assignRoleCore` rejects `roleType: "hod"` when `departmentId` is not provided, with a clear error message. A scan of existing data confirms no unscoped HOD rows exist (or reports them if found).
- **AC-7**: `getDepartmentAccess` allows a caller who is on the roster of Media, Hospitality or Library for that specific department, even if they hold no `roleAssignment`, provided they pass the `hasPortalAccess` check.
- **AC-8**: Backend permission tests cover at least these scenarios with both positive (authorized caller succeeds) and negative (unauthorized caller is rejected) cases: content query sign in gating, department roster scoped read, HOD only vs delegate actions, roster member portal access for the three departments, unscoped HOD rejection, and System Admin override.

## Decision

**Chosen option**: Option 1: Targeted fixes in place.

Tighten the existing helpers and gates. The three departments with roster portal access are a fixed, SRS defined set that does not change without a product decision; a constant is the right representation. Keeping `roleAssignments` for authority only and `departmentMemberships` for membership only preserves the architecture's two orthogonal permission dimensions.

## Feature design

**Data model sketch**:

No new tables or fields. The existing schema (`roleAssignments`, `departmentMemberships`, `departments`, `users`) is sufficient. Two new constants are added to `convex/lib/authz.ts`:

| Constant | Type | Value |
|---|---|---|
| `ROSTER_PORTAL_DEPARTMENTS` | `readonly string[]` | `["Media", "Hospitality", "Library & Information"]` |
| `PAUSED_DEPARTMENTS` | `readonly string[]` | `["Education", "Worship Ministry", "Ushering", "Missions & Outreach", "Children's Ministry", "Eagles Youth"]` |

**API surface**:

| Function | Type | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `hasPortalAccess` | helper (not a registered function) | `ctx`, `userId` | `boolean` | internal | n/a |
| `listDepartmentMembersWithProfiles` (widened) | query | `departmentId` (required, was optional) | `{ department, members }` or `null` | System Admin, Administration authority, OR own dept HOD/delegate | Throws for unauthorized |
| `listUpcomingEvents` (gated) | query | `limit?` | events array or `null` | Signed in user | Returns `null` when unauthenticated |
| `getCurrentThemes` (gated) | query | none | `{ annual, monthly }` or `null` | Signed in user | Returns `null` when unauthenticated |
| (all other content reads, see AC-1) | query | varies | varies or `null` | Signed in user | Returns `null` when unauthenticated |
| `assignRoleCore` (tightened) | internal | `roleType`, `userId`, `departmentId?` | roleAssignmentId | Per roleType (unchanged) | New: throws when hod without departmentId |
| `listMyDepartmentsForHub` (new query) | query | none | `{ active: DeptTile[], paused: DeptTile[] }` or `null` | Signed in user with portal access | Returns `null` when unauthenticated |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `hasPortalAccess` | Whether the user can enter the portal | `roleAssignments` (any active row) OR `departmentMemberships` (active row where dept name is in `ROSTER_PORTAL_DEPARTMENTS` AND the user's `memberProfiles.profileStatus === "verified"`). The verified profile check prevents unverified visitors who self inserted roster memberships during `submitProfile` from gaining portal access. |
| `listDepartmentMembersWithProfiles` | Whether the caller can see this department's roster | Caller's own `roleAssignments` for `system_admin`, `hod`, or `department_admin` scoped to the given `departmentId`, or Administration authority via `assertAdministrationAuthority` |
| Content queries (AC-1) | Whether data is returned | `getCurrentUser(ctx)` returning non null |
| `assignRoleCore` validation | Whether hod has a department | `args.departmentId` presence check when `args.roleType === "hod"` |
| Hub paused departments | Which departments show "Coming soon" | `PAUSED_DEPARTMENTS` constant matched against `departments.name` |
| Hub active departments | Which departments the caller can enter | `listMyDepartments` result (roster + role grants + System Admin override) |
| Delegate UI trimming | Which buttons to show | Caller's `roleType` for this department (`hod` vs `department_admin` vs `member`) from the `listMyDepartments` roles array |

**Key invariants**:
- Content is never served to an unauthenticated caller (F3-08, NF-17).
- A roster member of Media, Hospitality or Library can enter the portal and their department, but never gains HOD or delegate powers unless explicitly appointed (F3-19).
- An HOD appointment always names a department; no unscoped HOD can exist (F3-09).
- An HOD sees only their own department's roster, not other departments' (F3-04), unless they also hold Administration authority.
- The portal gate (`hasPortalAccess`) is the single source of truth for "can this person use the portal at all."

**Security model**:

The existing three layer enforcement (middleware, route layouts, Convex functions) is unchanged. This spec tightens layers 2 and 3:

| Gate | Today | After |
|---|---|---|
| Content read queries | No auth check | `getCurrentUser` null check, return `null` |
| `listDepartmentMembersWithProfiles` | Administration authority only | Administration authority OR own dept HOD/delegate |
| Portal access (hub page) | `activeRoles.length > 0` | `hasPortalAccess` (roles OR roster for 3 depts) |
| `getDepartmentAccess` | Roles + roster, but requires >=1 roleAssignment | Roles + roster, uses `hasPortalAccess` |
| `assignRoleCore` for hod | Accepts without departmentId | Rejects without departmentId |
| Admin UI buttons | All shown | Conditionally rendered by caller's department role |

No new secrets or credentials are needed.

**Critical test scenarios** (each maps to an acceptance criterion):

- Unauthenticated content read: call `listUpcomingEvents` with no auth, expect `null`, verifies **AC-1**
- Authenticated content read: call `listUpcomingEvents` with a signed in user, expect event data, verifies **AC-1**
- HOD reads own roster: call `listDepartmentMembersWithProfiles` as the department's HOD, expect roster data, verifies **AC-2**
- HOD reads other roster: call `listDepartmentMembersWithProfiles` for a different department, expect rejection, verifies **AC-2**
- Administration authority reads any roster: call `listDepartmentMembersWithProfiles` as Administration HOD for any department, expect data, verifies **AC-2**
- Media roster member portal access: `hasPortalAccess` returns true for a user on the Media roster with no roleAssignment, verifies **AC-4**
- Unverified visitor with roster membership rejected: `hasPortalAccess` returns false for a visitor who self inserted a Media roster membership via `submitProfile` but whose profile is not yet verified, verifies **AC-4**
- Non roster, non role user rejected: `hasPortalAccess` returns false for a user with no roles and not on any roster portal department, verifies **AC-4**
- Unscoped HOD rejected: call `assignRoleCore` with `roleType: "hod"` and no `departmentId`, expect error, verifies **AC-6**
- Scoped HOD accepted: call `assignRoleCore` with `roleType: "hod"` and a valid `departmentId`, expect success, verifies **AC-6**
- Roster member can access their department: `getDepartmentAccess` succeeds for a Hospitality roster member with no role, verifies **AC-7**
- System Admin sees all departments: `listMyDepartmentsForHub` returns all 13 departments (7 active tiles and 6 paused "Coming soon" tiles) for System Admin, verifies **AC-5**

## Build plan

Ordered as Tracer Bullet: each task is a thin end to end thread (backend change, then the query/UI that uses it) so each can be verified independently.

1. Gate all ungated content read queries with `getCurrentUser` null check, returning `null` when unauthenticated. Affects: `listUpcomingEvents`, `listFeaturedEvents` in `convex/events.ts`, `getCurrentThemes` in `convex/themes.ts`, `listActiveAnnouncements` in `convex/announcements.ts`, `listActivePrograms` in `convex/weeklyPrograms.ts`, `listActiveFacilities` in `convex/facilities.ts`. (Devotional and past event public reads already gate on `getCurrentUser`; `listDevotionals` already gates on Media authority. No changes needed there.), satisfies **AC-1**
2. Add `ROSTER_PORTAL_DEPARTMENTS` and `PAUSED_DEPARTMENTS` constants to `convex/lib/authz.ts`. Add `hasPortalAccess` helper that checks `roleAssignments` (any active) OR `departmentMemberships` (active, where the department name is in `ROSTER_PORTAL_DEPARTMENTS`), satisfies **AC-4**
3. Widen `listDepartmentMembersWithProfiles` to accept `departmentId` as required and check: System Admin, Administration authority, OR `hasActiveDepartmentRole` for that department with `["hod", "department_admin"]`. Apply the same widening to `listDepartmentMembers`, satisfies **AC-2**
4. Update `getDepartmentAccess` to use `hasPortalAccess` instead of requiring `activeRoles.length > 0`, so roster members of the three departments can access their department page, satisfies **AC-7**
5. Update the Areas of Service hub page to use `hasPortalAccess` for the portal gate (replacing `activeRoles.length === 0` redirect). Add `listMyDepartmentsForHub` query that returns active departments the caller can enter plus all paused departments. Render paused departments as greyed out "Coming soon" tiles, satisfies **AC-4**, **AC-5**
6. Add validation in `assignRoleCore`: when `roleType === "hod"`, require `departmentId` to be present, throwing a clear error otherwise. Scan existing `roleAssignments` for any active hod rows with no `departmentId` and report, satisfies **AC-6**
7. Add role awareness to the department UI: the `listMyDepartments` response already includes the caller's roles per department. Wire the admin UI to conditionally render HOD only actions based on the caller's role for that department (from the SRS section 4.7.2 table), satisfies **AC-3**
8. Write backend permission tests using Convex test helpers covering the scenarios in Critical test scenarios: content sign in gating (positive and negative), department roster scoped reads, HOD only vs delegate actions, roster member portal access for three departments, unscoped HOD rejection, and System Admin override. Note: no `convex-test` setup exists in the repo today; this task includes bootstrapping the test harness (install `convex-test`, configure auth mocking for the `authComponent`), satisfies **AC-8**

## Consequences

**Positive**:
- All content queries respect the sign in requirement (F3-08), closing the most common permission gap.
- HODs can manage their own rosters without Administration access, unblocking the shared department shell (feature 17).
- The portal opens to ~30+ more users (Media, Hospitality, Library roster members) who were locked out.
- Automated tests create a regression safety net for the permission model.

**Negative / tradeoffs**:
- Mobile UI subscriptions to content queries will receive `null` during sign out teardown. `/develop` must handle this gracefully (show a sign in prompt or empty state). This is the same reactive null pattern already used by admin gated queries.
- `ROSTER_PORTAL_DEPARTMENTS` is name matched. If a department name were ever changed (the SRS says they are fixed seeded data), this constant would need updating.

**Neutral**:
- The "Coming soon" tiles for paused departments are purely informational; tapping them does nothing. This aligns with the SRS but may prompt user questions.
- `listDepartmentMembersWithProfiles` changes from optional to required `departmentId`. Existing callers in the admin portal already pass it, so no breakage.

## Follow-up

- [ ] Feature 17 (shared department shell) depends on AC-2 (own department roster reads) and AC-7 (roster member portal access). Coordinate the build order.
- [ ] Once the shared department shell builds real department pages, the "Coming soon" skeleton at `/areas-of-service/[slug]` will need to conditionally render based on whether the department is paused or active.
- [ ] Verify that the mobile app handles `null` returns from content queries gracefully after AC-1 lands. If any screen crashes, it's a bug in the mobile error handling, not in this feature.
