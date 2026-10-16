# Verify: password reset and the five emails · spec 0007 · updated 2026-10-16

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

**Read this first.** Nothing below that touches real email can run until the Resend
account exists and the five environment variables are set. Those are a human
prerequisite, not a build step, and they are listed under **Prerequisites**.

### Dev deployment as configured on 2026-10-16

Dev deployment `scrupulous-jaguar-678` is now set up far enough for the happy path:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | set (rotate it, see Prerequisites) |
| `EMAIL_FROM` | `KLT Cyber Church <onboarding@resend.dev>` |
| `EMAIL_REPLY_TO` | a personal address, dev only (the spec names the church address, so staging and production must not carry this) |
| `EMAIL_TEST_MODE` | `false` |
| `RESEND_WEBHOOK_SECRET` | set, for the endpoint `https://scrupulous-jaguar-678.convex.site/resend-webhook` |

All five variables are set on dev, so every step below is now runnable there.

This account has no verified domain, so Resend delivers **only to the Resend
account's own login address**. Any dev account you want email for has to sign up
with that address. A Gmail address can never be the sender: Resend signs mail with
DKIM records on the sending domain, and `gmail.com` is not yours to configure.

## Prerequisites (blocking, human owned)

- [ ] A Resend account exists, and you know which login address it owns. Until a domain is verified, Resend delivers **only** to that address, whatever `EMAIL_TEST_MODE` says → AC-17
- [ ] The API key pasted into chat on 2026-10-16 is revoked and replaced, with the replacement set from a terminal rather than pasted anywhere → AC-17
- [ ] One Resend API key per deployment (dev, staging, production), so revoking one environment never touches another → AC-17
- [ ] The webhook signing secret is copied from the Resend dashboard, per environment (done on dev) → AC-19
- [ ] DNS control of `kingdomlifetabernacle.net` is confirmed, and the spec's open identity decision (sending subdomain versus root, see `index.md` Follow-up) is settled. The root already runs live mail, so this is not a free action → AC-17
- [ ] `/resend-webhook` is registered in the Resend dashboard for each environment, with all `email.*` events enabled, at `https://<deployment>.convex.site/resend-webhook` (done on dev; confirm the `email.*` events are all ticked, since the component only acts on `email.bounced` and `email.failed` but logs the rest) → AC-19

## Commands

- [ ] `pnpm exec convex env set RESEND_API_KEY "<key>"` → set per deployment → AC-17
- [ ] `pnpm exec convex env set RESEND_WEBHOOK_SECRET "<secret>"` → set per deployment → AC-19
- [ ] `pnpm exec convex env set EMAIL_FROM "KLT Cyber Church <onboarding@resend.dev>"` → that shared sender is dev only; staging and production use the verified church address → AC-17
- [ ] `pnpm exec convex env set EMAIL_REPLY_TO "kingdomlifeug@gmail.com"` → on every deployment. Dev currently carries a personal address instead, which staging and production must not → AC-3
- [ ] `pnpm exec convex env set EMAIL_TEST_MODE "false"` → `false` anywhere you want mail to arrive at all. `true` only to exercise Resend's test addresses. Read the test mode section below before changing it → AC-17
- [x] `pnpm test` → 96 tests pass (36 in `packages/shared`, 60 in `convex/`) → AC-14, AC-20
- [x] `pnpm exec vitest run --config convex/vitest.config.ts emails.test` → the registry, escaping, and one send helper guards pass → AC-14, AC-20
- [ ] Add a sixth name to `EMAIL_TEMPLATES`, run the suite → the length test fails **and** `convex/emails.ts` fails to compile. Revert → AC-14
- [ ] Add `resend.sendEmail(...)` to any `convex/*.ts` other than `emails.ts`, run the suite → the guard fails and names that file. Revert → AC-14
- [ ] `pnpm --filter admin build` → compiles, with `/reset-password` and `/forgot-password` both listed → AC-2, AC-10
- [x] `pnpm --filter mobile lint` → clean → AC-1

