# Verify: notification targeting · spec 0013 · updated 2026-10-28
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Milestone 1: private appointment notice and the role screen

### UI / manual
- [ ] As the Media HOD, appoint a verified Media roster member as delegate → the delegate gets a push "You are now the delegate for Media", and `listMyNotifications` for them holds one row with `kind: "N13"` and deep link `role_assignment` → AC-1, AC-18
- [ ] Same appointment → every other verified, active Media roster member gets "New delegate for Media" (`kind: "N14"`, deep link `new_leader`). A pending claimant, an unverified roster member, a removed member and a Finance only member get nothing, and none of them sees either row in their notification centre → AC-2, AC-3
- [ ] As System Admin, appoint a clan elder for Judah → the elder gets N13, Judah's verified members get N14, and an unverified Judah member gets nothing → AC-1, AC-2
- [ ] Appoint a System Admin → exactly one row is written (N13 to the appointee), with no N14 → AC-1
- [ ] Appoint an HOD to a department where they are the only roster member → only the N13 row is written, and no N14 row exists → AC-17
- [ ] Re-appoint a department's sitting HOD to the same department, and the same elder to the same clan → the same `roleAssignmentId` comes back, and no new `roleAssignments`, `activityLogs` or `notifications` row appears → AC-4
- [ ] As the appointee, tap the N13 push (and, separately, the in app row) → `/role-notice` shows "You are the delegate for Media", the role description, and "Open the web portal", which opens `EXPO_PUBLIC_PORTAL_URL` → AC-14
- [ ] Revoke that assignment from the portal, then reopen the notice → it shows "This role has ended" with no portal button → AC-14
- [ ] As a roster member who received N14, tap it → `/role-notice` shows "<name> is now the delegate for Media" with no portal button → AC-15
- [ ] As a member who did not receive N14, call `roles:getRoleNotice` with that assignment id and the N14 notification id (dashboard function runner, signed in as them) → `null`, and the screen shows "This notice is no longer available" → AC-15
- [ ] Open `/role-notice?id=<assignment>` as a non appointee with no `n` param (an older push) → "This notice is no longer available" → AC-15
- [ ] Delete the holder's account, then reopen the N14 notice as a roster member → "This notice is no longer available" → AC-15

### Value sourcing
- [ ] Appointee with no first or last name → N14 body and member view name them by email → appointee name row
- [ ] Appoint a `department_admin` → every surface says "delegate", never "Department Admin" → role label row
- [ ] Rename the department after appointing → the role screen shows the new name (read live), while the push text keeps the old one (frozen at send) → scope name row
- [ ] Verify a roster member's profile after the appointment, or add a new verified member → they do not receive the N14 already sent → department recipients row (frozen audience)
- [ ] Open `/role-notice` from the in app list and from an OS tap → both carry `n=<notificationId>` and the member view loads → `notificationId` on the route row

### Commands
- [x] `pnpm --filter @klt-cyber/shared test` → all pass, including `notifications.test.ts` → AC-18
- [x] `pnpm run test:convex` → all pass, including `notificationTargeting.test.ts` → AC-1, AC-2, AC-3, AC-4, AC-17
- [x] `npx tsc --noEmit -p convex`, and `npx tsc --noEmit` in `apps/mobile` and `apps/admin` → clean

### Acceptance criteria coverage (milestone 1)
- AC-1: steps 1, 3, 4 and the convex test · AC-2: steps 2, 3 · AC-3 (partial, new sends only; the retarget migration is milestone 4): step 2 · AC-4: step 6 · AC-14: steps 7, 8 · AC-15: steps 9 to 12 · AC-17: step 5 · AC-18: step 1 and the shared test

## Milestone 2: every ended role told once

