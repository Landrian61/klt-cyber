# 0025. Hospitality dashboard and grouped sidebar

**Date**: 2026-11-13
**Status**: In Progress

## Summary

Hospitality gets its own Dashboard in place of the shared department one, so the page shows what is happening with visitors instead of roster upkeep. It leads with what to act on today (follow ups that are waiting, unassigned or overdue), then the trends that guide decisions: attendance, the visitor journey toward membership, how contacts go, who is visiting and how balanced the clans are. Hospitality's sidebar is grouped by purpose (Welcome and care, Insights, Team, Settings at the bottom), with count badges for the work waiting. Everything is computed from data Hospitality already records, so no schema change is needed. This amends spec 0012 AC-2 (which departments may replace the shared Dashboard) and replaces spec 0024 AC-35 (the Hospitality cards under the shared Dashboard).

## Requirements

**User stories**:
- As the Hospitality HOD, on Monday morning I see which first timers are still waiting, who has them, and which are overdue, so nobody slips through the cracks.
- As the HOD, I see whether we contact first timers within 2 days and whether that is getting better or worse than the period before.
- As the HOD, I see where visitors drop off on the road from first visit to membership, so I know what to fix.
- As the HOD, I see who on the team is carrying the follow ups and who is clearing them, so I can rebalance.
- As a Hospitality team member, I see who is visiting (age group, sex, walk in or app, invited or not), so we plan who serves at the welcome desk.
- As a Hospitality team member, the sidebar tells me how much work is waiting without opening each page.

**Acceptance criteria** (the contract, each independently checkable):

Shell
- **AC-1**: On `/areas-of-service/[slug]/dashboard`, a caller holding `can.manageHospitality` sees `HospitalityDashboard` instead of the shared `DepartmentDashboard`. Spec 0012 AC-2 is amended to name Hospitality, beside Media and the Library, as a department that renders its own Dashboard, and so is SRS 4.7.1 ("Media (4.11) and the Library (4.13) do") with a matching **Dashboard** line in SRS 4.10. No other department's Dashboard changes.
- **AC-2**: Every operator (Hospitality HOD, delegates, verified roster members and a System Admin) sees the same Dashboard content. Nothing on it is gated by role beyond `manageHospitality`.
- **AC-3**: None of the shared Dashboard's team items appear on the Hospitality Dashboard: no verified member count, requests waiting tile, mentorship count, next activities, recent activity feed or church week. They stay reachable on the Roster and Activities pages.
- **AC-4**: The spec 0024 AC-35 cards are removed: `HospitalityDashboardExtras`, `getDashboardExtras`, `dashboardExtras` and their tests are deleted, with nothing still referencing them. Spec 0024 AC-35 is amended to point to this spec.

Period
- **AC-5**: A period switch offers 4 weeks, 12 weeks (default) and 6 months, held in the address as `?period=4w|12w|6m`. A missing or unknown value reads as `12w`. The period drives the headline numbers, the attendance trend, the funnel, contact outcomes, visitor mix, and the "done in period" half of team load. Follow up health, needs attention, the open half of team load and clan balance always show the present.
- **AC-6**: The window is `dashboardWindow(today, period)` from `packages/shared`: for `4w` and `12w`, from the Sunday that starts the week 3 or 11 weeks before the current Kampala week, to today; for `6m`, from the 1st of the month 5 months before the current Kampala month, to today (so a 6 month window is 150 to 181 days long). The previous window has the same number of days and ends the day before the window starts, so it may start mid week or mid month. `today` is `kampalaToday()` in the browser, and the page moves it forward when the Kampala date changes while the tab stays open. `daysBetweenKeys(a, b)` is `b` minus `a` in whole days, signed, not inclusive.

