# PR9: Mobile Profile Completion Flow

## Context
References `DATA_MODEL.md` Increment 4 and PR8's backend contract (`submitProfile`,
`generateUploadUrl`, `listActiveDepartments`). This is the visitor-facing mobile counterpart —
the 7-step form a visitor fills out and submits for Church Admin verification. Naomi's web work
(verification review, departments, facilities) is a separate track and untouched by this PR.

## Backend additions needed first
PR8 covered reviewing submitted profiles, not submitting them — these three small pieces are
needed before the wizard can be wired up, and belong in this PR rather than a separate one:

1. `listClans()` — public read returning the 12 seeded clans, for the Step 6 picker. Clans
   already exist as seeded reference data from Increment 2; this just exposes a read.
2. `searchUsersForSpouseLink(query: string)` — authenticated read, searching registered users by
   name or email, for the Step 2 spouse-linking search. Search across whatever basic account
   fields exist on `users` (name, email) — don't restrict to verified members only, since a
   spouse may not have completed their own profile yet.
3. `getMyProfileStatus()` — authenticated, returns the caller's own `memberProfiles` row if one
   exists, or null. Drives whether the app shows the wizard, a pending-review screen, or neither.

## Mobile: Profile Completion Wizard
Reachable from wherever profile/account is currently surfaced in the app — locate the existing
entry point rather than assuming a new one. On open, call `getMyProfileStatus()` first:
- No profile exists → show the wizard below.
- `profileStatus: "pending_verification"` → show a simple "your profile is under review" screen,
  no form.
- `profileStatus: "verified"` → user is already a member; show neither (normal member experience
  applies — this flow has nothing further to do).

### Step 1 — Personal Info
- Required: First Name, Last Name, Sex, Marital Status.
- Optional: Middle Name, Phone, Short Bio.
- Date of Birth: optional overall. If provided, day + month are required together; year is
  independently optional — someone may share their birthday but decline the birth year. This
  likely needs a custom day/month picker plus a separate "share birth year" toggle, since
  standard native date pickers assume a complete date.
- Email is read from the account, never re-entered.
- Profile Photo: capture/select an image, upload via `generateUploadUrl()` (the same shared R2
  upload utility PR8 built for certificates), store the resulting URL, or we could use the one on their google account.
- Marital status: Choose (Single, Married, Widowed or Divorced)
- Join Date: optional, self-reported — a simple date picker, distinct from the account's actual
  creation timestamp.

### Step 2 — Family
- Spouse: show only if Marital Status is "married." Search via `searchUsersForSpouseLink`,
  select a match to set `spouseUserId` — or, if no match exists, allow entering a plain name
  instead (`spouseNameUnlinked`). Fine to leave both blank.
- Anniversary Date: optional, shown alongside spouse fields.
- Children: optional, repeatable rows — Name, Age bracket, Sex. Fine to have none.
- Next of Kin: Full Name, Relationship, Phone — treating this as optional since it wasn't marked
  required in the original spec; flag if it should actually be mandatory.

### Step 3 — Mentorship (hard gate)
- Mentee Status: Not Enrolled / Currently Enrolled / Completed.
- Anything other than "Completed" blocks progression past this step entirely — show a clear
  message (e.g. "You'll need to complete mentorship before finishing your profile") and disable
  Next. Don't let someone fill out Steps 4–7 only to be blocked at final submission.
- If Completed: offer to upload a certificate image (same shared upload utility) or explicitly
  skip — skipping is fine, it just means Church Admin follows up manually rather than approving
  straight from the upload.

### Step 4 — Leadership (KLLII)
- Fully optional, skippable entirely.
- Repeatable entries: Level (Level 1 / Level 2 / Advanced), Status (In Progress / Completed),
  optional proof image per entry — someone may have proof for Level 1 while still in progress on
  Level 2, so each entry needs its own upload slot.

### Step 5 — Department (Area of Service)
Optional, single select, sourced from `listActiveDepartments()` (already built in PR8).

### Step 6 — Clan
Optional, single select, sourced from the new `listClans()`.

### Step 7 — Profession
Fully optional: Occupation, Industry/Sector, Employer, Skills (repeatable tags or multi-select).

### Submission
- Final step calls `submitProfile()` with everything collected across all seven steps, including
  the `children` and `leadershipEntries` arrays.
- The backend already enforces the mentorship gate and one-profile-per-user rule server-side —
  but since progression is already blocked at Step 3 client-side, this should never actually be
  hit in normal use.
- On success, transition straight to the pending-review screen (the same one
  `getMyProfileStatus()` would show on a fresh app open).

## Explicitly out of scope
- Any web-side work — Naomi's screens are untouched.
- Draft/partial-save persistence — wizard state lives locally across its own screens only;
  nothing is written to Convex until final submission. Closing the app mid-wizard loses progress,
  matching the earlier decision against resumable server-side drafts.
- Enforcing sequential leadership level order.
- Any change to `users.role` from the mobile side — that only ever happens via Church Admin's
  `verifyProfile`, never here.

## Acceptance criteria
- `listClans()`, `searchUsersForSpouseLink()`, and `getMyProfileStatus()` exist and behave as
  described.
- Opening the flow with no existing profile shows the wizard; with a pending profile shows the
  review-pending screen; with a verified profile shows neither.
- The wizard cannot progress past Step 3 unless Mentee Status is "Completed."
- A submission with mentorship completed, no certificate, and every other section left blank
  succeeds and lands in `pending_verification`.
- A submission including children and leadership entries correctly produces the linked
  `children` and `leadershipProgress` rows.
- Photo, mentorship certificate, and leadership proof images all upload successfully via the
  shared upload utility, with resulting URLs stored correctly.
- Date of birth saves correctly with day+month only and no year, without error.