## UI / manual

### The happy path

- [ ] On mobile, open Sign in → Forgot password, enter an address that has an account, submit → the button shows a spinner, then the confirmation names the address and says the link expires in **1 hour** (not 30 minutes) → AC-1, AC-21
- [ ] Open the email → it comes from the configured church address, its reply address is `kingdomlifeug@gmail.com`, and it carries exactly **one** action button → AC-3
- [ ] Tap the button → it lands on the portal's `/reset-password` with a `token` query parameter → AC-3
- [ ] Set a password of at least 8 characters, matching the confirmation field, using the show and hide control on both fields → it saves → AC-6
- [ ] The success panel confirms the change, says other devices were signed out, offers a button to the portal sign in, and tells app users to reopen the app and sign in → AC-7
- [ ] Sign in with the new password on mobile **and** on the portal → both work → AC-1
- [ ] On the portal, go to `/forgot-password`, run the same request → the same confirmation copy appears → AC-2

### Enumeration safety (the one that matters most)

- [ ] Request a reset for an address with **no** account. Compare the response body, the HTTP status, and the wall clock timing against a request for a real address → indistinguishable. The screen shows the same confirmation → AC-4
- [ ] Confirm no "no account found" message exists anywhere in either client → AC-4

### Expiry, replay, and the dead link states

- [ ] Open a reset link more than 1 hour after it was issued → the expired state, explaining the link expired or was already used, with an email field that requests a new link in place and answers with the same neutral confirmation → AC-5, AC-9
- [ ] Open a link that has already set a password → the same expired state → AC-5
- [x] Open `/reset-password` with no query at all → the same expired state → AC-9
- [ ] Load `/reset-password` with a valid token, wait for the token to expire, then submit → the page drops into the expired state rather than a dead end → AC-9

### Session revocation and the honest window

- [ ] Sign in on two devices, reset the password on one → every session row for that user is gone, so neither device can refresh a session → AC-8
- [ ] **Measure** how long an already issued Convex access token keeps working after the reset, and record the number in the spec (its Follow-up asks for this). Confirm the success copy does not promise anything shorter than the measured window → AC-8

### Rate limiting (read the warning below)

- [x] Send four reset requests inside 15 minutes from the same caller → the fourth is refused, and the client shows the distinct "too many attempts" message rather than the neutral confirmation → AC-11, AC-21
- [x] Repeat after forcing a cold function instance → still refused, because the counters are in the database, not in memory → AC-11
- [x] **Confirm the limiter can see a caller at all.** Better Auth keys counters on the client IP from the `x-forwarded-for` header, and when it cannot read one it **skips rate limiting entirely** and logs a single warning. Check the Convex logs for "Rate limiting skipped: could not determine client IP address" on both paths: the mobile app talking straight to `*.convex.site`, **and** the portal going through its own `/api/auth` proxy → AC-11
- [ ] If that warning appears, AC-11 does not hold. Switch to the per address throttle weighed in the spec's `rationale.md` → AC-11
- [ ] If the limiter does work on the portal path, check **whose** address it saw. If it is the proxy's rather than the user's, every portal user counts as one caller; confirm the generous global rule (60s / 100) does not throttle normal portal use → AC-11

### Test mode, and what it actually does

`testMode` in `@convex-dev/resend` is not a "do not deliver" switch. It is a
recipient allow list. With it on, the only accepted addresses are
`delivered@resend.dev`, `bounced@resend.dev`, and `complained@resend.dev` (a
`+suffix` on any of those is accepted too). Anything else throws at enqueue,
inside `deliver()`, which logs and reports it rather than rethrowing. A wrong
setting therefore shows up as a log line: not as silence, and not as an error the
person sees.

`EMAIL_TEST_MODE` is read as `!== "false"`, so **unset means on**.

