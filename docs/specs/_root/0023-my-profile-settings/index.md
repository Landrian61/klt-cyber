# 0023. My Profile and settings

**Date**: 2026-11-12
**Status**: In Progress

## Summary

Every user gets one place to see and change everything about themselves. The profile screen shows who you are (your details, clan, Areas of Service, roles, and a pointer to the web portal if you have work there), with an Edit button that opens a new edit screen. A gear opens a new Settings screen grouped as Privacy, Notifications, Account and Help. Almost all the backend already exists from spec 0014, so this is mostly mobile screens plus one new read only Convex query and one shared constant; there is no schema change.

## Requirements

**User stories**:
- As a user, I view my full profile, including my real mentorship status (M6-01).
- As a pending visitor or verified member, I edit my details and photo (M6-02; F2-03, F2-06, F2-07, F2-08).
- As a user, I see my departments, pending claims, clan (or "to be assigned") and any roles, and if I have portal work I'm pointed to the web portal (M6-03).
- As a member, I switch directory sharing on or off (M6-04).
- As a user, I find my notification choices and followed radio programs in one place (M6-05; the category switches themselves come from feature 28).
- As a user, I change my password, sign out, or delete my account (M6-06; F1-04, F1-06, F1-08).
- As a user, I reach Help & Support, which contacts Andrew (M6-07; F5-11).

**Acceptance criteria**:

*Profile screen*
- **AC-1**: The profile screen header shows the resolved photo (or initials), the display name, the state pill (MEMBER, PENDING REVIEW, NEEDS A CHANGE, VISITOR, as today) and a gear button that opens Settings for every signed in user, visitors included.
- **AC-2**: The header's Edit button (today a stub, `onEditTap` in `apps/mobile/app/profile.tsx`) opens `/edit-profile` for a `pending_verification` or `verified` profile, opens `/profile-completion` for a sent back profile or a person with no profile, is disabled while `getMyProfile` is still loading, and is never a dead tap.
- **AC-3**: The profile screen shows the real `mentorshipStatus` label from `MENTORSHIP_STATUS_LABEL` (keeps spec 0014 AC-28), never a hardcoded value.
- **AC-4**: A "My church life" section shows: the clan, or `CLAN_UNASSIGNED_COPY` ("Your clan will be assigned by the Hospitality team") for a verified member with none; the existing clan change control (`changeMyClan`) for verified members; the existing `MyAreasOfService` component (confirmed areas and pending claims with Withdraw and Leave) for verified members; the same list read only (no add, Leave or Withdraw) for a pending visitor; and every active role as `ROLE_COPY[roleType].label` followed by its scope name when it has one (for example "HOD, Media", "clan elder, Judah", "System Admin").
- **AC-5**: A portal pointer card appears in "My church life" when, and only when, `getMyChurchLife` returns `portal.show === true`. That is true for anyone with at least one active `roleAssignments` row, or with an `active` (confirmed, not `pending_claim`) membership in a department listed in the existing `ROSTER_PORTAL_DEPARTMENTS` (Media, Hospitality, Library & Information). The card names why from `portal.reasons`: role labels with scope first (as in AC-4), then department names, with no duplicates, and has an "Open web portal" button that opens `EXPO_PUBLIC_PORTAL_URL` in the system browser.
- **AC-6**: If `EXPO_PUBLIC_PORTAL_URL` is unset in the build, the pointer card still shows its text but hides the button (no broken link), and a dev only console warning names the missing variable.

