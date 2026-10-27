# 0012a. Shell architecture, navigation and department identity

Child of [0012 Shared department shell](index.md). Covers S1-01 to S1-04, S6-01, S6-02 and acceptance criteria **AC-1** to **AC-9**.

## Summary

This is the portal shell itself: how a URL slug becomes a department, how the five pages are shared rather than copied, how navigation knows what the caller may do, and how a department shows its fixed icon and its description. It also covers the Settings page and the one write this child owns, the HOD editing the department description. The shell replaces today's "Coming soon" skeleton at `areas-of-service/[slug]/page.tsx`.

> Before building the chrome, see the umbrella's first Follow up item: root `AGENTS.md` names `klt-cyber-web-ui` as mandatory for web work and says it carries the portal shell pattern, but the skill is not installed. That is a build start blocker for this child specifically, since this is the portal shell.

## Design

**Route shape**

```
apps/admin/app/(admin)/areas-of-service/
  [slug]/
    layout.tsx          department resolution + shell chrome + access gate
    page.tsx            redirects to dashboard
    dashboard/page.tsx  mounts <DepartmentDashboard departmentId=... />
    roster/page.tsx     mounts <DepartmentRoster ... />
    activities/page.tsx mounts <DepartmentActivities ... />
    messages/page.tsx   mounts <DepartmentMessages ... />
    settings/page.tsx   mounts <DepartmentSettings ... />
  media/                bespoke portal; imports the same four components
apps/admin/components/department/   the shared page components live here
convex/departmentShell.ts           getShellContext, getDashboard,
                                    listDepartmentFeed,
                                    getRosterMemberProfile,
                                    updateDepartmentDescription
```

`[slug]/page.tsx` redirecting to `dashboard` is what makes S1-01 land on the Dashboard. "Active" means a department whose name is not in `PAUSED_DEPARTMENTS`; a paused department keeps the existing "Coming soon" treatment and never enters the shell.

The shared components take their department as a prop rather than reading the route, which is what lets Media mount them inside its own layout.

**Slug resolution**

`getShellContext({ slug })` reads the thirteen departments through the `by_order` index and matches on `slugifyDepartmentName` from `packages/shared`. The admin app's existing `lib/slugify.ts` is replaced by that shared function so client and server can never disagree about which department a slug names. Resolution happens on the server; the client never supplies a department id as the authority for which department is being acted on.

A unit test asserts `slugifyDepartmentName` produces **exactly the same output as today's `apps/admin/lib/slugify.ts` for all thirteen seeded names**, because the hub already links using the old function and a different result would break every existing link. A second test asserts the thirteen slugs are unique, so a future rename cannot introduce a silent collision (two departments resolving to one slug would make one unreachable).

Thirteen rows read per page load is deliberate and cheap. Storing a slug column on `departments` would add a field that must stay in sync with the name for no measurable gain at this size.

**The capability object**

`getShellContext` returns the caller's role for this department and a `can` object derived from the SRS 4.7.2 matrix:

```ts
can: {
  viewRoster, viewPendingClaimants, viewFullProfiles, addMember,   // HOD + delegate
  createActivity, editActivity, cancelActivity,
  sendMessage, viewMessages, deleteOwnMessage,
  deleteAnyMessage,                                                 // HOD only
  confirmClaim, declineClaim, setPosition,
  removeMember, manageDelegates,
  editDescription, sendHodNotice,
}
```

This object is computed in one place and is the only thing the interface branches on. Its server side counterpart is an assertion helper in `convex/lib/authz.ts` (alongside the existing `requireDepartmentHod` and `requireDepartmentAuthority`) that every shell mutation calls. The matrix is therefore written twice at most, once for rendering and once for enforcement, both from the same table.

**Who may enter the shell**

Role resolution reuses what spec 0006 built: `isActiveSystemAdmin` and `hasActiveDepartmentRole` for `hod` and `department_admin`.

