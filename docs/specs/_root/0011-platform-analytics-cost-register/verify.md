# Verify: platform analytics and cost register · spec 0011 · updated 2026-10-26

_Steps derived from spec 0011 acceptance criteria and from every row of its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

### Access and the route group
- [ ] Sign in as a System Admin, open Administration. A "Platform" group with "Analytics" and "Costs" is in the rail → AC-20
- [ ] Visit `/areas-of-service/admin/analytics` and `/areas-of-service/admin/costs`. Both render, and the top bar reads "Platform analytics" / "Cost register" → AC-20
- [ ] Sign in as an Administration HOD who is **not** a System Admin. The "Platform" group is absent from the rail, and visiting either URL directly redirects to `/areas-of-service/admin` (not `/unauthorized`) → AC-17
- [ ] Sign out while the analytics page is open. The page does not throw an error before the redirect lands (the query returns `null`, not a thrown refusal) → AC-17

### People
- [ ] Open Analytics. Total accounts, visitors, verified members, pending verification, sign-ups in the last 7 and 30 days, and accounts deleted all show numbers → AC-4
- [ ] Delete an account, then reopen Analytics. Total accounts drops by one, "Accounts deleted" rises by one, and the deleted person is in no other figure → AC-4, AC-19
- [ ] Change a user from `visitor` to `member` (verify their profile). Visitors drops by one and verified members rises by one; `users.role` is what moved, not the profile row → AC-4 (value sourcing: visitor/member discriminator)
- [ ] Submit a profile so it sits in `pending_verification`. "Pending verification" rises by one; verified members does not → AC-4 (value sourcing: memberProfiles.profileStatus)

### Activity and the timezone edge
- [ ] Open the portal signed in, then reopen Analytics. "Active today" includes you → AC-1, AC-3
- [ ] **Timezone edge:** be active between 21:00 and 23:59 UTC (which is already tomorrow in Kampala, UTC+3). Confirm you are counted in the Kampala day that instant falls in, not the UTC one — the figure must not shift when the UTC date rolls over at a different moment from Kampala's → AC-3 (value sourcing: `kampalaDayStart`)
- [ ] A user active five minutes ago appears in all three windows; one active twelve days ago appears only in the 30-day window. The three windows nest → AC-3
- [ ] Each window is labelled on the page as "Active today / Since midnight in Kampala", "last 7 days", "last 30 days" → AC-3

### Devices
- [ ] Open the mobile app signed in. One `userDevices` row appears, with this phone's platform and app version → AC-2
- [ ] Background and reopen the app within ten minutes. `lastSeenAt` has **not** moved and no second row exists → AC-1, AC-2
- [ ] **Per-target throttle:** report from a second phone on the same account twelve minutes after the first. The account's `userActivity` row is untouched and a second `userDevices` row is created → AC-1
- [ ] **Device reassignment:** sign out on a phone, sign in as a different account, reopen. Exactly one row exists for that `deviceId` and its `userId` is the second account → AC-2
- [ ] The portal writes no device row: use only the web portal from a browser with no app installed and confirm `userDevices` gains nothing → AC-2 (value sourcing: portal passes no device fields)
- [ ] The Devices section names its 30-day window, splits Android and iPhone (the two summing to the total), and lists app versions descending as text → AC-5

### Engagement, Notifications and the calendar-month edge
- [ ] Verify a profile. "Profiles verified this month" rises by one → AC-6
- [ ] Send a department message and create a department activity starting this month. That department's row shows both → AC-6
- [ ] Soft-delete that message. The department's message count drops by one → AC-6 (value sourcing: `groupMessages.deletedAt`)
- [ ] Send a **clan** message. It appears in the "All clans combined" line, not in any department row, and is not lost → AC-6
- [ ] **Month-boundary edge:** create an activity starting on the 1st of next month. It is **not** in this month's figure. Create one starting on the last day of this month; it **is** → AC-6 (value sourcing: `kampalaMonthStart`, `by_department_start`)
- [ ] Create an activity last month that was *created* this month. It is not counted — the metric is activities **starting** this month → AC-6
- [ ] Send a notification. "Notifications sent" rises by one and "People reached" rises by the audience size → AC-7
- [ ] Set the Resend row's allowance on the Costs page. The emails tile changes to read "of N included" → AC-7 (value sourcing: `resend` row's `allowanceLimit`)

