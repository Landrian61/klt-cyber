# 0014b. Self service editing, one source of truth for name and photo

Child of [0014 Profile lifecycle core](index.md). Covers F2-06, F2-09, F1-07, the sharing clause of F2-01, and acceptance criteria **AC-11** to **AC-18**.

## Summary

A verified member can edit eight of their roughly thirty profile fields, from the web portal only, and not one from their phone. This child replaces that eight field mutation with one that takes the whole editable set, serves all three lifecycle states, and is called by both apps, so the two surfaces cannot drift. It also fixes the quieter problem underneath: name and photo live in two tables that nothing keeps in step, which is why a reviewer correcting a name during verification changes it on some screens and not others.

## Design

### Two mutations, split by how a person actually edits

The first draft of this spec had one state aware mutation for all three states. The cross check killed it: `updateMyProfile` carries profile fields only, so it could not satisfy AC-6's promise that a pending or sent back person edits their children, leadership rows and Areas of Service claims. The split follows how editing actually happens in each state.

**`memberProfiles.resubmitProfile`**, for a `pending_verification` or `sent_back` person reopening the whole wizard. Same argument shape as `submitProfile`: profile fields plus `children`, `leadershipEntries` and `departmentIds`. Specified in [0014a](0014-review-lifecycle.md), because the resubmission is a review lifecycle concern.

**`profile.updateMyProfile`**, for a verified member changing a field or two. This is what the rest of this child covers.

```
updateMyProfile({ ...editable profile fields minus clanId, each optional, clearFields? })
  → { ok }
```

It reuses the `profileEditsPatchValidator` shape from `convex/memberProfiles.ts`, minus `clanId`, rather than defining the same thirty fields a second time.

The handler, in order:

1. `requireUser`, then load the caller's own profile through `by_userId`. There is no profile id argument, so there is nothing to forge.
2. Reject when there is no profile, and reject a `sent_back` row: that state saves through `resubmitProfile`, so a one field save can never resubmit by accident.
3. Apply the mentorship gate below.
4. Drop undefined values, unset everything named in `clearFields`, and patch the row with `updatedAt: now`.
5. Run `syncIdentityToUser` in the same mutation (**AC-14**).
6. Log `profile.edited`. No notice: a verified member's own edit concerns nobody else, and a pending row's change is read live by the queue.

Both apps call this one function, so F2-09's "today only eight fields are editable" closes without separate work, and a field added later appears on both surfaces or neither (**AC-12**).

### What this mutation deliberately cannot do

**`clanId` is not in its arguments.** Leaving it in would have given the field two writers, and the `updateMyProfile` one would have skipped `changeMyClan`'s elder notices and its audit entry entirely. `changeMyClan` in [0014c](0014-service-and-clan.md) is the only writer.

**`clearFields`, not an implicit blank.** An omitted value means unchanged, which is what the current eight field version does and what every caller expects. Without an explicit clearing route a member could never remove a phone number, an address, a next of kin or an unlinked spouse name once set. `clearFields` is an array over a literal union of the genuinely optional fields; the ones the row requires (`firstName`, `lastName`, `sex`, `maritalStatus`, `mentorshipStatus`) are not in that union, so clearing them is a type error rather than a runtime surprise.

### The mentorship gate

F2-06 says a member edits mentorship status. Its own rule excludes F2-14, which makes a change to `completed` wait for Administration to confirm it, and F2-14 is not in this feature. So the member's own route across the `completed` line is blocked in **both** directions.

```
incoming === "completed" && stored !== "completed"  →  reject MENTORSHIP_NEEDS_REVIEW
incoming !== "completed" && stored === "completed"  →  reject MENTORSHIP_CONFIRMED
```

Everything else saves immediately and is logged (**AC-16**).

Both comparisons are against the **stored** value, not just the incoming one. The first direction is the obvious rule. The second is less obvious and was missed in the first draft: without it a member could set themselves back from a reviewer confirmed `completed` to `enrolled`, erasing a confirmation nobody reviewed, which would make F2-14's gate one way the moment it ships.

Re saving an unchanged `completed` value is allowed, and that exception is not a nicety. A verified member whose reviewer already set `completed` submits the whole form with that value in it, so a naive check on the incoming value alone would make their form unsavable forever, for any field.

A reviewer may still set either value through `verifyProfile`, which is unchanged. The interface says Administration confirms that step, in the shared copy, and the picker shows `Completed` as unavailable rather than letting a member select something the server will refuse.

### The identity mirror

