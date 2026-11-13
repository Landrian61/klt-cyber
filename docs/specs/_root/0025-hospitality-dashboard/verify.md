# Verify: Hospitality dashboard and grouped sidebar · spec 0025 · updated 2026-11-13
_Steps derived from spec 0025 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Slice 1: thin thread

### UI / manual
- [ ] Sign in as the Hospitality HOD, open `/areas-of-service/hospitality/dashboard` → the Hospitality Dashboard shows (title, period switch, headline numbers), not the shared roster Dashboard → AC-1
- [ ] Open the same page as a Hospitality delegate, a verified Hospitality roster member and a System Admin → all three see the same content → AC-2
- [ ] Look over the Hospitality Dashboard → no verified member count, requests waiting tile, mentorship count, next activities, recent activity feed or church week → AC-3
- [ ] Open the Finance and Library Dashboards → both unchanged (Finance shared, Library four tabs) → AC-1
- [ ] Load the page with no `?period=` → "12 weeks" is selected; pick "6 months" → address shows `?period=6m`; reload → still 6 months; try `?period=1y` → reads as 12 weeks → AC-5
- [ ] On a Wednesday with 12 weeks selected, check the range line → it starts on a Sunday 11 weeks before this week's Sunday and ends today → AC-6
- [ ] Leave the tab open across Kampala midnight (or change the clock) → within a minute the range line ends on the new day → AC-6 (today rollover)
- [ ] With a period that had no visitors before it → Visitors and First timers show no change figure; Came back and Contacted on time show their plain hint instead of "Up/Down" → AC-7
- [ ] Record a first timer today, call them today → Contacted on time does not count them yet (still inside 2 days); on day 3 they count on time → AC-8
- [ ] Record a first timer, send them only an in app message → Contacted on time and the median ignore it → AC-8
- [ ] Remove a visitor whose first visit is in the window → First timers still counts them; join a walk in to an app row → the person is counted once → AC-10
- [ ] On a fresh deployment with no visits at all → only the welcome panel shows, with "Add a walk in" (opens the add walk in dialog) and "Go to Visitors" → AC-17

### Commands
- [ ] `pnpm --filter @klt-cyber/shared test -- hospitalityDashboard` → all pass (period, window, on time boundary, median, change) → AC-5 to AC-8, AC-24
- [ ] `pnpm exec vitest run --config convex/vitest.config.ts hospitalityDashboard` → all pass (headline numbers, day 2 vs day 3, in app ignored, cohort status rule, welcome state, refusal) → AC-7, AC-8, AC-10, AC-17
- [ ] `pnpm run test:convex` → all pass, including Reports unchanged after the AC-35 cards were removed → AC-4

### Value sourcing
- [ ] today: change the browser's timezone away from Kampala (say to UTC-5 late in the evening) → the window still ends on the Kampala date, not the local one
- [ ] window and previous window: compare the range line with `dashboardWindow(today, period)` for each period; the previous window is the same number of days ending the day before
- [ ] period: `?period=` drives the query; an unknown value reads as `12w`
- [ ] headline visitors: a removed visitor with a visit in the window still counts
- [ ] headline first timers and came back: cohort rows only (`active`, `member`, `removed`), came back is `visitCount >= 2` over the cohort
- [ ] contacted on time and median days: personal contacts only, day taken in Kampala time (a call at 23:30 Kampala on day 2 is on time)
- [ ] change: a 0 previous count shows no change figure; a percent shows points, not percent
- [ ] welcome panel: one recorded visit anywhere (even years ago) hides the welcome panel

## Slice 2: grouped sidebar and badges

