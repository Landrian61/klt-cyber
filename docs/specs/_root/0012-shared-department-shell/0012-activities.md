# 0012c. Department activities

Child of [0012 Shared department shell](index.md). Covers S4-01 to S4-04 and acceptance criteria **AC-22** to **AC-27**.

## Summary

The authoring side of `groupActivities`, the table spec 0010 shipped with a member facing read and no way to create a row. An HOD or delegate creates, edits and cancels a department activity; verified roster members are notified and reminded once, about a day before. The page also shows the activities on a month calendar and lists church events, read only.

## Design

**What already exists**

`groupActivities` carries title, description, `startDateTime`, `endDateTime`, location, `coverImageUrl`, `owner` (department or clan), the three cancellation fields, and the created and updated stamps. The mobile app already reads it through `convex/upcoming.ts` and the shared detail screen. The table's own comment records that reminder job ids were left out because this feature owns the reminder tiers. So this child adds one field, the write mutations, the portal interface, and the notifications.

**Church local time**

The portal form collects a date, a start time and an end time. Those are read as **church local time** (Africa/Kampala, a fixed UTC+3 with no DST) and converted to a UTC instant on write, reusing `KAMPALA_UTC_OFFSET_MS` from `packages/shared/src/constants/weeklyPrograms.ts`, which `convex/calendar.ts` already derives its own offset from. No new timezone constant is added.

This matters because the browser's zone is not the church's. An HOD travelling abroad entering "18:00" means six in the evening in Kampala, and reading the browser's local zone would store the wrong instant. Storage stays an instant, so the mobile app and the calendar export keep working unchanged.

**Reminder tier**

One reminder, about 24 hours before `startDateTime`, to verified roster members (N23). One new field: `dayBeforeReminderJobId`.

The `events` table uses two tiers (seven days and one day) because a church event is published weeks ahead. A department activity is usually scheduled days out, so a seven day reminder would frequently be scheduled in the past and never fire. One tier is the smallest thing that satisfies F4-17, and a second can be added later as one more optional field.

| Moment | Behaviour |
|---|---|
| create | if the reminder time is still in the future, schedule it and store the job id; otherwise leave the field unset |
| update that moves `startDateTime` | cancel the stored job inside a try and catch, schedule a new one, store the new id |
| update that does not move the start | leave the job alone |
| cancel the activity | cancel the stored job and clear the field |

Two guards, because cancelling a scheduled function is best effort bookkeeping and not a guarantee:

1. **The job carries the start time it was scheduled for.** At dispatch it compares that against the activity's current `startDateTime` and delivers nothing if they differ. A cancel that lost the race (the job had already begun) therefore cannot fire a reminder for a time the activity no longer starts at.
2. **It re checks existence and cancellation**, the same dispatch time guard spec 0009 added for cancelled program occurrences.

`cancel` is wrapped in try and catch because cancelling a function that has already started or already run can throw.

**The audience is resolved at dispatch, not at schedule.** The job stores the activity id, not a recipient list, so a member confirmed onto the roster after the activity was created still receives the reminder. Resolving at schedule time would silently skip them.

**Mutations**

`createActivity({ departmentId, title, startDateTime, endDateTime, location?, description?, imageKey? })`, HOD or delegate or System Admin. Validates the shared title, description and location caps from spec 0010's `groupContent` constants and `cancellationReason` against the shared cancellation cap, requires `endDateTime` at or after `startDateTime`, writes the row with a department `owner`, schedules the reminder, dispatches N22 to the verified roster, and writes `department.activity_created` with `departmentId`.

A past dated activity is allowed. Leaders do record something that already happened, the member facing list filters by time anyway, and rejecting it would block a legitimate correction; it simply gets no reminder.

`updateActivity({ activityId, ...changed })`, same authority. Rejects an activity that is already cancelled. Reschedules the reminder when the start moves.

**Notification volume is deliberately narrow.** N22 fires on an edit only when the date, start time, end time or location changed, and on cancellation. Editing the title, description or image notifies nobody. Notifying on every keystroke level correction would train the roster to ignore N22, which is the channel that carries a real time change.

`cancelActivity({ activityId, reason? })`, same authority. Sets `cancelledAt`, `cancelledBy` and the capped `cancellationReason`, cancels the reminder job, dispatches N22 as a cancellation, writes `department.activity_cancelled`. The row stays listed and marked until its end time passes; cancelling never deletes. Restoring is deliberately out of scope, since the SRS does not ask for it the way A4-03 does for program occurrences.

