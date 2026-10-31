# Verify: profile lifecycle core · spec 0014 · updated 2026-10-30
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

> **`/check verify` run 2026-10-31 (second run, after the push): PARTIAL.**
> The code is now live on the dev deployment, and the MEMBER OWNED half of this
> feature was driven for real against it: a verification identity was created
> through the mobile sign up path, submitted a profile, edited it, resubmitted
> it, and hit every gate. Those proofs are recorded in "Function level proof"
> at the end of this file.
>
> The REVIEWER half is still unproven, for one reason: it needs Administration
> authority, and there is no self serve path to that (the seed bootstrap is an
> `internalMutation`, and `assignRole` needs System Admin). Every step below
> that begins "As an Administration HOD" or "As a reviewer" is therefore
> untouched, as is every step that needs a browser (none is available here) or
> an R2 upload.

## Milestone 0: the widening reaches everything that reads the status

Run this before any profile is sent back. A `sent_back` row meeting code that assumes two values is the one way this feature breaks something that works today.

- [x] `npx tsc --noEmit` in `apps/admin` after widening the query output → clean, proving `DashboardRosterTable.tsx` and `demographicsUtils.ts` no longer hard type two values → AC-31
- [ ] Put one profile into `sent_back` by hand on dev, then open the Administration dashboard → that person is counted as not yet verified, not dropped from the total, and the sent back number shows beside it → AC-31
- [ ] Open the dashboard charts, the roster table and the cross tab explorer with that row present → they bucket it as "Not yet verified", and no chart, filter or CSV export silently omits the person → AC-31
- [ ] Open that person's row in System Admin users → the detail page labels them with their real state, not a flat "pending" → AC-31
- [ ] Sign in as that person on mobile → the sent back screen opens. They are **not** shown "Complete your profile", **not** routed to `/(tabs)`, and the pill does not read VISITOR → AC-31
- [ ] Open a member only area as that person → the gate explains their profile needs a change, naming the Administration team, not "the elders" → AC-31, AC-26
- [ ] Confirm `app/_layout.tsx`'s own `isPending` was left alone (it is Better Auth's session flag) and the splash still behaves → AC-31

## Milestone 1: send back, edit while waiting, resubmit

### UI / manual
- [ ] Sign up a fresh visitor, complete the wizard, and land on the pending screen → it says the profile is with the Administration team, carries no "welcome home" or "in the family" language, and shows an "Edit my submission" action → AC-26, AC-27
- [ ] As that visitor, tap "Edit my submission" → the seven step wizard opens pre filled with everything submitted, including children, leadership rows, clan and the Areas of Service claims → AC-6
- [ ] Change the phone number and a child's name, save → both are stored, and as an Administration reviewer the queue row shows the new values without a reload → AC-6, AC-11
- [ ] As an Administration HOD, open that profile and send it back with a reason of about 40 characters → the profile leaves the queue, appears in the sent back list with the reason, the reviewer and the time, and the visitor receives a push → AC-2, AC-3, AC-8
- [ ] Try to send a profile back with an empty reason and with one character → the confirm stays disabled, and calling the mutation directly with each is rejected → AC-1, AC-2
- [ ] As the sent back visitor, reopen the app → the sent back screen shows the reviewer's exact words and one action to open the submission. It does not read as a rejection → AC-4
- [ ] Check the visitor's email → the profile sent back template arrives carrying the reason, from the configured sending address → AC-3
- [ ] Edit and save from that screen → the profile returns to the queue marked "Resubmitted", the earlier reason is visible to the reviewer on the review screen, and the Administration reviewers receive a fresh alert → AC-4, AC-5
- [ ] Send the same profile back a second time with a different reason → the new reason replaces the old one, a second email arrives, and the sent back list shows the latest reason → AC-9
- [ ] Verify that profile → the person becomes a member, gets the verified notice naming the Administration team, and the profile leaves both lists → AC-26
- [ ] Try to send the now verified profile back → rejected → AC-9
- [ ] Open the sent back list when nothing is sent back → the empty state reads as "nothing is waiting on anyone", not as an error → AC-8

