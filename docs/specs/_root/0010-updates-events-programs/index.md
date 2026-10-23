# 0010. Updates, Events and Programs: group news and one upcoming list

**Date**: 2026-10-23
**Status**: In Progress

## Summary

Members get two finished screens. On Updates, every announcement shows its category, and a new "My groups" section carries the messages addressed to the member's own departments and clan, grouped under each group's name. On Events and Programs, church events and the member's group activities become one list in date order, each row tagged with who it belongs to, cancelled items marked rather than hidden, and one tap puts an item in the phone's own calendar.

Almost none of that content has an author yet: department messages and activities arrive with feature 17, clan messages with feature 23, the event cancel action with feature 18. So this spec deliberately owns the shared shape (two new tables, a clan notification audience, cancellation fields on events, two deep link types and every member facing read query) and those later features write against it. Sample rows seeded in dev and staging only, never production, make the reader provable now.

In plain terms: this builds the reading side of group news properly, once, so three later features do not each invent their own.

## Requirements

**User stories**:
- As a member, I want messages from my departments and clan in one place in the app, so that I still find them after the notification is cleared.
- As a member, I want to see which category an announcement belongs to, so that I can tell a finance notice from a youth one at a glance.
- As a member, I want church events and my groups' activities in one dated list, each tagged, so that I can see everything coming up without checking two places.
- As a member, I want an event's full detail including when it ends and where it is, with cancelled ones clearly marked, so that I do not travel to something that is not happening.
- As a member, I want to put an event or activity into my phone's calendar in one tap, so that I am reminded by the thing I already live by.

**Acceptance criteria** (the contract):

- **AC-1**: An announcement that carries a category shows it on the Updates list and on announcement detail, drawn from a fixed set exported by `@klt-cyber/shared`. A row with no category shows no chip at all, since `category` is optional today and stays optional. A row holding a value outside the set renders as a plain neutral chip rather than breaking the screen. (M3-02, A6-03)
- **AC-2**: The Updates tab shows a "My groups" section below announcements, holding the messages addressed to the caller's groups from the last `GROUP_MESSAGE_WINDOW_DAYS` days, grouped under each group's name, newest first within each group. The whole section does not render when the caller has no eligible groups or no messages in the window. (M3-03, M2-08)
- **AC-3**: A department's messages and activities are readable by any caller holding a `departmentMemberships` row with `status: "active"` for that department, whatever their own profile status. A clan's messages and activities are readable only by a caller whose `memberProfiles.profileStatus` is `"verified"` and whose `clanId` is that clan. (M3-03, F4-16)
- **AC-4**: A message whose `deletedAt` is set never appears in My groups. A message from a department the caller has left stops appearing immediately, because eligibility is evaluated at read time against live membership and nothing is copied per recipient. (M3-03, S5-03)
- **AC-5**: The Events and Programs screen shows one merged list of active church events and the caller's group activities, in `startDateTime` order, each row tagged `Church` for an event or with the owning department's or clan's name, resolved server side. The window opens at midnight today in Kampala and closes `UPCOMING_HORIZON_DAYS` later, and a row leaves it once its `endDateTime` has passed, so something that started an hour ago and is still running stays listed. Ties on `startDateTime` break events before activities and then by `_creationTime`, so the order is stable and a `limit` always cuts the same way. (M4-01)
- **AC-6**: A cancelled event or activity keeps its place in that list, marked cancelled in crimson with its reason when one was given, and leaves it on the same boundary as everything else, once its `endDateTime` has passed. An archived event (`active: false`) stays hidden, which is a different thing from cancelled. (M4-02)
- **AC-7**: One shared detail screen serves both an event and an activity, showing title, date, start and end time, location, description, image and the cancelled mark with its reason. (M4-02)
- **AC-8**: Below the merged list the screen shows a compact this week's programs strip that opens the existing programs screen, and keeps the past events section spec 0005 owns at the bottom. Neither is re-decided here.
- **AC-9**: From that detail screen one tap writes the item into the phone's calendar through `expo-calendar`, after the system permission prompt. The button then reads as added, and tapping again does not create a second entry, because the created entry id is remembered on the device. (M4-04)
- **AC-10**: When calendar permission is refused, the member sees a short plain explanation and a way to open system settings. Nothing is written, and the button stays usable so a later grant works.
- **AC-11**: `groupActivities` and `groupMessages` exist with the shape in Feature design, each owned by exactly one department or one clan, and `notificationAudienceValidator` gains a `clan` variant **together with a matching case in `resolveAudience`** (`convex/notifications.ts`), which ends in an exhaustive `never` check and will not compile without one. `resolveClanAudience` returns verified clan members only, so N27's push rule is unchanged. No authoring interface is built here; features 17 and 23 write against this contract.
- **AC-12**: `events` gains `cancelledAt`, `cancelledBy` and `cancellationReason`, kept separate from `active`. Feature 18 writes them; this spec only reads them.
- **AC-13**: The deep link types `activity` and `groupMessage` resolve in `apps/mobile/lib/notification-links.ts`, the first to the shared detail screen and the second to the Updates tab.
- **AC-14**: `contentSeed:seedGroupSamples` seeds sample group activities and messages, plus the department roster and clan rows the test accounts need, in dev and staging only and never in production, behind the existing `assertSampleSeedAllowed` guard and the explicit `allowSampleData: true` argument every other sample seed already requires. Its rows are dated relative to now, and include a cancelled activity, one beyond the horizon, a message older than the window and an event carrying cancellation fields, so AC-2, AC-3, AC-5 and AC-6 are all provable before any authoring ships. (F5-03)
- **AC-15**: Every read path added here exposes group and cancellation state, and none of them lets a member change it. The only mutations this spec touches are the two existing announcement ones, and only to validate `category`. Push audiences are untouched: F4-17, N24, N27 and S5-01 keep their verified only rule.
- **AC-16**: The portal's announcement form offers the category as a select over the same shared set instead of today's free text box, and `createAnnouncement` and `updateAnnouncement` reject a present value outside the set while still accepting no category at all. An existing row holding an off set value keeps rendering in the app, and re-saving that announcement in the portal requires picking from the set. (A6-01, A6-03)

