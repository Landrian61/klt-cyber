# Auth QA Checklist — Increment 1 (Auth & Sign-Up)

A permanent, repeatable manual-QA artifact for the cross-platform
authentication increment. It validates that the **web admin** and the
**mobile app** behave identically against the shared Convex + Better Auth
backend, per `docs/DATA_MODEL.md`.

Run this checklist after any change touching auth (either platform, the shared
validators, or the Convex auth wiring). Tick the boxes, record observations in
**Notes**, and file any **Fail** as an issue.

---

## Setup

Start these in separate terminals from the repo root and leave them running:

| Process | Command | Notes |
|---|---|---|
| Convex dev | `pnpm convex` | Keeps the deployment + functions live; shows logs |
| Web admin | `pnpm admin` | Serves http://localhost:3000 |
| Mobile app | `pnpm mobile` | Expo dev server; open on a device/emulator (Expo Go or dev build) |
| Convex dashboard | `npx convex dashboard` (or dashboard.convex.dev) | Open the **Data** tab to inspect `users` + `activityLogs` |

Prerequisites / conventions:
- Shared validators live in `@klt-cyber/shared` (`signUpInputSchema`,
  `signInInputSchema`). Run `pnpm test` to confirm they pass before manual QA.
- A fresh sign-up must create a **visitor**: `users` row with `role="visitor"`,
  `profileCompleted=false`, and an `activityLogs` row with `action="user.signup"`.
- Sign-in failure copy is the same, non-leaky string on both platforms:
  **"Invalid email or password."**
- Use a fresh, unique email per sign-up (e.g. `qa+<timestamp>@example.com`).
  Accounts are shared across platforms, so reuse them for cross-platform steps.
- **Google (scenarios M/N):** requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  set on the Convex deployment (`npx convex env set ...`) **and** the redirect
  URI `https://<deployment>.convex.site/api/auth/callback/google` registered in
  Google Cloud Console. If not configured, run **N** instead of **M**.
- **Seed admin (scenario L):** `SEED_ADMIN_EMAIL` must be set on the deployment
  (`npx convex env set SEED_ADMIN_EMAIL you@example.com`).

Legend: `- [ ]` open · `- [x]` pass · `- [F]` fail (see Notes) · `- [S]` skipped.

---

## Scenarios

### A. Mobile sign-up creates a visitor
**Steps:** Mobile → Welcome → Create account → enter a fresh email + password (≥8) → Create account.
**Expected:** Lands in the main tabs. Convex **Data → users**: new row with `role="visitor"`, `profileCompleted=false`. **activityLogs**: new row `action="user.signup"` with `actorUserId` = that user's `_id`.
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### B. Web sign-up creates a visitor
**Steps:** Web → `/sign-up` → enter a fresh email + password (≥8) → Create account.
**Expected:** Redirects to `/` (admin home) showing the email + "Visitor" badge. Convex shows the same `users` (visitor, `profileCompleted=false`) + `activityLogs` `user.signup` rows as in A.
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### C. Cross-platform sign-in: mobile account → web
**Steps:** Take the email/password created on **mobile** (A). Web → `/sign-in` → enter them → Sign in.
**Expected:** Signs in, lands on `/`. No duplicate `users` row created.
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### D. Cross-platform sign-in: web account → mobile
**Steps:** Take the email/password created on **web** (B). Mobile → Sign in → enter them.
**Expected:** Signs in, lands in tabs. No duplicate `users` row.
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### E. Session persistence — mobile
**Steps:** While signed in on mobile, fully close the app (swipe away), reopen.
**Expected:** Brief branded loader, then straight into the tabs — no sign-in required (session restored from `expo-secure-store`).
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### F. Session persistence — web
**Steps:** While signed in on web, close the tab, reopen http://localhost:3000.
**Expected:** Loads `/` directly, still signed in (no redirect to `/sign-in`).
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### G. Sign-out — mobile
**Steps:** Mobile → Profile → Sign out.
**Expected:** Returns to the auth flow (Welcome). The tabs are no longer reachable; relaunching opens the auth flow, not the tabs.
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### H. Sign-out — web
**Steps:** Web → top header → Sign out.
**Expected:** Returns to `/sign-in`. Manually visiting `/` redirects back to `/sign-in` (route blocked).
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### I. Validation parity (web + mobile, side by side)
**Steps:** On each platform's sign-up (and sign-in) try: (1) empty email, (2) invalid format `foo@`, (3) empty password, (4) password `short` (<8, sign-up), (5) duplicate email (an address that already exists, sign-up).
**Expected (identical on both):**
- Empty / invalid email → inline error near the email field: "Please enter a valid email address."
- Empty password (sign-in) → inline: "Please enter your password."
- Password < 8 (sign-up) → inline: "Password must be at least 8 characters."
- Duplicate email (sign-up) → server error surfaced (account not created twice).
- Submit button is enabled even when fields are empty (errors appear on submit).
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### J. Wrong-password handling — both platforms
**Steps:** Sign in with a real email but the wrong password, on each platform.
**Expected:** Both show exactly **"Invalid email or password."** No session is created. The message does **not** reveal whether the email exists (same text for unknown email vs. wrong password).
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### K. Fresh-account default state
**Steps:** Inspect a just-created (email/password) account in Convex **Data → users**.
**Expected:** `role="visitor"`, `profileCompleted=false`, `status="active"`; `firstName`, `lastName`, `profilePictureUrl` are **absent** (only populated when Google supplies them).
**Result:** - [ ] Pass &nbsp; - [ ] Fail
**Notes:**

### L. System-admin promotion
**Prereq:** `SEED_ADMIN_EMAIL` set on the deployment.
**Steps:** Sign up the `SEED_ADMIN_EMAIL` account (either platform). Run `pnpm exec convex run seed:promoteSeedAdmin`. Inspect the user in Convex. Run the same command a second time.
**Expected:** First run returns `{ promoted: true, ... }` and the user's `role` flips to `system_admin`. Second run returns `{ promoted: false, reason: "already admin" }`.
**Result:** - [ ] Pass &nbsp; - [ ] Fail &nbsp; - [ ] Skipped
**Notes:**

### M. Google sign-in (skip if Google not configured)
**Prereq:** Google credentials configured on the deployment + redirect URI registered.
**Steps:** On each platform, tap/click "Continue with Google" and complete the Google flow.
**Expected:** Returns authenticated. A `users` row is created with `role="visitor"`, `profileCompleted=false`, and `firstName` / `profilePictureUrl` populated from the Google profile.
**Result:** - [ ] Pass &nbsp; - [ ] Fail &nbsp; - [ ] Skipped (reason: ____)
**Notes:**

### N. Google fallback (run if Google NOT configured)
**Steps:** On each platform, click/tap "Continue with Google".
**Expected:** The button is visible on both platforms. The click fails **gracefully** with an inline error (no crash, no blank screen). Email/password sign-in and sign-up still work normally.
**Result:** - [ ] Pass &nbsp; - [ ] Fail &nbsp; - [ ] Skipped (reason: ____)
**Notes:**

---

## Run log

| Date | Run by | Commit / branch | Result summary |
|---|---|---|---|
|  |  |  |  |
