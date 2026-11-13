# 0024. Hospitality core: rationale

## Context

SRS 4.10 asks for one place where Hospitality records every visitor, follows up with first timers, nudges regulars toward membership and places verified members who have no clan. Today nothing exists: no visitor, visit or follow up data, and no Hospitality pages. Hospitality is already in `ROSTER_PORTAL_DEPARTMENTS`, so its verified roster can enter the portal, but it lands on shell pages that give a roster member nothing to do.

The forces:
- **Two kinds of person, one list.** App visitors are `users` rows with `role: "visitor"`. Walk ins have no account. SRS 4.10.1 wants both in one searchable, filterable list, and wants a walk in joined to their account when they later sign up.
- **Consent is a legal line.** A walk in's phone may be stored only with consent, and it must be withdrawable (NF-04, Uganda's data protection law). Removal on request must really remove personal data.
- **Church SMS isn't ready.** Africa's Talking needs an approved sender ID and prepaid credit (feature 27). The core still needs one tap contact on launch day.
- **The roster does the work.** SRS 4.10.2 gives every roster member "Yes" on visitors, follow ups, clan placement and reports, and only HOD gets template editing.
- **Phone first.** The desk team works from phone browsers (NF-08).
- **GA tier**, launching 29 November 2026 to about 50 ministers, then the congregation.

## Options considered

### Option 1: One `visitors` table on the shared shell (chosen)

Every visitor is a row (`kind: walk_in | app`). App rows are made at sign up and backfilled. Visits, follow ups and contacts reference `visitorId`. Pages live on the `[slug]` shell behind a scoped `manageHospitality`.

**Pros**: one index serves list, search and filter; a join is "set userId and merge rows"; feature 27 builds on the same rows; reuses the scoped capability pattern.
**Cons**: the sign up trigger writes a second table; a backfill must run per deployment; app names are copied, so they can drift from `users`.

### Option 2: Walk ins table, app visitors read live from `users`

Only walk ins get rows. App visitors are merged in at read time from `users.role`.

**Pros**: no sign up hook, no backfill, no copied names.
**Cons**: every page of the list merges two sources, so pagination and sorting across both is awkward and slow; visits and follow ups need two owner kinds; a join becomes a cross table rewrite.

### Option 3: A bespoke Hospitality portal like Media's

Its own route folder, sidebar and layout.

**Pros**: full freedom over navigation and dashboard.
**Cons**: duplicates shell chrome the repo deliberately built once (spec 0012); Library and Real Estate already proved the `[slug]` plus scoped capability route works.

## Rationale

Option 1 fits the force that matters most, one list with joins, at the lowest ongoing cost. The sign up hook is one scheduled, idempotent insert (the same pattern as the welcome email, so it can never block a sign up), and the backfill is a one time idempotent job that reuses it. The cross check (an independent read by a second model) surfaced the scheduling, the reused follow up row, the clan queue index and the merge field rules, all applied in `index.md`. Option 2 saves those two pieces but pushes the cost into every read, forever. Option 3 has no requirement driving it.

Smaller calls, decided with the engineer: phone app links rather than church SMS in core (no provider dependency on launch day), fixed templates in shared code (feature 27 makes them editable), push plus in app for N41 (it reuses `notifications.dispatch`), print to PDF (no new dependency), and anonymise on removal (it keeps report totals honest while removing personal data).

Calls I made at write time:
- **`accountPhone` on `visitors`** rather than an index on `memberProfiles.phone`. Profile phones are stored as typed, not normalised, so an index there would miss matches. A normalised copy, written where profiles are written, makes phone suggestions an indexed lookup. The runner up was scanning profiles and normalising on read, which is correct but unbounded.
- **Withdrawal clears the phone**, so "phone implies consent" stays a simple invariant that feature 27 can trust. The runner up was keeping the phone with a withdrawn flag, which leaves every SMS path one check away from a breach.
- **Stored visit counters and `lastRegularMonth`**, against the usual "derive at read time" rule, because sorting and filtering a paginated list by them needs indexed fields. The drift risk is contained by recomputing them from the visit rows in every visit writer.
- **`today` sent by the client** for regular and dashboard reads (the spec 0012 convention), while writes use the server's `kampalaToday()` for the backdate window.
