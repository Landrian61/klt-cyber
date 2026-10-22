# Verify: account deletion · spec 0008 · updated 2026-10-21

_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Nothing here has been run yet: the build is complete and green on typecheck, lint and unit tests, but no part of it has been exercised against a live Convex deployment. Push the schema first (`pnpm convex`), then work down this list.

**Before anything else:** every destructive step below really does delete an account, and there is no undo. Use throwaway accounts on the dev deployment, never a real one.

## Commands

- [x] `npx tsc -p convex/tsconfig.json --noEmit` → no output → AC-3, AC-22
- [x] `npx tsc -p apps/mobile/tsconfig.json --noEmit` → no output → AC-1
- [x] `npx tsc -p apps/admin/tsconfig.json --noEmit` → no output → AC-14
- [x] `pnpm test` → 112 pass (52 shared, 60 convex) → AC-14, AC-15, AC-16
- [x] `pnpm --filter admin build` → `/delete-account` and `/delete-account/confirm` both listed → AC-14
- [x] `pnpm convex` → pushes `users.deletedAt`, `users.identityDeletePending`, `users.by_identityDeletePending`, `accountDeletionRequests` (`by_tokenHash`, `by_email`) and `activityLogs.by_target` with no schema error against live data → AC-3, AC-15
- [x] In the Convex dashboard, confirm all three schema changes are live (the two new `users` fields, the new table, both new indexes) — the push output alone is not the check → AC-3, AC-15

## Slice 0 — the thing everything else assumes

Statically de risked already: `components.betterAuth.adapter.deleteOne`/`deleteMany` both exist, `deleteMany` is paginated, and the component's delete trigger dispatches via optional chaining with only `user.onCreate` registered. The live run still owes.

- [x] Delete a throwaway account in app, then check the Better Auth component tables in the dashboard → its `user`, `session` and `account` rows are all gone → AC-10
- [x] Same run → the app's own `users` row still exists, anonymized, NOT deleted (this is what proves the component's delete trigger did not cascade) → AC-3, AC-10

## UI / manual — the in app door

- [ ] Open My Profile → a quiet "Delete account" text link sits under "Sign out", not a second red button → AC-1
- [ ] Tap it → the screen states what is removed, what is kept, and that it cannot be undone, and no password field or delete button is reachable above that copy → AC-1
- [ ] On arrival, the "Delete my account" button is disabled until a password is typed → AC-1, AC-2
- [x] Enter a wrong password → refused with "That password is not right", and in the dashboard the `users` row, `memberProfiles`, roles and memberships are all untouched → AC-2, AC-23
- [ ] Enter the correct password → the app returns to the signed out welcome screen rather than erroring or hanging on the deleted account → AC-10
- [x] Immediately after, try to sign in with the old password → refused → AC-10, AC-19
- [ ] Set up a member with a profile, a child, a department membership and a clan role, delete them, then read every table: `users` anonymized; `memberProfiles`, `children`, `leadershipProgress` rows gone; `roleAssignments` `revoked` with `note` empty; `departmentMemberships` `removed` with `positionTitle` empty; `notificationReads`/`notificationDismissals` gone → AC-3, AC-4, AC-7, AC-8, AC-20
- [x] A visitor with no member profile at all deletes cleanly, with no error from the missing profile → AC-3, AC-4
- [ ] A user holding both `clan_elder` and `hod` deletes → both rows are revoked, neither is deleted → AC-7
- [ ] Before deleting, note the profile photo's R2 key; after, confirm the object is gone from the bucket → AC-5
- [ ] A user whose photo is a Google avatar (an absolute URL, not a key) deletes without an R2 error, and nothing is attempted against the bucket for it → AC-5
- [x] Member A lists Member B as spouse; delete B → A's `memberProfiles.spouseUserId` is cleared and A's profile still loads → AC-6
- [ ] As the only active System Admin, open the delete screen → it refuses up front with the reason, shows no password field and no delete button, and nothing is written → AC-9, AC-23
- [ ] Appoint a second System Admin, then retry → the screen now offers deletion → AC-9
- [ ] A Google-only account opens the screen → it offers "Email me a deletion link" and never shows a password field at all → AC-17
- [ ] That emailed link deletes the account → AC-17
- [x] After deletion, the account's `activityLogs` entries still exist, a new `account.deleted` entry is present, and its metadata reads `{ selfService: true, viaPublicPage: false }` with `viaPublicPage` intact and not `"[removed]"` → AC-13
- [x] A deletion confirmation email arrives at the real address, not at `deleted-...@deleted.invalid` → AC-12

