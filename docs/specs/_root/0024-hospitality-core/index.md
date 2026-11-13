# 0024. Hospitality core

**Date**: 2026-11-13
**Status**: In Progress

## Summary

Hospitality gets its own pages on the shared department portal: Visitors, Follow ups, Clan placement and Reports, plus extra Dashboard cards. Walk in visitors and app visitors live in one new `visitors` table, so one list can search, flag first timers and regulars, and track every follow up. Contact happens through the team member's own phone (call, WhatsApp, SMS links pre filled from fixed wordings), because church sent SMS belongs to feature 27. Every verified Hospitality roster member can do all of this, through one new department scoped capability, `manageHospitality`.

## Requirements

**User stories**:
- As a Hospitality team member at the welcome desk, I add a walk in from my phone in under a minute, so nobody leaves unrecorded.
- As a Hospitality team member, I see every visitor (walk in or app) in one list with first timers and regulars flagged, so I know who needs attention.
- As a Hospitality team member, I call, WhatsApp or text a first timer in one tap with a ready message, then record how it went, so follow ups don't depend on memory.
- As a Hospitality team member, I give a follow up to a teammate, and they hear about it.
- As a Hospitality team member, I place verified members who have no clan, seeing which clans are smallest.
- As the Hospitality HOD, I see visitor trends for a date range and save them as a PDF for leadership.
- As a walk in visitor, my phone number is kept only with my consent, and I can withdraw it or ask to be removed.

**Acceptance criteria** (the contract, each independently checkable):

Access
- **AC-1**: `DEPARTMENT_CAPABILITIES` gains `manageHospitality`, and `DEPARTMENT_SCOPED_CAPABILITIES` maps it to `HOSPITALITY_DEPARTMENT_NAME` (`"Hospitality"`, exported from `packages/shared/src/constants/hospitality.ts`). It is held by Hospitality's HOD, its delegates, a System Admin and a verified Hospitality roster member, and by nobody in any other department. `departmentCapabilities(role)` called without a department name returns it as false.
- **AC-2**: Pages exist at `/areas-of-service/[slug]/visitors`, `/visitors/[visitorId]`, `/follow-ups`, `/clan-placement`, `/reports` and `/reports/print`, each gated on `can.manageHospitality`. A caller without it gets a not found page, not an empty one, and these routes are not found on any slug other than Hospitality's (a signed out caller is redirected by the existing middleware). `DepartmentSidebar.tsx` shows Visitors, Follow ups, Clan placement and Reports only when `can.manageHospitality` is true.
- **AC-3**: Every Hospitality mutation calls `requireDepartmentCapability(ctx, hospitalityDepartmentId, "manageHospitality")`. Every Hospitality query returns `null` instead of throwing when the caller lacks it or is signed out. Administration authority, Pastoral leaders and every other department's HOD or delegate are refused. Visitor data is readable only by Hospitality operators and System Admins.

