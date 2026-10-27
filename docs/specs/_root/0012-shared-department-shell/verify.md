# Verify: shared department shell · spec 0012 · updated 2026-10-27
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Before you start

You need a few accounts to tell the refusals apart. Set them up once and reuse them:

- **Hilda the HOD**: an active `hod` role scoped to Finance (a department with no bespoke portal).
- **Dan the delegate**: an active `department_admin` role scoped to Finance.
- **Rita the roster member**: on the Media roster, verified profile, no role at all.

Also keep a System Admin, and an Administration HOD (authority over every department but head of none).

Push the schema first (`pnpm convex`), then seed departments if your deployment is fresh
(`pnpm exec convex run seed:departments`).

## Commands

- [x] `pnpm --filter @klt-cyber/shared test` → 11 files pass, including the slug parity test against the portal's former `lib/slugify.ts` and the thirteen distinct slugs → AC-1, AC-7, AC-14
- [x] `npx vitest run --config convex/vitest.config.ts` → 8 files pass, including `departmentShell.test.ts`: a delegate is withheld exactly the eight HOD decisions, Administration authority resolves to no role in another department, and `placeOnRoster` promotes a claim rather than inserting beside it → AC-5, AC-11, AC-15, AC-18
- [x] `npx tsc -p convex/tsconfig.json --noEmit` → no output
- [x] `pnpm --filter admin build` → compiles, and the route list includes `/areas-of-service/[slug]/{dashboard,roster,activities,messages,settings}` plus `/areas-of-service/media/{roster,activities,messages,settings}` → AC-2, AC-3
- [ ] In the Convex dashboard, `departmentMemberships.status` accepts `pending_claim`, the `hodNotices` table exists, `activityLogs` has a `by_department` index, and `groupActivities` has `dayBeforeReminderJobId` → AC-14, AC-24, AC-37

## Shell and navigation

- [ ] As Hilda, open `/areas-of-service` → the Finance card shows a wallet icon and its description → click it and land on `/areas-of-service/finance/dashboard`, not "Coming soon" → AC-1, AC-7
- [ ] Type `/areas-of-service/ushering` (a paused department) → "Coming soon", with no sidebar and no shell chrome → AC-1
- [x] Type `/areas-of-service/administration` → you are sent to `/areas-of-service/admin`, so Administration never gets a second thinner portal (handled by `next.config.ts` at the edge, confirmed `308 → /areas-of-service/admin`) → AC-2
- [ ] As Hilda, confirm the sidebar shows Dashboard, Roster, Activities, Messages, Settings, and its header shows the KLT mark over "KLT Cyber" with "Finance" as the caption → AC-2
- [ ] The Finance wallet icon appears on the department switcher in the top bar, which is where a department identifies itself inside its portal → AC-7
- [ ] Every rail reads the same: Administration says "Admin", the System Admin rail says "Admin Portal", Media says "Media", each over the KLT mark and "KLT Cyber" → one shared header
- [ ] The Areas of Service hub, its loading skeleton, the landing page and the sign in canvas all read "KLT Cyber" over "Admin Portal", so the name never changes as you move between them → one shared lockup
- [ ] As a user holding roles in two departments, use the switcher in the top bar to move between them → no sign in prompt, and the slug in the URL changes → AC-4
- [ ] Each switcher row carries that department's own icon, and the one you are in is check-marked → AC-7
- [ ] As someone who leads exactly one department, open the switcher → "View all" is still there, so the hub is always one click away
- [ ] As a Hospitality roster member with no role, open the hub → the Hospitality tile is a plain card reading "You serve here · nothing to manage", not a link, and clicking it does nothing rather than bouncing you back to this page → AC-5
- [ ] As that same person, the switcher offers no Hospitality row → AC-5
- [ ] As a Ushering HOD (a paused department), the switcher lists Ushering greyed under "Coming soon" → AC-1
- [ ] As a System Admin, the switcher lists every active department and no paused ones → AC-1
- [ ] As Dan, open the same portal → no Settings description editor, no Confirm or Decline buttons, no delete control on Hilda's messages → AC-5, AC-18
- [ ] As Rita, type `/areas-of-service/media/roster` → you are sent back to `/areas-of-service`, while `/areas-of-service/media/devotionals` still opens → AC-5
- [ ] As an Administration HOD, type `/areas-of-service/finance/dashboard` → you are sent back to the hub → AC-5
- [ ] As Hilda with the roster open, have a System Admin revoke her `hod` role → the page sends her to the hub rather than throwing → AC-38
- [ ] Sign out in another tab while a shell page is open → same, a redirect rather than a crash → AC-38

