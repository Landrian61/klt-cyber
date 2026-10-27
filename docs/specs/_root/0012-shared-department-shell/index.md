# 0012. Shared department shell

**Date**: 2026-10-27
**Status**: In Progress

## Summary

Every active Area of Service gets the same working home on the web portal: Dashboard, Roster, Activities, Messages and Settings. The five pages are built once as shared components backed by shared Convex functions, then hosted by the dynamic `areas-of-service/[slug]/` route for departments with no portal of their own, and imported by bespoke portals (Media today) so nothing is duplicated. The one genuinely new product concept is the **pending claim**: asking to serve in a department now creates a request an HOD confirms or declines, instead of silently placing the person on the roster. Everything else is the authoring side of contracts that already exist, so the mobile app starts showing department activities and messages the moment leaders create them.

## Structure

This is an umbrella spec. Each child is buildable on its own and carries its own design detail.

- [0012-shell-architecture.md](0012-shell-architecture.md): the portal shell itself. Slug to department resolution, the shared page component pattern, role aware navigation, the fixed department icon, the description editor and the Settings page, the phone layout rule, and the Media rewire. Supports S1-01 to S1-04, S6-01, S6-02.
- [0012-roster-and-claims.md](0012-roster-and-claims.md): the roster read surface and the new claim lifecycle, including confirm and decline, the signup write path change, and the four existing writers that must learn about pending rows. Supports S3-01 to S3-10.
- [0012-activities.md](0012-activities.md): creating, editing and cancelling department activities, the month calendar, read only church events, and the day before reminder the schema left for this feature. Supports S4-01 to S4-04.
- [0012-messages-and-notices.md](0012-messages-and-notices.md): department messages and the new HOD to HOD notice. Supports S5-01 to S5-05.
- [0012-dashboard.md](0012-dashboard.md): the department scoped dashboard cards and the per department activity feed. Supports S2-01 to S2-04.

## Requirements

**User stories**:
- As a portal user, I pick my department from the hub and land on a real Dashboard, so the portal is useful rather than a "Coming soon" page.
- As a portal user serving in several departments, I move between them without signing in again and never have to wonder which one I am acting on.
- As a portal user, I only see the pages and buttons my role allows, and the server agrees with what I see.
- As an HOD, I decide who serves with me: I confirm or decline the people asking to join, add verified members, set positions, remove people and appoint a delegate.
- As a member asking to serve in a department, my request waits for that department's HOD rather than putting me on the roster unannounced.
- As an HOD or delegate, I schedule department activities and message my team, and the verified people on my roster hear about it on their phones.
- As an HOD, I send a one way notice to other HODs and see what I have sent and received.
- As an HOD, I open my department on my phone's browser and every page still works.

**Acceptance criteria** (the contract, each independently checkable):

Shell and navigation
- **AC-1**: Picking an active department on the Areas of Service hub lands on that department's Dashboard at `/areas-of-service/<slug>/dashboard`, not the current "Coming soon" skeleton. "Active" means a department whose name is not in `PAUSED_DEPARTMENTS`; a paused department keeps the "Coming soon" page.
- **AC-2**: Every active department has all five pages (Dashboard, Roster, Activities, Messages, Settings) rendered from one shared set of page components and one shared set of Convex functions. Media is the one exception and keeps its own bespoke Dashboard, per AC-3.
- **AC-3**: Media's existing portal renders the shared Roster, Activities, Messages and Settings components rather than its own copies, and keeps its bespoke Dashboard, Devotionals and Past events pages. No shell page implementation exists twice in the repo.
- **AC-4**: A user who serves in several departments switches between them without re authenticating, and the department being acted on is always read from the URL slug, resolved server side, never from session state.
- **AC-5**: Navigation items and action buttons render only what the caller's role for that specific department allows, per SRS 4.7.2. Every corresponding Convex mutation re checks the same rule and rejects a caller who lacks it, so forcing the request fails.
- **AC-6**: Every shell page is usable at 375 pixels wide: tabular data becomes stacked cards, and no page scrolls sideways.
- **AC-7**: Each department renders a fixed built in icon, resolved from a shared constant that names all thirteen departments plus a fallback, on both the hub card and its portal header.
- **AC-8**: The HOD edits the department description as plain text within `DEPARTMENT_DESCRIPTION_MAX_LENGTH`. It saves immediately, writes an `activityLogs` entry, and the new text appears on the hub card. An unchanged save writes no audit entry. A delegate or any other caller is rejected by the server.
- **AC-9**: The Settings page shows the caller's own profile and account controls, plus the description editor when and only when the caller is that department's HOD.

