# 0017. Library dashboard: collection, stock and free content

**Date**: 2026-11-02
**Status**: In Progress

## Summary

The Library stops using the shared department dashboard and gets its own, built around what the Library actually does. Four tabs: Overview (the four cards the SRS already names), Collection (what the church holds and where the catalogue is thin), Stock (what is on the shelf and what is moving) and Free content (what the congregation can open in the app). The roster material that used to lead the page is gone, except for the two things an HOD genuinely used it for, a pending claim and what is scheduled, which move below the tabs and only appear for someone allowed to see them.

One schema change, an index on stock movements by date, is what makes any trend over time possible. Everything else is read from tables that already exist. The numbers are computed in the operator's own browser session from live Convex queries, one per tab, so looking at the Collection tab does no stock work.

## Requirements

**User stories**:
- As a Library roster member, I want my dashboard to open on what the Library holds and what is running out, so my home page is about the collection rather than about who serves here.
- As a Library HOD, I want to see how the collection is growing and where it is thin, so I can tell what to buy and what to chase.
- As a Library roster member, I want to see what has been moving, so I can restock before something runs out rather than after.
- As a Library HOD, I want to keep sight of a pending roster claim and of what the department has scheduled, so having our own dashboard does not cost me the two things I actually used the shared one for.

**Acceptance criteria** (the contract, each independently checkable):

Structure and authority
- **AC-1**: `/areas-of-service/library/dashboard` renders the Library dashboard rather than `DepartmentDashboard`. Library's other four pages keep the shared `[slug]` shell, its sidebar and its header unchanged, and no other department's dashboard changes in any way.
- **AC-2**: The dashboard presents four tabs in this order: Overview, Collection, Stock, Free content. Overview is the tab a fresh visit lands on.
- **AC-3**: Every caller holding `manageLibrary` sees the same four tabs with the same content, whether they are the HOD, a delegate or a roster member holding nothing else (SRS 4.13.2, same operational access).
- **AC-4**: For a caller who also holds `viewRoster`, a section below the tabs shows the number of claims waiting, the next upcoming department activities, and the recent activity feed. For a caller without `viewRoster` that whole section is absent, leaves no gap or placeholder, and neither `departmentShell.getDashboard` nor `departmentShell.listDepartmentFeed` is called at all.
- **AC-5**: The verified member count, the mentorship figure and the church's weekly programs appear nowhere on this dashboard.

Overview
- **AC-6**: Overview shows the four cards SRS 4.13.3 names, keeping spec 0015's definitions exactly rather than by reference: total items is every row whose `deletedAt` is unset, hidden included; the low stock count is every live physical item whose `quantityOnHand` is at or below `LIBRARY_LOW_STOCK_THRESHOLD`, which **includes** items sitting at zero, and the card's hint says so in words; recent additions is the newest five live items excluding hidden; free content highlights is the newest four live digital items excluding hidden.
- **AC-7**: Overview also shows how many live items are hidden from members, so the difference between the catalogue total and what the congregation can see is explainable rather than mysterious.

Collection
- **AC-8**: Collection shows the mix of the live catalogue by format: a count for each of physical, PDF and audio, with its share of the catalogue as a secondary figure. The count is the primary number. Shares are rounded to whole percent independently and are not forced to total one hundred, so a set may read 33, 33, 33.
- **AC-9**: Collection shows the number of live items per category, ordered by count descending, then by the category's own `order` ascending, then by name. Every category holding at least one live item appears and no others. A hidden category still appears under its own name, matching spec 0015's AC-12. An item whose category document cannot be read is grouped under "Uncategorised"; `deleteCategory` refuses while items reference a category, so this is a guard rather than an expected state.
- **AC-10**: Collection shows how many items were added in each of the last twelve Kampala calendar months, meaning the current month plus the eleven before it. The series always has exactly twelve points; a month with no additions is a zero, not a missing point. The newest bucket is the current month and is therefore partial by nature.
- **AC-11**: Catalogue health shows three independent shares of the live catalogue, each beside the count of items missing it: items carrying a cover image, an author, and a description. A field counts as present only when it is a non empty string after trimming. A `coverImageUrl` holding a seeded absolute URL counts as a cover, because the member sees a cover either way. The denominator is every live item, hidden included.
- **AC-12**: Where a share has no denominator, meaning the catalogue holds no live items at all, the server returns null for that share rather than zero, and the panel renders its empty state per AC-27. No panel ever displays `NaN`, `0%` or `100%` computed from nothing.

