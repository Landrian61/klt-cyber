# 0011. Platform analytics and cost register

**Date**: 2026-10-24
**Status**: In Progress

## Summary

The System Admin gets two new pages inside Administration: one showing how the platform is doing (people, activity, phones, engagement, notifications, health) and one listing every paid service with its plan, cost, billing cycle and renewal date. The numbers are counted live when the page opens, so they are never stale, with one exception: total file storage is measured once a night because measuring it means reading the whole storage bucket. Any number whose source has not been built yet says so plainly instead of showing a zero, because a wrong number on this page is worse than an honest blank. To make the activity numbers possible, the app and the portal now quietly report "I am being used" at most once an hour, which is what SRS F1-11 asks for.

## Requirements

**User stories**:
- As a System Admin, I open one page and see how the platform is doing, so I can tell whether people are actually using it without asking anyone.
- As a System Admin, I keep a register of every service the church pays for, so nobody is surprised by a renewal or an unbudgeted bill.
- As a System Admin, I am told before a service renews, and I can record that it renewed, so the money can be arranged in time and the register stays true.
- As any user, my use of the app or the portal is recorded as activity, so the active user counts mean something.
- As a System Admin, I can tell the difference between "nobody did this" and "we have not built the counter yet", so I never act on a number that is not real.

**Acceptance criteria** (the contract):

- **AC-1**: Any signed in use of the mobile app or the web portal records the caller's `userActivity.lastActiveAt`. The client reports on launch and on return to foreground or tab focus, and the write is skipped when the stored value is already within the last 55 minutes, so a misbehaving client cannot drive write volume. The throttle is evaluated per target, not once per call: the activity row is judged on its own `lastActiveAt` and a device row on its own `lastSeenAt`, so a second phone reporting within the same hour still gets a row.
- **AC-2**: A signed in phone reports a device id that it generated once and keeps in its own storage, plus its platform and app version. Exactly one `userDevices` row exists per device id: a different account signing in on the same phone reassigns that row's `userId` rather than adding a second row, and a device id with no row is always inserted. The portal never writes a device row.
- **AC-3**: The Activity section shows distinct active users for three nesting windows read from `userActivity`: today (since midnight Africa/Kampala), the last 7 days, and the last 30 days. Each window is labelled on the page with exactly that wording, and accounts deleted under spec 0008 are excluded.
- **AC-4**: The People section shows total accounts, visitors, members pending verification, verified members, sign ups in the last 7 and last 30 days, and account deletions to date. `users.role` is the source of truth for visitor against member, and `memberProfiles.profileStatus` for pending verification. Deleted accounts are excluded from every count except the deletion count itself.
- **AC-5**: The Devices section shows phones that reported within the last 30 days, split by Android and iPhone and by app version with versions listed in descending string order, with the 30 day window named on the page, alongside links to the Google Play Console and App Store Connect taken from the matching cost register rows.
- **AC-6**: The Engagement section shows profile verifications in the current Africa/Kampala calendar month, and a table with one row per department giving messages sent and activities **starting** in that month. Messages soft deleted under spec 0010 are excluded. Clan owned messages and activities are counted in one combined clans line beneath the table, so nothing is silently dropped.
- **AC-7**: The Notifications section shows notifications sent in the current calendar month and the total number of recipients those notifications reached, labelled as two distinct numbers, plus emails sent in that month shown against the Resend row's allowance when one is recorded. The email figure is labelled as counting logged sends, because `convex/emails.ts:logSend` does not log an email to an address with no `users` row.
- **AC-8**: The Health section shows failed emails in the last 7 days, total file storage used with the time it was measured, and a link to Sentry taken from the Sentry cost register row. Storage is formatted with binary prefixes (KiB, MiB, GiB) to one decimal place, which is how object storage consoles state it.
- **AC-9**: Every number SRS §4.3.3 asks for whose source does not exist yet renders as a named sentence saying which feature will supply it, never as a zero and never as a fabricated value. This covers profile send backs (feature 9), claims waiting (feature 17), radio listening hours (feature 20), SMS sent and SMS credit (feature 27), and store download counts (not automatic in Phase 01 per the SRS).
- **AC-10**: A nightly scheduled job records total storage bytes and object count into the single `platformMetrics` row by paging the R2 component's own metadata query. The figure is saved only after a complete pass, so a failure part way through leaves the previous figure and its timestamp untouched and reports to Sentry. Opening the analytics page never pages the storage bucket.
- **AC-11**: A System Admin adds, edits and archives a service with name, service key, purpose, plan, amount, currency, billing cycle, renewal date, allowance, console URL, account held by and notes, and can record that a renewing service has renewed, which advances its renewal date by its cycle. Archiving keeps the row and removes it from the totals and the reminder sweep; an archived row stays readable under an archived view. Nothing is ever deleted.
- **AC-12**: Writes are validated: a renewal date is required once the cycle is `monthly` or `annual` and rejected for `prepaid_credit`, `free_tier` and `pay_as_you_go`; a renewal date must be a real calendar date; a name that duplicates a non archived row after trimming and lowercasing is rejected; `amountMinor` and `allowanceLimit` must be non negative whole numbers; `consoleUrl` must start with `https://`; and every text field is capped at the length its shared constant sets. `currency` and `billingCycle` are optional, because a seeded row genuinely has neither until somebody reads the invoice.
- **AC-13**: The costs page shows a monthly total per currency, with no conversion between currencies anywhere: an annual cost contributes one twelfth rounded to the nearest minor unit, a monthly cost contributes in full, and `prepaid_credit`, `free_tier` and `pay_as_you_go` contribute nothing to the monthly total while still showing their own figures. Rounding happens per row before summing, so each row's displayed monthly figure adds up to the total shown. A row with no cycle, no currency or no amount is listed as "not recorded" and contributes nothing. A per service breakdown lists every non archived row.
- **AC-14**: A daily scheduled job sends every System Admin a push notification and writes the matching in app notification record 14 days before, 3 days before, and on a service's renewal date, at most once per service per stage per renewal date. The stages are thresholds, not exact days: a sweep missed for a day, or a renewal date first entered inside the window, fires the stage once and late rather than losing it. Moving a renewal date forward re-arms all three stages for the new date.
- **AC-15**: A renewal date in the past marks the service overdue on the page, and the sweep sends the due notice once per calendar day for at most 14 consecutive days. After that the row stays marked overdue and stops notifying, until the date is moved forward, the renewal is recorded, or the service is archived.
- **AC-16**: A reference seed creates one row per SRS §7 service carrying its name, service key and purpose only, with no currency, cycle, plan, amount or renewal date. The seed is safe in every environment including production, is idempotent, and never asserts a cost figure.
- **AC-17**: Both pages and every cost register mutation are System Admin only, enforced in Convex. The read queries return `null` rather than throwing for a caller without the role, so a live subscription survives sign out, and a non System Admin visiting `/areas-of-service/admin/analytics` or `/areas-of-service/admin/costs` is redirected to `/areas-of-service/admin`.
- **AC-18**: Every cost register create, edit, archive and renewal record writes an `activityLogs` entry naming the actor and the service.
- **AC-19**: Deleting an account deletes that account's `userDevices` rows and its `userActivity` row, in the same transaction as the rest of spec 0008's anonymizing.
- **AC-20**: Both pages live under Administration's System Admin only route group at `apps/admin/app/(admin)/areas-of-service/admin/(system)/`, which this feature creates if spec 0004's relocation has not landed yet, using the same guard spec 0004 specifies.