`imageKey` is an R2 object key, uploaded through the portal's existing R2 path and resolved on the way out by `resolveCoverUrls`, exactly as spec 0010's read side expects. A failed upload leaves the activity created without an image **and shows the author a visible warning**, so a dropped attachment is never silent.

**Reads and the clock**

`listForDepartment({ departmentId, from, to, now })` returns the department's own activities over the window from the `by_department_start` index, plus church wide events, marked read only.

`now` is an explicit argument the client supplies, rounded down to the minute. This is not ceremony: **a Convex query cannot react to the passage of time.** A query that called `Date.now()` server side would compute "has this ended" once and never re run, so a cancelled activity would sit on screen past its end time until some unrelated write invalidated the subscription. Passing `now` makes the client's clock the trigger, so the subscription re runs each minute and the boundary is deterministic and testable.

Church events restricted to selected departments are **not** in scope here. A5-02's audience field is feature 18's to define, so this child includes church wide events only and joins the narrower ones when that field exists. Guessing the shape now would hard code an assumption into a read that feature 18 would then have to unpick.

The month calendar renders from the same query over a month window and reuses the Year Planner's existing calendar grid helpers (`areas-of-service/admin/year-planner/calendarGrid.ts`) rather than a second calendar implementation; the week starts on the same day the planner already uses, so the two read alike.

**The planner query**

`listAllForPlanner({ from, to })` returns any department's activities with the owning department name, gated to Administration authority and System Admin, bounded by the window. A7-01's planner interface belongs to feature 18, so this child ships only the query. The umbrella's AC-27 is scoped to the query for that reason; asserting the rendered planner here would be an acceptance criterion this feature cannot verify.

## Build tasks

1. Add `dayBeforeReminderJobId` to `groupActivities`, satisfies **AC-24**.
2. Build `createActivity` with church local time conversion, validation, the department `owner`, the N22 dispatch, the reminder schedule and the audit entry, satisfies **AC-22**, **AC-23**, **AC-24**.
3. Build `updateActivity` and `cancelActivity` with the reschedule and cancel paths wrapped in try and catch, the cancellation fields, and the narrowed N22 dispatch rule, satisfies **AC-23**, **AC-24**, **AC-25**.
4. Build the reminder function with both guards (expected start time match, plus existence and cancellation) and dispatch time audience resolution, satisfies **AC-24**.
5. Build `listForDepartment` taking an explicit `now`, returning own activities plus read only church wide events, satisfies **AC-25**, **AC-26**.
6. Build the shared Activities page: the list, the create and edit dialog behind `can.createActivity` and `can.editActivity`, the cancel action with its reason, the "Cancelled" treatment, the month calendar on the planner's grid helpers, and the image upload warning path, satisfies **AC-22**, **AC-25**, **AC-26**.
7. Build `listAllForPlanner` for feature 18 to render, satisfies **AC-27**.

## Rationale (short)

One reminder tier rather than two because the catalogue lists N23 as a single reminder and a department activity is scheduled days out, so an event style seven day reminder would often be scheduled in the past. The expected start time guard matters more than the stored job id: cancelling a scheduled function is best effort, whereas comparing the start at dispatch is what actually guarantees a moved or called off activity never reminds anyone. Resolving the audience at dispatch rather than at schedule means a member confirmed after the activity was created still gets reminded. The explicit `now` argument exists because Convex queries are reactive to data and not to the clock, which is a real correctness issue and not a style preference. Church local time is reused from the existing Kampala constant rather than redefined, since a second definition is exactly how a form and a server come to disagree about which day an activity falls on.

## Edge cases

- An activity created less than 24 hours before it starts gets no reminder, and the field stays unset rather than scheduling in the past.
- An activity edited to start sooner than 24 hours away has its reminder cancelled and not rescheduled.
- An activity whose start moves repeatedly cancels and reschedules each time; only one job id is ever stored, and a stale job that fires anyway delivers nothing because the start no longer matches.
- A cancelled activity cannot be edited; the mutation rejects.
- `endDateTime` before `startDateTime` is rejected, matching the event rule. A zero length activity (end equal to start) is allowed.
- A past dated activity is allowed and simply never reminds.
- A department with no activities shows an explicit empty state, and the calendar renders an empty month rather than nothing.
- Pending claimants are not notified and not reminded, which follows from the `department` notification audience resolving to verified members only.
- An activity whose image upload fails is created without the image and the author sees a warning.
- Cancelled activities still occupy a place in the dashboard's "next few upcoming" list, marked, rather than being skipped, so a leader sees that the slot is called off.
