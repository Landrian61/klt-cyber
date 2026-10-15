# 0006. Department scoped permissions — rationale

## Context

The permission system has the right primitives (`roleAssignments`, `departmentMemberships`, the `authz.ts` helpers) but several queries and gates don't match the SRS's rules. Content read queries that mobile subscribes to (`listUpcomingEvents`, `getCurrentThemes`, `getActiveAnnouncements`, and others) run without checking for a signed in user, violating F3-08 and NF-17. The Areas of Service hub only shows departments the caller serves in, with no "Coming soon" tiles for paused departments (F3-01). Roster reads gate on Administration authority, so an HOD cannot read their own department's roster (F3-04). The `assignRole` mutation accepts an HOD appointment with no `departmentId`, creating an unscoped HOD that no department page can use (F3-09). Roster members of Media, Hospitality and Library are locked out of the portal because the gate requires at least one `roleAssignment` row (F3-19). The admin UI shows buttons a delegate cannot use, because the client doesn't check which actions are HOD only (F3-05). None of this has automated test coverage (F5-09, NF-01).

## Options considered

### Option 1: Targeted fixes in place

Tighten the existing `authz.ts` helpers and query gates without restructuring. Add `getCurrentUser` null checks to content queries, widen `listDepartmentMembersWithProfiles` to accept own department authority, add validation to `assignRoleCore`, create `hasPortalAccess` as a new helper, and add a constant set for the three roster portal departments.

**Pros**:
- Minimal code change, no schema migration, low risk
- All fixes are backward compatible
- Follows the existing patterns in `authz.ts`

**Cons**:
- The constant set `ROSTER_PORTAL_DEPARTMENTS` is name matched (department renames would break it, though the SRS says names are fixed and seeded)

### Option 2: Schema driven portal access

Add a `portalAccessMode` field (`"role_only" | "all_roster"`) to the `departments` table and a `portalAccess` boolean to `departmentMemberships`. Gate all portal access on these fields.

**Pros**:
- Self documenting; the access rule is data, not code
- Handles future departments with portal roster access without code changes

**Cons**:
- Schema migration for three fixed departments is overkill
- Adds fields that are set once at seed time and never changed
- Every query must join an extra field

### Option 3: Synthetic role rows

Auto insert a `roster_member` roleType into `roleAssignments` when someone is added to Media, Hospitality or Library. The existing portal gate (`activeRoles.length > 0`) keeps working.

**Pros**:
- Existing gate logic unchanged
- Clear in the data

**Cons**:
- Introduces a new `roleType` that doesn't represent administrative authority (the two concepts are deliberately separate in the architecture)
- `roleAssignments` is for authority grants, not membership; conflating them is a conceptual drift
- Every roster add/remove for three departments must manage the synthetic row

## Rationale

The architecture deliberately separates consumer lifecycle (`users.role`) from administrative authority (`roleAssignments`) from department membership (`departmentMemberships`). Option 3 would blur the authority/membership boundary by inserting synthetic role rows for what is actually a membership concern. Option 2 adds schema complexity for a set of three fixed names that the SRS treats as permanent. Option 1 keeps each concern in its own lane: `authz.ts` gains a small, well tested helper (`hasPortalAccess`) that checks both lanes, and the constant set (`ROSTER_PORTAL_DEPARTMENTS`) encodes the SRS rule directly. The name match risk is acceptable because the 13 department names are seeded reference data, never user editable.