- [ ] With `EMAIL_TEST_MODE=true`, send to a real address → nothing is delivered, and the Convex logs carry the "not a valid resend test address" error from `deliver()` → AC-17
- [ ] With `EMAIL_TEST_MODE=true`, send to `delivered@resend.dev` → accepted, and visible in the Resend dashboard → AC-17
- [ ] With `EMAIL_TEST_MODE=true`, send to `bounced@resend.dev` → the bounce reaches the webhook and `handleEmailEvent` records the failure. This is the cheapest way to check AC-19 → AC-19
- [ ] With `EMAIL_TEST_MODE=false` → real addresses deliver, subject to Resend's own rule that an unverified account can only reach its own login address → AC-17
- [ ] Unset `EMAIL_TEST_MODE` on a deployment that was sending real mail → delivery stops, because unset reads as on. Confirm the log line tells you so → AC-17

### The other four emails

- [x] Create a new account by email signup → the welcome email arrives, greets the person, and names completing the member profile as the next step. It carries no links → AC-12
- [ ] Create a new account with Google → the same welcome email arrives → AC-12
- [ ] Make the enqueue itself fail (an invalid `EMAIL_FROM`, or no API key) and sign up → the signup still succeeds, nothing throws at the person, and the failure is in the logs → AC-15
- [ ] Verify a member profile in the portal → the profile verified email arrives, says verified, does **not** call the person a member or mention mentorship, and carries no links → AC-13
- [x] Confirm `internal.emails.sendProfileSentBack` and `internal.emails.sendAccountDeleted` are callable and that nothing in this feature triggers them → AC-16

### Delivery failure

- [ ] Send to an address that bounces → the webhook event arrives, an `email.failed` row is written to `activityLogs` for the right template and user, and Sentry has the report → AC-19
- [ ] Post a forged payload to `/resend-webhook` → the signature check rejects it with a 4xx → AC-19
- [x] Inspect every `email.sent` and `email.failed` row → the metadata holds the template name and never an email address → AC-15

### Content and escaping

- [ ] Render all five templates with a first name, without one, and with a send back reason containing HTML → every subject is present, both bodies are present, and nothing interpolated reaches the HTML unescaped → AC-20
- [x] Confirm the greeting falls back to "Hello there," when `users.firstName` is absent, rather than "Hi ," → AC-20

### Public reachability and token hygiene

- [x] Open `/reset-password` and `/forgot-password` with no session → both render rather than redirecting to `/sign-in` → AC-10
- [x] Open both **with** a session cookie → they still render, because somebody already signed in may be resetting a forgotten password → AC-10
- [x] View source on both → `<meta name="robots" content="noindex">` is present → AC-10
- [x] View source on `/reset-password` → a no referrer policy is present, so the token in the URL cannot leak through a referrer header → AC-10
- [x] Try calling `internal.emails.send` from a client → unreachable → AC-15

### Google only account

- [ ] On a Google created account, request a reset → the email arrives. Set a password, then sign in both with email/password and with Google → both work → AC-18

### Screen states on both surfaces

- [ ] Run the request with the network off, on mobile and on the portal → a retryable message, not a crash and not a false confirmation → AC-21
- [ ] Run the request while rate limited, on both → the distinct "too many attempts" message → AC-21
- [ ] Enter an address with capitals and a trailing space → it is trimmed and lowercased before the call → AC-21
- [ ] Build mobile with `EXPO_PUBLIC_PORTAL_URL` unset, request a reset → the "this build needs an update" message, not a silent 403 → AC-21

## Value sourcing (one step per row of the spec's table)

Each of these exercises where a value actually comes from, especially the edge that breaks if the source is wrong.