`users.firstName`, `users.lastName` and `users.profilePictureUrl` are written at sign up from the authentication provider. `memberProfiles.firstName`, `lastName` and `photoUrl` are what the person typed and a reviewer may have corrected. Nothing keeps them in step, and several surfaces read each: notification bodies, the admin member lists and the account panel read `users`; the profile screens read `memberProfiles`.

F1-07's own wording is "profile changes update the account copy", so the profile is authoritative. But name and photo cannot be solved the same way, and the first draft of this spec got the photo wrong.

#### Name: mirrored on write

```
syncIdentityToUser(ctx, userId, { firstName?, lastName? })
```

Called from all four writers: `submitProfile`, `resubmitProfile`, `verifyProfile`'s `edits` patch and `updateMyProfile`. Inside the same mutation, so there is no window where the two disagree (**AC-14**).

A name is a durable string, so a copy in `users` stays true until the next write changes it. There are no other writers to worry about: `auth.ts` writes the name once at sign up, `accountDeletion.ts` clears it on anonymizing, and `churchAdminSeed.ts` seeds it. Nothing else touches those fields.

#### Photo: resolved on read, never mirrored

`memberProfiles.photoUrl` holds either an R2 object key, for an uploaded photo, or an absolute URL, for one that came from a Google account. `users.profilePictureUrl` only ever holds an absolute URL, and its readers render it directly.

The first draft said the helper would copy the photo across only when it is an absolute URL, which protects `users` from holding an unrenderable key but **defeats F1-07 entirely**: an uploaded photo then never reaches `apps/mobile/app/profile.tsx`, the three portal layouts' avatars, `UsersClient`, `UserDetailClient`, `ActivityClient` or `DashboardClient`, all of which read the raw `users` field. The member would see their new photo on some screens and their old Google avatar on others, which is the exact symptom F1-07 exists to remove.

Mirroring a resolved URL instead does not work either: `resolveMediaUrl` returns an R2 signed URL with a seven day expiry, so a stored copy rots in a week and every avatar in the app breaks at once, long after the change that caused it.

So the photo is resolved per read. Every server read that feeds an avatar returns one already resolved `photoUrl`:

```
profilePhoto = profile?.photoUrl ? await resolveMediaUrl(profile.photoUrl)
                                 : user.profilePictureUrl
```

| Reads to change | Clients to change |
|---|---|
| `profile.getMyAccountCore` | `apps/mobile/app/profile.tsx` |
| `convex/admin.ts`'s user projection | `apps/mobile/app/profile-completion/personal.tsx` |
| `memberProfiles.listVerifiedMembersWithRoles` | the three portal layouts' `avatarUrl` |
| the roster reads | `UsersClient`, `UserDetailClient` |
| `apps/admin/lib/activity.ts`'s actor shape | `ActivityClient`, `DashboardClient`, `RosterClient` |

Two portal reads (`DepartmentMembersClient` and `RosterClient`) already write `profile.photoUrl ?? user.profilePictureUrl`, which is the right preference order but unresolved, so an R2 key reaches the `img` tag. They move onto the resolved field like the rest.

After this, no client reads `users.profilePictureUrl` directly. The field stays in the schema as the Google fallback, which is all it was ever good for.

The failure mode of missing one of the eleven clients is a stale avatar, not a crash, which is the quiet kind of defect. The verify step therefore uploads a photo once and then walks every surface that renders one.

### The backfill

One migration repairs **name** drift that already exists, in `convex/profileIdentityMigration.ts`, following the shape of `convex/leadershipMigration.ts` and `convex/userStatusMigration.ts`. It does not touch `profilePictureUrl`, which the read side now solves.

For each `memberProfiles` row: load the `users` row, skip it when `deletedAt` is set (an anonymized row must stay anonymized, per spec 0008), skip a profile whose `users` row is missing, and patch only the fields that actually differ. It pages through the table rather than collecting it whole, so it does not grow into one oversized mutation, reports counts of rows read, patched and skipped, and is safe to run more than once (**AC-15**).

It runs on dev, then staging, then production, and only after the helper is deployed, so new drift has already stopped before anything tries to repair the old.

The one judgement embedded here: where the two copies differ, the profile wins. There is no product reason for them to differ and F1-07 says they must not, but the counts make any surprise visible rather than silent.

### Children and leadership rows

These live in their own tables, keyed by `by_parentUserId` and `by_userId`, so a **verified** member edits them one row at a time through their own mutations (**AC-13**). A pending or sent back person sends the whole set through `resubmitProfile`, which reconciles by `_id`; these row mutations are the verified member's equivalent.