## Decision

**Chosen option**: Option 1: reader plus the shared data contract.

This spec owns the member facing data shape and every read query for group activities and group messages, plus all four mobile surfaces, and features 17, 18 and 23 build their authoring against that contract.

**Implementation skills**: `convex` (`convex/agent-skills`, `.claude/skills/convex/`) · `convex-reviewer` (`convex/agent-skills`, `.claude/skills/convex-reviewer/`) · `mobile-frontend-design` (`~/.claude/skills/mobile-frontend-design/`)

## Rationale

Reasoning, options and the code reading behind them: see [rationale.md](./rationale.md).

## Feature design

### Data model

Two new tables, three new fields on `events`, one new audience variant. All additive.

**`groupActivities`**, one dated activity belonging to exactly one department or one clan.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | `v.string()` | yes | capped at `ACTIVITY_TITLE_MAX_LENGTH` (120) |
| `description` | `v.optional(v.string())` | no | capped at 2000 |
| `startDateTime` | `v.number()` | yes | unix ms instant, directly comparable with `events.startDateTime` |
| `endDateTime` | `v.number()` | yes | must be at or after `startDateTime` |
| `location` | `v.optional(v.string())` | no | capped at 160 |
| `coverImageUrl` | `v.optional(v.string())` | no | an R2 key resolved by `resolveCoverUrls`, as every other content table does |
| `owner` | `v.union(v.object({type: v.literal("department"), departmentId}), v.object({type: v.literal("clan"), clanId}))` | yes | exactly one owner, the same discriminated shape `notificationAudienceValidator` uses |
| `cancelledAt` | `v.optional(v.number())` | no | set means cancelled; absence means it is on |
| `cancelledBy` | `v.optional(v.id("users"))` | no | |
| `cancellationReason` | `v.optional(v.string())` | no | shown to members, capped at 200 |
| `createdBy` | `v.id("users")` | yes | |
| `createdAt` `updatedAt` | `v.number()` | yes | |