### Charts
- [ ] The growth chart's line ends at exactly the "Total accounts" tile's figure → AC-4
- [ ] A day nobody signed up is present on the growth axis with no bar, rather than skipped → AC-4
- [ ] The four recency bars sum to total accounts exactly → AC-3, AC-4
- [ ] The email chart's solid line stops at today; the dashed projection continues from that point to the month end and is labelled a projection → AC-7
- [ ] Clear the Resend allowance. The crimson allowance line disappears from the chart; the chart still draws → AC-7
- [ ] On the 1st of a month the projection still renders (no divide by zero) and the chart holds one day → AC-7
- [ ] The department chart is ranked by volume, busiest at the top, with a tooltip giving exact message and activity counts → AC-6
- [ ] Every chart is readable at phone width and leaves no horizontal page scroll → AC-20

### Decisions at a glance
- [ ] With a profile pending verification, the attention strip names it and links to the verification page → AC-4
- [ ] With nothing wrong, the strip reads "Nothing needs your attention right now" and carries no colour → AC-8
- [ ] Fail an email. A crimson line appears in the strip linking to Sentry → AC-8
- [ ] The "Reach, last 30 days" tile equals active-in-30 over total accounts, as a percentage, and reads "—" when there are no accounts → AC-3, AC-4
- [ ] The three activity bars never show a longer window shorter than a narrower one → AC-3
- [ ] The department bars are ranked by volume, not alphabetically, and a department with nothing this month reads "nothing yet" rather than showing 0 → AC-6
- [ ] Clear the Resend row's allowance. The email meter is replaced by a sentence pointing at the Costs page, never a bar against an invented ceiling → AC-7
- [ ] Clear the R2 row's allowance. The storage meter does the same → AC-8

### Health and storage
- [ ] Before the nightly job has ever run, the storage tile reads "Not measured yet" — never `0 B` → AC-8, AC-10
- [ ] After the job runs, the tile shows a binary-prefix figure (e.g. "48.8 MiB") to one decimal place, with the file count and the time it was measured → AC-8
- [ ] Set the Sentry row's console link. A "Sentry →" link appears in Health; clear it and the section says "Add the console link on the Costs page" instead of a dead anchor → AC-8
- [ ] Set the `play_console` and `app_store` console links. Both appear under Devices → AC-5

### Honest gaps
- [ ] All five gap lines render as sentences naming their owing feature — profile send-backs (9), claims waiting (17), radio listening hours (20), SMS (27), store downloads. None of them is a zero or a tile with a dash → AC-9

### The cost register
- [ ] Open Costs after the seed. Fourteen cards, each with the vendor's logo, its plan and its cost. Most read "Free"; Apple reads $99.00 a year, Google Play $25.00 once. Cloudflare Pages, Caster FM and the Africa's Talking balance read "not recorded", and each carries a note saying what to confirm → AC-16
- [ ] Every card shows a logo. The eleven vendors with a published mark show it in their own brand colour; Africa's Talking, Caster FM and the mobile money row show a monogram on a neutral tile → AC-11
- [ ] Add a service with a name the mark set does not know. Its card shows a monogram built from the first letters of that name, not a blank tile → AC-11
- [ ] Add a service with every field. It appears in the grid and an `activityLogs` row with action `cost.service_added` names the actor and the service → AC-11, AC-18
- [ ] Click a service name. A modal opens on Overview, headed by that vendor's logo, showing every recorded field and "not recorded" for the rest → AC-11
- [ ] Switch to Edit and back. The modal does not change height and nothing you typed is lost until you close it → AC-11
- [ ] Click a card's Edit action. The modal opens straight on the Edit tab → AC-11
- [ ] Open "Add a service". There is no Overview tab, and the logo tile shows a monogram until the name is saved → AC-11
- [ ] Edit it, archive it, and record a renewal on a renewing row. Each writes `cost.service_updated` / `cost.service_archived` / `cost.service_renewed` → AC-18
- [ ] **Clearing a field sticks:** on a service with a cost, set Currency back to "Not recorded" and save. Reopen it: the amount, currency and cycle are all empty, and the card reads "not recorded" → AC-11, AC-12
- [ ] Clear a renewal date and save. The date is gone, the card shows no renewal line, and the sweep stops notifying for it → AC-12, AC-14
- [ ] **No dead end:** on an annual service with a renewal date, switch the cycle to "One time" and save. It saves; the date is dropped rather than refused for a field that is no longer on screen → AC-12
- [ ] **A refusal is visible:** archive a service in one browser tab, then archive it again from a second tab that still shows it. The confirm dialog stays open and shows the server's reason, rather than closing as though it worked → AC-11
- [ ] Click Archive. A dialog asks, naming the service and saying nothing is deleted — not a browser alert. Cancel leaves the card alone → AC-11
- [ ] Confirm the archive. The button shows a loading state, the dialog closes itself, and the card leaves the grid and the totals; "Show archived" brings it back, dimmed and without actions, and editing it is refused → AC-11
- [ ] Press Escape while the archive is in flight. The dialog stays until the write finishes → AC-11
- [ ] **Renewal date now optional:** record an annual service with a cost and no renewal date. It saves, the card shows the cost with no renewal line, and the sweep sends nothing for it → AC-12
- [ ] **Money:** add USD 24.99 monthly and USD 99.00 annual. The USD monthly total reads $33.24, and the two rows' own "Per month" figures ($24.99 and $8.25) add up to exactly that → AC-13
- [ ] Add a UGX prepaid-credit row with a balance. It shows its own figure, contributes nothing to any monthly total, and **no** combined cross-currency total appears anywhere → AC-13
- [ ] A card with no cycle, currency or amount reads "not recorded" and joins no total → AC-13
- [ ] A `one_time` card shows its figure with "paid once" and contributes nothing to any monthly total → AC-13