*Edit screen*
- **AC-7**: `/edit-profile` shows the current values in sections: Photo, Personal (first, middle, last name, sex, date of birth, marital status, short bio), Contact (phone, address), Family (spouse linked or unlinked, anniversary, next of kin, children), Mentorship (status, proof), Leadership, Profession (occupation, industry, employer, skills). Clan and Areas of Service are not on this screen; they keep their instant controls on the profile (AC-4). `joinDate` is deliberately not editable here. Mentorship proof uses `ImageUploadField` and stays optional at every status. Linking a spouse sends `spouseUserId` and puts `spouseNameUnlinked` in `clearFields`; switching to an unlinked name does the reverse, because the mutation does not clear the counterpart itself.
- **AC-8**: One sticky Save sends to `updateMyProfile` only the fields whose value differs from the snapshot taken when the screen opened, compared deeply (objects and the `skills` array by value). Object fields (`address`, `nextOfKin`, `dateOfBirth`) are sent whole when any part changed. A clearable field emptied entirely goes in `clearFields`; a partly emptied object fails validation (AC-9) instead of being sent. `mentorshipStatus` and `photoUrl` are sent only when changed. The diff is a pure function with its own unit tests. With no changes, Save is disabled. On success the person returns to the profile with a short confirmation and the server writes its one activity log entry (existing behaviour).
- **AC-9**: Fields are validated on the client before Save with a new shared `profileEditSchema` in `packages/shared/src/schemas/profile.ts` (with Vitest tests): first and last name trimmed, 1 to 50 characters (they cannot be blanked; the server does not check this); phone matches the existing `E164_PHONE_REGEX` when present; short bio capped (reuse the wizard's limit if one exists, else 280); date of birth day 1 to 31, month 1 to 12, optional year not in the future; address needs `line1` when any address part is filled; next of kin needs all three parts when any is filled. An invalid field shows its message inline and blocks Save. The wizard may adopt the same schema later; it is not required here.
- **AC-10**: Changing the photo uses the existing `ImageUploadField` and `apps/mobile/lib/r2-upload.ts` path; the new key is sent as `photoUrl` on Save. An upload in progress disables Save. Removing the old R2 object stays the server's job (spec 0014 AC-18).
- **AC-11**: Children and leadership rows are added, edited and removed in a small sheet each; Done saves that one row immediately through `addChild`/`updateChild`/`removeChild` and `leadershipProgress.addMine`/`updateMine`/`removeMine`. They are not part of the main Save, and a row failure shows on that sheet only. Rows display from the children and leadership arrays `getMyProfile` already returns. Adding a leadership level that already exists updates that row (how `addMine` behaves), so the sheet labels it as an edit. Pending visitors may edit rows too; each row save bumps the profile's `updatedAt`, so a reviewer always sees the latest version (spec 0014's intent).
- **AC-12**: Mentorship: when the stored status is not `completed`, the "Completed" choice shows disabled with the note "Administration confirms this step". When the stored status is `completed`, the field reads "Completed" and is locked with the note "Administration changes this". (Feature 29 later turns the disabled choice into a request that shows "Awaiting confirmation"; this spec leaves that slot, see Follow-up.)
- **AC-13**: Leaving the edit screen (back button, swipe back, Android back) with unsaved changes, including an open row sheet with edits, asks "Discard changes?" with Discard and Keep editing. With no unsaved changes it leaves silently. While a Save is in flight, back is disabled. The sent back takeover (AC-15) replaces the form without the prompt.
- **AC-14**: A failed Save (server error or offline) keeps every edit in the form, shows the existing copy for the `PROFILE_LIFECYCLE_ERRORS` code returned (`MENTORSHIP_NEEDS_REVIEW`, `MENTORSHIP_CONFIRMED`, `PROFILE_NOT_VERIFIED`, which today means sent back), else a generic "Couldn't save, check your connection and try again" (this also covers the uncoded "No profile to update"), and Save stays available to retry.
- **AC-15**: If the profile becomes `sent_back` while the edit screen is open (the live query changes), the screen replaces its form with the sent back message and a button to `/profile-completion`, because `updateMyProfile` would reject the save.
- **AC-16**: The form works from a snapshot taken when the screen opens; later changes to the live profile do not rewrite the form (only the sent back takeover in AC-15 reacts live). Concurrent edits from the portal Settings and the phone resolve last write wins per field, and only changed fields are sent, so edits to different fields both survive. The mentorship lock in AC-12 reads the snapshot; if the server has since moved the value, the save is rejected with the AC-14 message.