| Index | Fields | Serves |
|---|---|---|
| `by_department_start` | `["owner.departmentId", "startDateTime"]` | one equality plus range read per eligible department, both for the merged list and for feature 17's own activities page and S4-04's month calendar |
| `by_clan_start` | `["owner.clanId", "startDateTime"]` | the same for the caller's clan, and feature 23's clan portal |

There is deliberately no `["startDateTime"]` index. A single window read over every activity in the church, filtered down to the caller's groups in memory, would scale with the number of groups that exist rather than with the number the caller belongs to. Reading per eligible group instead bounds the work by the member's own memberships, which is a handful.

**`groupMessages`**, one message sent to one department or one clan.

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | `v.string()` | yes | capped at `GROUP_MESSAGE_MAX_LENGTH` (2000) |
| `imageUrl` | `v.optional(v.string())` | no | the optional image in S5-01, an R2 key resolved by `resolveCoverUrls` on the way out, exactly as `coverImageUrl` is elsewhere |
| `owner` | same union as above | yes | |
| `sentBy` | `v.id("users")` | yes | the sender, for S5-02 |
| `deletedAt` | `v.optional(v.number())` | no | soft delete, so S5-03 leaves an audit trail |
| `deletedBy` | `v.optional(v.id("users"))` | no | |

| Index | Fields | Serves |
|---|---|---|
| `by_department` | `["owner.departmentId"]` | that department's messages, newest first inside the window |
| `by_clan` | `["owner.clanId"]` | the same for a clan |

No `sentAt`. Convex appends `_creationTime` to every index, so `by_department` plus a range on `_creationTime` gives the window query directly. This follows the `notifications` table's own note about not duplicating `_creationTime`. Each per group read also takes at most `GROUP_MESSAGE_PAGE_SIZE` (50) rows, so a busy department cannot grow the read without bound inside the 90 day window.

**`events`** gains `cancelledAt`, `cancelledBy`, `cancellationReason`, all optional, written by feature 18. `active: false` keeps its existing meaning of archived and therefore hidden.

**`notificationAudienceValidator`** gains `v.object({ type: v.literal("clan"), clanId: v.id("clans") })`.

**`@klt-cyber/shared`** gains:

| Export | Value | Purpose |
|---|---|---|
| `UPCOMING_HORIZON_DAYS` | 56 | moved out of `convex/weeklyPrograms.ts`, where it is currently private |
| `GROUP_MESSAGE_WINDOW_DAYS` | 90 | the My groups history window |
| `GROUP_MESSAGE_PAGE_SIZE` | 50 | the per group cap inside that window |
| `ANNOUNCEMENT_CATEGORIES` | a union, members set by the Migration plan audit | the fixed set behind AC-1 and AC-16 |
| `ACTIVITY_TITLE_MAX_LENGTH` | 120 | |
| `ACTIVITY_DESCRIPTION_MAX_LENGTH` | 2000 | |
| `ACTIVITY_LOCATION_MAX_LENGTH` | 160 | |
| `GROUP_MESSAGE_MAX_LENGTH` | 2000 | |
| `CANCELLATION_REASON_MAX_LENGTH` | 200 | the same 200 `PROGRAM_CANCELLATION_REASON_MAX_LENGTH` already uses, for activity and event reasons |

`kampalaToday` already lives there from spec 0009 and is what "today in Kampala" means throughout. Midnight today in Kampala as an instant comes from the same offset, which spec 0009 moved into `KAMPALA_UTC_OFFSET_MS`.

Relationships: `departments` 1:N `groupActivities` and 1:N `groupMessages`; `clans` the same. Nothing references either new table.

### State transitions

