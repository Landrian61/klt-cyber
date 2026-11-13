# Verify: Hospitality core · spec 0024 · updated 2026-11-13
_Steps derived from spec 0024 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Slice 1 (thin thread) only; later slices append below._

## UI / manual
- [ ] Sign in as a verified Hospitality roster member, open `/areas-of-service/hospitality/dashboard` → the sidebar shows **Visitors** → AC-1, AC-2
- [ ] Open `/areas-of-service/<another slug>/visitors` (for example Finance) as a System Admin → not found page, not an empty list → AC-2
- [ ] Sign in as a Finance HOD, an Administration HOD, and an unverified Hospitality roster member; open `/areas-of-service/hospitality/visitors` → none of them reach the list (redirect to the hub, or not found) → AC-1, AC-3
- [ ] On Visitors, tap **Add a walk in**, enter only a first name, keep today's date, save → the sheet closes and the visitor appears at the top, marked **First timer**, follow up **Follow up open**, 1 visit → AC-4, AC-9, AC-15
- [ ] Add a walk in with phone `0772 123456` and leave consent unticked → the form refuses with the consent message; tick it and save → saved; `npx convex data visitors` shows `phone: "+256772123456"` and a `consent.givenAt` → AC-6, AC-22
- [ ] Pick a visit date 31 days back, then tomorrow → refused with "Choose a visit date from today back to 30 days ago" → AC-5
- [ ] In "Invited by", type two letters of a verified member's name → their name appears; choose it → "Linked to this member" → AC-4
- [ ] Resize to 375 pixels wide → the list becomes stacked cards, the sheet is one column, nothing scrolls sideways → AC-38 (slice 1 part)

## Value sourcing
- [ ] Visit date window uses the server's Kampala day: with your machine clock in a far timezone (for example UTC minus 10, late evening), today's Kampala date is still accepted and the next Kampala day is refused → AC-5
- [ ] Regular flag uses the client `today`: send `listVisitors` a `today` of `2026-13-01` → refused with `HOSPITALITY_TODAY_INVALID` → AC-10
- [ ] Hospitality's department id comes from `departments` by name: rename nothing, but confirm `departments` has exactly one row named `Hospitality` → AC-1
- [ ] Contact allowed is the presence of `phone`: a walk in saved without a phone shows no `consent` and no `phone` in the row → AC-9, AC-22
- [ ] Follow up status is the latest `followUps` row by visitor → AC-9

## Commands
- [ ] `pnpm --filter @klt-cyber/shared test` → all pass, including `hospitality.test.ts` (constants and schema) → AC-39
- [ ] `pnpm test:convex` → all pass, including `convex/hospitality.test.ts` (authority matrix, consent refusal, date window, the rows written) → AC-1, AC-3 to AC-6, AC-15, AC-22, AC-39
- [ ] `npx tsc -p convex/tsconfig.json --noEmit` and `npx tsc --noEmit -p apps/admin` → clean

## Acceptance-criteria coverage
- AC-1: manual step 1, 3; Convex matrix tests · AC-2: manual steps 1, 2 (Visitors only; the other three pages land with their slices) · AC-3: manual step 3, Convex matrix tests · AC-4: manual steps 4, 7; `insertWalkIn` tests · AC-5: manual step 6, value sourcing step 1, tests · AC-6: manual step 5, tests · AC-9: manual step 4 (no filters yet) · AC-15: manual step 4, tests · AC-22: manual step 5, tests · AC-38: manual step 8 (slice 1 part) · AC-39: command steps (shared part)

---

# Milestone 2: Visitors end to end · updated 2026-11-13
_Build plan slices 2 to 5. Covers AC-7 to AC-14, AC-23 to AC-26, AC-31._

