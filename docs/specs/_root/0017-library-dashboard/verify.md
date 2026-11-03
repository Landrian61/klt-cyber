# Verify: Library dashboard · spec 0017 · updated 2026-11-02

_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Sign in as a Library HOD unless a step says otherwise. Three callers matter here and they see different things, so the roles are named per step: **HOD** (holds `manageLibrary` and `viewRoster`), **roster member** (holds `manageLibrary` only, through a verified Library roster row and no appointment), and **outsider** (a Finance roster member, holding neither).

## UI / manual

### Structure and authority

- [ ] As HOD, open `/areas-of-service/library/dashboard` → the page is the four tab Library dashboard, not the shared one: no verified member count, no mentorship figure, no "This week at church" → AC-1, AC-5
- [ ] On that page, confirm the sidebar, the header and the department icon are the shared shell's, unchanged → AC-1
- [ ] Open Library's Catalogue, Free content, Stock, Roster, Activities, Messages and Settings pages → each renders exactly as before this change → AC-1
- [ ] Open `/areas-of-service/finance/dashboard` (as a Finance HOD) → the shared `DepartmentDashboard` renders with its four stat cards and "This week at church", visibly unchanged, and with no empty gap where the old Library `extras` slot used to sit → AC-1
- [ ] Open `/areas-of-service/media/dashboard` → Media's own bespoke dashboard still renders → AC-1
- [ ] On the Library dashboard, read the tab row left to right → Overview, Collection, Stock, Free content, in that order → AC-2
- [ ] Reload the page → it lands on Overview, not on whichever tab was open before → AC-2
- [ ] Sign in as a **roster member** and open the same URL → the same four tabs with the same figures as the HOD saw → AC-3
- [ ] As that roster member, scroll past the tabs → there is no "Your department" section: no claims banner, no "Next activities", no "Recent activity", and no gap or placeholder where they would be → AC-4
- [ ] As HOD, scroll past the tabs → "Your department" shows the claims banner (when a claim is waiting), "Next activities" and "Recent activity" → AC-4
- [ ] As an **outsider**, open `/areas-of-service/library/dashboard` → redirected away, never the Library dashboard → AC-28

### Overview

- [ ] With a catalogue holding items, read Overview → "Items in the catalogue", "Running low", "Hidden from members", "Recently added" and "Free to read and listen" are all present → AC-6, AC-7
- [ ] Hide one live item from the Catalogue page, return to Overview → "Items in the catalogue" is unchanged, "Hidden from members" went up by one, and the hidden item left "Recently added" → AC-6, AC-7, AC-26
- [ ] Read the "Running low" hint → it says in words that items at zero are included → AC-6, AC-13

### Collection

- [ ] Open Collection with at least one item of two different formats → the stacked bar shows one segment per format, each with its count as the primary number and its share as a smaller secondary figure, and a visible gap between segments → AC-8
- [ ] With exactly three items, one of each format → each share reads 33 and they do not total 100 → AC-8
- [ ] Check the legend list → every one of physical, PDF and audio appears, including a format with zero items → AC-8
- [ ] Read "By category" → categories are ordered by count descending, every category holding at least one live item appears, and none that holds nothing does → AC-9
- [ ] Hide a category (not its items) on the Catalogue page, return → the category still appears under its own name, not as "Uncategorised" → AC-9
- [ ] Read "Added over the last year" → exactly twelve bars/points, the newest being the current month, with a note that the newest month is still running → AC-10
- [ ] Read "Catalogue health" → three bars (cover, author, description), each with its percent and the count of items missing it → AC-11
- [ ] Edit an item to have a description of only spaces → it counts as missing a description, not as having one → AC-11
- [ ] Confirm an item whose cover is a seeded `https://` URL counts as carrying a cover → AC-11

### Stock

