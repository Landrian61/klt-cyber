# 0021. Administration core

**Date**: 2026-11-12
**Status**: In Progress

## Summary

This spec finishes the Administration portal. It fixes the recent activity card that breaks for everyone but the System Admin, puts contact details in the members directory, and adds a Departments page and a Clans page that show who leads what (and who has no leader). It lets the Administration HOD appoint clan elders. Church events get an audience (whole church, everyone serving, or chosen departments) and can be cancelled. The year planner can delete planned activities and shows every department and clan activity. One field is added to `events`. Nothing else in the schema changes.

## Requirements

**User stories**:
- As an Administration HOD or delegate, I see recent church activity on my dashboard without an error, and this week's programs, upcoming events and planned activities. (A1-03, A1-04)
- As Administration, I see a member's phone and email in the directory, filter by mentorship status, and export them. (A3-01)
- As Administration, I open any department from the sidebar, see its HOD, counts and pending claimants, and as HOD I appoint or replace its HOD. (A3-03, A3-04, A3-06)
- As the Administration HOD, I see the 12 clans with their elders, and appoint, replace or remove an elder. (A3-05, A3-06, F3-16)
- As Administration, I choose who an event is for, and only those people are notified, reminded and see it. (A5-01, A5-02, F4-15)
- As Administration, I cancel an event, and it stays visible marked "Cancelled". (A5-04)
- As Administration, I see every department and clan activity on the year planner, and I delete a planned activity. (A7-01, A7-03)

**Acceptance criteria**:

*Dashboard*
- **AC-1**: The Administration dashboard's recent activity card loads for any caller holding Administration authority (Administration HOD, Administration delegate, System Admin) and never throws. It reads a new query, `admin.listChurchActivity`, which returns only entries whose `action` is in the shared `CHURCH_ACTIVITY_ACTIONS` allowlist, in the same hydrated shape `admin.listRecentActivity` returns today (its hydration helper exported and shared). The card keeps formatting the summary in the client, as it does now. `role.assigned` and `role.revoked` entries whose `metadata.roleType` is `system_admin` are always left out. A caller without Administration authority gets `null`. (A1-03)
- **AC-2**: A "This week" card shows the current church week's program occurrences (Monday to Sunday, Africa/Kampala), with cancelled occurrences marked; the next 5 church events, whatever their audience, each with an audience label and cancelled ones marked; and planned activities starting within the next 14 days. It reads through the Administration side range logic (`getYearPlannerRange`'s, shared as a helper), never through the member side audience filter, so an Administration viewer with no roster seat still sees every event. (A1-04)

*Members directory*
- **AC-3**: `memberProfiles.listVerifiedMembersWithRoles` also returns `phone` (from the profile), `email` (from the linked `users` row) and `mentorshipStatus`. The directory table shows Phone and Email columns, which become fields on the card layout on narrow screens. A mentorship status filter joins the existing filters. The CSV adds Phone, Email and Mentorship columns. Age and date of birth stay out of both the table and the CSV. The detail sheet shows the full contact block: phone, email, address and next of kin. (A3-01)

*Departments*
- **AC-4**: The Administration sidebar's Membership group gains **Departments** and **Clans** entries. The stale "no Administration roster screen" comment in `AdminSidebar.tsx` is removed. (A3-03)
- **AC-5**: The existing Departments page (`DepartmentsClient.tsx`) switches from `departments.listDepartments` to a new query, `departments.listForAdministration`, and lists every department. Each row shows the HOD's name, or "No HOD" in crimson when there is no active HOD, plus the delegate count, the verified roster count and the claims waiting. Paused departments are listed last, marked "Coming soon", and never flagged. A delegate does not count as a leader. (A3-06)
- **AC-6**: Opening a department shows its roster with pending claimants in their own marked section (the existing `departments/[departmentId]` page). For the Administration HOD and the System Admin, the page also offers "Appoint HOD" or "Replace HOD", through the existing `roles.assignRole` with `roleType: "hod"` and its existing revoke and replace rules. An Administration delegate sees the page with no appoint control. (A3-03, A3-04)

