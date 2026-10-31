# 0014a. Review lifecycle: send back, edit while waiting, resubmit

Child of [0014 Profile lifecycle core](index.md). Covers F2-03, F2-05, A2-02, A2-03 and acceptance criteria **AC-1** to **AC-10**.

## Summary

Today a reviewer has one button and a waiting visitor has none. This child adds the missing half of the review conversation: a reviewer hands a profile back with a written reason, the person reads that reason in the app, changes what was asked, and sends it again, and it returns to the queue marked as a resubmission with the earlier reason still visible. It also closes a silent data loss nobody would ever notice: a reviewer verifying from a screen the person has since edited.

Why it is cheaper than it looks: spec 0007 already built the `profile_sent_back` email template and the `emails.sendProfileSentBack` action, and nothing calls either of them.

## Design

### The third state

`profileStatus` becomes a three value union and the table gains three optional fields.

```
pending_verification ──sendProfileBack (reason)──► sent_back ──updateMyProfile──► pending_verification
                     ──verifyProfile───────────► verified
sent_back ──sendProfileBack (replaces the reason)──► sent_back
```

| Field | Type | Notes |
|---|---|---|
| `sentBackReason` | optional string | latest round only; survives resubmission so A2-03 can show it |
| `sentBackBy` | optional `Id<"users">` | audit only, never returned to the member |
| `sentBackAt` | optional number | set means sent back at least once |

All three are optional and the union only widens, so live rows stay valid and no migration runs for this part (**AC-1**).

**Resubmission is derived.** `profileStatus === "pending_verification" && sentBackAt !== undefined`. There is no `resubmitted` field and no round counter, so nothing can disagree with the row (**AC-5**).

`verified` is terminal here. `sendProfileBack` rejects a verified profile outright (**AC-9**); nothing in this feature demotes a member.

**`verifyProfile` does accept a `sent_back` row**, clearing all three fields as it verifies (**AC-34**). A reviewer who sends a profile back by mistake must be able to undo it without waiting for the person to resubmit, and a verified row must not keep looking sent back afterwards. The existing early return for an already verified profile stays first, so verifying twice is still a no op; the stale check runs after it, since a no op has nothing to overwrite.

### `sendProfileBack`

```
sendProfileBack({ profileId, reason, seenUpdatedAt })
```

Gated by `canManageChurchAdmin`, the same helper `verifyProfile` already uses, so Administration HOD, Administration delegate and System Admin may call it and nobody else. The rejection happens in the mutation, not in the portal (**AC-10**).

In order:

1. Resolve the actor through the gate.
2. Load the profile. Reject when missing, and reject with `PROFILE_ALREADY_VERIFIED` when `verified` (**AC-9**).
3. Compare `profile.updatedAt` against `seenUpdatedAt` and throw `ConvexError({ code: PROFILE_STALE })` when the stored value is **strictly newer** (**AC-7**).
4. Validate the trimmed `reason` against the shared bounds, 10 to 500 characters, throwing `REASON_TOO_SHORT` or `REASON_TOO_LONG` (**AC-1**, **AC-32**).
5. Patch `profileStatus: "sent_back"`, `sentBackReason`, `sentBackBy: actor._id`, `sentBackAt: now`, `updatedAt: now`.
6. Write `activityLogs` `profile.sent_back` with `targetType: "memberProfiles"`, `targetId: profileId` and `metadata: { userId: profile.userId }`. The reason goes in the metadata, so the trail records what was asked for (**AC-2**).
7. Schedule the N06 notice to that one user, with `deepLink: { type: "profile", id: profile.userId }`, which the mobile notification router already sends to the person's own profile screen.
8. Schedule `internal.emails.sendProfileSentBack`, passing `sentBackAt` so its existing `profile_sent_back:${profileId}:${sentBackAt}` idempotency key stays correct across repeats (**AC-3**).

Sending back a profile already `sent_back` is allowed and replaces the reason, writing a fresh log row and a fresh notice, so a reviewer can correct what they asked for (**AC-9**). Because `sentBackAt` moves, the email's idempotency key moves with it and the second email sends.

The copy the member reads names "the Administration team" from the shared constant, never the actor. A2-05 is explicit that members see the body, not the individual.

### The stale guard

`verifyProfile` gains the same required `seenUpdatedAt` argument and the same comparison (**AC-7**). This is a breaking change to a mutation the portal already calls, and to the seeds and tests that call it, so every caller ships in the same push. Migration phase 2 covers both the backend and the portal for exactly this reason: a window where the deployed portal calls it without the argument is a window where no reviewer can verify anything.

The portal passes the `updatedAt` from the row it actually rendered, not a fresh read.

**Two causes, two messages.** On `PROFILE_STALE` the portal has to say which happened, because the advice differs:

```
stored sentBackAt > the updatedAt the reviewer held   →  another reviewer sent this back
otherwise                                            →  the owner has just edited it
```

Without that split, a reviewer whose colleague sent the same profile back a second earlier is told the person edited their profile, which is simply false. The reactive query means the screen is already showing the new state by the time they read either message.

