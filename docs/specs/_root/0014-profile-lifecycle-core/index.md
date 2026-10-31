# 0014. Profile lifecycle core

**Date**: 2026-10-30
**Status**: In Progress

## Summary

The path from visitor to member is only half built. A reviewer can verify a profile but cannot send one back, a waiting visitor cannot touch the submission they already made, a verified member can change eight fields out of about thirty, and a person's name lives in two places that quietly drift apart. This spec closes those gaps: a third profile state (`sent_back`) with a written reason, one state aware edit mutation that serves pending visitors, sent back visitors and verified members alike from both apps, self service control of Areas of Service and clan, one source of truth for name and photo, and the two known bugs (mentorship always reading "Completed", spouse search leaking email addresses). Everything on the data side is additive, so nothing stops working while it lands.

## Structure

This is an umbrella spec. Each child is buildable on its own and carries its own design detail.

- [0014-review-lifecycle.md](0014-review-lifecycle.md): the new `sent_back` state, the send back mutation with its reason and notices, editing while pending, resubmission and the "Resubmitted" marker, the stale verify guard, and the reviewer's waiting list. Supports F2-03, F2-05, A2-02, A2-03. Covers AC-1 to AC-10.
- [0014-self-service-editing.md](0014-self-service-editing.md): one edit mutation replacing the eight field one, row scoped children and leadership mutations, the mentorship gate, the identity mirror that ends name and photo drift, and the directory sharing field. Supports F2-06, F2-09, F1-07, F2-01. Covers AC-11 to AC-18.
- [0014-service-and-clan.md](0014-service-and-clan.md): adding, withdrawing and leaving an Area of Service, changing clan with both elders told, and the clan copy for a member who has none. Supports F2-07, F2-08, F2-16, F2-10. Covers AC-19 to AC-25.
- [0014-copy-and-fixes.md](0014-copy-and-fixes.md): one reviewer name everywhere, no membership language before verification, and the two bugs. Supports F2-02, A2-05, F2-11, F2-12. Covers AC-26 to AC-29.

## Requirements

**User stories**:
- As a visitor whose profile is waiting, I fix a detail I got wrong without having to ask anyone.
- As an Administration reviewer, I send a profile back with a written reason instead of correcting it myself or verifying something I do not believe.
- As a visitor whose profile came back, I read why in plain words, change what was asked, and send it again.
- As an Administration reviewer, I see which profiles are resubmissions and what I asked for last time, and I can still find the ones I sent back.
- As a verified member, I keep every detail of my profile current from my phone or from the portal, and both show me the same fields.
- As a verified member, I join or leave an Area of Service and change my clan myself, and the leaders it affects are told.
- As anyone looking at a person anywhere in either app, I see the same name and the same photo.
- As a visitor linking my spouse, I find them by name without being shown anyone's email address.

**Acceptance criteria** (the contract, each independently checkable):

Review lifecycle
- **AC-1**: `memberProfiles.profileStatus` accepts `sent_back` alongside `pending_verification` and `verified`, and the table gains optional `sentBackReason`, `sentBackBy` and `sentBackAt`. All additions are optional or additive, so every live row stays valid with no migration. The reason's minimum and maximum lengths live in `packages/shared` with a unit test.
- **AC-2**: An Administration reviewer sends a profile back with a required written reason within those bounds. The row becomes `sent_back`, the three fields are set, an `activityLogs` row `profile.sent_back` is written carrying the actor and the affected user, and the profile leaves the review queue.
- **AC-3**: Sending back notifies the person by push, in app and email (N06), all three carrying the reason. Email reuses the existing `emails.sendProfileSentBack` action and `profile_sent_back` template, which are built today and called by nothing.
- **AC-4**: A person whose profile is `sent_back` sees the reason in the app and reopens their submission. Saving it returns the row to `pending_verification`, keeps `sentBackAt` and `sentBackReason`, writes `profile.resubmitted`, and alerts the Administration reviewers again (N04, which the SRS catalogue already names "Profile submitted or resubmitted").
- **AC-5**: A `pending_verification` row with `sentBackAt` set shows in the review queue marked "Resubmitted", with the earlier reason visible to the reviewer. No counter and no extra field carry this; it is derived from the row.
- **AC-6**: A person whose profile is `pending_verification` or `sent_back` edits everything they submitted, through one `memberProfiles.resubmitProfile` mutation taking the same argument shape as `submitProfile`: profile fields plus `children`, `leadershipEntries` and `departmentIds`. It reconciles children and leadership rows by id so no row is deleted and recreated, applies claim changes without the verified gate `addMyAreaOfService` imposes, bumps `updatedAt` once for the whole save, and performs the resubmission in AC-4 when the row was `sent_back`. Reviewers read the row live, so they always see the latest version.
- **AC-7**: `verifyProfile` and `sendProfileBack` both take the `updatedAt` the reviewer's screen was showing and reject with `PROFILE_STALE` when the stored `updatedAt` is strictly newer. The portal distinguishes the two causes: the owner edited (tell the reviewer to look again) or another reviewer acted first (tell them that instead), decided by comparing the stored `sentBackAt` against the `updatedAt` they held. Every member owned write that a reviewer could be looking at bumps `memberProfiles.updatedAt`, including the children, leadership, clan, sharing and claim mutations, so the guard covers the whole submission and not only the profile row's own fields. Nothing a person typed is ever silently replaced by an older value a reviewer was holding.
- **AC-8**: Administration sees a separate list of profiles sent back and waiting on their owner, showing who, when, by whom and the reason, read from `by_profileStatus` on `sent_back`. Both reviewer lists sort oldest first by the time the row entered its current state (`sentBackAt` where set, else `_creationTime`), so the longest wait is at the top. `sentBackBy` is resolved to a name through `displayName` from `convex/lib/roleNotices.ts`, falling back to "a reviewer" when that account has been deleted.
- **AC-9**: Sending back a `verified` profile is rejected. Sending back a profile already `sent_back` replaces the reason and writes a fresh log row and a fresh notice, so a reviewer may correct what they asked for.
- **AC-10**: Only Administration authority and System Admin may send a profile back or read the sent back list, enforced in the Convex function through the same gate `verifyProfile` already uses. Any other caller is rejected by the server, not merely hidden in the portal.