*Clans*
- **AC-7**: The Clans page lists all 12 clans in seeded order from a new query, `clans.listForAdministration`. Each row shows the elder's name and photo, or "No elder" in crimson, plus the clan's verified member count. (A3-05, A3-06)
- **AC-8**: The Administration HOD and the System Admin can appoint an elder through `roles.assignRole` with `roleType: "clan_elder"`. The appointee must have a `verified` member profile whose `clanId` equals the target clan, or the server refuses with an `Error` whose message starts with `ELDER_NOT_IN_CLAN:` (the project's errors are plain messages; the code is the prefix). This check runs before the identical seat no op check (`findIdenticalActiveAssignment`), so a re appointment cannot bypass it. It applies to every caller, the System Admin included. The System Admin's `AssignRoleSheet` (`system-admin/users/[userId]/`) maps that prefix to "This person isn't a verified member of that clan." Appointing replaces any sitting elder through the existing revoke and replace in `convex/roles.ts` and `convex/lib/roleNotices.ts` (N15 to the replaced elder, N13 to the appointee, N14 to the clan). `system_admin` grants stay System Admin only. (A3-05, F3-16)
- **AC-9**: The Administration HOD and the System Admin can remove an elder without naming a replacement, through `roles.revokeRole`. The clan then shows "No elder". The removed elder gets N15 privately, and the change is logged. (A3-05)
- **AC-10**: An Administration delegate sees the Clans page read only. The server refuses a delegate's `assignRole` or `revokeRole` for `clan_elder` (and for `hod`, as it does today). (SRS 4.8.1)

*Event audiences*
- **AC-11**: `events.audience` is one of `{ type: "church" }`, `{ type: "serving" }`, or `{ type: "departments", departmentIds }`. `departmentIds` is non empty, has no duplicates, and names only departments that exist and are not paused. Anything else is refused with `INVALID_EVENT_AUDIENCE`. `createEvent` and `updateEvent` require `audience`. Every existing event is backfilled to `{ type: "church" }`. (A5-02)
- **AC-12**: In the mobile app, a signed in user sees an event (in `events.listUpcomingEvents`, `events.listFeaturedEvents`, `events.getEvent`, `upcoming.listUpcomingForMember` and `calendar.getCalendarRange`) only when they are in its audience. `church` means every signed in user. `serving` means anyone holding at least one `active` roster seat in any department, paused or not. `departments` means anyone with an `active` seat in one of the listed departments. Visibility is evaluated live on every read. A user outside the audience gets `null` from `getEvent`, which the app already shows as its "not available" state; that includes someone who opens an old N16 or N17 after leaving the audience, which is accepted (the notice stays in their centre). A past event that was not cancelled still opens through `getEvent` for its audience; AC-19's "until it ends" rule governs lists only. `calendar.getCalendarRange` gains a caller check: a signed in caller gets the audience filter, and a caller who is not signed in gets `church` events only. Portal reads used by Administration (`listAllEvents`, the planner, the dashboard) show every event. (A5-02)
- **AC-13**: Notifications reach only the audience. `church` dispatches with the existing `all` audience, which reaches every non deleted account, visitors included, exactly as today. `serving` and `departments` dispatch with a `users` audience: the deduplicated user ids holding an `active` seat in a qualifying department (any department for `serving`, paused included) and having a `verified` profile, resolved at the moment of sending. Deleted accounts are left out. So only `serving` and `departments` pushes are limited to verified members. Every dispatch passes `kind`: `"N16"` (created), `"N17"` (changed or cancelled), `"N18"` (reminders). An empty resolved list sends nothing. (A5-02, F4-15)
- **AC-14**: Reminders (7 days and 1 day before) are scheduled as a new `events.deliverEventReminder` job, which re reads the event and resolves the audience when it fires. It sends nothing when the event is gone, archived, cancelled, or its `startDateTime` no longer equals the start the job was scheduled for. Any `updateEvent` that changes `audience`, `startDateTime` or `active` cancels both existing jobs and schedules fresh `deliverEventReminder` jobs, so no legacy `dispatch` job with `all` survives an audience change. (A5-02, F4-02)
- **AC-15**: A *relevant change* in `updateEvent` means `startDateTime`, `endDateTime` or `location` differs from the stored value, compared on the server (the form resends unchanged fields). Title, description, cover and featured edits send nothing. N17 is sent only while the event is `active` and not cancelled. When `audience` is unchanged, a relevant change sends N17 to the audience. When `audience` changes, people in the new push audience but not the old one get N16, people removed get nothing, and people in both get N17 only on a relevant change. For `church`, "the push audience" is every non deleted account. Before you save an audience change, the portal dialog shows a plain warning: "People outside the new audience will stop seeing this event." There is no count query. `EventDialog` always sends `audience`, and `updateEvent` requires it. (A5-02, A5-03)
- **AC-16**: The department shell's Activities page reads events through `departmentActivities.listForDepartment` (`convex/departmentActivities.ts`, its church events read). That read now returns, read only, every event whose audience is `church`, `serving`, or `departments` including **the department being viewed** (filtered on that department, not on the caller's own seats, so a System Admin or a delegate sees the same list). (S4-03, A5-02)

