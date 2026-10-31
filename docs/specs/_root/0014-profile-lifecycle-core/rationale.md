# 0014. Profile lifecycle core · rationale

The decision record for [spec 0014](index.md). Read by humans and by `/architect` on an update. `/develop` skips it.

## Context

> ⚠️ Premise note: this topic spans four decisions that can each be built and shipped on their own, which is why it is written as an umbrella rather than one spec. Three further things are worth naming before the design starts. First, F2-13 is on this feature's SRS list but is the member directory's read path, which feature 13 owns; only its write side can ship here, so F2-13 is not closed when feature 9 is marked done. Second, `verifyProfile` already promotes a person to `member` regardless of mentorship, and its own code comment calls that a known gap; F2-14 and F2-15, which would close it, are not in this feature, so "verified is not yet membership" stays a copy convention that the data does not enforce. Third, two of the gaps this spec fills are not oversights but earlier product decisions written down in the code: `convex/schema.ts` says there is deliberately no rejected status, and `convex/users.ts` says spouse search is deliberately not limited to verified members. The SRS now says the opposite in both cases and the SRS wins, but the comments have to be rewritten rather than left standing above changed code, or the next reader will trust them.

The membership lifecycle is the one path every single user walks, and at the moment it only works when nothing goes wrong. A visitor fills in the seven step wizard, lands on a celebration screen, and from that moment can do nothing: not correct a misspelled name, not swap a bad photo, not change the department they picked by accident. A reviewer opening that submission has exactly one button. If a detail is wrong they can either correct it themselves, which puts the church's record of a person in the reviewer's words rather than their own, or verify something they do not believe. There is no way to hand it back.

The second half of the problem starts after verification. A verified member can edit eight fields from the web portal's Settings page and nothing at all from their phone. The profile holds about thirty. Phone number, address, next of kin, children, clan, profession, mentorship, Areas of Service: all captured once, during the wizard, and then frozen. For a congregation whose contact details are the main reason the data exists, that is the wrong way round.

Underneath both halves sits a quieter problem. A person's name and photo live in two tables. `users` holds the copy written at sign up from the authentication provider; `memberProfiles` holds the copy the person typed and a reviewer may have corrected. Nothing keeps them in step. A reviewer who fixes a name during verification changes one of them, and every surface reading the other keeps showing the old one. Notification bodies, several admin lists and the account panel read `users`; the profile screens read `memberProfiles`. Nobody has reported this because each surface looks internally consistent.

Three forces shape what can be done about it. The deployment pipeline is the first: a push to `main` deploys schema and functions straight to staging, so any schema change has to stay valid against live rows or ship with its migration in the same push. The second is that `profileStatus` is read directly in roughly twenty places across the backend and both apps, so widening it is a change with reach. The third is the calendar: launch is 29 November 2026, this feature is budgeted at about eight hours on the single backend track, and three later features (13, 14 and 29) are blocked until it lands.

One piece of good news sits in the existing code. Spec 0007 built the `profile_sent_back` email template and the `emails.sendProfileSentBack` action, and nothing calls either of them. Half of F2-05's delivery already exists and is dead.

One piece of bad news sits there too, and it took an independent cross check to find. The widening's reach was badly underestimated in this spec's first draft: there are 66 references to `profileStatus`, not the twenty first claimed, and nine of them are wrong against three values. Two fail typecheck, two would quietly drop sent back people from Administration's own counts, and five on mobile would show a sent back person the member experience or a "Complete your profile" prompt. That is why the build plan now opens with a slice that absorbs the widening before anything can write the new state, rather than folding the schema change into the first feature slice.

## Options considered

### Option 1: Extend the existing lifecycle in place, one state aware edit path

Widen `profileStatus` with a third value and add three flat optional fields beside it. Keep `activityLogs` as the review history, since it is already the project's append only audit trail and already has the index. Replace the eight field `updateMyProfile` with one mutation that takes the whole editable field set, reads the stored status, and branches on it, so a pending visitor, a sent back visitor and a verified member all travel the same code path and both apps call the same function.