```
activity:  on (no cancelledAt)  --cancel (feature 17)-->  cancelled (cancelledAt set)
           cancelled            --restore (feature 17)->  on
message:   visible (no deletedAt) --delete (feature 17)--> hidden (deletedAt set), never purged
event:     active & on  --cancel (feature 18)--> active & cancelled (still listed, marked)
           active       --archive (exists today)-> inactive (not listed at all)
```

A cancelled activity or event is still a real row on a real date, so it stays in the list until the date passes. An archived event is a mistake being undone, so it leaves at once. Those are different states on purpose.

### API surface

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `upcoming.listUpcomingForMember` | query | `limit?: number`, capped at 100 and unlimited when absent | merged rows: `kind` (`event` or `activity`), `id`, title, `startDateTime`, `endDateTime`, location, resolved image, `tag`, `cancelled`, `cancellationReason?` | any authenticated session | `null` when unauthenticated |
| `groups.listMyGroupMessages` | query | none | groups, each with `groupId`, `ownerType`, `groupName` and its messages (`_id`, body, resolved image, `senderName`, `_creationTime`) | any authenticated session | `null` when unauthenticated |
| `groups.getActivity` | query | `activityId` | the activity, its `owner`, resolved tag, resolved image and cancellation fields, or `null` when the caller is not eligible or it does not exist | any authenticated session | `null` rather than an error, so a stale or forwarded deep link leaks nothing and crashes nothing |
| `events.getEvent` | query | `eventId` | existing shape plus the cancellation fields | any authenticated session | unchanged |
| `announcements.listActiveAnnouncements` | query | none | existing shape, category now consumed by the client | unchanged | unchanged |
| `announcements.createAnnouncement` / `updateAnnouncement` | mutation | existing, `category` now validated when present | unchanged | `canManageContent` | rejects a present category outside the shared set, still accepts none |

`listUpcomingForMember` is one query and not two on purpose: Home (feature 12, M2-06) calls the same function with a small `limit`, so the horizon, sort, tag and cancelled rules exist in exactly one place. `limit` applies after the merge, so both sources are read for the full window first and the cut is taken from the ordered result.

The shared detail screen takes both `kind` and `id` (`/item-detail?kind=event&id=…`), because the two ids come from different tables and the screen has to know which query to call. The `activity` deep link resolves to `kind=activity`, and the existing `/event-detail?id=…` route is kept as a redirect so older notifications already in people's trays still land correctly.

`listUpcomingEvents` and `listFeaturedEvents` are **not** changed by this spec. They keep their current unbounded behaviour, so nothing Home renders today changes until feature 12 migrates it.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| `listUpcomingForMember` | the row tag | the literal `Church` for an event; `departments.name` or `clans.name` via `owner` for an activity |
| `listUpcomingForMember` | sort position | `startDateTime` on both tables, both unix ms instants, so one comparison |
| `listUpcomingForMember` | window start | midnight today in Kampala, from `KAMPALA_UTC_OFFSET_MS` in shared, not `Date.now()`, so something that started earlier today is still listed |
| `listUpcomingForMember` | window end | `UPCOMING_HORIZON_DAYS` from `@klt-cyber/shared`, applied to that same midnight, inclusive of the final day |
| `listUpcomingForMember` | whether a row has finished | `endDateTime` against `Date.now()`, the one boundary both the list and AC-6 use |
| `listUpcomingForMember` | tie break on equal starts | events before activities, then `_creationTime`, so a `limit` cut is deterministic |
| `listMyGroupMessages` | the message id the list keys on and the deep link targets | `_id` on each returned row |
| `listMyGroupMessages` | heading order | the group name, ascending, departments before the clan: a stable order, which is why the moving one was rejected |
| Add to calendar | the device calendar on Android | `getCalendarsAsync`, picking the first writable calendar, because `getDefaultCalendarAsync` is iOS only |
| Add to calendar | the time zone written | Africa/Kampala, so the entry matches what the app showed rather than the device's own zone |
| `listUpcomingForMember` | `cancelled` | presence of `cancelledAt` on the row |
| `listUpcomingForMember` | which activities the caller may see | `departmentMemberships` via `by_userId_status` (status active), plus `memberProfiles.clanId` when `profileStatus` is verified |
| `listMyGroupMessages` | the group heading | `departments.name` or `clans.name` via `owner` |
| `listMyGroupMessages` | window start | `GROUP_MESSAGE_WINDOW_DAYS` from shared, compared against `_creationTime` |
| `listMyGroupMessages` | sender name | `users.firstName` and `users.lastName` via `sentBy`; an anonymized account (spec 0008 clears every name field) reads as `A former member` rather than an empty string |
| Updates list and detail | the category label | `announcements.category`, matched against the shared union; an unmatched value falls back to a neutral chip and no category means no chip |
| Both read paths | the tag or heading when the owning row is gone | nothing: a row whose department or clan no longer exists is omitted rather than shown untagged |
| Detail screen | end time | `endDateTime`, which `events` already has and `groupActivities` now has |
| Add to calendar | which device calendar to write to | `expo-calendar`'s default calendar for the platform, read at call time |
| Add to calendar | the added state | the created entry id, stored on the device keyed by item kind and id, not on the server |