A **plain roster member gets no shell pages**, and `getShellContext` returns `null` for them. SRS 4.9.2 gives a Media roster member "No" on roster, claims, positions and delegates and "receive only" on activities and messages. Spec 0006's `hasPortalAccess` admits such a member to the portal so they can reach their department's own bespoke pages (Media's Radio, Devotionals, Past events); it does not admit them to the shell. The shell redirects them to the hub.

`getShellContext` returns `null` rather than throwing for a caller without access, because it backs a live subscription: a user who loses their role while the page is mounted must see the layout resolve to a redirect, not throw inside a mounted `useQuery` and take the tree down. Mutations still throw for an unauthorised caller, which is a real violation rather than reactive teardown.

**Department identity**

`DEPARTMENT_ICON_KEYS` in `packages/shared` maps every department name to a short icon key string, plus a fallback for a department added later with no entry:

| Department | Key | Department | Key |
|---|---|---|---|
| Administration | `shield` | Hospitality | `coffee` |
| Pastoral | `heart-handshake` | Children's Ministry | `baby` |
| Finance | `wallet` | Eagles Youth | `flame` |
| Education | `graduation-cap` | Real Estate | `building` |
| Media | `radio` | Library & Information | `library` |
| Worship Ministry | `music` | (fallback) | `users` |
| Ushering | `hand` | | |
| Missions & Outreach | `globe` | | |

It exports a string and not a component, because `packages/shared` is imported by Convex and by both apps and must stay free of React and of any icon library. The admin app maps key to a lucide component; mobile can map the same key to its own icon set later. Keying by name follows the existing `PAUSED_DEPARTMENTS` and `ROSTER_PORTAL_DEPARTMENTS` constants, which already key the fixed seeded names.

`departments.description` becomes HOD editable. The field already exists and is already shown on the hub card, so this is a permission and interface change plus retiring the "fixed and seeded, not admin editable" comment. The seed keeps supplying the initial text, so a department nobody edits looks exactly as it does today.

**The description editor**

`updateDepartmentDescription({ departmentId, description })`, HOD or System Admin only. Rules, each stated so the build does not invent them:

- plain text, trimmed, capped at `DEPARTMENT_DESCRIPTION_MAX_LENGTH` (280 characters), with a character counter in the form
- newlines are collapsed to single spaces, since the hub card renders one or two lines and a pasted paragraph would break its layout
- an empty or whitespace only value **clears** the description (the field is optional on the row), and the hub card then renders without a description line
- an unchanged save returns `{ ok: true, changed: false }` and writes **no** audit entry, mirroring the existing no op rule in `updateDepartmentMembership`
- a real change writes `department.description_updated` carrying `departmentId`

**Settings page**

Two sections. The description editor renders only when `can.editDescription`. Below it, the caller's own profile and account controls, reusing the existing portal account components that `areas-of-service/admin/settings/SettingsClient.tsx` already uses rather than a new department scoped editor; a person's account is not department scoped, so the page surfaces the one place it lives instead of copying it.

**Phone layout rule**

Every shared page component renders tabular data as a real table at `md` and above and as stacked cards below it, with no sideways scrolling at 375 pixels. This is a property of the shared components, so satisfying it once satisfies it for every department and every bespoke portal that mounts them. The pass runs at the end of the umbrella build plan, once all five pages exist, rather than against pages that are still stubs.

**Media rewire**

Media's `layout.tsx` already gates on `hasMediaAccess` and renders its own sidebar and top bar. The rewire adds Roster, Activities, Messages and Settings entries to `MediaSidebar` pointing at routes under `media/` whose pages mount the shared components with Media's department id. **Media's Dashboard stays bespoke**, since its cards are radio and devotional specific; whether it adopts the shared Dashboard is left to feature 20 or 22. That exception is why the umbrella's AC-2 names Media's Dashboard explicitly.

## Build tasks

1. Add `slugifyDepartmentName`, the thirteen entry `DEPARTMENT_ICON_KEYS` with its fallback, and `DEPARTMENT_DESCRIPTION_MAX_LENGTH` (280) to `packages/shared`, with the slug parity test against today's `lib/slugify.ts` and the slug uniqueness test. Replace `apps/admin/lib/slugify.ts` with the shared function, satisfies **AC-7**, foundation for **AC-1**.
2. Write `departmentShell.getShellContext`: slug resolution, role resolution, the `can` object, the icon key, the paused department case, and `null` for a plain roster member and for an unauthenticated caller, satisfies **AC-4**, foundation for **AC-5**.
3. Add the server side capability assertion helper to `convex/lib/authz.ts`, derived from the same matrix, satisfies **AC-5**.
4. Build `[slug]/layout.tsx` (sidebar, top bar, department name and icon, back to hub) and make `[slug]/page.tsx` redirect to `dashboard`. Replace the "Coming soon" skeleton for active departments and keep it for paused ones, satisfies **AC-1**, **AC-2**.
5. Create the five route files mounting the shared page components, and drive the sidebar's items from the `can` object, satisfies **AC-2**, **AC-5**.
6. Build `updateDepartmentDescription` with all five rules above, and the Settings page with the description editor plus the reused account panel. Retire the "not admin editable" comment on `departments.description`, satisfies **AC-8**, **AC-9**.
7. Apply the table to cards rule across the finished shared components and verify every page at 375 pixels, satisfies **AC-6**.
8. Rewire Media: add the four shared pages under `media/`, extend `MediaSidebar`, keep its bespoke Dashboard, and remove any duplicated page code, satisfies **AC-3**.

## Rationale (short)

The shell is shared components rather than one dynamic page because Media already needs the shell's pages inside its own portal, and five later department features will need the same. Slug resolution is server side so the department being acted on is never a client assertion, which matters because every shell mutation is scoped by it, and the parity test exists because replacing a slug function that existing links already use is a silent breakage otherwise. The capability object exists so the twelve row permission matrix is encoded once; copying it per page is how a delegate ends up with HOD powers in one department. `getShellContext` resolves to `null` rather than throwing because it backs a live subscription that must survive a role change mid session. The icon map exports a string rather than a component to keep `packages/shared` importable from Convex, which cannot load React.

## Edge cases

- An unknown or misspelled slug redirects to the hub, the behaviour the current skeleton already has.
- A paused department reached by typing its slug shows "Coming soon", never the shell.
- A plain roster member of Media, Hospitality or Library typing a shell URL is redirected to the hub, while their department's bespoke pages still open.
- A caller holding only `clan_elder` has no department capability and is redirected to the hub.
- Losing an HOD role while a shell page is mounted resolves `getShellContext` to `null` and redirects, rather than throwing inside a live query.
- Signing out while a shell page is mounted does the same.
- A department added later with no icon entry renders the fallback icon rather than nothing.
- A department with no description shows the hub card without a description line, exactly as today, and clearing the description returns it to that state.
- Two departments whose names slugify identically would make one unreachable; the uniqueness test fails the build before that can ship.