## UI / manual
- [ ] Sign up a new account in the mobile app → within seconds Visitors shows them as **App**, 0 visits, follow up **None**, sorted last → AC-8, AC-9
- [ ] Sign up with Google using an account with no name → the row's name is the part of the email before the `@` → AC-8
- [ ] As that new user, submit the profile wizard with a phone → `npx convex data visitors` shows `accountPhone` in E.164 on their row, and the record page never shows it → AC-31
- [ ] As that user, change your first name in Settings → the Visitors row shows the new name, and searching the new name finds it → AC-8
- [ ] As Administration, verify that user's profile → they leave the Visitors list; their record page says "Verified as a member" → AC-31
- [ ] Add a walk in with phone `0772 123456` (with consent), then open **Add a walk in** again and type the same number → "Record a visit for Grace instead" appears; tap it → a visit is recorded on that person, no new visitor; also check **Save as a new visitor** still saves → AC-7
- [ ] On a record, record a visit for today when one exists → refused "A visit on that date is already recorded"; pick 31 days back → refused → AC-12, AC-5
- [ ] Record a first visit for an app visitor (0 visits) → follow up becomes **Open** → AC-12, AC-15
- [ ] Give a visitor three visits in one month → **Regular** badge on the list and the record; filter Regular: Regulars only shows them → AC-10, AC-29 (badge part)
- [ ] As a roster member, open a visit someone else recorded → no Delete button; as the HOD → Delete works and the count drops → AC-13
- [ ] Delete a walk in's only visit before anyone contacted them → follow up disappears and the visit count is 0 → AC-13
- [ ] Search "Namata" → only matching visitors, relevance order; search an app visitor's email → found → AC-11
- [ ] Open **Filters**, combine Came from: Walk in + Visits: 1 + Sex: Not recorded → only rows matching all three; with a rare filter the list keeps loading until it fills or runs out ("Loading more…") → AC-11
- [ ] On a walk in's record, **Edit** → change last name, clear notes, link an inviter → saved, History shows "Details edited" → AC-14
- [ ] On an app visitor's record, **Edit** → the name is not editable ("comes from their app account"); sex and notes save → AC-14
- [ ] **Withdraw consent** on a visitor with a phone → phone gone, badge "Consent withdrawn", History shows it → AC-23, AC-22
- [ ] **Consent given again** without a note → refused; with a note → phone back, consent live → AC-24
- [ ] **Change number** while consent is live → new number, no note asked, consent unchanged → AC-24
- [ ] **Remove visitor** on a walk in → type anything but REMOVE → button disabled; type REMOVE → back on the list, row gone; `npx convex data visitors` shows "Removed visitor", no phone or notes, visits still counted → AC-25
- [ ] An app visitor's record has no **Remove visitor** button → AC-25
- [ ] Delete a test account that has a visitor row (Settings → Delete account) → its row is "Removed visitor", `userId` cleared, visits kept → AC-26
- [ ] At 375 pixels, the record page and the filters panel are one column with no sideways scroll → AC-38 (milestone 2 part)

## Value sourcing
- [ ] App row names come from `users.firstName`/`lastName`, falling back to the email prefix: sign up as `kato.john@…` with no name → "kato.john" → AC-8
- [ ] `accountPhone` comes from `normalizeMemberPhone(memberProfiles.phone)`: submit a profile with `0701 234567` → `+256701234567` → AC-31
- [ ] `isRegular` is `isRegularOn(lastRegularMonth, today)` with the client's `today`: three October visits are regular when your clock says November, and not when it says December → AC-10
- [ ] `lastRegularMonth` is recomputed by every visit writer: delete one of the three October visits → the regular badge goes → AC-10, AC-13
- [ ] Who may delete a visit is the `role` from `requireDepartmentCapability` plus `recordedBy`: a delegate may delete anyone's visit; a roster member only their own → AC-13
- [ ] Today for the visit window is the server's Kampala day (`kampalaToday()`): with your machine clock set a day ahead, recording "today" by your clock is refused → AC-12
- [ ] The former member label: delete the account of someone who recorded a visit → the visit reads "Recorded by a former member" → AC-14

## Commands
- [ ] `npx convex run hospitalityMigration:verifyAppVisitorBackfill` → `missing: 0` (run `hospitalityMigration:backfillAppVisitors` first on each deployment, with confirmation for staging and production) → AC-8
- [ ] `pnpm test:convex` → all pass, including `convex/hospitalityVisitors.test.ts` (sign up idempotence, backfill, sync, member flip, deletion, visits, regulars, filters, search, record, consent, removal) → AC-7 to AC-14, AC-23 to AC-26, AC-31
- [ ] `npx tsc -p convex/tsconfig.json --noEmit` and `npx tsc --noEmit -p apps/admin` → clean

## Acceptance-criteria coverage
- AC-7: manual step 6 · AC-8: manual steps 1, 2, 4, value sourcing step 1, command step 1, tests · AC-9: manual step 1 · AC-10: manual step 9, value sourcing steps 3, 4, tests · AC-11: manual steps 12, 13, tests · AC-12: manual steps 7, 8, value sourcing step 6, tests · AC-13: manual steps 10, 11, value sourcing steps 4, 5, tests · AC-14: manual steps 14, 15, value sourcing step 7, tests · AC-23: manual step 16, tests · AC-24: manual steps 17, 18, tests · AC-25: manual steps 19, 20, tests · AC-26: manual step 21, tests · AC-31: manual steps 3, 5, value sourcing step 2, tests