Roster and claims
- **AC-10**: The Roster page lists every active member with photo, name, clan, position and the real mentorship status read from `memberProfiles.mentorshipStatus`, never a hardcoded value, sorted by last name then first name.
- **AC-11**: An HOD or delegate opens any roster member's full profile regardless of that member's directory sharing setting, through a named server function that performs the sharing bypass. Only that department's HOD and delegate plus System Admin may call it; Administration authority may not.
- **AC-12**: The Roster supports search and filter by name, clan and position.
- **AC-13**: Pending claimants appear in a separate section marked "not yet verified" or "awaiting confirmation", oldest claim first, and are never included in any member count.
- **AC-14**: `departmentMemberships.status` accepts `pending_claim` and `declined` in addition to `active` and `removed`, with `claimedAt`, `decidedBy`, `decidedAt` and `declineReason` fields. The status union and all three new length caps live in `packages/shared` with unit tests.
- **AC-15**: A user never holds two live rows for the same department. Selecting an Area of Service during profile submission creates one `pending_claim` row and is rejected when a `pending_claim` or `active` row already exists for that pair; `addDepartmentMember` and the role appointment path in `roles.ts` promote an existing `pending_claim` row to `active` rather than inserting a second row; rows already `active` keep their status, so nobody currently serving is removed from a roster.
- **AC-16**: An HOD confirms a claim: the row becomes `active`, the member is notified (N11) and the action is logged. Confirming is rejected when the member's profile is not verified, with the interface explaining why, and when the member already holds `MAX_ACTIVE_DEPARTMENTS` active departments.
- **AC-17**: An HOD declines a claim with an optional reason: the row becomes `declined`, the member is notified with that reason (N11), the action is logged, and the claim stops showing as pending to the claimant. `declineReason` is returned only to the claimant and to that department's HOD.
- **AC-18**: A delegate cannot confirm or decline a claim, set a position, remove a roster member, appoint or remove a delegate, edit the description, or send an HOD notice. Each is rejected by the Convex function, not only hidden in the interface.
- **AC-19**: An HOD or delegate adds a verified member from the member pool. The three department cap is enforced and the member is notified (N12).
- **AC-20**: An HOD sets a position as free text, removes a roster member (which revokes any role they held in that department, notifies them privately via N12 and is logged), and appoints or removes a delegate chosen only from verified roster members (appointment notifies via N13, removal via N15).
- **AC-21**: The Administration verification read returns a submitter's `pending_claim` rows as well as their active ones, so a reviewing admin sees claimed Areas of Service rather than an empty list.

Activities
- **AC-22**: An HOD or delegate creates an activity with title, date, start time, end time, location, description and an optional image, stored in `groupActivities` with a department owner. Date and time entered in the portal are interpreted as church local time (Africa/Kampala, no DST) via `KAMPALA_UTC_OFFSET_MS` and stored as a UTC instant.
- **AC-23**: Creating an activity, changing its date, time or location, or cancelling it notifies only the department's verified roster members (N22). Pending claimants are never notified. Editing only the title, description or image notifies nobody.
- **AC-24**: One reminder is delivered about 24 hours before the start time (N23) to the verified roster resolved at dispatch time, so members added after scheduling are included. Changing the start time moves the reminder, cancelling the activity stops it, and a stale job that fires anyway delivers nothing because it re checks the activity's current start time, existence and cancellation.
- **AC-25**: An HOD or delegate edits or cancels an activity. A cancelled activity stays listed and marked "Cancelled" until its end time passes, judged against an explicit `now` argument the client supplies rounded to the minute, never a server side `Date.now()` that a live query cannot re evaluate.
- **AC-26**: The Activities page shows the department's own activities as both a list and a month calendar, plus church wide events, read only. Events restricted to selected departments join this list once feature 18 defines the audience field.
- **AC-27**: A windowed query returns any department's activities with the owning department name, authorised for Administration authority and System Admin, ready for Administration's Year Planner to render read only. The planner interface itself belongs to feature 18, so only the query is in scope here.

Messages and notices
- **AC-28**: An HOD or delegate sends a message to the whole department with an optional image, stored in `groupMessages`. Verified roster members receive push and in app delivery (N24) and the message appears under "My groups" in the app.
- **AC-29**: Past department messages are listed newest first with sender name and time sent, paginated, and a sender whose account has been deleted or whose profile is missing renders as "a former member" rather than blank.
- **AC-30**: An HOD deletes any department message; a delegate deletes only messages they sent themselves. Deletion is a soft delete that removes the message from "My groups" and keeps the audit trail.
- **AC-31**: An HOD sends a one way notice to one HOD, several HODs or all HODs, stored in `hodNotices` within `HOD_NOTICE_MAX_LENGTH`. Recipients are notified (N25). The system offers no reply path. The Pastoral HOD and a System Admin may also send.
- **AC-32**: An HOD sees both the notices they have received and the notices they have sent, newest first and paginated with no time window, so a notice is still readable long after it was sent.