Stock
- **AC-13**: Stock shows four figures across live physical items: units on hand, shelf value at desk prices, how many items are **running low**, and how many are **out of stock**. On this tab the two are disjoint: running low counts items holding one to `LIBRARY_LOW_STOCK_THRESHOLD`, out of stock counts items holding zero, and neither includes the other. Overview's single card (AC-6) keeps spec 0015's combined count, and its hint says it includes items at zero, so the two tabs can be read side by side without the numbers appearing to contradict.
- **AC-14**: Shelf value is the sum over live physical items of `priceUgx` multiplied by `quantityOnHand`, rendered through `formatUgx`. An item whose `priceUgx` is unset contributes zero; an item priced at zero is priced, not unpriced. The figure's hint names how many items with stock on hand carry no price, so a total that is short is never silently short. An unpriced item holding zero stock is not counted in that hint, because it would contribute nothing either way.
- **AC-15**: Stock shows quantities in against quantities out for each of the last twelve Kampala calendar months, on the same twelve point, zero filled basis as AC-10. A movement counts in its month regardless of what later happened to its item: a removed item's history still happened and still moved stock.
- **AC-16**: Stock shows the five items with the largest total quantity out over the last ninety days, ordered by that quantity descending then by title, with the quantity beside each. An item with no out movement in the window is absent. Items whose `deletedAt` is set are excluded, because a removed item is not something the team can restock. Hidden items are included, per AC-26. `direction` holds only `in` and `out`, so "out" is every outward movement with no sub categories to separate.
- **AC-17**: Stock lists every live physical item at or below `LIBRARY_LOW_STOCK_THRESHOLD` with its current count, ordered by quantity ascending then title, so items at zero lead the list.

Free content
- **AC-18**: Free content shows the number of PDFs, the number of recordings (`format` of `audio`), and the total storage those files occupy, summed from the `fileSizeBytes` R2 reported at upload and shown in binary units (KiB, MiB). An item with no recorded size contributes zero, and the figure's hint names how many that was, on the same rule as AC-14.
- **AC-19**: No total listening time is shown anywhere on the dashboard.
- **AC-20**: Free content lists the ten most recently added free items by `createdAt`, hidden excluded. It is a longer view of the same list Overview shows four of; there is no separate notion of publishing in the data model, so the tab says "Recently added", not "Recently published".

