# Rationale: Library dashboard · spec 0017

## Context

> ⚠️ Premise note: the request was to replace the member and verification view with "analytics and visuals that fit a library system", and the vocabulary of library analytics is a trap here. Every mature library dashboard in the field is built on **circulation**: loans, returns, overdue items, most borrowed titles, turnover by subject. This product has none of that and will not get it in Phase 01, because SRS 4.13.1 rules out payments, sales records and ordering, nothing is lent, and no member read or download is tracked. Copy the shape of a real library dashboard here and most of it renders empty. The second half of the trap is scale: a congregation of this size will hold a few hundred items, so a page of trend charts risks being decoration that nobody acts on. The right framing is that this is a **collection and inventory** dashboard, not a library analytics dashboard, that its most valuable panels are the ones naming work to do rather than the ones drawing curves, and that every panel must be honest when it has nothing to say. That is why Overview leads, why catalogue health is in, why total listening time is out, and why a trend renders only once a bucket is non zero.

Library & Information runs on the shared department portal that spec 0012 built. Its dashboard was designed for departments whose work is people: it opens with the verified member count, claims waiting and members without completed mentorship, then upcoming activities, then the church's weekly programs, then a recent activity feed. Spec 0015 added Library's own four cards through an `extras` slot, which renders them last, below all of that.

The result is a home page where a Library roster member scrolls past three sections of roster material to reach the only four numbers that concern them. For a roster member it is worse than that: spec 0015 narrowed `getDashboard` and `listDepartmentFeed` to `viewRoster`, which they do not hold, so most of what sits above their cards is not merely irrelevant, it is absent, and the page is mostly empty space above the part they came for.

The Library's actual work is a collection and a stock room. The team adds items, hides and removes them, uploads free PDFs and recordings, and records stock moving in and out with a note. All of that is already captured: `libraryItems` carries format, type, category, price, quantity on hand, file size and creation time, and `libraryStockMovements` is a full audit trail of every quantity that moved and when. Almost nothing on the proposed dashboard needs new data; it needs the existing data read differently.

The one thing the data model genuinely cannot answer today is "what happened over time". `libraryStockMovements` carries a single index, `by_item`, so the only question it can answer efficiently is "what happened to this one item". Any trend, any ranking, any window needs an index on the date.

There are two further forces. The SRS is the project's source of truth and it is specific here: 4.7.1 defines what a department dashboard contains, 4.13.3 names Library's four cards exactly, and 4.13.1 bars payments and sales records. And spec 0012 already granted exactly one department, Media, a bespoke dashboard, which means the question of whether a department may have its own is not new, only whether a second one may.

Not deciding leaves the Library team with a home page about other people's work, and leaves the stock movement table, which is the richest data this department produces, readable only one item at a time.

## Options considered

### Option 1: Fix the shared dashboard in place

Teach `DepartmentDashboard` an ordering so `extras` can render above the shared cards, and optionally a flag to hide the roster stats for a given department. Library's content moves to the top and the four cards grow into the richer set.

**Pros**:
- No new exception to spec 0012's one shared page set. Every department keeps one implementation.
- Any other department that later wants its own content first inherits the capability for free.
- Smallest diff, and nothing moves on disk.

**Cons**:
- Changes a component all thirteen departments render, to serve one. Every future change to it now carries Library's ordering requirement, and the blast radius of a mistake is the whole portal.
- A flag that hides SRS 4.7.1's cards for one department contradicts that line outright, so the SRS needs amending anyway, and the shared component becomes the place where the contradiction lives.
- The shared dashboard would acquire a second mode that only one caller uses, which is how a shared component starts becoming a configuration surface rather than a component.

### Option 2: A bespoke Library dashboard on the existing `[slug]` shell (chosen)

Library keeps the shared shell, its sidebar, its header and its other four pages. Only the dashboard route renders a Library component instead of `DepartmentDashboard`, exactly as spec 0012 AC-3 already permits for Media.

**Pros**:
- The shared component is not touched at all, so no other department can be affected by anything here.
- Full freedom over tabs, ordering and what is kept, without that freedom becoming configuration someone else has to understand.
- Follows a precedent the project already set and already wrote down, so it is an application of an existing rule rather than a new one.
- The three Library pages built in spec 0015 stay exactly where they are, under `[slug]`.

**Cons**:
- Library becomes the second exception to "all five pages from one shared set". Two exceptions is a pattern forming.
- Anything later added to the shared dashboard that Library would have wanted has to be added to Library's separately, or deliberately not.
- The roster material Library keeps has to be re wired by hand, so a future change to the shared feed's shape could leave Library's copy behind.

### Option 3: A full Library route group, mirroring Media

Give Library its own `/areas-of-service/library/*` folder with its own layout, sidebar and all five pages, the way Media is built.

**Pros**:
- Complete freedom over the whole portal, not just the dashboard.
- Consistent with how the only other exception in the codebase is actually structured.

**Cons**:
- Requires moving the catalogue, free content and stock pages built weeks ago under `[slug]`, for no gain, since none of them needs anything bespoke.
- Duplicates the shell wiring, which is precisely the drift spec 0012 existed to end. Media is the cautionary example here, not the model.
- Far more surface to build and to verify than the problem justifies.

### Option 4: Stay inside SRS 4.13.3

Keep exactly the four cards the SRS names and spend the change only on making them lead the page and look like a library rather than a roster.

**Pros**:
- No schema change, no new queries, no SRS amendment, and a fraction of the build.
- Zero risk of building analytics nobody reads.

**Cons**:
- Does not answer the actual request, which was for analytics and visuals.
- Leaves the stock movement history, the richest data this department produces, unreadable in aggregate.
- Leaves catalogue health unbuilt, which is the one metric that would reliably change what the team does on a given afternoon.

