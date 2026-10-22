# 0008. Account deletion

**Date**: 2026-10-21
**Status**: In Progress

## Summary

A person can delete their own account from inside the mobile app, or ask for the same thing from a public web page if they have already removed the app. Deleting does not erase the row; it anonymizes it, so church history, the giving trail and the audit log stay whole while everything personal goes. Roles are revoked, rosters are left, the sign in identity is destroyed so every session ends, and a confirmation email is sent. There is no undo and no waiting period, so the confirmation step carries the weight.

## Requirements

**User stories**:

- As a member, I want to delete my account from inside the app, so that I can leave without my personal details staying behind.
- As a former member who has already removed the app, I want to request deletion from a web page, so that I am not forced to reinstall in order to leave.
- As the church, we want deletion to keep an anonymous record, so that statistics and the audit trail survive a person leaving.

**Acceptance criteria**:

- **AC-1**: A signed in user reaches Delete account from My Profile settings and sees a screen stating what is removed, what is kept, and that it cannot be undone, before any destructive action is offered.
- **AC-2**: An in app deletion completes only after the user enters their current password correctly.
- **AC-3**: Deletion anonymizes the `users` row in one atomic transaction: `email` becomes `deleted-<userId>@deleted.invalid`, `firstName`, `lastName` and `profilePictureUrl` are cleared, `profileCompleted` becomes `false`, `deletedAt` is set, and `identityDeletePending` is set true.
- **AC-4**: Deletion removes the `memberProfiles` row, every `children` row and every `leadershipProgress` row belonging to that user.
- **AC-5**: The R2 objects behind the profile photo, the mentorship proof and the leadership proof are deleted **after** the mutation commits, using the key list the mutation returns. A failure at this point leaves orphaned bytes, never a deleted file beside a live account.
- **AC-6**: Any other member's profile referencing the deleted user through `spouseUserId` has that reference cleared.
- **AC-7**: Every active `roleAssignments` row becomes `revoked` with `revokedAt` and `revokedBy` set, and every active `departmentMemberships` row becomes `removed` with `removedAt` and `removedBy` set. Neither row is deleted.
- **AC-8**: Every `notificationReads` and `notificationDismissals` row for the user is deleted.
- **AC-9**: The last remaining active `system_admin` cannot delete their own account, and is told why.
- **AC-10**: Deletion destroys the Better Auth identity, which ends every active session, and the app returns to the signed out state.
- **AC-11**: After deletion the address is free: a new account can be created with it, starting as a visitor with no profile.
- **AC-12**: A confirmation email sends through the existing `account_deleted` template, using an address, first name and `deletedAt` captured before the row was anonymized, since `sendAccountDeleted` needs all three for its idempotency key.
- **AC-13**: One `activityLogs` entry records the deletion, and that user's existing `activityLogs` metadata is scrubbed, while the entries themselves survive.
- **AC-14**: A publicly reachable page accepts an email address and returns the same confirmation wording whether or not an account exists.
- **AC-15**: The public request sends a link through a new `account_deletion_requested` template, valid for one hour and usable once. The token is bound to the `userId` resolved at issue time, not to the address, and is claimed inside the deletion mutation so two concurrent confirmations cannot both succeed.
- **AC-16**: The public request endpoint is rate limited per address, and a rate limited reply is indistinguishable from an accepted one.
- **AC-17**: A user with no password credential is offered the emailed link instead of the password prompt, and the screen knows which it is before the user types anything.
- **AC-18**: If destroying the Better Auth identity fails after the Convex writes have committed, the deletion still stands, the failure reaches Sentry, and `identityDeletePending` leaves a selector a retry can find.
- **AC-19**: A `users` row with `deletedAt` set cannot authenticate. `convex/lib/authz.ts` treats it as signed out even where a Better Auth credential has survived.
- **AC-20**: `roleAssignments.note` and `departmentMemberships.positionTitle` are cleared on the retained rows, since both are free text that can name a person.
- **AC-21**: Email addresses are trimmed and lowercased before storage and before lookup, on every path into this feature.
- **AC-22**: Every existing query that counts or lists users excludes rows with `deletedAt` set.
- **AC-23**: The last System Admin check and the password or token check all complete before any irreversible step, so a refusal leaves every row and every file untouched.
- **AC-24**: The metadata scrub denies by default: only keys on a named structural allow list survive, so a metadata key added in future is scrubbed rather than leaked.

## Decision

**Chosen option**: Option 1: Immediate anonymize in place, reached through two doors.