## UI / manual — the public door

- [x] Visit `/delete-account` signed out → the page loads rather than redirecting to `/sign-in` → AC-14
- [ ] Visit it while signed in in the same browser → it still loads, and is not bounced away → AC-14
- [x] Submit a real member address → the fixed reply appears → AC-14
- [x] Submit an address with no account → byte identical reply, and no email is sent → AC-14
- [x] Submit the same address four times in an hour → the fourth reply is byte identical to the first and no fourth email arrives → AC-16
- [ ] Open the emailed link → the confirm page restates what goes and what stays, and deletes only on the button press → AC-1, AC-15
- [ ] Confirm → the account is deleted and `activityLogs` metadata reads `viaPublicPage: true` → AC-13, AC-15
- [x] Follow the same link a second time → "already been used" → AC-15
- [ ] Request a link, wait past the expiry (or edit `expiresAt` back in the dashboard), then follow it → "expired" → AC-15
- [ ] Open one link in two tabs and confirm both at the same moment → exactly one succeeds, the other is refused → AC-15
- [x] `/delete-account` and `/delete-account/confirm` both serve `noindex` → AC-14
- [ ] View source of the deletion request email → it greets "Hello there," with no name, and tells an unsolicited recipient to ignore it → AC-15

## Failure and recovery

- [ ] Force the identity destroy to throw (temporarily break `destroyIdentity`), then delete an account → the deletion still reports success, the row is anonymized, `identityDeletePending` stays `true`, and Sentry receives the error → AC-18
- [x] In that state, try to sign in with the surviving credential → refused as signed out, even though the Better Auth identity still exists → AC-19
- [x] Then run `npx convex run accountDeletion:retryIdentityDelete` → it reports `settled: 1`, the component rows go, and `identityDeletePending` is cleared → AC-18
- [ ] In the Convex dashboard, the "account deletion identity retry" cron is registered and shows an hourly schedule → AC-18
- [ ] Leave a stuck identity in place over one cron tick → it is settled without anybody running the sweep by hand → AC-11, AC-18
- [ ] Delete a user carrying several hundred `notificationReads` and `activityLogs` rows → it completes without a transaction limit error, and any scheduled `continueCleanup` finishes the remainder → AC-13
- [ ] Same run, with more than 200 `activityLogs` entries carrying an unlisted metadata key → `continueCleanup` scrubs the entries BEYOND the first page too, and stops rescheduling itself once it has walked them all → AC-13, AC-24
- [ ] Same run → the `account.deleted` entry still reads `viaPublicPage` after the extra cleanup passes, not `"[removed]"` → AC-13

## Regressions this change could cause

- [ ] After a deletion, the System Admin directory and the dashboard counts both exclude the deleted row → AC-22
- [x] The spouse picker no longer returns the deleted user → AC-22
- [ ] Send a whole-church notification after a deletion → the deleted user is not in the audience → AC-22
- [ ] Request a password reset for a deleted address → no email is sent → AC-22
- [x] Sign up fresh with the deleted account's original address → it succeeds, and the new account is a clean visitor with no profile, no roles and no children → AC-11
- [ ] A deletion link issued before that reuse, followed afterwards → it does not touch the new account (the token binds to the old `userId`, not the address) → AC-15
- [x] Request deletion for ` Member@Example.COM ` with padding and capitals → it resolves to the same account as `member@example.com` → AC-21
- [ ] Delete an account that has a registered push token → the push component's `pushTokens` row for that `userId` is gone → AC-3
- [ ] Then refuse one: wrong password on an account with a token → the token row is STILL there, since a refusal writes nothing → AC-23
- [ ] On a deployment that redacts error messages, mistype the password → the screen still says the password is wrong rather than the generic failure line, because the code travels as `ConvexError` data → AC-2

## Value sourcing — one step per row of the spec's table

These exercise where each value comes from, which is the layer a design time check cannot prove.

