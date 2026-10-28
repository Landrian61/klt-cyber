# 0013. Notification targeting

**Date**: 2026-10-28
**Status**: In Progress

## Summary

Today an appointment is announced to the whole church, a removed role is mostly silent, an announcement pushes again every time it is republished, an HOD never hears that someone asked to join, and tapping an expired announcement or an appointment notice lands on "not found" or Home. This spec fixes who each of those notices reaches and where a tap lands, in place, on the existing `notifications.dispatch` pipeline (the one function every notice goes through). Nothing about the delivery machinery changes: no new tables, two optional fields, one small migration, two new mobile screens. Stories whose trigger does not exist yet (send back, mentorship confirmation, the web bell) are left to the features that build those triggers, with the contract they should call written down here.

## Requirements

**User stories**:
- As a newly appointed HOD, delegate or clan elder, I am told privately of my appointment and can open a screen that explains the role and how to reach the web portal. (F4-03, F4-13)
- As a verified member of a department or clan, I am told when it gets a new leader, and nobody outside it is. (F4-03)
- As a person whose role ends, for any reason, I am told privately, once. (F4-04, F3-10)
- As an Administration reviewer, I am alerted when a profile is submitted. (F4-05)
- As an HOD, I am alerted when someone asks to serve in my department, at the moment I can act on it. (F4-07)
- As a member, my verification notice still arrives by push, in app and email, and opens My Profile. (F4-06, F4-13)
- As a user, an announcement pushes to me only the first time it is published. (F4-01)
- As a user, tapping a notice about something that has ended still opens it, marked as ended. (F4-12, M3-04)

