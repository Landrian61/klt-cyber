# Verify: cancel and restore a program occurrence · spec 0009 · updated 2026-10-22
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Signed in as a System Admin (or Administration HOD / `department_admin`) at
`/areas-of-service/admin/year-planner` unless a step says otherwise. Mobile
steps run in the Expo app signed in as an ordinary member.

## UI / manual

### Cancel and restore, end to end
- [ ] Month view → click a future day carrying a program → the day pop-up lists it with a "Cancel this date" button → AC-1
- [ ] Click "Cancel this date" → the dialog names the program and the date, offers an optional reason with a `0 / 200` counter, and says members can see the reason → AC-1
- [ ] Type a reason, leave "Notify members" unticked, confirm → the dialog closes and the day chip turns crimson with a struck-through title → AC-1, AC-9
- [ ] Re-open that day → the row reads "Cancelled", shows the reason underneath, and offers "Put it back on" and "Edit reason" → AC-9
- [ ] Switch to Week view → the same chip is crimson and struck through. Switch to Year and Quarter → that day's program dot is crimson → AC-9
- [ ] Click "Put it back on" → confirm → the chip returns to gold and the "Cancel this date" button is back → AC-3
- [ ] Type a 201-character reason → the counter turns red and confirming shows "A reason can be at most 200 characters." → AC-1
- [ ] Enter a reason of only spaces → confirm → the occurrence is cancelled with no reason shown anywhere → AC-1

### Notify members
- [ ] Cancel an occurrence more than 48 hours away → "Notify members" is UNTICKED by default → AC-2
- [ ] Cancel an occurrence less than 48 hours away → "Notify members" is PRE-TICKED, with the "within the next two days" note below it → AC-2
- [ ] Restore an occurrence less than 48 hours away → same pre-tick and note → AC-3
- [ ] Cancel with "Notify members" ticked → on the phone, one push arrives titled `Cancelled: <program>` with a body naming the program, the date as e.g. "Thu 22 Oct", and the reason; tapping it opens that program's detail screen → AC-2
- [ ] Open the in-app notification centre → exactly ONE row for that cancellation, not two → AC-2
- [ ] Restore that occurrence with "Notify members" ticked → the restore dialog first warns that members were already told it was cancelled; afterwards one push arrives titled `Back on: <program>` → AC-3
- [ ] Cancel with "Notify members" unticked → no push, no in-app row, and restoring shows NO "members were already told" warning → AC-2

### Reason correction
- [ ] On a cancelled row click "Edit reason" → the dialog opens pre-filled with the current reason and offers NO "Notify members" tick → AC-4
- [ ] Change the reason and save → the pop-up and the mobile app show the new wording, and no push arrives → AC-4
- [ ] Clear the reason entirely and save → the reason disappears from the pop-up and the app, and the row still reads "Cancelled" → AC-4

### Mobile surfaces
- [ ] Home → "This week's programs": a cancelled occurrence keeps its chronological place, carries a crimson CANCELLED badge over a struck-through title, still shows its day and time, and still opens program detail when tapped → AC-7
- [ ] Programs list → each row shows a "Next: <date>" line; for a program whose next date is off it reads crimson with a "Cancelled" pill → AC-8
- [ ] Program detail of a program with cancelled dates ahead → a "NOT HAPPENING" section lists each date with its reason; a program with none shows no such section → AC-8
- [ ] Screen reader on the Home card and the Programs row → the cancellation is announced, not conveyed by colour alone → AC-7, AC-8

### Authorization
- [ ] Signed in as an ordinary member → `/areas-of-service/admin/year-planner` is unreachable, but the mobile app still shows the occurrence as cancelled with its reason → AC-11
- [ ] Signed in as an HOD of a department other than Administration → the same: no planner access, correct member-side display → AC-11

## Commands