Dashboard
- **AC-33**: The Dashboard shows the department's verified member count, excluding pending claimants, and the number of claims waiting. Where an active membership belongs to a member whose profile is not verified (a grandfathered row), the roster lists them labelled "not verified" and the verified count excludes them, so the two numbers are explainable rather than contradictory.
- **AC-34**: The Dashboard shows the next few upcoming department activities, judged against the client supplied `now`, and the church's current weekly programs read through a query the shell is authorised to call.
- **AC-35**: The Dashboard shows a recent activity feed scoped to this department, newest first, covering claims created, confirmed and declined, members added, removed and re titled, delegates appointed and removed, messages sent, activities created and cancelled, and description edits.
- **AC-36**: The Dashboard shows how many active roster members have a `mentorshipStatus` other than `completed`.
- **AC-37**: `activityLogs` carries a top level optional `departmentId` with a `by_department` index, and every shell mutation that concerns a department writes it, so the feed is an indexed read bounded by one department rather than a scan of all church activity.
- **AC-38**: Every shell card and list renders an explicit empty state when it has no data, and a page whose query fails shows the shared `ErrorState` with a retry rather than a blank screen.
- **AC-39**: Account deletion clears a leaving user's `pending_claim` and `declined` membership rows as well as their active ones, and clears `declineReason`, so no personal data survives in the new statuses.

## Decision

**Chosen option**: Option 2: Shared page components and shared Convex functions, hosted by the dynamic `[slug]` route.

Build the five pages once as shared React components backed by a shared Convex surface. The dynamic `areas-of-service/[slug]/` route is the default host and the complete portal for any active department without a bespoke one; bespoke portals import the same components beside their own pages. Model a pending claim by widening `departmentMemberships.status` rather than adding a second table, and let this feature own the whole claim contract including the signup write path and the four existing writers that must learn about pending rows.

**Implementation skills**: `convex` (`.claude/skills/convex/`) for the backend function, schema and scheduler conventions · `shadcn` (`.claude/skills/shadcn/`) for the portal's component primitives

## Rationale

Reasoning, the options weighed and the references: see [rationale.md](rationale.md).

## Feature design

This section holds the contract shared across all five children. Per page detail lives in each child spec.

**Data model sketch**

Every schema change is additive, so there is no data migration. Widening a union and adding optional fields, one table and one index all leave existing rows valid. That is what makes grandfathering current memberships free rather than a migration step. What is **not** free is behaviour: four existing writers and one existing read assume a membership is either active or removed, and each must be taught about `pending_claim`. Those are code changes, not data changes, and they are build tasks below.

| Table | Change | Fields |
|---|---|---|
| `departmentMemberships` | widened union plus new fields | `status` gains `pending_claim` and `declined` (now `pending_claim \| active \| removed \| declined`); add `claimedAt: number?`, `decidedBy: Id<"users">?`, `decidedAt: number?`, `declineReason: string?`. The existing `by_departmentId_status` and `by_userId_status` indexes serve every new read unchanged |
| `hodNotices` | new table | `fromUserId: Id<"users">`, `fromDepartmentId: Id<"departments">?`, `body: string`, `scope: "all" \| "selected"`, `recipientDepartmentIds: Id<"departments">[]`, `sentAt: number`; indexes `by_from` on `["fromUserId"]` and `by_sentAt` on `["sentAt"]` |
| `activityLogs` | new field and index | `departmentId: Id<"departments">?` at the top level, index `by_department` on `["departmentId"]` |
| `groupActivities` | new field | `dayBeforeReminderJobId: Id<"_scheduled_functions">?` |
| `departments` | semantics only | `description` becomes HOD editable; the "fixed and seeded, not admin editable" comment is retired |

`activityLogs.departmentId` sits at the **top level and not inside `metadata`**, because `metadata` is typed `v.optional(v.any())` and Convex cannot index a path inside an `any`. The intent (an indexed read bounded by one department) is unchanged; only the field's home moved. Existing audit rows carry their department only inside `metadata`, so the feed starts from this change forward and no backfill runs.

`hodNotices` stores recipients as department ids, not user ids, so a notice follows whoever currently holds the HOD seat rather than freezing to the person who held it that day.

New entries in `packages/shared`:

| Export | Value or purpose |
|---|---|
| `DEPARTMENT_MEMBERSHIP_STATUSES` and its type | the single definition of the widened status union |
| `DEPARTMENT_ICON_KEYS` | all thirteen department names mapped to an icon key string, plus a fallback key; a string and not a component, because this package is imported by Convex and by both apps |
| `slugifyDepartmentName` | one slug function shared by the portal and Convex, proved by test to produce the same output as today's `apps/admin/lib/slugify.ts` for all thirteen seeded names so existing hub links keep working |
| `DEPARTMENT_DESCRIPTION_MAX_LENGTH` | 280 |
| `CLAIM_DECLINE_REASON_MAX_LENGTH` | 280 |
| `HOD_NOTICE_MAX_LENGTH` | 1000 |

Church local time reuses the existing `KAMPALA_UTC_OFFSET_MS` and `kampalaToday` in `packages/shared/src/constants/weeklyPrograms.ts`, which `convex/calendar.ts` already derives from. No new timezone constant is introduced.

**State transitions**