## Roster and claims

- [ ] As Hilda, open Roster → every active member shows photo, name, clan, position and a mentorship status read from their profile, sorted by last name → AC-10
- [ ] Change one member's `mentorshipStatus` in the Convex dashboard → the roster row updates without a reload, and never reads "Completed" for someone who is not → AC-10
- [ ] Search a partial name, filter by clan, then by position → the list narrows and "Clear" restores it → AC-12
- [ ] As Hilda, click a roster row → the full profile opens with phone and email, even for a member whose directory sharing is off → AC-11
- [ ] As an Administration HOD, call `departmentShell.getRosterMemberProfile` for a Finance member from the Convex dashboard → it throws → AC-11
- [ ] As an Administration HOD, call `departmentMemberships.listRosterWithClaims` for Finance → `active` comes back, `pending` is empty → AC-11, AC-13
- [ ] Submit a mobile profile selecting Finance → as Hilda, the person appears under "Asking to serve here", marked, and the dashboard verified member count does NOT move → AC-13, AC-15, AC-33
- [ ] Submit a second profile selecting Finance later the same day → the newer claim sorts below the older one → AC-13
- [ ] As Hilda, confirm a claim whose profile is verified → the row joins "Serving here", the person is notified, and the dashboard count rises by one → AC-16
- [ ] Try to confirm a claim whose profile is NOT verified → Confirm is disabled and the row explains that Administration verifies profiles → AC-16
- [ ] Give someone three active departments, then confirm a fourth claim for them → rejected with the cap message → AC-16
- [ ] As Hilda, decline a claim with a reason → the row leaves the pending list, the person is notified with that reason, and the feed shows "declined a request to serve here" → AC-17, AC-35
- [ ] Decline with a blank reason → no reason is stored and the notification reads without one → AC-17
- [ ] As Dan, call `confirmClaim`, `declineClaim`, `updateDepartmentMembership`, `removeDepartmentMember`, `appointDelegate` and `updateDepartmentDescription` from the Convex dashboard → every one throws → AC-18
- [ ] As Hilda, add a verified member who is not on the roster → they join it and are notified → AC-19
- [ ] Add someone who already has a pending claim for Finance → exactly one row exists afterwards, status `active`, with no leftover claim → AC-15
- [ ] Appoint someone with a pending Finance claim as HOD or delegate through `roles.assignRole` → again exactly one row, `active` → AC-15
- [ ] Submit a profile selecting Finance twice for the same person → the second is rejected → AC-15
- [ ] As an Administration reviewer, open a freshly submitted profile in the verification queue → the claimed Areas of Service are listed with their status, not an empty list → AC-21
- [ ] As Hilda, set a position on a member, then clear it → both save, and an unchanged save writes no audit entry → AC-20
- [ ] As Hilda, remove a member who holds `department_admin` in Finance → they leave the roster, their Finance role is revoked in the same action, and they are notified privately → AC-20
- [ ] As Hilda, appoint a verified roster member as delegate, then stand them down → both are logged and show in the feed, and the removal notifies them → AC-20
- [ ] Try to appoint a delegate who is not on this roster, or whose profile is unverified → rejected → AC-20
- [ ] A member with an `active` row but an unverified profile stays on the roster, labelled "Not verified", and is left out of the verified count → AC-33
- [ ] Delete that account through the mobile delete flow → their `pending_claim` and `declined` rows become `removed`, and no `declineReason` survives → AC-39

## Activities

- [ ] As Hilda, schedule an activity for 18:00 with your machine set to a non Kampala timezone (try Europe/London) → the stored `startDateTime` is the instant of 18:00 Kampala, and the list and calendar both read 6:00 pm → AC-22
- [ ] Verified roster members are notified about it; a pending claimant is not → AC-23
- [ ] Edit only the title, the details or the picture → nobody is notified → AC-23
- [ ] Change the date, the time or the place → the verified roster is notified → AC-23
- [ ] Schedule something more than a day out, then read `groupActivities` → `dayBeforeReminderJobId` is set, and the scheduled jobs list shows a run about 24 hours before the start → AC-24
- [ ] Move that start time → the old job is cancelled and a new one appears at the new start minus a day → AC-24
- [ ] Add a member to the roster after scheduling, then let the reminder fire → they receive it, because the audience resolves at dispatch time → AC-24
- [ ] Force a stale job: patch `startDateTime` directly in the dashboard without going through the mutation, then run the pending job → nothing is delivered → AC-24
- [ ] Cancel an activity → the reminder stops, the row stays listed and marked "Cancelled" with its reason, and the verified roster is told → AC-25
- [ ] Leave the Activities page open past a cancelled activity's end time → it drops off the list on its own, with no reload → AC-25
- [ ] Switch to Month → the activity sits on its Kampala calendar day, cancelled ones struck through, church events in a quieter tone → AC-26
- [ ] Church events carry no edit control at all → AC-26
- [ ] As an Administration HOD, call `departmentActivities.listAllForPlanner` with a date window → every department's activities come back with the owning department's name; the same call as Hilda throws → AC-27