*Event cancel*
- **AC-17**: `events.cancelEvent({ eventId, reason? })` sets `cancelledAt`, `cancelledBy` and `cancellationReason` (trimmed, optional, at most `EVENT_CANCELLATION_REASON_MAX_LENGTH` = 200 characters). It cancels both reminder jobs and clears their job ids (as `archiveEvent` does), sends N17 (`kind: "N17"`, title "Cancelled: <title>", body the reason when given, else "<title> on <date> will no longer take place.") to the audience under AC-13, and logs `content.event_cancelled`. (A5-04)
- **AC-18**: Cancel is final. `cancelEvent` refuses an event that is already cancelled (`EVENT_ALREADY_CANCELLED`), already ended (`endDateTime <= now`, `EVENT_ALREADY_ENDED`) or archived (`EVENT_ARCHIVED`). `updateEvent` refuses a cancelled event (`EVENT_CANCELLED_LOCKED`). `archiveEvent` still works on a cancelled event. (A5-04)
- **AC-19**: A cancelled event stays listed, in the app for its audience and in the portal, marked "Cancelled" in crimson with its reason, until its `endDateTime` passes (spec 0010 AC-6). The portal's events table and dialog show the cancelled state and hide Edit and Cancel for it. (A5-04)

*Year planner*
- **AC-20**: `plannedActivities.deleteActivity({ activityId })` hard deletes the row after a confirmation dialog, and logs `content.activity_deleted` with a snapshot (`title`, `startDate`, `endDate`, `departmentIds`, `status`) in `metadata`. A missing row is refused with `NOT_FOUND`. The caller needs Administration authority. (A7-03)
- **AC-21**: `plannedActivities.getYearPlannerRange` also returns every `groupActivities` row (department and clan owned) that overlaps the requested range (`startDateTime < rangeEnd` and `endDateTime >= rangeStart`), as `{ _id, title, startDateTime, endDateTime, location?, ownerType, ownerId, ownerName, cancelled }`. They come from a shared helper in `convex/lib/` that reads `by_department_start` per department and `by_clan_start` per clan; `departmentActivities.listAllForPlanner` is rewritten to call the same helper. The planner renders them read only, labelled with the department or clan name, in a distinct view only style, with cancelled ones struck through in crimson. A toggle hides them. Clicking one opens a read only detail, never the edit dialog. (A7-01)

*Authorization*
- **AC-22**: Every new or changed query and mutation checks authority on the server. The read queries (`listChurchActivity`, `listForAdministration` in both files, `listElderCandidates`) return `null` without Administration authority. The mutations throw. The HOD only gates are the existing inline checks in `convex/roles.ts`, widened for `clan_elder` as in AC-8 and AC-9.

## Decision

**Chosen option**: Fix in place, on the existing Administration pages and Convex modules, with one additive field on `events`.

Every gap closes in the module that already owns it. The audience is one discriminated union field on `events`, backfilled to church. Notifications fan out as a frozen `users` list resolved when each one is sent. Reminders resolve their audience when they fire. The only schema change is `events.audience`, added optional, backfilled, then made required.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Data model

**`events`** gains one field. Nothing else changes in the schema.

| Field | Type | Required | Notes |
|---|---|---|---|
| `audience` | `eventAudienceValidator` | optional in phase 1, required in phase 3 | `v.union(v.object({type: v.literal("church")}), v.object({type: v.literal("serving")}), v.object({type: v.literal("departments"), departmentIds: v.array(v.id("departments"))}))`, defined once in `convex/lib/eventAudience.ts` and reused by the table and both mutations' args |
| `cancelledAt`, `cancelledBy`, `cancellationReason` | existing (spec 0010) | no | written for the first time by `cancelEvent` |

No new index. Church events number in the dozens, so audience filtering runs in memory over the existing `by_startDateTime` and `by_featured` reads. Revisit only if the events table passes a few thousand rows.