---

# Milestone 3: Follow ups and contact · updated 2026-11-13
_Build plan slices 6 and 7. Covers AC-15 to AC-21._

## UI / manual
- [ ] The sidebar shows **Follow ups** for a Hospitality operator, and `/areas-of-service/<another slug>/follow-ups` is not found → AC-2
- [ ] Add two walk ins on different dates → both appear under **Open**, oldest first visit at the top, each marked **Unassigned** → AC-15, AC-16
- [ ] Delete a visitor's only visit (no contacts), then record a visit again → one follow up row, open again (not two) → AC-15
- [ ] On an open row tap **Contact** → Call, WhatsApp and SMS show for a visitor with a phone; choose "Checking in" → WhatsApp opens `wa.me/2567…` with the filled wording; SMS opens `sms:+2567…?body=…` → AC-17
- [ ] For a visitor with no phone, **Contact** says only in person contact can be logged; the channel list offers In person only → AC-17, AC-18
- [ ] After tapping WhatsApp, the record dialog opens on WhatsApp; save **No answer** → the row stays open with 1 attempt → AC-18
- [ ] Save **Reached** → the row leaves Open and appears under **Done** as Reached, most recent first → AC-16, AC-18
- [ ] Save **Asked not to be contacted** → follow up done with that outcome; the visitor record shows "Consent withdrawn" and no phone → AC-18, AC-23
- [ ] Save **Wrong number** → phone gone and the consent panel says "No phone kept" (adding a correct number later needs no note) → AC-18, AC-24
- [ ] On a record whose follow up is done, **Record a contact** → saved to the history; the follow up stays done → AC-18
- [ ] **Close** an open follow up with no note → refused; with "Moved away" → Done, outcome Closed by hand, note on the record → AC-19
- [ ] As the HOD, **Assign** a follow up to a verified roster member → their name shows; signed in as them, the mobile app gets "A visitor follow up is yours", and tapping it opens the portal work screen → AC-20, N36
- [ ] Assign one to yourself → no notification arrives → AC-20
- [ ] Filter **Mine** → only follow ups assigned to you → AC-16
- [ ] Remove that roster member from the Hospitality roster → their follow ups still show them, marked "(former operator)", and anyone can **Reassign** → AC-20
- [ ] On Visitors, tick two app visitors → the bar shows "2 app visitors chosen"; **Send in app message** "See you Sunday" → both phones get it; each record's Contact history shows "In app message" with the text → AC-21, N41
- [ ] Walk in rows have no tick box; after choosing 50, the rest are disabled → AC-21
- [ ] Choose an app visitor, then (in another tab) have Administration verify and delete their account before you send → the send is refused as a whole and nobody is messaged → AC-21
- [ ] At 375 pixels, the Follow ups list shows cards with Contact, Assign and Close buttons, and the dialogs fit without sideways scroll → AC-38 (milestone 3 part)

## Value sourcing
- [ ] Template wording comes from `HOSPITALITY_MESSAGE_TEMPLATES`: the WhatsApp text matches the shared template with `{firstName}` filled → AC-17
- [ ] `{visitDate}` is `firstVisitDate` for "Thank you for visiting" and `lastVisitDate` for "Checking in", formatted like "8 November" → AC-17
- [ ] `{appLink}` comes from `NEXT_PUBLIC_APP_DOWNLOAD_URL`: with it unset, "Invite to the app" shows "App link not set up yet" and no WhatsApp or SMS buttons; with it set, the link appears in the text → AC-17
- [ ] The WhatsApp digits come from `whatsAppDigits(phone)`: `+256772123456` becomes `wa.me/256772123456` → AC-17
- [ ] Allowed assignees are the active Hospitality HOD and delegates plus active verified roster members: an unverified roster member and a Finance HOD are not in the list, and forcing one through is refused with the assignee message → AC-20
- [ ] N36 goes to the assignee's id only; N41 goes to the chosen rows' `userId`s only → AC-20, AC-21

