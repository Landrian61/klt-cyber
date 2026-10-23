# 0009. Cancel and restore a single program occurrence — rationale

Reasoning, options and evidence behind [index.md](./index.md). `/develop` skips this file.

## Context

> ⚠️ Premise note: three of this feature's five SRS stories are also claimed by other scope features. A4-02 and A4-03 are listed under feature 18 (Administration core), M4-03 under feature 15 (Updates, Events and Programs), and M2-05 under feature 12 (Mobile shell and Home slots). Double ownership of a story is how two features each ship half of it, or how one silently ships nothing because the other was assumed to own it. This spec claims all five for feature 11 and feature 11 only. Features 12, 15 and 18 should drop them from their SRS pointer lines, and features 12 and 15 then inherit a working display pattern when they rebuild Home and Events and Programs rather than designing one. That edit to `docs/scope/scope.md` is enrolled in Follow-up and belongs to whoever next runs `/scope`.

Recurring programs already work. `convex/weeklyPrograms.ts` stores a program definition (a title, a recurrence of once, weekly, biweekly or monthly, the days of the week it falls on, a start time, and optional start and end date bounds), and three separate read paths expand that definition into virtual occurrences at query time: `calendar.getCalendarRange` for members, `plannedActivities.getYearPlannerRange` for Administration's Year Planner, and the daily reminder cron `checkWeeklyProgramReminders`. All three share one recurrence matcher, `weeklyProgramOccursOn` in `convex/lib/recurrence.ts`, and the two calendar queries already stamp each expanded occurrence with a stable `occurrenceKey` of `${programId}_${YYYY-MM-DD}`.

Nothing is persisted per occurrence. An occurrence exists only as a row in a query result, computed and discarded. So there is no record anywhere that one Wednesday's prayer meeting was called off, and consequently no way to mark it cancelled on any screen, and no way to stop its reminder. The code already admits this: `checkWeeklyProgramReminders` carries the comment *"There is no programExceptions mechanism in this schema, a called-off occurrence still gets reminded here; that is a known, documented gap, not silently worked around."*

The forces that shaped the design:

- **The reminder is already in flight.** The daily cron runs at 06:00 UTC, which is 09:00 Kampala, and handles occurrences landing tomorrow. It fires the day before push immediately and schedules the hour before push as a real Convex scheduled job at that same moment. So a cancellation entered at any point after 09:00 on the day before lands on an occurrence whose hour before reminder is already queued. F4-02 says reminders must never fire for a cancelled occurrence, with no "unless it was already scheduled" clause.
- **An occurrence has no identity of its own.** Anything that marks one has to invent a key, and that key has to survive an edit to the parent program. If the Wednesday service moves from 18:00 to 18:30, a cancellation of "the 18:00 Wednesday" must not quietly evaporate.
- **Three display surfaces already exist and they are not all occurrence shaped.** Mobile Home reads expanded occurrences from `getCalendarRange`. The mobile programs list and program detail screens read `listActivePrograms`, which returns program definitions and formats a schedule string such as "Every Wednesday", so they have no notion of a date at all. The Year Planner reads its own expansion.
- **Cancelling a service is a church wide announcement.** SRS N20 sends it to every signed in user, push and in app. That makes it a louder action than anything else on the Weekly program page, and it makes a duplicate send a real harm rather than a cosmetic bug.
- **Convex has no unique indexes.** "At most one cancellation per program per date" has to be enforced inside the mutation, the same way "one Elder per clan" already is.

## Options considered

### Option 1: A cancellation record keyed by program and calendar date

A new table holds one row per called off occurrence, keyed by the program's id plus the Kampala local calendar day as a `"YYYY-MM-DD"` string. No row means the occurrence is on. The three expansion paths each check the table for the range they are already walking and stamp `cancelled` onto the items they return. Restore deletes the row.

**Pros**:
- The key is the same string the `occurrenceKey` convention already uses, so it introduces no new concept and reads naturally in logs and in the audit trail.
- A date key is immune to an edit of the program's `startTime`, which is the single most likely program edit to happen after a cancellation exists.
- ISO date strings sort lexicographically in calendar order, so an index range query over a week, a month or a year works directly with `gte` and `lte`. There is no denormalized instant to keep in step.
- "No row means on" is the schema's own documented convention, already used by `notificationReads`, `roleAssignments` and `leadershipProgress`. Every read is a plain existence check with no status filter anyone can forget.
- Purely additive. One new table, no change to `weeklyPrograms`, so the staging deploy on merge to `main` stays backward compatible with live data.

