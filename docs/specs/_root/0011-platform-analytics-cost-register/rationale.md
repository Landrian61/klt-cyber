# 0011. Platform analytics and cost register: reasoning

## Context

> ⚠️ Premise note: four of the six analytics sections SRS §4.3.3 asks for have no source in the code yet. Send backs belong to feature 9, claims waiting to feature 17, radio listening hours to feature 20, SMS sends and credit to feature 27, and the last of those is Week 5 work. Building this page in Week 2 therefore means building five slots that stay empty for weeks, and a later feature that forgets to fill its slot leaves a permanent blank on the one page meant to tell the truth about the platform. The right framing is not to delay the page, it is to make each gap a named promise on the page itself and a one line task on the owing feature's scope row. That is what AC-9 and the follow up items do. Proceed.

The System Admin has no way to see the platform as a whole. `convex/admin.ts:getDashboardStats` holds eight people counts on Administration's dashboard, and nothing else exists: no activity figures, no device figures, no notification or email volume, no storage figure, and no record of what any of the paid services cost. SRS F3-17 and A8-04 ask for six sections of numbers; A8-05 asks for a cost register with renewal reminders; F1-11 asks that "last active" be recorded on use, which is the input the activity numbers need and which nothing writes today.

Three forces shape the design.

**Nothing may be invented.** NF-18 forbids fake counts reaching users, and this page exists precisely to be trusted. That rules out a plausible zero for a number whose source does not exist, and it rules out pre filling the cost register with public list prices nobody checked against an invoice. On the money page the same force rules out a floating point amount and a hand maintained exchange rate, both of which produce a total that is quietly wrong.

**The platform the counts read is small, and two reads are not.** Fifty ministers at launch, then a congregation. A full read of `users` per page load is what the existing dashboard already does and is right at this size. Two reads are different in kind: `r2.listMetadata` pages the whole storage bucket, which grows with every recording and photo, and `activityLogs` grows with every consequential action in the church forever. Those two have to be bounded by design rather than by current size.

**The numbers are scattered across components we do not own.** Push tokens live inside `@convex-dev/expo-push-notifications`, whose `pushTokens` table carries only `userId`, `token` and `notificationsPaused`, so it cannot answer "which phones, on which platform, on which app version". Email delivery lives inside `@convex-dev/resend`. Errors live in Sentry. Each one is either unreadable from our side or reachable only by adding a credential and a failure path. Where our own data can answer the question honestly it should, and `convex/emails.ts:logSend` already writes `email.sent` and `email.failed` into `activityLogs`, which makes email volume free.

Not deciding leaves the church spending money on thirteen external services with no record of what any of them costs or when it renews, and leaves F1-11 unbuilt, which blocks the active user counts in every later analytics surface including Radio Insights (feature 32).

## Options considered

### Option 1: live reads, one nightly exception, honest gaps (chosen)

Two pages under Administration's System Admin only route group. One Convex query computes every analytics number on page load from indexed reads, except total storage, which a nightly cron records into a single `platformMetrics` row and the page shows with its "as of" time. Numbers whose source does not exist render as a named promise. The cost register is a maintained table with a daily renewal sweep.

**Pros**:
- Every number shown is current at the moment it is read, which is what "pending verifications" and "active today" need to be.
- One new cron and one new single row table. The operational surface barely moves.
- The two unbounded reads are the only ones bounded by design, which is where the thinking belongs.

**Cons**:
- Total accounts needs a full read of `users`, since Convex has no count aggregate. Fine now, a real cost at congregation scale.
- The storage figure is up to a day old, and the page has to say so.
- Five visible gaps on the page until Week 5.

### Option 2: nightly snapshot of every number

One cron writes all six sections into a snapshot row; the page reads one document.

**Pros**:
- Page loads are a single document read at any scale, and historical trends come free.
- No read on the page can ever be slow.

**Cons**:
- Every number is up to a day old. "Active users today" and "pending verifications" are then wrong by definition, and the second one is an action queue somebody is meant to work from.
- A failed cron silently serves yesterday's numbers with no signal, which is the fake count NF-18 forbids, dressed as a real one.
- Buys scale nobody has measured a need for, at the cost of correctness today.

### Option 3: build the missing counters now

Widen the feature to add the listening records, SMS logs and claim states the later features owe, so all six sections are complete on day one.

**Pros**:
- No gaps, no follow up tasks, no promise to keep.
- One pass over the counting instead of five.

**Cons**:
- Pre empts design decisions features 17, 20 and 27 own. A listening record's shape is Radio's call, and getting it wrong here means two migrations instead of one.
- Turns a Week 2 Track B feature into something spanning four other unbuilt features.
- Track B does not own the Convex schema for radio or SMS, so this is not its decision to take.

## Rationale

Option 1 follows from the first two forces directly. Correctness today beats scale nobody has measured, so the numbers are read live; the only two reads that grow without bound are the two that get special handling, which is proportionate rather than uniform. Option 2 inverts that: it optimises a page load nobody has complained about and pays for it in the one currency this page cannot spend, which is honesty about the present. A stale "pending verifications" count is worse than a slow one, because somebody acts on it.

Option 3 fails on ownership rather than on effort. `AGENTS.md` puts the Convex schema and all deployments with Track A, and features 17, 20 and 27 own the shapes this option would have to guess. Guessing them here means designing radio listening records without designing radio.

The honest gap treatment is what makes Option 1 defensible rather than merely convenient. A section that renders "available when Radio ships (feature 20)" is more useful than a zero and more useful than an absent section, because it tells the System Admin the platform is not broken and tells the next builder exactly which slot to fill.