Relationships: `events` N:M `departments` through `audience.departmentIds` (only on the `departments` variant). The clan elder is still `roleAssignments` (`roleType: "clan_elder"`, `clanId`), with at most one active per clan, enforced in `assignRole`. `plannedActivities` keeps its shape and loses rows by hard delete.

**`@klt-cyber/shared`** gains, with Vitest tests:

| Export | Value |
|---|---|
| `EVENT_AUDIENCE_TYPES` | `["church", "serving", "departments"] as const` |
| `eventAudienceSchema` | a Zod discriminated union mirroring the Convex validator, with non empty and no duplicate `departmentIds` (paused and existence checks stay server side, since the shared package cannot read the database) |
| `EVENT_AUDIENCE_LABELS` | `church` "Whole church", `serving` "Everyone serving", `departments` "Selected departments" |
| `EVENT_CANCELLATION_REASON_MAX_LENGTH` | `200` |
| `CHURCH_ACTIVITY_ACTIONS` | the A1-03 allowlist, below |
| `EVENT_ERROR` | the error codes named in the ACs |

`CHURCH_ACTIVITY_ACTIONS` (every string below was checked against `convex/` by the cross check, except the two this spec introduces): `profile.submitted`, `profile.resubmitted`, `profile.verified`, `profile.sent_back`, `department.claim_confirmed`, `department.claim_declined`, `department.member_added`, `department.delegate_appointed`, `department.delegate_removed`, `role.assigned`, `role.revoked`, `content.event_created`, `content.event_updated`, `content.event_cancelled` (new, task 5), `content.event_archived`, `content.announcement_created`, `content.announcement_updated`, `content.announcement_published`, `content.program_created`, `content.program_updated`, `content.program_activated`, `content.program_deactivated`, `content.program_occurrence_cancelled`, `content.program_occurrence_restored`, `content.activity_created`, `content.activity_updated`, `content.activity_deleted` (new, task 11), `department.activity_created`, `department.activity_updated`, `department.activity_cancelled`. Department activity entries are church visible to Administration. The Convex test (task 12, after tasks 5 and 11 land) asserts every entry is written somewhere in `convex/`.

### State transitions

Event: `scheduled` (no `cancelledAt`, `active: true`) moves to `cancelled` (`cancelledAt` set, final). Either state moves to `archived` (`active: false`). Archived moves back through the existing restore. A cancelled event that is archived and restored is still cancelled. No path clears `cancelledAt`.

Clan elder: `vacant` moves to `held` by `assignRole`. `held` moves to `held` (a different person) by `assignRole`, as revoke and replace. `held` moves to `vacant` by `revokeRole`.

### API surface