**Cons**:
- A program edit that moves the day orphans the row. Harmless, because no read will match it, but it is invisible clutter that no cleanup pass removes.
- The current state lives in the table while the history lives in `activityLogs`, so answering "how many times has this been flip flopped" means reading the audit log, not the domain table.
- Three separate read paths each have to remember to do the lookup. A fourth expansion path added later could forget, and nothing would fail loudly.

### Option 2: Materialize occurrences into a real table

Generate a row per occurrence ahead of time, say a rolling year, and give each one a status. Cancellation becomes an ordinary field update on an existing row.

**Pros**:
- An occurrence gains a real identity, so notifications, deep links, per occurrence attendance and per occurrence overrides all become trivial later.
- No expansion logic at read time, so the calendar collapses to a plain indexed range query.

**Cons**:
- It replaces the one thing in this area that currently works well. The deliberate design note at the top of `convex/calendar.ts` says the calendar is a query and not a table precisely to avoid a redundant store that can drift from `weeklyPrograms`. This option introduces exactly that drift.
- Every program edit now has to regenerate or reconcile a window of rows, and a cron has to keep the rolling horizon topped up. That is a new background process whose failure mode is a calendar that silently stops showing anything past a certain date.
- Far more work than A4-02 and A4-03 ask for, and it is a one way door. Returning to query time expansion later means another migration.

### Option 3: An exceptions array on the program document

Store cancelled dates as an array field on the `weeklyPrograms` row itself, each entry carrying its date and reason.

**Pros**:
- No new table, and every read path that already loads the program gets the cancellations for free with no extra query.
- Cancelled dates travel with the program, so there is nothing to orphan.

**Cons**:
- Unbounded growth inside a document, which is exactly what the project's embed versus reference convention says to avoid: fixed size nested data embeds, anything unbounded becomes its own table. A weekly program running for years accumulates entries forever.
- Every cancel and restore rewrites the whole program document, so a cancellation collides with a concurrent program edit. Two admins acting at once can lose one of the two changes entirely.
- No way to index or range query across programs, so "every cancelled occurrence this month" means loading every program and filtering in memory.

## Rationale

Option 1. The decisive force is the note at the top of `convex/calendar.ts`: this codebase has already decided, deliberately, that occurrences are computed and not stored, and that a parallel store would drift from `weeklyPrograms`. Option 2 overturns that decision in order to deliver two SRS stories, and it does so by adding a background reconciliation process whose failure mode is silent. The project is a small team on one Convex deployment with a 29 November 2026 launch; a rolling materialization horizon is not something this team should be operating at 2am. Option 3 fails on the project's own embed versus reference rule and on the lost update problem, which matters here because the Year Planner and the Weekly program page are both live Convex subscriptions that two Administration users can genuinely have open at the same time.

Within option 1, the date string key is what makes it safe rather than merely small. The alternative key, the occurrence start instant, silently breaks on the most ordinary edit there is: moving a service by half an hour. A cancellation that quietly undoes itself because someone corrected a start time is a far worse failure than an orphaned row that nothing reads.

The reminder suppression choice is the part of this design that earns its keep. Checking the cancellation at dispatch time, rather than when the push was scheduled, holds unconditionally: it does not matter when the cancellation lands, even seconds before the push. The alternative, mirroring how `convex/events.ts` stores `weekBeforeReminderJobId` and `dayBeforeReminderJobId` and calls `scheduler.cancel`, works for events only because an event *is* a row that can hold a job id. An occurrence is not, so that pattern would force the cron to write an ephemeral bookkeeping row per occurrence per day, which is option 2's drift problem in miniature. The third alternative, an hourly cron that never schedules ahead, is conceptually the cleanest and was genuinely close; it loses on cost and precision, since it would scan active programs 24 times a day and pin reminder timing to an hour boundary, in order to avoid a problem that a short guard already solves completely.