### Key invariants

- Exactly one of `owner.departmentId` or `owner.clanId` is set on every `groupActivities` and `groupMessages` row, which the discriminated union enforces at the type level and the writing mutation enforces at runtime. Convex has no check constraints, so the mutation is the real guard.
- `endDateTime` is at or after `startDateTime`.
- Eligibility is evaluated at read time against live membership. Nothing is copied per recipient, which is what makes AC-4 true with no extra state.
- The in app read rule is deliberately wider than the push rule. Push audiences keep F4-17's and N27's verified only rule; only the in app read accepts an unverified roster member. Any future code that treats the two as the same rule is wrong.
- A clan grants nothing until the profile is verified, because `clanId` is self selected in the profile wizard.
- Cancelled and archived are different states and never collapse into one check.
- Every read path here is read only. Nothing in this spec writes a `groupActivities` or `groupMessages` row outside the dev and staging seed.
- The membership helper returns distinct department ids. `departmentMemberships` has no unique index (Convex has none to give), so a member removed and re-added holds two rows, and a naive read would list that group twice.
- A `clan` audience added to the validator always has a matching `resolveAudience` case. The switch ends in an exhaustive `never`, so the compiler enforces this; the invariant is written down because the resolver is easy to forget when only the validator looks like the contract.
- The device note for a calendar entry is written before the member is told it worked, so two fast taps cannot both believe they were first.

### Security model

Any authenticated session reads announcements, church events and weekly programs, exactly as today, visitors included. Group content is filtered per caller by the eligibility rule in AC-3, so a visitor with no roster row and no verified clan simply receives nothing and the section does not render. `getActivity` returns `null` rather than throwing for an ineligible caller, so a forwarded deep link leaks no title. No compliance scope beyond what the project already carries: group messages are internal church communication, not regulated data.

### Screen states

Both new reads follow the convention the existing screens already use: `undefined` from `useQuery` means still loading and renders a spinner, `null` means the session is not authenticated and renders nothing, and an empty array means there is genuinely nothing. On top of that:

- My groups renders nothing at all when the caller has no eligible groups, and nothing when every eligible group is empty inside the window. A group that exists but has no messages in the window shows no heading, so there are never empty headings.
- The merged list shows one empty state when there is nothing upcoming at all, with wording that does not imply the member is missing out on group content they are not entitled to.
- The shared detail screen handles `null` from `getActivity` with a short "this is no longer available" state rather than a crash or a blank screen, which is what a forwarded or stale deep link produces.

### Configuration required

- `apps/mobile/app.config.*`: the `expo-calendar` config plugin, with the iOS usage strings `NSCalendarsUsageDescription` and `NSCalendarsWriteOnlyAccessUsageDescription` (iOS 17 and later splits write only access out), and the Android `READ_CALENDAR` and `WRITE_CALENDAR` permissions.
- No new environment variables and no new secrets.

### Critical test scenarios