Data, correctness and cost
- **AC-21**: `libraryStockMovements` gains an index on `createdAt`. The Stock query reads the window through that index **once**, newest first, and derives both the monthly buckets and the ninety day movers from that single result. A second read of that table in the same handler is a defect.
- **AC-22**: That read is ordered descending and capped at `LIBRARY_MOVEMENT_SCAN_CAP`, taking one more row than the cap so reaching it is detected exactly rather than inferred from a length. Descending is load bearing: an ascending read truncated at the cap would drop the **newest** movements, silently emptying the current month and the ninety day movers while the page claimed only to be partial. Truncation must cost the oldest months, never the newest.
- **AC-23**: When the cap is reached, both Stock trend panels say which month their coverage actually begins at, not merely that they are partial, because the first covered month's totals are themselves incomplete and a reader has to know which bar to distrust.
- **AC-24**: Each tab has its own Convex query, and a tab's query is not subscribed until that tab is opened, so a stock movement never recomputes the collection mix or catalogue health.
- **AC-25**: The client supplies the current instant as a `now` argument, from the same minute clock spec 0012 AC-34 already uses, and the server converts it to Kampala calendar boundaries with the fixed offset. Both halves matter: the client's instant is what lets a live query notice that a month or a ninety day window has rolled over, because `Date.now()` inside a Convex query does not re evaluate until something else invalidates it; the server's fixed offset is what stops a bucket depending on the viewer's timezone or locale. No bucketing happens on the client.
- **AC-26**: Every figure on Collection and Stock counts live items including those hidden from members, because this is the team's own view of what they hold. The two lists SRS 4.13.3 names, recent additions and free content highlights, keep excluding hidden items as spec 0015 defined, and so does AC-20's longer list.
- **AC-27**: A panel with nothing to say renders the shared empty state describing what will appear there. A trend renders as a chart only once at least one of its buckets is non zero, counting in and out together for the stock trend. The four AC-13 figures are not a trend: with physical items present but no movement ever recorded they still render their real numbers, and with no physical items at all they render zeros rather than an empty state, because zero units on hand is a true and useful answer.
- **AC-28**: Every query re checks `manageLibrary` on the server and returns null to any other caller, exactly as `getLibraryDashboard` does today. No figure on this page is reachable by a caller the server would refuse.
- **AC-29**: Automated tests cover the month bucketing either side of the Kampala midnight boundary, the shelf value rule for an unset price against a zero price, the hidden item counting rule, the disjoint low and out of stock definitions against Overview's combined one, the null share when the catalogue is empty, and the descending cap leaving the newest month intact.

## Decision

**Chosen option**: Option 2: a bespoke Library dashboard on the existing `[slug]` shell.