*Settings screen*
- **AC-17**: `/settings` lists four groups in this order: Privacy (verified members only), Notifications, Account, Help. Visitors and pending visitors see Notifications, Account and Help.
- **AC-18**: Privacy holds the existing directory sharing switch, moved from the profile screen, calling `setDirectorySharing` and saving on toggle (same copy as today). It no longer appears on the profile screen. Hiding it from non members is UI only (`setDirectorySharing` has no verified check, and none is added here); the directory's server side share to see rule is what protects data.
- **AC-19**: Notifications opens `/settings/notifications`, which holds the existing `NotificationPermissionRow` and the "Followed radio programs" row that opens `/radio-follows`. It carries no "coming soon" text; feature 28 adds its category switches to this same screen.
- **AC-20**: Account holds: Change password, Sign out (same behaviour as today: try to unregister the push token, ignore a failure such as being offline, then `authClient.signOut()`), and Delete account (opens the existing `/delete-account`). These leave the profile screen.
- **AC-21**: Change password shows only when the person has a credential account (Better Auth `listAccounts` includes `providerId === "credential"`). Otherwise the row reads "You sign in with Google or another provider" and does nothing. While `listAccounts` is loading or fails, the row shows the password version (the server will reject cleanly if wrong).
- **AC-22**: `/settings/change-password` asks for current password, new password, and confirm new password; requires the new one to pass the shared sign up password rule (`min(8)`) and match the confirm; calls `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`. On success: a confirmation saying other devices were signed out, then back to Settings, still signed in here. A wrong current password (Better Auth error code `INVALID_PASSWORD`) shows "That isn't your current password" inline; any other or missing code shows a generic retry message and keeps the inputs. A manual check confirms a second signed in device is really signed out through the Convex Better Auth component.
- **AC-23**: Help opens `/settings/help`, which explains who answers (Andrew, for the KLT app) and has one "Message on WhatsApp" button opening `https://wa.me/<digits>?text=<encoded>` with the message "Hi, I need help with the KLT app (v<version>, <Android|iOS>)." built by a shared pure function. If the version is unavailable it is left out ("(Android)" alone). No name, email or profile state is put in the message. The link is opened with `Linking.openURL`; without WhatsApp installed, `wa.me` falls back to the browser, which is acceptable.
- **AC-24**: If `SUPPORT_CONTACT.whatsapp` is empty, the Help screen shows "Help isn't set up in this build yet" instead of the button.

*Cross cutting*
- **AC-25**: Every new or moved tap target gives a light haptic, uses theme tokens from `@/constants/theme`, the No Line Rule, and the 8 point grid; entrance motion uses Reanimated and is skipped under reduced motion (the pattern `profile.tsx` already uses).
- **AC-26**: Every new screen has loading, empty and error states; `getMyChurchLife` returns `null` when signed out so a mounted subscription never throws during sign out.
- **AC-27**: Automated tests cover `getMyChurchLife` (no roles; a role holder; a confirmed Media member; a pending Hospitality claim gives no pointer; a revoked role gives no pointer; signed out returns null), `profileEditSchema`, the edit diff function (including that an untouched `photoUrl` is never sent), and `buildSupportWhatsAppUrl`.

## Decision

**Chosen option**: Option 1: Profile and Settings split, reusing the 0014 backend.

Restructure `profile.tsx` into an identity screen, add `/edit-profile` and a `/settings` stack, add one read only query `getMyChurchLife` and one shared settings constants file; features 28 and 29 fill their slots later.