Deletion anonymizes the `users` row and destroys everything personal around it at once, with no grace period, reachable either from inside the app behind a password or from a public page behind a one hour emailed link.

**Implementation skills**: `shadcn` (`.claude/skills/shadcn/`) for the public page primitives · `mobile-frontend-design` (`~/.claude/skills/mobile-frontend-design/`) for the confirm screen

## Feature design

**Data model sketch**:

New table `accountDeletionRequests`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | `v.id("users")` | yes | resolved at issue time; the token binds to this, not to the address |
| `email` | `string` | yes | normalized, kept for the rate limit count only |
| `tokenHash` | `string` | yes | the token is stored hashed, never in plain text; indexed |
| `expiresAt` | `number` | yes | issued at plus one hour |
| `usedAt` | `number` | no | set when the link is claimed |
| `createdAt` | `number` | yes | also the rate limiting clock |

Indexes: `by_tokenHash`, `by_email`.

Changed table `users`: two new fields, `deletedAt: v.optional(v.number())` and `identityDeletePending: v.optional(v.boolean())`.

What a deletion does, table by table:

| Table | Effect |
|---|---|
| `users` | anonymized in place as AC-3 describes; `role` and `authId` left untouched |
| `memberProfiles` | row deleted; its R2 keys returned to the caller for deletion after commit |
| `children` | all rows for `parentUserId` deleted |
| `leadershipProgress` | all rows for `userId` deleted; proof key returned the same way |
| `memberProfiles` (others) | `spouseUserId` cleared where it points at this user, via `by_spouseUserId` |
| `roleAssignments` | active rows set `revoked`, `note` cleared, never deleted |
| `departmentMemberships` | active rows set `removed`, `positionTitle` cleared, never deleted |
| `notificationReads`, `notificationDismissals` | rows deleted, paginated |
| push notification token | removed inside the deletion transaction, so a refusal cannot unregister a device and the emailed-link door is covered too |
| `notifications` | untouched; audience based, and `createdBy` behaves like any other authored content |
| `activityLogs` | entries kept, metadata scrubbed deny by default, one new entry appended |
| Better Auth identity | destroyed through the component API, after the commit |

**State transitions**:

`users`: active (`deletedAt` unset) → deleted (`deletedAt` set, `identityDeletePending` true) → settled (`identityDeletePending` cleared once the identity is destroyed). One way, no return. A second account made later with the same address is a new row, not a revival.

`accountDeletionRequests`: issued → claimed (`usedAt` set, inside the deletion mutation), or issued → expired (`expiresAt` passed). A claimed or expired token is never honoured again.

