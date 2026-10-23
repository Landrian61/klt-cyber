# 0009. Cancel and restore a single program occurrence

**Date**: 2026-10-22
**Status**: Accepted

## Summary

Administration can call off one date of a recurring program, for example this Wednesday's prayer meeting, without touching the program itself, and can put it back. Today an occurrence exists only as a row in a query result, computed on the fly and thrown away, so there is nowhere to record that one was cancelled and no way to stop its reminder. This spec adds one small table holding a row per called off date, keyed by the program plus the Kampala calendar day, plus three mutations (cancel, restore, edit the reason) and a cancelled marker on every screen where programs appear. Restoring deletes the row, so no row simply means the occurrence is on.

The one subtle part is the reminder. The daily cron schedules the hour before push a day in advance, so a cancellation entered later would otherwise arrive too late to stop it. That push therefore checks the cancellation at the moment it fires rather than when it was scheduled. The day before push cannot be retracted the same way, because it fires immediately at 09:00 Kampala, so for an occurrence inside the next two days the cancel dialog pre ticks "Notify members" to make sure the church hears the correction.

## Requirements

**User stories**:
- As Administration, I want to cancel one occurrence of a recurring program with an optional reason, so that I can call off this Wednesday's service without deleting the weekly program.
- As Administration, I want to choose whether members are told, so that a quiet administrative correction does not push a notification to the whole church.
- As Administration, I want to restore a cancelled occurrence, so that a change of plan is not permanent.
- As a member, I want a cancelled occurrence to read as cancelled wherever I see programs, so that I do not travel to a service that is not happening.
- As a member, I want no reminder for an occurrence that has been called off, so that the app never tells me about something that is not on.

**Acceptance criteria**:

- **AC-1**: From the Year Planner day popup, an Administration manager cancels a single program occurrence, with an optional reason of at most `PROGRAM_CANCELLATION_REASON_MAX_LENGTH` (200) characters. (A4-02)
- **AC-2**: The cancel dialog offers "Notify members", unticked by default, except that it is pre ticked when the occurrence falls within the next 48 hours, because a reminder may already have gone out. When ticked, exactly one notification goes to all signed in users, push and in app, whose body names the program, the occurrence date and the reason when one was given, and `notifiedAt` is recorded on the record. When unticked, nothing is sent. (A4-02, N20)
- **AC-3**: From the same popup, an Administration manager restores a cancelled occurrence, which deletes the record. The same "Notify members" option is offered, with the same 48 hour pre tick rule, and the dialog states that members were already told it was off when `notifiedAt` is set. For an occurrence whose date has already passed the option is withheld entirely and no notification is ever sent, in the dialog and in the mutation both: "it is back on" is a claim about something that is going to happen, and the same holds for a record orphaned by a program edit or belonging to a switched off program. The record is still deleted in every one of those cases. (A4-03)
- **AC-4**: The reason on a cancelled occurrence can be corrected without restoring it first, and the correction is logged. Correcting a reason never sends a notification.
- **AC-5**: Cancel is rejected unless all three hold: the program is active, the date is a real occurrence of that program per `weeklyProgramOccursOn`, and the date is today or later in Kampala. An occurrence that already started earlier today may still be cancelled. Restore checks only that the record exists and that the caller is authorized.
- **AC-6**: Once a cancellation is recorded, no further reminder of any tier is dispatched for that occurrence. This holds even when the cancellation is entered after the daily cron has already scheduled the hour before push, because the check happens when the push fires and not when it was scheduled. The day before push, which the cron fires immediately at 09:00 Kampala, is outside this guarantee by construction; AC-2's 48 hour pre tick is what covers it. (F4-02)
- **AC-7**: On mobile Home's "This week's programs" row, a cancelled occurrence stays in its chronological place, carries a crimson Cancelled badge, and remains tappable through to program detail. (M2-05)
- **AC-8**: The mobile programs list shows each program's next occurrence, reading Cancelled when that occurrence is off, and program detail lists the cancelled occurrences within the next 8 weeks with their reasons. (M4-03)
- **AC-9**: In the Year Planner, a cancelled occurrence is marked cancelled both on the day chip (in month, week and year views) and in the day popup, with its reason shown in the popup.
- **AC-10**: Every cancel, restore and reason correction writes an `activityLogs` row naming the actor, the program and the occurrence date.
- **AC-11**: Only `canManageContent` callers (System Admin, Administration HOD, Administration `department_admin`) may cancel, restore or correct a reason. Every read path exposes cancellation state; none of them exposes a way to change it.
- **AC-12**: At most one cancellation record exists per program and date. A second cancel of an already cancelled occurrence is rejected with the error `"This occurrence is already cancelled."`, creating no duplicate row and sending no second notification.
- **AC-13**: A program edit that moves the occurrence off a cancelled date leaves the record in place and unread by every query, and editing the day back brings the cancellation back with it.