Self service editing
- **AC-11**: One `profile.updateMyProfile` mutation replaces today's eight field version and accepts the full editable profile field set **except `clanId`**, which only `changeMyClan` writes, so that mutation's elder notices and audit entry can never be skipped. It reads `profileStatus` from the stored row, never from the client, and branches: `verified` saves immediately and logs `profile.edited`; `pending_verification` saves and logs. A `sent_back` row is saved through `resubmitProfile` (AC-6), not here, so a one field save can never resubmit by accident. Clearing an optional field is explicit: a `clearFields` argument naming the fields to unset, restricted by a literal union to the genuinely optional ones, because an omitted value means "unchanged" and a member must still be able to remove a phone number or an address.
- **AC-12**: Mobile and the portal's Settings page edit the same field set through that one mutation, so the "today only eight fields are editable" gap in F2-09 ends and the two surfaces cannot drift apart.
- **AC-13**: A member adds, edits and removes their own `children` rows and their own `leadershipProgress` rows through row scoped mutations that each check the row belongs to the caller. Row ids stay stable across an edit; no row is deleted and recreated to apply a change.
- **AC-14**: **Name** is mirrored on write: any write of profile `firstName` or `lastName` patches the matching `users` fields in the same mutation through one shared helper, covering `submitProfile`, `resubmitProfile`, `verifyProfile`'s `edits` patch and `updateMyProfile`. **Photo is resolved on read instead**, because `users.profilePictureUrl` is rendered directly by its readers and `resolveMediaUrl` returns a signed URL that expires, so no durable copy of an uploaded photo can live there. Every server read that feeds an avatar returns one already resolved `photoUrl`, preferring the profile's and falling back to `users.profilePictureUrl`, and no client reads the raw `users.profilePictureUrl` any more. The reads to change are `profile.getMyAccountCore`, `admin.ts`'s user projection, `memberProfiles.listVerifiedMembersWithRoles`, the roster reads and `apps/admin/lib/activity.ts`'s actor shape; the clients to change are `apps/mobile/app/profile.tsx`, `apps/mobile/app/profile-completion/personal.tsx`, the three portal layouts' `avatarUrl`, `UsersClient`, `UserDetailClient`, `ActivityClient`, `DashboardClient` and `RosterClient`.
- **AC-15**: A one off migration backfills `users.firstName` and `users.lastName` from `memberProfiles` wherever they differ. It does not touch `profilePictureUrl`, which AC-14 solves on the read side. It skips rows with `deletedAt` set, reports counts of rows read, patched and skipped, is safe to run more than once, and pages through the table rather than collecting it whole.
- **AC-16**: A member setting their mentorship status to `not_enrolled` or `enrolled` saves immediately and is logged. A change **to** `completed` is rejected with `MENTORSHIP_NEEDS_REVIEW` when the stored value is not already `completed`, and the interface says Administration confirms that step. A change **away from** a stored `completed` is rejected with `MENTORSHIP_CONFIRMED` for the same reason in reverse: once Administration has confirmed completion, only Administration unconfirms it, or F2-14's gate would be one way. Re saving an unchanged `completed` value is allowed, so a member a reviewer already marked complete can still save the rest of their form. A reviewer may still set either value through `verifyProfile`.
- **AC-17**: `memberProfiles` gains an optional `directorySharing` boolean, where absent reads as private, written by `profile.setDirectorySharing({ directorySharing })`. The wizard stays seven steps per F2-01: the sharing question goes on the existing last step, not a new one. A verified member toggles it afterwards. Nothing reads it for a directory in this feature; feature 13 does that.
- **AC-18**: Replacing a profile photo, a mentorship proof or a leadership proof goes through the existing R2 upload path, and the previous object is deleted after the new key commits. The delete runs in an internal action scheduled by the mutation, since a mutation cannot reach the bucket, and the previous value is discriminated with the existing `toR2Key` helper so an absolute URL is never handed to R2. A failed delete leaves an orphan object rather than a row pointing at nothing, which is the ordering spec 0008 already chose.