Visitors
- **AC-4**: An operator adds a walk in with `firstName` (required, trimmed, within `PROFILE_NAME_MAX`) and `visitDate` (required). Optional fields are `lastName`, `phone`, `sex` (`SEX`), `ageBracket` (`AGE_BRACKETS`), `invitedByText` (within `VISITOR_INVITED_BY_MAX`), `invitedByUserId` (a verified member) and `notes` (within `VISITOR_NOTES_MAX`). The save creates the `visitors` row (`kind: "walk_in"`), its first `visitorVisits` row and its follow up (AC-15), and writes an `activityLogs` entry with `departmentId`.
- **AC-5**: `visitDate` is a Kampala calendar date `YYYY-MM-DD` that is not after today and not more than `VISIT_BACKDATE_MAX_DAYS` (30) days before it, where today is `kampalaToday()` on the server. Anything else is refused with `HOSPITALITY_VISIT_DATE_INVALID`.
- **AC-6**: A phone is normalised with `normalizeMemberPhone` (a local `07…` becomes `+2567…`). An unparseable phone is refused with `HOSPITALITY_PHONE_INVALID`. A phone sent without `consent: true` is refused by the server with `HOSPITALITY_CONSENT_REQUIRED`, not only blocked in the form. A saved consent records `givenAt` and `givenBy`.
- **AC-7**: Before saving, the form calls `findVisitorsByPhone` (debounced, on the normalised phone, returning `listStatus: "active"` rows only). When an active visitor already has that phone, it offers "Record a visit for <name> instead" in one tap and still allows "Save as a new visitor". The server accepts both.
- **AC-8**: The Better Auth `onCreate` trigger in `convex/auth.ts` schedules `internal.hospitality.ensureAppVisitor` with `ctx.scheduler.runAfter(0, …)`, exactly as it schedules the welcome email, so a fault in Hospitality code can never block a sign up. `ensureAppVisitor` is idempotent (it does nothing when a `visitors` row with that `userId` exists) and inserts `kind: "app"`, `userId`, `visitCount: 0`, no follow up, with `firstName` from `users.firstName`, falling back to the part of `users.email` before the `@`. An internal, idempotent migration `hospitalityMigration.backfillAppVisitors` walks users in batches of 100, rescheduling itself with a cursor, and calls the same logic for every non deleted user whose `role` is `visitor`, also writing `accountPhone` from any existing profile. When the profile edit path changes a name, the user's `visitors` row gets the new names and a rebuilt `searchName`.
- **AC-9**: `listVisitors` returns `listStatus: "active"` rows of both kinds, paginated, newest `lastVisitDate` first, with never visited app rows last. Each row carries: display name, kind, `visitCount`, `firstVisitDate`, `lastVisitDate`, `isFirstTimer` (`visitCount === 1`), `isRegular` (AC-10), follow up status (`open`, `done` or none), and whether contact is allowed (live consent and a phone).
- **AC-10**: A visitor is regular when `lastRegularMonth` (the latest Kampala month in which they had at least `REGULAR_VISITS_PER_MONTH` (3) visits) equals the current or the previous month of the client supplied `today`. `lastRegularMonth` is recomputed in every mutation that adds, deletes or moves a visit. A `today` argument that isn't a valid `YYYY-MM-DD` date is refused with `HOSPITALITY_TODAY_INVALID`.
- **AC-11**: The list supports name search plus these filters, combined with AND: kind; first visit date range; visit count bucket (`1`, `2 to 4`, `5 or more`); sex, with "Not recorded"; age bracket, with "Not recorded"; follow up status (open, done, none); regular (yes or no). Only `listStatus` and `kind` are index or search filter fields. Every other filter runs after the read (regular as `lastRegularMonth` in this month or last month), so a page can come back short, and the list keeps loading the next page automatically while a page is short and more remain. With a search term, results come in search relevance order and the sort is ignored.
- **AC-12**: An operator records a return visit for any active visitor of either kind, under the AC-5 date rule. A second visit for the same visitor on the same date is refused with `HOSPITALITY_VISIT_EXISTS`. A visitor's first ever visit opens their follow up (AC-15). Logged.
- **AC-13**: A visit is deleted by the operator who recorded it, the HOD, a delegate or a System Admin. Any other roster member is refused. Counters and `lastRegularMonth` are recomputed. When the deleted visit was the visitor's only one and their follow up has no contacts yet, the follow up is deleted too; otherwise it stays, and an open follow up's `firstVisitDate` is refreshed to the visitor's new earliest visit. When the recorder's account is gone, only the HOD, a delegate or a System Admin may delete. Logged.
- **AC-14**: The visitor record page shows editable details (walk ins: every AC-4 field. App visitors: `sex`, `ageBracket`, `invitedBy*` and `notes` only, since the name belongs to the account), visits newest first, the follow up with its assignee and status, and the full contact history (`visitorContacts`) newest first, with each contact's channel, outcome, note, operator and time. Any staff reference whose account is gone (contact operator, visit recorder, follow up assignee, inviter) renders as "a former member".