### UI / manual
- [ ] Revoke a delegate from the portal (`revokeRole`) → the holder gets one N15 "Your role as delegate for Media has ended", body "Speak to Administration if this looks wrong.", and nobody else gets anything → AC-5
- [ ] Stand a delegate down from the department shell (`removeDelegate`) → exactly one N15, not two → AC-5
- [ ] Appoint a new HOD to a department with a sitting HOD → the old HOD gets one N15 with "Someone else now holds this role.", the new HOD gets N13, the roster gets N14, each once → AC-5
- [ ] Appoint a new elder to a clan with a sitting elder → the old elder gets one N15 with "Someone else now holds this role." → AC-5
- [ ] Appoint the HOD of Finance as HOD of Media → they get N15 for Finance with "Speak to Administration if this looks wrong." and N13 for Media → AC-5
- [ ] Remove a delegate from the Media roster (`removeDepartmentMember`) → exactly one notice, kind `N12`, whose body says the roster place and the delegate role both ended, and no N15 → AC-6
- [ ] Remove a plain roster member → the N12 reads as before, with no role sentence → AC-6
- [ ] Delete the account of someone holding a role → their assignment is `revoked` with the note cleared, a `role.revoked` audit entry exists (metadata scrubbed by the deletion), and no N15 row is written → AC-5
- [ ] Revoke an assignment that is already revoked → no new row in `notifications` or `activityLogs` → AC-7
- [ ] Tap an N15 → `/role-notice` shows "This role has ended" with no portal button → AC-5, AC-14

### Value sourcing
- [ ] Each N15 never names the person who ended the role → N15 copy row
- [ ] An N15 for a `replaced_*` reason versus a plain revoke uses the matching body line → "which body line" row

### Commands
- [x] `grep -rn 'status: "revoked"' convex --include=*.ts` (excluding tests) → only `convex/lib/roleNotices.ts` → invariant 2
- [x] `pnpm run test:convex` → the `endRoleAssignment` cases pass → AC-5, AC-7

### Acceptance criteria coverage (milestone 2)
- AC-5: steps 1 to 5, 8, 10 and the convex test · AC-6: steps 6, 7 · AC-7: step 9 and the convex test
- Not covered by automated tests: the auth wrapped paths (`revokeRole`, `removeDelegate`, `removeDepartmentMember`, `performDeletion`), because the harness cannot stand up Better Auth. The manual steps above cover them.

## Milestone 3: reviewer and claim alerts

### UI / manual
- [ ] With an Administration HOD and one delegate in place, submit a member profile from the mobile wizard → one `notifications` row, `kind: "N04"`, audience `users` holding exactly the HOD and the delegate, deep link `profile_review`. No System Admin is in the list → AC-8
- [ ] Make the Administration HOD also a delegate there, then submit again → they appear once in the audience, not twice → AC-8
- [ ] Revoke every Administration HOD and delegate, then submit → the N04 goes to the active System Admins instead → AC-8
- [ ] With no Administration leader and no System Admin (a fresh dev deployment), submit → no `notifications` row is written → AC-17
- [ ] A visitor submits with Media and Finance picked. Media has an HOD, Finance has none. Nothing goes to either HOD on submission. Verify the profile → the Media HOD gets one N10 "Someone asked to serve in Media", body "<claimant> wants to join the Media roster.", deep link `department_claim`. Finance writes no row → AC-9, AC-17
- [ ] A Media HOD's own pending claim on Media (seeded) is verified → no N10 → AC-9
- [ ] Verify the same profile a second time (dashboard function runner, as an Administration reviewer) → no new `notifications`, `activityLogs` or email, and `verifiedAt` is unchanged → AC-10
- [ ] Verify a fresh profile → the member gets N05 by push and in app (`kind: "N05"`, deep link `profile`, opens My Profile) and the verified email, with unchanged wording → AC-10
- [ ] Tap the N04 push as a reviewer → `/portal-work` shows "A profile is waiting for review" and "Open the web portal". Tap the N10 as the HOD → "Someone asked to serve in your department" → AC-16
- [ ] Open `/portal-work?type=hod_notice` → "You have a notice from another HOD". Open `/portal-work?type=nonsense` → "This notice is no longer available" → AC-16
- [ ] Tap a notice with an unknown deep link type → the app lands on Home → AC-16

### Value sourcing
- [ ] A claimant with no first or last name → the N10 body names them by email → N10 copy row
- [ ] Appoint a new Media HOD after the claim was written but before verification → the N10 goes to the new HOD (resolved at verification time), not the old one → N10 "the HOD" row
- [ ] A claim that the HOD already confirmed (now `active`) before verification → no N10 for it → "the person's pending claims" row
- [ ] With `EXPO_PUBLIC_PORTAL_URL` unset in a local build → `/portal-work` hides the portal button rather than opening nothing → portal button row