Areas of Service and clan
- **AC-19**: A verified member adds an Area of Service, creating exactly one `pending_claim` row and notifying that department's HOD. The cap is `MAX_ACTIVE_DEPARTMENTS` counted over live rows, meaning `active` and `pending_claim` together through the existing `findLiveMemberships` helper, and a second live row for the same person and department is rejected with the department named in the message.
- **AC-20**: A member withdraws a `pending_claim` at any time. The row moves to a terminal status, that department's HOD is notified, and `department.claim_withdrawn` is logged.
- **AC-21**: A member leaves an `active` Area of Service, unless they hold `hod` or `department_admin` there. In that case the mutation rejects with `ROLE_BLOCKS_DEPARTURE` and a message naming the role they hold and saying it has to be ended first. A permitted departure notifies that department's HOD and delegate, is logged, and shares one factored helper with `removeDepartmentMember` rather than writing a second removal path. The existing mutation cannot simply be called: it is gated by `requireDepartmentCapability`, which a member does not satisfy, and it always notifies the person removed, which is wrong when that person is the caller. The helper takes the membership, the actor and whether to notify the member, and both callers use it.
- **AC-22**: A verified member sets or changes their clan at any time. It saves immediately, logs `profile.clan_changed`, notifies the new clan's elder (N26) and notifies the outgoing clan's elder that they have lost a member. A clan with no sitting elder notifies nobody and does not fail the change.
- **AC-23**: The wizard's clan step offers "I don't know my clan" in place of today's "None", which stores no `clanId`. No new field records the difference between declining to answer and not knowing.
- **AC-24**: A verified member with no clan reads "Your clan will be assigned by the Hospitality team" wherever their clan would otherwise show, on mobile and in the portal, from a shared constant.
- **AC-25**: An HOD sees people who claimed their department before verification, marked pending. Those people are excluded from every member count and from analytics, and cannot be appointed HOD or delegate until verified. Spec 0012 appears to satisfy all three; the verify step proves each one against the live app, and only a rule that actually fails becomes build work.

Copy and the two bugs
- **AC-26**: Every member facing surface names the reviewer "the Administration team" and never an individual or another body. The name and the lifecycle copy live in `packages/shared` with a unit test. The strings to replace, each verified in the code: `profile-completion/pending.tsx` ("your profile is with **the elders** for review"), `components/member-gate.tsx` ("Your profile is with **the elders** for verification"), `apps/mobile/app/profile.tsx`'s pending banner ("**a church admin** will verify it") and `convex/memberProfiles.ts`'s N05 body ("verified by **the church office**"). The email templates and `PORTAL_WORK_COPY` are checked and corrected where they differ.
- **AC-27**: No membership language appears before verification. "You're in the family!", "Welcome home" and anything equivalent are gone from the pending screen, which says instead that the profile is with the Administration team. The verified notice keeps its existing deliberate "verified" wording.
- **AC-28**: The mobile profile screen shows the real `mentorshipStatus`, never a hardcoded "Completed". The file has **no** mentorship label map today (the map at line 34 is `LEAD_STATUS_LABEL`, for leadership levels), so one is added or the `MENTORSHIP_STATUS_LABEL` in `profile-completion/review.tsx` is lifted into the shared copy constants and used by both.
- **AC-29**: Spouse search returns verified members only, with full name and photo, and never an email address in the payload. The caller is still excluded, deleted accounts are still excluded, the minimum query length and the result cap still apply. A visitor whose spouse is not a verified member uses the free text fallback the step already has.

The widening's reach
- **AC-31**: Every reader of `profileStatus` stays correct against three values. There are 66 references across `convex/`, `apps/admin/` and `apps/mobile/`. Most test `=== "verified"` or read `by_profileStatus` with an explicit value and need no change. These do:
  - `apps/admin/.../DashboardRosterTable.tsx` and `demographicsUtils.ts` each hard type `profileStatus` as a two value union and fail typecheck the moment the query widens. Both widen to three values.
  - `DashboardRosterTable.tsx`, `dimensions.ts`, `DashboardClient.tsx` and `UserDetailClient.tsx` bucket or label anything not verified as "Pending". The bucket is renamed "Not yet verified" and covers both unverified states, so no person is silently dropped from a chart or a filter.
  - `convex/admin.ts`'s `pendingVerifications` count and `convex/analytics.ts`'s pending read count only `pending_verification`, which would quietly exclude sent back people from Administration's own figures. Both cover `pending_verification` and `sent_back`, and the dashboard shows the sent back number beside the total rather than hiding the split.
  - `apps/mobile/hooks/use-my-account.ts` sets `isPending` only for `pending_verification`, so a sent back person currently reads as a plain visitor and is shown "Complete your profile". It gains a `isSentBack` flag, and its four consumers (`app/profile.tsx` in three places, `components/member-gate.tsx`, `components/profile-completion-banner.tsx`) each handle the new state. The unrelated `isPending` in `app/_layout.tsx` is Better Auth's session flag and is deliberately left alone.
  - `apps/mobile/app/profile-completion/index.tsx` has no explicit `verified` branch, so a sent back person falls through its final redirect into the member experience. It gains an explicit `sent_back` case before that fall through.