## Decision

**Chosen option**: Option 1: a cancellation record keyed by program and calendar date.

One additive table, `programOccurrenceCancellations`, holds a row per called off occurrence keyed by `programId` plus a `"YYYY-MM-DD"` Kampala local date string. No row means the occurrence is on, restore deletes the row, and the three existing read paths plus `listActivePrograms` each stamp cancellation onto what they already return.

**Implementation skills**: `shadcn` (`anthropics/claude-code`, `.claude/skills/shadcn/`) for the cancel and restore dialog primitives. The two skills AGENTS.md names for UI work, `klt-cyber-web-ui` and `klt-cyber-brand`, are not installed in `.claude/skills/`; see Follow-up.

## Rationale

Reasoning, options and the code reading behind them: see [rationale.md](./rationale.md).

## Feature design

### Data model

New table, additive. No change to `weeklyPrograms`.

**`programOccurrenceCancellations`** — one row equals one called off occurrence; no row equals it is on.

| Field | Type | Required | Notes |
|---|---|---|---|
| `programId` | `v.id("weeklyPrograms")` | yes | the parent program definition |
| `date` | `v.string()` | yes | `"YYYY-MM-DD"`, Kampala local calendar day, the same shape as the `occurrenceKey` suffix |
| `reason` | `v.optional(v.string())` | no | trimmed, capped at 200; empty after trimming is stored as absent. Shown to members |
| `cancelledBy` | `v.id("users")` | yes | the acting admin, for audit attribution |
| `cancelledAt` | `v.number()` | yes | unix ms |
| `updatedAt` | `v.number()` | yes | moves when the reason is corrected |
| `notifiedAt` | `v.optional(v.number())` | no | set when a member notification was scheduled on cancel; drives the restore dialog warning |

| Index | Fields | Serves |
|---|---|---|
| `by_program_date` | `["programId", "date"]` | the existence check for one occurrence, and every cancelled date of one program |
| `by_date` | `["date"]` | range query over a week, month or year. ISO date strings sort in calendar order, so `gte`/`lte` works directly |

Relationship: `weeklyPrograms` 1:N `programOccurrenceCancellations`. Nothing else references it.

Retention: rows are never pruned. An old row is harmless and is what keeps a past day in the Year Planner reading Cancelled (mobile Home never shows past days, since its range starts at `Date.now()`). Volume is a handful of rows a year.

### State transitions

```
on (no row)  --cancelOccurrence-->  cancelled (row exists)
cancelled    --restoreOccurrence->  on (row deleted)
cancelled    --updateCancellationReason-->  cancelled (reason replaced, updatedAt moves)
```

Fully reversible any number of times. Each transition writes its own `activityLogs` action, so the history is readable from the audit log even though the current state is one row or none.

### API surface

All three mutations live in `convex/weeklyPrograms.ts` alongside the existing program mutations.

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `weeklyPrograms.cancelOccurrence` | mutation | `programId` (req), `date` (req), `reason?`, `notify: boolean` (req) | `{ ok: true }` | `canManageContent` | already cancelled, program not found, program inactive, date not an occurrence, date in the past, reason over 200 |
| `weeklyPrograms.restoreOccurrence` | mutation | `programId` (req), `date` (req), `notify: boolean` (req) | `{ ok: true }` | `canManageContent` | not cancelled |
| `weeklyPrograms.updateCancellationReason` | mutation | `programId` (req), `date` (req), `reason?` | `{ ok: true }` | `canManageContent` | not cancelled, reason over 200 |
| `weeklyPrograms.listActivePrograms` | query (changed) | none | each program gains `nextOccurrence` and `cancelledUpcoming` | signed in; returns `null` when unauthenticated | none |
| `calendar.getCalendarRange` | query (changed) | `startDate`, `endDate` | each `type: "program"` item gains `cancelled` and `cancellationReason?` | signed in; returns `null` when unauthenticated | `endDate` before `startDate` |
| `plannedActivities.getYearPlannerRange` | query (changed) | `startDate`, `endDate` | each `type: "program"` item gains `cancelled`, `cancellationReason?` and `notifiedAt?` | Administration; **throws** for an authenticated caller without the authority, returns `null` only when unauthenticated | `endDate` before `startDate` |
| `notifications.dispatch` | internalMutation (changed) | existing args plus `occurrence?: { programId, date }` | nothing | internal only | none; returns early when the occurrence is cancelled, or its program is inactive, or it no longer occurs on that date |