- [ ] Open Stock → "Units on hand", "Shelf value", "Running low" and "Out of stock" all show numbers → AC-13
- [ ] Read the two low stock hints → "Running low" says it excludes items at zero, "Out of stock" says the item holds none → AC-13
- [ ] Compare with Overview → Overview's single "Running low" equals Stock's running low plus out of stock, with no item counted twice → AC-13, AC-6
- [ ] Read the "Shelf value" hint with at least one unpriced item holding stock → it names how many items have stock but no price → AC-14
- [ ] Read "In against out, by month" → two series on one axis, a legend naming In and Out, twelve month groups, and a 2px gap between the two bars of a pair → AC-15
- [ ] Hover a month's bars → the tooltip spells the month out in full and names the units for each series → AC-15
- [ ] Read "Moving fastest (90 days)" → at most five items, largest quantity out first, with the quantity beside each → AC-16
- [ ] Read "Running low" (the list) → every live physical item at or below 10, emptiest first, with items at zero leading and marked → AC-17
- [ ] Read the shelf value footnote → it says the figure is what the stock would come to at desk prices and is not a record of a sale → AC-14

### Free content

- [ ] Open Free content → "PDFs", "Recordings" and "Storage used" all show numbers, storage in binary units (KiB/MiB) → AC-18
- [ ] Search the whole dashboard for any total listening or duration figure → there is none → AC-19
- [ ] Read "Recently added" → at most ten free items, newest first, headed "Recently added" and never "Recently published" → AC-20
- [ ] Hide a free item → it leaves that list while the PDF/recording counts and the storage figure stay unchanged → AC-20, AC-26

### Empty states

- [ ] On a deployment with no library items at all, open each tab → Collection's panels, Free content's list and both Stock trends each show a sentence describing what will appear, never a chart of zeros and never `NaN`, `0%` or `100%` → AC-12, AC-27
- [ ] With no items at all, read Stock's four figures → they show zeros, not an empty state, because zero units on hand is a true answer → AC-27
- [ ] With physical items present but no stock movement ever recorded → the four Stock figures show their real numbers while both Stock trends show empty states → AC-27

### Cost and subscription (Convex dashboard, Functions tab)

- [ ] Load the dashboard and watch the function log → only `getLibraryOverview` runs, not the other three → AC-24
- [ ] Open Collection, then record a stock movement from the Stock page in another tab → `getLibraryCollection` does not re-run → AC-24
- [ ] Open Stock and watch the log for `getLibraryStock` → it reads `libraryStockMovements` once per invocation, never twice → AC-21
- [ ] As a roster member, load the dashboard and watch the log → neither `departmentShell.getDashboard` nor `departmentShell.listDepartmentFeed` is called at all → AC-4

## Value sourcing (the edge that breaks if the source is wrong)

- [ ] **Kampala month boundary.** Create an item with `createdAt` set to 20:30 UTC on the last day of a month (23:30 Kampala), and a second at 21:30 UTC the same day (00:30 Kampala the next day) → the first counts in the earlier month's bar, the second in the later one. Repeat with the browser's timezone set to UTC-8 and then UTC+12 → the two bars do not move → AC-10, AC-25
- [ ] **The client's instant.** Leave Collection open across a Kampala month rollover (or set the clock forward) → within a minute the newest bucket becomes the new month, rather than staying on the old one → AC-25
- [ ] **Unset against zero price.** Give one physical item `priceUgx` unset and another `priceUgx` of 0, both holding stock → the shelf value is unchanged by both, and the hint names only the unset one → AC-14
- [ ] **Unpriced with no stock.** Set an unpriced item's quantity to 0 → it drops out of the unpriced hint's count → AC-14
- [ ] **Hidden counts for the team, not the member.** Hide one item of each format → every Collection and Stock figure and the Free content counts are unchanged, while "Recently added" and "Free to read and listen" lose it → AC-26
- [ ] **Disjoint against combined.** Set one item to 0 and one to 3 → Stock reads out of stock 1, running low 1; Overview reads running low 2 → AC-13
- [ ] **Null share.** Remove every library item → each catalogue health bar shows its empty state rather than a percentage → AC-12
- [ ] **Descending cap.** Seed more than `LIBRARY_MOVEMENT_SCAN_CAP` (8,000) movements spanning more than twelve months → the current month's bars are intact, the oldest months are missing, and both Stock trend panels name the month coverage begins at → AC-22, AC-23
- [ ] **Movement survives its item.** Record an out movement, then remove the item → the movement still counts in its month on the trend, and the item is absent from "Moving fastest" → AC-15, AC-16
- [ ] **Missing file size.** Upload a free item, then clear its `fileSizeBytes` → the storage total does not change and the hint names one file with no recorded size → AC-18
- [ ] **The gate is first.** As an outsider, call each of `library:getLibraryOverview`, `getLibraryCollection`, `getLibraryStock` and `getLibraryFreeContent` directly from the Convex dashboard → each returns `null`, and no figure is in the response → AC-28