Department membership:

```
(absent) ──claim at submission or add area later──► pending_claim
pending_claim ──HOD confirms, or an HOD/delegate adds them, or they are appointed──► active
pending_claim ──HOD declines (optional reason)──► declined
active ──HOD removes (cascade revokes dept roles)──► removed
(absent) ──HOD or delegate adds a verified member──► active
```

At most one row per user and department is ever in `pending_claim` or `active`. `declined` and `removed` are terminal; a fresh claim after either inserts a new row, so the history of decisions stays readable.

Department activity: `scheduled ──cancel──► cancelled`, with the row staying listed and marked until its end time passes (the same two state split `events` already uses, deliberately not folded into a delete).

**API surface**

New file `convex/departmentShell.ts` holds what every page needs; the rest extends existing files so related logic stays together. Every list read is bounded: by one department's membership rows, by a date window, or by an explicit page size.

| Function | Type | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `departmentShell.getShellContext` | query | `slug: string` | `{ department, iconKey, role, can: {...} }` or `null` | this department's HOD or delegate, or System Admin | `null` when unauthenticated or without access, so a mounted page never throws |
| `departmentShell.getDashboard` | query | `departmentId`, `now: number` | counts, upcoming activities, programs | own HOD or delegate, System Admin | `null` when unauthenticated |
| `departmentShell.listDepartmentFeed` | query | `departmentId`, `limit` | recent audit entries, newest first | own HOD or delegate, System Admin | `null` when unauthenticated |
| `departmentShell.getRosterMemberProfile` | query | `departmentId`, `userId` | the member's full profile, sharing bypassed | own HOD or delegate, System Admin only | throws for Administration authority and everyone else |
| `departmentShell.updateDepartmentDescription` | mutation | `departmentId`, `description` | `{ ok, changed }` | own HOD, System Admin | over cap; no audit entry when unchanged |
| `departmentMemberships.listRosterWithClaims` | query | `departmentId` | `{ active[], pending[] }` | own HOD or delegate, System Admin; Administration authority gets `active[]` only, without full profiles or `declineReason` | `null` when unauthenticated |
| `departmentMemberships.confirmClaim` | mutation | `membershipId` | `{ ok }` | own HOD, System Admin | not pending, profile not verified, three department cap |
| `departmentMemberships.declineClaim` | mutation | `membershipId`, `reason?` | `{ ok }` | own HOD, System Admin | not pending, reason over cap |
| `departmentMemberships.addDepartmentMember` | mutation (exists, changed) | `departmentId`, `userId`, `positionTitle?` | `{ membershipId }` | own HOD or delegate, System Admin | not verified, cap; now promotes a `pending_claim` row instead of inserting a duplicate |
| `departmentMemberships.updateDepartmentMembership` | mutation (exists) | `membershipId`, `positionTitle?` | `{ ok, changed }` | own HOD, System Admin | not active |
| `departmentMemberships.removeDepartmentMember` | mutation (exists) | `membershipId` | `{ ok }` | own HOD, System Admin | not found; cascade revokes department roles |
| `roles.assignRole` / `revokeRole` | mutation (exists, changed) | `userId`, `roleType`, `departmentId` | role id | per existing rules | now promotes a `pending_claim` row instead of inserting a duplicate |
| `departmentActivities.createActivity` | mutation | `departmentId`, title, start, end, location?, description?, `imageKey?` | `{ activityId }` | own HOD or delegate, System Admin | end before start, over caps |
| `departmentActivities.updateActivity` / `cancelActivity` | mutation | `activityId`, changed fields / `reason?` | `{ ok }` | as above | already cancelled, not found |
| `departmentActivities.listForDepartment` | query | `departmentId`, `from`, `to`, `now` | activities plus read only church events | own HOD or delegate, System Admin | `null` when unauthenticated |
| `departmentActivities.listAllForPlanner` | query | `from`, `to` | activities with owning department name | Administration authority, System Admin | `null` when unauthenticated |
| `groups.sendDepartmentMessage` | mutation | `departmentId`, `body`, `imageKey?` | `{ messageId }` | own HOD or delegate, System Admin | over cap |
| `groups.listDepartmentMessages` | query | `departmentId`, pagination | messages with sender and time | own HOD or delegate, System Admin | `null` when unauthenticated |
| `groups.deleteDepartmentMessage` | mutation | `messageId` | `{ ok }` | HOD for any message; delegate only their own | not the sender and not HOD |
| `hodNotices.sendNotice` | mutation | `body`, `scope`, `recipientDepartmentIds[]` | `{ noticeId }` | any department HOD, Pastoral HOD, System Admin | empty recipients when scope is selected, over cap |
| `hodNotices.listReceived` / `listSent` | query | pagination | notices with sender, recipients, time | HOD, Pastoral HOD, System Admin | `null` when unauthenticated |