New shapes on `listActivePrograms`, per program:

- `nextOccurrence: { date: string; startsAt: number; cancelled: boolean; reason?: string } | null` — the first occurrence on **today's Kampala calendar day or later**, within the 8 week horizon, or `null` when there is none. By calendar day, not by instant, so an occurrence that already started earlier today is still the next one. This matches AC-5's cancel window, deliberately, so the admin and the member never disagree about which occurrence "the next one" is. A program carrying neither `startTime` nor the legacy `time` is skipped and reports `null`, matching the existing defensive skip in both calendar paths.
- `cancelledUpcoming: { date: string; reason?: string }[]` — every cancelled date from today's Kampala day forward within the same horizon, ascending.

Both are additive, so the existing consumers (`DashboardClient`, `programs.tsx`, `program-detail.tsx`) keep working untouched.

The cancellation lookup lives in a new `convex/lib/occurrences.ts`, taking a `ctx` plus a ymd string range and returning a map keyed by `${programId}_${date}`. It cannot live in `convex/lib/recurrence.ts`, which is deliberately pure with no `ctx` and no import from `convex/calendar.ts` so the two never form a circular import.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| all three mutations | the occurrence `date` | an input param, and specifically `item.date` off the Year Planner program item, which is already the Kampala string the server stamped. **Never** a string derived client side from the clicked `Date`: `YearPlannerClient` buckets by `localYmd(selectedDay)`, which is browser local, so an admin outside Kampala would otherwise send a date one day off |
| `cancelOccurrence` | "today in Kampala", for the past date rejection | derived: `ymd(...kampalaParts(Date.now()))`, both already exported from `convex/calendar.ts`; string compared against the `date` argument |
| `cancelOccurrence` | the midnight instant passed to `weeklyProgramOccursOn` | derived: `occurrenceInstant(year, month, day, "00:00")` for the parsed `date`, which is the same `dayCursor` value both calendar paths pass |
| `cancelOccurrence` | `cancelledBy` | derived: the `users` row returned by `canManageContent` |
| `cancelOccurrence`, `updateCancellationReason` | the stored `reason` | the input param, trimmed; empty after trimming is stored as absent. Capped at `PROGRAM_CANCELLATION_REASON_MAX_LENGTH` (200), a new constant in `@klt-cyber/shared` imported by both the mutation and the admin dialog so the client cap and the server cap cannot drift |
| notification on cancel | title and body | derived server side from fixed strings: title `Cancelled: {program.title}`; body `{program.title} on {formatted date} is cancelled.` plus ` {reason}` when a reason exists. The reason is truncated at 120 characters with a trailing ellipsis in the push body only, never in the stored record or the in app row |
| notification on restore | title and body | title `Back on: {program.title}`; body `{program.title} on {formatted date} is back on.` |
| notification on cancel or restore | the human readable date, for example "Wed 22 Oct" | `formatOccurrenceDate(date)`, a new pure function in `@klt-cyber/shared`, so the push, the portal and the app never disagree |
| notification on cancel or restore | `audience` | decided here: `{ type: "all" }`, per SRS N20 |
| notification on cancel or restore | `createdBy` | the acting admin's `users._id`. Note this differs from the cron, which has no acting user and reuses `program.createdBy` |
| notification on cancel or restore | `deepLink` | decided here: `{ type: "program", id: programId }`, which the existing `resolveDeepLinkHref` already routes to `/program-detail?id=…` |
| notification on cancel or restore | `imageUrl` | `program.coverImageUrl`, the same source the reminder cron already passes |
| `cancelOccurrence` | `notifiedAt` | `Date.now()` in the same mutation that calls `ctx.scheduler.runAfter(0, internal.notifications.dispatch, …)`. Written when the dispatch is scheduled, not when a device receives anything |
| cancel and restore dialogs | whether to pre tick "Notify members" | derived client side: the occurrence `start` instant on the planner item is within 48 hours of now |
| restore dialog | "members were already told" warning | the record's `notifiedAt`, carried on the `getYearPlannerRange` program item |
| `getCalendarRange`, `getYearPlannerRange` | `cancelled`, `cancellationReason`, `notifiedAt` | a `by_date` range query from `ymd(...kampalaParts(startDate))` to `ymd(...kampalaParts(endDate))`, keyed back onto items by `${programId}_${date}` |
| `listActivePrograms` | `nextOccurrence` | derived: a day walk from today's Kampala day using `weeklyProgramOccursOn`, bounded by the 8 week horizon (a module constant, not configurable) |
| `listActivePrograms` | `cancelledUpcoming` | a `by_program_date` range query from today's `ymd` to the horizon's `ymd` |
| `notifications.dispatch` | whether to return early | the `occurrence?` argument, then a `by_program_date` lookup plus a re check that the program is active and still occurs on that date |
| mobile and admin | the Cancelled label and the crimson treatment | `cancelled` / `nextOccurrence.cancelled`. The colour is the design system's **secondary** role token on both surfaces (`Colors.secondary` on mobile, the `secondary` Tailwind token in the portal), never a hex literal. The planner chip gets a struck through title plus the crimson accent |