Follow ups
- **AC-15**: A follow up starts when a visitor's `visitCount` goes from 0 to 1. It starts `open` and unassigned, with `firstVisitDate` copied from that visit. When the visitor already has a follow up (their visits were deleted back to 0 and recorded again), that row is reused instead: reopened if `done` (outcome and close fields cleared), with `firstVisitDate` refreshed. A visitor never has more than one follow up row, except after a join (AC-28).
- **AC-16**: The Follow ups page has Open and Done tabs. Open is sorted by `firstVisitDate` ascending (longest waiting first), with an "Unassigned" badge and a "Mine" filter (assigned to the caller). Done is sorted by `closedAt` descending. Both are paginated.
- **AC-17**: One tap buttons are Call (`tel:`), WhatsApp (`https://wa.me/<digits>?text=`) and SMS (`sms:<phone>?body=`). They show only when the visitor has a phone and live consent, and they are pre filled from `HOSPITALITY_MESSAGE_TEMPLATES` in `packages/shared` (`first_visit_thanks`, `follow_up`, `app_invite`), with `{firstName}`, `{visitDate}` and `{appLink}` filled in by `fillHospitalityTemplate` (`app_invite` uses only `{firstName}` and `{appLink}`). The server never sends anything for these channels.
- **AC-18**: After any one tap action, and also on demand, the operator records a contact: channel (`call`, `whatsapp`, `sms`, `in_person`), outcome (`reached`, `no_answer`, `wrong_number`, `do_not_contact`) and an optional note (within `CONTACT_NOTE_MAX`). On an open follow up: `reached` closes it as `reached`. `no_answer` keeps it open and adds to its attempt count. `wrong_number` closes it as `wrong_number` and clears the phone and consent. `do_not_contact` closes it as `do_not_contact` and withdraws consent (AC-23). A contact can also be logged with no follow up (for example a regular, or after the follow up closed): the client leaves out `followUpId`, and the mutation never infers one. `wrong_number` and `do_not_contact` clear the phone and consent whether or not a follow up is attached. An `in_person` contact needs no phone. Recording against a closed follow up is refused with `HOSPITALITY_FOLLOW_UP_CLOSED`.
- **AC-19**: An operator closes an open follow up by hand with a required note. It closes with outcome `closed`. Logged.
- **AC-20**: Any operator assigns or reassigns an open follow up to a Hospitality operator: an active Hospitality `hod` or `department_admin`, a System Admin, or a user with an `active` Hospitality `departmentMemberships` row and a `verified` profile, never a deleted user. Assigning to anyone else is refused with `HOSPITALITY_ASSIGNEE_INVALID`. An assignee who stops being an operator keeps their open follow ups, shown as "former operator", and anyone may reassign them. The assignee gets N36 (push and in app, the web bell once feature 28 lands), unless they assigned it to themselves. Logged.
- **AC-21**: An operator sends an in app message (H2-05, N41) to between 1 and `IN_APP_MESSAGE_MAX_RECIPIENTS` (50) selected app visitors (rows with a `userId` whose user is not deleted), with a body within `IN_APP_MESSAGE_MAX`. It goes through `notifications.dispatch` with `audience: { type: "users" }` and `kind: "N41"`, and one `visitorContacts` row (`channel: "in_app"`) is written per recipient. It is all or nothing: if any selected row is not an active or member app row with a live user, the whole send is refused with `HOSPITALITY_RECIPIENT_INVALID`. The dispatch is scheduled with `runAfter(0, …)`, so a push failure never undoes the logged contacts. An in app message never changes a follow up's `attemptCount`.

Consent and removal
- **AC-22**: Invariant: a `visitors.phone` exists only while `consent` is live (given and not withdrawn). Every writer keeps this true.
- **AC-23**: An operator withdraws consent on request. That sets `consent.withdrawnAt`, `withdrawnBy` and clears `phone`, which hides the call, WhatsApp and SMS buttons and makes the visitor ineligible for any SMS (feature 27 included). Logged.
- **AC-24**: A phone is set or changed only through `setConsent`; `updateVisitor` refuses a `phone` field. A first ever consent needs no note. Consent given again after a withdrawal needs consent ticked and a required note (`HOSPITALITY_NOTE_REQUIRED`). Changing the phone while consent is live keeps the consent, needs no note, and is logged. Every event stays visible in the history.
- **AC-25**: Any operator removes a walk in with no `userId`, after a typed confirmation. The row is anonymised: names become `REMOVED_VISITOR_LABEL`, and `phone`, `notes`, `invitedBy*`, `sex`, `ageBracket`, `consent` and `searchName` are cleared. `listStatus` becomes `removed`, any open follow up closes as `closed`, and every contact note on the record is cleared. The visit dates stay, so report totals remain true. The audit entry carries no personal data. A row with a `userId` is refused with `HOSPITALITY_REMOVE_ACCOUNT_ROW`, because an account leaves through account deletion.
- **AC-26**: `accountDeletion.performDeletion` applies the same anonymisation to the leaving user's `visitors` row and clears `userId` on it, in the same transaction.

Joining a walk in to an account
- **AC-27**: On a walk in's record, the join panel suggests app rows whose `accountPhone` equals the walk in's `phone` (index `by_accountPhone`), and always offers a manual search of app rows by name or email.
- **AC-28**: Confirming a join keeps the walk in row and sets its `userId`. The app row becomes `listStatus: "merged"` with `mergedIntoId`, and its `userId` and `accountPhone` move to the surviving row. Visits are repointed, and a same date duplicate is dropped. Contacts and follow ups are repointed. When both rows have an open follow up, the older one stays open and the newer one closes as `closed` with the note "merged". Counters are recomputed. The survivor keeps the walk in's names, phone, consent, notes, `invitedBy*` and `createdBy`, keeps `kind: "walk_in"`, and gets `searchName` rebuilt to include the account email. The survivor's `listStatus` is `member` if the user's `role` is `member`, else `active`. A join is refused when the walk in already has a `userId`, when the app row is not `active` or `member`, or when more than `JOIN_MAX_ROWS` (500) rows would move (`HOSPITALITY_JOIN_TOO_LARGE`). Logged with both ids.