**Acceptance criteria**:
- **AC-1**: Appointing someone as HOD, delegate (`department_admin`) or clan elder sends N13 to the appointee only, with `kind: "N13"` and `deepLink { type: "role_assignment", id: <roleAssignmentId> }`. A System Admin appointment sends N13 to the appointee and nothing else. (F4-03)
- **AC-2**: The same appointment sends N14 (`kind: "N14"`, `deepLink { type: "new_leader", id: <roleAssignmentId> }`) to a frozen `users` audience. For HOD or delegate that is the department's `active` roster rows whose profile is `verified`. For clan elder it is the clan's `verified` member profiles. In both cases the appointee and deleted accounts are left out. The list is resolved once, in the appointing mutation, and never again. (F4-03, N14)
- **AC-3**: No notification with `deepLink.type` `role_assignment` or `new_leader` is ever addressed to `{ type: "all" }`. After the migration, historical appointment rows that were sent to everyone appear only in the appointee's notification centre. (F4-03 "Never all users")
- **AC-4**: Appointing a person to a role, with the same scope, that they already hold `active` is a no op. That includes re-appointing a department's sitting HOD, or a clan's sitting elder, to the same seat. The check runs before either cardinality rule. The existing `roleAssignmentId` comes back, and no revoke, no insert, no `activityLogs` row and no notification happens.
- **AC-5**: Every path that moves an `active` role assignment to `revoked` goes through `endRoleAssignment`. Unless suppressed, it schedules one private N15 (`kind: "N15"`) to the holder per assignment ended. Like every notice, this is best effort: scheduled after the write, never resent. The notifying paths are: `revokeRole` (and `removeDelegate` through it), a sitting clan elder replaced, a department's HOD replaced, and a person's HOD role in another department ended by "one HOD role per person". `removeDelegate` no longer sends its own copy. The roster removal cascade suppresses N15 (AC-6), and account deletion (`convex/accountDeletion.ts`) suppresses it too, because a deleted person is never messaged. N15 copy: the title is "Your role as <role> for <scope> has ended" (or "Your role as <role> has ended" with no scope). The body is "Someone else now holds this role." for the two replacement reasons, and "Speak to Administration if this looks wrong." otherwise. The actor is never named. (F4-04, F3-10)
- **AC-6**: When `removeDepartmentMember` ends a roster place and that cascade revokes one or more roles in the same department, the person receives one combined notice (kind `N12`) naming both the roster place and the roles. They receive no separate N15. With no cascaded role, the existing N12 is unchanged.
- **AC-7**: Revoking an assignment that is already `revoked` sends nothing. `endRoleAssignment` re-checks `status === "active"` itself, rather than relying on each caller.
- **AC-8**: Profile submission sends N04 (`kind: "N04"`) to the Administration department's active HOD and delegates, deduplicated. When that set is empty, it goes to active System Admins instead, so a submission is never unseen. The resolver is one exported helper that features 9 (resubmission) and 29 (N07) call. (F4-05)
- **AC-9**: The department's active HOD receives N10 (`kind: "N10"`, `deepLink { type: "department_claim", id: <departmentId> }`) once per claim, when the claim becomes actionable. Today the only claim writer is profile submission, which always writes an unverified profile, so the live trigger is `verifyProfile`. It fires for each of that person's `pending_claim` rows, with the HOD resolved at verification time. A claim on a department the claimant themselves leads is skipped. `notifyClaimActionable` is exported so feature 9 can call it when a verified member adds a claim. A department with no active HOD gets nothing, and the claim still waits on the roster. N10 copy: the title is "Someone asked to serve in <department>", and the body is "<claimant> wants to join the <department> roster." (F4-07)
- **AC-10**: `verifyProfile` still sends N05 by push and in app (`kind: "N05"`, deep link `profile`) and the verified email, unchanged in wording. Calling `verifyProfile` on a profile that is already `verified` returns early with no write and no side effects, so N05, the email and N10 are never sent twice. (F4-06)
- **AC-11**: An announcement pushes (N21) only on its first transition to `published`, through either `createAnnouncement` with `status: "published"` or `publishAnnouncement`. `firstPublishedAt` is set at that moment and never changed or cleared. Disabling and publishing again sends no push. After the backfill, republishing an announcement first published before this feature sends no push. (F4-01, A6-02)
- **AC-12**: `announcements.getAnnouncement` reads one announcement by id. A `published` row opens with its full content whatever its window. When `endDate` is before the device's current time, the screen shows an "This announcement has ended" banner above the content. A `draft` (disabled), `archived` or missing row, or an unauthenticated caller, gets `null`, and the screen shows "This announcement is no longer available". (F4-12, M3-04)
- **AC-13**: The event and activity detail screen shows a "This has ended" marker when `endDateTime` is before the device's current time. A cancelled item shows only its existing cancelled notice, never both. (F4-12)
- **AC-14**: The `role_assignment` deep link opens `/role-notice`. For the appointee it shows the role, its department or clan, the role's short description, and an "Open the web portal" button that opens `EXPO_PUBLIC_PORTAL_URL`. When the assignment is now `revoked`, it shows "This role has ended" and no button. (F4-13)
- **AC-15**: The `new_leader` deep link opens `/role-notice` in member view: "<name> is now the <role> for <scope>", with no portal button. It is readable only by the appointee, or by a caller who appears in the `userIds` of the notification it was opened from. Anyone else gets the "no longer available" state, as does a tap with no notification id (an older push), and a notice whose holder's account has since been deleted. The appointee view never needs the notification id.
- **AC-16**: The `profile_review`, `department_claim` and `hod_notice` deep links open `/portal-work`, which shows what is waiting (copy keyed by deep link type) and the same portal button. Unknown deep link types still land on Home.
- **AC-17**: A notice whose resolved recipient list is empty (N14 to an empty roster, N10 to a department with no HOD, N04 with no reviewer at all) is not dispatched. No `notifications` row is written.
- **AC-18**: Every notification whose call site this feature changes carries `kind`, taken from the shared `NotificationKind` enum. Call sites it does not touch (for example `hodNotices.ts`) are left to feature 28.
- **AC-19**: `convex/notificationTargeting.test.ts` asserts the exact recipient set for AC-1, AC-2, AC-5 (each path, plus account deletion sending nothing), AC-6, AC-8 (including the fallback and the dedupe), AC-9 (through `verifyProfile`, and `notifyClaimActionable` called directly), AC-11, and the no ops of AC-4 (including the sitting HOD), AC-7, AC-10's second verify and AC-17.

## Decision

**Chosen option**: Option 1: fix in place on the existing dispatch pipeline.

Keep `notifications.dispatch` and its five audience types exactly as they are. Correct each call site's audience, put the two notice families that had several hand written copies (role ended, reviewer alert) behind one helper each, add an optional `kind`, add `firstPublishedAt`, and add two read only mobile screens plus one direct read query.