Headline numbers
- **AC-7**: Four headline numbers, each with its change against the previous window, shown as an up or down figure: for a count, the percent change (no change figure when the previous count is 0); for a percent, the difference in percentage points (no change figure when the previous window had no one to measure): **Visitors** (distinct visitors with a visit in the window, removed visitors included since their visits stay; merged rows have no visits left), **First timers** (the cohort, AC-10), **Came back** (cohort rows with `visitCount` of 2 or more, over the cohort size; no figure when the cohort is empty) and **Contacted on time** (AC-8).
- **AC-8**: A **personal contact** is a `visitorContacts` row with channel `call`, `whatsapp`, `sms` or `in_person` (`PERSONAL_CONTACT_CHANNELS`), whatever its outcome; `in_app` never counts. Its day is `kampalaDateKeyAt(at)`, and it counts for a visitor only when that day is on or after their `firstVisitDate` (no upper bound up to today). The deadline is `firstVisitDate` plus `CONTACT_ON_TIME_DAYS` (2) days, inclusive. A cohort row is **eligible** when `daysBetweenKeys(firstVisitDate, today)` is 3 or more, so a visitor still inside their deadline is never counted late. **Contacted on time** is eligible rows whose first personal contact day is on or before the deadline, over all eligible rows (numerator and denominator are both eligible rows only). Beside it, the median `daysBetweenKeys(firstVisitDate, firstContactDay)` over every contacted cohort row, eligible or not. With no eligible rows it shows "Not yet" instead of a percent.

Act today
- **AC-9**: **Follow up health** shows every open follow up grouped by days waiting since its `firstVisitDate`: 0 to 2, 3 to 7, 8 to 14, and 15 or more (`FOLLOW_UP_OVERDUE_DAYS`), the last in crimson, with the count of unassigned ones. Each group links to the Follow ups page. **Needs attention** lists up to `ATTENTION_LIST_SIZE` (5) open follow ups that are unassigned or waiting 15 or more days, ordered by `firstVisitDate` then `openedAt`, each showing the visitor's name, days waiting and assignee (or "Unassigned"), and linking to `/areas-of-service/[slug]/visitors/[visitorId]` for the follow up's `visitorId` (after a join, that is the surviving record). An empty list reads "Nobody is waiting too long".
- **AC-10**: The **cohort** is every `visitors` row whose `firstVisitDate` falls in the window and whose `listStatus` is `active`, `member` or `removed` (removed rows count but show no name anywhere; merged rows never count, since their visits moved to the survivor).

Trends
- **AC-11**: **Attendance trend**: distinct visitors per bin across the window, first timers stacked on returning visitors, binned by `reportBins(from, to)` (weekly for 4 and 12 weeks, monthly for 6 months), with the numbers in a table under the chart. The bin counting is one Convex helper, `binVisitors(bins, visits, visitorsById)` in `convex/lib/hospitalityStats.ts`, extracted from `hospitalityReport` and called by both Reports and the Dashboard (first timer when `firstVisitDate` is inside the bin, returning when before it). The bin holding today is labelled "so far" in the chart and the table. A link opens Reports with the same range.
- **AC-12**: **Visitor journey** for the cohort, seven steps, each counted against the cohort and shown as a count and a share of it: first visit (the cohort); contacted (any personal contact, AC-8, on or after `firstVisitDate`, up to today); reached (any contact of any channel with outcome `reached`, on or after `firstVisitDate`); came back (`visitCount` of 2 or more); regular (has ever had a regular month: `lastRegularMonth` is set, not "regular right now"); on the app (`userId` set); member (`listStatus` is `member`). A later step can be larger than an earlier one; each bar stands on its own.
- **AC-13**: **Contact outcomes**: every personal contact (AC-8 channels) with `at` in the window's Kampala day bounds, whatever the visitor's status, one bar per outcome (reached, no answer, wrong number, asked not to be contacted), each split by channel. The table adds the reach rate per channel: reached contacts over all personal contacts on that channel.
- **AC-14**: **Visitor mix** for the cohort, labelled with the existing shared maps (`VISITOR_AGE_BRACKET_LABELS`, `VISITOR_SEX_LABELS`, `VISITOR_KIND_LABELS`): age group (with "Not recorded"), sex (with "Not recorded"), source (`kind`), and invited ("By a member" when `invitedByUserId` is set, which wins when both are set; "By name" when only `invitedByText` is set; else "Not recorded").

Team and clans
- **AC-15**: **Team load**: per person, open follow ups assigned to them now, and follow ups they closed (`closedBy`) with `closedAt` in the window, sorted by open count descending, with one "Unassigned" row at the top for open follow ups nobody has. A person whose account is gone reads "a former member" (the `staffName` fallback: user row missing or `deletedAt` set); a live person who is no longer an operator is marked "former operator".
- **AC-16**: **Clan balance**: every clan's verified member count as horizontal bars, smallest first, with the `SMALLEST_CLANS_HIGHLIGHTED` lowest highlighted (ties included, `smallestClanFlags`), plus the count of members **waiting for a clan** and a link to Clan placement. Waiting for a clan means a `memberProfiles` row with `profileStatus` `verified`, no `clanId`, and a user that exists without `deletedAt`, read through `by_profileStatus_verifiedAt`.