Toward membership
- **AC-29**: The Visitors page has a Regulars filter and a regular badge (H4-01). A walk in with no `userId` shows a "Send app link" button (WhatsApp or SMS, `app_invite` template) when contact is allowed (H1-02, H4-02).
- **AC-30**: A "Not yet a member" view lists active rows that have a `userId` (app rows and joined walk ins alike) whose user has no `memberProfiles` row of any status, oldest `createdAt` first, paginated (H4-03). Users who have submitted a profile (pending or sent back) are not in this view.
- **AC-31**: When Administration verifies a profile (the path in `convex/memberProfiles.ts` that sets `users.role` to `member`), the same mutation sets that user's `visitors` row to `listStatus: "member"`, so they leave the Visitors list. `submitProfile` and the profile edit path write the normalised profile phone into `visitors.accountPhone`.

Clan placement
- **AC-32**: The Clan placement queue lists verified profiles with no `clanId`, oldest `verifiedAt` first, paginated, read through a new `memberProfiles` index `by_profileStatus_verifiedAt` (`["profileStatus","verifiedAt"]`) with rows that have a `clanId` filtered out after the read (pages may come back short, handled as in AC-11). A verified profile with no `verifiedAt` (legacy) sorts first.
- **AC-33**: Clan sizes show every clan's verified member count. The `SMALLEST_CLANS_HIGHLIGHTED` (3) lowest counts are highlighted, ties included.
- **AC-34**: `assignClan` patches `memberProfiles.clanId` only when the profile is verified and `clanId` is still absent. Otherwise it is refused with `HOSPITALITY_CLAN_ALREADY_SET` or `HOSPITALITY_PROFILE_NOT_VERIFIED`. It logs `hospitality.clan_assigned` with `departmentId`, and dispatches N37 to the member (push, in app) and to every active `clan_elder` of that clan (push, in app, web bell once feature 28 lands). Hospitality never changes a `clanId` that is already set.

Dashboard and reports
- **AC-35**: _Replaced by [spec 0025](../0025-hospitality-dashboard/index.md): Hospitality now has its own Dashboard, and these cards (built under the shared Dashboard, since its `extras` slot had been removed by spec 0017) are removed by 0025 AC-4. The original text is kept for the record._ When `can.manageHospitality`, the shared Dashboard's `extras` slot renders: visitors this month (distinct visitors with a visit in the current Kampala month), new this week (visitors whose `firstVisitDate` falls in the current Sunday start Kampala week), returning visitors this month (visited this month, first visit before it), regulars now, open follow ups (with unassigned count), members waiting for a clan, and the three smallest clans. Each card has an explicit empty state, and a failed query shows `ErrorState` with retry. There is no SMS credit card until feature 27.
- **AC-36**: Reports take a date range (default the last 3 months, maximum `REPORT_MAX_RANGE_DAYS` (731)). Bins are weekly (Sunday start) when the range is at most `WEEKLY_BIN_MAX_DAYS` (92) days, else monthly. They show: distinct visitors per bin; first timers (first visit inside the bin) against returning visitors (first visit before the bin) per bin; visitors regular in any calendar month of the range, computed from per month counts of the visit rows in range (not from `lastRegularMonth`); follow ups opened in the range and, of those, how many are done, as a cohort completion percentage that can never pass 100%; and contacts by channel, `in_app` included (the SMS count is phone app SMS logged by operators until feature 27). Charts use the portal's existing `recharts`.
- **AC-37**: "Download PDF" opens `/reports/print` with the same range. It is a print styled page (Kingdom Radiant tokens, church name, report title, range and generated time printed) that calls `window.print()`, so the user saves it as PDF through the browser. No PDF library is added.

Quality
- **AC-38**: Every Hospitality page works at 375 pixels wide: tables become stacked cards, the add walk in form is one column, and nothing scrolls sideways (NF-08).
- **AC-39**: `packages/shared` holds the Hospitality constants, error codes, Zod schemas, `fillHospitalityTemplate`, `regularMonthFrom`, `isRegularOn`, `visitCountBucket`, `reportBins` and `kampalaWeekStart`, each with Vitest tests. Convex tests cover the authority matrix, the consent invariant, visit uniqueness and the backdate window, follow up opening and closing, the join, clan assignment refusal and the N37 recipients.

## Decision

**Chosen option**: Option 1: one `visitors` table for both kinds, hosted on the shared `[slug]` shell behind a new scoped capability `manageHospitality`.

Store every visitor (walk in or app) as one row, with visits, follow ups and contacts pointing at it. Create app rows from the sign up trigger plus a backfill. Put the four pages on the existing `[slug]` department shell, exactly as Library and Real Estate did.

**Implementation skills**: `convex` (`.claude/skills/convex/`) for schema, indexes, migrations and tests · `shadcn` (`.claude/skills/shadcn/`) for portal components

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (all additive; new tables plus one new field each on nothing existing except the writes listed):