**API surface**:

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `accountDeletion.precheck` | query | none, uses caller identity | `{ canDelete, blockedReason?, hasPassword }` | authenticated | none; it reports rather than throws |
| `accountDeletion.deleteMyAccount` | action | `password: string` (req) | `{ ok: true }` | authenticated | `INVALID_PASSWORD`, `LAST_SYSTEM_ADMIN`, `NO_PASSWORD_CREDENTIAL` |
| `accountDeletion.performDeletion` | internal mutation | `userId` (req), `requestId` (opt) | `{ email, firstName, deletedAt, r2Keys }` | internal only | `LAST_SYSTEM_ADMIN`, `TOKEN_USED` |
| `accountDeletion.requestEmailedLink` | action | none, uses caller identity | `{ ok: true }` | authenticated | none surfaced |
| `accountDeletion.requestByEmail` | action | `email: string` (req) | `{ ok: true }` always | public, rate limited | none surfaced |
| `accountDeletion.confirmByToken` | action | `token: string` (req) | `{ ok: true }` | token possession | `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_USED`, `ACCOUNT_GONE` |
| `accountDeletion.retryIdentityDelete` | internal action | none | count settled | internal only; hourly cron | none; reports to Sentry |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| `performDeletion` | anonymized email | derived from the document `_id`, as `deleted-<userId>@deleted.invalid` |
| `performDeletion` | `deletedAt` | `Date.now()` inside the mutation, returned to the action for the email idempotency key |
| `performDeletion` | `r2Keys` | collected from `memberProfiles.photoUrl`, `memberProfiles.mentorshipProofUrl` and `leadershipProgress.proofUrl` on the rows it deletes, plus `users.profilePictureUrl` where it differs, parsed to object keys by the existing `r2` component helper |
| `performDeletion` | `revokedBy`, `removedBy` | the target user's own `_id` on both paths; self deletion is the only path into this feature, and the public path passes the target as its own actor |
| `performDeletion` | which spouse rows to clear | the existing `by_spouseUserId` index on `memberProfiles` |
| `performDeletion` | which metadata survives the scrub | a named structural allow list (`template`, `roleType`, `status`, `scope`, `clanId`, `departmentId`, `eventType`, `recurrence`, `date`, `ok`, `selfService`, `bootstrap`). Every other key is replaced with `"[removed]"`. Deny by default, so a new key is scrubbed rather than leaked |
| `performDeletion` | which entries to scrub | entries where `actorUserId` is this user, plus entries where `targetType` is `user` and `targetId` is this user, both paginated |
| `performDeletion` | the deletion log entry | `action: "account.deleted"`, `targetType: "user"`, `targetId: userId`, `metadata: { selfService: true, viaPublicPage: boolean }` |
| `precheck` | `hasPassword` | whether the Better Auth identity carries a credential provider, read through the component API |
| `precheck` | `blockedReason` | the last System Admin count, so the screen can refuse before the user types anything |
| `requestByEmail` | token and `tokenHash` | 32 cryptographically random bytes, sent in the link, stored only as a hash |
| `requestByEmail` | `userId` on the row | resolved at issue time from `users.by_email` on the normalized address |
| `requestByEmail` | `expiresAt` | `createdAt` plus `ACCOUNT_DELETION_EXPIRY_SECONDS`, a new constant beside `PASSWORD_RESET_EXPIRY_SECONDS` in `packages/shared/src/constants/emails.ts`, set to the same 3600 |
| `requestByEmail` | the link URL | `process.env.SITE_URL` (already read at `convex/auth.ts:20`) plus the public path and the token as a query parameter |
| `requestByEmail` | rate limit verdict | at most 3 rows for that address in the last hour, counted via `by_email`; constants live beside the expiry |
| `requestByEmail` | the page's reply | one fixed string, identical on a hit, a miss and a rate limited call |
| all surfaces | every user facing message | named constants in `packages/shared`, listed in build task 18, never composed at the call site |
| mobile confirm screen | what is removed and what is kept | static copy in the app, kept in step with this spec, never read from the database |

**Key invariants**:

- A row with `deletedAt` set carries no personal data in any field, on any table. The two free text fields on retained rows, `roleAssignments.note` and `departmentMemberships.positionTitle`, are cleared for exactly this reason (AC-20); there is no exception to this invariant.
- A row with `deletedAt` set cannot authenticate, whatever the state of its Better Auth identity (AC-19).
- `roleAssignments` and `departmentMemberships` rows are never deleted by this feature, only transitioned, so the record of who held what survives.
- `activityLogs` stays append only. Existing entries may have metadata values replaced; no entry is ever removed.
- A token is honoured at most once, claimed inside the same transaction that performs the deletion, and never after `expiresAt`.
- There is always at least one active `system_admin`.
- No irreversible step runs before every refusal check has passed (AC-23).

**Security model**:

Only the account owner deletes their own account. Inside the app that is proven by the live session plus the current password; from the public page it is proven by possession of a link sent to the address itself, which is the same standard the password reset flow already sets. No administrative role can delete somebody else, so there is no privilege path into this feature at all. The public request endpoint is rate limited and answers identically whether or not the address exists, so it cannot be used to discover who belongs to the church.

The deleted state is itself an authorization boundary. `convex/lib/authz.ts` resolves a caller through `by_authId` today with no deleted check, so without AC-19 an account whose identity destruction failed could keep acting while anonymized. The `deletedAt` guard belongs in that resolver, not in each caller.

Compliance scope is active, and the audit trail is therefore not negotiable. Uganda's Data Protection and Privacy Act (SRS line 184, NF-04) requires that deletion anonymizes personal data, which is why nothing here hard deletes a user row. Apple and Google both require account deletion to be reachable from inside the app (SRS line 183), which is why the in app path, not the web page, is the primary one.

**Configuration required**:

No new environment variable, secret or third party credential. The emailed link depends on the existing `SITE_URL`, already read at `convex/auth.ts:20`. `ACCOUNT_DELETION_EXPIRY_SECONDS` and the rate limit numbers are shared constants, not configuration.

**Critical test scenarios**:

- Happy path: a member with a profile, children, a department membership and a clan role deletes from the app, and every table lands as the effects table says, verifies **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-20**.
- Happy path: the public page accepts an address and the emailed link deletes the account, verifies **AC-14**, **AC-15**.
- Happy path: a visitor with no profile at all deletes cleanly, verifies **AC-3**, **AC-4**.
- Failure case: destroying the Better Auth identity throws after the mutation commits; the data stays anonymized, `identityDeletePending` stays true, Sentry receives it, and the retry settles it, verifies **AC-18**.
- Failure case: the surviving credential is used to sign in before the retry runs, and is refused as signed out, verifies **AC-19**.
- Failure case: an expired token and an already claimed token are both refused, verifies **AC-15**.
- Failure case: two confirmations of the same token race, and exactly one succeeds, verifies **AC-15**.
- Failure case: a token is issued, the account is deleted and the address reused, then the old link is followed; the new account is untouched, verifies **AC-15**.
- Failure case: the public form is submitted repeatedly for one address, and the rate limited reply is byte identical to the accepted one, verifies **AC-16**.
- Auth and permission: the only active System Admin attempts deletion and is refused before any file or row is touched, verifies **AC-9**, **AC-23**.
- Auth and permission: a wrong password is refused and nothing at all is written, verifies **AC-2**, **AC-23**.
- Auth and permission: a user holding both `clan_elder` and `hod` deletes, and both are revoked, verifies **AC-7**.
- Regression: an address differing only in case or whitespace resolves to the same account, verifies **AC-21**.
- Regression: an address is reused for a fresh sign up after deletion, and the new account is a clean visitor, verifies **AC-11**.
- Regression: a member whose spouse deleted their account no longer carries a dangling `spouseUserId`, verifies **AC-6**.
- Scale: a user with several hundred `activityLogs` entries and `notificationReads` rows is deleted without exceeding a transaction limit, verifies **AC-13**.

## Build plan

Ordered as Tracer Bullet slices, per the scope header: a thin thread through every layer first, then thickened. The mobile entry point stays hidden until slice 2 lands, so no shipped build can delete an account while profile data still survives.

**Slice 0, de risk before anything is built**

1. Throwaway spike proving `@convex-dev/better-auth` 0.12.2 can destroy an identity and revoke its sessions, run against the dev deployment and deleted afterwards. Everything below assumes it, and nothing below is worth writing until it holds, satisfies **AC-10**.

**Slice 1, one person can delete their account end to end, behind a hidden entry point**

2. Schema: add `users.deletedAt`, `users.identityDeletePending` and the `accountDeletionRequests` table in one migration, sequenced after spec 0004's PR B has run on staging and production, satisfies **AC-3**, **AC-15**.
3. `precheck` query returning `canDelete`, `blockedReason` and `hasPassword`, satisfies **AC-9**, **AC-17**, **AC-23**.
4. `performDeletion` internal mutation, anonymizing the `users` row and returning address, first name, `deletedAt` and an empty key list, satisfies **AC-3**, **AC-12**.
5. `deleteMyAccount` action: precheck, verify the password, call the mutation, destroy the identity, clear `identityDeletePending`, schedule the confirmation email, satisfies **AC-2**, **AC-10**, **AC-12**, **AC-23**.
6. The `deletedAt` guard in `convex/lib/authz.ts`, so a deleted row is signed out regardless of identity state, satisfies **AC-19**.
7. Mobile: the settings row (hidden by a flag until slice 2) and the full confirm screen, driven by `precheck`, with the password field, the signed out transition and the clearing of local session state and caches, satisfies **AC-1**, **AC-2**, **AC-10**, **AC-17**.

**Slice 2, thicken the data fan out**

8. Extend `performDeletion` to delete `memberProfiles`, `children` and `leadershipProgress`, clear spouse references through `by_spouseUserId`, and collect the R2 keys into its return, satisfies **AC-4**, **AC-6**.
9. Delete the collected R2 objects in the action, after the commit, satisfies **AC-5**.
10. Revoke `roleAssignments` clearing `note`, mark `departmentMemberships` removed clearing `positionTitle`, and delete `notificationReads` and `notificationDismissals` with pagination, satisfies **AC-7**, **AC-8**, **AC-20**.
11. Write the deletion `activityLogs` entry and scrub that user's existing metadata, deny by default against the structural allow list, paginated across both actor and target matches, satisfies **AC-13**, **AC-24**.
12. Reveal the mobile entry point, now that a deletion removes everything personal rather than the `users` row alone, satisfies **AC-1**.

**Slice 3, the guards and the sweep**

13. Sentry reporting plus `retryIdentityDelete`, selecting on `identityDeletePending`, satisfies **AC-18**. It runs on an hourly cron (`convex/crons.ts`): AC-18 asks only for a selector a retry can find, but nothing automatic reading that selector would leave a stuck identity holding the person's real name and email indefinitely, and their address unavailable for a fresh sign up (**AC-11**).
14. Find and patch every existing query that counts or lists users so it excludes `deletedAt`, satisfies **AC-22**.
15. Confirm the address is released, and that a fresh sign up with it produces a clean visitor, satisfies **AC-11**.