- **AC-32**: Every new rejection throws `ConvexError({ code })` with the code from a `PROFILE_LIFECYCLE_ERRORS` constant in `packages/shared`, following the `ACCOUNT_DELETION_ERRORS` pattern spec 0008 established, so each caller matches on a code rather than on a message. The codes are `PROFILE_STALE`, `PROFILE_ALREADY_VERIFIED`, `REASON_TOO_SHORT`, `REASON_TOO_LONG`, `MENTORSHIP_NEEDS_REVIEW`, `MENTORSHIP_CONFIRMED`, `ROLE_BLOCKS_DEPARTURE`, `DEPARTMENT_CAP_REACHED`, `DEPARTMENT_ALREADY_LIVE`, `PROFILE_NOT_VERIFIED` and `NOT_YOUR_ROW`. The reason's bounds are 10 and 500 characters, counted after trimming: 10 so a single word cannot be a reason, 500 so the whole text fits an email paragraph.
- **AC-33**: The title and body of every notice this feature sends live in the shared copy constants, not inline in the mutation: N06 (sent back, which carries the reason truncated to what a push body shows, with the full text in app and in the email), N04's resubmission wording (distinct from a first submission, so a reviewer can tell them apart), N26 (moved into a clan), and the three department notices for a claim created, a claim withdrawn and a member leaving, each naming the person and the department.
- **AC-34**: `verifyProfile` accepts a `sent_back` row and clears `sentBackReason`, `sentBackBy` and `sentBackAt` as it verifies. A reviewer must be able to undo their own mistaken send back without waiting for the person to resubmit, and a verified row must not keep looking sent back afterwards.

Tests
- **AC-30**: Automated tests cover the send back and resubmission transitions, the stale `updatedAt` rejection in both its causes, the mentorship rejection in both directions and its unchanged save exception, the three area live row cap, the HOD departure block, the name mirror, the resolved photo preferring the profile over the `users` fallback, verifying a sent back row clearing its three fields, and the spouse search projection carrying no email field.

## Decision

**Chosen option**: Option 1: Extend the existing lifecycle in place, with one state aware edit path.

Add `sent_back` to the existing `profileStatus` union with three flat fields beside it, keep `activityLogs` as the review history, and replace the eight field `updateMyProfile` with a single state aware mutation that both apps and all three lifecycle states share.

**Implementation skills**: `convex` (`.agents/skills/convex/`) · `klt-cyber-brand` (`.agents/skills/klt-cyber-brand/`) · `klt-cyber-web-ui` (`.agents/skills/klt-cyber-web-ui/`) · `shadcn` (`.agents/skills/shadcn/`)

## Feature design

This section holds the contract every child shares. Per child detail lives in the child specs.

### State machine

```
(absent) ──submitProfile──► pending_verification
pending_verification ──updateMyProfile (own edit)──► pending_verification
pending_verification ──sendProfileBack (reviewer, reason)──► sent_back
pending_verification ──verifyProfile (reviewer)──► verified
pending_verification ──resubmitProfile (own edit)──► pending_verification
sent_back ──resubmitProfile (own edit)──► pending_verification
sent_back ──sendProfileBack (reviewer, replaces the reason)──► sent_back
sent_back ──verifyProfile (reviewer changed their mind, clears the sentBack fields)──► verified
verified ──updateMyProfile (own edit)──► verified
```

`verified` is terminal in this feature. Nothing sends a verified profile back, and nothing demotes a member. The `sent_back` to `verified` edge exists so a reviewer can undo a mistaken send back without waiting for the person to resubmit.

**Resubmission is derived, not stored.** A row is a resubmission when `profileStatus === "pending_verification"` and `sentBackAt !== undefined`. Nothing else encodes it, so no second field can disagree with the first.

### Data model

`memberProfiles`, the only table whose shape changes:

| Field | Type | Change | Notes |
|---|---|---|---|
| `profileStatus` | `pending_verification \| sent_back \| verified` | widened | additive, so live rows stay valid |
| `sentBackReason` | optional string | new | latest round only, bounded by the shared caps |
| `sentBackBy` | optional `Id<"users">` | new | the reviewer, for the audit trail, never shown to the member |
| `sentBackAt` | optional number | new | set means sent back at least once; present on a `pending_verification` row means Resubmitted |
| `directorySharing` | optional boolean | new | absent reads as private; feature 13 reads it |

Unchanged in shape, changed in behaviour:

| Table | What changes |
|---|---|
| `users` | no new field; `firstName`, `lastName` and `profilePictureUrl` become a mirror written by one helper inside whichever mutation writes the profile copy |
| `children` | gains member owned add, edit and remove mutations |
| `leadershipProgress` | the same, member owned |
| `departmentMemberships` | nothing new; the self service add, withdraw and leave reuse `pending_claim`, `active`, the terminal statuses and `findLiveMembership` from spec 0012 |
| `activityLogs` | new action strings only: `profile.sent_back`, `profile.resubmitted`, `profile.edited`, `profile.clan_changed`, `child.updated`, `child.removed`, `leadership.updated`, `leadership.removed`, `department.claim_withdrawn` |

**No new index.** `by_profileStatus` serves both the review queue and the sent back list, `by_clanId` on `roleAssignments` finds a clan's elder, and `by_departmentId` finds a department's HOD. Resubmission is a field on the row the queue already reads, not a query.