- [x] The anonymized address is exactly `deleted-<the row's own _id>@deleted.invalid`, and two deletions never collide → AC-3
- [ ] The `deletedAt` in the row equals the one in the confirmation email's idempotency key; delete, then re-trigger the same send, and no second email goes out → AC-12
- [ ] `r2Keys` covers all four sources: `memberProfiles.photoUrl`, `memberProfiles.mentorshipProofUrl`, `leadershipProgress.proofUrl` and a `users.profilePictureUrl` that differs from the profile photo → AC-5
- [x] `revokedBy` and `removedBy` are the leaving user's own `_id` on both doors, including the public one → AC-7
- [x] Spouse clearing finds its rows through `by_spouseUserId`: a member whose spouse link was set is cleared, and an unrelated member's profile is untouched → AC-6
- [x] Add a metadata key that is NOT on the allow list to one of the user's existing `activityLogs` entries, then delete → that value reads `"[removed]"` while an allow listed key beside it (say `roleType`) survives → AC-24
- [ ] The scrub reaches both match kinds: an entry where the user is `actorUserId`, and an entry where `targetType` is `user` and `targetId` is the user → AC-13
- [x] `precheck.hasPassword` is true for a password account and false for a Google-only one, read from the component rather than guessed → AC-17
- [ ] `precheck.blockedReason` appears only for the last active System Admin, and a revoked or already deleted admin row does not count towards keeping somebody blocked → AC-9
- [x] The stored `accountDeletionRequests.tokenHash` is a hash, and the plain token appears nowhere in the table → AC-15
- [ ] `accountDeletionRequests.userId` is resolved at issue time: issue a link, delete and reuse the address, then check the row still points at the old `userId` → AC-15
- [x] `expiresAt` minus `createdAt` is exactly `ACCOUNT_DELETION_EXPIRY_SECONDS` (3600000 ms) → AC-15
- [ ] The emailed link is `SITE_URL` + `/delete-account/confirm?token=…`; with `SITE_URL` unset, no email is sent and the public reply is unchanged → AC-14, AC-15
- [x] The rate limit counts rows via `by_email` within the hour: three requests allowed, the fourth silently not sent → AC-16
- [x] Hit, miss and rate limited replies are compared character by character and are identical → AC-14, AC-16
- [ ] Every message shown on either surface traces to a constant in `packages/shared`, with none composed at the call site → AC-14, AC-16
- [ ] The mobile confirm screen's removed/kept lists come from the shared constants and match what the deletion actually does, table by table → AC-1

## Acceptance-criteria coverage

- AC-1 … covered by the entry point, confirm screen and public confirm page steps
- AC-2 … wrong password refused, nothing written; button disabled until typed
- AC-3 … anonymized row read field by field after a real deletion, plus the schema push
- AC-4 … profile, children and leadership rows gone, including the no-profile visitor case
- AC-5 … R2 object gone after commit; absolute URL skipped; all four key sources
- AC-6 … spouse link cleared via `by_spouseUserId`
- AC-7 … roles revoked and memberships removed, never deleted, including a two-role holder
- AC-8 … notification overlay rows gone
- AC-9 … last System Admin refused up front, with the reason, and unblocked by a second admin
- AC-10 … component rows gone, signed out transition, old password refused
- AC-11 … fresh sign up on the released address produces a clean visitor
- AC-12 … confirmation email to the real address, `deletedAt` matching the idempotency key
- AC-13 … entries survive, new entry appended, both match kinds scrubbed, scale case
- AC-14 … public page reachable signed out and signed in, one fixed reply, `noindex`
- AC-15 … token single use, expiry, race, hashed storage, `userId` binding, link URL
- AC-16 … fourth request silently dropped, reply byte identical
- AC-17 … Google-only account offered the link and never a password field
- AC-18 … forced identity failure leaves the deletion standing, Sentry fires, retry settles
- AC-19 … surviving credential refused as signed out
- AC-20 … `note` and `positionTitle` cleared on the retained rows
- AC-21 … padded, mixed case address resolves to the same account
- AC-22 … directory, dashboard counts, spouse picker, notification audience, reset email
- AC-23 … wrong password and last System Admin both leave every row and file untouched
- AC-24 … an unlisted metadata key is replaced while an allow listed one survives