**Pros**:
- Every schema change is additive, so phase one deploys to staging without a migration and live rows stay valid.
- One edit mutation means one validator, one authorization check and one place where the name mirror runs. F2-09 ("today only eight fields are editable") closes as a side effect rather than as separate work.
- "Resubmitted" is derived from `sentBackAt` and the status, so no second field can disagree with the first.
- Fits the budget. Nothing here is rework; it is all new surface on top of code that stays as it is.

**Cons**:
- `profileStatus` becomes a three value machine read in about twenty places, and every one of them now has to mean "is this `verified`" rather than "is this not pending". A future reader who assumes two values will be wrong.
- One function correct in three states is the single highest risk piece of the feature. It needs tests precisely because it is convenient.
- Flat fields are not the embedded approval state shape the project's own data model conventions describe, so the convention and the code stay out of step.

### Option 2: Move to the embedded approval state object, with separate edit mutations per state

Replace `profileStatus`, `verifiedBy` and `verifiedAt` with the `{ status, verifiedBy?, verifiedAt?, note? }` object that `AGENTS.md` documents as the project's approval state convention and that `packages/shared/src/schemas/profile.ts` already defines as `approvalStateShape` without anything using it. Keep the pending and verified edit paths as separate mutations so neither has to branch.

**Pros**:
- Correct by the project's own written convention, and it would finally put the unused shared Zod shape to work.
- Every record needing verification would then look the same, which is the whole point of having the convention.
- Two separate edit mutations each read straightforwardly, and a defect in the pending path cannot reach a verified member's data.

**Cons**:
- It rewrites all twenty readers of `profileStatus` and needs a migration shipped in the same push as the schema change, against a deployment pipeline that goes straight to staging. That is the riskiest thing this feature could do, for no behaviour the member sees.
- Two edit mutations means the thirty field validator, the authorization check and the name mirror all exist twice, which is the contract drift `AGENTS.md` explicitly warns against.
- The budget is about eight hours. This option spends a sizeable part of it on refactoring rather than on any of the eighteen requirements.

### Option 3: A separate `profileReviews` table and a review service layer

Keep `profileStatus` as a status marker and move every review action into its own table: one row per verify or send back, carrying actor, action, reason and timestamp. Reads join the latest row.

**Pros**:
- Full, queryable review history with no effort, including how many rounds a profile took and which reviewer asked for what.
- The profile row stays clean, carrying no review state beyond the current status.
- Natural home for anything review related added later, such as a reviewer's private note.

**Cons**:
- It duplicates `activityLogs`, which already records exactly this by convention and already has the `by_target` index from spec 0008. Two audit trails that must agree is worse than one.
- Every read of "what is the current state" becomes a join, including the review queue, the mobile route gate and the sent back list.
- A2-03 asks a reviewer to see the earlier reason. That is one field. A table is a large answer to a small question.

### Option 4: Minimal fix, no new state at all

Add `sentBackReason` and `sentBackAt` to the profile, leave the status at two values, and treat "sent back" as a `pending_verification` row with a reason attached.

**Pros**:
- The smallest possible change. No union widening, so none of the twenty readers are touched and a rollback is free.
- Fastest to build by a wide margin.

**Cons**:
- A sent back profile stays in the review queue, so a reviewer keeps seeing work that is not theirs and has no way to tell a fresh submission from one they already returned. That is the opposite of what A2-03 asks for.
- "Sent back" and "resubmitted" become indistinguishable, since both are a pending row with `sentBackAt` set. The marker A2-03 needs cannot be derived.
- It saves a few hours now and puts the state back later anyway, once the queue becomes unusable.

## Rationale