Each one also patches `memberProfiles.updatedAt`, even though it writes a different table, so the reviewer's stale guard in AC-7 covers the whole submission rather than only the profile row's own fields.

| Mutation | Checks |
|---|---|
| `children.addMine` | `requireUser`, caller's own profile exists |
| `children.updateMine` | the row's `parentUserId` is the caller |
| `children.removeMine` | the same |
| `leadershipProgress.addMine` / `updateMine` / `removeMine` | the row's `userId` is the caller |

Each writes its own `activityLogs` row (`child.added` already exists; `child.updated`, `child.removed`, `leadership.updated` and `leadership.removed` are new).

**Row ids stay stable.** No mutation deletes and recreates a row to apply a change. The alternative, passing full arrays and reconciling by diffing the way `submitProfile` writes them at submission, would churn `_id` on every save and break any future reference to a child, which Children's Church age bracket work will want.

`leadershipProgress.addMine` and `updateMine` must never write the legacy `in_progress` status, which `convex/schema.ts` still accepts only so pre rename rows pass validation. Use the narrower validator already defined in `convex/memberProfiles.ts` for exactly this reason, not the schema's own union.

### Directory sharing

`memberProfiles` gains an optional `directorySharing` boolean. **Absent reads as private**, which is why it needs no migration and why no row is ever disclosed because a value is missing (**AC-17**).

Two write surfaces: the sharing question on the wizard's existing last step, and `profile.setDirectorySharing({ directorySharing })` for a verified member to change it afterwards. The argument name matches the field; the first draft called it `shareInDirectory`, which would have been a needless translation at the boundary.

**The wizard stays seven steps.** F2-01 says "the 7-step wizard" and "the last step asks for the directory sharing choice" in the same breath, so the question goes onto the existing review step, not a new eighth one.

Nothing in this feature reads it for a directory. Feature 13 builds that, and F2-13 is not closed until it does.

### Replacing an uploaded file

Three fields hold uploaded objects: the profile photo, `mentorshipProofUrl`, and `proofUrl` on each leadership row. All three follow the same rule (**AC-18**).

Uploading uses the existing `apps/mobile/lib/r2-upload.ts` path, the same one the wizard already uses. After the new key is patched onto the row, the previous object is deleted, with two constraints:

- **The delete runs in an internal action the mutation schedules**, not in the mutation itself, because a Convex mutation cannot reach R2. This is the pattern `convex/accountDeletion.ts` already uses for the same reason.
- **Only when the previous value was an R2 key.** Reuse the existing `toR2Key` helper rather than writing a second test for what a key looks like, so a Google avatar or a seeded Unsplash URL is never handed to the bucket.

Deleting after the commit, not before, follows spec 0008's ordering: a failed delete leaves an orphan object, while a delete before the commit can leave a row pointing at nothing. The first draft covered only the photo and would have leaked every replaced proof file.

### Portal Settings

`apps/admin/components/account/AccountPanel.tsx` currently calls the eight field mutation. It moves onto the replacement and grows to the full field set, following the `klt-cyber-web-ui` skill and reaching for `field`, `input`, `textarea`, `select`, `switch` and `DatePicker`, all of which already exist in the repo (**AC-12**).

### Tests

- a verified member's edit saves, logs `profile.edited`, and leaves the status alone
- a `pending_verification` edit through `updateMyProfile` saves and logs, and writes no notification row
- `updateMyProfile` rejects a `sent_back` row, so a field level save cannot resubmit
- `updateMyProfile` carries no `clanId` argument, so a clan change through it is a type error
- `clearFields` unsets an optional field, and naming a required field is a type error
- mentorship `enrolled` to `completed` is rejected with `MENTORSHIP_NEEDS_REVIEW`; `completed` to `enrolled` is rejected with `MENTORSHIP_CONFIRMED`; `completed` to `completed` saves
- a name change leaves `users` and `memberProfiles` agreeing
- a read feeding an avatar returns a resolved URL for an R2 key profile photo, falls back to `users.profilePictureUrl` when the profile has none, and `users.profilePictureUrl` is never patched by any profile write
- the backfill patches a drifted name, skips a `deletedAt` row, skips a profile with no `users` row, leaves `profilePictureUrl` alone, and a second run patches nothing
- `children.updateMine` and `leadershipProgress.updateMine` each reject a row belonging to somebody else with `NOT_YOUR_ROW`
- a child edit leaves the row's `_id` unchanged and bumps `memberProfiles.updatedAt`
- replacing a photo, a mentorship proof and a leadership proof each schedules a delete of the previous key, and replacing a value that was an absolute URL schedules nothing