### Stale guard
- [ ] Open a pending profile as a reviewer in the portal. In a second session as the owner, change the first name and save. Back in the portal, without reloading, press Verify → rejected with the message that the person just edited their profile, and the owner's new value is still stored → AC-7
- [ ] Repeat with Send back instead of Verify → same rejection, and the profile is still `pending_verification` → AC-7
- [ ] As the owner, change only a **child's** name (not a profile field), then press Verify in the stale portal tab → still rejected, proving the child mutation bumped `memberProfiles.updatedAt` → AC-7
- [ ] Repeat for a leadership row edit, a clan change, a sharing toggle and an Area of Service change → each one makes the reviewer's held `updatedAt` stale → AC-7
- [ ] Two reviewers open the same profile. The first sends it back. The second, without reloading, presses Verify → rejected with the message that **another reviewer** sent it back, not the message about the owner editing → AC-7
- [ ] Reload the portal and verify → succeeds, carrying the owner's newer value → AC-7
- [ ] Send a profile back, then verify it from the sent back list without the person resubmitting → it verifies, and the stored row has no `sentBackReason`, `sentBackBy` or `sentBackAt` left → AC-34

### Permissions
- [ ] As a plain verified member, call `memberProfiles.sendProfileBack` and `memberProfiles.listSentBack` (dashboard function runner, signed in as them) → both rejected or `null` → AC-10
- [ ] As the HOD of a department other than Administration, the same two calls → same result → AC-10
- [x] Signed out, call `listSentBack` → `null` rather than an error → AC-10

## Milestone 2: everything a member owns

### UI / manual
- [ ] As a verified member on mobile, edit every section of the profile (personal, contact, family, children, profession, clan, leadership) and save → each change is stored, and `activityLogs` holds a `profile.edited` row → AC-11
- [ ] As the same member on the portal's Settings page → the same fields are editable, not eight, and a change made on one surface shows on the other → AC-12
- [ ] Add a child, rename that child, remove them → each is stored and logged, and the rename leaves the row's `_id` unchanged (check in the dashboard) → AC-13
- [ ] Add a leadership row, change its status, remove it → stored and logged, and no row is written with the legacy `in_progress` status → AC-13
- [ ] Change the mentorship status to Enrolled → saves. Try Completed → refused, and the screen says Administration confirms that step → AC-16
- [ ] As a reviewer, set a member's mentorship to Completed through verification. As that member, open the form and save an unrelated field → it saves, and mentorship stays Completed → AC-16
- [ ] As that same member, try to change mentorship from Completed back to Enrolled → refused, so a confirmation cannot be self reverted → AC-16
- [ ] Clear a phone number, an address and a next of kin through the form → each is actually unset on the row, not left at its old value → AC-11
- [ ] Try to change your clan from the profile edit form → the form routes it through the clan picker, and `updateMyProfile` carries no clan argument at all → AC-11
- [ ] Replace the profile photo, then walk every surface that renders one: the mobile profile header, the wizard's personal step, the three portal layout avatars, the System Admin users list and user detail, the activity feed, the dashboard feed and the roster → all show the new photo, none shows the old Google avatar → AC-14
- [ ] Check the stored `users` row after that upload → `profilePictureUrl` is unchanged, holding the Google URL or nothing → AC-14
- [ ] Replace a mentorship proof and a leadership proof → each old R2 object is gone from the bucket → AC-18
- [ ] Replace a photo whose previous value was a Google URL → nothing is sent to the bucket and no error is logged → AC-18
- [ ] Complete the wizard as a fresh visitor → the last step asks the directory sharing choice. Leave it unanswered → the stored row has no `directorySharing` value and the member reads as private → AC-17
- [ ] Toggle sharing on and off as a verified member → stored each way → AC-17

