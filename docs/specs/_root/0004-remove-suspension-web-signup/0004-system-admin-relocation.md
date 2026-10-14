# 0004. Move System Admin pages into Administration

## Summary

The separate `/system-admin` portal area is folded into Administration, per SRS F3-02 and F3-03: there is no separate System Admin portal, Administration shows a System Admin extra pages instead. This moves Accounts (the user directory and detail, including roles) and Audit log (the activity feed), unchanged, into Administration, behind a narrower guard than Administration's own broader access. Content (Themes) stays exactly where it is for now, since its real destination is Pastoral, a later feature not yet designed, and platform analytics and the cost register are a different, later scope feature entirely, not part of this move.

## Requirements

**User stories**:
- As a System Admin, I open Accounts and Audit log from inside the Administration portal, under a System Admin section, instead of a separate `/system-admin` area.
- As an Administration HOD or delegate who is not a System Admin, I do not see Accounts, Audit log, or any System Admin only navigation, and Administration's dashboard does not break for me.

**Acceptance criteria**:
- **AC-1**: `/admin/accounts` (list and detail, including the roles card and the assign role sheet) and `/admin/activity` exist inside Administration, built from the moved `system-admin/users` and `system-admin/activity` code, not rebuilt from scratch.
- **AC-2**: A dedicated System Admin nav group in `AdminSidebar.tsx`, holding Accounts, Audit log, and Content (Themes), is visible only when the signed in user holds the `system_admin` role. An Administration HOD or delegate who is not a System Admin never sees it, and a direct visit to `/admin/accounts` or `/admin/activity` redirects them to `/admin`.
- **AC-3**: The members without roles attention card moves into Administration's existing dashboard, visible only to System Admins, computed from `stats.totalMembers - stats.totalMembersWithRoles` and linking to `/admin/accounts`. Pending verifications already has a card there (`/admin/verification`); it is not duplicated.
- **AC-4**: Administration's dashboard never throws for a non System Admin: `getDashboardStats` and `listRecentActivity`, both of which reject a non System Admin caller, are only called when the caller is a System Admin (this also fixes an existing bug where the activity feed card already calls one of them unconditionally).
- **AC-5**: `/system-admin`, `/system-admin/users`, `/system-admin/users/[userId]`, and `/system-admin/activity` all redirect to their new Administration locations.
- **AC-6**: `/system-admin/content` (Themes) keeps working exactly as it does today, untouched by this feature, and is not moved into Administration; it stays reachable from the System Admin nav group (AC-2) even though the old root dashboard no longer links to it.
- **AC-7**: `AreasOfServiceClient.tsx`'s System Admin button, and any other link to the old `/system-admin` root, still work, either through the AC-5 redirect or by pointing directly at the new Administration location.

## Feature design

**Data model sketch**: none.

**API surface**: no new Convex function. The existing `api.admin.listUsers`, `getUserDetail`, `listRecentActivity`, and `getDashboardStats` are reused unchanged, called from their new page locations, and only when the caller is a System Admin (AC-4).

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| Rendering the System Admin nav group | Whether to show it | `admin/layout.tsx`'s existing `getMyAccount` result, narrowed to `activeRoles.some(r => r.roleType === "system_admin")`, computed in the layout and passed down as an `isSystemAdmin` prop to `AdminSidebar`, which currently takes no props and renders a static list |
| Guarding `/admin/accounts` and `/admin/activity` | Whether to render the page or redirect | A server `layout.tsx` on a new `admin/(system)/` route group, repeating `system-admin/layout.tsx`'s own `system_admin` check (including its offline `ErrorState` handling), redirecting to `/admin` when the check fails |
| The members without roles count | The number shown | `stats.totalMembers - stats.totalMembersWithRoles`, from the same `getDashboardStats` result already fetched for the existing stat tiles, gated by AC-4 |
| Each `/system-admin/*` redirect | Target URL | A static per route mapping in `apps/admin/next.config`'s `redirects()`: `/system-admin` and `/system-admin/users` and `/system-admin/activity` as exact matches, `/system-admin/users/:userId` with a path param |

**Key invariants**: Accounts, Roles, and Audit log stay restricted to `system_admin` exactly as they are today; moving their URLs into Administration's space never widens who can see them, and never breaks the dashboard for anyone who lacks that role. Content/Themes stays under `/system-admin` and is explicitly out of scope here.