### Validation and the duplicate rule (`pnpm exec convex run` as an authorized caller, or the Convex dashboard)
- [ ] `weeklyPrograms.cancelOccurrence` twice for the same program and date → the second throws `"This occurrence is already cancelled."`, `convex data programOccurrenceCancellations` holds exactly ONE row for that pair, and only one notification was sent → AC-12
- [ ] `cancelOccurrence` with yesterday's date → rejected ("That date has already passed.") → AC-5
- [ ] `cancelOccurrence` with a date the program does not run on → rejected ("This program does not run on that date.") → AC-5
- [ ] `cancelOccurrence` on a program switched off → rejected → AC-5
- [ ] `cancelOccurrence` for a Wednesday program at 09:00, run after 11:00 Kampala on that Wednesday → ACCEPTED (an occurrence that already started today is still cancellable) → AC-5
- [ ] `restoreOccurrence` on an occurrence that is not cancelled → rejected ("This occurrence is not cancelled.") → AC-5
- [ ] `cancelOccurrence` as a signed-in member, as a visitor, and as a non-Administration HOD → each rejected → AC-11
- [ ] `updateCancellationReason` on an occurrence that is not cancelled → rejected → AC-4

### The reminder guarantee
- [ ] With an occurrence TOMORROW: run `internal.weeklyPrograms.checkWeeklyProgramReminders` → the hour-before job appears in the scheduler. Now cancel the occurrence. Let the job fire → NO notification is dispatched → AC-6
- [ ] Cancel an occurrence happening tomorrow FIRST, then run `checkWeeklyProgramReminders` → it schedules nothing at all for that occurrence → AC-6
- [ ] Run the cron, then switch the program off (`toggleProgramActive`) → the already-scheduled hour-before push still returns early → AC-6 (invariant 5)
- [ ] Run the cron, then `updateProgram` to move the program to a different weekday → the already-scheduled push still returns early → AC-6 (invariant 5)
- [ ] Confirm the cancellation and restore notifications themselves are NOT suppressed by the same guard (they carry no occurrence argument) → AC-2, AC-3

### Orphan behaviour
- [ ] Cancel a Wednesday occurrence → `updateProgram` to run on Thursdays → no query reports a cancellation anywhere (planner, calendar, mobile) → AC-13
- [ ] Edit it back to Wednesdays → the cancellation reappears on that date → AC-13
- [ ] With the program edited away from the cancelled date, call `restoreOccurrence` → it still succeeds and the row is gone → AC-5

### Audit trail
- [ ] After one cancel, one restore and one reason correction, check `activityLogs` → three rows with actions `content.program_occurrence_cancelled`, `content.program_occurrence_restored`, `content.program_occurrence_reason_updated`, each naming the actor and carrying `programId` and `date` in metadata → AC-10

### Shared contract
- [ ] `pnpm --filter @klt-cyber/shared test` → the `weeklyPrograms` suite passes → AC-1, AC-2
- [ ] `pnpm exec convex data programOccurrenceCancellations` → the table exists with the `by_program_date` and `by_date` indexes live

## Value sourcing (one step per row of the spec's table)

These exercise where each value comes FROM, not just that something appears.
The timezone ones are the dangerous rows: they pass on a Kampala machine
whatever the code does.