### UI / manual
- [ ] As the Hospitality HOD, open any Hospitality page → the sidebar reads Dashboard alone at the top, then **Welcome and care** (Visitors, Follow ups, Clan placement), **Insights** (Reports), **Team** (Roster, Activities, Messages), with Settings in the footer; icons as before → AC-21
- [ ] Collapse the sidebar to the icon rail → group labels and badges hide; hover Follow ups → the tooltip reads "Follow ups, 3 unassigned" (or the real count) → AC-21, AC-22
- [ ] At phone width open the menu sheet → the same groups and footer show → AC-21
- [ ] As a Hospitality roster member → Team shows only what their capabilities allow (no Roster); no Roster badge anywhere → AC-21, AC-22, AC-23
- [ ] Open Finance and Library → their sidebars are the flat "Department" list, unchanged → AC-21
- [ ] Leave two first timers unassigned → Follow ups badge reads 2; assign one → it drops to 1 without a reload; assign both → the badge disappears → AC-22
- [ ] A verified member with no clan → Clan placement badge counts them; place them → it goes away → AC-22
- [ ] As the HOD, with a pending claim on Hospitality's roster → Roster badge reads 1 → AC-22
- [ ] With a screen reader, focus Follow ups → it announces the label and the count ("Follow ups, 2 unassigned") → AC-22

### Commands
- [ ] `pnpm --filter @klt-cyber/shared test -- hospitalityDashboard` → `badgeLabel` hides 0 and reads "99+" from 100 → AC-22
- [ ] `pnpm exec vitest run --config convex/vitest.config.ts hospitalityDashboard` → badge counts, the roster member's `null`, the cap of 100 and the non operator's `null` all pass → AC-22, AC-23

### Value sourcing
- [ ] sidebar layout: comes from `can.manageHospitality`; a System Admin opening Hospitality gets the grouped layout, the same System Admin opening Finance gets the flat one
- [ ] unassigned badge: only `open` follow ups with no `assignedTo` count; a closed unassigned one does not
- [ ] waiting for a clan badge: a verified member whose account was deleted never counts
- [ ] requests waiting badge: only `pending_claim` rows for Hospitality, never another department's

## Slice 3: act today

### UI / manual
- [ ] With open follow ups 1, 6, 11 and 22 days old → Follow up health shows one in each group (0 to 2, 3 to 7, 8 to 14, 15 days or more), the last in crimson and labelled "overdue", plus "N of M not given to anyone yet"; each group links to Follow ups → AC-9
- [ ] Needs attention lists unassigned or 15+ day follow ups, oldest first visit first, at most 5, each with name, days waiting and assignee (or "Unassigned"); click one → opens `/areas-of-service/hospitality/visitors/<id>` → AC-9
- [ ] Join a walk in whose follow up is listed → the row now opens the surviving record → AC-9
- [ ] Assign every open follow up and none overdue → Needs attention reads "Nobody is waiting too long" → AC-9
- [ ] Team load shows "Unassigned" at the top, then each person by open count, highest first, with done in the selected period; switch 4 weeks to 6 months → only the Done column changes → AC-15, AC-5
- [ ] Remove someone from Hospitality who still holds a follow up → they show the "former operator" tag; delete an account that closed one → the row reads "a former member" → AC-15
- [ ] Clan balance lists every clan as a bar, smallest first, the smallest three (ties included) in gold with the word "smallest", plus "N members are waiting for a clan" and a Clan placement link → AC-16
- [ ] Switch the period → Follow up health, Needs attention, the open column of Team load and Clan balance stay the same → AC-5

### Commands
- [ ] `pnpm --filter @klt-cyber/shared test -- hospitalityDashboard` → `followUpAgeBucket` edges (2/3, 7/8, 14/15) pass → AC-9
- [ ] `pnpm exec vitest run --config convex/vitest.config.ts hospitalityDashboard` → buckets, attention order and cap, team load (former operator, former member, window), clan order and highlight, waiting count and null without access pass → AC-9, AC-15, AC-16

### Value sourcing
- [ ] days waiting: `firstVisitDate` to the Kampala today; a follow up whose first visit was 2 days ago sits in 0 to 2, at 3 days in 3 to 7
- [ ] done in period: a follow up closed at 23:30 Kampala on the window's first day counts; one closed the day before does not
- [ ] waiting for a clan: a verified member whose account was deleted never counts, here or on the badge