## Messages and notices

- [ ] As Hilda, message the department with a picture → verified roster members get a push and see it under "My groups" in the app → AC-28
- [ ] As Dan, send one too → it works and appears in the list → AC-28
- [ ] The list reads newest first with sender name and time, and "Show older" appears once there is more than one page → AC-29
- [ ] Anonymise a sender's `users` row (or delete that account) → their message reads "A former member" rather than blank → AC-29
- [ ] As Hilda, delete Dan's message → it goes, and the row survives in the database with `deletedAt` set → AC-30
- [ ] As Dan, try to delete Hilda's message from the Convex dashboard → rejected; deleting his own works → AC-30
- [ ] A deleted message disappears from "My groups" on the phone → AC-30
- [ ] As Hilda, send a notice to two named departments → only those departments' current HODs are notified, and no reply control exists anywhere → AC-31
- [ ] Send one to every department → every current HOD is notified → AC-31
- [ ] Send a notice over 1000 characters, or with scope "selected" and nothing chosen → rejected → AC-31
- [ ] As the Pastoral HOD, then as a System Admin, send a notice → both are allowed → AC-31
- [ ] As Dan, call `hodNotices.sendNotice` → rejected → AC-18, AC-31
- [ ] Hand the Finance HOD seat to someone else, then open Received as the new holder → the earlier notice to Finance is there, because notices address seats rather than people → AC-32
- [ ] Received and Sent both read newest first, page with "Show older", and still show a notice from months ago → AC-32

## Dashboard

- [ ] The verified member count, the requests waiting count and the roster count each reconcile with the roster page, and the hint says why two of them differ → AC-33
- [ ] The next activities card is judged against the clock the page keeps: leave it open past an activity start and watch the card move on → AC-34
- [ ] The weekly programs card shows what the church office published, with no Administration role needed → AC-34
- [ ] Do one of each action (confirm a claim, add a member, re-title, appoint a delegate, send a message, schedule an activity, cancel it, edit the description) → each appears in the feed, newest first → AC-35
- [ ] The feed is empty on a department where nothing has happened since the schema change, rather than showing unrelated church activity → AC-35, AC-37
- [ ] The mentorship card counts active members whose status is not `completed` → AC-36
- [ ] Empty every list (a department with no roster, no activities, no messages) → each card shows its own empty state, never a blank panel → AC-38
- [ ] Stop the Convex dev server with a shell page open → the page shows the shared `ErrorState` with a retry → AC-38

## Settings and department identity

- [ ] As Hilda, edit the Finance description and save → it saves at once, the feed shows "edited the department description", and the new text shows on the hub card → AC-8
- [ ] Save again without changing anything → it reports that nothing had changed and writes no audit entry → AC-8
- [ ] Paste a multi line paragraph → newlines collapse to single spaces → AC-8
- [ ] Paste more than 280 characters → the form stops you, and the mutation rejects it if forced → AC-8
- [ ] Clear the description entirely → the hub card renders with no description line → AC-8
- [ ] As Dan, the description editor is absent, and `updateDepartmentDescription` throws if called directly → AC-8, AC-18
- [ ] As Dan and as Hilda, the account panel below shows your own profile, and editing your phone there also changes it on Administration's own settings page (one panel, two pages) → AC-9

## Phone layout

- [ ] At 375 pixels wide, open each of Dashboard, Roster, Activities, Messages and Settings → every table reads as stacked cards, and no page scrolls sideways → AC-6
- [ ] At the same width, open the month calendar → weekday initials rather than names, and still no sideways scroll → AC-6
- [ ] Repeat all six on `/areas-of-service/media/*` → identical, because they are the same components → AC-3, AC-6

## Media rewire