### Both currencies
- [ ] Every priced card shows the billed figure large, with the other currency beneath it, marked "≈" → AC-13
- [ ] The foot of the page names the rate, the day it was fetched, and `open.er-api.com` → AC-13
- [ ] A fourth total card reads "Monthly total, all services" in shillings, marked "≈", and equals the dollar total converted at the stated rate → AC-13
- [ ] Delete the `exchangeRates` row and reload. Every "≈" line reads "Rate not available yet", the combined shilling total disappears, and no dollar figure changes → AC-13
- [ ] Set the row's `fetchedAt` back four days. The rate note turns crimson and says it has stopped refreshing; the figures stay → AC-13

### Renewal reminders
- [ ] Set a renewal date 14 days out and run the sweep. One push and one in-app notification reach every System Admin, titled "Renewal in 14 days: <name>" → AC-14
- [ ] Run the sweep again the same day. No second notice → AC-14
- [ ] **Catch-up:** skip the sweep on the day a service is exactly 14 days out, then run it the next day. The `t14` notice fires once, late → AC-14
- [ ] **Nearest stage wins:** record a renewal date 3 days out and run the sweep. Exactly one notice arrives, reading "Renewal in 3 days" — never a "in 14 days" notice carrying a date 3 days away → AC-14
- [ ] **Never a stage that has passed:** after that `t3` notice, run the sweep again the next day. Nothing is sent → AC-14
- [ ] **Already overdue when recorded:** record a renewal date 5 days in the past and run the sweep. The first notice is the overdue one, not `t14` then `t3` → AC-15
- [ ] **Re-arming:** record the renewal through "Record renewal". The date advances by the cycle, and the sweep notifies again at the new 14-day mark → AC-11, AC-14
- [ ] Set a renewal date in the past. The row takes the crimson treatment and reads "N days overdue"; the sweep sends one notice per calendar day → AC-15
- [ ] A row fifteen days overdue that has had fourteen notices gets no more, keeps the crimson treatment, and gains "Reminders stopped after 14 days. Still overdue." → AC-15

## Commands