### Key invariants

1. At most one row per `(programId, date)`. Enforced in `cancelOccurrence` by a `by_program_date` lookup before the insert, rejecting on conflict. Convex has no unique indexes, so nothing else can hold this.
2. A row only ever exists for a date the program occurred on at the moment of cancelling. A later program edit may orphan it, and an orphan is never read.
3. No row means the occurrence is on. No query may treat a missing row as anything else, and nothing writes a row to mean "not cancelled".
4. Once a cancellation row exists, no reminder dispatch for that occurrence proceeds, whenever it was scheduled.
5. A reminder dispatch also does not proceed when the program has since been deactivated or edited so that it no longer occurs on that date. The guard checks all three conditions, not only cancellation, because a program can be changed between the 09:00 cron and the hour before fire.
6. At most one notification is scheduled per cancel action and one per restore action. A rejected duplicate cancel schedules nothing, and a reason correction schedules nothing.
7. `notifiedAt` is set only when a notification was scheduled, and is never cleared while the row lives.

### Security model

- All three mutations call `canManageContent` (which is `canManageChurchAdmin`): System Admin, Administration HOD, and Administration `department_admin`. This is the identical gate on `createProgram`, `updateProgram` and `toggleProgramActive`, so a delegate who can already delete a whole program is not blocked from calling off one night of it.
- `getYearPlannerRange` keeps its existing `getAdministrationAuthorityOrNull` gate. That returns `null` for an unauthenticated caller and **throws** for an authenticated caller without Administration authority, so the Year Planner is already unreachable without the authority and no extra UI gate is needed on the cancel and restore actions. (The project does expose `content.canManage`, backed by `isContentManager`, for cases that need a non throwing client check; this feature does not.)
- `getCalendarRange` and `listActivePrograms` stay signed in reads returning `null` when unauthenticated, per F3-08. Cancellation state and the reason are member visible by design, so they need no extra gate.
- No regulated data. The only personal reference is `cancelledBy`, an internal user id already carried by every other `activityLogs` row.

### Configuration required

None. No new env vars, no new credentials, no new component.

### Critical test scenarios