- [ ] `redirectTo` (mobile): built from `EXPO_PUBLIC_PORTAL_URL` plus the shared `RESET_PASSWORD_PATH`. Point one EAS profile at an origin that is **not** that deployment's `SITE_URL` → the request returns 403 and the client says to update the app → AC-21
- [ ] `redirectTo` (portal): built from `window.location.origin`. Load the portal on a second hostname that is not `SITE_URL` → 403, which is the trusted origin check doing its job → AC-10
- [ ] The "1 hour" copy: change `PASSWORD_RESET_EXPIRY_SECONDS` to 1800 → the email, the mobile confirmation, and the portal confirmation all say "30 minutes" without any copy being edited. Revert → AC-1, AC-5
- [ ] The reset URL in the email: built by Better Auth as `${CONVEX_SITE_URL}/api/auth/reset-password/<token>?callbackURL=<encoded redirectTo>` → follow it and confirm it redirects to the portal with the token → AC-3
- [ ] Recipient address: the `user.email` Better Auth passes the callback. Reset for an account whose `users.email` differs from the auth record → confirm which one received it, and that it is the auth record's → AC-3
- [ ] `actorUserId` on the log row: resolved from `authId` via the `by_authId` index. Delete the `users` row for an auth user, then reset → the email still sends, no log row is written, and Sentry has the miss → AC-15
- [x] Subject lines: each template's own constant. Confirm all five read as the spec's table says → AC-20
- [ ] Greeting: `users.firstName` when present, else "Hello there," → covered above → AC-20
- [x] Plain text body: written beside the HTML, never generated from it. Confirm the text body of each email is not stripped HTML → AC-20
- [ ] Escaping: one `escapeHtml` helper, applied to the first name and the send back reason without exception → covered above → AC-20
- [x] From address: `EMAIL_FROM`, including the display name, as `KLT Cyber Church <address>` → check the rendered From line → AC-3
- [ ] Reply address: `EMAIL_REPLY_TO`. Hit reply on a received email → it addresses `kingdomlifeug@gmail.com` → AC-3
- [ ] Test mode: `EMAIL_TEST_MODE` read into the component's `testMode` → covered above → AC-17
- [x] Idempotency keys: trigger the same event twice (verify a profile, retry the welcome) → exactly one email arrives, and one `email.sent` row exists → AC-15
- [ ] Church name, signature, footer: constants in the layout, not configuration → confirm they are identical across all five → AC-20
- [x] Welcome next step wording: fixed copy pointing at the member profile wizard, with no link → AC-12
- [ ] Profile verified recipient and name: `users.email` and `users.firstName`, **not** the `memberProfiles` copy. Make them differ, then verify the profile → the email uses the `users` values (F1-07) → AC-13
- [ ] Send back reason: `data.reason`, escaped. Pass a reason containing `<script>` → AC-20
- [ ] Account deleted recipient: passed explicitly by the caller, because the `users` row is anonymized by then → AC-16
- [ ] Webhook outcome mapping: a bounce or permanent failure maps to `email.failed`; delivered, opened and clicked do not → AC-19
- [ ] Webhook template and user resolution: looked up from the component's email id against the row written at queue time. Send an event for an unknown email id → it is ignored, with a warning, and no row is written → AC-19
- [ ] Reset page state: decided by the `token` or `error` query parameter; neither present shows the expired state → covered above → AC-9

## Acceptance-criteria coverage

- AC-1 mobile real call and 1 hour copy · AC-2 portal forgot password page · AC-3 one email, right from/reply/button · AC-4 enumeration safety · AC-5 expiry and replay · AC-6 form rules and show/hide · AC-7 success panel · AC-8 session revocation and the measured token window · AC-9 invalid token state with inline re request · AC-10 public, noindex, no referrer · AC-11 rate limit, database backed, and the "can it see a caller at all" check · AC-12 welcome on both signup paths · AC-13 profile verified wording · AC-14 closed registry, both guards · AC-15 one log row per send, no addresses, never fails the action · AC-16 the two unwired senders exist · AC-17 test mode and sending identity as configuration · AC-18 Google only account · AC-19 webhook, signature, `email.failed`, Sentry · AC-20 subjects, both bodies, escaping · AC-21 loading, offline, rate limited, trimming
- **Unverifiable until the prerequisites are met:** AC-3, AC-12, AC-13, AC-17, AC-18, AC-19 all need a live Resend account. AC-8's measurement and AC-11's limiter reach need a live deployment.