## Decision

**Chosen option**: Option 1: live reads, one nightly exception, honest gaps.

Count every analytics number on page load from indexed reads, measure storage once a night into a single row, name every missing source on the page rather than showing a zero, and keep the cost register as a maintained table with a daily renewal sweep. Two separate pages under Administration's System Admin only route group.

**Implementation skills**: `convex` (`convex/agent-skills`, `.claude/skills/convex/`) · `convex-reviewer` (`convex/agent-skills`, `.claude/skills/convex-reviewer/`) · `shadcn` (`.claude/skills/shadcn/`)

## Rationale

Reasoning, the options weighed, and the evidence read from the codebase: see [rationale.md](rationale.md).

## Feature design

### Data model

All changes are additive. Nothing existing is narrowed, retyped or migrated.

**`notifications`** gains one field.

| Field | Type | Notes |
|---|---|---|
| `recipientCount` | `v.optional(v.number())` | How many users the resolved audience contained, written by `dispatch` at insert time from `recipients.length`, which it already computes before the insert. Optional because rows written before this feature carry no fan out size; AC-7 labels the recipient figure as counted from rows that record it. |

**`userActivity`**, one row per user who has ever reported activity.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | |
| `lastActiveAt` | `v.number()` | Unix ms. |

Indexes: `by_userId` (the upsert and the deletion sweep), `by_lastActiveAt` (the three window reads).

This is deliberately **not** a field on `users`. An hourly write to a `users` document would invalidate every live query that reads that document, which in this codebase means the role checks in `convex/lib/authz.ts`, Administration's dashboard, the member directory and every profile subscription. Writing to a document nothing else subscribes to keeps the cost of the feature inside the feature. A row rather than a field also means "never reported" is the absence of a row, which is honest, where a missing field on a shared document invites a zero.

**`userDevices`**, one row per phone that has reported while signed in.

| Field | Type | Notes |
|---|---|---|
| `deviceId` | `v.string()` | Generated once on the phone and kept in its own storage. The row's identity. |
| `userId` | `v.id("users")` | The account currently signed in on that phone. Reassigned, not duplicated, when a different account signs in. |
| `platform` | `v.union(v.literal("android"), v.literal("ios"))` | Phones only. The portal writes no row here, so there is deliberately no `web` member. |
| `appVersion` | `v.string()` | From `expo-constants`. Free text, because a version string is the app's to define. |
| `lastSeenAt` | `v.number()` | Unix ms, throttled on this row's own value. |

Indexes: `by_deviceId` (the upsert lookup), `by_userId` (the deletion sweep in AC-19), `by_lastSeenAt` (the 30 day window read in AC-5).

**`costServices`**, one row per external service the church uses.

| Field | Type | Notes |
|---|---|---|
| `name` | `v.string()` | Capped at `COST_NAME_MAX`. Unique among non archived rows after trimming and lowercasing, enforced in the mutation (Convex has no unique index). |
| `serviceKey` | `v.optional(vCostServiceKey)` | A value from `COST_SERVICE_KEYS` in `packages/shared`, set by the seed. This is how the page finds a specific service without matching on a name a System Admin may have edited: Devices reads the `play_console` and `app_store` rows' `consoleUrl`, Health reads the `sentry` row's, and the email allowance reads the `resend` row's. Optional, because a System Admin may add a service the set does not name. |
| `purpose` | `v.optional(v.string())` | What the church uses it for, seeded from SRS §7. Capped at `COST_PURPOSE_MAX`. |
| `plan` | `v.optional(v.string())` | The plan name as the invoice states it. Free text capped at `COST_PLAN_MAX`, because every provider names its plans differently. |
| `amountMinor` | `v.optional(v.number())` | A non negative whole number in the currency's smallest unit: USD in cents, UGX in shillings. Optional because a seeded row has no figure until somebody reads the invoice. |
| `currency` | `v.optional(vCostCurrency)` (`"USD"` \| `"UGX"`) | Optional for the same reason as the amount. Never converted. |
| `billingCycle` | `v.optional(vBillingCycle)` | `monthly` \| `annual` \| `prepaid_credit` \| `free_tier` \| `pay_as_you_go`. Optional, so a seeded row asserts no arrangement it has not been told about. |
| `renewalDate` | `v.optional(v.string())` | `"YYYY-MM-DD"` Africa/Kampala date key, the same convention `devotionals` and `pastEvents` already use. Required once the cycle is `monthly` or `annual`, forbidden for the other three, and validated as a real calendar date (AC-12). |
| `allowanceLimit` | `v.optional(v.number())` | A non negative whole number: the plan's included allowance, typed from the provider's plan. Its unit is implied by `serviceKey` through `SERVICE_USAGE_METRIC`, so there is no second unit field to contradict it. |
| `consoleUrl` | `v.optional(v.string())` | Where to manage this service. Must start with `https://`, enforced on write, because both pages render it as a link. |
| `accountHeldBy` | `v.optional(v.string())` | Free text, capped at `COST_HELD_BY_MAX`: who holds and pays for the account. |
| `notes` | `v.optional(v.string())` | Free text, capped at `COST_NOTES_MAX`. |
| `archivedAt` | `v.optional(v.number())` | Set means archived. Explicit timestamp, not a soft delete flag. |
| `archivedBy` | `v.optional(v.id("users"))` | |
| `createdBy` | `v.id("users")` | Also the `createdBy` the renewal sweep attributes its notification to, since a cron has no acting user. The same pattern `convex/weeklyPrograms.ts:762` already uses for its reminder cron. |
| `createdAt`, `updatedAt` | `v.number()` | |