- Happy path: cancel a future Wednesday with a reason, confirm the row, the activity log entry, and `cancelled: true` plus the reason on all three read paths; then restore and confirm the row is gone and every path reads it as on. Verifies **AC-1**, **AC-3**, **AC-5**, **AC-9**, **AC-10**.
- Reminder, late cancellation: with an occurrence tomorrow, run the cron so the hour before push is scheduled, then cancel, then let the scheduled job fire and assert no notification was dispatched. This is the scenario the whole dispatch time check exists for. Verifies **AC-6**.
- Reminder, early cancellation: cancel an occurrence happening tomorrow, then run the cron, and assert it schedules nothing at all for that occurrence. Verifies **AC-6**.
- Reminder, program changed after scheduling: schedule the hour before push, then deactivate the program (and separately, move its day), and assert the dispatch still returns early. Verifies invariant 5 under **AC-6**.
- Duplicate: two `cancelOccurrence` calls for the same program and date; the second throws `"This occurrence is already cancelled."`, exactly one row exists, and exactly one notification was scheduled. Verifies **AC-12**.
- Validation: reject a yesterday date, reject a date the program does not occur on, reject an inactive program, reject a 201 character reason; accept an occurrence that started earlier today. Verifies **AC-5**.
- Reason normalisation: a whitespace only reason stores no reason, and a 150 character reason is stored whole but truncated in the push body. Verifies **AC-1**, **AC-2**.
- Orphan: cancel a Wednesday, edit the program to run on Thursdays, assert no query reports a cancellation, then edit it back to Wednesdays and assert the cancellation reappears. Verifies **AC-13**.
- Restore an orphan: with the program edited away from the cancelled date, restore still succeeds and removes the row. Verifies **AC-5**.
- Notify off: cancel an occurrence more than 48 hours away with `notify: false`; no notification row exists and `notifiedAt` is unset. Verifies **AC-2**.
- Notify pre tick: an occurrence 12 hours away opens the dialog with the tick already on, and one more than 48 hours away opens it off. Verifies **AC-2**, **AC-3**.
- Authorization: a signed in member, a visitor, and an HOD of a department other than Administration each get an error from all three mutations and still read cancellation state correctly. Verifies **AC-11**.
- Reason correction: correct the reason on a cancelled occurrence; the row keeps its `cancelledAt` and `notifiedAt`, `updatedAt` moves, a distinct activity log action is written, and no notification is scheduled. Verifies **AC-4**.
- Next occurrence semantics: a program whose occurrence started two hours ago today still reports that date as `nextOccurrence`; a monthly program five weeks out still reports one; a program with neither `startTime` nor `time` reports `null`. Verifies **AC-8**.

## Build plan

Ordered as Tracer Bullet slices (the project default, from the `docs/scope/scope.md` header). Slice 2 is the tracer bullet proper: it runs Convex through the admin portal to the phone, so that the moment it lands an admin can cancel an occurrence, a member sees it marked on Home, and no reminder fires for it. The reminder guard is inside slice 2 rather than after it on purpose: each slice merges to `main` and auto deploys to staging, so a slice that can cancel without suppressing the reminder must never exist as a deployable state. The later slices thicken that thread, and each is independently shippable and verifiable.

1. **The shared contract and the migration.** Add `programOccurrenceCancellations` with both indexes to `convex/schema.ts`. Create `packages/shared/src/constants/weeklyPrograms.ts` (new file; the existing `constants/` holds only `accountDeletion`, `appSchemes`, `auth` and `emails`, and the matching enums live in `enums/weeklyPrograms.ts`) with `PROGRAM_CANCELLATION_REASON_MAX_LENGTH = 200` and the pure `formatOccurrenceDate(date: string)`, plus its Vitest case as that package requires. One migration, additive only, so the staging deploy on merge stays backward compatible. Foundation for **AC-1**, supports **AC-2**.
2. **Tracer bullet: cancel and restore, visible end to end, reminder already safe, no notification yet.**
   - `cancelOccurrence` and `restoreOccurrence` with the full validation asymmetry, the duplicate rejection and its error text, the `canManageContent` gate and the `activityLogs` writes (`notify` is accepted and ignored at this stage).
   - The cancellation lookup in a new `convex/lib/occurrences.ts`, used by both `getCalendarRange` and `getYearPlannerRange` so the two duplicated day walks cannot disagree. Not in `recurrence.ts`, which is pure by design.
   - Add the optional `occurrence?: { programId, date }` argument to `internal.notifications.dispatch`, returning early when the occurrence is cancelled, or its program is inactive, or it no longer occurs on that date. Pass it from the cron's hour before entry. The cron must NOT skip already cancelled occurrences up front, tempting though it is: it runs once a day, so a cancellation entered in the morning and restored that afternoon would leave the occurrence with no scheduler entries and nothing to re create them, and the service would then happen with no reminder of either tier. Scheduling both tiers unconditionally costs one dead entry per cancelled occurrence, which the fire time guard drops without sending anything. Update the stale comment in `checkWeeklyProgramReminders` that documents the gap this closes.
   - Cancel and restore wired into `DayPopup.tsx` using existing shadcn dialog primitives, passing `item.date` and never a browser local date string. Update that file's comment explaining why programs are now partly actionable there.
   - The cancelled treatment on the planner chip via `plannerColors.ts`, and the cancelled badge on mobile Home's week row.
   Satisfies **AC-1**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**.
