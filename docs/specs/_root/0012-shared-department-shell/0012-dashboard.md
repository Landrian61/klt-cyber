# 0012e. Department dashboard

Child of [0012 Shared department shell](index.md). Covers S2-01 to S2-04 and acceptance criteria **AC-33** to **AC-38**.

## Summary

The page a leader lands on, showing only what concerns their own department: how many verified members they have, how many claims are waiting, how many people have not finished mentorship, what is coming up, the church's weekly programs, and a feed of what has happened recently in this department. It is built late because every number on it is produced by another child.

## Design

**Cards and their sources**

| Card | Value | Source |
|---|---|---|
| Verified members | count | `active` memberships joined to `memberProfiles.profileStatus === "verified"`; pending claims excluded by the status filter, which is what S2-01 requires |
| Claims waiting | count, links to the Roster's pending section | `pending_claim` rows for this department on `by_departmentId_status` |
| Mentorship not completed | count | `active` memberships whose joined `mentorshipStatus !== "completed"`, meaning `not_enrolled` plus `enrolled`; informational, no action |
| Upcoming activities | the next five, cancelled ones included and marked | `groupActivities` on `by_department_start` forward of the client supplied `now` |
| This week's programs | list | the church wide weekly program read, not department scoped |
| Recent department activity | the latest twenty | `activityLogs` through the new `by_department` index, filtered to the shell action set |

The three counts come from reads of `by_departmentId_status` plus one profile join per member, bounded by one department's roster. Nothing is stored or precomputed; a roster is tens of rows and a stored count would go stale the moment a claim is confirmed.

**The verified count and the roster count differ, legitimately.** Rows that were `active` before this feature may belong to an unverified profile (the old self added behaviour). The roster lists every active row and labels those "not verified"; this card counts only the verified ones. Both are correct, and the label is what makes the difference explainable to a leader rather than looking like a bug.

**The weekly programs read.** The card needs the church wide programs, which Administration's dashboard already reads. If that existing read is gated to Administration authority, a department scoped wrapper is added rather than widening the existing gate, so a department HOD never inherits Administration's read surface as a side effect.

**The clock.** `getDashboard` takes an explicit `now` argument, rounded down to the minute by the client, for the same reason the activities list does: a Convex query is reactive to data and not to time, so a server side `Date.now()` would compute "upcoming" once and never re evaluate. Passing `now` makes the client's clock the trigger.

**The activity feed and its index**

`activityLogs` gains a top level optional `departmentId` with an index `by_department`. The field is top level and **not** inside `metadata` because `metadata` is typed `v.optional(v.any())` and Convex cannot index a path inside an `any`. Promoting the field preserves the intent, an indexed read bounded by one department, without forcing a declared shape onto `metadata` and therefore onto every existing writer of it across the backend.

Every shell mutation writes `departmentId`. The feed shows this fixed set of actions:

```
department.claim_created        department.claim_confirmed
department.claim_declined       department.member_added
department.member_removed       department.member_title_updated
department.delegate_appointed   department.delegate_removed
department.message_sent         department.activity_created
department.activity_cancelled   department.description_updated
```

The set is explicit rather than "everything carrying this department id", so an unrelated future action that happens to carry one can never appear in a leader's feed.

**Read strategy.** `by_department` is a single field index, so it returns rows in `_creationTime` order and the action filter has to be applied after the index read. Convex's `paginate` combined with `.filter` returns pages of variable and sometimes zero length, which makes an infinite scroll jump about. So the feed instead reads a bounded window in descending order (`.order("desc").take(100)`), filters to the action set in memory, and returns the most recent twenty. A department produces a handful of audit rows a week, so one hundred rows reaches back months. If a department ever outgrows that, the fix is a compound `["departmentId", "action"]` index queried once per action name, which is noted here so the next person does not have to rediscover it.

**History is blank, on purpose.** Entries written before this change carry their department only inside `metadata`, so they have no top level `departmentId` and never appear. No backfill runs: rewriting the meaning of existing audit rows is worse than a feed that starts from today, and the requirement is a leader seeing recent activity, not an archive.

Actor names come from the `users` row; an actor whose account was deleted renders as "a former member", matching the messages list, since deletion anonymises rather than removes the row.

**Empty and error states**

Every card renders an explicit empty state rather than a blank area: no claims waiting, no upcoming activities, nothing recent. A failing query shows the shared `ErrorState` with retry from spec 0002. Every query resolves to `null` rather than throwing when the caller signs out or loses access while the page is mounted, so a mounted subscription never crashes the tree; the shell layout renders the signed out or redirected state from that `null`.

**Department specific cards**

SRS 4.7.1 says the Dashboard carries the shared cards "plus department specific cards". The shared Dashboard component takes an optional slot for extra cards so a later department feature (Library's low stock, Hospitality's follow ups) can add its own without forking the page. This feature ships the slot and no occupants. Media keeps its own bespoke Dashboard rather than adopting this one, so the slot is not what serves Media today.

## Build tasks

1. Add `departmentId` to `activityLogs` with the `by_department` index, satisfies **AC-37**.
2. Add `departmentId` to every audit entry written by the shell mutations across the other children, satisfies **AC-37**.
3. Build `getDashboard` taking `departmentId` and `now`, returning the three counts, the next five upcoming activities and the weekly programs, adding a department scoped wrapper for the programs read if the existing one is gated to Administration authority, satisfies **AC-33**, **AC-34**, **AC-36**.
4. Build `listDepartmentFeed` as the bounded descending read filtered to the named action set, returning the latest twenty with actor names and the former member fallback, satisfies **AC-35**.
5. Build the shared Dashboard page with all six cards, the extra card slot, an explicit empty state per card and the `ErrorState` fallback, satisfies **AC-33**, **AC-34**, **AC-35**, **AC-36**, **AC-38**.
6. Replace the thin thread's member count only Dashboard from umbrella slice 3 with the complete page, satisfies **AC-33**.

## Rationale (short)

The dashboard is built late because each of its numbers is produced by another child, so building it earlier would mean stubbing values and revisiting them. Counts are computed at read time rather than stored because the roster is small and a stored count would go stale on every claim decision, which is the "never store derived values without a measured problem" rule. The feed reads an explicit action set so a future unrelated mutation cannot leak into a leader's view, and it takes a bounded window rather than Convex pagination because `paginate` with a `.filter` returns ragged pages. No backfill runs, because rewriting the meaning of existing audit entries is worse than a feed that starts from today. The explicit `now` exists because a Convex query cannot react to the clock.

## Edge cases

- A brand new department shows zeroes with explicit empty states, not a blank page.
- A department whose entire roster has completed mentorship shows zero rather than hiding the card, since the absence of an informational count would read as missing data.
- The claims waiting card shows zero and does not link anywhere when there are no pending claims.
- A department with grandfathered unverified active rows shows a verified count lower than the roster length. The roster's "not verified" label is what reconciles the two.
- A plain roster member of Media, Hospitality or Library never reaches this page: `getShellContext` returns `null` for them and the shell redirects to the hub. Their portal access exists to reach their department's own bespoke pages.
- Signing out with the Dashboard mounted resolves every query to `null` and shows the signed out state rather than logging a client error.
- The weekly programs card is deliberately church wide, so two departments show the same programs. That is correct, not duplication.
- A department whose recent audit volume exceeds the hundred row window loses the oldest entries from the feed rather than failing; the compound index note above is the remedy.
- Cancelled upcoming activities still occupy a slot in the next five, marked, so a leader sees the slot is called off.
- A feed entry whose actor account was deleted renders as "a former member".