`imageKey` is the one input name used for an R2 object key across activities and messages, so the three different names an earlier draft used cannot drift.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| `getShellContext` | which department this page is about | `slug` input matched against `departments` read by `by_order`, compared with the shared `slugifyDepartmentName`; never a client supplied id |
| `getShellContext` | the caller's role for this department | `roleAssignments` active rows scoped to this `departmentId` (`hod`, `department_admin`) plus `isActiveSystemAdmin` |
| `getShellContext` | which navigation items and buttons to show | the SRS 4.7.2 matrix, encoded once as a `can` object derived from that role |
| `getShellContext` | the department icon | `DEPARTMENT_ICON_KEYS[department.name]`, falling back to the fallback key, mapped to a lucide component in the admin app |
| Roster row | mentorship status | `memberProfiles.mentorshipStatus` (`not_enrolled \| enrolled \| completed`), read live, never copied onto the membership |
| Roster row | clan name | `memberProfiles.clanId` joined to `clans`; renders "no clan yet" when absent |
| Roster row | position | `departmentMemberships.positionTitle`; renders blank when absent |
| Roster row | photo | `memberProfiles.photoUrl` through `resolveMediaUrl`, since it may be an R2 key or a Google account URL; falls back to the member's initials |
| Roster row | display name | `users.firstName` plus `users.lastName`, falling back to `users.email`, the same formula `listDepartmentMembersWithProfiles` already uses |
| Roster sort | active order, pending order | active sorted by last name then first name; pending sorted by `claimedAt` ascending, falling back to `_creationTime` for a legacy row, so the longest waiting claim is first |
| Pending section | "awaiting confirmation" versus "not yet verified" | `status === "pending_claim"` plus the claimant's `memberProfiles.profileStatus` |
| Roster row | the "not verified" label on a grandfathered active row | the joined `memberProfiles.profileStatus` on an `active` row |
| `confirmClaim` | whether the three department cap is hit | count of that user's `active` memberships against `MAX_ACTIVE_DEPARTMENTS` in `packages/shared`; Convex serialises the conflicting read set, so two simultaneous confirms retry rather than both succeeding and no application lock is needed |
| Filter options | clan list, position list | clans from the `clans` table by `by_order`; positions from the distinct non empty `positionTitle` values present on this roster |
| Activity write | the instant stored | the form's date and time read as church local, shifted by `KAMPALA_UTC_OFFSET_MS` to a UTC instant |
| Activity read | whether an item is past or upcoming | the `now` argument the client supplies, rounded down to the minute, so the live query re runs as the client advances it |
| Activity reminder | when it fires | `startDateTime` minus 24 hours, scheduled at write time; the job id is stored so an edit can cancel and reschedule |
| Activity reminder | who receives it | resolved at dispatch time from the department notification audience, which resolves to verified roster members only |
| Activity and message notifications | who receives them | the existing `department` notification audience |
| Notification identity | which catalogue entry each send is | N11 claim confirmed or declined, N12 added to or removed from a roster, N13 delegate appointed, N15 role removed, N22 activity created, changed or cancelled, N23 activity reminder, N24 department message, N25 HOD notice |
| `hodNotices` received list | which notices are mine | the caller's active `hod` role assignments matched against `recipientDepartmentIds`, plus every notice whose `scope` is `all`, evaluated at read time over the whole table with pagination and no time window |
| `hodNotices` sender label | who sent it | `fromUserId` joined to `users` for the name, plus `fromDepartmentId` for the department, which is absent for a System Admin |
| Message and notice sender | name when the account is gone | "a former member", since account deletion anonymises the `users` row rather than deleting it |
| Dashboard | verified member count | `active` memberships joined to `memberProfiles.profileStatus === "verified"` |
| Dashboard | claims waiting | count of `pending_claim` rows for this department |
| Dashboard | members without completed mentorship | `active` memberships whose joined `mentorshipStatus !== "completed"`, which is `not_enrolled` plus `enrolled` |
| Dashboard | recent department activity | `activityLogs` read through `by_department` in descending order over a bounded window, filtered to the named action set |
| Dashboard | this week's programs | the church wide weekly program read; if the existing read is gated to Administration authority, a department scoped wrapper is added rather than widening that gate |
| Any audit entry | the department it concerns | the new top level `activityLogs.departmentId`, written by every shell mutation |
| Audit action names | the feed's fixed set | `department.claim_created`, `department.claim_confirmed`, `department.claim_declined`, `department.member_added`, `department.member_removed`, `department.member_title_updated`, `department.delegate_appointed`, `department.delegate_removed`, `department.message_sent`, `department.activity_created`, `department.activity_cancelled`, `department.description_updated` |

**Key invariants**