Option 1 is chosen because the forces in Context point at it almost unanimously. The deployment pipeline pushes schema to staging on every merge to `main`, so the cheapest safe change is the additive one, and Option 1 is the only option whose schema change needs no migration at all. The eight hour budget against three blocked downstream features means the work has to go into the eighteen requirements rather than into reshaping code that already works, which rules Option 2 out even though Option 2 is the one that matches the project's own documented convention. That mismatch is real and is recorded as a follow up rather than resolved by a refactor nobody asked for: either the convention earns its place somewhere or the unused shared shape should be deleted.

Option 4 fails on A2-03 specifically. The requirement is not "tell the member why", which Option 4 could do, but "the reviewer sees resubmitted profiles marked Resubmitted, with my earlier reason". That needs sent back profiles out of the queue and resubmissions distinguishable from them, and two status values cannot express three states. It would also be the second time this lifecycle was built one state short.

Option 3 loses to a fact about the repository rather than to a principle: `activityLogs` is already the append only trail for every consequential state change, already indexed by target since spec 0008, and already where every other feature writes its history. Adding a second trail for one domain means two records that have to agree, and the thing it would buy, a reviewer seeing the earlier reason, is one field on the row.

Within Option 1 the shape of the edit path took two attempts. The first draft had one state aware mutation for all three states, reasoning that the field set is identical and that three copies of a thirty field validator, an authorization check, a mentorship gate and a name mirror is how rules get fixed in one place and missed in two. That reasoning still holds, but the design did not: `updateMyProfile` carries profile fields only, and AC-6 promises that a pending or sent back person edits their children, leadership rows and Areas of Service claims, which live in three other tables. One mutation could not satisfy its own acceptance criterion.

The split that replaced it is by **how a person edits**, not by state for its own sake. `resubmitProfile` takes a whole submission, because a pending or sent back person reopens the whole wizard and saves it at once; it reconciles the other tables by id and owns the resubmission. `updateMyProfile` takes a field or two, because that is what a verified member does from a settings screen. Two entry points, each matching a real interaction, and the duplication worry is answered by both reusing the same validator and the same name helper rather than by forcing one function to do both jobs. The tests in AC-30 are still the condition on which this rests.

Two field level exclusions came out of the same review and are worth recording, because both were latent bugs in the first draft. `clanId` is removed from `updateMyProfile` entirely: left in, it gave the field two writers, and the `updateMyProfile` one would have skipped `changeMyClan`'s elder notices and audit entry without anyone noticing. And the mentorship gate blocks movement **away** from a confirmed `completed`, not just toward it: without that, a member could erase an Administration confirmation nobody reviewed, which would make F2-14's gate one way the moment it shipped.

The photo half of F1-07 had to be redesigned outright. The first draft mirrored name and photo the same way, skipping the copy when the profile held an R2 key so `users.profilePictureUrl` never held something its readers cannot render. That protects `users` and defeats the requirement: an uploaded photo then reaches the profile screens and nothing else, which is precisely the split screen symptom F1-07 exists to remove. Mirroring a resolved URL instead is worse, because `resolveMediaUrl` returns a signed URL that expires after seven days, so every avatar in the app would break at once a week after the change that caused it. So name is mirrored on write and photo is resolved on read, by the server reads that feed avatars, with no client reading the raw field any more. The asymmetry is forced by how the two values are stored, not chosen.

Two smaller calls. The stale verify guard was added because the alternative is a silent data loss that nobody observes: a reviewer holding a screen from a minute ago verifies, and a correction the person just typed is replaced by the older value, with no error and no log entry saying so. One extra argument and one comparison is a very cheap insurance premium at GA tier, though it does mean every caller of `verifyProfile` changes at once. And members were given free control of their own clan because F2-08 says so plainly; the churn risk is real but is answered by telling both elders rather than by building a request flow this feature has no budget for.

## References

Not included. This decision rests entirely on the project's own SRS, build plan, existing Convex code and specs 0007, 0008, 0012 and 0013, with no external library or provider choice to cite.