All Convex functions, called through the generated client.

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `admin.listChurchActivity` | query | `limit?: number` (default 10, max 50) | the same hydrated entries `listRecentActivity` returns (`action`, `actor`, `targetUser`, `clanName`, `roleType`, `_creationTime`), through the exported shared hydration helper | Administration authority, else `null` | none |
| `memberProfiles.listVerifiedMembersWithRoles` | query (changed) | as today | adds `phone?`, `email`, `mentorshipStatus` | Administration authority, else `null` | none |
| `departments.listForAdministration` | query | none | `{ _id, name, order, paused, hod: {userId, name, photoUrl} \| null, delegateCount, verifiedRosterCount, claimsWaiting }[]` | Administration authority, else `null` | none |
| `clans.listForAdministration` | query | none | `{ _id, name, order, elder: {userId, roleAssignmentId, name, photoUrl} \| null, verifiedMemberCount }[]` | Administration authority, else `null` | none |
| `clans.listElderCandidates` | query | `clanId`, `search?` | `{ userId, name, photoUrl }[]`, verified profiles in that clan, max 50 | Administration authority, else `null` | none |
| `roles.assignRole` | mutation (changed) | as today | as today | `clan_elder`: System Admin or Administration HOD | `ELDER_NOT_IN_CLAN`, "Not authorized" |
| `roles.revokeRole` | mutation (changed) | as today | as today | `clan_elder`: System Admin or Administration HOD | "Not authorized" |
| `events.createEvent` | mutation (changed) | adds `audience` (req) | `eventId` | `canManageContent` | `INVALID_EVENT_AUDIENCE` |
| `events.updateEvent` | mutation (changed) | adds `audience` (req) | as today | `canManageContent` | `INVALID_EVENT_AUDIENCE`, `EVENT_CANCELLED_LOCKED` |
| `events.cancelEvent` | mutation | `eventId`, `reason?: string` | `null` | `canManageContent` | `EVENT_ALREADY_CANCELLED`, `EVENT_ALREADY_ENDED`, `EVENT_ARCHIVED`, `NOT_FOUND`, reason too long |
| `events.deliverEventReminder` | internalMutation | `eventId`, `expectedStart`, `which: "week" \| "day"` | `{ delivered, reason? }` | internal | none |
| `events.listUpcomingEvents`, `listFeaturedEvents`, `getEvent`, `upcoming.listUpcomingForMember`, `calendar.getCalendarRange` | query (changed) | as today | filtered to the caller's audience (AC-12) | signed in | none |
| `departmentActivities.listForDepartment` | query (changed) | as today | its church events now include events whose audience covers the viewed department | as today | none |
| `departmentActivities.listAllForPlanner` | query (changed) | as today | rewritten over the shared group activities helper, adding clans | as today | none |
| `plannedActivities.deleteActivity` | mutation | `activityId` | `null` | `canManageChurchAdmin` | `NOT_FOUND` |
| `plannedActivities.getYearPlannerRange` | query (changed) | as today | adds `groupActivities: { _id, title, startDateTime, endDateTime, location?, ownerType, ownerId, ownerName, cancelled }[]` (AC-21 overlap rule) | Administration authority | none |
| `calendar.getCalendarRange` | query (changed) | as today | events filtered per AC-12; not signed in gets `church` only | none today, now resolves the caller | none |
| `eventAudienceMigration.backfillEventAudience` | internalMutation | none | `{ patched }` | internal (`convex run`) | none |

Shared helpers in `convex/lib/eventAudience.ts`: `validateEventAudience(ctx, audience)`, `isInEventAudience(groups, audience)` (takes `getEligibleGroups` output, pure), `resolveEventPushAudience(ctx, audience)` returning `NotificationAudience` (`all` for church, else `users`), and `pushRecipientIds(ctx, audience)` returning `Id<"users">[]` (for church, every non deleted account, matching `all`) for the AC-15 difference. Errors are plain `Error`s whose message starts with the `EVENT_ERROR` code and a colon, the same convention as `ELDER_NOT_IN_CLAN`.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| `listChurchActivity` | which entries | `CHURCH_ACTIVITY_ACTIONS`, read per action through `activityLogs.by_action`, at most `limit` per action, merged by `_creationTime` descending, then cut to `limit` |
| `listChurchActivity` | System Admin exclusion | `metadata.roleType === "system_admin"` on `role.*` entries |
| `listChurchActivity` | `actor`, `targetUser`, `clanName`, `roleType` | the existing hydration in `admin.ts` (`listRecentActivity`), exported and shared; the summary sentence stays in the dashboard client |
| This week card | the week's bounds | the Africa/Kampala Monday to Sunday helpers from spec 0011 (`convex/calendar.ts`), evaluated with `Date.now()` on the server |
| This week card | occurrences, cancellations, events | the `getYearPlannerRange` range logic (programs expanded, cancellations applied, every event regardless of audience), extracted into a shared helper and called over that week |
| This week card | next 5 events, planned activities due in 14 days | `events.listAllEvents` filtered to start at or after now, `plannedActivities.listActivitiesInRange(now, now + 14 days)` |
| Directory | `phone`, `mentorshipStatus` | `memberProfiles` columns |
| Directory | `email` | `users.email` through `memberProfiles.userId` |
| Departments row | `hod` | the active `roleAssignments` row with `roleType: "hod"` and that `departmentId` |
| Departments row | `delegateCount` | active `department_admin` assignments for that department |
| Departments row | `verifiedRosterCount`, `claimsWaiting` | `departmentMemberships.by_departmentId_status` (`active`, joined to `memberProfiles.by_userId` for `profileStatus === "verified"`, user ids deduplicated; `pending_claim`) |
| Departments and Clans rows | `photoUrl` | `resolvePhotoUrlForUser`, as `admin.ts` already uses |
| Departments row | `paused` | `PAUSED_DEPARTMENTS` in `@klt-cyber/shared`, by name |
| Clans row | `elder` | the active `roleAssignments` row with `roleType: "clan_elder"` and that `clanId` |
| Clans row | `verifiedMemberCount` | `memberProfiles.by_clanId_profileStatus` (`clanId`, `verified`) |
| `assignRole` clan check | appointee's clan and status | the appointee's `memberProfiles` row (`clanId`, `profileStatus`) |
| Audience visibility | the caller's seats | `getEligibleGroups(ctx, userId).departmentIds` (`convex/lib/groupMembership.ts`, active seats, deduplicated) |
| Push recipients (`serving`, `departments`) | user ids | `departmentMemberships.by_departmentId_status` (`active`) for each qualifying department (every department, paused included, for `serving`), deduplicated, kept only where the profile is `verified` and `users.deletedAt` is unset |
| Push recipients (`church`) | user ids | the existing `all` audience (`resolveAllAudience`: every non deleted account) |
| `updateEvent` | relevant change | `startDateTime`, `endDateTime`, `location` args compared with the stored row |
| `updateEvent` | N16 newcomers, N17 remaining | `pushRecipientIds(new)` minus `pushRecipientIds(old)`, and their intersection |
| `cancelEvent` | N17 body date | `startDateTime` formatted in Africa/Kampala with the shared church time helper |
| Planner group rows | rows | the new shared helper over `groupActivities.by_department_start` (each department) and `by_clan_start` (each clan) |
| `cancelEvent` | `cancelledBy` | the caller from `requireUser` |
| `deliverEventReminder` | `expectedStart` | passed in by the scheduler when the job is created, equal to `startDateTime` at that time |
| Planner group rows | `ownerName` | `departments.name` or `clans.name` by owner id |
| `deleteActivity` log snapshot | fields | the row read just before delete |