## Commands
- [ ] `pnpm --filter @klt-cyber/shared test` → all pass, including `hospitalityContact.test.ts` (links, N36/N41 wording, the portal work type) → AC-17, AC-39
- [ ] `pnpm test:convex` → all pass, including `convex/hospitalityFollowUps.test.ts` (outcomes, consent effects, close, assignment and N36, the list, N41 all or nothing) → AC-15 to AC-21
- [ ] `npx tsc -p convex/tsconfig.json --noEmit` and `npx tsc --noEmit -p apps/admin` → clean
- [ ] Before slice 6 ships to staging or production: set `NEXT_PUBLIC_APP_DOWNLOAD_URL` on that Cloudflare build → AC-17

## Acceptance-criteria coverage
- AC-15: manual steps 2, 3; tests · AC-16: manual steps 2, 7, 14; tests · AC-17: manual steps 4, 5; value sourcing steps 1 to 4; shared tests · AC-18: manual steps 6 to 10; tests · AC-19: manual step 11; tests · AC-20: manual steps 12, 13, 15; value sourcing steps 5, 6; tests · AC-21: manual steps 16 to 18; value sourcing step 6; tests

## Slices 8 to 10 · updated 2026-11-13
_Join, toward membership and clan placement. Covers AC-27 to AC-30, AC-32 to AC-34._

### UI / manual
- [ ] Add a walk in with phone `0772 123456` and consent. Sign up a new app user, submit their profile with the same phone → on the walk in's record, "Join to an app account" lists them first with a **Same phone** badge, and their phone number is never shown → AC-27
- [ ] On the same record, search an app visitor by name, then by email → each appears without a phone match badge; a walk in never appears → AC-27
- [ ] Give the walk in visits on two dates and the app user one visit on one of those dates, then Join → the record keeps the walk in's name, phone and notes, shows **Joined to an app account**, two visits (the shared date once), one open follow up; the Follow ups Done tab shows the other one closed with note "merged" → AC-28
- [ ] Open the app user's old record (from its history or the database) → it says it was joined into another record, and both histories show "Joined to an app account" → AC-28
- [ ] Join a walk in to an account whose profile is already verified → the joined record leaves the Visitors list (it is a member now) → AC-28
- [ ] Try to join the same walk in again → the join panel is gone; a forged call is refused with "already joined" → AC-28
- [ ] On the Visitors list, a walk in with no account and a consented phone shows **Send app link**; it opens WhatsApp or SMS with the app invite wording, then asks how it went. A walk in with no phone, and any app visitor, show no button → AC-29
- [ ] With `NEXT_PUBLIC_APP_DOWNLOAD_URL` unset, Send app link says "App link not set up yet" and offers no link → AC-29 (value sourcing)
- [ ] Switch to **Not yet a member** → app sign ups with no profile appear oldest first; after one submits their profile wizard (pending), they leave this view → AC-30
- [ ] Open **Clan placement** in the Hospitality sidebar → it is missing on every other department's sidebar, and the URL is not found on other slugs → AC-2
- [ ] Clan sizes show each clan's verified count, with the three smallest highlighted (all tied ones too) → AC-33
- [ ] The queue lists verified members with no clan, oldest verification first; a member verified before dates were kept shows first → AC-32
- [ ] Place a member in a clan → they leave the queue, that clan's count goes up, the member gets "You have a clan" (push and in app), and the clan's active elder gets "A new member in your clan" → AC-34
- [ ] In two tabs, place the same member in different clans → the second is refused with "already has a clan", and the first clan stays → AC-34
- [ ] At 375 pixels wide, the join panel, Not yet a member and Clan placement all stack as cards with no sideways scroll → AC-38 (these pages)

### Value sourcing
- [ ] Join suggestions use `accountPhone` from `normalizeMemberPhone(memberProfiles.phone)`: a profile phone typed `+256 772 123456` still matches a walk in recorded as `0772123456` → AC-27
- [ ] N37 names the clan from `clans.name`: rename a clan, place someone → the notice uses the new name → AC-34
- [ ] N37 elders come from active `clan_elder` `roleAssignments` for that clan only: a revoked elder and another clan's elder get nothing → AC-34
- [ ] Clan counts come from verified profiles only: a member who picked the clan in the wizard but is still pending does not count → AC-33

### Commands
- [ ] `pnpm test:convex` → all pass, including `convex/hospitalityPlacement.test.ts` (join candidates, the join, member flip on join, refusals, not yet a member, queue order, sizes, assignClan with N37 recipients and refusals) → AC-27, AC-28, AC-30, AC-32 to AC-34
- [ ] `pnpm --filter @klt-cyber/shared test` → `hospitalityClans.test.ts` passes (smallest clan ties, N37 wording) → AC-33, AC-34