## Rationale

The decisive force is blast radius against freedom. Option 1 buys a smaller diff by putting Library's requirements inside a component that twelve other departments render, and the thing being asked for is not a tweak to the shared dashboard but a different dashboard: four tabs, different data, a different reason to exist. Expressing that as configuration on a shared component is how a component turns into a framework, and the project would be maintaining a dashboard engine to serve one department. Option 2 costs an exception to a rule, which is a real cost, but the exception already exists in writing for Media, so this applies a rule rather than inventing one. Option 3 pays that same cost and then also moves three pages that have no reason to move.

The premise note above is what shaped the contents more than the structure did. The request named metrics that sound like a library dashboard, and the honest reading of this system is that it has an inventory rather than a circulation. That has three consequences the spec encodes. Out movements are the only honest proxy for "what is being used", so the fastest moving list is the nearest thing to most borrowed and is labelled as movement rather than as popularity. Total listening time was proposed and is cut, because `audioDurationSeconds` is optional by design in spec 0015, the player works it out itself, so the team usually leaves it blank and a sum over it would be a confidently wrong number. Spec 0011 already set the precedent that a figure whose source is not really there should say so rather than show a misleading value, and the same instinct applies here. And since a catalogue this young has little history, every trend panel is required to stay silent until it has a non zero bucket, so launch week reads as new rather than broken.

Catalogue health is the panel worth defending. Everything else on this page describes; it alone prescribes. The share of items carrying a cover is the number that explains why the member's Library screen shows gradient rectangles, which is the congregation's first impression of the whole feature, and it is actionable in a way a format mix never is. It also closes a loop: spec 0016 built the page one cover offer precisely because covers go missing, and this is the figure that tells the team whether that worked.

Two SRS questions were put to the engineer rather than resolved here, and both were settled toward building. The shelf value in shillings was the closer call. SRS 4.13.1 bars payments and sales records and L3-02 says stock movements carry quantities only and never money, and the reading taken is that both govern transactions and the movement log, not an internal valuation of goods sitting on a shelf. Prices are already stored on the item and already shown to members, so the figure reveals nothing new; it only adds them up. It is recorded here because it is the one number on the page a reviewer should stop at, and they should be able to see it was considered rather than assume it slipped through.

The engineer's original framing asked to replace the roster view outright. That was softened on their agreement: claims waiting, upcoming activities and the feed stay, below the tabs and behind `viewRoster`. Removing them entirely would have been truer to the request and would have quietly cost an HOD their only sight of someone asking to join the department, which is a regression dressed as a simplification.

## References

**Project sources** (verifiable, in this repo):
- `spec/SRS.md` §4.7.1 (what a department dashboard contains), §4.13.1 (no payments or sales records), §4.13.2 (every Library roster member has the same operational access), §4.13.3 (Library's four dashboard cards), and story L3-02 (stock movements carry quantities only, never money)
- spec 0012 (`0012-shared-department-shell/index.md`), whose AC-2 defines the one shared page set and AC-3 grants Media the single bespoke dashboard exception this spec extends, and whose AC-33 and AC-34 define the roster figures being demoted
- spec 0015 (`0015-library-catalogue-free-content-stock/index.md`), whose AC-28 this spec supersedes, whose `by_stock` index and `libraryOperatorOrNull` gate are reused unchanged, and whose decision to make `audioDurationSeconds` optional is why total listening time is cut
- spec 0016 (`0016-library-pdf-preview-and-page-one-covers/index.md`), the page one cover offer that catalogue health measures the effect of
- spec 0011 (`0011-platform-analytics-cost-register/index.md`), the precedent that a number whose source is not yet there says so plainly instead of showing a zero
- `packages/shared/src/constants/weeklyPrograms.ts`, the fixed Africa/Kampala offset this spec reuses for every month boundary rather than defining a second one
- `apps/admin/app/(admin)/areas-of-service/admin/MembershipGrowthChart.tsx` and its `*ChartBody.tsx`, the established convention of a Recharts body lazily mounted through `next/dynamic`
- `docs/scope/scope.md`, whose header sets Tracer Bullet as the build approach and Beta as the workflow tier

**Practices & standards**:
- Collection analytics as the substitute when circulation data does not exist: collection size, composition and acquisition history are the remaining inputs
- Inventory driven collection review, the recognised practice where no formal circulation mechanism exists
- Honest empty states over zero valued charts, so a young dataset reads as new rather than broken
- Reading a derived value once and narrowing it, rather than issuing a second query for a subset of the same window
- Computing calendar boundaries on the server from a fixed offset, so a bucket never depends on the viewer's device clock

**Links** (web verified):
- Developing KPI-Driven Performance Dashboards for University Libraries: https://ojs.trp.org.in/index.php/ijiss/article/view/5284
- KPIs for Library Dashboard, The KPI Institute: https://marketplace.kpiinstitute.org/kpis-for-library-dashboard.html
- Panorama Library Analytics Platform overview, EBSCO: https://www.ebsco.com/sites/default/files/acquiadam-assets/Panorama-Library-Analytics-Platform-Overview.pdf
- Benchmarking your library on a global scale, Ex Libris: https://exlibrisgroup.com/blog/benchmarking-your-library-on-a-global-scale/
- The Library Collection Analytics Dashboard, IFLA: https://www.ifla.org/?p=223654
- collectionHQ, circulation and turnover tracking: https://www.collectionhq.com/?p=3358
- Washington State Library, collection size and purchases as collection development inputs: https://www.sos.wa.gov/_assets/library/libraries/firsttuesdays/20140603notes.pdf
- Harvard Library Analytics Toolkit: https://www.slideshare.net/slideshow/library-analytics-toolkit-poster/13529131