### API surface

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `memberProfiles.sendProfileBack` | mutation | `profileId`, `reason` (req), `seenUpdatedAt` (req) | `{ ok }` | Administration authority or System Admin | stale row, already verified, reason too short or too long, profile not found |
| `memberProfiles.verifyProfile` | mutation | existing, plus `seenUpdatedAt` (req) | `{ ok }` | unchanged | stale row (new), plus existing |
| `memberProfiles.listSentBack` | query | none | rows with reason, reviewer, timestamp | Administration authority or System Admin, `null` when unauthenticated | none |
| `memberProfiles.listPendingVerifications` | query | none | existing, plus the derived resubmission marker, the earlier reason and the resolved reviewer name | unchanged | none |
| `memberProfiles.resubmitProfile` | mutation | `submitProfile`'s shape: profile fields plus `children`, `leadershipEntries`, `departmentIds` | `{ profileStatus }` | `requireUser`, own profile, must be `pending_verification` or `sent_back` | wrong state, `DEPARTMENT_CAP_REACHED`, field validation |
| `profile.updateMyProfile` | mutation | the editable profile fields minus `clanId`, all optional, plus `clearFields` | `{ ok }` | `requireUser`, own profile, must be `verified` or `pending_verification` | no profile, `MENTORSHIP_NEEDS_REVIEW`, `MENTORSHIP_CONFIRMED`, field validation |
| `profile.setDirectorySharing` | mutation | `directorySharing` | `{ ok }` | `requireUser`, own profile only | no profile |
| `children.addMine` / `updateMine` / `removeMine` | mutations | child fields, and the row id on the last two | `{ childId }` or `{ ok }` | `requireUser`, row must belong to caller | not your row, not found |
| `leadershipProgress.addMine` / `updateMine` / `removeMine` | mutations | level, status, proof, and the row id | `{ ok }` | `requireUser`, row must belong to caller | not your row, not found |
| `departmentMemberships.addMyAreaOfService` | mutation | `departmentId` | `{ membershipId }` | `requireUser`, verified profile | cap reached, already live for this pair, profile not verified |
| `departmentMemberships.withdrawMyClaim` | mutation | `departmentId` | `{ ok }` | `requireUser`, own row | no pending claim |
| `departmentMemberships.leaveMyAreaOfService` | mutation | `departmentId` | `{ ok }` | `requireUser`, own row | holds a role there, no active row |
| `profile.changeMyClan` | mutation | `clanId` or none | `{ ok }` | `requireUser`, verified profile | clan not found, profile not verified |
| `users.searchUsersForSpouseLink` | query | `query` | name and photo only, verified members | `requireUser` | none |

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| `sendProfileBack` | `sentBackBy` | the actor the authority gate resolves, not a client argument |
| `sendProfileBack` | the reason in push, in app and email | the required `reason` argument, bounded by the shared caps |
| `sendProfileBack` | the reviewer name the member reads | the shared `REVIEWER_NAME` constant, never the actor's own name, because A2-05 says members see "the Administration team" |
| `sendProfileBack` | the email idempotency key | `profile_sent_back:${profileId}:${sentBackAt}`, the pattern `sendProfileSentBack` already defines |
| review queue row | the "Resubmitted" marker | derived in the query: `profileStatus === "pending_verification" && sentBackAt !== undefined` |
| review queue row | the earlier reason | `memberProfiles.sentBackReason`, which survives resubmission on purpose |
| `verifyProfile`, `sendProfileBack` | the `updatedAt` to compare against | a new required `seenUpdatedAt` argument, supplied by the portal from the row it actually rendered |
| `updateMyProfile` | which branch to take | `profileStatus` read from the stored row inside the mutation, never a client supplied state |
| `updateMyProfile`, `resubmitProfile` | the `users` mirror values | profile `firstName` and `lastName` only. The photo is never mirrored; see the avatar row below |
| any read feeding an avatar | the displayed photo | `resolveMediaUrl(profile.photoUrl)` when a profile exists, else `users.profilePictureUrl` as given. Resolved per read, because the R2 signed URL `resolveMediaUrl` returns expires and so cannot be stored |
| `updateMyProfile` | the mentorship rejection, either direction | the incoming value compared against the stored one, so an unchanged `completed` still saves |
| `updateMyProfile` | which fields a member may unset | the `clearFields` literal union, which lists the genuinely optional fields and excludes the ones the row requires |
| `resubmitProfile` | which child and leadership rows to patch, insert or remove | the `_id` on each incoming entry: present means patch that row, absent means insert, a stored row absent from the payload means remove. No row is ever deleted and recreated to apply a change |
| every member owned write | the `updatedAt` the stale guard reads | each mutation patches `memberProfiles.updatedAt`, including the ones that write a different table, so one timestamp covers the whole submission |
| `verifyProfile`, `sendProfileBack` | which stale message the portal shows | the stored `sentBackAt` compared against the `updatedAt` the reviewer held: newer means another reviewer acted, otherwise the owner edited |
| the review queue and the sent back list | the row's sort key | `sentBackAt` where set, else `_creationTime`, ascending, so the longest wait is first |
| the sent back list | the reviewer's name | `sentBackBy` resolved through `displayName` from `convex/lib/roleNotices.ts`, falling back to "a reviewer" for a deleted account |
| every new notice | its title and body | the shared copy constants, per AC-33, never a literal in the mutation |
| `addMyAreaOfService` | the live row count for the cap | `findLiveMemberships(ctx, userId).length`, cap from `MAX_ACTIVE_DEPARTMENTS` in `packages/shared` |
| `addMyAreaOfService`, `withdrawMyClaim`, `leaveMyAreaOfService` | the HOD to notify | `roleAssignments` on `by_departmentId`, `roleType: "hod"` or `department_admin`, `status: "active"` |
| `leaveMyAreaOfService` | whether the caller holds a role there | `roleAssignments` on `by_userId_status`, filtered to that `departmentId` and to `hod` or `department_admin` |
| `leaveMyAreaOfService`, `addMyAreaOfService` | the department name in the error | `departments.name` |
| `changeMyClan` | the incoming clan's elder | `roleAssignments` on `by_clanId`, `roleType: "clan_elder"`, `status: "active"` |
| `changeMyClan` | the outgoing clan's elder | the same lookup against the previous `clanId`, read before the patch is applied |
| profile clan line | "Your clan will be assigned by the Hospitality team" | a shared constant, shown when `profileStatus === "verified"` and `clanId` is absent |
| spouse search | the result name | `memberProfiles.firstName` and `lastName`, not the `users` copy, because the profile holds the reviewed version |
| spouse search | the result photo | `resolveMediaUrl(memberProfiles.photoUrl)` |
| spouse search | which rows are eligible | `by_profileStatus` on `verified`, minus the caller, minus any `users` row with `deletedAt` set |
| mobile mentorship row | the label | `profile.mentorshipStatus` through the label map already in the file |
| the reopened wizard | the pre filled draft | `profile.getMyProfile`, which already returns the profile with its children and leadership rows |

