# 0014d. One reviewer name, honest wording, and the two bugs

Child of [0014 Profile lifecycle core](index.md). Covers F2-02, A2-05, F2-11, F2-12 and acceptance criteria **AC-26** to **AC-29**.

## Summary

Four small changes with no shared machinery, grouped because they are all the same kind of work: making what a person reads match what is actually true. The church is called three different things across the app, a pending visitor is congratulated on joining a family they have not joined yet, every profile claims mentorship is "Completed" whatever the data says, and spouse search hands out email addresses.

None of these is hard. Two are one line each. They are listed as their own child because they touch files the other children do not and can be built, verified and reviewed on their own.

## Design

### One reviewer name (AC-26, A2-05)

Members currently hear about three different bodies, none of them the right one:

| Where | What it says now |
|---|---|
| `apps/mobile/app/profile-completion/pending.tsx` | "your profile is with **the elders** for review" |
| `apps/mobile/components/member-gate.tsx` | "Your profile is with **the elders** for verification" |
| `apps/mobile/app/profile.tsx`, the pending banner | "**a church admin** will verify it" |
| `convex/memberProfiles.ts`, the N05 verified notice | "verified by **the church office**" |

All four become "the Administration team", from `REVIEWER_NAME` in the shared constants file this feature adds, with a unit test. Then check and correct the two places a reviewer name might also appear: the email templates in `convex/lib/emails/templates.ts`, and `PORTAL_WORK_COPY.profile_review` in `packages/shared/src/constants/notifications.ts`.

The `member-gate.tsx` string was missing from the first draft of this list, and the profile banner was quoted wrongly as "the church office" when it actually says "a church admin". Four different names for one body, across four files, in a requirement whose whole point is that there should be one.

A constant rather than three corrected literals, because A2-05 is about these never diverging again, and three literals have already diverged once.

The constant is also what `sendProfileBack` uses for the name the member reads, never the reviewing actor's own name. That is the whole point of A2-05: a member hears from the body, not from an individual, so no reviewer becomes personally the face of a refusal.

### No membership language before verification (AC-27)

`pending.tsx` today is a celebration: a gold check mark, "You're in the family!", and "Thank you, Saint, your profile is with the elders for review. You'll gain full member access once it's approved. Welcome home."

F2-02 says no "welcome home" wording before verification, and it is right: the person has submitted a form, and it may yet come back to them. The screen keeps its warmth and drops the claim. It says the submission arrived, that the Administration team will look at it, and what happens next, and it now also carries the "Edit my submission" action from [0014a](0014-review-lifecycle.md).

The N05 verified notice keeps its existing wording deliberately. The comment above it in `convex/memberProfiles.ts` already explains that it says "verified" rather than "welcome to the family" because verification and official membership are meant to be two distinct moments. That reasoning is correct and this child only changes "the church office" to "the Administration team" inside it.

Follow the `klt-cyber-brand` skill for the rewritten screen.

### The mentorship bug (AC-28, F2-11)

`apps/mobile/app/profile.tsx:312`:

```tsx
<DetailRow label="Mentorship" value="Completed" />
```

A hardcoded string. Every member's profile claims completed mentorship whatever `mentorshipStatus` holds, which matters because mentorship is what the SRS treats as the line between verified and fully a member.

**This file has no mentorship label map.** The first draft of this spec said it did, pointing at line 34. That map is `LEAD_STATUS_LABEL`, for leadership levels, and the four maps in lines 26 to 37 are sex, marital status, leadership level and leadership status. There is nothing to reuse here.

The correct map exists once in the repository, as `MENTORSHIP_STATUS_LABEL` in `apps/mobile/app/profile-completion/review.tsx`. Lift it into the shared copy constants this feature already adds and have both files import it, rather than writing a third copy in `profile.tsx`. The labels are member facing copy, which is exactly what that constants file is for.

Check the roster read while in the area: spec 0012's AC-10 required the real status there, so it should already be correct, and if it is this bug lives in exactly one place.

### The spouse search privacy fix (AC-29, F2-12)