- A user never holds more than one `pending_claim` or `active` row for the same department. Every writer either promotes the existing row or rejects.
- A pending claimant is never a member: never counted, never notified about activities or messages, never listed in the active roster section.
- Only a verified profile can become an `active` membership through confirmation or a direct add. Rows that were already `active` before this change are grandfathered and may belong to an unverified profile, so they are labelled rather than hidden.
- A user holds at most `MAX_ACTIVE_DEPARTMENTS` active departments; the cap is checked inside the mutation, since Convex has no unique or check constraints.
- Removing someone from a roster always revokes any `hod` or `department_admin` role they held in that department, in the same mutation.
- A department has at most one active HOD; existing cardinality handling in `roles.ts` stays the authority on this.
- The department being acted on comes from the URL slug resolved server side, never from session state.
- Every consequential shell mutation writes an `activityLogs` row carrying `departmentId`.
- A cancelled activity keeps its place in the list until its end time passes; cancelling never deletes.
- `declineReason` is readable only by the claimant and by that department's HOD.

**Security model**

Authority follows SRS 4.7.2 exactly, enforced in the Convex function, which is the real boundary. The middleware and the route layout remain user experience only.

| Capability | HOD of this department | Delegate of this department | Administration authority | System Admin |
|---|---|---|---|---|
| Open the shell, read Dashboard, read the active roster | yes | yes | active roster only, through its existing read | yes |
| See pending claimants and `declineReason` | yes | yes (claimants, not `declineReason`) | no | yes |
| Open a full profile with directory sharing bypassed | yes | yes | no | yes |
| Add a verified member, create, edit and cancel activities, send and view messages | yes | yes | no | yes |
| Delete a message | any message | only their own | no | any |
| Confirm or decline a claim, set a position, remove a member, appoint or remove a delegate, edit the description, send an HOD notice | yes | no | no | yes |

Three deliberate boundaries.