Where that guard lives changed during the cross check, and the second answer is better. The first draft routed the hour before push through a new internal mutation that wrapped the dispatch. But `scheduleReminderEntries` in `convex/lib/reminders.ts` is hardwired to `internal.notifications.dispatch` and is shared by events, announcements, roles and profiles, so wrapping the target meant either editing that shared helper or bypassing it. Adding an optional `occurrence` argument to `dispatch` itself avoids both: no new function, the helper and all five existing call sites untouched, and one lookup inside the dispatcher. The honest cost is that a generic dispatcher now knows about program occurrences, which is recorded as a tradeoff and as a follow up to generalise into a predicate if a second retractable reminder ever appears.

The same guard also closes a bug that predates this feature. A program deactivated, or moved to another day, between the 09:00 cron and the hour before fire currently still sends its reminder, because nothing re checks the program after scheduling. Since the guard is already reading the program to check the cancellation, it checks those two conditions too.

One limit is worth stating plainly rather than burying. The day before push is fired immediately by the cron, not scheduled, so it cannot be retracted by any of these mechanisms. A cancellation entered at 14:00 for tomorrow means members received a reminder that morning and a cancellation notice that afternoon, in that order. The mitigation is to pre tick "Notify members" for an occurrence inside the next 48 hours, so the correction actually reaches the people who got the reminder. That is a mitigation, not a fix, and AC-6 is worded to promise only what the design can actually deliver: no reminder after the cancellation is recorded.

The restore notification is the one place this spec goes beyond the SRS as written. N20 defines a notification for cancellation only. But a church that is told Wednesday is off, and then has Wednesday quietly restored, has been actively misinformed by the app. The option chosen offers the same unticked "Notify members" on restore, and this spec requires an SRS amendment to record that event rather than shipping an undocumented notification. Spec 0008 set the precedent for amending the SRS notification catalogue in the same change that needs it.

## Evidence: what the four read paths do today

Read from the code at commit `6bfd92d`, on branch `feature/cancel-restore-program-occurrence`.

| Path | File | Reads | Produces | Needs the cancellation lookup |
|---|---|---|---|---|
| Member calendar | `convex/calendar.ts` `getCalendarRange` | active programs plus in range events | items stamped with `occurrenceKey`, `date`, `start` | yes, for the mobile Home week row (M2-05) |
| Year Planner | `convex/plannedActivities.ts` `getYearPlannerRange` | the same expansion plus planned activities, Administration gated | items stamped with `occurrenceKey`, `date` | yes, for the admin chips and day popup |
| Reminder cron | `convex/weeklyPrograms.ts` `checkWeeklyProgramReminders` | active programs occurring tomorrow | an immediate day before dispatch and a scheduled hour before dispatch | yes, for both tiers (F4-02) |
| Program definitions | `convex/weeklyPrograms.ts` `listActivePrograms` | active programs, no expansion at all | program documents; the client formats "Every Wednesday" | yes, and it needs new occurrence fields (M4-03) |

The fourth row is the one that bites. The mobile programs list and program detail screens have never dealt in dates, so M4-03 cannot be satisfied by stamping a flag onto something they already receive. They need the backend to compute a next occurrence and a list of cancelled dates ahead, which is the only reason the 8 week horizon exists in this design.

Two further facts from the same reading, both load bearing for the build plan:

- `plannedActivities.getYearPlannerRange` duplicates the day walk from `calendar.getCalendarRange` rather than sharing it, and even hardcodes `3 * 60 * 60 * 1000` instead of importing `KAMPALA_OFFSET_MS`. The cancellation lookup therefore has to be added in two places, which is an argument for extracting the lookup itself so the two copies at least agree. It cannot go in `convex/lib/recurrence.ts`, despite that being the obvious home: that file is deliberately pure, takes no `ctx`, and deliberately does not import from `convex/calendar.ts` so the two never form a circular import. Hence a new `convex/lib/occurrences.ts` for the database reading part.
- `YearPlannerClient` buckets items into days with `localYmd(selectedDay)`, which is browser local, while the items themselves carry the Kampala `date` the server stamped. Its own comment calls that a v1 simplification. Any mutation argument must therefore come from `item.date`, not from the clicked `Date`, or an admin outside Kampala cancels the wrong day.
- `DayPopup.tsx` renders program and event rows as inert `div` elements, with a comment saying programs and events are not editable from there because Weekly Program and Events own their own editing. Adding cancel and restore to those rows is a deliberate exception to that rule, so the comment needs updating in the same change to say why.