### Key invariants

- A profile is in exactly one of `pending_verification`, `sent_back` and `verified`.
- `sentBackAt` set with status `pending_verification` is the only encoding of a resubmission.
- `verified` is terminal here: no mutation in this feature leaves it.
- After any profile name write, `users.firstName` and `users.lastName` match the profile.
- `users.profilePictureUrl` never holds an R2 key, and no surface renders it without first preferring a resolved profile photo.
- `clanId` has exactly one writer, `changeMyClan`.
- A member's own edit never crosses the `completed` mentorship line in either direction.
- Every member owned write bumps `memberProfiles.updatedAt`, whichever table it writes.
- A user never holds more than `MAX_ACTIVE_DEPARTMENTS` live `departmentMemberships` rows, and never two live rows for one department (both from spec 0012, now also enforced on the self service add).
- No member facing string names an individual reviewer.

### Security model

| Caller | May do |
|---|---|
| Administration HOD or delegate, System Admin | verify, send back, read the queue and the sent back list, and edit fields through `verifyProfile` |
| the profile's owner | edit every field of their own profile in any of the three states, manage their own children and leadership rows, add, withdraw and leave their own Areas of Service, change their own clan, set their own sharing flag |
| any other signed in user | spouse search only, which returns verified members' names and photos and nothing else |
| unauthenticated | nothing; the two Administration queries return `null` rather than throwing, matching their siblings, so a live subscription survives sign out |

Every member owned mutation resolves the caller through `requireUser` and reads the row from the caller's own id, so there is no "whose profile" argument to forge. No member owned mutation consults `roleAssignments` except `leaveMyAreaOfService`, which reads it only to block a departure.

This feature handles personal data (phone, address, next of kin, children, photos) but triggers no named regulatory standard. Three rules follow from that: email leaves the spouse search projection entirely rather than being filtered at render time, `directorySharing` defaults to private so nothing is disclosed by a missing value, and `sentBackReason` is reviewer authored free text that is read back to a member and embedded in an email, so it passes through the template escaping `convex/emails.test.ts` already covers.

### Configuration required

None. The send back email's real delivery still depends on spec 0007's open decision about the sending domain identity, which is tracked there and not reopened here.

### Critical test scenarios

- Happy path: a reviewer sends a profile back with a reason, the person reads it, edits and resubmits, and it returns to the queue marked Resubmitted with the earlier reason, verifies **AC-2**, **AC-3**, **AC-4**, **AC-5**.
- Failure case: a reviewer reads a profile, the owner edits it, and the reviewer then verifies with the `updatedAt` they were holding, which is rejected and loses nothing, verifies **AC-7**.
- Failure case: a member saves a form whose mentorship status a reviewer had already set to `completed`, which succeeds, while a member changing `enrolled` to `completed` is rejected, verifies **AC-16**.
- Failure case: a member who is the HOD of a department tries to leave its roster and is rejected with the role named, verifies **AC-21**.
- Data integrity: a member changes their name and photo, and both `users` and `memberProfiles` agree afterwards, with an R2 key never reaching `users.profilePictureUrl`, verifies **AC-14**.
- Auth and permission: a plain member and a non Administration HOD each call `sendProfileBack` and `listSentBack` and are rejected by the server, verifies **AC-10**.
- Privacy: a spouse search payload is inspected and carries no email field at all, and an unverified member never appears in it, verifies **AC-29**.

## Build plan

Tracer Bullet, so slice 1 is a thin thread through every layer of the feature's spine (a reviewer sends a profile back, the person fixes it, it comes back) rather than a layer of schema across the whole feature. The schema widening is additive and lands with the slice that first needs it. The one migration that touches live data is the identity backfill, which lands in slice 2 after slice 1 has already stopped new drift.