### Acceptance-criteria coverage
- AC-27: manual steps 1, 2, value sourcing step 1, tests · AC-28: manual steps 3 to 6, tests · AC-29: manual steps 7, 8 (regular filter and badge already in slices 2 to 5) · AC-30: manual step 9, tests · AC-32: manual step 12, tests · AC-33: manual step 11, value sourcing step 4, tests · AC-34: manual steps 13, 14, value sourcing steps 2, 3, tests

## Slices 11 to 13 · updated 2026-11-13
_Dashboard extras, reports and print, phone layout and tests. Covers AC-35 to AC-39._

### UI / manual
- [ ] As a Hospitality operator, open the Dashboard → under the usual department cards, a **Hospitality** section shows visitors this month, new this week, returning this month, regulars now, open follow ups (with how many are unassigned), waiting for a clan, and the smallest clans → AC-35
- [ ] Open the Dashboard of any other department, or as a Hospitality roster member who is not verified → no Hospitality section → AC-35, AC-1
- [ ] On a fresh deployment with no visits, every card shows its plain "nothing yet" line, and Smallest clans says "No clans are set up yet" when there are none → AC-35
- [ ] Stop the network while the Dashboard is open, then let a Hospitality query fail → the section shows "Something went wrong" with Try again, and the rest of the Dashboard still works → AC-35
- [ ] Open **Reports** → the range defaults to the last 3 months ending today, and bins are weekly (Sunday start) → AC-36
- [ ] Choose a range longer than 92 days → bins become calendar months; choose one longer than 731 days, or an end before the start → a plain message and no report → AC-36
- [ ] Record a first visit for someone this week and a return visit for someone who first came last month → this week's bin shows one first timer and the other week shows one returning; the table under the chart matches the bars → AC-36
- [ ] Open 4 follow ups in the range and close 1 → "Follow ups done" reads 25%; close a follow up that was opened before the range → the percent does not move → AC-36
- [ ] Log one call, one WhatsApp and send one in app message → Contacts by channel counts each, In app message included → AC-36
- [ ] Press **Download PDF** → a new tab opens the print view for the same range, the print dialog opens by itself, and the preview shows only the report (no sidebar, no top bar) with the church name, "Hospitality report", the range and the generated time → AC-37
- [ ] Save it as PDF → the numbers in the PDF match the Reports page → AC-37
- [ ] Open the print link with a broken range in the address bar → a plain message, no print dialog → AC-37
- [ ] At 375 pixels wide, Visitors, a visitor record, Follow ups, Clan placement, Reports and the Dashboard section all stack as cards or one column, the add walk in form is one column, and nothing scrolls sideways → AC-38

### Value sourcing
- [ ] "This month" and "this week" come from the browser's `kampalaToday()`: set the computer clock to 23:30 on a Saturday in a timezone behind Kampala → the week already reads as the new Sunday start week → AC-35
- [ ] Report day bounds are Kampala days: a follow up opened at 22:00 UTC on the day before `from` (01:00 Kampala on `from`) counts as inside the range → AC-36
- [ ] Regulars in a report come from the range's own visits, not `lastRegularMonth`: a visitor with 3 visits in October counts for a range covering October, and not for a range starting 1 November → AC-36
- [ ] The print header's church name is `CHURCH_NAME` ("Kingdom Life Tabernacle"), and the generated time is the browser's time shown in Kampala time → AC-37

### Commands
- [ ] `pnpm test:convex` → all pass, including `convex/hospitalityReports.test.ts` (dashboard counts, regular drop off, weekly and monthly bins, cohort percent, contacts by channel, bad range refused, null without access) → AC-35, AC-36, AC-3, AC-39
- [ ] `pnpm --filter @klt-cyber/shared test` → `hospitalityReports.test.ts` passes (Kampala day bounds, cohort percent, default range, range rules) → AC-36, AC-39
- [ ] `npx tsc -p convex --noEmit` and `npx tsc --noEmit` in `apps/admin` → no errors → AC-39

### Acceptance-criteria coverage
- AC-35: manual steps 1 to 4, value sourcing step 1, tests · AC-36: manual steps 5 to 9, value sourcing steps 2, 3, tests · AC-37: manual steps 10 to 12, value sourcing step 4 · AC-38: manual step 13 · AC-39: command steps 1 to 3, with the earlier slices' suites