**Implementation skills**: `convex` (`.claude/skills/convex/`) for the backend, `klt-cyber-brand` for the two mobile screens (per `AGENTS.md`), `mobile-frontend-design` (`.claude/skills/mobile-frontend-design/`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (additive only, both fields optional):

| Table | Field | Type | Notes |
|---|---|---|---|
| `announcements` | `firstPublishedAt` | `number`, optional | Set once on the first transition to `published`. Never cleared. Its presence means "N21 already sent". |
| `notifications` | `kind` | `NotificationKind`, optional | The SRS §5 catalogue code (`"N04"`, `"N05"`, `"N10"`, `"N12"`, `"N13"`, `"N14"`, `"N15"`, `"N21"`, …). Optional because older rows and untouched call sites have none. Feature 28 makes it universal and maps codes to mute categories. |

No new tables and no new indexes. N14 rides the existing `users` audience. The deep link types `role_assignment` (already sent, now routed), `new_leader` (new) and `department_claim` (new) are plain strings on the existing `deepLink.type`.

**Shared contract** (`packages/shared/src/constants/notifications.ts`, with a test):
- `NOTIFICATION_KINDS` and the `NotificationKind` type, the codes N01 to N46 from SRS §5.
- `ROLE_COPY: Record<roleType, { label: string; description: string }>`, using the SRS words: "HOD", "delegate", "clan elder", "System Admin". The label replaces `ROLE_LABEL` in `convex/roles.ts` ("Department Admin" becomes "delegate").
- `PORTAL_WORK_COPY: Record<"profile_review" | "department_claim" | "hod_notice", { title: string; body: string }>`.

**Server helpers** (new `convex/lib/roleNotices.ts` and `convex/lib/reviewerNotices.ts`):
- `endRoleAssignment(ctx, row, { actorId, reason?, note?, suppressNotice? })`: the one way an `active` assignment becomes `revoked`. It returns without doing anything when the row is not `active` (AC-7). Otherwise it patches the row, writes the `role.revoked` log (keeping today's `reason` values, `replaced_clan_elder`, `replaced_department_hod`, `replaced_person_hod` and `roster_removal`, with none for a plain revoke), and schedules N15 to `row.userId` unless `suppressNotice` is true. Notifying is the default so a future revoke site cannot forget it. The roster cascade passes `suppressNotice: true` and sends the combined N12 itself (AC-6). Account deletion passes `suppressNotice: true` and keeps its own patch fields (`revokedBy` the deleted user, `note` cleared, `revokedAt` the deletion time) through the helper's options.
- `notifyAppointment(ctx, assignment, actorId)`: N13 to the appointee, then for scoped roles resolves and dispatches N14 (AC-1, AC-2, AC-17).
- `resolveAdministrationReviewerIds(ctx)`: Administration HOD and delegates, deduplicated, falling back to System Admins (AC-8). It sits beside the existing `getAdministrationAuthorityUserIds`, which is unchanged because it also gates access.
- `notifyClaimActionable(ctx, membership, actorId)`: N10 to the department's active HOD (AC-9, AC-17).
- `dispatch` gains `kind: v.optional(notificationKindValidator)` and writes it to the row. `notificationCommon` passes it through.

**State transitions**:
- Role assignment: `active → revoked` only through `endRoleAssignment`. Appointing an already `active` identical assignment is not a transition (AC-4).
- Announcement first publish: `firstPublishedAt` goes from unset to set exactly once. Status still moves freely among `draft`, `published` and `archived`.
- Claim alert: a `pending_claim` row is "actionable" once its claimant's profile is `verified`. The alert fires on whichever of the two events (claim written, profile verified) happens second.

**API surface**:

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `announcements.getAnnouncement` | query | `announcementId: Id<"announcements">` | announcement with resolved cover URL, or `null` | signed in (else `null`) | none, missing or hidden returns `null` |
| `roles.getRoleNotice` | query | `roleAssignmentId: Id<"roleAssignments">`, `notificationId?: Id<"notifications">` | `{ view: "appointee" \| "member", roleType, scopeName?, holderName, active }` or `null` | appointee, or a caller in that notification's `users` audience whose `deepLink.id` equals `roleAssignmentId` | none, unauthorized returns `null` (no existence probe) |
| `notifications.dispatch` | internal mutation | adds `kind?` | unchanged | internal | unchanged |
| `notificationTargetingMigration.backfillFirstPublishedAt` | internal mutation | none | `{ patched }` | internal (CLI) | none |
| `notificationTargetingMigration.retargetAppointmentNotices` | internal mutation | none | `{ patched }` | internal (CLI) | none |
| `notificationTargetingMigration.verify` | internal query | none | `{ announcementsMissing, appointmentRowsToAll }` (both 0 when done) | internal (CLI) | none |

Changed mutations, no signature change: `roles.assignRole`/`assignRoleCore`, `roles.revokeRole`/`revokeRoleCore`, `departmentMemberships.removeDepartmentMember`, `departmentMemberships.removeDelegate`, `memberProfiles` submission (the claim write and N04), `memberProfiles.verifyProfile`, `announcements.createAnnouncement`, `announcements.publishAnnouncement`.

Mobile:
- `apps/mobile/lib/notification-links.ts`: `resolveDeepLinkHref(deepLink, notificationId?)`. `role_assignment` and `new_leader` map to `/role-notice?id=<id>&n=<notificationId>`. `profile_review`, `department_claim` and `hod_notice` map to `/portal-work?type=<type>`. Both callers (`notifications.tsx`, `_layout.tsx`) already hold the notification id and pass it.
- New `apps/mobile/app/role-notice.tsx` and `apps/mobile/app/portal-work.tsx`.
- `announcement-detail.tsx` switches from `listActiveAnnouncements` to `getAnnouncement` and adds the ended banner. `item-detail.tsx` adds the ended marker.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| N13 / N14 / N15 copy | appointee name | `users.firstName` + `lastName`, else `users.email` (today's rule in `roles.ts`) |
| N13 / N14 / N15 / role notice | role label and description | `ROLE_COPY[roleType]` in `packages/shared` |
| N13 / N14 / N15 / role notice | scope name | `departments.name` or `clans.name`, by the assignment's `departmentId` / `clanId` |
| N14 | department recipients | `departmentMemberships` `by_departmentId_status` (`active`), then `memberProfiles.profileStatus === "verified"`, then not `users.deletedAt`, then minus appointee |
| N14 | clan recipients | `memberProfiles` `by_clanId_profileStatus` (`verified`), then not `users.deletedAt`, then minus appointee |
| N04 | reviewers | `roleAssignments` `by_departmentId` (Administration, `hod` / `department_admin`, `active`), falling back to `by_roleType` `system_admin` `active` |
| N10 | the HOD | `roleAssignments` `by_departmentId`, `roleType: "hod"`, `active` (at most one, by the existing cardinality rule) |
| N10 copy | claimant name, department name | `users.firstName` + `lastName`, else `users.email`; `departments.name` |
| N15 copy | which body line | the `reason` passed to `endRoleAssignment` (a `replaced_*` reason, or anything else) |
| N10 at verification | the person's pending claims | `findLiveMemberships` in `convex/lib/departmentMembership.ts`, filtered to `pending_claim` |
| N21 gate | already published? | `announcements.firstPublishedAt` |
| `firstPublishedAt` | the value | `Date.now()` in the publishing mutation. Backfill: the earliest `activityLogs` row with `action` `content.announcement_published` or `content.announcement_created` with `metadata.status: "published"` for that `targetId`, else the row's `_creationTime` |
| Announcement ended banner | is it ended? | derived on the device: `endDate < Date.now()` |
| Event / activity ended marker | is it ended? | derived on the device: `endDateTime < Date.now()` from the existing `getEvent` / `getActivity` result |
| Role notice | still active? | `roleAssignments.status` |
| Role notice member view | may this caller read it? | the `notifications` row named by `notificationId`: `audience.type === "users"`, includes caller, `deepLink.id === roleAssignmentId` |
| `notificationId` on the route | the value | push `data.notificationId` (already sent, `_layout.tsx`) or the in app row's `_id` (`notifications.tsx`) |
| Portal button | the URL | `EXPO_PUBLIC_PORTAL_URL` (already in every EAS profile in `apps/mobile/eas.json`) |
| Portal work screen | what is waiting | `PORTAL_WORK_COPY[deepLink.type]` |
| `kind` | the code | a literal at each call site, typed by `NotificationKind` |

**Key invariants**:
1. No appointment or new leader notice is ever addressed to `all` (AC-3).
2. Any `active → revoked` transition of a role assignment goes through `endRoleAssignment`. A grep for `status: "revoked"` across `convex/` finds it only inside that helper.
3. One ended role means at most one private notice. The cascade sends one notice, never N12 plus N15, and account deletion sends none (AC-5, AC-6).
4. `firstPublishedAt` is only ever written when it is unset.
5. Frozen audiences are resolved inside the mutation that caused them, so they reflect the roster at the moment of the event.
6. A notice with zero recipients writes no row (AC-17), so `recipientCount` analytics never count empty sends.

**Security model**:
- No new writes are exposed to clients. Every changed mutation keeps its existing authorization unchanged.
- `getRoleNotice` returns `null` for anyone who is neither the appointee nor a listed recipient of the referenced notification. It never distinguishes "does not exist" from "not yours". Member view never returns anything beyond holder name, role and scope, which that recipient was already told in the push.
- `getAnnouncement` hides `draft` and `archived` rows, keeping an admin's takedown in force even for someone holding an old link.
- N15, combined N12 and N13 are private: always a single user `users` audience.
- No PII leaves the existing tables. No compliance scope is triggered.

**Configuration required**: none new. `EXPO_PUBLIC_PORTAL_URL` already exists.

**Critical test scenarios**:
- Happy path: the Administration HOD appoints a delegate in Media. The delegate gets N13. Media's verified roster, minus the delegate, gets N14. An unrelated member gets neither, and their `listMyNotifications` holds neither. Verifies **AC-1**, **AC-2**, **AC-3**.
- Replacement: appointing a new HOD to a department with a sitting HOD sends N15 to the old HOD, N13 to the new one, and N14 to the roster, each exactly once. Verifies **AC-5**.
- Cascade: removing a delegate from the Media roster sends exactly one notice (combined N12) and no N15. Deleting an account that holds a role sends no N15. Verifies **AC-5**, **AC-6**.
- No ops: re-appointing the same elder to the same clan, re-appointing a sitting HOD to their own department, revoking an already revoked row, and verifying an already verified profile all write nothing and send nothing. Verifies **AC-4**, **AC-7**, **AC-10**.
- Reviewer fallback: with no Administration leader, a submission reaches System Admins. With one, System Admins get nothing. Verifies **AC-8**.
- Claim timing: an unverified member's claim alerts the HOD only when `verifyProfile` runs. `notifyClaimActionable` called directly on a verified claimant's claim alerts at once (feature 9's future path). A department without an HOD alerts nobody and writes no row. Verifies **AC-9**, **AC-17**.
- First publish: publish, disable, publish again sends exactly one N21. A backfilled row republished sends none. Verifies **AC-11**.
- Permission: a member who was not a recipient calls `getRoleNotice` with someone else's assignment and notification id and gets `null`. Verifies **AC-15**.

## Build plan

Tracer Bullet: each slice runs from the server notice to the screen a tap opens, and adds its own cases to `convex/notificationTargeting.test.ts` as it lands (AC-19).

**Blocker before slices 3 and 4 merge:** the `spec/SRS.md` §5 amendment in Follow-up (the N04 and N07 fallback, and the combined N12). SRS wins, so those two slices contradict it until the developer signs the amendment off.

1. **The thinnest thread, a private appointment notice that opens a real screen.** The shared `notifications.ts` contract (`NotificationKind`, `ROLE_COPY`, `PORTAL_WORK_COPY`) with its Vitest test. The additive schema (`notifications.kind`, `announcements.firstPublishedAt`). `dispatch` and `notificationCommon` carrying `kind`. `notifyAppointment` sending N13 to the appointee only (replacing the `all` dispatch in `assignRoleCore`). `getRoleNotice` (appointee view). `/role-notice`, and `resolveDeepLinkHref` taking `notificationId`. Satisfies **AC-1**, **AC-14**, **AC-18**, part of **AC-3**.
2. **The group hears about its new leader.** N14 frozen audience resolution, the empty list skip, the AC-4 no op check at the top of `assignRoleCore`, and the member view of `getRoleNotice` and `/role-notice`. Satisfies **AC-2**, **AC-4**, **AC-15**, **AC-17**.
3. **Every ended role is told, once.** `endRoleAssignment`, and rewiring all six revocation writes through it: `revokeRoleCore`, elder replaced, department HOD replaced, and the person's other HOD role in `roles.ts`, the roster cascade in `departmentMemberships.ts`, and account deletion in `accountDeletion.ts` (suppressed). The combined N12 in `removeDepartmentMember`. Deleting the N15 copy in `removeDelegate`. Satisfies **AC-5**, **AC-6**, **AC-7**.
4. **Reviewers and HODs hear about work they can act on.** `resolveAdministrationReviewerIds` with the fallback, wired into submission. `notifyClaimActionable`, exported and called from `verifyProfile` for pending claims. The already verified early return in `verifyProfile`. `kind: "N05"` on verification. `/portal-work` and its three resolver cases. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-16**.
5. **Announcements push once and open after they end.** The `firstPublishedAt` gate in `schedulePublishNotification`'s two callers. `getAnnouncement`. `announcement-detail.tsx` on the direct read with the ended banner and the unavailable state. `notificationTargetingMigration.ts` (both backfills plus `verify`). Satisfies **AC-11**, **AC-12**, rest of **AC-3**.
6. **Ended events and activities read as ended.** The marker in `item-detail.tsx`, with cancelled taking precedence. Satisfies **AC-13**.

## Migration plan

**Strategy**: additive schema, then an idempotent one off backfill.
**Phases**:
1. Deploy the optional fields and the new code together. Until the backfill runs, an announcement published before this deploy has no `firstPublishedAt`, and republishing it would push once more. That window lasts as long as step 2 takes.
2. Run `pnpm exec convex run notificationTargetingMigration:backfillFirstPublishedAt` and `…:retargetAppointmentNotices` on each deployment (dev, then staging, then prod, each with the developer's go ahead).
   - **Backfill:** sets `firstPublishedAt` on every `published` or `archived` row, and on every `draft` row with a publish entry in `activityLogs`.
   - **Retarget:** patches every `notifications` row whose `deepLink.type` is `role_assignment` and whose audience is `all` to `{ type: "users", userIds: [<the assignment's userId>] }`. A row whose holder has since deleted their account is retargeted the same way, which is harmless because a deleted account never reads it. Archived announcements are backfilled whether or not they were ever published, since archived is terminal and can never republish.
3. Run `…:verify` and confirm both counts are 0.

**Rollback**: revert the code commit. Both fields are optional and ignored by the old code. Retargeted rows stay narrowed, which is the desired state anyway.
**Risks**: a `draft` row created and published before audit logging existed would be missed by the backfill and could push once on its next publish. Accepted: logging predates every live announcement on staging and prod, which `verify` will show.

## Consequences

**Positive**:
- The SRS principle "notify only the people concerned" holds for every leadership notice. Today it breaks on every appointment.
- One function owns ending a role, so a future revoke path cannot forget the notice.
- `kind` gives feature 28 (muting) and the analytics page a real category instead of guessing from deep link strings.
- No tap on a notice this feature touches ends on "not found" or an unexplained Home.

**Negative / tradeoffs**:
- The frozen N14 list means a person who joins the roster an hour later never sees that notice. This is intended, and it differs from how department messages behave (those resolve live).
- The member view's authorization depends on the notification id riding the route. A tap from a push delivered before `notificationId` was added to push data gets "no longer available" for N14. Only the appointee view works without it.
- Two more mobile screens to keep on brand, and the reviewer resolver now differs from the access check it sits beside (a deliberate split that a reader could mistake for drift; the doc comments must say why).
- The N04 fallback to System Admins is not in SRS §5 and needs an SRS amendment.

**Neutral**:
- Web bell (channel B) for N04, N10 and N13 is still owed to feature 28. The rows exist, so the bell reads them when it lands.
- `ROLE_LABEL`'s "Department Admin" becomes "delegate" in notice copy, matching the SRS.

## Follow-up

- [ ] **Blocker for slices 3 and 4:** amend `spec/SRS.md` §5. N04 and N07 fall back to System Admins when Administration has no HOD or delegate, and a roster removal that ends a role sends one combined notice (N12) instead of N12 plus N15. SRS wins until amended.
- [ ] Feature 9 (profile lifecycle): send back must call `dispatch` with `kind: "N06"`, `audience` the visitor only, deep link `profile`, the reason in the body, plus the send back email. Resubmission must reuse `resolveAdministrationReviewerIds` with `kind: "N04"`. A verified member adding a department claim after verification must call `notifyClaimActionable`.
- [ ] Feature 29 (mentorship confirmation): N07 reuses `resolveAdministrationReviewerIds` with `kind: "N07"`.
- [ ] Feature 28 (settings and web bell): make `kind` required on every `dispatch` call, map kinds to the SRS §4.5 mute categories (N14 belongs to "Department and clan messages and activities"), and add channel B for N04, N10 and N13.
- [ ] Feature 18 (Administration core): event audiences (A5-02) remain there. N16 to N18 still go to `all` until then.
- [ ] Spec 0009's follow-up: a `programOccurrence` deep link was suggested for feature 10. Deliberately not taken here, since no story in this row needs it. Carry it to whichever feature next touches program notices.
