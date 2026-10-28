# 0013. Notification targeting: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index and can skip this file.

## Context

Every notification in the app goes through one internal mutation, `notifications.dispatch` (`convex/notifications.ts`). It resolves one of five audience types (`all`, `department`, `users`, `role`, `clan`), writes one `notifications` row per event (not per recipient), and pushes to everyone resolved. The in app notification centre finds "my" notifications by resolving each row's audience again at read time. The pipeline itself is sound and recently hardened: verified only department and clan audiences (spec 0012), deleted accounts excluded (spec 0008), fire time occurrence checks (spec 0009), reach counts (spec 0011). What is wrong is what individual call sites ask it to do.

An audit of every call site found these gaps against SRS §4.5 and §5:

| Gap | Where | SRS |
|---|---|---|
| Appointments pushed to every user | `roles.ts` `assignRoleCore`, `audience: { type: "all" }` | F4-03 "Never all users", N13, N14 |
| Most role endings send nothing | `revokeRoleCore` (deliberately silent), elder replacement, HOD replacement (both cardinality rules), roster removal cascade; account deletion also revokes, and must stay silent | F4-04, F3-10, N15 |
| Verifying twice repeats every side effect | `memberProfiles.ts` `verifyProfile` has no already verified guard | F4-06 |
| One hand written N15 | `departmentMemberships.ts` `removeDelegate` | would double up once revokes notify |
| Republishing pushes again | `announcements.ts` `schedulePublishNotification` on every publish | F4-01, A6-02 |
| HOD never told of a claim | claim rows written in `memberProfiles.ts` submission, no dispatch | F4-07, N10 |
| Reviewer alert includes System Admins | `getAdministrationAuthorityUserIds` | N04 lists Administration HOD and delegates |
| Expired announcement shows "not found" | `announcement-detail.tsx` searches `listActiveAnnouncements` | F4-12, M3-04 |
| Ended events not marked | `item-detail.tsx` (the direct read already exists from spec 0010) | F4-12 |
| Appointment, review, claim and notice taps land on Home | `notification-links.ts` default case | F4-13 |

Three stories in this scope row depend on flows that do not exist yet: send back (F2-05, feature 9), mentorship confirmation (F2-14, feature 29), and the web bell inbox (F4-10, feature 28). Event audiences (A5-02) belong to feature 18. The forces at play: this is GA, notices about authority are sensitive (a church wide "X is now HOD" is the very thing the SRS forbids), a wrong audience fails silently in production, and launch is a month away, so the change has to be small enough to verify fully.

## Options considered

### Option 1: Fix in place on the existing pipeline

Keep `dispatch` and the audience union. Correct each call site's audience, centralise the two families of notices that had drifted (role ended, reviewer alert), add an optional `kind`, add `firstPublishedAt`, and add the missing read paths and screens.

**Pros**:
- Smallest blast radius: no change to how pushes are delivered or how the centre reads rows.
- Each gap is fixed where it lives, so the review diff reads one call site at a time.
- Reuses every audience safeguard the last four specs added.

**Cons**:
- The `users` audience list grows with roster size inside a row (fine at this congregation's scale, not forever).
- The policy "who gets what" stays spread across call sites, with helpers only where drift already happened.

### Option 2: A central notification policy table

Introduce a `notify(ctx, kind, subject)` entry point that maps every catalogue code to its audience and channels in one table, and move every call site onto it.

**Pros**:
- The SRS §5 catalogue becomes code, in one place.
- Feature 28's muting and the web bell would plug into the same table.

**Cons**:
- Touches every one of the roughly 20 dispatch call sites, most of which are correct today, for a GA change a month from launch.
- Many audiences need context only the caller has (the frozen roster at appointment time, the claim's department), so the "table" becomes a set of functions anyway.
- It is the right shape for feature 28, which has to touch every call site regardless. Doing it here does that work twice.

### Option 3: A per recipient inbox table

Fan out one row per recipient at send time (an `inbox` table), so targeting and read state live together.

**Pros**:
- Frozen audiences become natural, and the centre's flat scan goes away.

**Cons**:
- A schema and read path rewrite of a working system, plus a backfill of every existing notification. That is a big bang change with no gap in this row requiring it.
- Measured cost of today's scan: none reported. This would optimise an unmeasured problem.

## Rationale

Option 1, because every gap in the audit is a call site asking the right pipeline for the wrong thing. The pipeline itself is not at fault. Fixing in place respects the GA tier and the launch date: each slice is a small, testable diff with a precise recipient assertion. Option 2 is the right destination, but feature 28 is the natural owner, because muting by category has to visit every call site anyway. The optional `kind` added here is the down payment that makes that move mechanical. Option 3 solves a performance problem nobody has measured.

Within Option 1, the engineer's choices shape the details:
- **N14 uses a frozen `users` list** rather than the live department or clan audience. "Who was in the group when the leader changed" is the honest audience. The live audience would also include the appointee, who already has N13.
- **N15 lives in one helper on every revoke path**, because the audit found six places that write a revocation (five in `roles.ts` and `departmentMemberships.ts`, one in `accountDeletion.ts`), all of them silent, with one hand written notice bolted on afterwards in `removeDelegate`. Notifying is the helper's default, with an explicit opt out, so the next revoke path has to choose silence on purpose. A rule spread across six places is how the gap appeared.
- **The roster cascade sends one combined notice**, since two pushes for one action read as a bug to the person receiving them.
- **The claim alert waits until the claim is actionable**, because the HOD cannot confirm an unverified member, and an alert they cannot act on trains them to ignore alerts.

Decisions made at write time (each with the runner up):
- **Ended is derived on the device**, not returned by the server. A Convex query's `Date.now()` does not re-run as time passes, so a server "ended" flag would go stale on an open screen. Events already work this way. Runner up: a server `state` field. Simpler for clients, but wrong after the screen stays open across the end time.
- **The member view is authorized through the notification row the tap came from**, not by checking current group membership. The recipient list is exactly who was told, so it is the precise rule, and it needs no roster query. Runner up: check the live roster. That would let later joiners read it and lock out people who left.
- **Portal work taps reuse the existing deep link types** (`profile_review`, `hod_notice`, plus a new `department_claim`) and map them to one `/portal-work` route, rather than a single `portal_work` payload type. Existing pushes in the wild route correctly with no payload change. Runner up: a unified type, which would leave every notice already delivered on Home.
- **Historical appointment rows sent to `all` are retargeted** to the appointee in the migration, so no one's notification centre keeps showing other people's appointments. Runner up: leave history alone. That is harmless for delivery but keeps the very leak F4-03 forbids visible in the centre.
- **The reviewer resolver is a new helper beside `getAdministrationAuthorityUserIds`**, not a change to it, because that function also answers "who may act", and System Admin must keep that authority. Runner up: narrowing the existing function, which would silently remove System Admin access elsewhere.