- [ ] `pnpm exec convex run exchangeRates:fetchUsdToUgx` then `pnpm exec convex data exchangeRates` → exactly one USD/UGX row with a plausible rate and a fresh `fetchedAt` → AC-13
- [ ] Point `RATE_URL` at an unreachable host and run the job. The previous rate and its `fetchedAt` are untouched and the failure reaches Sentry → AC-13
- [ ] `pnpm exec convex run seed:costServices` on a register where a System Admin has edited one amount → that amount is unchanged, `filled` counts only the blanks → AC-16
- [ ] Archive the seeded Resend row, then re-run `seed:costServices` → a new live Resend row is created; the archived one is untouched and its `updatedAt` does not move → AC-16
- [ ] `pnpm test` → the `pickStage` suite passes, covering nearest-stage selection, the no-reaching-back rule, catch-up, and daily overdue notices → AC-14, AC-15
- [ ] Call `activity:recordActivity` with a 500-character `deviceId` → refused. Call it 21 times with fresh ids on one account → the 21st is refused and `userDevices` stops growing → AC-2
- [ ] `pnpm --filter @klt-cyber/shared test` → 50 cost-register tests pass (money formatter, exponent table, per-cycle monthly contribution including absent arguments, `advanceRenewalDate` across month/year/31st/leap boundaries, `isHttpsUrl`, `formatBytesBinary`, and the guard that every `SERVICE_USAGE_METRIC` key is a real `COST_SERVICE_KEYS` member) → AC-12, AC-13, AC-8
- [ ] `pnpm exec convex run seed:costServices` → `{ created: 14, total: 14 }`; run it again → `{ created: 0, total: 14 }` → AC-16
- [ ] `pnpm exec convex run analytics:measureStorage` then `pnpm exec convex data platformMetrics` → exactly one row, with `storageBytes`, `storageObjectCount` and `computedAt` → AC-10
- [ ] **Partial-failure case:** make the R2 credentials invalid and run `analytics:measureStorage`. `platformMetrics` keeps its previous figure **and** its original `computedAt`, and the failure reaches Sentry → AC-10
- [ ] `pnpm exec convex run costs:checkRenewalReminders` with no renewing service → no `costRenewalNotices` rows created → AC-14
- [ ] `pnpm --filter admin build` → both `/areas-of-service/admin/analytics` and `/areas-of-service/admin/costs` compile → AC-20
- [ ] Direct function calls as a non-System-Admin: `getPlatformAnalytics` and `listServices` return `null` for an unauthenticated caller and refuse a signed-in caller without the role; `createService` throws → AC-17
- [ ] **Validation, each refused:** a `free_tier` service given a renewal date; a `one_time` service given one; `2026-02-30`; a name differing only in case and trailing whitespace from a live row; a fractional amount; a negative amount; a `javascript:` console URL; a name over 80 characters → AC-12
- [ ] Delete an account with two device rows: both `userDevices` rows and its `userActivity` row are gone, in the same transaction as the rest of spec 0008's anonymizing → AC-19

## Acceptance-criteria coverage

- AC-1 (activity recorded, per-target 55-minute throttle) … portal/mobile activity steps + per-target throttle step
- AC-2 (one device row per device id, reassignment, portal writes none) … the four Devices steps
- AC-3 (three nesting windows, Kampala today, deleted excluded) … activity steps incl. the timezone edge
- AC-4 (People figures, role and profileStatus as sources) … the four People steps
- AC-5 (Devices split, versions, store links) … Devices section step + store links step
- AC-6 (Engagement, calendar month, clans line, soft deletes) … the seven Engagement steps incl. the month boundary
- AC-7 (notifications sent vs recipients, email allowance) … the three Notifications steps
- AC-8 (failed emails, storage with its time, Sentry link) … the three Health steps + the shared-test command
- AC-9 (five named gaps, never a zero) … the honest-gaps step
- AC-10 (nightly job, complete pass only, Sentry on failure) … storage commands incl. the partial-failure case
- AC-11 (add/edit/archive/record renewal, nothing deleted) … the cost register steps + re-arming
- AC-12 (every validation rule) … the validation command step + the shared-test command
- AC-13 (monthly total per currency, per-row rounding, no conversion, "not recorded") … the three money steps
- AC-14 (three stages, once each, thresholds not equalities) … the four reminder steps
- AC-15 (overdue daily, capped at 14, then silent but still marked) … the two overdue steps
- AC-16 (reference seed: names/keys/purposes only, idempotent, safe in production) … the seed command + the post-seed page step
- AC-17 (System Admin only, null not throw, redirect) … the four access steps + the direct-call command
- AC-18 (an audit entry per cost write) … the add step + the four-action step
- AC-19 (deletion removes device and activity rows) … the deletion command + the People deletion step
- AC-20 (both pages in the System Admin route group) … the three route-group steps + the build command
