# 0025. Hospitality dashboard and grouped sidebar: rationale

## Context

Spec 0024 gave Hospitality its pages and put a block of Hospitality cards under the shared department Dashboard. In use, the page a Hospitality operator opens first leads with the shared shell's view of any department: verified members, requests waiting, mentorship still to finish, next activities, the church week and a recent activity feed. For Hospitality those numbers mostly read 0 and answer none of the team's questions. The Hospitality cards themselves were plain tiles: counts with no comparison, no trend and no sense of what needs action.

The SRS states Hospitality's goal as "nobody who visits KLT slips through the cracks" (4.10). The decisions the team makes each week follow from it: who is still waiting for a call, whether contact happens quickly, where visitors drop off on the road to membership, whether the work is shared fairly, and who is visiting so the desk can be staffed well. None of that is visible today without opening Follow ups and Reports and counting by hand.

Two recorded rules shape the answer. Spec 0012 AC-2 lets only Media and the Library replace the shared Dashboard, and the Library's own dashboard note asks that a third department trigger a decision about what the shell is for. The department sidebar is one flat list shared by every department, so grouping it is a shell change unless scoped. The engineer chose to group Hospitality's sidebar only.

All the needed facts are already recorded: visits by date, contacts with channel, outcome and time, follow ups with assignee, open and close times, visitor attributes, clans and profiles. The open questions were definitions (what counts as contact, on time, reached, the cohort) and presentation, not data collection.

## Options considered

### Option 1: Richer cards under the shared Dashboard

Keep the shared `DepartmentDashboard` on top and grow the spec 0024 block below it with charts.

**Pros**:
- No change to spec 0012's rule; the shell stays one shape.
- Least code moved.

**Cons**:
- The team still lands on roster upkeep first, which is the complaint.
- The shared Dashboard's roster queries run for every operator, including roster members for whom they return nothing.

### Option 2: Hospitality's own Dashboard, read only queries, Hospitality only grouped sidebar

Branch the dashboard page on `manageHospitality` to a Hospitality Dashboard (the Library's mechanism), fed by read only queries over existing tables (one per panel group); group Hospitality's sidebar with badges.

**Pros**:
- The first screen is about visitors and action, in the order the team works.
- No schema change and no stored figures; rollback is a revert.
- Reuses the existing branch pattern, report binning, clan sizes and operator checks.

**Cons**:
- A third carve out from the shared shell, and a second sidebar shape.
- Live computation reads more rows per change than stored counts would.

### Option 3: Own Dashboard backed by daily snapshots

As Option 2, but a scheduled job writes each day's figures to a new table, and the Dashboard reads those.

**Pros**:
- Past figures never shift when an old visit is edited.
- Cheap reads at any scale.

**Cons**:
- A new table, a cron and a back fill to build and operate.
- Figures lag by up to a day, and a snapshot bug is silent and permanent.
- Church scale does not need it.

### Option 4: Merge the Dashboard into Reports

Drop the Dashboard for Hospitality and make Reports the landing page.

**Pros**:
- One analytics page instead of two.

**Cons**:
- Reports is a date range and PDF tool for leadership; it has no "act today" view.
- The landing page would open on a form.

## Rationale

Option 2 is chosen because the problem is what the first screen leads with, and only replacing the shared Dashboard fixes that. Option 1 keeps the roster block on top, which is the exact complaint, and it keeps running queries that return nothing for most operators. The Library already proved the replacement mechanism (a capability branch on the dashboard page), so Hospitality reuses a pattern rather than inventing one; the cost is a third carve out, which this spec records openly and hands to a later shell decision instead of hiding.

Live, read only queries beat snapshots (Option 3) at this scale: a church records hundreds of visits a month, and every index the reads need already exists. Snapshots would add a table, a scheduled job and a back fill for figures that are cheap to compute, and they would introduce a lag and a silent failure mode. Their one real advantage, past figures that never move, matters for audited finance, not for a welcome team. Reports stays as the leadership PDF tool (SRS H6-01, H6-02), so Option 4 would lose the act today view without gaining anything.

The definitions follow the team's real work. Only personal contact counts (an in app message can reach 50 people at once and is not a follow up). On time is within 2 days, which turns a Sunday visit into a Tuesday deadline, and a visitor still inside that window is never counted late, so the figure is fair on a Monday. The funnel counts each step against the cohort rather than as a strict funnel, because an app sign up who was never called is a real path and a strict funnel would hide it. The sidebar is grouped for Hospitality only because the engineer chose not to change other departments now; the broader shell question is a Follow up.

## Cross check

A read only cross check on a second model found 13 completeness gaps and several soundness issues. The resolutions now live in the spec: the contact counting window, the day 3 eligibility boundary, denominators, a shared bin helper, the meaning of "regular", outcome and mix rules, the team load "Unassigned" row, the attention ordering and link, the waiting for a clan rule written out, sidebar details, one query per panel group for failure isolation, a "so far" final bin, and a today rollover. Two findings were declined:

- **Validating `today` against the server clock.** Reading the clock inside a live query breaks the spec 0012 convention that subscriptions stay deterministic, and the period already bounds how much a query reads.
- **"On time is biased against the current window."** Visitors still inside their 2 day deadline are excluded, not counted late, so the percent measures the same thing in both windows; the current window simply has fewer eligible rows.