**Implementation skills**: `klt-cyber-brand` (project skill, `.agents/skills/klt-cyber-brand/`) · `mobile-frontend-design` (`~/.claude/skills/mobile-frontend-design/`) · `convex` (`.claude/skills/convex/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model**: no change. Reads and writes reuse:

| Table | Used for | Written here? |
|---|---|---|
| `memberProfiles` | all edit fields, `directorySharing`, `mentorshipStatus`, `clanId` | via existing `updateMyProfile`, `setDirectorySharing`, `changeMyClan` |
| `children` | children rows | via existing row mutations |
| `leadershipProgress` | leadership rows | via existing row mutations |
| `departmentMemberships` | areas and claims; portal rule | existing mutations only; read by `getMyChurchLife` |
| `roleAssignments` | roles list; portal rule | read only |
| `departments`, `clans` | names for labels | read only |
| `radioProgramFollows` | followed programs | existing `/radio-follows` screen |
| Better Auth `account` | credential check, password change | via the Better Auth client, never directly |

**Routes** (Expo Router, `apps/mobile/app/`):

| Route | File | State |
|---|---|---|
| `/profile` | `profile.tsx` | restructured: header with Edit and gear, status banners, detail cards, My church life |
| `/edit-profile` | `edit-profile.tsx` | new |
| `/settings` | `settings/_layout.tsx`, `settings/index.tsx` | new |
| `/settings/notifications` | `settings/notifications.tsx` | new, feature 28 extends it |
| `/settings/change-password` | `settings/change-password.tsx` | new |
| `/settings/help` | `settings/help.tsx` | new |
| `/radio-follows`, `/delete-account` | existing | unchanged, now reached from Settings |

Add `edit-profile` and `settings` to `NO_MINI_PLAYER_ROUTES` in `apps/mobile/app/_layout.tsx`, so the mini player never covers the sticky Save or the password form.

**API surface** (Convex):

| Function | Kind | Inputs | Outputs | Auth | Errors |
|---|---|---|---|---|---|
| `profile.getMyChurchLife` | query, new | none | `null` when signed out, else `{ roles: Array<{ _id, roleType, label, scopeName: string \| null }>, portal: { show: boolean, reasons: string[] } }` | signed in user, own data only (`getCurrentUser`, returns null rather than throwing) | none |
| `profile.updateMyProfile` | mutation, existing | changed fields + `clearFields` | void | existing | `MENTORSHIP_NEEDS_REVIEW`, `MENTORSHIP_CONFIRMED`, `PROFILE_NOT_VERIFIED` |
| `profile.setDirectorySharing` | mutation, existing | `{ directorySharing }` | void | existing | existing |
| `profile.changeMyClan` | mutation, existing | `{ clanId? }` | void | existing | existing |
| `children.*`, `leadershipProgress.*Mine` | mutations, existing | row fields | row id | `requireUser`, own rows (any profile state) | child input parse errors; `addMine` on an existing level updates it |
| `departmentMemberships.getMyDepartmentMemberships` | query, existing | none | live rows | existing | none |
| `authClient.listAccounts` | Better Auth client | none | accounts with `providerId` | session | network |
| `authClient.changePassword` | Better Auth client | `currentPassword`, `newPassword`, `revokeOtherSessions: true` | ok | session | invalid password, network |

**Shared** (`packages/shared/src/constants/settings.ts`, exported from the index):
- `SUPPORT_CONTACT: { name: "Andrew", whatsapp: string }`: `whatsapp` is E.164 (validated with the existing `E164_PHONE_REGEX` in its test when non empty); empty until filled before the pilot.
- `buildSupportWhatsAppUrl(contact, { version, platform })`: returns `https://wa.me/<digits without +>?text=<encodeURIComponent(message)>`, or `null` when `whatsapp` is empty.
- No new department list: the portal rule reuses `ROSTER_PORTAL_DEPARTMENTS` from `packages/shared/src/enums/departments.ts`.
- `profileEditSchema` in `packages/shared/src/schemas/profile.ts` (rules in AC-9) and the pure edit diff (in `apps/mobile/lib/`, or shared if the portal wants it later).
- `SETTINGS_COPY`: the user facing strings named in the ACs (mentorship notes, Help text, Google sign in row, error messages).

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Profile header | photo | resolved photo from `getMyProfile` (spec 0014's resolved photo, profile first, `users` fallback) |
| Profile header | name, state pill | `getMyProfile` / `use-my-account.ts` (existing) |
| Edit button target | which route | `profile.profileStatus` (null profile → wizard) |
| Mentorship label | text | `profile.mentorshipStatus` through `MENTORSHIP_STATUS_LABEL` |
| Mentorship lock state | disabled or locked | stored `profile.mentorshipStatus` from the live query |
| My church life | clan name | `profile.clanId` joined to `clans.listClans` (as today) |
| My church life | areas and claims | `getMyDepartmentMemberships` |
| Roles list | `label` | `ROLE_COPY[roleType].label` in `@klt-cyber/shared` |
| Roles list | `scopeName` | `departments.name` via `departmentId`, or `clans.name` via `clanId`, else null |
| Portal pointer | `show`, `reasons` | derived in `getMyChurchLife` from active `roleAssignments` + `active` `departmentMemberships` whose department name is in `ROSTER_PORTAL_DEPARTMENTS` |
| Edit sections | children, leadership rows | the arrays `getMyProfile` already returns |
| Edit Save | validation rules | `profileEditSchema` (new, shared) |
| Open web portal | URL | `process.env.EXPO_PUBLIC_PORTAL_URL` (already set per EAS profile in `apps/mobile/eas.json`) |
| Edit Save | changed fields | deep diff of form state against the snapshot of `getMyProfile` taken at open |
| Edit Save | `photoUrl` | R2 key returned by `r2-upload.ts` |
| Spouse link | candidates | the existing verified only spouse search (spec 0014, F2-12) |
| Change password row | credential or Google | `authClient.listAccounts()` `providerId` |
| Help message | version | `Constants.expoConfig?.version` (`expo-constants`, from `app.config.ts`), omitted when undefined |
| Help message | platform | `Platform.OS` mapped to "Android" / "iOS" |
| Help button | number | `SUPPORT_CONTACT.whatsapp` |

**Key invariants**:
- No surface in this feature writes `clanId` except through `changeMyClan`, and none resubmits a sent back profile except through the wizard.
- The client never decides profile state or authority: the edit route, mentorship lock and portal pointer all come from stored values or the server query.
- The portal pointer is UX only; the portal's own middleware and Convex checks stay the real gate.
- `getMyChurchLife` returns only the caller's own rows.
- Gating stays on the right axis: Privacy keys off `profileStatus === "verified"`, the portal pointer off `roleAssignments` and confirmed memberships; never `users.role` for authority.

**Security model**: All writes go through existing mutations that already check ownership. The new query reads only the caller's rows. Changing password needs the current password and signs out other sessions. The Help message carries no personal data. No new PII is stored or sent anywhere new.

**Configuration required**: none new. `EXPO_PUBLIC_PORTAL_URL` already exists; `SUPPORT_CONTACT.whatsapp` is a code constant filled before the pilot.

**Critical test scenarios**:
- Happy path: a verified member opens Edit, changes phone and occupation, saves; the profile shows the new values and one activity log entry exists, verifies **AC-7**, **AC-8**.
- Failure case: offline Save keeps the edits and shows the retry message, verifies **AC-14**.
- Failure case: a reviewer sends the profile back while the edit screen is open; the form is replaced, verifies **AC-15**.
- Mentorship: stored `enrolled` shows Completed disabled; stored `completed` is locked; saving other fields still works, verifies **AC-12**.
- Portal rule: confirmed Media member sees the pointer; pending Hospitality claimant does not; revoked HOD does not, verifies **AC-5**, **AC-27**.
- Auth: a Google only user sees "You sign in with Google"; a wrong current password shows the inline message; success signs out a second device, verifies **AC-21**, **AC-22**.
- Visitor: Settings shows no Privacy group; Edit opens the wizard, verifies **AC-2**, **AC-17**.

## Build plan

Tracer Bullet: the first slice threads one path through every layer (shared constant, new query, profile screen, a Settings screen), then each slice thickens it.

1. [x] **Thin thread: Settings shell and the portal pointer end to end.** `packages/shared/src/constants/settings.ts` with `SETTINGS_COPY`; `NO_MINI_PLAYER_ROUTES` updated; `profile.getMyChurchLife` with its tests; the profile header gear; `/settings` with the four groups (Privacy, Notifications, Account, Help rows wired to existing screens); the roles list and portal pointer card in "My church life", satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**, **AC-17**, **AC-26**, **AC-27**
2. [x] **Move the settings out of the profile.** Directory sharing into Privacy; `/settings/notifications` with the permission row and radio follows; Sign out and Delete account into Account; the read only `MyAreasOfService` mode for pending visitors; remove the moved cards from `profile.tsx`, satisfies **AC-3**, **AC-4**, **AC-18**, **AC-19**, **AC-20**, **AC-25**
3. [x] **The edit screen.** `profileEditSchema` in shared with Vitest tests; the pure diff function with tests; `/edit-profile` with its sections, snapshot, diff and `clearFields`, validation, photo upload, children and leadership sheets, mentorship lock, leave guard, error mapping and the sent back takeover; wire the Edit button, satisfies **AC-2**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-16**, **AC-25**, **AC-27**
4. [x] **Account and Help.** The credential check, `/settings/change-password`, `SUPPORT_CONTACT`, `buildSupportWhatsAppUrl` with tests, and `/settings/help`, satisfies **AC-21**, **AC-22**, **AC-23**, **AC-24**, **AC-25**, **AC-27**

## Consequences

**Positive**:
- One predictable home: identity on the profile, choices in Settings, matching what people expect from other apps.
- Members finally edit after verification on their phones; the 0014 backend gets its mobile client.
- Features 28 and 29 have a ready slot, so they ship screens' content, not navigation.
- No schema change, so nothing waits on Andrew's schema review.

**Negative / tradeoffs**:
- Until feature 29 ships, a member can't ask for "Completed" from the app; they only see that Administration confirms it.
- Until feature 28 ships, the Notifications screen is thin (permission plus radio).
- The edit screen duplicates some field UI already in the wizard steps; shared inputs reduce it but two screens still render the same fields.
- Last write wins with a snapshot means a rare same field edit on portal and phone at once silently keeps the later one, and an open form does not show a change made elsewhere until reopened.
- The edit screen's validation lives in a new shared schema the server does not enforce; a non mobile caller could still save a blank first name.
- Changing the support number needs an OTA update.
- `profile.tsx` gets restructured, which touches screens other Track B work may also be editing.

**Neutral**:
- Sign out and Delete account move one tap deeper (Settings → Account).
- Department names are matched by string for the portal rule; typed against `DEPARTMENTS` so a rename fails to compile.

## Follow-up

- [ ] At the start of build slice 4, confirm the mobile `authClient` exposes `listAccounts` and `changePassword` through the Convex Better Auth integration (pinned version, do not upgrade it for this). If not, stop and route back to `/architect` rather than calling Better Auth tables directly.
- [ ] Fill `SUPPORT_CONTACT.whatsapp` with Andrew's real number before the pilot (feature 21, store readiness).
- [ ] Feature 29 (mentorship confirmation) replaces the disabled "Completed" choice with a request and shows "Awaiting confirmation" in the edit screen and on the profile.
- [ ] Feature 28 (notification settings) adds the F4-19 category switches to `/settings/notifications`.
- [ ] The `klt-cyber-brand` skill lives in `.agents/skills/` but not `.claude/skills/`, so Claude Code may not list it; `/develop` should open it by path.