## Slice 4: trends

### UI / manual
- [ ] On the 12 week view, Attendance trend shows 12 weekly bars, first timers (gold) stacked on returning (royal blue), with a legend and a table of Visitors, First timers and Returning under it → AC-11, AC-19
- [ ] On a Wednesday, the last bin reads "(so far)" in both the chart and the table → AC-11
- [ ] Switch to 6 months → six monthly bins, the address shows `?period=6m`, and the current month reads "(so far)" → AC-11, AC-5
- [ ] Click "Open in Reports" → Reports opens with the Dashboard's window as its from and to dates, and its weekly numbers match the trend table → AC-11
- [ ] Visitor journey lists seven steps (First visit, Contacted, Reached, Came back, Became a regular, On the app, Member), each with a count and a percent of the first timers → AC-12
- [ ] Send an in app message to a first timer with no other contact → Contacted and Reached do not change → AC-12, AC-8
- [ ] Contact outcomes shows four outcome bars split by Call, WhatsApp, SMS and In person, a legend, and a table with every count plus a Reach rate row ("None" for a channel with no contacts) → AC-13, AC-19
- [ ] Visitor mix shows Age group, Sex, Came through and Invited, each with "Not recorded" where it applies, counts and percents in text → AC-14
- [ ] A visitor with both a linked inviter and a typed name counts once, under "By a member" → AC-14
- [ ] A period with no first timers → Visitor journey and Visitor mix show their empty states; a period with no contacts → Contact outcomes shows its empty state → AC-18
- [ ] With reduced motion on in the OS, the trend chart draws without animating → AC-19

### Commands
- [ ] `pnpm --filter @klt-cyber/shared test -- hospitalityDashboard` → journey steps, `invitedSourceOf` (member wins, blank name is none) and `isBinSoFar` edges pass → AC-12, AC-14, AC-11
- [ ] `pnpm run test:convex -- hospitalityDashboard hospitalityReports` → trend bins equal Reports over the same range, "so far" bin, monthly bins for 6m, journey steps, mix, outcomes by channel, reach rate, `null` without access pass → AC-11 to AC-14

### Value sourcing
- [ ] trend bins: `reportBins` plus `binVisitors`, the same helper Reports calls; a visitor whose first visit is before a bin counts as returning in it
- [ ] so far: the bin whose start to end holds the browser's Kampala today; at 23:59 on a Saturday the week is still "so far", at midnight the next week is
- [ ] contacted / reached: contacts on or after the Kampala start of `firstVisitDate`; a reached call the day before the first visit never counts
- [ ] regular: `lastRegularMonth` set, so someone regular in an earlier month still counts in the journey
- [ ] outcomes: `at` inside the window's Kampala day bounds; a call at 23:30 Kampala on the window's first day counts, one the day before does not; a removed visitor's contacts still count
- [ ] invited: `invitedByUserId` wins over `invitedByText`; a blank typed name reads "Not recorded"

## Acceptance-criteria coverage
- AC-1 … steps 1, 4 · AC-2 … step 2 · AC-3 … step 3 · AC-4 … commands step 3 (removal landed early, see the build report) · AC-5 … step 5 · AC-6 … steps 6, 7 · AC-7 … step 8 · AC-8 … steps 9, 10 · AC-10 … step 11 · AC-17 … step 12
- AC-21 … slice 2 steps 1 to 5 · AC-22 … slice 2 steps 2, 4, 6 to 9 · AC-23 … slice 2 step 4 and commands
- AC-9 … slice 3 steps 1 to 4 · AC-15 … slice 3 steps 5, 6 · AC-16 … slice 3 step 7
- AC-11 … slice 4 steps 1 to 4 · AC-12 … slice 4 steps 5, 6 · AC-13 … slice 4 step 7 · AC-14 … slice 4 steps 8, 9
- The finish slice (AC-18 to AC-20, AC-24) adds its steps here as it lands.