Library keeps the shared shell, its sidebar and its other four pages, and swaps only the dashboard route to render its own four tab component, following the exception spec 0012 already grants Media (basis: spec 0012 AC-3, Media's bespoke Dashboard).

**Implementation skills**: `convex` (`.claude/skills/convex/`) for the query, index and test conventions · `shadcn` (`.claude/skills/shadcn/`) for the tab and card primitives

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new table and no new field. One new index:

```
libraryStockMovements.index("by_created", ["createdAt"])
```

That is the whole schema change. It is additive, transforms no existing row, and is what turns a table that can only be read one item at a time into one that can answer "what happened in the last twelve months". Every other number on this dashboard comes from `libraryItems`, which `getLibraryDashboard` already scans in full today.

Three new constants in `packages/shared/src/constants/library.ts`:

- `LIBRARY_TREND_MONTHS = 12`, how many Kampala calendar months the trends cover, the newest being the current partial month.
- `LIBRARY_MOVER_DAYS = 90`, the rolling window for the fastest moving list, measured as `now` minus `90 * 86_400_000` milliseconds, which always sits inside the twelve month read.
- `LIBRARY_MOVEMENT_SCAN_CAP = 8_000`, the hard ceiling on movements read in one query. Chosen against Convex's roughly sixteen thousand document read limit per query, leaving room for the item reads in the same handler. At a realistic rate of a few movements a day this is years of history, so reaching it means something unusual is happening and the page says so rather than lying.

One new helper, beside the offset it uses, in `packages/shared/src/constants/weeklyPrograms.ts`:

- `kampalaMonthKey(timestamp: number): string`, returning `"YYYY-MM"` for the Kampala calendar month a timestamp falls in, and `kampalaMonthStart(timestamp: number): number`, returning the epoch milliseconds of the first instant of that month in Kampala. Placed there rather than in `convex/lib/` because the existing `KAMPALA_UTC_OFFSET_MS` and `kampalaToday` live there with their tests, and a second place that knows the church's timezone is how the two drift apart.

**State transitions**: none. Every surface in this spec is read only and writes nothing.

**API surface**:

Four queries, one per tab, all in `convex/library.ts`, all gated the same way.

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getLibraryOverview` | query | none | total items, hidden count, low stock count (zero included), recent additions, free highlights | `manageLibrary`, else null | none; null is the refusal |
| `getLibraryCollection` | query | `now` (number) | format mix as counts plus nullable shares, per category counts, twelve monthly addition counts, the three health shares with their missing counts | `manageLibrary`, else null | none |
| `getLibraryStock` | query | `now` (number) | units on hand, shelf value, unpriced with stock count, disjoint low and out counts, twelve monthly in and out totals, top five movers, the low stock list, `partial` and `coverageFrom` | `manageLibrary`, else null | none |
| `getLibraryFreeContent` | query | none | PDF count, recording count, total bytes, count missing a size, the ten most recently added | `manageLibrary`, else null | none |

`getLibraryDashboard` is replaced by `getLibraryOverview` and removed; nothing else calls it. Only the two queries with a time window take `now`; Overview and Free content have none, so they take no argument and stay cached across a minute tick.

**Panels and their form** (so the build is not inventing chart types):

| Panel | Form |
|---|---|
| Overview's four cards and the hidden count | `StatCard`, numerals through `CountUp`, as spec 0015 already renders them |
| Format mix | horizontal stacked bar, one segment per format, count labelled, share as a secondary label |
| Items per category | horizontal bar list, longest first |
| Items added per month | area chart, twelve points |
| Catalogue health | three small progress bars, each labelled with its share and the count missing |
| Stock's four figures | `StatCard` |
| In against out per month | grouped vertical bar, two series, twelve points |
| Fastest moving | plain ranked list with a numeral column, not a chart |
| Running low | plain list with a numeral column, zeros first |
| Free content's figures | `StatCard` |
| Recently added | plain list |

Charts follow the existing convention: a `*ChartBody.tsx` holding Recharts, lazily mounted through `next/dynamic` from a wrapper, matching `MembershipGrowthChart`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Overview | total items | count of `libraryItems` where `deletedAt` is unset, hidden included, the rule spec 0015 set (AC-6, AC-25) |
| Overview | hidden from members | count of those same rows where `hidden` is true (AC-7) |
| Overview | low stock count, recent additions, free highlights | unchanged from `getLibraryDashboard`, including its exclusion of hidden rows from the two lists (AC-6) |
| Collection | format mix counts | the live item scan grouped by `libraryItems.format` (AC-8) |
| Collection | each format's share | that count over the live item total, rounded to whole percent independently, not normalised to one hundred. Null when there are no live items (AC-8, AC-12) |
| Collection | per category counts and names | the live item scan grouped by `categoryId`, each name read from `libraryCategories`, hidden categories included, ordered by count then the category's own `order` then name. A `categoryId` that does not resolve falls back to "Uncategorised" (AC-9) |
| Collection | which month an item was added to | `kampalaMonthKey(item.createdAt)` on the server, using the fixed Africa/Kampala offset in `packages/shared/src/constants/weeklyPrograms.ts`. Never the viewer's timezone (AC-10, AC-25) |
| Collection | the twelve month window's start | `kampalaMonthStart(now)` counted back `LIBRARY_TREND_MONTHS - 1` months, where `now` is the client supplied instant. All twelve keys are generated up front and zero filled, so the series is always twelve points (AC-10, AC-25) |
| Collection | catalogue health shares | the live item scan, counting rows whose `coverImageUrl`, `author` and `description` are a non empty string after trimming. A `coverImageUrl` holding an absolute URL counts. Denominator is every live item, hidden included; null when that denominator is zero (AC-11, AC-12, AC-26) |
| Stock | units on hand | sum of `quantityOnHand` over live `physical` rows (AC-13) |
| Stock | shelf value | sum of `priceUgx` multiplied by `quantityOnHand` over those same rows, rendered by the existing `formatUgx`. An unset `priceUgx` contributes zero; a `priceUgx` of zero is a real price (AC-14) |
| Stock | the unpriced hint's count | live physical rows with `quantityOnHand` above zero and no `priceUgx`, so the hint names only the items actually costing the total something (AC-14) |
| Stock | running low and out of stock counts | the same live item scan, split at zero: out of stock is `quantityOnHand` of zero, running low is one up to `LIBRARY_LOW_STOCK_THRESHOLD`. Derived from the scan rather than a second `by_stock` read, so the two figures and AC-17's list can never disagree (AC-13, AC-17) |
| Stock | monthly in and out totals | one descending range read of `libraryStockMovements` through the new `by_created` index over the window, grouped by `direction` and by `kampalaMonthKey(movement.createdAt)`. Movements for items later removed are included, because the stock did move (AC-15, AC-21) |
| Stock | the fastest moving items | the same single read, narrowed to `direction` of `out` and `createdAt` at or after `now - LIBRARY_MOVER_DAYS * 86_400_000`, summed by `itemId`, top five by quantity then title, each title read from `libraryItems` and any row whose `deletedAt` is set dropped (AC-16, AC-21) |
| Stock | `partial` and `coverageFrom` | whether that read returned more than `LIBRARY_MOVEMENT_SCAN_CAP` rows, and the Kampala month key of the oldest row actually read (AC-22, AC-23) |
| Free content | PDF and recording counts | the live item scan grouped by `format`, `pdf` and `audio` respectively (AC-18) |
| Free content | total storage and the missing size count | sum of `libraryItems.fileSizeBytes`, the value R2 reported at upload and spec 0015 already stores, formatted in binary units. An item with no recorded size contributes zero and is counted for the hint (AC-18) |
| Free content | recently added | the ten newest live digital items by `createdAt`, hidden excluded, the same rule spec 0015's free highlights uses (AC-20) |
| the roster section | whether to render it at all | `can.viewRoster` from the shell's `DepartmentShellGate` context, which the `[slug]` dashboard page already receives and passes to `DepartmentDashboard` today. Read before either shell query is called, so neither runs for a caller without it (AC-4) |
| the roster section | claims waiting, upcoming activities | `departmentShell.getDashboard`, called only when that flag is true (AC-4) |
| the roster section | the recent activity feed | `departmentShell.listDepartmentFeed`, which spec 0015 already narrowed to `viewRoster` (AC-4) |
| every tab | the current instant | a client supplied `now`, from the same minute clock `DepartmentDashboard` uses. The server never calls `Date.now()` for a window boundary, because a Convex query would not re evaluate it until unrelated data changed (AC-25) |
| every tab | whether the caller may see it at all | `libraryOperatorOrNull`, the same helper `getLibraryDashboard` uses (AC-28) |

**Key invariants**:
- No query on this page returns a number to a caller `manageLibrary` would refuse. The gate is the first statement in each handler, not a filter applied afterwards (AC-28).
- A month bucket is a Kampala calendar month computed on the server, everywhere, in every query. A value bucketed on the client is a defect (AC-25).
- The Stock query reads `libraryStockMovements` once. The ninety day list is a narrowing of the twelve month result, not a separate question, so a second read of that table in the same handler is a defect. This constrains that one table; reading `libraryItems` in the same handler is expected (AC-21).
- Movement truncation always costs the oldest data. Any read of that table that could drop the newest row is a defect (AC-22).
- Hidden means hidden from members, never hidden from the team's own counts. The only places hidden rows are excluded are the lists spec 0015 already defined that way (AC-26).
- Low and out of stock are disjoint on the Stock tab and combined on Overview, and each place says which it is. A figure that silently double counts an item at zero is a defect (AC-13).
- Nothing here writes. No mutation, no `activityLogs` entry, no scheduled function. Reading a dashboard is not a consequential act.

**Security model**:
- **Who may do this**: anyone holding `manageLibrary`, which spec 0015 grants to every verified Library roster member as well as the HOD, the delegate and a System Admin. This spec adds no capability and widens none.
- **The one narrower part**: the claims, activities and feed section needs `viewRoster`, which a roster member does not hold. That is spec 0012's rule and spec 0015 narrowed those two functions to it deliberately; this spec simply does not call them for a caller who lacks it, rather than calling and rendering an error.
- **Untrusted input**: none. Every query takes no arguments.
- **Data egress**: none. No new external call, no new Convex action, nothing leaves the deployment.
- **No regulated data.** Book counts, stock counts and file sizes. The shelf value is an internal valuation of goods on a shelf, not a payment, an order or a record of a sale, so SRS 4.13.1 is not engaged; see rationale.
- **Audit**: unchanged. Nothing on this page is a consequential act, so nothing is logged.

**Configuration required**: none. No environment variable, no credential, no bucket change.

**Critical test scenarios**:
- Happy path: a Library roster member holding nothing else opens the dashboard, lands on Overview, and can open all four tabs, verifies **AC-2**, **AC-3**
- Happy path: an item added at 23:30 Kampala on the last day of a month counts in that month, not the next, verifies **AC-25**, **AC-10**
- Happy path: a stock movement recorded today appears in the current month's out total and in the ninety day movers, verifies **AC-15**, **AC-16**
- Permission: a Finance roster member cannot reach the page, and a direct call to each of the four queries returns null, verifies **AC-28**
- Permission: a Library roster member without `viewRoster` sees no claims, no activities and no feed, and the two shell queries are never called, verifies **AC-4**
- Failure case: a physical item with an unset price is named in the hint while one priced at zero is not, verifies **AC-14**
- Failure case: the movement read exceeds its cap; the newest month is intact, the oldest are dropped, and both Stock panels name the month coverage begins at, verifies **AC-22**, **AC-23**
- Failure case: an item is removed after its stock moved; the movement still counts in its month and the item is absent from the movers list, verifies **AC-15**, **AC-16**
- Failure case: a catalogue with no live items returns null shares and the health panel shows its empty state rather than `NaN`, verifies **AC-12**, **AC-27**
- Edge: physical items exist but no movement was ever recorded; the four Stock figures still show real numbers while the two trends show empty states, verifies **AC-27**
- Edge: a low stock figure and the list agree, with an item at zero counted once as out of stock on the Stock tab and inside Overview's combined card, verifies **AC-13**, **AC-6**
- Regression: a hidden item still counts in the catalogue total, the format mix and catalogue health, and still does not appear in recent additions or free highlights, verifies **AC-26**, **AC-7**
- Review only (not automatable): the Stock handler reads `libraryStockMovements` exactly once, verifies **AC-21**
- Manual (Convex dashboard): opening Collection and leaving it open does not re subscribe when a stock movement is recorded, and an unopened tab has no subscription at all, verifies **AC-24**

## Build plan

Tracer Bullet, per the scope header: the source of truth is corrected first, then the index and one working tab go in as a thin thread through schema, query, component and route, which proves the whole shape before any chart is drawn. Then each remaining tab is its own slice, end to end.

1. Correct the source of truth before any code: amend **SRS 4.13.3** to describe Library's four dashboard tabs rather than four cards, amend **SRS 4.7.1** to say the Dashboard is the one page a department may replace with its own, and add Library's dashboard beside Media's in **spec 0012 AC-2**. This is first rather than a Follow up because the shelf value figure sits against SRS 4.13.1, and `AGENTS.md` makes the SRS the source of truth, so the code should never be the only place this is written down
2. Add the index, the constants and the month helpers: `libraryStockMovements.index("by_created", ["createdAt"])`, `LIBRARY_TREND_MONTHS`, `LIBRARY_MOVER_DAYS` and `LIBRARY_MOVEMENT_SCAN_CAP` in `packages/shared/src/constants/library.ts`, and `kampalaMonthKey` plus `kampalaMonthStart` beside the offset in `weeklyPrograms.ts` with their boundary tests. Push the schema and confirm the index is live, satisfies **AC-21**, **AC-25**
3. Run the thin thread: `getLibraryOverview` replacing `getLibraryDashboard`, the new `LibraryDashboard` component with its four tabs where only Overview has content, and the `[slug]` dashboard route rendering it for Library while every other department keeps `DepartmentDashboard`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-28**
4. Add the roster section below the tabs, reading `can.viewRoster` from the shell gate and calling neither shell query without it, satisfies **AC-4**
5. Build the Collection tab: the query taking `now`, the format mix with its nullable shares, the per category counts with their ordering and fallback, the twelve month additions and catalogue health, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-26**
6. Build the Stock tab: the single descending capped movement read, the four figures with low and out disjoint, the unpriced hint, the in against out trend, the fastest moving list and the running low list, satisfies **AC-13**, **AC-14**, **AC-15**, **AC-16**, **AC-17**, **AC-22**, **AC-23**
7. Build the Free content tab: counts, total storage with its missing size hint, and the ten most recently added, satisfies **AC-18**, **AC-19**, **AC-20**
8. Make each tab's query subscribe only when its tab is open, and give every panel its empty state including the figures that must stay numeric, satisfies **AC-24**, **AC-27**
9. Write the tests: the Kampala month boundary, the unset against zero price rule, the hidden item counting rule, the disjoint low and out definitions, the null share on an empty catalogue, and the descending cap leaving the newest month intact, satisfies **AC-29**

## Consequences

**Positive**:
- The Library's home page is about the Library. The first thing a roster member sees is what the church holds and what is running out, not how many people are verified.
- Catalogue health gives the team something to act on. It is the only figure here that names a specific afternoon's work, and it closes the loop on the page one cover feature from spec 0016.
- No other department is touched. The shared `DepartmentDashboard` keeps its contract, so the twelve other departments inherit nothing from this change.
- One additive index and no data transformation, so this ships and reverts without coordination.
- Per tab queries mean the expensive reads happen only when somebody is looking at them.

**Negative and tradeoffs**:
- Library becomes the second exception to spec 0012's "all five pages from one shared set". Two exceptions is a pattern forming, and the third department that wants one should trigger a proper decision about what the shell is for rather than another carve out.
- A roster member loses the recent activity feed, which spec 0015 narrowed to `viewRoster`. They could previously see nothing on the shared dashboard either, so nothing regresses, but the feed would have been genuinely useful to them and this spec does not fix that.
- Trends over twelve months will have little to say until roughly mid 2027. The empty state rule keeps that honest rather than embarrassing, but several panels will be quiet for months.
- The movement index costs write throughput on every stock movement, forever, to serve a chart. At this scale that is nothing, and it is still a real cost that arrives before the benefit does.
- Shelf value puts a money figure on a page in a product whose SRS says no payments and no sales records. It is defensible, and it is the one number here a reviewer will stop at.

**Neutral**:
- `getLibraryDashboard` is replaced by `getLibraryOverview` and deleted. Spec 0015's AC-28 is superseded by this spec's AC-6 and AC-7.
- No migration. The index is additive and backfills on deploy, and a revert needs no coordination. Deploy ordering is the one thing to respect: the schema push must land before a query reads through `by_created`, which the build plan's ordering already handles.
- The SRS needs three edits to match what this builds, and they are build task 1 rather than a follow up, so the source of truth is never the last thing to know.

## Follow-up

- [ ] The three source of truth edits (SRS 4.13.3, SRS 4.7.1 and spec 0012 AC-2) are **build task 1**, not a follow up. They are listed here only so a reader of this section knows where they went.
- [ ] Deferred, not built: making each catalogue health count a link that filters the catalogue to exactly those items. It needs a new filter argument on `listItemsForTeam` and is worth doing once somebody has actually used the figure and wants to act on it.
- [ ] Revisit whether shelf value should be HOD only, once the Library HOD has seen it. This spec treats it as operational per SRS 4.13.2; if the HOD reads it as leadership information, gating it is a small change.
- [ ] `apps/admin/AGENTS.md` instructs agents to load a `klt-cyber-web-ui` skill before any UI work, and no such skill is installed. Either install it or correct the line, because every UI task in this app currently follows an instruction it cannot satisfy.
- [ ] The `dataviz` skill is available at the tool level and governs chart colour, form and accessibility. It is not in `.claude/skills/`, so it is not listed in Implementation skills above; worth consulting during the chart work in tasks 4 and 5, and worth a line in `apps/admin/AGENTS.md` if the project wants it to be the standard.