**Slice 4, the public door**

16. Amend `spec/SRS.md` line 296 and the `EmailTemplate` union to six events, updating every consumer in the one change per the `packages/shared` rule, then add the `account_deletion_requested` template. Its copy must tell an unsolicited recipient to ignore the message, satisfies **AC-15**.
17. `requestByEmail` and `confirmByToken`: normalized address, hashed token bound to `userId`, one hour expiry, claim inside the deletion mutation, the identical reply on hit, miss and rate limited, and the rate limit itself, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-21**.
18. The user facing string constants for every error and the public page's fixed reply, in `packages/shared`, satisfies **AC-14**, **AC-16**.
19. `requestEmailedLink` for the no password path, issuing the same token to the signed in user's own address, satisfies **AC-17**.
20. The public page itself in `apps/admin`, outside the authenticated route groups with a middleware exception, following the `/forgot-password` pattern from spec 0007, satisfies **AC-14**.

## Consequences

**Positive**:

- Satisfies F1-06, and closes the Apple and Google requirement that would otherwise block a store listing.
- Church history, the giving trail and the audit record survive intact, because nothing is hard deleted.
- Reuses the email layer, the token pattern and the public route pattern that spec 0007 already proved, so very little here is genuinely new.
- Revoking rather than deleting role and membership rows means the question "who was the Elder in March" stays answerable after the person has left.
- The deny by default scrub means a metadata key added in a future feature is anonymized automatically, rather than leaking until somebody remembers it.

**Negative and tradeoffs**:

- There is no undo. A person who taps through the confirmation has no recourse, and the password prompt is the only thing standing in the way. This was chosen deliberately over a grace period, and it is the sharpest edge in the feature.
- Deleting R2 objects after the commit means a crash in between leaves orphaned bytes in the bucket with nothing pointing at them. That is the right way round, because the alternative loses a file while the account still lives, but it does mean the bucket can accumulate unreferenced objects that nothing currently sweeps.
- Anonymized rows accumulate in `users` forever. Build task 14 patches today's queries; every future query must remember the same thing, and nothing enforces it.
- Every future table holding personal data has to be added to this deletion path by hand. Nothing in the type system will notice when somebody forgets, and a forgotten table is a data protection breach rather than a bug.
- A GA feature now depends on an alpha integration API that `AGENTS.md` pins deliberately. Slice 0 exists so that is discovered early rather than late.

**Neutral**:

- One new table and two new optional fields, all small.
- The five email rule becomes six, which is a deliberate SRS amendment carried by this spec rather than a drift.
- Deletion volume will be tiny at launch, around fifty people, so nothing here needs to be fast. The pagination exists for correctness against transaction limits, not for throughput.

## Follow-up

- [ ] Run slice 0's spike before committing to the rest of this design. If `@convex-dev/better-auth` 0.12.2 cannot destroy an identity, this spec needs revisiting rather than working around.
- [ ] Amend `spec/SRS.md` line 296 from five events to six, and add `account_deletion_requested` to the `EmailTemplate` union. This is the SRS change this spec deliberately asks for.
- [ ] Sequence against spec 0004's PR B, which still has to run on staging and production before `users` can be narrowed. Two pieces of work are now queued on the same table.
- [ ] Nothing sweeps orphaned R2 objects left by a crash between the commit and the file delete. Consider a periodic reconciliation once uploads are in real use.
- [ ] Resend retains delivered message metadata on its own side, outside this deletion path. Confirm its retention window is acceptable under NF-04, or set it.
- [ ] Giving records (feature 16) and radio follows (feature 20) do not exist yet. Both will hold personal data, and both must join this deletion path when they land.
- [ ] Consider a single registry of tables holding personal data, so the deletion path is derived rather than remembered. The hand maintained version above is the known weak point of this design.
- [ ] Publish the public deletion URL in the Apple and Google store listings, and link it from the privacy policy, which F5-10 already tracks.
- [ ] `klt-cyber-web-ui` and `klt-cyber-brand` are named in `AGENTS.md` as skills to load, but neither is installed in `.claude/skills/` or `~/.claude/skills/`. Either install them or stop citing them, because as it stands the instruction cannot be followed.

## Rationale

Reasoning, the options weighed, and the forces behind them: see [rationale.md](rationale.md).