- [ ] **Occurrence `date` comes from `item.date`, never a browser-local string.** Set the browser timezone to `America/Los_Angeles` (or `Pacific/Kiritimati`), open the planner, cancel a program occurrence, then read the stored row → `date` is the Kampala calendar day the server stamped, NOT the day before or after → AC-1
- [ ] **"Today in Kampala" drives the past-date rejection.** With the server clock near 23:00 Kampala, cancel today's occurrence → accepted. With a date one day earlier → rejected → AC-5
- [ ] **The midnight instant fed to `weeklyProgramOccursOn`.** Cancel a date on a biweekly program's OFF week → rejected; on its ON week → accepted. Repeat for a monthly program's 2nd-Sunday and a non-2nd Sunday → AC-5
- [ ] **`cancelledBy` is the acting admin.** Cancel as the Administration HOD, then read the row → `cancelledBy` is that HOD's `users._id`, not the program's `createdBy` → AC-10
- [ ] **The stored reason is trimmed and capped.** Submit `"  repainting  "` → stored as `"repainting"`. Submit 200 characters → stored whole. Submit 201 → rejected → AC-1
- [ ] **`formatOccurrenceDate` is the single date wording.** Compare the push body, the dialog header and the mobile "NOT HAPPENING" row for the same occurrence → all three read the same e.g. "Thu 22 Oct" → AC-2, AC-8
- [ ] **A long reason is truncated in the PUSH only.** Store a 150-character reason → the push body carries it shortened to 120 with an ellipsis, while the pop-up and the app show all 150 → AC-1, AC-2
- [ ] **Audience is every signed-in user.** Cancel with notify on → a member, a visitor and another admin all receive it → AC-2
- [ ] **`createdBy` on the notification is the acting admin, not the program's creator.** Read the `notifications` row after a cancel → AC-2
- [ ] **The deep link is the program.** Tap the cancellation push → lands on `/program-detail?id=<programId>` → AC-2
- [ ] **`imageUrl` is the program's cover.** Cancel a program that has a cover image → the dispatched notification carries that cover → AC-2
- [ ] **`notifiedAt` is written only when a notification was scheduled.** Cancel with notify OFF → `notifiedAt` absent and the restore dialog shows no warning. Cancel with notify ON → `notifiedAt` set and the warning appears → AC-2, AC-3
- [ ] **The pre-tick comes from the occurrence's start instant.** Open the cancel dialog for an occurrence 12 hours out → ticked; for one 72 hours out → unticked → AC-2
- [ ] **The two read paths key cancellations by `programId_date`.** With two different programs both running on the same day, cancel ONE → only that one reads as cancelled in the planner, the member calendar and mobile Home → AC-7, AC-9
- [ ] **`nextOccurrence` is by calendar day, not by instant.** For a program that started two hours ago today, the Programs list still shows TODAY as "Next" rather than skipping to next week → AC-8
- [ ] **`nextOccurrence` reaches a monthly program's next slot.** A monthly program five weeks out still reports a next occurrence; a program carrying neither `startTime` nor the legacy `time` reports none and shows no "Next" line → AC-8
- [ ] **`cancelledUpcoming` spans the 8-week window and no further.** Cancel a date 7 weeks out → listed on program detail. Cancel one 10 weeks out → not listed → AC-8
- [ ] **The dispatch's early return reads all three conditions.** Covered by the four reminder-guarantee steps above → AC-6
- [ ] **The Cancelled treatment uses the design system's secondary role.** Inspect the portal chip (`crimson` token, not a hex literal) and the mobile badge (`Colors.secondary`) → AC-7, AC-9

## Acceptance-criteria coverage

- AC-1 · covered by the cancel-and-restore steps, the reason validation commands, and the trim/cap value-sourcing step
- AC-2 · covered by the Notify members block, the push body steps, and the audience / createdBy / deepLink / imageUrl / notifiedAt / pre-tick value-sourcing steps
- AC-3 · covered by the restore steps, the already-told warning, and the restore pre-tick
- AC-4 · covered by the Reason correction block and the `updateCancellationReason` rejection command
- AC-5 · covered by the validation commands, the restore-an-orphan step, and the three date-derivation value-sourcing steps
- AC-6 · covered by the four reminder-guarantee commands, plus the step confirming cancel/restore notices are not themselves suppressed
- AC-7 · covered by the mobile Home step, the screen-reader step, and the two-programs-one-day step
- AC-8 · covered by the Programs list and program detail steps, and the nextOccurrence / cancelledUpcoming value-sourcing steps
- AC-9 · covered by the chip steps across month, week, year and quarter views and the day pop-up reason step
- AC-10 · covered by the Audit trail command and the `cancelledBy` value-sourcing step
- AC-11 · covered by the Authorization UI steps and the three-callers rejection command
- AC-12 · covered by the duplicate command (one row, one notification, exact error text)
- AC-13 · covered by the Orphan behaviour commands