Two smaller calls are worth recording. Storing money as whole numbers in the smallest unit the currency bills in, with the exponent in `packages/shared`, is the standard answer for money and the only one that survives dividing an annual cost by twelve. And keeping native currencies side by side rather than converting them means the total is always right, where a hand maintained exchange rate is right only on the day it was typed, on the page whose entire purpose is being right about money.

## Evidence: what the code does today

Read on 24 October 2026, on `main` at `ec1fcd2`.

| Question | What the code shows |
|---|---|
| Is anything analytics shaped built? | `convex/admin.ts:getDashboardStats` returns eight people counts, System Admin only, by reading `users`, `memberProfiles` and `roleAssignments` whole. `listRecentActivity` reads `activityLogs` whole and pages in memory. Nothing else. |
| Does anything record last active? | No. `users` has no such field and no mutation writes one. |
| Can push tokens answer the Devices question? | No. `node_modules/@convex-dev/expo-push-notifications/src/component/schema.ts` defines `pushTokens` as `userId`, `token`, `notificationsPaused` only. No platform, no version. |
| Can email volume be counted? | Yes, for free. `convex/emails.ts:logSend` writes `email.sent` and `email.failed` into `activityLogs`, and Convex appends `_creationTime` to every index, so `by_action` plus a range gives a month window. |
| Can storage be measured? | Yes, but not cheaply. `convex/uploads.ts` re-exports the `@convex-dev/r2` component's `listMetadata`, which is paginated and carries `size` per object. |
| Does a notification row know its fan out? | No. `notifications` is one row per event; `dispatch` resolves the audience and never records how many people it reached. |
| Which engagement numbers have a source? | `profile.verified` in `activityLogs`, and `groupMessages.by_department` / `groupActivities.by_department_start` from spec 0010. `memberProfiles.profileStatus` is `pending_verification` or `verified` only, so there is no send back state to count, and there is no pending claim state at all. |
| Is the destination route group built? | No. Spec 0004's third milestone (`admin/(system)/`) is unticked in `docs/scope/scope.md`, and `apps/admin/app/(admin)/system-admin/` still holds Accounts, Audit log and Content. |
| Is a new native dependency needed? | No. `expo-constants` is already a dependency and `Platform.OS` is free, so platform and app version need nothing new and the whole feature ships over the air. |

## Cross check, 24 October 2026

An independent read on a different model found fourteen gaps. All were applied. Four changed the design rather than filling a blank, and are worth recording:

1. **`lastActiveAt` moved off the `users` document into its own `userActivity` table.** The original draft put it on `users`, which would have made every hourly activity write invalidate every live query that reads that document: the role checks in `convex/lib/authz.ts`, Administration's dashboard, the member directory, every profile subscription. The feature's own write traffic would have paid for itself in everyone else's re-reads. This was the best finding of the pass.
2. **`currency` and `billingCycle` became optional.** They were required, which made AC-16's seed impossible to write: a seeded row has neither until somebody reads the invoice, and any default the seed picked would have been an assertion NF-18 forbids. Optional with "not recorded" semantics is both honest and simpler than a default.
3. **The Engagement activity figure counts activities starting this month, not created this month.** `groupActivities.by_department_start` is keyed on `startDateTime`, not creation time, so the original wording described a read that index cannot serve. Starting this month is also the more useful question for a church, so this cost nothing and avoided a new index.
4. **The web bell claim was dropped.** Nothing in `apps/admin` consumes `deepLink` at all, so AC-14's original "push and web bell" would have meant building a notification surface this feature does not own. Feature 28 owns the bell; this feature writes the link and enrols the mapping there.

The remaining ten were undecided inputs rather than design errors: the reminder sweep had no dispatch mechanism, title, body or `createdBy` (all now follow `convex/weeklyPrograms.ts:762`'s existing cron pattern); the reminder stages were exact day equalities, so a missed sweep lost a stage forever (now thresholds); the overdue notice had no cap and there was no way to record that a renewal happened (now `OVERDUE_NOTICE_MAX_DAYS` and `markRenewed`); `consoleUrl` was rendered as an anchor with no scheme validation, which is a real cross site scripting path on a System Admin's browser (now `https` only, enforced on write); no text field had a length cap and no number had a sign rule; the route paths were written in spec 0004's loose shorthand rather than the real tree under `areas-of-service/admin/`; AC-13's rounding order was unstated; the activity throttle would have skipped a second phone reporting within the same hour (now evaluated per target); the R2 metadata query takes its bucket and credentials as arguments, so "no configuration" became "no new variables, one new reader"; and invariant 7 overclaimed, since `account.deleted` is counted to date and `email.sent` undercounts whenever `logSend` has no `users` row to attribute to.

## Checked against the SRS

SRS §4.3.3's section list, §7's service list, A8-04, A8-05, F1-11, F3-03, F3-17 and N44 all read on 24 October 2026. Two wordings were resolved rather than taken literally:

- **"Sign-ups per week"** is shown as sign ups in the last 7 days and the last 30 days, which is what `getDashboardStats` already computes and what a current numbers page can say truthfully. A per week series would need the snapshot table the trends decision rejected.
- **"Phones with the app signed in"** is shown as phones that reported within the last 30 days, with the window named on the page. A phone that is wiped or has the app removed never signs out, so a literal reading of "signed in" would count it forever.

Neither needs an SRS amendment: both are the same numbers, stated honestly.