- Happy path: a member on two department rosters and in a verified clan opens Updates, sees three group headings with recent messages under each and a category chip on every announcement, verifies **AC-1**, **AC-2**, **AC-3**.
- Happy path: the same member opens Events and Programs and sees a church event and a department activity interleaved by date, each tagged, verifies **AC-5**.
- Failure case: a message with `deletedAt` set, and a department the member was removed from, both vanish from My groups on the next read, verifies **AC-4**.
- Failure case: calendar permission refused leaves nothing written and the button usable, verifies **AC-10**.
- Failure case: tapping add to calendar twice produces one calendar entry, verifies **AC-9**.
- Edge case: a cancelled event stays listed and marked while an archived event does not appear at all, verifies **AC-6**.
- Auth and permission: a visitor with no roster row and an unverified profile naming a clan sees no My groups section and no activities in the merged list, verifies **AC-3**, **AC-15**.
- Edge case: an announcement whose stored category is not in the shared set renders as a neutral chip, and one with no category renders no chip, verifies **AC-1**.
- Edge case: an event and an activity starting at the same minute always come back in the same order, and a `limit` of 1 always returns the event, verifies **AC-5**.
- Edge case: an item that started an hour ago and ends in an hour is still listed; one that ended ten minutes ago is not, verifies **AC-5**, **AC-6**.
- Edge case: a member with two `departmentMemberships` rows for the same department (removed then re-added) sees that group once, verifies **AC-2**.
- Edge case: a `clan` audience notification resolves to verified clan members only, and `resolveAudience` still compiles with its exhaustive check intact, verifies **AC-11**, **AC-15**.
- Auth and permission: the portal rejects an announcement category outside the shared set and the form offers no way to type one, verifies **AC-16**.

## Build plan

Tracer Bullet, the project default. Slice 1 lays the contract and clears the one native blocker up front so every later slice is testable over the air; slices 2 to 4 are each a thin thread through backend, query and screen.

**Slice 0: the category audit** (do this first, it sets a value slice 1 needs)
1. [x] Read the distinct `announcements.category` values in dev, staging and production, and agree the set from what the church actually uses. No code, see Migration plan phase 1, satisfies **AC-1**, **AC-16** as their prerequisite

**Slice 1: the contract and the native dependency**
2. [x] Add to `packages/shared` every export in the table above, with vitest cover for the caps, the two windows and the category guard, satisfies **AC-1**, **AC-2**, **AC-5**
3. [x] Schema: `groupActivities`, `groupMessages`, their indexes, the three cancellation fields on `events`, and the `clan` variant on `notificationAudienceValidator`, satisfies **AC-11**, **AC-12**
4. [x] `resolveClanAudience` plus its case in `convex/notifications.ts`'s `resolveAudience`, returning verified clan members only. Without this the exhaustive `never` check at the end of that switch fails to compile, satisfies **AC-11**, **AC-15**
5. [x] Validate a present `category` against the shared set in `createAnnouncement` and `updateAnnouncement`, satisfies **AC-1**, **AC-16**
6. [x] Replace the portal's free text category `Input` with a select over the shared set, in the same change as task 5 so the form can never send a value the server now refuses, satisfies **AC-16**
7. [ ] Add `expo-calendar` and its config plugin permission strings, then run the manual preview APK build so slices 2 and 3 can go out over the air, satisfies **AC-9** as a prerequisite
8. [x] `contentSeed:seedGroupSamples`: sample activities and messages for two departments and one clan, the roster and clan rows the three test accounts need, dates relative to now, and the cancelled, beyond horizon and outside window rows the verify steps rely on. Behind `assertSampleSeedAllowed` and an explicit `allowSampleData: true`, matching every other sample seed, satisfies **AC-14**