States
- **AC-17**: Until Hospitality has any `visitorVisits` row at all, the Dashboard shows one welcome panel instead of the charts: a line on what will appear here, an "Add a walk in" button opening the existing add walk in sheet, and a link to Visitors.
- **AC-18**: Each panel group has its own query (API surface) and its own error boundary, so a failed query shows `ErrorState` with retry in that group only and never takes down the rest of the page. Each panel loads with its own skeleton and shows an explicit empty state when its numbers are all zero. A query returning `null` (access lost) shows `ErrorState`.
- **AC-19**: Every chart has its numbers readable without the chart (a table or labelled values), the funnel and buckets name their counts in text, colour is never the only carrier of meaning, and motion respects `prefers-reduced-motion`.
- **AC-20**: At 375 pixels wide the Dashboard is one column, charts fit their card, tables never scroll the page sideways (NF-08).

Sidebar (Hospitality only)
- **AC-21**: When `can.manageHospitality` is true, the sidebar renders grouped: Dashboard alone at the top; **Welcome and care** (Visitors, Follow ups, Clan placement); **Insights** (Reports); **Team** (Roster, Activities, Messages, each still gated by its own capability); Settings in the sidebar footer, visible to every caller as today. Items keep today's icons. Group labels hide on the collapsed icon rail, and the phone sheet shows the same groups. A group with no visible items is not rendered. Every other department keeps today's flat list, unchanged.
- **AC-22**: Count badges: Follow ups shows open follow ups with no assignee; Clan placement shows members waiting for a clan (AC-16); Roster shows pending claims for Hospitality, only for a caller holding `viewRoster`. Each count stops reading at 100 rows (`BADGE_CAP`), so a zero hides the badge and 100 or more reads "99+". The count is also in the item's accessible name and tooltip, so the collapsed icon rail still says it.
- **AC-23**: Badges come from one query, `hospitality.getSidebarBadges`, returning `null` for a caller without `manageHospitality` and `requestsWaiting: null` for a caller without `viewRoster`.

Quality
- **AC-24**: `packages/shared` holds `DASHBOARD_PERIODS`, `parseDashboardPeriod`, `dashboardWindow`, `daysBetweenKeys`, `followUpAgeBucket`, `CONTACT_ON_TIME_DAYS`, `FOLLOW_UP_OVERDUE_DAYS`, `ATTENTION_LIST_SIZE`, `PERSONAL_CONTACT_CHANNELS`, `BADGE_CAP`, `medianOf` and `changeAgainst`, each with Vitest tests. Convex tests cover each query's numbers on seeded data, the eligible and on time boundary (day 2 not eligible, day 3 eligible), the cohort's status rule, the shared bin helper giving Reports the same numbers as before, the unassigned badge's read of follow ups with no `assignedTo`, the badge counts and their `null` cases, and refusal for a non operator.

## Decision

**Chosen option**: Option 2: a Hospitality Dashboard of its own, fed by one read only query per panel group over existing tables, with a Hospitality only grouped sidebar.

Hospitality becomes the third department to replace the shared Dashboard, using the same capability branch the Library uses, and its sidebar groups only when `manageHospitality` is true.

**Implementation skills**: `convex` (`.claude/skills/convex/`) for the queries and tests · `shadcn` (`.claude/skills/shadcn/`) for the sidebar groups, badges and footer

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model**: no change. No new table, field or index. Read only over `visitors`, `visitorVisits`, `visitorContacts`, `followUps`, `memberProfiles`, `clans`, `roleAssignments` and `departmentMemberships`, through indexes that exist today:

| Read | Index |
|---|---|
| visits in a window | `visitorVisits.by_visitDate` |
| cohort | `visitors.by_listStatus_firstVisitDate`, once each for `active`, `member`, `removed` |
| a visitor's contacts | `visitorContacts.by_visitorId_at` |
| contacts in a window | `visitorContacts.by_at` |
| open follow ups | `followUps.by_status_firstVisitDate` (`open`) |
| unassigned open follow ups | `followUps.by_assignedTo_status_firstVisitDate` (`assignedTo` absent, `open`) |
| closed in a window | `followUps.by_status_closedAt` (`done`, range) |
| any visit at all | `visitorVisits.by_visitDate`, `.first()` |
| clans and sizes | `clans.by_order`, `memberProfiles.by_clanId_profileStatus` (existing `clanSizes`) |
| waiting for a clan | `memberProfiles.by_profileStatus_verifiedAt` (`verified`), `clanId` absent, live user |
| pending claims | `departmentMemberships.by_departmentId_status` (`pending_claim`) |