### Key invariants

1. `cancelledAt` is never cleared once set.
2. An event's push audience and in app audience come from the same `audience` value. For `serving` and `departments`, push is the verified subset of in app. For `church`, push is the existing `all` set.
3. `departmentIds` never names a paused or missing department at write time. A department paused later keeps its old events, and its seat holders still qualify. `serving` counts seats in every department, paused included.
4. At most one active `clan_elder` per clan, and the holder's verified profile is in that clan at the moment of appointment. A later clan change by the member does not end the role; that stays with feature 23.
5. `listChurchActivity` never returns an action outside the allowlist, and never a `system_admin` role entry.
6. No reminder is delivered for a cancelled, archived, moved or deleted event.

### Security model

- The authority helpers are the existing ones in `convex/lib/authz.ts`. Reads use `getAdministrationAuthorityOrNull`. Writes use `canManageContent` or `canManageChurchAdmin` (Administration HOD, Administration delegate, System Admin).
- Appointing or removing an HOD or a clan elder stays restricted to the System Admin and the Administration HOD, inline in `convex/roles.ts`. The portal hides those buttons from delegates, but the server check is the real guard.
- Contact details reach Administration only, per SRS §3.5. The directory query already returns `null` to everyone else. The CSV is generated in the browser from that query, so it leaks nothing further.
- `getEvent` returns `null` to a user outside the audience, without a distinct error, so a deep link reveals nothing about an event's existence.
- This feature touches personal data (phone, email, address, next of kin). No new store is created. Each consequential write (`content.event_cancelled`, `content.activity_deleted`, role changes) is logged in `activityLogs`.

### Critical test scenarios