**Slice 2: My groups, end to end**
9. [x] `convex/lib/groupMembership.ts`: resolve the caller's eligible department ids (active roster rows, deduped) and clan id (only when the profile is verified), one helper both new read paths use, satisfies **AC-3**
10. [x] `convex/groups.ts`: `listMyGroupMessages`, one windowed capped read per eligible group, excluding deleted rows, resolving images and sender names, omitting a group whose row is gone, satisfies **AC-2**, **AC-4**, **AC-15**
11. [x] Updates tab: the category chip on each announcement card, and the My groups section grouped under group names in stable order, hidden entirely when empty, satisfies **AC-1**, **AC-2**
12. [x] Announcement detail shows the category, satisfies **AC-1**

**Slice 3: one upcoming list, end to end**
13. [x] `convex/upcoming.ts`: `listUpcomingForMember`, reading events for the window plus one indexed read per eligible group, merged with the stated tie break, server resolved tags, cancellation stamped, finished rows dropped, optional capped limit, satisfies **AC-5**, **AC-6**, **AC-15**
14. [x] Events and Programs screen: the merged tagged list with its empty state, then the this week's programs strip, keeping spec 0005's past events section at the bottom, satisfies **AC-5**, **AC-6**, **AC-8**
15. [x] Generalise `event-detail.tsx` into one shared detail screen taking `kind` and `id`, serving both an event and an activity, including the cancelled mark and reason and the no longer available state, with the old route kept as a redirect, satisfies **AC-7**

**Slice 4: add to calendar**
16. [x] The add to calendar action: permission request, a writable calendar via `getCalendarsAsync` on Android and the default on iOS, Kampala times, the created entry id persisted on the device before the member is told it worked, button reads as added, satisfies **AC-9**
17. [x] The refused permission path: plain explanation plus a route to system settings, satisfies **AC-10**
18. [x] Resolve the `activity` and `groupMessage` deep link types in `apps/mobile/lib/notification-links.ts`, satisfies **AC-13**

## Migration plan

**Strategy**: additive, no data transformation, with one read only audit first.

**Phases**:
1. Audit the distinct values currently in `announcements.category` across dev, staging and production before fixing the set, so the shared union is built from what the church actually uses rather than from a guess. The schema field stays `v.optional(v.string())`; only the mutations, the portal select and the client validate against the union, so no existing row can become unreadable and nothing has to be backfilled.
2. Deploy slice 1. Two new empty tables, three optional fields and one new audience variant, all of which older function code ignores. The mutation validation and the portal select go out together, in one change, because a form that can still send free text against a server that now refuses it would break announcement editing.
3. Deploy slices 2 and 3 over the air.
4. Ship slice 4 in the preview APK build from slice 1.

**Rollback**: revert the commit. Empty or seeded new tables are inert once nothing reads them, and the `events` fields are optional and unread by older code. The one ordering constraint is phase 2: reverting the mutation validation without reverting the portal select, or the other way round, leaves the form and the server disagreeing, so they revert together.

**Risks**: the category audit is the only place live data is involved. If production holds a value the set does not cover, the app still renders it as a neutral chip, so a missed value is cosmetic rather than a crash. The one real sharp edge is that re-saving such an announcement in the portal forces the editor to pick a set value, which silently changes that row's category; the audit exists so the set covers what is really there and that case stays rare.

## Consequences

**Positive**:
- M3-02, M3-03, M4-01, M4-02 and M4-04 are satisfied, and feature 15 closes against its own Done when line.
- The activity and message shape is decided once by the feature that traced what members must see, so features 17, 18 and 23 inherit a contract instead of inventing three.
- The merge rules live in one query, so Home and the Events screen cannot disagree about the horizon, the order, the tag or the cancelled mark once Home moves onto it.
- The new reads are bounded by the caller's own memberships rather than by how many groups the church has, so they do not get slower as departments and clans are added.
- `listUpcomingEvents`'s unbounded range read stops being the pattern new code copies, even though that function itself is left alone.
- `plannedActivities` keeps its documented meaning as the Year Planner's internal record, so nothing administration planned privately becomes church visible.