`convex/users.ts`'s `searchUsersForSpouseLink` today reads the whole `users` table, matches on first name, last name, full name **and email**, and returns `email` in every result. Its own comment explains that it is deliberately not limited to verified members, because a spouse may be registered without having completed their own profile.

F2-12 says the opposite: name and photo of verified members only, never email. The SRS wins, and the comment has to be rewritten rather than left standing above the changed code, or the next reader will trust it.

The rewritten query:

1. `requireUser`, minimum query length unchanged at 2, result cap unchanged at 20.
2. Read `memberProfiles` on `by_profileStatus` with `verified`, not the `users` table. That makes the verified filter part of the index read instead of an in memory check, the same reasoning spec 0010 used for the `by_clanId_profileStatus` index.
3. Match on `firstName`, `lastName` and the two combined, case insensitively as today. **Not email**, so an address cannot even be used to find someone.
4. Exclude the caller. Exclude any row whose `users` row has `deletedAt` set, which spec 0008's AC-22 requires and the current version already does. That is a `db.get` per candidate row, which is why the cap is applied after sorting rather than after the whole scan.
5. Sort the matches by last name then first name, the same order the roster reads use, so the list is stable between identical searches rather than following insertion order.
6. Return `{ userId, fullName, photoUrl }` and nothing else. `photoUrl` goes through `resolveMediaUrl`, since an uploaded photo is an R2 key. A profile whose first and last name are somehow both blank is skipped rather than returned as an empty row, since a nameless result is unpickable and the free text fallback covers that person.

Names come from `memberProfiles`, not `users`, because the profile holds the version a reviewer has seen and may have corrected. After [0014b](0014-self-service-editing.md)'s mirror the two agree anyway, but the profile is the authoritative copy.

**What is lost, stated plainly.** Two verified members with the same name are now distinguishable only by photo. The step already has a free text "not registered" fallback for a spouse who has no account, and that same fallback covers a visitor who cannot tell two people apart, so nobody is blocked. Adding clan as a hint was considered and rejected: it discloses one member's clan to any signed in visitor searching names, which is a new disclosure the directory rules never granted, in a change whose whole purpose is to disclose less.

The deliberate consequence is that a spouse who is registered but not yet verified can no longer be linked. That is F2-12 as written, and the unlinked name fallback is the intended path for it.

### Files this child touches

| File | Change |
|---|---|
| `packages/shared/src/constants/` | `REVIEWER_NAME`, the lifecycle copy and the lifted `MENTORSHIP_STATUS_LABEL` (the file itself is created in slice 1) |
| `apps/mobile/app/profile-completion/pending.tsx` | the rewritten screen, AC-26 and AC-27 |
| `apps/mobile/components/member-gate.tsx` | the "with the elders" string, AC-26 |
| `apps/mobile/app/profile-completion/review.tsx` | its local mentorship map replaced by the shared import, AC-28 |
| `apps/mobile/app/profile.tsx` | the pending banner's "a church admin", and the mentorship row reading the real value through the shared map, AC-26 and AC-28 |
| `convex/memberProfiles.ts` | the N05 notice body's reviewer name, AC-26 |
| `convex/lib/emails/templates.ts` | the reviewer name wherever it appears, AC-26 |
| `packages/shared/src/constants/notifications.ts` | `PORTAL_WORK_COPY.profile_review` if it names a body, AC-26 |
| `convex/users.ts` | the rewritten search and its rewritten comment, AC-29 |
| `apps/mobile/app/profile-completion/family.tsx` | the result rows, which lose the email line and gain the photo, AC-29 |

### Tests

- the shared constants test asserts `REVIEWER_NAME` and that the lifecycle copy strings are non empty
- a search payload is inspected field by field and carries no `email` key at all
- an unverified member matching the query does not appear; a verified one does
- the caller never appears in their own results
- a member with `deletedAt` set does not appear
- a one character query returns nothing, and more matches than the cap return exactly the cap

The mentorship row and the copy changes are checked in `verify.md` rather than by a unit test, since they are rendered strings and UI tests are deferred for this project.