## Commands

- [ ] `pnpm --filter @klt-cyber/shared test` → 235 passing, including the `kampalaMonthKey`, `kampalaMonthStart` and `kampalaMonthWindow` boundary tests → AC-25
- [ ] `pnpm run test:convex` → 220 passing, including the 26 in `convex/libraryDashboard.test.ts` → AC-29
- [ ] `npx tsc --noEmit -p convex/tsconfig.json` → clean
- [ ] `cd apps/admin && npx tsc --noEmit` → clean
- [ ] `pnpm --filter admin build` → succeeds
- [ ] `pnpm exec convex dev --once` → pushes and reports ready, proving `libraryStockMovements.by_created` is accepted → AC-21
- [ ] `grep -rn "getLibraryDashboard" --include=*.ts --include=*.tsx .` (excluding `node_modules`) → no results; the replaced query and its component are gone → AC-6
- [ ] `grep -rn "extras" apps/admin --include=*.tsx` → no results; the superseded slot is gone with its only caller
- [ ] `grep -c "libraryStockMovements" convex/library.ts` → the Stock handler contains exactly one read of that table → AC-21

## Review only (not automatable)

- [ ] Read `getLibraryStock` end to end → `libraryStockMovements` is read exactly once, and the ninety day movers are a narrowing of that result rather than a second read → AC-21
- [ ] Read all four handlers → `libraryOperatorOrNull` is the first statement in each, not a filter applied after reading → AC-28
- [ ] Confirm nothing on this page writes: no mutation, no `activityLogs` row, no scheduled function → spec 0017 key invariants

## Acceptance-criteria coverage

- AC-1 covered by the five structure steps (Library, Finance, Media, the other four pages) · AC-2 tab order and the reload step · AC-3 the roster member step · AC-4 the roster member absence step, the HOD presence step, and the Convex log step · AC-5 the first structure step · AC-6 the three Overview steps plus the disjoint-against-combined step and the `getLibraryDashboard` grep · AC-7 the hide-an-item step · AC-8 the three format mix steps · AC-9 the two category steps · AC-10 the twelve point step and the Kampala boundary step · AC-11 the three catalogue health steps · AC-12 the empty catalogue step and the null share step · AC-13 the four figure step, the two hint steps, the Overview comparison and the disjoint step · AC-14 the shelf value hint step, the footnote step, the unset-against-zero step and the unpriced-with-no-stock step · AC-15 the trend step, the tooltip step and the movement-survives-its-item step · AC-16 the movers step and the movement-survives-its-item step · AC-17 the running low list step · AC-18 the Free content figures step and the missing file size step · AC-19 the no-listening-time step · AC-20 the recently added step and the hide-a-free-item step · AC-21 the Convex log step, the `convex dev --once` step, the grep and the review step · AC-22 the descending cap step · AC-23 the descending cap step · AC-24 the three subscription steps · AC-25 the Kampala boundary step and the client instant step · AC-26 the hidden counting step and the hide-a-free-item step · AC-27 the three empty state steps · AC-28 the outsider redirect step, the four direct call steps and the review step · AC-29 the two test commands