Indexes: `by_archivedAt` (the register list and the sweep), `by_serviceKey` (the four lookups above).

**`costRenewalNotices`**, one row per reminder already sent.

| Field | Type | Notes |
|---|---|---|
| `serviceId` | `v.id("costServices")` | |
| `renewalDate` | `v.string()` | The date the notice was about. In the key, so moving a renewal date forward re-arms all three stages (AC-14). |
| `stage` | `v.union(v.literal("t14"), v.literal("t3"), v.literal("due"))` | |
| `noticeDate` | `v.string()` | The Africa/Kampala date the notice actually went out, stored for all three stages. In the key, which is what lets `due` repeat once a day while a renewal is overdue (AC-15) without `t14` or `t3` ever repeating, since those two are also keyed on `stage`. |
| `sentAt` | `v.number()` | |

Index: `by_service_renewal_stage` on `["serviceId", "renewalDate", "stage"]`. The `t14` and `t3` checks read that prefix and stop at the first row. The `due` check reads the same prefix and compares `noticeDate` on the rows it finds, which also gives the AC-15 count of consecutive days without a second index. A row existing means that notice went out; there is no "not sent" row, the same convention `notificationReads` and `roleAssignments` already follow.

**`platformMetrics`**, exactly one row, patched nightly.

| Field | Type | Notes |
|---|---|---|
| `storageBytes` | `v.number()` | Sum of every R2 object's size, treating a missing `size` as zero since the component types it optional. |
| `storageObjectCount` | `v.number()` | |
| `computedAt` | `v.number()` | Shown beside the figure on the page (AC-8). |

No index: the table holds one row, found with `.first()`. One row patched in place rather than a row per night, because the trends decision settled on current numbers only; a daily row would be storing history nothing reads.

**`@klt-cyber/shared`** gains `src/constants/costRegister.ts`:
- `COST_SERVICE_KEYS`, the closed set, one key per SRS §7 service: `convex`, `r2`, `cloudflare_pages`, `eas`, `push`, `resend`, `africas_talking`, `google_cloud`, `caster_fm`, `sentry`, `youtube`, `giving`, `app_store`, `play_console`. Fourteen values, because SRS §7's thirteen rows list the two app stores together and they are two accounts with two costs and two consoles.
- `COST_CURRENCIES` with the minor unit exponent per currency (`USD` 2, `UGX` 0, since the shilling has no subunit in practice), and `formatCostAmount(amountMinor, currency)`.
- `BILLING_CYCLES`, `CYCLES_REQUIRING_RENEWAL_DATE` (`monthly`, `annual`), and `monthlyContributionMinor(amountMinor, cycle)`: full for `monthly`, `Math.round(amountMinor / 12)` for `annual`, zero for the other three, and zero when either argument is absent.
- `advanceRenewalDate(dateKey, cycle)`, used by both `markRenewed` and anything that needs the next date.
- `SERVICE_USAGE_METRIC`, mapping a `serviceKey` to which of our own counts belongs beside it (`resend` to emails this month, `r2` to storage bytes, `africas_talking` to SMS credit, which is the AC-9 gap until feature 27).
- `RENEWAL_REMINDER_STAGES` (14, 3, 0 days), `OVERDUE_NOTICE_MAX_DAYS` (14), and `ACTIVITY_REPORT_THROTTLE_MS` (55 minutes), shared so mobile, the portal and the server agree on one number.
- The text caps: `COST_NAME_MAX` 80, `COST_PLAN_MAX` 60, `COST_PURPOSE_MAX` 160, `COST_HELD_BY_MAX` 80, `COST_NOTES_MAX` 500.
- `isHttpsUrl(value)`, the single `consoleUrl` rule used by both the form and the mutation.
- `formatBytesBinary(bytes)` for AC-8.
- `ANALYTICS_GAPS`, the AC-9 sentences keyed by gap, so the page and any later feature filling a slot read the same list.

Per `packages/shared/AGENTS.md`, this file gets a Vitest suite covering the money formatter, the exponent table, the monthly contribution per cycle including the absent argument cases, `advanceRenewalDate` across a month and year boundary and a 31st, `isHttpsUrl`, `formatBytesBinary`, and a guard test asserting `SERVICE_USAGE_METRIC`'s keys are all members of `COST_SERVICE_KEYS`.

**`convex/calendar.ts`** gains `kampalaDayStart(instant)`, `kampalaMonthStart(instant)` and `kampalaDateKey(instant)`, built on the existing `KAMPALA_OFFSET_MS` and `kampalaParts`.

### State transitions

A cost service: `active` (no `archivedAt`) → `archived` (`archivedAt` set). One direction only in this feature; un-archiving is not in scope and is noted in Follow-up.