**Security model**: the move must not accidentally inherit Administration's broader gate (`hasAdministrationAccess`, which also admits Administration HODs and delegates who are not System Admins). The new `admin/(system)/` route group's layout repeats today's `system-admin/layout.tsx` check rather than relying on `admin/layout.tsx`'s broader gate alone. This is enforced server side (the Convex functions these pages call already require `system_admin` via `requireSystemAdmin`, which throws rather than returning null for a non admin caller, which is exactly why AC-4 exists), the page level check is an added UX layer, not the only layer, consistent with `convex/AGENTS.md`'s layered authorization convention.

**Critical test scenarios**:
- Happy path: a System Admin opens `/admin`, sees the System Admin nav group, opens Accounts, sees the same account list as before, verifies **AC-1**, **AC-2**.
- Permission: an Administration HOD who is not a System Admin opens `/admin`, does not see the System Admin group, the dashboard loads without error (no members without roles card, no crash from the activity feed), and a direct visit to `/admin/accounts` redirects to `/admin`, verifies **AC-2**, **AC-4**.
- Old link: visiting `/system-admin/users/<id>` redirects to `/admin/accounts/<id>`, verifies **AC-5**.
- Untouched: `/system-admin/content` still renders and still lets a System Admin edit themes, reached from the System Admin nav group's Content entry, verifies **AC-6**.

## Build plan

1. Move `system-admin/users/**` to `admin/(system)/accounts/**` (`UsersClient.tsx`, `UserDetailClient.tsx`, `RolesCard.tsx`, `AssignRoleSheet.tsx`, `shared.tsx`), updating every internal link from `/system-admin/users` to `/admin/accounts`, satisfies **AC-1**
2. Move `system-admin/activity/**` to `admin/(system)/activity/**`, updating its internal links, satisfies **AC-1**
3. Add a server `layout.tsx` on the new `admin/(system)/` route group, repeating `system-admin/layout.tsx`'s `system_admin` check and its offline `ErrorState` handling, redirecting to `/admin` on failure, satisfies **AC-2**
4. Compute `isSystemAdmin` in `admin/layout.tsx` and pass it to `AdminSidebar`; add the System Admin nav group (Accounts, Audit log, Content linking to `/system-admin/content`), rendered only when `isSystemAdmin` is true; add "Accounts" and "Audit log" to `AdminTopBar.tsx`'s `MODULE_TITLES` map, satisfies **AC-2**, **AC-6**
5. In `admin/DashboardClient.tsx`, call `getDashboardStats` and `listRecentActivity` with `"skip"` when the caller is not a System Admin (fixing the existing unconditional call), and add the members without roles card, System Admin only, computed as described above and linking to `/admin/accounts`, satisfies **AC-3**, **AC-4**
6. Add the redirects to `apps/admin/next.config`'s `redirects()` (`/system-admin`, `/system-admin/users`, `/system-admin/users/:userId`, `/system-admin/activity`), and update `AreasOfServiceClient.tsx`'s System Admin button target, satisfies **AC-5**, **AC-7**
7. Trim `system-admin/layout.tsx`, `SystemAdminSidebar.tsx` (retarget its logo and back link to `/admin`), and `SystemAdminTopBar.tsx` down to serve only `/system-admin/content`, satisfies **AC-6**

## Rationale (inline)

Accounts, Roles, and Audit log move now because they are ready: their destination (Administration) exists today and their access rule does not change, only their URL does. Content/Themes stays behind because its real destination (Pastoral) does not exist yet; moving it into Administration as a stopgap would mean moving it twice, and this spec keeps it reachable from the new nav group rather than stranding it. The dashboard fold (AC-3, AC-4) was revised after this spec's cross check found that `getDashboardStats`/`listRecentActivity` throw, not return null, for a non System Admin, and that Administration's dashboard already calls one of them unconditionally today; gating both calls on `isSystemAdmin` fixes that pre existing bug as a side effect of this move. See the umbrella's [rationale.md](rationale.md) for the full reasoning, including why platform analytics and the cost register (named in SRS F3-03's prose) are a different, later feature, not part of this move.