| Table | Field | Type | Notes |
|---|---|---|---|
| `visitors` | `kind` | `"walk_in" \| "app"` | origin, never changes |
| | `userId` | `Id<"users">?` | set for app rows and for joined walk ins. At most one non merged, non removed row per user |
| | `firstName`, `lastName?` | string | app rows copy from `users` at creation |
| | `searchName` | string | folded `firstName lastName`, plus the email for app rows, for the search index |
| | `phone` | string? | E.164. Present only with live consent (AC-22) |
| | `accountPhone` | string? | E.164 copy of the account's profile phone, for join suggestions only. Never used for contact |
| | `sex`, `ageBracket` | `Sex?`, `AgeBracket?` | shared enums |
| | `invitedByText`, `invitedByUserId` | string?, `Id<"users">?` | |
| | `notes` | string? | |
| | `consent` | `{ givenAt, givenBy, note?, withdrawnAt?, withdrawnBy? }?` | |
| | `visitCount` | number | maintained by the visit writers |
| | `firstVisitDate`, `lastVisitDate` | string? `YYYY-MM-DD` | |
| | `lastRegularMonth` | string? `YYYY-MM` | |
| | `listStatus` | `"active" \| "member" \| "merged" \| "removed"` | |
| | `mergedIntoId` | `Id<"visitors">?` | |
| | `createdBy` | `Id<"users">?` | absent for app rows |
| | `createdAt`, `updatedAt` | number | |
| `visitorVisits` | `visitorId`, `visitDate`, `recordedBy`, `recordedAt` | | one per visitor per date |
| `followUps` | `visitorId`, `firstVisitDate`, `status: "open" \| "done"`, `outcome?: "reached" \| "wrong_number" \| "do_not_contact" \| "closed"`, `attemptCount`, `assignedTo?`, `assignedBy?`, `assignedAt?`, `openedAt`, `closedAt?`, `closedBy?`, `closeNote?` | | |
| `visitorContacts` | `visitorId`, `followUpId?`, `channel: "call" \| "whatsapp" \| "sms" \| "in_person" \| "in_app"`, `outcome?: "reached" \| "no_answer" \| "wrong_number" \| "do_not_contact"`, `note?`, `byUserId`, `at` | | `outcome` absent for `in_app` |

Indexes:
- `visitors`: `by_userId` `["userId"]`, `by_phone` `["phone"]`, `by_accountPhone` `["accountPhone"]`, `by_listStatus_lastVisitDate` `["listStatus","lastVisitDate"]`, `by_listStatus_firstVisitDate` `["listStatus","firstVisitDate"]`, `by_kind_listStatus` `["kind","listStatus"]`, search index `search_name` on `searchName` with filter fields `listStatus` and `kind`.
- `visitorVisits`: `by_visitorId_visitDate`, `by_visitDate`.
- `followUps`: `by_visitorId`, `by_status_firstVisitDate`, `by_assignedTo_status_firstVisitDate`, `by_openedAt`, `by_status_closedAt`.
- `visitorContacts`: `by_visitorId_at`, `by_followUpId`, `by_at`.