A renewal, derived rather than stored, from `renewalDate` against today in Africa/Kampala: `scheduled` (more than 14 days away) → `due_soon` (14 days or fewer) → `imminent` (3 days or fewer) → `due` (today) → `overdue` (in the past). The states are thresholds, so a sweep that misses a day does not skip a state. Each of the three notifying stages fires at most one notice per renewal date; `overdue` fires one per calendar day for at most `OVERDUE_NOTICE_MAX_DAYS`. Archiving at any point stops the sweep. Recording a renewal, or moving the date forward by hand, returns the service to whichever state the new date implies and re-arms every stage, because `renewalDate` is part of the notice key.

### API surface

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `api.activity.recordActivity` | mutation | `deviceId?: string`, `platform?: "android"\|"ios"`, `appVersion?: string` (all three present together or all absent) | `null` | authenticated | throws when unauthenticated or when the caller has no `users` row; rejects a partial device triple |
| `api.analytics.getPlatformAnalytics` | query | none | one object with a `people`, `activity`, `devices`, `engagement`, `notifications` and `health` key, plus `gaps` | System Admin | returns `null` for any other caller, never throws |
| `internal.analytics.measureStorage` | internalAction | none (cron) | `null` | internal | an R2 read failure is reported to Sentry through the existing `reportError` helper from spec 0002 and leaves the previous figure and its `computedAt` in place |
| `internal.analytics.saveStorageUsage` | internalMutation | `storageBytes: number`, `storageObjectCount: number` | `null` | internal | none |
| `api.costs.listServices` | query | `includeArchived?: boolean` | services array plus `monthlyTotalsByCurrency` and each row's derived renewal state | System Admin | returns `null` for any other caller |
| `api.costs.createService` | mutation | `name` required; every other field optional | `Id<"costServices">` | System Admin | duplicate name; renewal date against the cycle; invalid date; non integer or negative number; non `https` console URL; a text field over its cap |
| `api.costs.updateService` | mutation | `serviceId` plus the fields to change | `null` | System Admin | the same set, plus not found, plus rejects editing an archived row |
| `api.costs.markRenewed` | mutation | `serviceId` | the new `renewalDate` | System Admin | not found; archived; the cycle does not renew; no current renewal date |
| `api.costs.archiveService` | mutation | `serviceId` | `null` | System Admin | not found; already archived |
| `internal.costs.checkRenewalReminders` | internalMutation | none (cron) | `null` | internal | none; a service that is archived, has no renewal date, or whose cycle does not renew is skipped |
| `seed.costServices` | in `convex/seed.ts`, matching the existing reference seeds' shape and guard | none | count created | same as the clan and department seeds | none; re-running creates nothing |

`checkRenewalReminders` writes its `costRenewalNotices` row and then calls `ctx.scheduler.runAfter(0, internal.notifications.dispatch, …)` inside the same mutation, so the record and the send commit together and a retried mutation cannot double send. Notification text: title `Renewal in 14 days: <name>` (or `in 3 days`, or `Renews today`, or `Renewal overdue`), body naming the service, its amount formatted through the shared formatter when recorded, and the date. Audience `{ type: "role", roleType: "system_admin" }`, which `resolveAudience` already supports and which resolves at send time so a System Admin appointed yesterday is included. `createdBy` is the service's own `createdBy`, the pattern `convex/weeklyPrograms.ts:762` already uses for a cron with no acting user.

