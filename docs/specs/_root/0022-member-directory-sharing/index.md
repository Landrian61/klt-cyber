# 0022. Member directory with share to see contact details

**Date**: 2026-11-12
**Status**: In Progress

## Summary

This replaces the placeholder Members screen on mobile with the real directory of verified members. Everyone sees name, photo, clan and Areas of Service. Contact and work details only travel between two members who both chose to share, and the server enforces that before any data leaves Convex. A private member sees a plain note and can turn sharing on after a short consent sheet. No schema change: it is the first reader of the `directorySharing` field that spec 0014 already writes.

## Requirements

**User stories** (SRS M5-01 to M5-05, F2-13, NF-02):
- As a member, I browse verified members with name, photo, clan and Areas of Service.
- As a member, I search by name (and, when I share, by occupation) and filter by Area of Service and clan.
- As a sharing member, I open another sharer's card and call, WhatsApp or email them in one tap.
- As a private member, I see that sharing unlocks others' details, and I can turn it on from the directory.
- As a visitor, opening the directory invites me to complete my profile (already built, kept).

**Acceptance criteria**:
- **AC-1**: The list contains every member whose `users.role` is `member`, `users.deletedAt` is unset and `memberProfiles.profileStatus` is `verified`, and nobody else. Each row shows the full name from `memberProfiles` (first, middle, last), the resolved photo (or initials the client derives), the clan name (blank when there's no `clanId` or it points at no clan) and the names of their **active** department memberships only (pending claims never show). Rows are sorted by first name, then last name (a missing one sorts as empty), case insensitive, with ties broken by `userId`.
- **AC-2**: A caller who is not signed in, is deleted, has `users.role` `visitor`, or has no `verified` profile of their own gets a `ConvexError({ code: "DIRECTORY_MEMBERS_ONLY" })` from both directory queries. The mobile screen keeps its `MemberGate` invite for visitors (M5-05).
- **AC-3**: The viewer's own row is pinned above the list, marked "You", and is not repeated in the alphabetical list. It is built from the viewer's own profile by the same helper and always carries its own shared fields. It stays visible whatever the search and filters say. The results count counts other members only.
- **AC-4**: Name search ignores case, extra spaces and accents (NFD with combining marks stripped). Every word typed must match the start of some part of the name (first, middle or last), so "gra nam" finds "Grace Nambi". An empty query matches everyone.
- **AC-5**: A search word also matches a row's occupation only when that occupation is in the row's payload, which happens only when both viewer and target share (AC-7). A private viewer typing an occupation finds nobody by occupation.
- **AC-6**: Two filter chips, "Area of Service" and "Clan", each open a single choice picker (departments and clans in their seeded `order`). They combine with each other and with search using AND. Each chip clears with one tap. A department filter matches active memberships only.
- **AC-7**: Shared fields are phone, email, occupation, industry, employer, skills, short bio, and birthday (day and month). The server includes them only when the viewer's `directorySharing === true` AND the target's `directorySharing === true`. An absent value counts as private for both. The server never sends home address, year of birth, marital status, spouse, children, next of kin, mentorship, leadership progress or role assignments to anyone through the directory.
- **AC-8**: For a sharing viewer, each sharer's row carries a contact mark. For a private viewer, the list response carries no per person sharing indicator at all, so every row looks identical.
- **AC-9**: A sharing viewer opening a sharer's card sees the shared fields that are set (empty ones are hidden), plus one tap buttons: Call (`tel:`), WhatsApp (`https://wa.me/<digits>`) and Email (`mailto:`). Call and WhatsApp are hidden when there's no phone. WhatsApp is also hidden when the phone can't be normalized (AC-10). Each tap fires a light haptic.
- **AC-10**: `normalizeMemberPhone` removes spaces, dashes, dots and brackets. It turns exactly `0` plus 9 digits into `+256` plus those 9 digits, and exactly `256` plus 9 digits into `+256` plus those digits. Then it defers to the existing `normalizeE164Phone` (`packages/shared/src/constants/library.ts`), so any other value is kept only if already valid E.164 and is otherwise `null` (for example `+2560772123456` is `null`). It's a separate function on purpose: the Library helper refuses to guess a country, and this one guesses Uganda for member phones only. Call dials the normalized value, or the raw text when it's `null`.
- **AC-11**: A sharing viewer opening a private member's card sees the basic fields only and the note "{First name} keeps their details private", with no contact buttons.
- **AC-12**: A private viewer sees a banner at the top of the list and a note on every other member's card: sharing your own details unlocks other sharers' details. "Turn on sharing" opens a consent sheet that lists exactly the shared fields and says only other sharing members see them. Confirm calls the existing `profile.setDirectorySharing({ directorySharing: true })`. Cancel or dismiss changes nothing.
- **AC-13**: Opening the "You" row shows your own card as other sharers would see it, with a sharing switch. Turning it off is instant (no confirm). Turning it on opens the AC-12 sheet. The switch waits for the server rather than flipping optimistically, matching `apps/mobile/app/profile.tsx`.
- **AC-14**: `getCard` returns `null` (never throws) for an id that doesn't exist, is deleted, has no profile row, is a visitor, or has an unverified profile. The screen shows one "This member isn't in the directory" state, and all these cases look identical to the caller.
- **AC-15**: The list and the card each have a loading state, an empty state ("No members match" with a clear filters action), and an error state using the existing `ErrorState` with retry. The existing offline banner applies.
- **AC-16**: A sharing change by either person reaches already open list and card screens without a reload (Convex reactivity). Contact details appear or vanish immediately.
- **AC-17**: Convex tests prove AC-2, AC-7, AC-8, AC-14 and the absent counts as private rule. Vitest tests in `packages/shared` cover `normalizeMemberPhone` and `matchesDirectorySearch`.

## Decision

**Chosen option**: Option 1: One field gated list query plus a card query, filtered on the phone.

Add `convex/directory.ts` with two reactive queries that build field gated rows on the server. The mobile app loads the whole list once, then searches and filters it in memory. Name matching, phone normalization and birthday formatting live in `@klt-cyber/shared`.

**Implementation skills**: `convex` (`.agents/skills/convex/`) · `convex-reviewer` (`.agents/skills/convex-reviewer/`) · `klt-cyber-brand` (`.agents/skills/klt-cyber-brand/`)

## Feature design

**Data model sketch** (no change, read only):

| Entity | Fields read | Relation |
|---|---|---|
| `users` | `_id`, `email`, `role`, `deletedAt`, `profilePictureUrl` | 1:1 `memberProfiles.userId` |
| `memberProfiles` | `firstName`, `middleName`, `lastName`, `photoUrl`, `clanId`, `phone`, `occupation`, `industry`, `employer`, `skills`, `shortBio`, `dateOfBirth.day`, `dateOfBirth.month`, `directorySharing`, `profileStatus` | read via `by_profileStatus` (`verified`) and `by_userId` |
| `departmentMemberships` | `userId`, `departmentId`, `status` | N:M users to departments, read via `by_departmentId_status` (`active`) |
| `departments`, `clans` | `_id`, `name`, `order` | via `by_order` |

`directorySharing` absent means private (spec 0014's rule, unchanged). `dateOfBirth.year` is never read into a directory response.

**API surface** (Convex queries; both require a signed in `member`):

| Function | Kind | Inputs | Outputs | Errors |
|---|---|---|---|---|
| `directory.list` | query | none | `{ viewerSharing: boolean, self: Row, rows: Row[], departments: {id,name}[], clans: {id,name}[] }`. `Row = { userId, name: {first, middle?, last}, photoUrl?, clan?: {id,name}, departmentIds: Id[], occupation?, contactable? }`. The client resolves department names from `departments`, which lists all 13 in `order` (there is no archived flag). `occupation` and `contactable: true` appear only under AC-7. `self` always carries its `occupation` | `DIRECTORY_MEMBERS_ONLY` |
| `directory.getCard` | query | `userId: v.id("users")` | `null`, or `{ isSelf, viewerSharing, targetSharing?, basic: Row, shared?: { phone?: {raw, dial, whatsappDigits?}, email, occupation?, industry?, employer?, skills?, shortBio?, birthday?: {day, month} } }`. `targetSharing` only when the viewer shares or `isSelf`. `shared` under AC-7, or always for `isSelf` | `DIRECTORY_MEMBERS_ONLY` |
| `profile.setDirectorySharing` | mutation (existing) | `directorySharing: boolean` | `{ ok: true }` | unchanged |

The list deliberately carries no phone or email. Contact details only leave the server one card at a time.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| list, getCard | viewer identity and role | `getCurrentUser` (`convex/lib/authz.ts`, null for deleted), then `users.role === "member"` and the viewer's own profile `verified`, else `ConvexError({ code })` (pattern: `convex/accountDeletion.ts`). Not `requireUser`, which throws a plain `Error` |
| list, getCard | viewer sharing | the viewer's `memberProfiles.directorySharing === true` |
| list | membership set | `memberProfiles.by_profileStatus = verified`, then `ctx.db.get(profile.userId)` per row, skipping `role !== "member"` and any `deletedAt` (a backstop, since deletion already removes the profile) |
| list, getCard | name | `memberProfiles.firstName`, `middleName`, `lastName` (not the `users` copies) |
| list, getCard | clan | `clans` read once via `by_order` into a Map, looked up by `profile.clanId`. Missing means blank |
| list | areas of service | `departmentMemberships.by_departmentId_status` (`active`) for each of the 13 departments (13 index reads), grouped by `userId` |
| list, getCard | photo | `resolvePhotoUrl(profile.photoUrl, user.profilePictureUrl)` in `convex/lib/identity.ts` |
| list | sort order | derived: `firstName`, then `lastName`, `localeCompare` with sensitivity `base` |
| list | filter options | `departments.by_order`, `clans.by_order` |
| list | contact mark | derived: viewer sharing AND target sharing |
| getCard | email | `users.email`, the account sign in email, intentionally (there is no separate contact email) |
| getCard | phone dial and WhatsApp digits | `normalizeMemberPhone(profile.phone)`: `dial` = normalized or raw, `whatsappDigits` = `whatsAppDigits(normalized)` or absent. No `profile.phone` means no `phone` key |
| getCard | birthday | `profile.dateOfBirth.day` and `.month`, shown with `formatDirectoryBirthday` ("12 March"). No `dateOfBirth` means no `birthday` key |
| client | search match | `matchesDirectorySearch(row: { name, occupation? }, query: string): boolean`, matching `name` parts plus `occupation` when present, per AC-4 |
| sheet, banner | list of shared fields and copy | `DIRECTORY_SHARED_FIELD_LABELS` and `DIRECTORY_COPY` in `packages/shared/src/constants/directory.ts` |

**Key invariants**:
- Gating happens in one helper (`toDirectoryRow` / `toDirectoryCard` in `convex/lib/directory.ts`) that gets the viewer's sharing flag. No query builds rows any other way.
- Shared fields are copied in by name from an allowlist, never by spreading the profile, so a new profile field stays private by default.
- The mobile directory never reads `roleAssignments` (root AGENTS.md). Leaders' wider access (SRS 3.5) stays in the portal.

**Security model**: member only reads. Share to see is enforced in the query, not the client. Self always sees their own shared fields. No writes beyond the existing toggle, which already logs `profile.edited`. Directory views aren't logged (reads, and high volume). Compliance: Uganda Data Protection and Privacy Act consent for sharing, met by the AC-12 consent sheet and private by default.

**UX notes** (`klt-cyber-brand`): screen at `apps/mobile/app/members.tsx`, card at a new `apps/mobile/app/member-detail.tsx` (`?userId=`). Consent sheet is a new `components/directory/share-consent-sheet.tsx` on React Native `Modal`, so feature 14 can reuse it. Fully rounded buttons, haptics on every press, Reanimated entering motion that is skipped under reduced motion, accessibility labels like "Call Grace". Navigation stays in the top bar menu. Feature 12 moves it to the Community tab.

**Critical test scenarios**:
- Happy path: A and B both share. A's list shows B with a contact mark, A's card of B has phone, email and buttons. Verifies **AC-7**, **AC-8**, **AC-9**.
- Privacy: A shares and C is private. A's card of C has no `shared` key. C's list response has no `contactable` and no `occupation` on anyone. Verifies **AC-7**, **AC-8**, **AC-11**.
- Absent flag: a profile without `directorySharing` behaves as private on both sides. Verifies **AC-17**.
- Auth: a visitor and an unauthenticated caller get `DIRECTORY_MEMBERS_ONLY`. A deleted, visitor or pending target returns `null`. Verifies **AC-2**, **AC-14**.
- Phone: `"0772 123 456"` gives `+256772123456`, `"(256) 772-123456"` gives `+256772123456`, `"12345"` gives `null`. Verifies **AC-10**.

## Build plan

Tracer Bullet: the first slice threads the server gate through to a real list, then each slice thickens one capability end to end.

1. Shared contract: `packages/shared/src/constants/directory.ts` with `DIRECTORY_ERROR_CODES`, `DIRECTORY_SHARED_FIELD_LABELS`, `DIRECTORY_COPY`, `normalizeMemberPhone`, `matchesDirectorySearch`, `formatDirectoryBirthday`, exported from the package index, with Vitest tests. Satisfies **AC-4**, **AC-5**, **AC-10**.
2. Thin thread: `convex/lib/directory.ts` (the gating helpers) and `directory.list`, then `members.tsx` rewired to real rows with name search, the pinned "You" row and the contact mark. Delete the `MEMBERS` placeholder array, the `FILTERS` role and mentorship pills and the role `Badge`s from `members.tsx`, since the SRS never allows them in the directory. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**, **AC-8**.
3. The card: `directory.getCard` and `member-detail.tsx` with the contact buttons, the private note and the not found state. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-14**.
4. Share to see unlock: the consent sheet, the list banner and card note, and the own card switch. Satisfies **AC-12**, **AC-13**, **AC-16**.
5. Filters and states: the two filter chips and pickers, occupation matching, and the loading, empty and error states on both screens. Satisfies **AC-5**, **AC-6**, **AC-15**.
6. `convex/directory.test.ts` covering the gating matrix and the auth and null cases. Satisfies **AC-2**, **AC-7**, **AC-8**, **AC-14**, **AC-17**.

## Consequences

**Positive**:
- Search and filters feel instant, with one query, no new index and no migration.
- Privacy lives in one server helper with an allowlist, so it can be tested and doesn't spread across the client.

**Negative / tradeoffs**:
- The list grows with the congregation. Each member costs about 3 to 5 document reads (profile, user, memberships, with clans and departments read once) plus one photo URL signing per row. It's fine for hundreds to low thousands, but it will approach Convex per query read limits somewhere past a few thousand verified members.
- Any sharer can still see every other sharer's contact card one by one. Share to see limits who, not how much.
- WhatsApp works only for numbers that normalize, and non Ugandan local numbers without `+` lose the button.

**Neutral**:
- Reactivity means any edit to any verified profile (not only a sharing toggle), or any membership change, re-sends the whole list to every open directory screen. That's cheap at launch scale, and it is part of the 2,000 member trigger below.
- A sharing viewer can tell who else shares (the contact mark). That's intended, since anyone gains that view only by sharing themselves.

## Follow-up

- [ ] Amend SRS F2-13 and M5: occupation search applies only between sharers, and "Leaders' access follows Section 3.5" means the portal, not the mobile directory (flagged per AGENTS.md: these clarify the SRS, they don't contradict it).
- [ ] Revisit with server search and pagination when verified members pass about 2,000 (the trigger for the runner up option).
- [ ] Feature 14 (My Profile) should reuse `share-consent-sheet.tsx` and `DIRECTORY_COPY` for M6-04, so turning sharing on reads the same everywhere.
- [ ] Feature 12 moves `/members` from the top bar menu onto the Community tab (M1-01).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