3. **Notifications on both actions.** Honour `notify` in both mutations: compose the title and body server side from the fixed strings, schedule the dispatch with `runAfter(0, …)` to `{ type: "all" }` with the `program` deep link and the program cover image, and record `notifiedAt`. Carry `notifiedAt` on the planner item and surface the already notified warning in the restore dialog. Add the 48 hour pre tick to both dialogs. Amend `spec/SRS.md` §4.5 to add the restore notification to the catalogue, since N20 covers cancellation only. Satisfies **AC-2**, completes **AC-3**.
4. **Correcting a reason.** `updateCancellationReason` with its own activity log action, and the edit affordance on an already cancelled row in the day popup. Satisfies **AC-4**.
5. **The mobile programs list and detail.** Add `nextOccurrence` and `cancelledUpcoming` to `listActivePrograms` over the 8 week horizon, with the by calendar day semantics above, then the next occurrence line on `programs.tsx` rows and the cancelled upcoming dates section on `program-detail.tsx`. Satisfies **AC-8**.

## Migration plan

**Strategy**: no migration needed. One new table, no change to any existing table, no live data to transform.

**Phases**: a single deployment. `pnpm convex` pushes the schema on dev; the push to `main` carries it to staging and the `main` to `prod` promotion carries it to production, in both cases as a purely additive change that older function code ignores.

**Rollback**: revert the commit. An abandoned table with rows in it is inert, since nothing reads it once the reading code is gone.

**Risks**: the ordering risk that an earlier draft of this plan carried has been designed out by folding the reminder guard into slice 2, so no deployable state exists in which an occurrence can be cancelled while its reminder still fires. The remaining risk is ordinary: `notifications.dispatch` is shared by events, announcements, roles and profiles, so the added optional argument must stay optional and must not change behaviour for any existing call site.

## Consequences

**Positive**:
- A4-02, A4-03 and F4-02 are satisfied, and the documented gap in `checkWeeklyProgramReminders` is closed rather than left as a comment.
- The reminder guarantee is unconditional from the moment the cancellation is recorded. Because the check happens at dispatch, no sequence of admin actions and cron timing can leak a reminder for a cancelled occurrence, and the same guard also catches a program deactivated or moved after the reminder was scheduled, which is a bug that exists today.
- No new Convex function is added for the guard. The optional argument on `notifications.dispatch` leaves the shared `scheduleReminderEntries` helper and every other call site untouched.
- `convex/calendar.ts` keeps its deliberate "calendar is a query, not a table" design. Nothing about the recurrence model changes.
- Features 12 and 15 inherit a working cancellation display when they rebuild Home and Events and Programs, instead of designing one under time pressure.

**Negative / tradeoffs**:
- `internal.notifications.dispatch`, a generic dispatcher, now knows about program occurrences. That is real coupling, chosen over a new indirection function plus a change to a helper shared by five call sites. If a second kind of retractable reminder appears, this argument should become a general predicate rather than growing a second special case.
- Four read paths now have to remember the cancellation lookup, and nothing enforces that a fifth one would. A future departmental calendar that plugs into the same merge could show a cancelled occurrence as on, and no test would fail.
- Orphaned rows accumulate silently when a program's day is edited. They are harmless and never read, but a developer browsing the table will find rows that correspond to no occurrence and have to work out why.
- Current state lives in the table while history lives in `activityLogs`, so "how often has this been changed" is an audit log question, not a query.
- `listActivePrograms` stops being a plain table read and gains a day walk plus a range query per call. The cost is small at this scale, but a query three screens subscribe to is now doing real work on every invalidation.
- `nextOccurrence` is computed from the server's `Date.now()` at query execution, and a Convex query does not re run at midnight. A subscription left open across midnight shows yesterday's answer until something else invalidates it. Accepted rather than solved, since the app is foregrounded far more often than it is left open overnight.
- The day before push cannot be retracted at all, so AC-2's 48 hour pre tick is a mitigation and not a fix. A cancellation entered at 14:00 for tomorrow means members got a reminder and then a cancellation notice, in that order.
- The restore notification needs an SRS amendment, so this feature cannot be finished without editing the source of truth document.