- Happy path: create a `departments` event for Media. A verified Media member is pushed N16 and sees it. A non Media member neither is pushed nor sees it. `getEvent` returns `null` for them. Verifies **AC-11**, **AC-12**, **AC-13**
- `serving`: an unverified member with an active seat sees the event but gets no push. A verified member with no seat sees nothing. Verifies **AC-12**, **AC-13**
- Reminder at fire time: someone joins Media after the event is created and gets the day before reminder. A reminder job for an event that was cancelled or moved delivers nothing. Verifies **AC-14**
- Audience change: from `departments [Media]` to `serving`. Newcomers get N16, Media members get no N16, and with no date change no N17 is sent. A title only edit sends nothing. A location edit sends N17. Old reminder jobs are replaced. Verifies **AC-14**, **AC-15**
- Calendar: a caller who is not signed in gets only `church` events from `getCalendarRange`. Verifies **AC-12**
- Cancel: N17 to the audience, reminders cancelled, row still listed and marked. A second cancel, a cancel after the end, an edit after cancel and a cancel of an archived event are refused with their codes. Archiving a cancelled event works. Verifies **AC-17**, **AC-18**, **AC-19**
- Invalid audiences: an empty list, a duplicate, a paused department and an unknown id are each refused. Verifies **AC-11**
- Backfill: every pre existing event becomes `church`, and a re run patches 0. Verifies **AC-11**
- Activity feed: an Administration delegate gets entries, never throws, and never sees a `system_admin` grant. A Media HOD gets `null`. Verifies **AC-1**, **AC-22**
- Elder: the Administration HOD appoints a verified member of Reuben to Reuben. An attempt to appoint a Judah member to Reuben is refused. Replacing an elder sends N15, N13 and N14. Removal leaves the clan vacant. An Administration delegate's attempt is refused. Verifies **AC-8**, **AC-9**, **AC-10**
- Planner: delete logs the snapshot and the row is gone. Group activities appear with owner names and cancelled flags. A Media HOD cannot delete. Verifies **AC-20**, **AC-21**, **AC-22**
- Directory: the projection includes phone, email and mentorship and excludes date of birth. Verifies **AC-3**
- Departments: a department with only delegates shows "No HOD". A paused department is never flagged. Verifies **AC-5**

## Build plan

Tracer Bullet: the first slice runs one thin event audience thread through shared, schema, mutation, mobile read and portal form. The later slices each go end to end too.