**Negative / tradeoffs**:
- Two tables ship with no writer for weeks. If the shape is wrong, the cost lands on feature 17 rather than here.
- AC-2, AC-3 and AC-5 are verified against seeded rows, not against content a human authored in the portal. The real end to end proof waits for Week 3.
- The in app read rule and the push rule now differ. That is deliberate and recorded as an invariant, and it is still two rules where there was one, and a future reader can get it wrong.
- The 8 week horizon applies only to the new query, so for a while the church has two answers to "what is coming up": this screen stops at 8 weeks while Home's existing slot still reads everything. That is deliberate rather than tidy, because Home belongs to feature 12, and it is listed as a follow up.
- An event further out than 8 weeks silently stops appearing on this screen until a "see all" view exists.
- The window is computed from the clock inside the query, and a Convex query does not re-run on a timer. A subscription left open across midnight keeps yesterday's window until some other write invalidates it. Spec 0009 already accepted exactly this for `listActivePrograms`, and the same reasoning applies: the app is foregrounded far more often than it is left open overnight.
- Each eligible group costs one more indexed read. A member in ten departments makes ten small reads rather than one larger one, which is the right trade at this size but is not free.
- My groups holds 90 days and no more, and at most 50 messages per group inside that. A member looking for an older notice has no way to reach it and no way to ask for one, and a group that sends more than 50 in three months silently loses the oldest of them from the view.
- `expo-calendar` makes this the first feature in a while that cannot reach staging purely over the air.
- A calendar entry, once written, is a copy. If the event moves or is cancelled, the member's calendar keeps the old time and only the push tells them otherwise.

**Neutral**:
- M3-01's pinned behaviour is untouched: pinned still derives from `priority === 'high'` rather than a stored flag.
- Past events stay exactly where spec 0005 put them, at the bottom of this screen.
- Weekly programs keep their own screen; this screen links to it rather than absorbing it.
- The deep link types are new values on an existing `v.string()` field, so they need no schema change, only two cases in the resolver.
- Soft deleted messages are never purged. Volume is a handful per group per year, so no retention job is proposed.

## Follow-up

- [ ] `docs/scope/scope.md`: drop M4-03 from feature 15's SRS pointer (shipped in spec 0009) and M3-04 (owned by feature 10 through F4-12), so each story has exactly one owning feature. Belongs to the next `/scope` run, alongside the three pointer fixes spec 0009 already listed.
- [ ] `spec/SRS.md`: record the push versus in app split in the source of truth and not only here. It touches more rows than it first looks: F4-16 and M4-01 and M2-06 describe the in app read, which now accepts any active roster member, while F4-17, N22, N24, N27 and S5-01 describe the push, which keeps its verified only rule. A note on each side pointing at the other is enough.
- [ ] Feature 12 should move Home's events slot (M2-06) onto `upcoming.listUpcomingForMember` and retire its use of `listUpcomingEvents`, which is still the unbounded read. Until it does, Home and this screen answer "what is coming up" differently, and Home shows no group activities at all.
- [ ] `convex/schema.ts`: the `plannedActivities` comment should gain a pointer to `groupActivities`, saying which table is internal and which is member facing, so the next reader does not have to work it out.
- [ ] Feature 17 owns the activity reminder tiers (N23). The scheduled job id fields that `events` carries were deliberately left off `groupActivities`, so feature 17 adds them when it decides those tiers.
- [ ] A "see all events" view for anything beyond the 8 week horizon, if the church starts planning further ahead than that.
- [ ] `AGENTS.md` has no `## Agent skills` section, so the three installed skills (`convex`, `convex-reviewer`, `mobile-frontend-design`) are not recorded anywhere a later task would find them. `/sync` owns writing that section. Record also that MCP servers were offered and declined for this feature, so nothing offers them again.
- [ ] `AGENTS.md` still instructs loading `klt-cyber-web-ui` and `klt-cyber-brand`, neither of which is installed. Spec 0009 already raised this; it is still open and it bites this feature's mobile work.
- [ ] Nothing credible exists as an Agent Skill or MCP server for `expo-calendar`. If the permission flow proves fiddly across iOS 17 and Android, a short project skill capturing what actually worked would save the next native module its own discovery.