- [ ] As the Media HOD, the sidebar shows Devotionals and Past events under Content, and Roster, Activities, Messages and Settings under Department → AC-3
- [ ] `grep -rn "function DepartmentRoster\|function DepartmentActivities\|function DepartmentMessages\|function DepartmentSettings" apps/admin` → one implementation each → AC-3
- [ ] As Rita (Media roster member, no role), the Department group is absent from the sidebar entirely → AC-3, AC-5
- [ ] Media's landing page still goes to Devotionals → AC-3

## Value sourcing

One step per row of the spec's value sourcing table. These are the ones that stay silently wrong if a value's source was invented rather than read.

- [ ] Rename a department in the database, then reach its old slug → you land on the hub, and the new slug works, because the slug is derived from the name and never stored → which department this page is about
- [ ] Hold `clan_elder` only → `getShellContext` resolves to null for every department → the caller's role
- [ ] Add a fourteenth department with no icon entry → its hub card and portal header both show the fallback people icon, never an empty square → the department icon
- [ ] Set a roster member's clan to nothing → the row reads "No clan yet" rather than blank → clan name
- [ ] Give one member a Google account photo URL and another an R2 key → both render, because both go through `resolveMediaUrl` → photo
- [ ] Clear a member's `firstName` and `lastName` → the row falls back to their email → display name
- [ ] Create a `pending_claim` row with no `claimedAt` (a legacy shape) → it still sorts by creation time rather than jumping to the top → pending order
- [ ] Fire two confirms of the same claim at once → one wins, the other reports that it is no longer waiting, and exactly one active row exists → the three department cap
- [ ] Add a position title nobody else has → it appears as a filter option; remove it → the option goes → filter options
- [ ] Enter an activity at 23:30 Kampala time on the last day of a month → it lands on that day in the calendar, not the next → the instant stored
- [ ] Set your machine clock forward an hour with a shell page open → the upcoming and past split moves with the page's own clock, not the server's → past or upcoming
- [ ] Schedule something 25 hours out → the reminder lands about an hour from now; schedule something 2 hours out → no reminder job is created at all → when the reminder fires
- [ ] Send a department message while one member's profile is unverified → they see it under "My groups" but get no push → who receives it
- [ ] Check each notification against the catalogue: N11 on confirm and decline, N12 on add and remove, N13 on delegate appointment, N15 on delegate removal, N22 on activity create, change and cancel, N23 for the reminder, N24 for a message, N25 for a notice → notification identity
- [ ] Send a notice as a System Admin → the sender reads as the church office rather than a blank department → notice sender label
- [ ] Give one active member `mentorshipStatus` `enrolled`, another `not_enrolled`, a third `completed` → the mentorship card counts the first two → members without completed mentorship
- [ ] Write an audit entry by hand with the department only inside `metadata` → it does NOT appear in the feed, which is exactly why the column exists → the department an entry concerns

## Acceptance-criteria coverage

- AC-1 … hub to dashboard, paused department · AC-2 … five pages from one set, Administration redirect · AC-3 … Media rewire, one implementation each
- AC-4 … switcher with no re-auth, slug in the URL · AC-5 … delegate, roster member, Administration and cross-department refusals · AC-6 … 375 pixels on all five pages
- AC-7 … icon on hub card and portal header, fallback · AC-8 … description rules, all five · AC-9 … Settings sections
- AC-10 … roster columns and live mentorship · AC-11 … sharing bypass, Administration rejected · AC-12 … search and filter · AC-13 … pending section, excluded from counts
- AC-14 … status union and caps, with tests · AC-15 … one live row, four writers · AC-16 … confirm with its two refusals · AC-17 … decline with and without a reason
- AC-18 … delegate rejected server side on all eight · AC-19 … add a verified member · AC-20 … position, removal cascade, delegates · AC-21 … verification read shows claims
- AC-22 … church local time from a foreign timezone · AC-23 … which edits notify · AC-24 … reminder moves, stale job delivers nothing, audience at dispatch
- AC-25 … cancelled stays until the end time, client clock · AC-26 … list, month, read only church events · AC-27 … planner query and its gate
- AC-28 … message send and delivery · AC-29 … list order and former member · AC-30 … delete split · AC-31 … notice senders, scopes and caps · AC-32 … received and sent, unwindowed
- AC-33 … two counts explainable · AC-34 … upcoming and programs · AC-35 … feed covers every action · AC-36 … mentorship gap · AC-37 … indexed per department feed
- AC-38 … empty and error states, reactive teardown · AC-39 … deletion clears the new statuses