**Every member owned write bumps `memberProfiles.updatedAt`**, including the children, leadership, clan, sharing and claim mutations that write a different table. Otherwise the guard would cover only the profile row's own fields, and a reviewer could verify straight over a child or leadership row the person had just changed.

Why this matters more than its size suggests: without it, a reviewer holding a screen from a minute ago verifies with the `edits` patch they were looking at, and a correction the person typed in between is overwritten with no error, no log entry and nothing on any screen saying it happened.

### Editing while pending or sent back: `resubmitProfile`

A person in either state reopens the whole wizard, so they save the whole submission at once. That needs a mutation carrying more than profile fields, which is why `updateMyProfile` cannot serve this state:

```
memberProfiles.resubmitProfile({
  ...profile fields,
  children?, leadershipEntries?, departmentIds?,
})  →  { profileStatus }
```

`requireUser`, the caller's own profile, and the row must be `pending_verification` or `sent_back`. The handler:

1. Patch the profile fields, once, with a single `updatedAt: now` for the whole save.
2. **Reconcile `children` and `leadershipProgress` by id.** Each incoming entry carries an optional `_id`: present means patch that row, absent means insert, and a stored row absent from the payload is removed. No row is ever deleted and recreated to apply a change, so `_id` stays stable (**AC-13**).
3. **Reconcile `departmentIds`** against the caller's live rows. A new id creates a `pending_claim`; a live row whose id is gone becomes terminal. The verified gate `addMyAreaOfService` imposes does not apply here, since this is the submission path. The `MAX_ACTIVE_DEPARTMENTS` cap still does, counted over live rows after the reconcile, so a resubmission cannot exceed it. Reconciling rather than re inserting also avoids the trap of a resubmitted wizard re sending its own earlier choices and being told "you have already asked to serve in X".
4. Run `syncIdentityToUser` for the name (**AC-14**).
5. If the row was `sent_back`: patch `profileStatus: "pending_verification"`, leaving `sentBackAt` and `sentBackReason` in place deliberately; write `activityLogs` `profile.resubmitted`; and alert the Administration reviewers through `resolveAdministrationReviewerIds` and N04, with the same System Admin fallback and the same empty audience skip spec 0013 built (**AC-4**). N04's resubmission wording is distinct from a first submission's, so a reviewer can tell them apart (**AC-33**).
6. If the row was already `pending_verification`: write `profile.edited` and send nothing. Nobody is waiting to hear that a submission already in the queue changed, and the queue reads the row live.

Everything the person submitted is editable in both states (**AC-6**). Nothing downstream has acted on a claim yet, because spec 0013 deliberately holds the HOD claim alert back until verification, so an edited claim has notified nobody.

One accepted consequence: a `sent_back` person who saves with nothing changed still resubmits, because the state transition is the point of the save rather than a side effect of a diff. A reviewer sees a resubmission with no visible change, which is mildly annoying and much simpler than guessing at intent.

### Mobile surfaces

**The gating is wider than one route file, and getting this wrong is the worst defect this child could ship.** `apps/mobile/app/profile-completion/index.tsx` has no explicit `verified` branch: it redirects `pending_verification` to the pending screen and everything else falls through to `/(tabs)`. So a `sent_back` person would land in the member experience. And `apps/mobile/hooks/use-my-account.ts` sets `isPending` only for `pending_verification`, so the same person reads as `isVisitor && !isPending` and is shown "Complete your profile" by `app/profile.tsx:246`, the completion prompt by `components/member-gate.tsx` and a "VISITOR" pill.

Slice 0 of the build plan fixes all of it before anything can write the new state (**AC-31**):

| File | Change |
|---|---|
| `hooks/use-my-account.ts` | add `isSentBack`, and keep `isPending` meaning what it says |
| `app/profile-completion/index.tsx` | an explicit `sent_back` branch **before** the fall through |
| `app/profile.tsx` | three `isPending` sites: the header state, the "Complete your profile" prompt, and the pending banner |
| `components/member-gate.tsx` | the sent back state, plus the "with the elders" string AC-26 replaces |
| `components/profile-completion-banner.tsx` | the sent back state |

The `isPending` in `app/_layout.tsx` is Better Auth's session loading flag and has nothing to do with profiles. Leave it alone.

Then the four states:

| State | Screen |
|---|---|
| no profile | the wizard, as today |
| `pending_verification` | the pending screen, with an "Edit my submission" action added |
| `sent_back` | a sent back screen: what was asked for, in the reviewer's words, and one action to open the submission |
| `verified` | the member experience, now reached by an explicit branch rather than a fall through |

Both the pending and the sent back screen reopen the same seven step wizard, pre filled and saving through `resubmitProfile`. `profile.getMyProfile` already returns the profile with its children and leadership rows, but **not** the person's department memberships, which the wizard's departments step needs; that read is extended to include the live ones. The wizard's draft layout is seeded from it instead of starting empty, and the review step's submit calls `resubmitProfile` when a profile already exists. There is no second copy of the form (**AC-6**).