### Name mirrored, photo resolved
- [ ] As a reviewer, correct a pending person's last name during verification → that new name shows on the profile screen, in notification bodies, in the admin member list and in the account panel, with no stale copy anywhere → AC-14
- [ ] Check the stored `users` row → `firstName` and `lastName` match the profile → AC-14
- [ ] Sign in with Google and do not upload a photo → every avatar falls back to the Google URL → AC-14
- [x] Search the repository for `profilePictureUrl` in client code → exactly ONE deliberate read is left, `apps/mobile/app/profile-completion/personal.tsx`, which offers the account photo for the person to COPY into their profile and so needs the durable account URL rather than a display URL that expires. It carries a comment saying so. Every other client reads the resolved field its query returns → AC-14
- [ ] Leave a session open for long enough that a signed R2 URL would have expired, then reload → the avatar still renders, proving the URL is resolved per read and not stored → AC-14

### The backfill
- [ ] On dev, create name drift by hand (patch a `users` name away from its profile), run the migration → it reports one row patched and the two agree afterwards → AC-15
- [ ] Check a row whose profile photo is an R2 key → `users.profilePictureUrl` was not touched by the migration → AC-15
- [ ] Run it again → it reports zero patched → AC-15
- [ ] Anonymize an account (spec 0008's deletion), then run it → that row is skipped and stays anonymized → AC-15
- [ ] Run on staging, then production, recording the counts each time → AC-15

## Milestone 3: Areas of Service and clan

### UI / manual
- [ ] As a verified member with no departments, add one → a pending claim appears, that department's HOD is notified, and the claim shows as pending on the member's own profile → AC-19
- [ ] Add two more, then try a fourth → refused, naming the three area limit. Confirm one of the three as the HOD, then try a fourth again → still refused, because active and pending count together → AC-19
- [ ] Try adding a department already claimed, and one already served in → each refused with that department named and the right wording for its case → AC-19
- [x] As an unverified pending visitor, call `addMyAreaOfService` → refused → AC-19
- [ ] Withdraw a pending claim → it disappears from the member's pending list, the HOD is notified, and the row is terminal with `decidedBy` set to the member → AC-20
- [ ] Leave an active Area of Service as a plain roster member → the seat goes, the HOD and delegate are notified, and the action is logged → AC-21
- [ ] As that department's HOD, try to leave its roster → refused with an error naming the HOD role and saying it has to be ended first, and the seat is unchanged → AC-21
- [ ] As that department's delegate, the same → same refusal naming the delegate role → AC-21
- [ ] Set a clan as a verified member with none → saves, the new clan's elder is notified (N26), and `profile.clan_changed` is logged → AC-22
- [ ] Change to a different clan → the new elder is notified and the previous clan's elder is told they lost a member → AC-22
- [ ] Change into a clan that has no sitting elder → the change succeeds and nothing fails → AC-22
- [ ] Clear the clan → succeeds, only the outgoing elder is notified → AC-22
- [ ] Complete the wizard's clan step → the option reads "I don't know my clan", and choosing it stores no clan → AC-23
- [ ] As a verified member with no clan, open the profile on mobile and in the portal → both read "Your clan will be assigned by the Hospitality team" → AC-24
- [ ] As a pending visitor with no clan → the neutral wording, not the Hospitality sentence → AC-24

### F2-10, prove the three rules
- [ ] As a department HOD, look at the roster while an unverified person has claimed it → they appear in their own pending section, marked not yet verified, and are not counted in any member total on that page → AC-25
- [ ] Check that department's dashboard cards and the Administration dashboard → the unverified claimant is in no count and in no chart → AC-25
- [ ] Try to appoint that unverified claimant as HOD, and as delegate → both refused by the server, not merely hidden → AC-25
- [ ] Pass means all three: the claimant is in the roster's pending section, excluded from the member total on that page and from both dashboards' verified counts, and rejected server side by both the HOD and the delegate appointment calls. Record any that fails; only those become build work in slice 5 → AC-25

## Milestone 4: copy and the two bugs

### UI / manual
- [ ] Search the repository for "the elders", "church office", "church admin", "Welcome home" and "in the family" in member facing strings → none remain outside a comment → AC-26, AC-27
- [ ] Walk every surface that names the reviewer (pending screen, member gate, profile banner, verified notice, the sent back notice, each email template, the portal work screen) → every one says "the Administration team" → AC-26
- [ ] Send a profile back as an Administration HOD → nothing the member reads names that reviewer personally → AC-26
- [ ] Open the profile screen as a member whose mentorship is `not_enrolled`, then `enrolled`, then `completed` → the row reads Not Enrolled, Enrolled, Completed in turn, never a fixed value → AC-28
- [ ] Open the same member on the department roster read → the same real status → AC-28
- [ ] In the wizard's family step, search a spouse by name → results show name and photo, no email anywhere on the row → AC-29
- [ ] Search by a full email address known to exist → no results, since email is no longer matched → AC-29
- [ ] Search a name belonging to a registered but unverified person → no results, and the free text "not registered" fallback accepts their name → AC-29
- [ ] Search your own name → you are not in the results → AC-29
- [ ] Search a deleted account's old name → no results → AC-29

### Value sourcing
- [ ] Send back a profile whose owner has no first or last name set → every notice and the email name them by email rather than rendering blank → `sendProfileBack` reviewer rows
- [ ] Resubmit when Administration has no HOD and no delegate → the alert falls back to System Admins, and with neither it is skipped without failing the save → AC-4
- [ ] Verify a profile whose photo is an R2 key, then read the account panel → the avatar renders, proving `users.profilePictureUrl` was not given the key → AC-14
- [ ] Leave a department whose name was changed after the seat was created → the error and the notice both use the current name → `departments.name` row

### Commands
- [x] `pnpm --filter @klt-cyber/shared test` → all pass, including the new profile lifecycle constants test → AC-1, AC-26
- [x] `pnpm run test:convex` → all pass, including the new profile lifecycle tests → AC-30
- [x] `npx tsc --noEmit -p convex`, and `npx tsc --noEmit` in `apps/mobile` and `apps/admin` → clean
- [x] `pnpm lint` → clean

---

## After the build: what only became checkable once it landed

_Appended by `/develop` on 2026-10-31, after slices 0 to 5. These are the
checks that depend on implementation choices the spec left open, plus the one
deploy step without which nothing below can run._

### Before anything else: the generated API

- [ ] `pnpm convex` (or `pnpm exec convex codegen`) → `convex/_generated/api.d.ts` gains `leadershipProgress`, `identityMigration` and `lib/profileLifecycle`. Two modules are NEW in this feature, so the clients cannot call them until this runs. The repo typechecks without it only because no client calls `api.leadershipProgress.*` yet.

### The guards live in one place now

The spec put the stale check, the reason bounds, the mentorship line, the
departure block and the cap inside their mutations. They were extracted to
`convex/lib/profileLifecycle.ts` so they could be tested at all: a mutation
resolves its caller through Better Auth, which the harness cannot stand up.

- [x] Read `convex/lib/profileLifecycle.ts` → each guard throws `ConvexError({ code })` from `PROFILE_LIFECYCLE_ERRORS`, and no guard is duplicated in a mutation body → AC-32
- [x] Grep for `assertNotStale` → both `verifyProfile` and `sendProfileBack` call it, and neither has its own comparison → AC-7
- [x] Grep for `assertUnderDepartmentCap` → `addMyAreaOfService` uses it. `resubmitProfile` deliberately does NOT: it caps the whole SET it was sent, not "one more on top", and says so in a comment → AC-19

### The name backfill runs to completion, not just once

It pages, so one call is not the whole table. It returns a `cursor`.

- [ ] On dev with more than 200 profiles, run `pnpm exec convex run identityMigration:backfillUserNames` → it returns `isDone: false` and a `cursor`
- [ ] Call it again passing that `cursor` back, until `isDone: true` → `identityMigration:verifyUserNames` then reports `driftCount: 0` → AC-15
- [ ] Run the whole sequence a second time → every pass reports `patched: 0` → AC-15

### The directory toggle, on both surfaces

- [ ] Complete the wizard as a fresh visitor → the LAST step (Profession) carries the directory question as a plain Yes or No, and the wizard is still seven steps → AC-17, F2-01
- [ ] Leave the question untouched and submit → the stored `directorySharing` is `false`, not absent-and-ambiguous, because an explicit no must be distinguishable from never having been asked → AC-17
- [ ] As a verified member on mobile, open My Profile → the MEMBER DIRECTORY card's switch reflects the stored value and saves on the switch, not behind a button → AC-17
- [ ] Turn it on, then force the mutation to fail (go offline) → the switch springs back to the stored value rather than lying about what was saved → AC-17
- [ ] As a role holder in the portal Settings page → the same toggle is there and agrees with the phone → AC-12, AC-17

### Areas of Service and clan, both surfaces agreeing

- [ ] On mobile as a verified member, add an area → it shows as "Waiting for the head to confirm you" with a Withdraw action, and that department's head gets a notice immediately (the claimant is already verified, unlike a wizard claim) → AC-19
- [ ] Hold HOD of a department and open its row → the Leave button is ABSENT and the row explains the role has to end first. Then call `leaveMyAreaOfService` directly for it → rejected server side with the role named → AC-21
- [ ] Do the same two checks on the portal Settings panel → identical behaviour and identical sentences, because both read the shared copy → AC-12, AC-21
- [ ] Add areas until the cap, then try one more → both surfaces show the cap message and the server refuses, with `active` and `pending_claim` rows counted together → AC-19
- [ ] Change clan to the one already stored → nothing happens: no log row, no notice to either elder. A form resave must not tell two people about a change that did not occur → AC-22
- [x] Grep for `clanId:` on a `memberProfiles` patch → only `changeMyClan`, `submitProfile`, `resubmitProfile` and `verifyProfile`'s `edits` write it; `updateMyProfile` has no `clanId` argument at all → AC-11, AC-22

### The replaced-file cleanup

- [ ] Upload a profile photo, then replace it → the previous R2 object is gone from the bucket and the new one renders → AC-18
- [ ] Replace a photo that was a Google account URL rather than an upload → nothing is sent to R2, because an absolute URL is not ours to delete → AC-18
- [ ] Break the bucket credentials, then replace a photo → the save still succeeds and the row points at the new key. An orphan object is the accepted failure, never a row pointing at nothing → AC-18

### Copy, from one constant

- [ ] Grep the member-facing surfaces for "the elders", "a church admin" and "the church office" → none remain on any profile lifecycle surface. The two profile email templates and the N05 push all read `REVIEWER_NAME` rather than their own literal → AC-26
- [ ] Change `REVIEWER_NAME` in `packages/shared` and rebuild → the pending screen, the sent-back screen, the member gate, both emails and the verified notice all change together → AC-26

### Still owed: the F2-10 proof

AC-25 is verify work by design, not build work. Nothing was built for it, so
all three rules are still unproven against the live app.

- [ ] An unverified claimant appears in that department's roster PENDING section, marked pending → AC-25
- [ ] That person is excluded from the member total on the roster page, from the department dashboard cards, and from the Administration dashboard's verified figures (they are counted under "Not yet verified", which is the one thing AC-31 changed here) → AC-25
- [ ] Both the HOD and the delegate appointment calls reject that person SERVER SIDE, not merely hide the button → AC-25
- [ ] Any rule that fails here becomes a build task; all three passing closes AC-25 with no code change → AC-25

---

## Function level proof against the live deployment

_Recorded by `/check verify` on 2026-10-31. Driven over the Convex HTTP API as
a real authenticated identity, created through the mobile sign up path (the web
sign up guard is a `x-client-platform` header check that the code itself calls
"not the real security boundary"). These are function level proofs: they show
the backend behaves, not that any screen renders it. The UI journeys above stay
unticked for that reason._

**Test data left on the dev deployment**, safe to delete:
`verify-check-1793418214@verify.invalid` (profile `jn7885bj0ewt5s6szdkn5w5cj98ham8k`,
two children, one leadership row, one pending Education claim) and
`verify-check-other-1793418499@verify.invalid` (one child, one leadership row).

- [x] `submitProfile` with `directorySharing: true`, children, a leadership row and a department id → stored; the row reads back `profileStatus: "pending_verification"` and `directorySharing: true`, proving the widened schema is live → AC-1, AC-17
- [x] The same submission → `users.firstName`/`lastName` changed from the sign up name ("Verify"/"Check") to the profile's ("Esther"/"Nakato"), proving the mirror fires on a real write → AC-14
- [x] `profile:getMyAccount` → the payload carries a `photoUrl` field, so no client has to read `users.profilePictureUrl` → AC-14
- [x] `profile:getMyProfile` → carries `children`, `leadershipProgress` AND `departmentMemberships` (the pending Education claim), which is what the wizard needs to reopen pre filled → AC-6
- [x] `updateMyProfile` with `mentorshipStatus: "completed"` → refused `MENTORSHIP_NEEDS_REVIEW`; with `"enrolled"` and `"not_enrolled"` → both saved → AC-16, AC-32
- [x] `updateMyProfile` with `clearFields: ["phone","occupation"]` → both fields are actually unset on the row while `industry` is kept, so clearing works and is not confused with "unchanged" → AC-11
- [x] `resubmitProfile` sending one child with its `_id`, one without, and omitting a third → the carried `_id` survived with its new name, the omitted row is gone, the new one was inserted, and the leadership `_id` is unchanged → AC-6, AC-13
- [x] The same `resubmitProfile` re sending the department it had already claimed → still one live `pending_claim` row, not a duplicate and not a "you have already asked to serve in X" refusal → AC-6
- [x] The same call on a `pending_verification` row → returns `pending_verification` and does not flip any state → AC-6
- [x] `setDirectorySharing` false then true → the stored value follows each way → AC-17
- [x] `children:updateChild`, `children:removeChild` and `leadershipProgress:updateMine` against a SECOND identity's rows → each refused `NOT_YOUR_ROW`, and both of that person's rows were unchanged afterwards → AC-13, AC-32
- [x] A write to `children` (a different table) → `memberProfiles.updatedAt` moved, which is what makes one timestamp cover the whole submission for the stale guard → AC-7
- [x] `changeMyClan` and `addMyAreaOfService` as an unverified caller → both refused `PROFILE_NOT_VERIFIED` → AC-19, AC-22, AC-32
- [x] `listSentBack`, `sendProfileBack` and `verifyProfile` as an authenticated NON authority caller → all three refused by the server, in the function, not hidden in the portal → AC-10
- [x] `users:searchUsersForSpouseLink` → the payload contains no `@` anywhere and no email key, and two unverified profiles return zero rows, so an unreviewed identity cannot be linked → AC-29

### What this run could not reach, and why

- **Everything needing Administration authority**: send back, the sent back list's contents, verify, the stale guard in situ, and `verifyProfile` clearing the three fields. No self serve path exists to that authority, by design → AC-2, AC-3, AC-4, AC-5, AC-7 (in situ), AC-8, AC-9, AC-34
- **Everything needing a browser**: no browser automation is available in this environment, so no screen was rendered or clicked → the UI half of AC-12, AC-24, AC-26, AC-27, AC-28, AC-31
- **Everything needing an R2 upload**: the replaced file cleanup → AC-18
- **The name backfill against live data**: `identityMigration.backfillUserNames` is an `internalMutation`, so it is not reachable from a client. Its behaviour is covered by unit tests → AC-15
- **The F2-10 proof**: unchanged, still owed → AC-25