`listServices` and the per department engagement table return their whole result set rather than paginating, which is deliberate and bounded: the register holds one row per external service (fourteen keys) and the church has thirteen departments. Both bounds are invariants below, not assumptions.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| `recordActivity` | whether to write the activity row | that user's own `userActivity.lastActiveAt` compared against `Date.now() - ACTIVITY_REPORT_THROTTLE_MS` from `packages/shared`. No row means always write. |
| `recordActivity` | whether to write the device row | that device's own `userDevices.lastSeenAt`, judged separately from the activity row, so a second phone within the hour is never skipped (AC-1). |
| `recordActivity` | the device identity | `deviceId` argument, a UUID the mobile client generates once and keeps in AsyncStorage (already a dependency, used by spec 0010's add to calendar). Never derived server side, because the same account on two phones must produce two rows. |
| `recordActivity` | `platform` | `Platform.OS` from React Native, passed by the caller. `android` and `ios` only; the portal client passes no device fields at all, which is what keeps `userDevices` phones only. |
| `recordActivity` | `appVersion` | `Constants.expoConfig?.version` from `expo-constants`, already a dependency. |
| `recordActivity` | behaviour when it fails | the client swallows the error and does not retry within the hour. Activity reporting is never allowed to surface an error or block a screen, and a missed hour costs one data point. The portal reporter mounts inside the `(admin)` layout, which already runs behind the authenticated gate, so there is no unauthenticated or missing `users` row case to handle there. |
| Activity section | "today" boundary | `kampalaDayStart(Date.now())`, the new helper in `convex/calendar.ts`. Not UTC: a Kampala church's day ends at Kampala midnight. |
| Activity section | the 7 and 30 day boundaries | `Date.now()` minus the span, rolling rather than calendar, so the three windows always nest (today inside 7 days inside 30 days). |
| Activity section | each window's count | a range read on `userActivity.by_lastActiveAt` from the boundary, each row's `userId` checked against the deleted set. |
| People section | total accounts, visitors, verified members | a full read of `users` filtered on `deletedAt === undefined`, the same approach `getDashboardStats` already takes, with `users.role` as the visitor against member discriminator. Convex has no count aggregate, so a count is a read. |
| People section | members pending verification | `memberProfiles.by_profileStatus` equality read on `pending_verification`. |
| People section | sign ups in the last 7 and 30 days | `users._creationTime` against the rolling boundaries. SRS's "sign-ups per week" resolved to these two figures, see rationale.md. |
| People section | account deletions | `activityLogs.by_action` equality read on `account.deleted`, counted in full since the figure is to date. Bounded by how many people have ever left, which is small by nature rather than by a time window. |
| Devices section | phones in the window, by platform and version | a range read on `userDevices.by_lastSeenAt` from `Date.now() - 30 days`, grouped in memory. The unit is phones, not people: two phones on one account count twice, which is what the SRS asks for. The platform splits therefore always sum to the total. Versions are sorted descending as strings, which is correct for Expo's zero padded `major.minor.patch` and is stated so nobody expects semantic ordering. |
| Devices section | the two store console links | the `consoleUrl` of the `costServices` rows whose `serviceKey` is `play_console` and `app_store`, read through `by_serviceKey`. Absent when the System Admin has not filled them in, and the section says so rather than linking nowhere. |
| Devices section | the download counts SRS mentions | not produced. An AC-9 gap line naming the SRS's own decision that Phase 01 shows signed in phones instead. |
| Engagement section | the month boundary | `kampalaMonthStart(Date.now())`. Calendar, not rolling, because this is volume compared against a monthly allowance that resets with the calendar. |
| Engagement section | verifications this month | `activityLogs.by_action` on `profile.verified`, range on `_creationTime` from the month boundary. |
| Engagement section | messages per department | `groupMessages.by_department` ranged on `_creationTime` from the month boundary, excluding rows with `deletedAt` set. |
| Engagement section | activities per department | `groupActivities.by_department_start` ranged on `startDateTime` from the month boundary to its end. That index is keyed on the start time, not creation time, which is why the metric is activities **starting** this month rather than created this month; it is also the more useful number, and it needs no new index. |
| Engagement section | the clans line | the same two reads against `by_clan` and `by_clan_start`, summed across clans into one combined figure. The table is per department because departments are what a portal user runs; clans are counted so the totals are not silently short. |
| Engagement section | send backs, claims waiting, radio hours | not produced. Three AC-9 gap lines naming features 9, 17 and 20. |
| Notifications section | notifications sent this month | a read of `notifications` ranged on `_creationTime` through the built in creation time index, since the table's only declared index is `by_audience_type`. |
| Notifications section | recipients reached | the sum of `recipientCount` over those rows, which is why `dispatch` now records it. Rows without the field contribute nothing and the label says the figure counts recorded fan outs. |
| Notifications section | emails sent this month | `activityLogs.by_action` on `email.sent`, ranged from the month boundary, so the read is bounded by one month of email volume rather than by all of it. |
| Notifications section | the email allowance | the `allowanceLimit` of the `costServices` row whose `serviceKey` is `resend`. Shown as "x of y" only when that row carries a limit; otherwise just the count. |
| Notifications section | SMS sent and credit | not produced. An AC-9 gap line naming feature 27. |
| Health section | failed emails in the last 7 days | `activityLogs.by_action` on `email.failed`, ranged from `Date.now() - 7 days`. |
| Health section | storage used and its "as of" time | `platformMetrics.storageBytes` through `formatBytesBinary`, and `computedAt`. |
| Health section | the Sentry link | the `consoleUrl` of the `costServices` row whose `serviceKey` is `sentry`. One link to the organisation, not three per project, which is what SRS §4.3.3's singular wording asks for. |
| `measureStorage` | total bytes and object count | the R2 component's own paginated metadata query, called from the action as a component function rather than through `api.uploads.listMetadata`, because that export is gated by `canManageChurchAdmin` and a cron carries no identity. The component takes the bucket and credentials as arguments, so the action reads the existing `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` Convex env vars and passes them. Pages until the cursor is exhausted, sums `size` treating absent as zero, and calls `saveStorageUsage` only after the last page, so a part way failure saves nothing. |
| `createService` / `updateService` | the stored amount | the `amountMinor` argument, validated as a non negative integer. The portal form converts what the System Admin types into minor units using the shared exponent, so the conversion rule lives in one place. |
| `markRenewed` | the new renewal date | `advanceRenewalDate(renewalDate, billingCycle)` from `packages/shared`, which is also what makes the three reminder stages re-arm, since the notice key carries the date. |
| Costs page | the monthly total per currency | `monthlyContributionMinor` from `packages/shared` applied per row and then summed per `currency` over non archived rows, so each displayed row figure adds up to the displayed total. No cross currency arithmetic exists anywhere in the feature. A row missing a cycle, currency or amount shows "not recorded" and joins no total. |
| Costs page | each row's renewal state | derived at read time from `renewalDate` against today in Africa/Kampala, never stored, so it cannot go stale. |
| `checkRenewalReminders` | which stage, if any, is due today | days between `kampalaDateKey(Date.now())` and `renewalDate`, matched as thresholds against `RENEWAL_REMINDER_STAGES`: at or below 14 fires `t14` if unsent, at or below 3 fires `t3` if unsent, at or below 0 fires `due`. Thresholds rather than equalities, so a missed sweep or a late entered date fires once and late instead of never. |
| `checkRenewalReminders` | whether this notice already went out | a read of `costRenewalNotices.by_service_renewal_stage` for `(serviceId, renewalDate, stage)`, and for `due` a comparison of today's `noticeDate` against the rows found, which also yields the consecutive day count AC-15 caps. |
| `checkRenewalReminders` | who to notify, and as whom | `dispatch` with the existing `{ type: "role", roleType: "system_admin" }` audience, scheduled with `ctx.scheduler.runAfter(0, …)`, attributed to the service's own `createdBy`. |
| `checkRenewalReminders` | where the notification opens | deep link `{ type: "costService", id: serviceId }`. Nothing in `apps/admin` consumes `deepLink` yet, because the web bell is feature 28's to build, so this feature only writes the link and enrols the mapping as a task on feature 28. On mobile, `resolveDeepLinkHref` already returns `null` for an unknown type, which is the right outcome for a portal only notice. |
| Seed | each row's name, key and purpose | the SRS §7 service table, transcribed into the seed as literals against the fourteen `COST_SERVICE_KEYS`. No currency, cycle, plan, amount or renewal date, per AC-16, which is exactly why those four fields are optional. |
| Every cost mutation | the audit entry | `activityLogs` with action `cost.service_added`, `cost.service_updated`, `cost.service_archived` or `cost.service_renewed`, `targetType: "costService"`, `targetId` the service id, and metadata holding the service name plus the names of the fields that changed. Amounts are not copied into metadata, so the audit trail does not become a second, diverging cost record. |

### Key invariants

1. **No fabricated number ever renders.** A value whose source does not exist is an entry in `ANALYTICS_GAPS`, rendered as a sentence. There is no code path from "missing source" to a numeral.
2. **No cross currency arithmetic.** No function in this feature adds, compares or converts amounts in different currencies. The monthly total is always a map keyed by currency.
3. **Money is always a whole number of minor units.** Validated on write, formatted only on display through the shared formatter. No amount is ever stored or computed as a fractional value.
4. **Exactly one `userDevices` row per `deviceId`, and one `userActivity` row per user.** Both upserts read their index first and patch; neither inserts on a hit.
5. **The hourly activity write never touches a document another query subscribes to.** This is why `lastActiveAt` lives in its own table.
6. **The register is bounded.** One row per external service. Nothing in the feature creates a row automatically except the one time reference seed.
7. **Each reminder stage fires at most once per renewal date**, except `due`, which fires at most once per calendar day and at most `OVERDUE_NOTICE_MAX_DAYS` times. Both are enforced by the `costRenewalNotices` key, not by timing.
8. **Every `activityLogs` read is either ranged to a month or a week, or bounded by something small by nature.** `email.sent`, `email.failed` and `profile.verified` are ranged; `account.deleted` is unranged but bounded by how many people have ever left. No read in this feature reads `activityLogs` whole.
9. **An archived service is invisible to the totals and to the sweep**, and still readable.
10. **The renewal state is derived, never stored**, so it cannot disagree with `renewalDate`.
11. **A rendered link is always `https`.** Enforced on write, not on render.
12. **A deleted account leaves no device row and no activity row.**
13. **The nightly storage figure is written only after a complete pass**, so the page never shows a partial sum.

### Security model

Both pages and every function here are System Admin only, which `spec/SRS.md` §3's access matrix states twice (the roles table and the portal page table). Enforcement is layered exactly as `convex/AGENTS.md` requires:

- **Convex, the real guard.** `getPlatformAnalytics` and `listServices` use `getSystemAdminOrNull` and return `null` for any other caller, matching the reactive safe convention the existing `getDashboardStats` follows and spec 0004's cross check found mattered. All five cost mutations use `requireSystemAdmin`, which throws.
- **Route group.** A server layout on `areas-of-service/admin/(system)/` repeats the `system_admin` check and redirects to `/areas-of-service/admin`, per spec 0004's AC-2. This feature creates that layout if spec 0004 has not landed; whichever feature gets there first creates it and the other reuses it.
- **Nav.** The two entries, "Analytics" and "Costs", appear in `AdminSidebar`'s System Admin group, rendered only when the layout's `isSystemAdmin` prop is true, and in `AdminTopBar`'s `MODULE_TITLES` map.

`recordActivity` is the one function any signed in user may call. It writes only the caller's own rows, resolved from `ctx.auth` through `requireUser` and never from an argument, so no caller can report activity for anyone else. Its own 55 minute server side check caps write volume, which is why no separate rate limiter is needed.

Three privacy and safety points. The cost register holds no credentials, only plan names, amounts and console URLs; secrets stay in Convex env vars, per `AGENTS.md`. `consoleUrl` is validated as `https` on write because both pages render it as an anchor, so a `javascript:` value could otherwise execute in a System Admin's browser. And no section of the analytics page names an individual: every figure is a total or a per department total, which keeps it consistent with NF-02 and with the rule RI1-09 states for Radio Insights.

### Screen states

**Analytics page.** Loading shows the section skeletons from `components/ui/Skeletons.tsx`. Offline shows `OfflineBanner` with the last values the subscription held. An error shows `ErrorState` with retry, per spec 0002. A gap line is a muted sentence, never a tile with a dash. The storage figure always carries its "as of" time; if the nightly job has never run, it says "not measured yet" rather than zero. A missing console or Sentry link shows a short "add the console link on the Costs page" note instead of a dead anchor.

**Costs page.** An empty register shows `EmptyState` pointing at the seed and the add button, which only happens if the seed has not been run. A row with no amount, currency or cycle shows "not recorded" rather than a zero, so an unfilled seeded row is visibly unfilled. An overdue row takes the crimson treatment, which `spec/INTERFACE_SPEC.md` reserves for priority and destructive states, and is the only crimson on either page; a row past the overdue notice cap keeps the treatment and gains a quiet "reminders stopped" note, so silence is never mistaken for resolution. A renewing row carries a "record renewal" action. The monthly totals are the only place `Spline Sans Mono` numerals appear at display size.

Both pages use `StatCard`, `DataTable`, `Heading`, `FilterBar` and `Pagination` from `components/ui/`, shadcn primitives from `components/shadcn/` for the add and edit sheet, and `CountUp`, `Reveal` and `Stagger` from `components/motion/` for section entry, short and small per `AGENTS.md`. Both work at phone browser width, per S1-04.

### Configuration required

No new environment variable, credential or third party account. One existing variable set gains a new reader: `internal.analytics.measureStorage` reads `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` directly, because the R2 component's metadata query takes them as arguments rather than reading them itself. They are already set on every deployment per `spec/STORAGE.md`, so nothing new has to be provisioned, but a deployment missing them fails this cron rather than failing silently.

The console and Sentry links are deliberately cost register fields rather than env vars: they are not secret and they change with the church's accounts, not with a deployment.

### Critical test scenarios

- Happy path: a System Admin opens the analytics page and every section with a live source shows a number, while the five gap lines name their owing feature, verifies **AC-4**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.
- Happy path: a signed in phone reports once, then again ten minutes later; one `userDevices` row exists, `lastActiveAt` moved once, and the second call wrote nothing, verifies **AC-1**, **AC-2**.
- Throttle per target: the same account reports from a second phone twelve minutes after the first; the activity row is untouched and a second device row is created, verifies **AC-1**, **AC-2**.
- Nesting: a user active five minutes ago appears in all three activity windows, and one active twelve days ago appears only in the 30 day window, verifies **AC-3**.
- Device reassignment: account A reports from a device, then account B signs in on the same device and reports; one row exists and it points at B, verifies **AC-2**.
- Money: a service at USD 24.99 monthly and one at USD 99.00 annual produce a USD monthly total of 3324 minor units, each row's displayed monthly figure adds up to that total, and a UGX prepaid row is listed with its balance while contributing nothing to either total, verifies **AC-13**.
- Unfilled row: a freshly seeded service with no currency, cycle or amount renders as "not recorded" and joins no total, verifies **AC-13**, **AC-16**.
- Validation: an `annual` service with no renewal date is rejected, a `free_tier` service with one is rejected, `2026-02-30` is rejected, a name differing only in case and trailing space from a non archived row is rejected, a fractional or negative amount is rejected, and a `javascript:` console URL is rejected, verifies **AC-12**.
- Reminder idempotency: the daily sweep runs twice on the same day for a service 14 days out and sends one notice, verifies **AC-14**.
- Reminder catch-up: the sweep does not run on the day a service is exactly 14 days out, then runs the next day; the `t14` notice fires once, late, verifies **AC-14**.
- Reminder re-arming: a service already notified at 14 days has its renewal recorded through `markRenewed`; the date advances by its cycle and the sweep notifies again at the new 14 day mark, verifies **AC-11**, **AC-14**.
- Overdue cap: a service fifteen days past its renewal date has received fourteen daily notices and receives no more, while the page still marks it overdue, verifies **AC-15**.
- Failure case: the nightly storage job fails on its third page; nothing is saved, the page still shows the previous figure with its original "as of" time, and the failure reaches Sentry, verifies **AC-10**.
- Auth: an Administration HOD who is not a System Admin visits both URLs and is redirected to `/areas-of-service/admin`, and direct calls to `getPlatformAnalytics` and `listServices` return `null` while `createService` throws, verifies **AC-17**.
- Deletion: an account with two device rows is deleted; both rows and its `userActivity` row are gone, and no analytics count includes it, verifies **AC-19**.
- Seed: the reference seed runs twice in a row and creates fourteen rows once, with every currency, cycle, amount and renewal date empty, verifies **AC-16**.

## Build plan

Tracer Bullet, per `spec/BUILD-PLAN.md` §1 and the scope header: each slice goes through every layer and is shippable on its own. The whole schema lands in slice 1 as one additive migration rather than being spread across five, because every field and table is additive and inert until something reads it, so splitting it would buy no safety and cost four extra deployments. Slice 1 is the thin thread that proves the route group, the guard, the query shape and one real section before anything else is built on them.

**Slice 1: the thinnest honest thread**
1. [x] The shared contract: `packages/shared/src/constants/costRegister.ts` with its Vitest suite, and the three Africa/Kampala helpers in `convex/calendar.ts`, foundation for **AC-12**, **AC-13**, **AC-3**, **AC-8**
2. [x] One additive schema change: `notifications.recipientCount`, and the `userActivity`, `userDevices`, `costServices`, `costRenewalNotices` and `platformMetrics` tables with their indexes, foundation for every AC
3. [x] The System Admin route group and the Analytics page shell: `areas-of-service/admin/(system)/layout.tsx` with spec 0004's guard if it does not exist yet, `(system)/analytics/page.tsx`, and the sidebar and top bar entries, satisfies **AC-17**, **AC-20**
4. [x] `api.analytics.getPlatformAnalytics` returning the People section and an empty `gaps` list, rendered as `StatCard` tiles, satisfies **AC-4**

**Slice 2: activity and devices, end to end**
5. [x] `api.activity.recordActivity` with its per target throttle and both upserts, satisfies **AC-1**, **AC-2**
6. [x] The mobile reporter: the device id generated once into AsyncStorage, the hook firing on launch and on foreground, wired in `apps/mobile/app/_layout.tsx`, failing quietly, satisfies **AC-1**, **AC-2**
7. [x] The portal reporter: one invisible client component mounted in the `(admin)` layout, firing on mount and on tab focus, satisfies **AC-1**
8. [x] The Activity and Devices sections on the query and the page, with the window labels and the version breakdown, satisfies **AC-3**, **AC-5** apart from the console links
9. [x] Extend spec 0008's `performDeletion` in `convex/accountDeletion.ts` to delete the account's `userDevices` rows and its `userActivity` row, satisfies **AC-19**

**Slice 3: the remaining sections, gaps and all**
10. [x] `recipientCount` written in `convex/notifications.ts:dispatch` from `recipients.length`, which it already computes before the insert, satisfies **AC-7**
11. [x] The Engagement and Notifications sections, including the per department table over the calendar month and the clans line, satisfies **AC-6**, **AC-7**
12. [x] `internal.analytics.measureStorage` and `saveStorageUsage`, reading the `R2_*` env vars and paging the component query, saving only on a complete pass, plus the nightly cron at 02:10 UTC and the Sentry report on failure, satisfies **AC-10**
13. [x] The Health section, and every AC-9 gap line rendered from `ANALYTICS_GAPS`, satisfies **AC-8**, **AC-9**

**Slice 4: the cost register, end to end**
14. [x] `listServices`, `createService`, `updateService`, `markRenewed` and `archiveService` with their validation and their `activityLogs` entries, satisfies **AC-11**, **AC-12**, **AC-18**
15. [x] The reference seed in `convex/seed.ts`, guarded and idempotent like the existing clan and department seeds, satisfies **AC-16**
16. [x] The Costs page: the register table, the per currency monthly totals, the add and edit sheet, the record renewal action, the archived view, satisfies **AC-11**, **AC-13**
17. [x] Point the Devices store links, the Health Sentry link and the Notifications email allowance at their `serviceKey` rows, completing **AC-5**, **AC-7**, **AC-8**

**Slice 5: renewal reminders**
18. [x] `internal.costs.checkRenewalReminders` with the three threshold stages, the `costRenewalNotices` key, the scheduled `dispatch` to the `system_admin` role audience, and the daily cron at 06:30 UTC, satisfies **AC-14**
19. [x] The overdue treatment on the page, the daily repeat capped at `OVERDUE_NOTICE_MAX_DAYS`, and the "reminders stopped" note, satisfies **AC-15**

## Migration plan

**Strategy**: additive, no data transformation.

**Phases**:
1. Push the slice 1 schema change. The one new field is optional and every new table is empty, so nothing existing reads or writes them.
2. Run the reference seed (slice 4) per environment. Safe in production by AC-16, since it writes names, keys and purposes only.
3. Run the nightly storage job once by hand per environment so the Health section has a figure before anyone opens the page.

**Rollback**: revert the commit. The new tables are inert once nothing reads them, and the new field is optional and unread by older code. The one ordering constraint is slice 4's step 17, which makes three sections depend on seeded rows: reverting the seed without reverting those reads leaves three "add the console link" notes rather than an error, which is the intended empty state anyway.

**Risks**: low. No existing data is rewritten and no existing field changes type. The only live data this feature touches is `activityLogs`, which it reads and never writes except through the new cost register entries, and `notifications`, which gains one optional field.

## Consequences

**Positive**:
- The System Admin can see the platform without asking anyone, and can see what it costs, which is the first time either has been true.
- F1-11 is built, which unblocks the active user counts every later analytics surface needs, Radio Insights (feature 32) included.
- Renewals stop depending on somebody remembering. Three notices per service per cycle, an overdue nudge that gives up rather than nagging forever, and a way to record that a renewal happened.
- Money is modelled correctly from the first row: whole minor units, no conversion, per row rounding, totals that cannot drift.
- Each of the five gaps is a named promise rather than a silent blank, so the later features have an obvious slot and the page never lies in the meantime.
- The hourly activity write lands in its own table, so the feature's write traffic invalidates nothing outside the feature.
- Nothing new to operate: no credential, no env var, no third party account, and no native dependency, so the mobile half ships over the air.

**Negative / tradeoffs**:
- Total accounts needs a full read of `users` on every page load. Right at fifty ministers and acceptable for a congregation, but it is a read that grows with the church and will eventually want `@convex-dev/aggregate`.
- The storage figure is up to a day old and the page has to admit it.
- Two sections stay visibly incomplete until Week 5, on the page meant to inspire confidence.
- `userActivity` is a table holding one number per user, which looks like over modelling until you know why it exists. The reason is written into the data model so nobody folds it back into `users`.
- Every signed in session now writes a small mutation up to once an hour. Negligible in cost, but it is new write traffic that did not exist and a client bug could make it noisier than designed, which is why the server does its own check.
- `recipientCount` is optional, so the recipient total is honest only about notifications sent after this feature. Harmless now, since nothing is in production, and permanently a small asterisk.
- The email count undercounts, because `logSend` cannot write an audit row for an address with no `users` row. The label says so, which is the honest fix, not a satisfying one.
- The reminder sweep is only as good as the renewal dates somebody typed. A wrong date gives confident, wrongly timed reminders, which is a failure mode the page itself cannot detect.
- The renewal notification writes a deep link nothing on the web reads yet. Correct to write, but it means the push lands on a System Admin's phone and opens nothing until feature 28 builds the bell.

**Neutral**:
- `serviceKey` makes the cost register load bearing for three analytics sections. That is a deliberate coupling and the reason the field exists, but it does mean an unfilled register degrades the analytics page rather than just the costs page.
- `currency` and `billingCycle` are optional, which is what lets the seed assert nothing. The cost is that AC-12's rules are conditional and AC-13 has a "not recorded" branch.
- Five of the new indexes exist only to serve this one page. Cheap, and the alternative is scans.
- Two kinds of time window now coexist: rolling for activity, so the windows nest, and Africa/Kampala calendar month for volume, because allowances reset with the calendar. Both are labelled on the page, and the distinction is worth knowing before adding a seventh number.
- The Engagement activity figure counts activities starting this month rather than created this month, because that is what the existing index supports and the more useful question anyway.
- This feature may create `areas-of-service/admin/(system)/layout.tsx` ahead of spec 0004's own milestone. Both specify the same guard; whichever lands first owns the file.

## Follow-up

- [ ] Each later feature owes one task to fill its analytics slot: feature 9 (profile send backs), 17 (claims waiting), 20 (radio listening hours), 27 (SMS sent and credit). Add that task to each of those scope rows when they are designed, and remove its entry from `ANALYTICS_GAPS` as it lands.
- [ ] Feature 28 owes the web bell's `deepLink` to URL mapping, including the `costService` type this feature introduces. Nothing in `apps/admin` consumes `deepLink` today, so the renewal notice's link is written but unresolved until then.
- [ ] Un-archiving a cost service is not in scope. Decide whether it is needed before the register has been maintained for a year; the data supports it (clear `archivedAt`), only the mutation is missing.
- [ ] `spec/SRS.md` §4.3.3 says "sign-ups per week" and "phones with the app signed in". Both are rendered as the nearest honest figures (last 7 and 30 days; phones seen in 30 days), explained in [rationale.md](rationale.md). No amendment is needed, but confirm the reading is what Andrew intended before `/check verify`.
- [ ] `AGENTS.md` tells agents to load the `klt-cyber-web-ui` and `klt-cyber-brand` skills, and neither is installed in `.claude/skills/`. Either install them or correct `AGENTS.md`, because the web half of this feature is exactly the work those rules govern.
- [ ] Root `AGENTS.md` has no `## Agent skills` section, so the three skills that are installed and relevant here (`convex`, `convex-reviewer`, `shadcn`) are not recorded anywhere a later agent would find them. They belong in root `AGENTS.md`, since all three apply project wide.
- [ ] If the congregation ever makes the full `users` read hurt, the fix is `@convex-dev/aggregate` for the people and activity counts, not a nightly snapshot, which would reintroduce the staleness this spec rejected.