Existing tables: `memberProfiles` gains the index `by_profileStatus_verifiedAt` (additive), and its `clanId` is patched by `assignClan`. `activityLogs` rows carry `departmentId` (Hospitality's).

**State transitions**

```
visitors.listStatus:
  (sign up | add walk in) ──► active
  active ──profile verified (AC-31)──► member
  active | member ──is the app side of a join──► merged     (terminal)
  active (walk in, no userId) ──removed on request──► removed (terminal)
  any ──account deleted──► removed (terminal)

followUps.status:
  (visitCount 0 → 1) ──► open
  open ──contact no_answer──► open (attemptCount + 1)
  open ──reached | wrong_number | do_not_contact──► done(outcome)
  open ──closed by hand | merged | visitor removed──► done(closed)

consent: none ──tick with phone──► live ──withdraw | do_not_contact | wrong_number──► withdrawn ──re-tick with note──► live
```

**API surface** (Convex; "operator" means a caller holding `manageHospitality`. File `convex/hospitality.ts`, with helpers in `convex/lib/hospitality.ts`):

| Function | Type | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `addWalkIn` | mutation | `firstName`, `visitDate`, optional fields, `consent?: boolean` | `{ visitorId }` | operator | `VISIT_DATE_INVALID`, `PHONE_INVALID`, `CONSENT_REQUIRED` |
| `findVisitorsByPhone` | query | `phone` | active visitors with that phone | operator | `null` without access |
| `listVisitors` | query | `paginationOpts`, `today`, `search?`, filters | rows per AC-9 | operator | `null` without access |
| `listNotYetMembers` | query | `paginationOpts` | app rows without a profile | operator | `null` |
| `getVisitor` | query | `visitorId` | details, visits, follow up, contacts | operator | `null` |
| `updateVisitor` | mutation | `visitorId`, changed fields | `{ ok, changed }` | operator | per field caps, app row name edit refused |
| `recordVisit` | mutation | `visitorId`, `visitDate` | `{ visitId, openedFollowUp }` | operator | `VISIT_EXISTS`, `VISIT_DATE_INVALID`, not active |
| `deleteVisit` | mutation | `visitId` | `{ ok }` | recorder, HOD, delegate, System Admin | `NOT_ALLOWED` |
| `setConsent` | mutation | `visitorId`, `phone`, `note` | `{ ok }` | operator | `NOTE_REQUIRED` when consent was given before |
| `withdrawConsent` | mutation | `visitorId` | `{ ok }` | operator | none live |
| `removeWalkIn` | mutation | `visitorId`, `confirm: "REMOVE"` | `{ ok }` | operator | `REMOVE_ACCOUNT_ROW` |
| `listJoinCandidates` | query | `visitorId`, `search?` | phone matches plus search hits | operator | `null` |
| `joinWalkInToAccount` | mutation | `walkInId`, `appVisitorId` | `{ visitorId }` | operator | already joined, not joinable, `JOIN_TOO_LARGE` |
| `listFollowUps` | query | `paginationOpts`, `tab`, `mine?` | rows with visitor, assignee, attempts | operator | `null` |
| `assignFollowUp` | mutation | `followUpId`, `assigneeUserId` | `{ ok }` | operator | `ASSIGNEE_INVALID`, closed |
| `listAssignableOperators` | query | none | HOD, delegates, verified roster | operator | `null` |
| `recordContact` | mutation | `visitorId`, `followUpId?`, `channel`, `outcome`, `note?` | `{ contactId, followUpStatus }` | operator | `FOLLOW_UP_CLOSED` |
| `closeFollowUp` | mutation | `followUpId`, `note` | `{ ok }` | operator | note required |
| `sendInAppMessage` | mutation | `visitorIds[]`, `body` | `{ sent }` | operator | recipient count, body cap, not an app visitor |
| `listClanQueue` | query | `paginationOpts` | verified profiles without clan | operator | `null` |
| `getClanSizes` | query | none | clans with verified counts, `highlighted` flag | operator | `null` |
| `assignClan` | mutation | `profileId`, `clanId` | `{ ok }` | operator | `CLAN_ALREADY_SET`, `PROFILE_NOT_VERIFIED` |
| `getDashboardExtras` | query | `today` | AC-35 numbers | operator | `null` |
| `getReport` | query | `from`, `to` | AC-36 series | operator | range invalid or too long |
| `ensureAppVisitor` | internal mutation | `userId` | `{ visitorId }` | internal (scheduled from `onCreate`) | none, idempotent |
| `hospitalityMigration.backfillAppVisitors` | internal mutation | `cursor?` | reschedules itself until done, 100 users per batch | internal | none, idempotent |

Error codes are exported as `HOSPITALITY_*` from `packages/shared/src/constants/hospitality.ts`.

**Value sourcing**

| Action | Value | Source |
|---|---|---|
| any function | Hospitality's department id | `departments` `by_name` with `HOSPITALITY_DEPARTMENT_NAME`, via a `getHospitalityDepartmentId` helper |
| any function | caller's role (for `deleteVisit`) | the `role` that `requireDepartmentCapability` returns, plus the visit's `recordedBy` |
| `addWalkIn`, `recordVisit` | today, for the date window | `kampalaToday()` from `packages/shared/src/constants/weeklyPrograms.ts`, server side (writes may read the clock) |
| `listVisitors`, `getDashboardExtras` | the current and previous month, this week | the `today` argument the client sends (`kampalaToday()` in the browser), so live queries stay deterministic (spec 0012 convention) |
| list row | `isRegular` | `isRegularOn(lastRegularMonth, today)` |
| visit writers | `lastRegularMonth` | `regularMonthFrom(visitDates)` over the visitor's `by_visitorId_visitDate` rows |
| app row | names, email in `searchName` | `users.firstName`, `lastName` and `email` at creation and at join; `firstName` falls back to the email before the `@`; refreshed by the profile edit path when names change |
| `accountPhone` | normalised profile phone | `normalizeMemberPhone(memberProfiles.phone)` in `submitProfile` and the profile edit mutation, plus the backfill |
| list row | follow up status | `followUps` `by_visitorId`, latest row |
| list row | contact allowed | `phone` present (which by AC-22 implies live consent) |
| templates | wording | `HOSPITALITY_MESSAGE_TEMPLATES` in shared |
| templates | `{appLink}` | `process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL` in the portal. When unset, the app link buttons are disabled with "App link not set up yet" |
| templates | `{visitDate}` | the visitor's `lastVisitDate` (`firstVisitDate` for `first_visit_thanks`), formatted `d MMMM` |
| WhatsApp link | digits | `whatsAppDigits(phone)` from `packages/shared/src/constants/library.ts` |
| `assignFollowUp` | allowed assignees | active `hod` and `department_admin` `roleAssignments` for Hospitality, plus active `departmentMemberships` whose profile is verified |
| N36, N37, N41 | recipients | the assignee's id; the member's id plus active `clan_elder` `roleAssignments` `by_clanId`; the selected rows' `userId` |
| N37 | clan name in the body | `clans.name` |
| clan queue | order | `memberProfiles` `by_profileStatus_verifiedAt` ascending, `clanId` absent filtered after the read |
| clan sizes | counts | `memberProfiles` `by_clanId_profileStatus` with `verified`, per clan from `clans` `by_order` |
| "Not yet a member" | no profile | `memberProfiles` `by_userId` returns nothing |
| reports | bins | `reportBins(from, to)` using `kampalaWeekStart` (Sunday) and calendar months |
| reports | visits in range | `visitorVisits` `by_visitDate` between `from` and `to` |
| reports | follow up numbers | `followUps` `by_openedAt` in range, done counted by `closedAt` in range |
| print page | church name, generated time | the existing church name constant used by the portal header; `new Date()` in the browser, formatted in Kampala time |
| former operator label | name when the account is gone | "a former member", the spec 0012 rule |

**Key invariants**
- `phone` implies live consent (AC-22).
- At most one visit per visitor per date.
- At most one open follow up per visitor.
- At most one `visitors` row with a given `userId` whose `listStatus` is `active` or `member`.
- `visitCount`, `firstVisitDate`, `lastVisitDate` and `lastRegularMonth` always equal what the visitor's visit rows say. Every visit writer recomputes them in the same mutation.
- Hospitality only ever writes a `clanId` that was absent.
- `accountPhone` is never used to contact anyone.
- Every consequential mutation writes `activityLogs` with Hospitality's `departmentId`, and removal entries carry no personal data.

**Security model**
- Read and write: operators (Hospitality HOD, delegates, verified roster, System Admin) only, through `manageHospitality`. Nobody else, Administration and Pastoral included.
- The one finer rule: `deleteVisit` for a roster member is limited to visits they recorded.
- Personal data: walk in phone numbers are kept only with consent (Uganda Data Protection and Privacy Act, 2019, NF-04). Removal and account deletion anonymise. Every consent change is audit logged.
- The app visitor's own account data (name, email) is shown only to operators. `accountPhone` never appears in the interface.
- No public endpoint is added.

**Configuration required**
- `NEXT_PUBLIC_APP_DOWNLOAD_URL`: the link the app invite templates send, set per Cloudflare environment (staging: the preview APK page; production: the store or landing page at launch).

**Critical test scenarios**
- Happy path: a roster member adds a consenting walk in, sees them flagged first timer, calls them, records `reached`, and the follow up moves to Done, verifies **AC-4**, **AC-9**, **AC-15**, **AC-17**, **AC-18**.
- Consent: `addWalkIn` with a phone and `consent: false` sent directly is refused; `do_not_contact` clears the phone and hides the buttons, verifies **AC-6**, **AC-18**, **AC-22**, **AC-23**.
- Dates: a visit 31 days back, or tomorrow, is refused; the same date twice is refused, verifies **AC-5**, **AC-12**.
- Regular: three visits in October make a visitor regular through November with today in November, and not in December, verifies **AC-10**.
- Delete visit: deleting the only visit of an untouched follow up removes both; with a contact logged the follow up stays; a different roster member is refused, verifies **AC-13**.
- Join: a walk in with two visits joins an app row with one visit on the same date, ending with two visits, one open follow up and the app row merged, verifies **AC-28**.
- Clan: assigning a profile whose clan was set a moment ago is refused; a successful assign notifies the member and the clan elder, verifies **AC-34**.
- Sign up and backfill: a new sign up creates exactly one app row; running the backfill twice creates no duplicates, verifies **AC-8**.
- Verification: verifying an app visitor's profile sets their row to `member` and removes it from the list, verifies **AC-31**.
- Auth: a Finance HOD, an Administration authority holder and an unverified Hospitality roster member each get `null` from `listVisitors` and are refused by `addWalkIn`, verifies **AC-1**, **AC-3**.
- Removal and deletion: a removed walk in keeps its visit dates in the report counts and shows no name anywhere; account deletion anonymises the app row, verifies **AC-25**, **AC-26**, **AC-36**.
- Phone layout: each page at 375 pixels shows stacked cards with no sideways scroll, verifies **AC-38**.

## Build plan

Tracer Bullet: one thin thread through schema, server, gate and page first, then one capability at a time, end to end. The four new tables land together in slice 1 because they're additive and small. The sign up hook and the backfill land together so no app visitor is ever missing a row.

**Deploy ordering**: the backfill (slice 2) runs after its schema is live on each deployment. Running it on staging and production needs your confirmation (AGENTS.md working rules).

1. Shared contract and the thin thread: `packages/shared/src/constants/hospitality.ts` (name, caps, error codes, templates, helpers) and `schemas/hospitality.ts` with Vitest tests; the four tables and their indexes in `convex/schema.ts`; `manageHospitality` in `authz.ts`; the sidebar entries; `addWalkIn` and `listVisitors` (no filters yet); the Visitors page with the add walk in sheet, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-22**, **AC-39** (shared part).
2. App visitors: `ensureAppVisitor` scheduled from `onCreate`, `backfillAppVisitors`, the name refresh on profile edit, the verification flip to `member`, `accountPhone` writes in `submitProfile` and profile edit, and the `performDeletion` anonymisation, satisfies **AC-8**, **AC-26**, **AC-31**.
3. Visits end to end: `recordVisit`, `deleteVisit`, counter and `lastRegularMonth` recompute, first timer and regular flags, the duplicate phone check, satisfies **AC-7**, **AC-10**, **AC-12**, **AC-13**.
4. Search and filters on the Visitors list, satisfies **AC-9**, **AC-11**.
5. Visitor record: `getVisitor`, `updateVisitor`, consent withdraw and re-consent, `removeWalkIn`, satisfies **AC-14**, **AC-23**, **AC-24**, **AC-25**.
6. Follow ups end to end: opening on first visit, the list with tabs and Mine, assignment with N36, `recordContact`, `closeFollowUp`, the one tap buttons with templates and the app link env var, satisfies **AC-15**, **AC-16**, **AC-17**, **AC-18**, **AC-19**, **AC-20**.
7. In app message (N41), satisfies **AC-21**.
8. Join a walk in to an account, satisfies **AC-27**, **AC-28**.
9. Toward membership: regular filter and badge, Send app link, the Not yet a member view, satisfies **AC-29**, **AC-30**.
10. Clan placement: the `by_profileStatus_verifiedAt` index, queue, sizes, `assignClan` with N37, satisfies **AC-32**, **AC-33**, **AC-34**.
11. Dashboard extras, satisfies **AC-35**.
12. Reports and the print page, satisfies **AC-36**, **AC-37**.
13. Responsive pass at 375 pixels and the Convex test suite, satisfies **AC-38**, **AC-39**.

## Consequences

**Positive**:
- Hospitality is usable on launch day with no provider, sender ID or credit: every channel runs through the operator's own phone.
- One table means one list, one search index and one join model. Feature 27 adds SMS on top of the same `visitors`, `phone` and consent fields without reshaping anything.
- The fourth scoped capability reuses the Library and Real Estate pattern with no new machinery.

**Negative / tradeoffs**:
- Sign up now schedules a second write. Because it's scheduled, a bug can't block sign up, but it can leave a user without a visitor row for a moment (or until the backfill runs again), so slice 2 tests both the sign up and the idempotent retry.
- Counters on `visitors` are stored derived values. They're needed for indexed sorting and filtering, but every visit writer must recompute them, and a missed writer causes silent drift.
- Phone app contacts are self reported. SMS counts in reports are only as good as operators' logging until feature 27.
- Withdrawing consent clears the phone, so a later join suggestion by phone is lost for that person (manual search still works).
- Several filters (visit bucket, sex, age, follow up status) run as paginated filters over an index, so a page can come back short. That's fine at church scale, but worth revisiting if the list grows into the tens of thousands.
- Members verified before this ships have no `visitors` row, so a walk in who has already become a member can't be joined. Only visitors are backfilled.
- The print to PDF output depends on the browser's print dialog, so it looks slightly different across browsers.

**Neutral**:
- `users.role` becomes `member` at verification (`convex/memberProfiles.ts`), not at wizard submission as root `AGENTS.md` says. This spec follows the code.
- H5-01 ("I don't know my clan") is already built in `apps/mobile/app/profile-completion/clan.tsx`. No mobile change and no OTA.
- H3 (church SMS, templates editable by the HOD, credit, delivery) stays in feature 27.

## Follow-up

- [ ] Root `AGENTS.md` says completing the member profile wizard promotes a visitor to member; the code promotes at verification. `/sync` should correct the line, or flag it to the SRS owner if the SRS intends otherwise.
- [ ] Feature 27 must keep the AC-22 consent invariant, make `HOSPITALITY_MESSAGE_TEMPLATES` editable by the HOD (H3-02), and show church SMS in the AC-14 contact history.
- [ ] Feature 28 completes the web bell channel for N36 and the elder's N37.
- [ ] Feature 32 (Radio Insights PDF) should reuse the AC-37 print page pattern so both reports match (H6-02 "same style").
- [ ] Set `NEXT_PUBLIC_APP_DOWNLOAD_URL` on staging and production Cloudflare builds before slice 6 ships.
- [ ] Spec 0008 (account deletion) gains the `visitors` anonymisation in slice 2. Cross reference this spec from it.