Follow the `klt-cyber-brand` skill for the sent back screen. One note on tone that the copy rules make load bearing: the pending screen's current celebration (a gold check mark, "You're in the family!") is wrong before verification per F2-02, and the sent back screen must not read as a rejection either. It is a request, phrased as one. The reason itself is the reviewer's words and is rendered as given.

### Portal surfaces

Both live under `apps/admin/app/(admin)/areas-of-service/admin/verification/`, and every primitive needed already exists in the repo, so nothing new is added with `npx shadcn add`.

**Send back**, on the review screen beside Verify: a `dialog` holding a `textarea` for the reason, the live character count against the shared caps, and a confirm that is disabled until the minimum is met. The stale error is caught here and shown as the sentence above, not as a raw failure.

**The queue** gains the resubmission marker: a `badge` reading "Resubmitted" on any row where the marker derives true, and the earlier reason shown on the review screen above the fields so a reviewer can see what they asked for before deciding again (**AC-5**).

**The sent back list** is a second list beside the queue, from `memberProfiles.listSentBack`, showing name, photo, when it was sent back, by whom, and the reason. `DataTable` and `EmptyState` cover it. Its empty state matters more than usual: an empty list is the normal and healthy case, so it reads as "nothing is waiting on anyone" rather than as a failure (**AC-8**).

Both lists sort **oldest first** by the time the row entered its current state, `sentBackAt` where set and `_creationTime` otherwise, so the longest wait is at the top. That matches the oldest first convention spec 0012 chose for pending claims, and it is the useful order for both lists: the queue surfaces who has waited longest, and the sent back list surfaces what has gone stale with its owner.

`sentBackBy` is resolved to a name through `displayName` from `convex/lib/roleNotices.ts`, falling back to "a reviewer" when that account has been deleted. The index's note that `sentBackBy` is never shown applies to the **member**; reviewers see it, which is the point of recording it.

`listSentBack` is gated by `getAdministrationAuthorityOrNull` and returns `null` when unauthenticated, matching `listPendingVerifications` and `getProfileForReview`, so a live subscription survives sign out instead of throwing mid teardown (**AC-10**).

Follow the `klt-cyber-web-ui` skill for both.

### Existing code this child changes

| Location | Change |
|---|---|
| `convex/schema.ts` | widen the `profileStatus` union, add the three fields, and rewrite the comment that says there is deliberately no rejected status, which AC-1 makes false |
| `convex/memberProfiles.ts` | add `sendProfileBack`, `listSentBack` and `resubmitProfile`; add `seenUpdatedAt` and the sent back clearing to `verifyProfile`; extend `listPendingVerifications` with the derived marker, the reason, the resolved reviewer name and the sort |
| `convex/profile.ts` | extend `getMyProfile` with the caller's live department memberships, which the wizard's departments step needs |
| `packages/shared/src/constants/` | a new profile lifecycle constants file: `PROFILE_LIFECYCLE_ERRORS`, the reason caps (10 and 500), `REVIEWER_NAME`, the notice copy and the lifecycle copy, with a unit test |
| every caller of `verifyProfile` | the new required argument, including the seeds and the existing tests |
| `apps/mobile/app/profile-completion/_layout.tsx` | seed the wizard draft from an existing profile instead of starting empty |
| `apps/mobile/app/profile-completion/review.tsx` | call `resubmitProfile` when a profile already exists |
| `apps/mobile/app/profile-completion/pending.tsx` | the edit action, and the copy fix [0014d](0014-copy-and-fixes.md) also touches |
| the five mobile gating files in the table above | the `sent_back` state |
| the portal verification pages | the send back dialog, the resubmission badge, the earlier reason, both stale messages, and the sent back list |

### Tests

Convex tests, in the style of `convex/departmentShell.test.ts`:

- send back writes all three fields, the log row and the notice, and the profile leaves the queue
- send back is rejected with `PROFILE_ALREADY_VERIFIED` for a verified profile, and with `REASON_TOO_SHORT` or `REASON_TOO_LONG` outside the bounds, counted after trimming
- send back twice replaces the reason, writes a second log row, and moves `sentBackAt` so the email key changes
- `resubmitProfile` on a `sent_back` row returns it to `pending_verification`, keeps both send back fields, logs `profile.resubmitted` and re alerts the reviewers
- `resubmitProfile` on a `pending_verification` row logs `profile.edited` and writes no notification
- `resubmitProfile` is rejected on a `verified` row
- `resubmitProfile` patches a child carrying an `_id`, inserts one without, removes a stored row left out of the payload, and leaves every surviving `_id` unchanged
- `resubmitProfile` re sending the same `departmentIds` is a no op rather than a duplicate claim error, and exceeding the cap after the reconcile is rejected
- `verifyProfile` and `sendProfileBack` each reject a `seenUpdatedAt` older than the stored value with `PROFILE_STALE`, and the stored row is unchanged afterwards
- a `seenUpdatedAt` equal to the stored value is accepted, since the guard compares strictly
- `verifyProfile` on a `sent_back` row succeeds and clears all three send back fields
- `verifyProfile` on an already verified row is still a no op, and does not throw `PROFILE_STALE`
- a plain member, and an HOD of a department other than Administration, are each rejected by `sendProfileBack` and get `null` from `listSentBack`