First, **a plain roster member gets no shell pages.** SRS 4.9.2 gives a Media roster member "No" on roster, claims, positions and delegates and "receive only" on activities and messages. Spec 0006's `hasPortalAccess` lets such a member into the portal so they can reach their department's own bespoke pages (Media's Radio, Devotionals and Past events); it does not admit them to the shell. `getShellContext` therefore returns `null` for them and the shell redirects to the hub.

Second, **Administration authority keeps read access and gains nothing else.** Spec 0006 gave it the active roster of any department, and that stays. It does not receive the pending claims list, the sharing bypassed profile, or any write inside another department's shell; running a department is its HOD's job, and Administration's own powers over other departments (appointing an HOD, verifying profiles) live in its own module.

Third, **an HOD or delegate sees a roster member's full profile regardless of that member's directory sharing setting.** This is a deliberate carve out of the privacy default in NF-02, required by S3-02, performed by one named function so it cannot widen by accident.

`hodNotices` is the one surface a non HOD may write to, because F4-20 and PS4-01 name the Pastoral HOD and the System Admin as senders. The Pastoral HOD is identified by holding an active `hod` role scoped to the department named "Pastoral".

**Configuration required**

None. No new environment variables, credentials or third party services. Reminders use the Convex scheduler already in use for event reminders, and notifications use the push component already registered in `convex.config.ts`.

**Critical test scenarios**

- Happy path: an HOD opens their department from the hub, confirms a pending claim, creates an activity and sends a message; the member appears on the roster and a verified roster member receives both notifications, verifies **AC-1**, **AC-16**, **AC-22**, **AC-28**.
- Claim lifecycle: a profile submission creates a `pending_claim` row that does not appear in the member count, then confirmation moves it to `active` and declining moves it to `declined` with the reason delivered, verifies **AC-13**, **AC-15**, **AC-16**, **AC-17**.
- No duplicate row: a user with a `pending_claim` row who is then added by an HOD, or appointed as a delegate, ends with exactly one `active` row and no leftover pending row; a second submission for the same department is rejected, verifies **AC-15**.
- Verification read: an admin reviewing a freshly submitted profile sees its claimed Areas of Service, verifies **AC-21**.
- Cap and verification refusal: confirming is rejected when the claimant is not verified, and when they already hold three active departments, verifies **AC-16**.
- Concurrent confirm: two confirms of the same claim leave one `active` row and the loser reports "no longer pending" rather than double patching, verifies **AC-15**, **AC-16**.
- Delegate refusal: a delegate calling `confirmClaim`, `updateDepartmentDescription`, `removeDepartmentMember` or `sendNotice` is rejected server side with the interface bypassed, verifies **AC-5**, **AC-18**.
- Plain roster member refusal: a Media roster member with no role gets `null` from `getShellContext` and is redirected to the hub, while still reaching Media's own Devotionals page, verifies **AC-5**.
- Administration boundary: Administration authority reads another department's active roster but is rejected on `getRosterMemberProfile` and receives no pending list, verifies **AC-11**.
- Cross department refusal: the HOD of department A calling any shell mutation scoped to department B is rejected, verifies **AC-5**.
- Pending claimant exclusion: creating an activity and sending a message notifies verified roster members and not pending claimants, verifies **AC-23**, **AC-28**.
- Reminder movement and staleness: editing the start time cancels the old job and schedules a new one; a stale job that still fires delivers nothing because the start no longer matches; cancelling stops it, verifies **AC-24**.
- Notification volume: editing only an activity's description notifies nobody, while changing its time notifies the verified roster, verifies **AC-23**.
- Timezone: an activity entered as 18:00 by an HOD whose browser is not in Kampala stores the instant for 18:00 Kampala time, verifies **AC-22**.
- Clock boundary: a cancelled activity disappears from the list once the client advances `now` past its end time, with no server clock involved, verifies **AC-25**.
- Message deletion authority: an HOD deletes a delegate's message successfully, and a delegate deleting another person's message is rejected, verifies **AC-30**.
- Grandfathering: an existing `active` self added membership keeps status `active`, still appears on the roster, carries the "not verified" label when its profile is unverified, and is excluded from the verified count, verifies **AC-15**, **AC-33**.
- Account deletion: a leaving user's `pending_claim` and `declined` rows are cleared along with their active ones and no `declineReason` survives, verifies **AC-39**.
- Reactive teardown: every shell query resolves to `null` rather than throwing when the caller signs out or loses access while the page is mounted, verifies **AC-38**.
- Phone layout: each of the five pages at 375 pixels wide shows stacked cards with no sideways scrolling, verifies **AC-6**.

## Build plan

Ordered as Tracer Bullet: a thin thread through every layer first (schema, server, gate, one real number on screen), then one subsystem thickened at a time end to end. The data model is additive and lands once, in slice 1, because every later slice depends on some part of it and no part needs a migration.

**Deploy ordering constraint**: a push to `main` deploys Convex to staging before the admin portal build completes, and mobile receives an over the air update separately. Slice 5 flips the signup write path, so it must not ship before slices 3 and 4 are deployed and the confirm interface is live. Otherwise new claims accumulate with nothing able to confirm them.

1. Additive schema and the shared contract: widen `departmentMemberships.status` and add its four claim fields, add the `hodNotices` table, add `activityLogs.departmentId` with `by_department`, add `groupActivities.dayBeforeReminderJobId`, and add the status union, the thirteen entry icon map with its fallback, `slugifyDepartmentName` and the three numbered caps to `packages/shared` with unit tests including the slug parity test. No data migration, satisfies **AC-14**, **AC-37**, foundation for **AC-7**, **AC-15**.
2. Teach the four existing writers and one existing read about pending rows, before any claim can exist: promote rather than duplicate in `addDepartmentMember` and in `roles.ts`'s appointment insert, reject a duplicate claim in `submitProfile`, widen the Administration verification read to include `pending_claim`, and extend `accountDeletion.performDeletion` to the new statuses while clearing `declineReason`, satisfies **AC-15**, **AC-21**, **AC-39**.
3. The thin end to end thread: the `[slug]` shell host (layout, sidebar, top bar, server side slug resolution, the fixed icon) plus `getShellContext` returning the `can` object, with a Dashboard showing only the verified member count. Proves hub to dashboard to server gate in one pass, and establishes that a plain roster member is redirected, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-33** in part.
4. The permission matrix, once: encode SRS 4.7.2 as the single `can` object, drive navigation and buttons from it, and add the matching server side assertion helper every shell mutation calls, satisfies **AC-5**, **AC-18**.
5. Roster read end to end: `listRosterWithClaims` with its two lists, sorts and the Administration narrowed shape, `getRosterMemberProfile` for the sharing bypass, the roster table with real mentorship status, search and filter, the grandfathered "not verified" label, and the separate marked pending section, satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**.
6. Claims write end to end: flip `submitProfile` to write `pending_claim` with `claimedAt` and its own `department.claim_created` audit action, then `confirmClaim` and `declineClaim` with their validation order, the N11 notification and the audit entries, satisfies **AC-15**, **AC-16**, **AC-17**.
7. Roster management wiring: surface add, re title, remove and delegate appointment behind their capabilities, add `departmentId` to their audit entries, and add the N12, N13 and N15 notifications where missing, satisfies **AC-19**, **AC-20**.
8. Activities end to end: the create, update and cancel mutations with church local time conversion, the N22 dispatch restricted to date, time, location and cancellation changes, the day before reminder with its dispatch time audience resolution and its start time staleness guard, the list and month calendar driven by an explicit `now`, and read only church wide events, satisfies **AC-22**, **AC-23**, **AC-24**, **AC-25**, **AC-26**.
9. The planner query: `listAllForPlanner` returning any department's activities with the owning department name, for feature 18 to render, satisfies **AC-27**.
10. Messages end to end: send with optional image, the paginated newest first list with its former member fallback, and the soft delete split (HOD any, delegate own), satisfies **AC-28**, **AC-29**, **AC-30**.
11. HOD notices end to end: `sendNotice` with its sender predicate and recipient resolution to current HOD seats, the unwindowed paginated received and sent lists, and the N25 dispatch, satisfies **AC-31**, **AC-32**.
12. Dashboard completion: claims waiting, upcoming activities against `now`, the weekly programs read (with a department scoped wrapper if the existing one is gated), the bounded per department feed over the new index, the mentorship gap count, and an explicit empty or error state on every card, satisfies **AC-33**, **AC-34**, **AC-35**, **AC-36**, **AC-38**.
13. Settings and department identity: the HOD only description editor with its no op rule and audit entry, the account panel, and the hub card showing icon plus description, satisfies **AC-8**, **AC-9**.
14. Responsive pass and Media rewire: apply the tables to cards rule across every finished shell page and verify at 375 pixels, then point Media's portal at the shared Roster, Activities, Messages and Settings components while keeping its bespoke Dashboard, Devotionals and Past events pages, satisfies **AC-6**, **AC-3**.

## Consequences

**Positive**:
- Five of the seven active departments (Pastoral, Finance, Hospitality, Real Estate, Library and Information) get a working portal from one build, and the five later department features each start from a working shell instead of an empty folder.
- The mobile app's "My groups" and merged activities list, already built by spec 0010 against sample data, starts carrying real content with no mobile change at all.
- Rosters become trustworthy: a seat now means an authorised leader put the person there, which is what every later department feature and every department audience notification assumes.
- The permission matrix exists once, in one `can` object with one server side counterpart, instead of being re derived per page.
- No migration, no new environment variable and no new third party service, so the change reverts by redeploying the previous functions.

**Negative / tradeoffs**:
- The risk in this feature is behavioural, not schema. Every existing membership read filters on `status === "active"`, so widening the union breaks no read; what breaks is the three writers that check only for an active row before inserting one, and the verification read that would show a reviewing admin no claims at all. Slice 2 exists solely to close those, and it runs before any claim can be created.
- Every new signup now waits on an HOD. Previously a self added member received department activities and messages as soon as their profile was verified; now they receive nothing until their claim is confirmed. That is the intended behaviour and a visible product change for every new minister.
- A department whose HOD never opens the portal accumulates pending claimants who believe they have joined and who receive nothing.
- Two populations sit on rosters: confirmed seats and grandfathered self added ones, some belonging to unverified profiles. They are distinguishable only by a label, and the roster count and the verified count will legitimately differ. That is the deliberate price of not dropping people who are already serving.
- The web bell channel that N22 and N25 call for does not exist until feature 28, so until then those notifications deliver as push and in app only.
- `hodNotices` addressing seats means a notice to a department with no current HOD reaches nobody and waits unread until someone is appointed.
- The dashboard feed is blank for all history, because existing audit rows carry their department only inside `metadata` and no backfill runs.

**Neutral**:
- `departments.description` changes from seeded reference data to editable content. The seed still supplies the initial text, so a department nobody edits looks exactly as it does today.
- Feature 9 inherits the claim contract rather than defining it. Its post verification "add an Area of Service" path writes the same `pending_claim` row through the same duplicate rejection, and its spec should reference this one rather than redesign the shape.
- The shared page component pattern is a new convention in this repo and belongs in `apps/admin/AGENTS.md` once it exists, so later department features follow it instead of copying pages.
- Convex serialises conflicting mutations, so the three department cap and the confirm path need no application level lock. Worth stating so it is not added defensively.

## Follow-up

- [ ] **Blocker, before slice 3.** The `klt-cyber-web-ui` skill is named as mandatory for all web work in root `AGENTS.md` and described there as carrying the portal shell pattern, but it is not installed in `.claude/skills/`. Install it or correct `AGENTS.md`. This feature is exactly a portal shell, so building the chrome without it risks reinventing a pattern the project already has. `klt-cyber-brand` is in the same state for mobile work.
- [ ] Confirm whether any mobile screen shows a member their own Areas of Service. If one does, it reads active memberships today and will silently drop a pending claim, so the member sees their submission vanish. Either widen that read to show pending and declined claims with their status, or record "no mobile change" as a conscious decision. This spec assumes the latter and the assumption is untested.
- [ ] Feature 9 (profile lifecycle) must adopt this spec's claim contract for its F2-07 path, including the duplicate rejection rule, rather than designing a second one.
- [ ] Feature 18 (Administration core) owns the Year Planner interface that renders department activities read only (A7-01). Slice 9 provides the query; feature 18 renders it.
- [ ] Feature 28 (notification settings and web bell) completes the B channel for N22 and N25.
- [ ] Spec 0008 (account deletion) gains a new status surface through slice 2. Cross reference this spec from 0008 so a future change to either keeps both in step.
- [ ] Decide, when feature 20 or 22 next touches Media, whether Media's Dashboard should also become the shared one. Slice 14 rewires only Roster, Activities, Messages and Settings.
- [ ] Whether a pending claim should count toward `MAX_ACTIVE_DEPARTMENTS` at claim time is deliberately left as is: `submitProfile` caps the number of selections and `confirmClaim` counts only active rows, so a member can hold three claims and have fewer than three confirmed. Revisit if HODs report members claiming more departments than they can serve.