**Neutral**:
- `notify` is a required boolean rather than optional, so no call site can accidentally default into pushing to the whole church. The 48 hour rule changes the dialog's default tick, not the argument's requiredness.
- Adding actions to the Year Planner day popup is a deliberate exception to its own comment that programs and events are not editable from there; the comment is updated in slice 2 to say why.
- The cancellation notification does not yet respect per category push preferences, because the `notifications` table has no category field until feature 28 builds F4-19. N20 is a mutable category, so this is a known temporary divergence, enrolled below.

## Follow-up

- [ ] `docs/scope/scope.md`: remove A4-02 and A4-03 from feature 18's SRS pointer line, M4-03 from feature 15's, and M2-05 from feature 12's, so each story has exactly one owning feature. Belongs to the next `/scope` run.
- [ ] `spec/SRS.md` §4.5: add the program occurrence restored notification to the catalogue (audience all signed in users, push and in app, mutable, triggered by A4-03). Done as part of build slice 3; listed here because it edits the source of truth.
- [ ] When feature 28 adds notification categories (F4-19), confirm the cancel and restore notifications are filed under a mutable category and honour the member's preference.
- [ ] When feature 10 reworks deep links (F4-12, F4-13), consider a `programOccurrence` deep link type carrying the `occurrenceKey`, so a cancellation notice lands on the specific date rather than the program in general.
- [ ] If a second kind of retractable reminder appears, generalise the `occurrence?` argument on `notifications.dispatch` into a predicate rather than adding a second special case.
- [ ] AGENTS.md instructs loading the `klt-cyber-web-ui` and `klt-cyber-brand` skills for portal and mobile UI work, but neither is present in `.claude/skills/`. Either install them or correct AGENTS.md, since every UI feature is currently told to load something that does not exist.
- [ ] `convex/plannedActivities.ts` hardcodes `3 * 60 * 60 * 1000` instead of importing `KAMPALA_OFFSET_MS` from `convex/calendar.ts`, and duplicates the whole day walk from `convex/calendar.ts`. Not this feature's bug, worth fixing while in the file.
- [ ] `YearPlannerClient` buckets days by `localYmd`, which is browser local, and its own comment calls that a v1 simplification. This feature works around it by passing `item.date` rather than fixing it, so an admin in a different timezone still sees items bucketed on the wrong day in the grid itself.

## Post review corrections

`/code-review` on the full diff, 23 October 2026, after the manual verification pass recorded in [verify.md](./verify.md). Six findings, all fixed in the same branch; the manual pass predates them.

- **The 48 hour pre tick had no lower bound** (`OccurrenceDialog.tsx`). `start - Date.now() <= TWO_DAYS_MS` is also true of every date in the past, so a restore on an occurrence called off weeks ago arrived with "Notify members" pre ticked and the note strongly recommending it be left that way. One confirm would have pushed "X on Sun 12 Oct is back on" to the whole church. The bound is now a calendar day comparison (`isPastOccurrence`), not an instant one, so an occurrence that started earlier today still pre ticks as AC-5 intends.
- **`restoreOccurrence` did not gate its push on the date either** (`weeklyPrograms.ts`). It guarded only that the program still existed. The notification is now gated on the date being today or later, the program being active, and it still occurring on that day; the delete stays unconditional so the orphan escape hatch survives (AC-13).
- **The cron's up front cancellation skip was lossy.** See the build plan note above.
- **"Cancel this date" was offered on past days** (`DayPopup.tsx`), opening the full dialog only to fail on submit against AC-5. It is now hidden for a date that has gone, while a cancelled occurrence stays restorable whatever its date.
- **`listActivePrograms` read cancellations per program**, an N+1 across a reactive query three mobile screens subscribe to. It now does one windowed `by_date` read, the way both calendar paths already did.
- **The Year Planner year/quarter dot misreported a mixed day** (`MiniMonth.tsx`). The single program dot turned crimson when any program that day was off, so a day with one cancelled and one still running read as "the program that day is cancelled". A cancelled occurrence now adds a dot of its own rather than recolouring the running one.

Two supporting changes came with them: `KAMPALA_UTC_OFFSET_MS`, `kampalaToday` and `isPastOccurrence` moved into `@klt-cyber/shared` (with unit tests) so the portal and the backend cannot disagree about which day it is in Kampala, with `convex/calendar.ts`'s `KAMPALA_OFFSET_MS` now derived from it; and `getProgramCancellationsInRange` was deleted from `convex/lib/occurrences.ts` as its only caller is gone.