### Commands
- [x] `pnpm run test:convex` → the `resolveAdministrationReviewerIds` and `notifyClaimActionable` cases pass → AC-8, AC-9, AC-17
- [x] `grep -rn getAdministrationAuthorityUserIds convex apps` → no results (replaced by the reviewer resolver) → AC-8
- [x] `npx tsc --noEmit -p convex`, `npx tsc --noEmit` in `apps/mobile`, and `pnpm --filter mobile lint` → clean

### Acceptance criteria coverage (milestone 3)
- AC-8: steps 1 to 3 and the convex test · AC-9: steps 5, 6 and the convex test · AC-10: steps 7, 8 · AC-16: steps 9 to 11 · AC-17: steps 4, 5 and the convex test
- Not covered by automated tests: `submitProfile` and `verifyProfile` themselves (including the second verify no op), for the same Better Auth reason as milestone 2. The helpers they call are tested directly.

## Milestone 4: announcements push once, ended items still open

### UI / manual
- [ ] In the portal, create an announcement with "create and publish" → every user gets one N21 push (`kind: "N21"`, deep link `announcement`) → AC-11
- [ ] Disable it, then publish it again → no second push, no new `notifications` row → AC-11
- [ ] Create a draft, then publish it → one N21. Disable and publish again → none → AC-11
- [ ] Tap the N21 in the notification centre while the announcement is live → the detail opens with no ended banner → AC-12
- [ ] Set its end date to yesterday, then tap the same notice → the detail still opens, with "This announcement has ended" above the content → AC-12
- [ ] Disable it (back to draft), then tap the notice → "This announcement is no longer available". Archive another one and tap its notice → the same message → AC-12
- [ ] Open `/announcement-detail` with no `id` → the unavailable message, not an endless spinner → AC-12
- [ ] Open an event whose end time has passed → "This has ended" marker under the tags → AC-13
- [ ] Open a cancelled event whose end time has passed → only the cancelled notice, no ended marker → AC-13
- [ ] Open a group activity whose end time has passed → "This has ended" → AC-13
- [ ] Open an event still in the future → no marker → AC-13

### Value sourcing
- [ ] Set the phone clock forward past an announcement's `endDate` → the banner appears; set it back → it goes (the ended check is the device's `Date.now()`) → announcement ended banner row
- [ ] Same for an event's `endDateTime` → event/activity ended marker row
- [ ] After a publish, `firstPublishedAt` on the row equals the publish time and never changes on a later disable and republish → `firstPublishedAt` row, N21 gate row
- [ ] An announcement whose only log is `content.announcement_created` with `metadata.status: "draft"` and that was never published stays without `firstPublishedAt` after the backfill → backfill row

### Commands
- [x] `pnpm exec convex run notificationTargetingMigration:backfillFirstPublishedAt`, then `…:retargetAppointmentNotices`, then `…:verify` → `{ announcementsMissing: 0, appointmentRowsToAll: 0 }`. Done on dev on 2026-10-28 (6 announcements patched, 0 appointment rows). Staging and prod are still owed → AC-3, AC-11
- [x] Run the backfill again → `{ patched: 0 }` (idempotent) → AC-11
- [x] `pnpm run test:convex` → the `pushOnFirstPublish` and `notificationTargetingMigration` cases pass → AC-3, AC-11
- [x] `grep -rn "firstPublishedAt:" convex --include=*.ts` → written only in `announcements.ts` (`pushOnFirstPublish`) and the migration → invariant 4
- [x] `npx tsc --noEmit -p convex`, `npx tsc --noEmit` in `apps/mobile`, and `pnpm --filter mobile lint` → clean

### Acceptance criteria coverage (milestone 4)
- AC-3: the retarget command and its convex test · AC-11: steps 1 to 3, the backfill commands and the convex tests · AC-12: steps 4 to 7 · AC-13: steps 8 to 11
- Not covered by automated tests: `createAnnouncement` and `publishAnnouncement` themselves, for the same Better Auth reason as milestone 2. `pushOnFirstPublish`, which both call, is tested directly.