0. [x] **Absorb the widening before anything uses it.** The widened `profileStatus` and the three send back fields in the schema; the two hard typed two value unions in `DashboardRosterTable.tsx` and `demographicsUtils.ts`; the "Pending" buckets renamed to cover both unverified states; the two Administration counts extended; `use-my-account.ts` gaining `isSentBack` and its four consumers handling it; and the explicit `sent_back` branch in `profile-completion/index.tsx` so nobody falls through into the member experience. This is first because the union widens in the same push, and a `sent_back` row reaching code that assumes two values is how this feature would break something that works today, satisfies **AC-1**, **AC-31**
1. [x] **Send back and resubmit, end to end.** `PROFILE_LIFECYCLE_ERRORS`, the reason caps, `REVIEWER_NAME`, the notice copy and the lifecycle copy in `packages/shared` with their unit test; `sendProfileBack` with its authority gate, `seenUpdatedAt` guard, log row and N06 notice wired to the existing email action; `seenUpdatedAt` and the sent back clearing added to `verifyProfile`; `resubmitProfile` with its id based reconcile, its claim handling and the resubmission flip with its log and N04; the `syncIdentityToUser` name helper; `profile.updateMyProfile` widened for the verified and pending cases; the portal's send back dialog on the review screen using the existing `dialog` and `textarea` primitives, with both stale messages handled; the sent back screen on mobile showing the reason; the wizard reopened pre filled from `getMyProfile` plus the department memberships read it also needs; and the Resubmitted marker, the earlier reason and the sort order in the queue, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, **AC-10**, **AC-11**, **AC-32**, **AC-33**, **AC-34**
2. [x] **Everything else a member owns.** The reviewer's sent back waiting list with its resolved reviewer name; the row scoped children and leadership mutations for a verified member; the mentorship gate in both directions; the `directorySharing` field, its question on the existing last wizard step and its toggle; the resolved photo on every avatar feeding read and the client sweep that stops reading the raw `users` field; the scheduled R2 cleanup for a replaced photo, mentorship proof and leadership proof; the portal Settings page moved onto the one mutation; and the name backfill migration run on dev, then staging, then production, satisfies **AC-8**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-16**, **AC-17**, **AC-18**
3. [x] **Areas of Service and clan, self service.** `addMyAreaOfService` with the live row cap and the HOD notice; `withdrawMyClaim`; the removal helper factored out of `removeDepartmentMember` and `leaveMyAreaOfService` built on it, with the role block and its named error; `changeMyClan` as the only writer of `clanId`, with both elders notified; the clan step relabelled to "I don't know my clan"; and the unassigned clan copy on both surfaces, satisfies **AC-19**, **AC-20**, **AC-21**, **AC-22**, **AC-23**, **AC-24**
4. [x] **Copy sweep and the two bugs.** Every remaining member facing reviewer name moved onto the shared constant, the membership language removed from the pending screen, the hardcoded mentorship value replaced, and the spouse search rewritten over `memberProfiles` by `by_profileStatus` with name and photo only, satisfies **AC-26**, **AC-27**, **AC-28**, **AC-29**
5. [ ] **Tests and the F2-10 proof.** (the Convex tests are built — `convex/profileLifecycle.test.ts`, 49 cases over the exported rules. AC-25's three F2-10 rules are verify work against the live app, not build work, and are still to be walked.) The Convex tests listed in AC-30, and walking AC-25's three rules against the live app, fixing only what actually fails, satisfies **AC-25**, **AC-30**

## Migration plan

**Strategy**: additive schema plus one idempotent backfill, no feature flag.

**Phases**:
1. Push the widened union and the four new optional fields **together with** slice 0's reader fixes, in one commit. Nothing writes `sent_back` yet, so no row can reach a reader that has not been taught about it.
2. Deploy the mutations and `syncIdentityToUser`, and the portal in the same push, because `verifyProfile`'s new required argument breaks the live portal the moment the backend has it.
3. Run the name backfill on dev, then staging, then production. It reports counts and is safe to re run.
4. Publish the mobile update, then enable send back for reviewers.

**Rollback**: phases 1 to 3 revert by reverting the commit. Two caveats. Once any row is written as `sent_back`, narrowing the union back to two values makes that row fail schema validation, so a rollback after that point has to flip those rows to `pending_verification` first. And phase 2 cannot be reverted on its own without also reverting the portal, since the two are coupled by the new argument. Phase 3 is a repair rather than a change of meaning and is not reversed.

**Risks**:
- **An old mobile build in the field meeting a `sent_back` user.** Mobile ships over the air on its own clock, so a user still running yesterday's bundle falls through `profile-completion/index.tsx` into the member experience and reads as a plain visitor elsewhere. This is why phase 4 publishes the mobile update **before** reviewers can send anything back, and why slice 0 is first in the build plan rather than folded into slice 1.
- A `sent_back` row blocking a schema rollback, as above. Mitigated by keeping phase 1 additive and knowing the flip query in advance.
- Phase 2 leaving a window where the deployed portal calls `verifyProfile` without its new required argument, so no reviewer can verify anything. Mitigated by shipping both in one push, and worth checking on staging first since it is the kind of break that only shows under a real session.
- A missed client in the AC-14 photo sweep showing a stale avatar rather than failing loudly. Mitigated by walking the eleven named files, and by the verify step that uploads a photo and then checks every surface that renders one.
- The backfill overwriting a `users` name that was deliberately different from the profile. There is no product reason for the two to differ, and F1-07 says they must not, so the profile wins; the migration's counts make any surprise visible.

## Consequences

**Positive**:
- A reviewer can refuse a profile honestly instead of correcting it silently or verifying something they do not believe, and the person hears why in their own language.
- The eight field edit gap closes for both apps at once, because both call the same mutation. A field added later appears on both surfaces or neither.
- Name and photo stop drifting. The helper makes that structural rather than a rule somebody has to remember.
- Two user visible bugs and one privacy leak go, and the leak goes by removing the field from the payload rather than hiding it at render time.
- Features 13, 14 and 29 unblock: 13 gets the sharing field it reads, 14 gets the mutations its screens call, and neither has to invent them.
- Half of F2-05 was already built and dead (`sendProfileSentBack` and its template). This feature turns that into working behaviour at nearly no cost.

**Negative and tradeoffs**:
- `profileStatus` is now a three value machine with **66** references across the backend and both apps. Most are already written as "is this `verified`" and stay correct, but AC-31 lists nine places that do not, including two that fail typecheck and two that would silently drop sent back people from Administration's own counts. A future reader who assumes two values will be wrong.
- Name is mirrored on write while photo is resolved on read, so the two halves of F1-07 are solved by two different mechanisms. That asymmetry is forced (a signed R2 URL expires, so there is nothing durable to mirror) but it is a thing a maintainer has to know, and the invariant has to be stated as two rules rather than one.
- Resolving the photo per read means every avatar feeding query now calls `resolveMediaUrl`, and the client sweep in AC-14 touches eleven files. Missing one leaves a stale avatar rather than a crash, which is the quiet kind of defect.
- The `seenUpdatedAt` guard adds a **required** argument to `verifyProfile`, which breaks every existing caller, including the seeds and tests. The portal and the backend have to ship together, and migration phase 2 and phase 4 cannot be far apart or reviewers lose the Verify button in between.
- Two edit mutations rather than one: `resubmitProfile` for a whole submission in the pending and sent back states, `updateMyProfile` for field level edits by a verified member. One mutation for all three states was the first design and was wrong, because it carried no children, leadership or department data and so could not satisfy AC-6 at all.
- Letting members change their own clan freely means clan rosters can churn without any leader's involvement. Both elders are told, which is the mitigation, not a prevention.
- The reviewer name becoming a shared constant means a copy change is now a code change in `packages/shared` rather than an edit in one screen.

**Neutral**:
- No new table, no new index, no new environment variable, no new dependency.
- `activityLogs` becomes the review history. It already carries the trail by convention and already has `by_target` from spec 0008, so nothing new is needed for it to serve that role.
- F2-13 is on this feature's SRS list but only its write side ships here. The requirement is not closed until feature 13 builds the directory that reads `directorySharing`.
- `verifyProfile` still promotes `role` to `"member"` regardless of mentorship, which its own comment already calls a known gap. This feature does not change that, so the "verified is not yet membership" distinction stays a copy convention rather than something the data enforces.

## Follow-up

- [ ] The SRS notification catalogue has no code for an HOD facing roster departure or a withdrawn claim. This feature sends those on N10, the only HOD facing department claim code there is, with a body that says what happened. Worth giving each its own code in SRS section 5 so the mute categories in feature 28 can treat them separately.
- [ ] F2-14 (a change to `completed` mentorship waits for Administration) and F2-15 (the mentorship reminder) are not in this feature, so AC-16 blocks the member's own route to `completed` with an explanation rather than queuing it. When F2-14 is designed, that block becomes a request and the error copy goes.
- [ ] `packages/shared/src/schemas/profile.ts` holds `approvalStateShape`, the embedded approval state the data model conventions describe, which nothing uses. This spec deliberately did not migrate `memberProfiles` onto it. Either adopt it somewhere or delete it, so the convention and the code stop disagreeing.
- [ ] `convex/schema.ts`'s `memberProfiles` comment says there is deliberately no rejected status and that admins correct in place instead. Once AC-1 lands that comment is false and should be rewritten to describe the three state machine.
- [ ] `convex/users.ts`'s comment explaining that spouse search is deliberately not limited to verified members is reversed by AC-29 and has to be rewritten, not just left above the changed code.
- [ ] `convex/profile.ts`'s header comment says creating a profile is gated on mentorship completion, which stopped being true before this feature. Correct it while the file is open.
- [ ] F2-13's read side, the directory itself, belongs to feature 13 and depends on the `directorySharing` field this spec adds. Feature 13's spec should state that dependency rather than rediscover it.
- [ ] Spouse search still reads a whole table and filters in memory, now over `memberProfiles` instead of `users`. Fine for one church, and the result cap holds, but it is the kind of query worth a search index if the congregation grows past a few thousand verified members.
- [ ] Nothing rate limits a member's own edits, so a person can resubmit repeatedly and alert every Administration reviewer each time. Harmless at 50 ministers with people who know each other, and worth a limit before the whole congregation is on it.
- [ ] A withdrawn claim is stored as `declined` with `decidedBy` set to the member themself, which distinguishes it from an HOD's decline for anyone reading the row but not in any interface. If that distinction ever needs to be visible, that is the moment to add a status value rather than now.
- [ ] A person whose account is deleted while their profile is `sent_back` leaves a row in the sent back list. The list excludes `deletedAt` rows, but the orphaned `sent_back` status is never cleaned up. Worth folding into spec 0008's deletion sweep.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