**API surface** (Convex, `convex/hospitality.ts`; "operator" is a caller holding `manageHospitality`, resolved by `hospitalityOperatorOrNull`; every query returns `null` without it):

| Function | Type | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getDashboardOverview` | query | `today`, `period` | `{ window, previousWindow, hasAnyVisit, headline: { visitors, firstTimers, cameBackPercent, onTime: { percent \| null, medianDays \| null, eligible } } each with its `previous`, trend bins with `soFar` on the bin holding today }` | operator | `HOSPITALITY_TODAY_INVALID`, `HOSPITALITY_PERIOD_INVALID` |
| `getVisitorJourney` | query | `today`, `period` | `{ cohortSize, steps: [{ key, count }], mix: { age, sex, source, invited } }` | operator | as above |
| `getContactOutcomes` | query | `today`, `period` | `{ byOutcome: [{ outcome, byChannel }], reachRate: [{ channel, reached, total }] }` | operator | as above |
| `getFollowUpHealth` | query | `today`, `period` | `{ buckets: [{ key, count }], unassigned, attention: [...up to 5], teamLoad: { unassignedOpen, rows: [{ userId, name, former, open, doneInPeriod }] } }` | operator | as above |
| `getClanBalance` | query | none | `{ clans: ClanSizeRow[], waitingForClan }` | operator | none |
| `getSidebarBadges` | query | none | `{ unassignedFollowUps, waitingForClan, requestsWaiting \| null }` | operator | none |

`HOSPITALITY_PERIOD_INVALID` joins `HOSPITALITY_ERROR_CODES`. Removed: `getDashboardExtras`.

**Value sourcing**

| Action | Value | Source |
|---|---|---|
| all | today | `today` argument, the browser's `kampalaToday()` (spec 0012 convention, keeps subscriptions deterministic) |
| all | window and previous window | `dashboardWindow(today, period)` in shared (AC-6) |
| page | period | `?period=` search param through `parseDashboardPeriod` (default `12w`) |
| headline | visitors | distinct `visitorId` over `visitorVisits.by_visitDate` in the window |
| headline | first timers | the cohort size (AC-10) |
| headline | came back | cohort rows with `visitCount >= 2`, over the cohort size |
| headline | contacted on time | per eligible cohort row, earliest personal contact day `kampalaDateKeyAt(at)` from `by_visitorId_at`, compared with `firstVisitDate + CONTACT_ON_TIME_DAYS` via `daysBetweenKeys` |
| headline | median days | `medianOf` the contacted rows' `daysBetweenKeys(firstVisitDate, firstContactDay)` |
| headline | change | `changeAgainst(current, previous)`: the same computation over the previous window; `null` when previous is 0 |
| trend | bins, first timers, returning | `reportBins(from, to)` and `binVisitors` (AC-11), the same helper Reports now calls |
| trend | so far | the bin whose `start` to `end` holds `today` |
| funnel | contacted / reached | cohort rows with any personal contact / any contact with `outcome: "reached"` on or after `firstVisitDate` (`by_visitorId_at`, starting at `kampalaDayStartMs(firstVisitDate)`) |
| funnel | came back, regular, on the app, member | `visitCount >= 2`, `lastRegularMonth !== undefined`, `userId !== undefined`, `listStatus === "member"` |
| outcomes | counts by outcome and channel | `visitorContacts.by_at` in the window's Kampala day bounds (`kampalaDayStartMs(from)` to `kampalaDayEndMs(to)`), channel in `PERSONAL_CONTACT_CHANNELS` |
| mix | age, sex, source, invited | cohort `ageBracket`, `sex`, `kind`, `invitedByUserId` / `invitedByText` |
| health | days waiting | `daysBetweenKeys(followUp.firstVisitDate, today)`, bucketed by `followUpAgeBucket` |
| attention | rows | open follow ups where `assignedTo` absent or days waiting ≥ `FOLLOW_UP_OVERDUE_DAYS`, `firstVisitDate` ascending, first `ATTENTION_LIST_SIZE`; name via `visitorDisplayName`, assignee via `staffName` |
| team load | open | open follow ups grouped by `assignedTo` |
| team load | done in period | `followUps.by_status_closedAt` (`done`, `closedAt` in the window's day bounds) grouped by `closedBy` |
| team load | former operator | `isHospitalityOperatorUser` per person, read once each |
| clans | sizes, highlight | existing `clanSizes(ctx)` |
| clans and badge | waiting for a clan | the AC-16 rule; the badge stops after `BADGE_CAP` matching rows |
| badge | unassigned follow ups | `by_assignedTo_status_firstVisitDate` with `assignedTo` absent and `open`, `take(BADGE_CAP)` |
| badge | requests waiting | `departmentMemberships.by_departmentId_status` (Hospitality's id, `pending_claim`), `take(BADGE_CAP)`; only when `departmentCapabilities(role, name).viewRoster` |
| outcomes | reach rate | reached over all personal contacts per channel in the window |
| mix | labels | `VISITOR_AGE_BRACKET_LABELS`, `VISITOR_SEX_LABELS`, `VISITOR_KIND_LABELS` in shared |
| team load | unassigned row | open follow ups with `assignedTo` absent |
| page | today rollover | the browser clock checked once a minute; when `kampalaToday()` changes, the new day is sent |
| welcome panel | any visit at all | `hasAnyVisit` from `visitorVisits.by_visitDate.first()` |
| sidebar | which layout | `can.manageHospitality` from the shell context |

**Key invariants**
- Every number is read only and recomputed live; nothing is stored.
- A merged row never counts; a removed row counts but never shows a name.
- An in app message never counts as contact, on time or reached.
- A visitor still inside the 2 day window is never counted late.
- An open follow up never belongs to a removed visitor (removal closes it, spec 0024 AC-25) or to a merged one (the join moves it to the survivor, AC-28), so no Dashboard list can show a removed visitor's name.
- A join can move a walk in's `firstVisitDate` earlier, so a visitor can move from one window's cohort to an earlier one. Accepted drift.
- Reports and the Dashboard count bins through the same `binVisitors` helper, so they never disagree.
- No other department's Dashboard or sidebar changes.

**Security model**
- All six queries resolve the caller through `hospitalityOperatorOrNull` and return `null` without `manageHospitality`, exactly like the rest of Hospitality. No mutations are added.
- `requestsWaiting` is computed only for a caller whose shell role grants `viewRoster`, so a roster member never learns the pending claim count.
- The Dashboard shows visitor names only in needs attention (operators already see them on Visitors). The mix and funnel are counts only. `accountPhone` and contact notes never leave the server here.

**UI** (design source: the existing design system, Kingdom Radiant in `spec/INTERFACE_SPEC.md`, the portal's `components/ui`, and the recharts style of `LibraryMovementsChartBody` and `ReportChartBody`):
- Order, top to bottom: header with the period switch (`SegmentedFilter`); headline numbers (`StatCard` row with change figures in mono); Needs attention beside Follow up health; Attendance trend; Visitor journey; Contact outcomes beside Team load; Visitor mix beside Clan balance.
- Charts load lazily with `next/dynamic` and `ssr: false`, as the portal's other charts do. Gold, Royal Blue and Crimson only, with legends and text values.
- Each panel sits in its own error boundary (`RetryBoundary` pattern from slice 11).
- Sidebar uses shadcn `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenuBadge` and `SidebarFooter`.

**Critical test scenarios**
- Monday after a Sunday with three first timers: one called the same day, one called on day 3, one not yet called → on time reads 50% of two eligible once day 2 passes, the third appears in needs attention when unassigned, verifies **AC-8**, **AC-9**.
- A visitor whose first visit was 2 days ago and nobody has called → not eligible, not counted late; on day 3 → eligible and late, verifies **AC-8**.
- Reports over a fixed range → the same bin numbers before and after `binVisitors` is extracted, verifies **AC-11**.
- A 12 week view on a Wednesday → the last weekly bin is labelled "so far", verifies **AC-11**.
- A failing `getContactOutcomes` → only the outcomes panel shows `ErrorState`; the rest renders, verifies **AC-18**.
- An in app message to every first timer → contacted and on time unchanged, verifies **AC-8**, **AC-12**.
- A joined walk in (merged app row) → counted once, verifies **AC-10**.
- Switching 12w to 6m → monthly bins, the address shows `?period=6m`, reload keeps it, verifies **AC-5**, **AC-11**.
- A brand new deployment → welcome panel only, verifies **AC-17**.
- A Finance HOD and an unverified Hospitality roster member → every query `null`, verifies **AC-2**, **AC-23**.
- A Hospitality roster member → badges show follow ups and clans, no Roster badge, verifies **AC-22**, **AC-23**.
- Library's and Finance's sidebars and Dashboards → unchanged, verifies **AC-1**, **AC-21**.

## Build plan

Tracer Bullet (no approach is recorded for this feature or project, so this is the stated default): one thin thread from the shared helpers through a query to the new page and the new sidebar first, then one panel at a time, end to end. No migration.

1. Thin thread: first amend SRS 4.7.1 and 4.10 (AC-1; the SRS is the source of truth, so it moves before the code does); then shared `DASHBOARD_PERIODS`, `parseDashboardPeriod`, `dashboardWindow`, `daysBetweenKeys`, `changeAgainst`, `PERSONAL_CONTACT_CHANNELS`, `CONTACT_ON_TIME_DAYS`, `medianOf` with tests; `getDashboardOverview` returning `hasAnyVisit` and the headline numbers; `HospitalityDashboard` with the period switch in the address, headline row and welcome panel; the dashboard page branch on `manageHospitality`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-10**, **AC-17**, **AC-24** (shared part).
2. Grouped sidebar and badges: `getSidebarBadges`, the Hospitality group layout, footer Settings, badges with accessible counts, satisfies **AC-21**, **AC-22**, **AC-23**.
3. Follow up health, needs attention and team load: `followUpAgeBucket`, `FOLLOW_UP_OVERDUE_DAYS`, `ATTENTION_LIST_SIZE`, `getFollowUpHealth`, the two panels, satisfies **AC-9**, **AC-15**.
4. Attendance trend: extract `binVisitors` into `convex/lib/hospitalityStats.ts`, point `hospitalityReport` at it, add the trend to `getDashboardOverview` with the "so far" bin, satisfies **AC-11**.
5. Visitor journey and mix (`getVisitorJourney`), then contact outcomes (`getContactOutcomes`), satisfies **AC-12**, **AC-13**, **AC-14**.
6. Clan balance: `getClanBalance` and its panel, satisfies **AC-16**.
7. Remove the spec 0024 AC-35 cards and their tests; per panel error boundaries, empty states, accessibility pass, 375 pixel pass; Convex tests for every query, satisfies **AC-4**, **AC-18**, **AC-19**, **AC-20**, **AC-24**.

## Consequences

**Positive**:
- The page a Hospitality operator opens first answers "who needs me today" and "are we getting better", instead of roster counts that read 0.
- No schema change, so nothing to migrate, back fill or deploy in order; rollback is one revert.
- The definitions (personal contact, on time, eligible, cohort) live once in shared, so Reports and feature 27 (SMS) can use the same words.

**Negative / tradeoffs**:
- Hospitality is the third department off the shared Dashboard. The Library's own note asked for a proper decision about what the shell is for at this point; this spec takes the carve out again and records that the shell question is still owed (Follow up).
- Numbers are live, so an edited or deleted old visit changes past figures. Acceptable at church scale; snapshots were considered and declined.
- `getDashboardOverview` and `getVisitorJourney` read every visit and every cohort row's contacts in the window (and the previous window for the headline) on each change; splitting the page into six queries keeps a new contact from recomputing everything, but each query still reads its whole window. At church scale (hundreds a month) this is fine; at tens of thousands it needs precomputed counts.
- Badges subscribe on every Hospitality page, a small constant cost per open tab.
- A grouped sidebar for one department means two sidebar shapes in one shell, which a future department may copy piecemeal.
- Team leaders' items (requests waiting, next activities, recent activity) leave the Dashboard; a HOD now finds a pending claim through the Roster badge only.

## Follow-up

- [ ] Decide what the department shell is for, now that three departments (Media, Library, Hospitality) replace its Dashboard and one groups its sidebar: whether grouped navigation and per department dashboards become the shell's norm. A separate `/architect` decision.
- [ ] Spec 0012 AC-2 and spec 0024 AC-35 are amended by this spec (done in the same change); `/sync` should carry the shell rule into `apps/admin/AGENTS.md`.
- [ ] Feature 27 (SMS) should count church sent SMS as personal contact in AC-8 and add an SMS credit panel to this Dashboard.