1. [x] Shared contracts: `EVENT_AUDIENCE_TYPES`, `eventAudienceSchema`, `EVENT_AUDIENCE_LABELS`, `EVENT_CANCELLATION_REASON_MAX_LENGTH`, `EVENT_ERROR`, `CHURCH_ACTIVITY_ACTIONS`, each with Vitest tests of their shape (the "every action is written" check lives in task 12), satisfies **AC-11**, **AC-17**
2. [x] The audience thread: `events.audience` added **optional**, `convex/lib/eventAudience.ts` (validate, visibility, push audience), `createEvent` taking and validating `audience` and dispatching N16 with `kind` per AC-13, the audience filter in the five member reads (with the new caller check in `getCalendarRange`), the portal `EventDialog` audience picker (radio for the three types, a department multi select showing active departments only), an audience chip in `EventsClient`, satisfies **AC-11**, **AC-12**, **AC-13**
3. [ ] Backfill and tighten: `eventAudienceMigration.backfillEventAudience` (idempotent, one transaction, sized for dozens of events), run it on dev, then make `audience` required and remove the read side `church` fallback in the same change. Each environment runs the backfill before the tightening push (see the Migration plan), satisfies **AC-11**
4. [x] Edit and reminders: `updateEvent` requires `audience`, implements the AC-15 relevant change rule with N16 for newcomers and N17 for the rest (each with `kind`), and the dialog's plain warning; `deliverEventReminder` replaces direct `dispatch` scheduling in `scheduleEventReminders` (`kind: "N18"`), with the staleness guards, and is rescheduled on any audience, start or active change, satisfies **AC-14**, **AC-15**
5. [x] Cancel: `cancelEvent` with its refusals and logging; `updateEvent` refusing a cancelled event; a Cancel action with an optional reason (`AlertDialog` from `components/shadcn/`) on the events table and dialog; cancelled state rendering in the portal (the app already renders it per spec 0010), satisfies **AC-17**, **AC-18**, **AC-19**
6. [x] Shell Activities page: widen the church events read in `departmentActivities.listForDepartment` to `church`, `serving` and including the viewed department, satisfies **AC-16**
7. [x] Dashboard: export the hydration helper from `admin.ts`, add `admin.listChurchActivity`, and switch the card to it (null branch copy updated); extract the `getYearPlannerRange` range logic into a shared helper and build the "This week" card on it, satisfies **AC-1**, **AC-2**, **AC-22**
8. [x] Directory: the projection gains `phone`, `email`, `mentorshipStatus` (replace the comment that says they are deliberately left out with one citing SRS §3.5); the Phone and Email columns, the mentorship filter, the CSV columns, the full contact block in the sheet, satisfies **AC-3**
9. [x] Departments: the sidebar entries; `departments.listForAdministration`; the Departments page through `DataTable` with "No HOD" and "Coming soon" states; Appoint or Replace HOD on the department page for the HOD and the System Admin only, reusing the HOD appoint dialog in `roster/RosterClient.tsx` (extract it into a shared component, don't copy it), satisfies **AC-4**, **AC-5**, **AC-6**
10. [x] Clans: in `roles.ts`, split `clan_elder` out of the System Admin only `else` branch in both `assignRoleCore` and `revokeRoleCore`, allowing the Administration HOD while `system_admin` stays System Admin only; add the `ELDER_NOT_IN_CLAN` check ahead of the identical seat no op; confirm the other callers of both cores (`departmentMemberships.ts`, `groups.ts`) never pass `clan_elder`; map the new error in `AssignRoleSheet`; `clans.listForAdministration` and `clans.listElderCandidates`; the Clans page with Appoint, Replace and Remove (confirmation) for the HOD only, read only for delegates, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-10**
11. [x] Year planner: `deleteActivity` plus a Delete action with confirmation in `ActivityDialog`; the shared group activities helper (departments and clans, overlap rule) used by `getYearPlannerRange` and `listAllForPlanner`; read only rendering in Month, Week and Year views, the hide toggle, and the read only detail popover, satisfies **AC-20**, **AC-21**
12. [x] Convex test suite (`convex/administrationCore.test.ts`) covering the critical test scenarios above, satisfies **AC-1** to **AC-22**

## Migration plan

**Strategy**: widen, backfill, narrow.
**Phases**:
1. Push the schema with `events.audience` optional, plus code that writes it on create and update and treats a missing value as `church` on read (only during this window).
2. `pnpm exec convex run eventAudienceMigration:backfillEventAudience` on each deployment (dev, staging, production). Confirm `patched` equals the count of events without an audience, and that a re run returns 0.
3. Push the schema with `audience` required, and remove the missing value fallback in the same merge.
**Rollback**: phase 1 is additive, so reverting the commit is safe. Phase 3 can be reverted to phase 1's schema at any time. A reverted function bundle ignores the field.
**Risks**: running phase 3 on staging or production before phase 2 makes the schema push fail validation, which is safe (it refuses, it doesn't corrupt) but blocks the deploy. The staging pipeline auto deploys on push to `main`, so phases 1 and 3 must land in separate merges, with the backfill run on staging in between. Ask before running any of this against any deployment.

## Consequences

**Positive**:
- The launch blocker from as built issue I-1 (the dashboard error) is gone.
- Events reach only their audience. Departments can be addressed without a church wide push.
- Clans have a home in the portal, and the Administration HOD can staff them without the System Admin.

**Negative / tradeoffs**:
- A frozen `users` audience means someone who joins a department after an N16 was sent never gets that N16 in their in app notification centre, though they do see the event and get its reminders. This is accepted for simplicity and matches spec 0013's N14.
- The activity allowlist has to be maintained. A new church action stays invisible on the dashboard until someone adds it to `CHURCH_ACTIVITY_ACTIONS`.
- Audience filtering in memory means each member read loads all upcoming events. That is fine at dozens of events, but a known ceiling.
- Phone numbers in the table and CSV widen how easily contact data travels out of the portal. SRS §3.5 allows it for Administration, but a downloaded CSV is outside any audit.
- The existing System Admin `AssignRoleSheet` loses the ability to appoint an elder from outside the clan (it now shows a clear refusal).
- A member who leaves an audience keeps an old N16 or N17 in their centre that opens "not available".

**Neutral**:
- A two step schema migration on dev, staging and production.
- `scheduleEventReminders` switches from direct `dispatch` jobs to `deliverEventReminder`. Jobs already scheduled keep calling `dispatch` with `all`, which is correct while the event stays `church`. The first audience change replaces them (AC-14).
- Church events still push to every account, visitors included. Only the narrower audiences are verified only.

## Follow-up

- [ ] Check A1-01 against the code: whether the dashboard already shows send backs awaiting resubmission and claims waiting across departments (feature 9 may have added them). The mentorship confirmations tile stays with feature 29. If a count is missing, raise it as a small `/develop` task under this feature.
- [ ] `docs/scope/scope.md` row 18's code pointer cites `apps/admin/app/(admin)/admin/`, which no longer exists. The real path is `apps/admin/app/(admin)/areas-of-service/admin/`. `/sync` owns that line.
- [ ] Feature 23 (clan portal): decide whether an elder whose own clan changes keeps the role (invariant 4 leaves it unhandled).
- [ ] Spec 0012 AC-26 wording ("joins this list once feature 18 defines the audience field") becomes true with build task 6. Mark it there when task 6 lands.
