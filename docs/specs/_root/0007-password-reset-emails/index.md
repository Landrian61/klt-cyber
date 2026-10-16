# 0007. Password reset and the five system emails (Resend)

**Date**: 2026-10-16
**Revised**: 2026-10-16, after a cross check: the asynchronous delivery webhook, `testMode`, the rate limiter's reach, and the session revocation claim were all corrected before any code was written
**Status**: In Progress

## Summary

This feature gives the app its first ability to send email, and uses it to let anyone who forgets their password get back in. Better Auth already contains a complete, safe password reset flow; it has simply never been switched on, because nothing could deliver the email. So the work is mostly wiring: register the Resend component in Convex, write one small send helper and five email bodies, hand Better Auth the one callback it is waiting for, and replace the mock on the mobile forgot password screen with the real call. The reset link lands on a new public page in the web portal, so it works from a laptop, a borrowed phone, or a phone with the app uninstalled. The SRS allows exactly five emails and no more, so the five template names live in one closed list that a test guards.

Two things about the Resend component shape the build and are easy to get wrong: it defaults to a test mode that quietly delivers nothing to real addresses, and a send that later fails tells you so through a webhook rather than at the moment of sending. Both are handled below.

## Requirements

**User stories**:

- As a minister who forgot my password, I ask for a reset link by email and set a new password, without asking anyone for help.
- As a role holder locked out of the portal on my laptop, I reset my password there, without installing the mobile app.
- As a stranger probing the reset form, I learn nothing about which addresses have accounts.
- As a new user, I get one warm welcome email that tells me what to do next.
- As a member whose profile was just verified, I am told by email as well as in the app.
- As the person responsible for this platform, I know exactly which five events send email, no sixth appears by accident, and I find out when a send fails.

**Acceptance criteria** (the contract):

- **AC-1**: The mobile forgot password screen (`apps/mobile/app/(auth)/forgot-password.tsx`) calls the real reset endpoint, and its confirmation copy says the link expires in 1 hour, not 30 minutes.
- **AC-2**: The portal offers a forgot password page at `/forgot-password` that runs the same request and shows the same confirmation.
- **AC-3**: A reset request for an address that has an account delivers one email, from the configured church sending address, with a reply address of `kingdomlifeug@gmail.com`, carrying exactly one action button whose link resolves to the portal's `/reset-password` page with a valid token.
- **AC-4**: Whether or not the address has an account, the screen shows the same confirmation message and the response carries nothing that distinguishes the two cases. A rate limit refusal (AC-21) is the one documented exception, because it depends on the caller's own request count and not on whether the address exists.
- **AC-5**: A reset link stops working 1 hour after it is issued, and a link that has already set a password fails on a second use.
- **AC-6**: `/reset-password` with a valid token shows a form requiring at least 8 characters and a matching confirmation field, with a show and hide control; the server rejects a short password even if the form is bypassed.
- **AC-7**: On success the page confirms the change, states that other devices have been signed out, offers a button to the portal sign in, and tells app users to reopen the app and sign in.
- **AC-8**: After a successful reset every session row for that user is revoked, so no device can refresh a session. An already issued Convex access token stays usable until it expires on its own; the build measures that window and the success copy does not promise anything shorter.
- **AC-9**: `/reset-password` reached with `?error=INVALID_TOKEN` explains that the link expired or was already used, and offers an email field that requests a new link in place, answering with the same neutral confirmation.
- **AC-10**: `/reset-password` and `/forgot-password` are reachable with no session, are listed in the middleware allowlist, and tell search engines not to index them. `/reset-password` also sends no referrer, because the token sits in its URL.
- **AC-11**: A fourth reset request inside 15 minutes from the same caller is refused, the counters are stored in the database so the refusal survives a cold function instance, and the limiter is enabled explicitly so this is testable on a dev deployment.
- **AC-12**: A new account, created by email signup or by Google, receives the welcome email, which greets the person and names completing the member profile as the next step. A failed welcome email never fails the signup.
- **AC-13**: Verifying a member profile sends the profile verified email, whose wording says verified and does not claim membership or completed mentorship, and which carries no links.
- **AC-14**: Exactly five templates exist. The shared registry is a closed list of five names, the send helper accepts no other value, a unit test fails if the list grows or shrinks, and a second test fails if the component's `sendEmail` is called anywhere outside `convex/emails.ts`.
- **AC-15**: Every send writes one `activityLogs` row (`email.sent`, meaning accepted into the send queue) naming the template and the affected user, with no email address in the metadata. Nothing a send does can fail the action the person was performing.
- **AC-16**: The profile sent back and account deleted templates exist with callable internal senders, so features 8 and 9 each wire theirs with one call. Neither is triggered by this feature.
- **AC-17**: Dev sends from Resend's test sender with the component's test mode on; staging and production send from the verified church address with test mode off. Every part of that difference is configuration per deployment, with no environment check in the code.
- **AC-18**: A Google only account that requests a reset receives the email, and setting a password adds email sign in to that account while leaving Google sign in intact.
- **AC-19**: Delivery outcomes arrive through the Resend webhook at `/resend-webhook`, whose signature is verified before anything is trusted. A bounce or permanent failure writes an `email.failed` row for that template and user and reports to Sentry.
- **AC-20**: Every template has a subject line and both an HTML and a plain text body, and every value interpolated into the HTML is escaped, including the person's first name and the free text send back reason.
- **AC-21**: The mobile screen and the portal page each show a loading state while the request is in flight, a retryable message on a network failure, and a distinct "too many attempts, try again later" message on a rate limit refusal. Addresses are trimmed and lowercased before the call.

## Decision

**Chosen option**: Option 2: switch on Better Auth's own reset flow, and add one thin email layer of our own.

Use the password reset endpoints already present in `better-auth@1.6.11` by supplying the `sendResetPassword` callback they are waiting for, send through the `@convex-dev/resend` Convex component (with its webhook wired so failures are visible), and write the five email bodies as plain template functions behind one closed registry in `@klt-cyber/shared`. The reset link lands on a new public page in the web portal rather than deep linking into the app.

**Implementation skills**: `shadcn` (`.claude/skills/shadcn/`) for the portal pages' form primitives

## Feature design

**Data model sketch**:

No new tables in `convex/schema.ts`. Everything the flow stores already has a home.

| Store | Owner | What it holds | Notes |
|---|---|---|---|
| `verification` | Better Auth component | one row per live reset token, identifier `reset-password:<token>`, value is the auth user id | created on request, deleted on use (`deleteVerificationByIdentifier`), expiry 1 hour |
| `rateLimit` | Better Auth component | reset request counters per caller | the table already exists; the component generates its schema with `storage: "database"` |
| Resend component tables | `@convex-dev/resend` | the send queue, retry state, idempotency keys, delivery status | managed by the component, never read directly |
| `activityLogs` | us (existing table) | `action: "email.sent" \| "email.failed"`, `actorUserId` = the affected user, `metadata: { template }` | no recipient address stored; `email.sent` means queued, `email.failed` comes from a webhook event |

New shared contract in `packages/shared/src/constants/emails.ts`, exported from `src/index.ts`:

- `EMAIL_TEMPLATES` = `["welcome", "password_reset", "profile_verified", "profile_sent_back", "account_deleted"]`, declared `as const` and closed.
- `EmailTemplate` = the union of those five names, the only type the send helper accepts.
- `RESET_PASSWORD_PATH` = `"/reset-password"` and `FORGOT_PASSWORD_PATH` = `"/forgot-password"`, so routes and the clients' `redirectTo` cannot drift.
- `PASSWORD_RESET_EXPIRY_SECONDS` = `3600`, used both to configure Better Auth and to render the "1 hour" wording, so the copy cannot contradict the config.

**State transitions** (the reset token):

```
(none) --request--> issued ----used (password set)----> deleted
                      |
                      +--1 hour passes--> expired (callback redirects ?error=INVALID_TOKEN)
```

A token is single use: `/reset-password` deletes the verification row before it returns, so a replayed link fails the same way an expired one does.

**API surface**:

Library provided, switched on by configuration rather than written by us:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/auth/request-password-reset` | POST | `email:string` (req), `redirectTo:string` (opt) | `status:true`, neutral `message` | public | 429 rate limited, 403 untrusted `redirectTo` origin |
| `/api/auth/reset-password/:token` | GET | `token` in path, `callbackURL` query (req) | 302 to `<portal>/reset-password?token=…` or `?error=INVALID_TOKEN` | public | redirect carrying `error`, never a raw 4xx to the browser |
| `/api/auth/reset-password` | POST | `newPassword:string` (req), `token:string` (req) | `status:true` | public, the token is the authority | 400 `INVALID_TOKEN`, 400 `PASSWORD_TOO_SHORT`, 400 `PASSWORD_TOO_LONG` |

Ours:

| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `internal.emails.send` | internal action | `template:EmailTemplate`, `to:string`, `userId:Id<"users">` or null, `idempotencyKey:string`, `data:object` | the component's email id | internal only | queue errors are logged and reported, never thrown to the caller |
| `internal.emails.sendWelcome` | internal action | `userId` | void | internal only | same |
| `internal.emails.sendPasswordReset` | internal action | `authId`, `email`, `url`, `token` | void | internal only | same |
| `internal.emails.sendProfileVerified` | internal action | `userId`, `profileId`, `verifiedAt` | void | internal only | same |
| `internal.emails.sendProfileSentBack` | internal action | `userId`, `profileId`, `sentBackAt`, `reason:string` | void | internal only | unused until feature 9 |
| `internal.emails.sendAccountDeleted` | internal action | `userId`, `email`, `deletedAt` | void | internal only | unused until feature 8 |
| `internal.emails.logSend` | internal mutation | `userId` or null, `template`, `outcome:"sent" \| "failed"` | void | internal only | none |
| `internal.emails.handleEmailEvent` | internal mutation | `vOnEmailEventArgs` (`{ id, event }`) | void | internal only, called by the component | an unknown email id is ignored |
| `/resend-webhook` | HTTP route (POST) | the Resend event payload plus its signature | 200, or 4xx on a bad signature | signature verified with `RESEND_WEBHOOK_SECRET` | bad signature, unparseable payload |
| `/forgot-password` | Next.js page (`apps/admin`) | the typed address | the form, then the neutral confirmation | public | network failure, rate limit refusal |
| `/reset-password` | Next.js page (`apps/admin`) | `token` or `error` query | the form, the expired state, or the success panel | public | invalid token, mismatched passwords, a token that expires between load and submit |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| request reset (mobile) | `redirectTo` | `EXPO_PUBLIC_PORTAL_URL` plus `RESET_PASSWORD_PATH` from `@klt-cyber/shared`; set per EAS profile to that profile's deployment `SITE_URL` |
| request reset (portal) | `redirectTo` | `window.location.origin` plus `RESET_PASSWORD_PATH` |
| request reset | the confirmation copy's "1 hour" | derived from `PASSWORD_RESET_EXPIRY_SECONDS` in `@klt-cyber/shared` |
| request reset | the rate limit message | the 429 the endpoint returns; copy is fixed in each client |
| request reset | the origin mismatch message | the 403 an untrusted `redirectTo` returns; copy says to update the app, since only a misconfigured build can cause it |
| `sendResetPassword` | the reset URL in the email | built by Better Auth as `${CONVEX_SITE_URL}/api/auth/reset-password/<token>?callbackURL=<encoded redirectTo>`, handed to the callback as `url` |
| `sendResetPassword` | recipient address | the `user.email` Better Auth passes the callback |
| `sendResetPassword` | `actorUserId` for the log row | our `users` row, looked up by `authId` from the Better Auth user id (the `by_authId` index). On a miss: send the email anyway, log nothing, report to Sentry, because the email matters more than the audit row |
| every template | subject line | a constant in that template file: welcome "Welcome to Kingdom Life Tabernacle", reset "Reset your KLT Cyber password", verified "Your profile has been verified", sent back "Your profile needs a few changes", deleted "Your KLT Cyber account has been deleted" |
| every template | greeting | `Hello ${firstName},` from `users.firstName` when present, otherwise the literal `Hello there,` |
| every template | the plain text body | written beside the HTML in the same template function, never generated from the HTML |
| every template | any interpolated value | escaped by one `escapeHtml` helper in `convex/lib/emails/layout.ts`, applied to the first name and to the send back reason without exception |
| every send | from address | `EMAIL_FROM` env var on the Convex deployment, including the display name, as `KLT Cyber Church <address>` |
| every send | reply address | `EMAIL_REPLY_TO` env var, set to `kingdomlifeug@gmail.com` on every deployment |
| every send | test mode | `EMAIL_TEST_MODE` env var read into the component's `testMode` option: `true` on dev, `false` on staging and production |
| every send | idempotency key | a formula per template: `welcome:<userId>`, `password_reset:<token>`, `profile_verified:<profileId>:<verifiedAt>`, `profile_sent_back:<profileId>:<sentBackAt>`, `account_deleted:<userId>:<deletedAt>` |
| every template | church name, signature, footer | constants in the shared email layout, not configuration |
| welcome | the next step wording | fixed copy in the template, pointing at the member profile wizard that already exists; no link, per the links decision |
| profile verified | recipient address and first name | `users.email` and `users.firstName`, not the `memberProfiles` copy, so one source of truth holds (F1-07) |
| profile verified | the verified wording | fixed copy, deliberately matching the existing push notice in `verifyProfile`, which says verified and not member |
| profile sent back | the reason | `data.reason`, passed by feature 9's send back mutation, escaped before it reaches the HTML |
| account deleted | recipient address | passed by feature 8's deletion mutation, because the `users` row is anonymized by then |
| webhook | the delivery outcome per email | the `event` the component hands `handleEmailEvent`; a bounce or permanent failure maps to `email.failed` |
| webhook | which template and user a failed email belongs to | looked up from the component's email id, carried on the `activityLogs` row written at queue time; the handler matches on that id |
| reset page | which state to show | the `token` or `error` query parameter Better Auth's callback redirect sets; with neither present, the page shows the same expired state and its re request form |

**Key invariants**:

- Exactly five templates. The registry is the only source, the send helper's parameter type is the registry's union, a test asserts the length, and a second test asserts the component's `sendEmail` is called only inside `convex/emails.ts`.
- The response to a reset request never differs by whether the address exists. This is already true in the library (it fakes a token and a dummy lookup to equalise timing); nothing we add may break it, which rules out any inline "no account found" message. The 429 is the single, documented exception.
- No email address is ever written into `activityLogs` metadata.
- An email failure never fails the user action that triggered it. Every send is scheduled, never awaited inside the mutation that triggered it, and `sendResetPassword` hands off to the scheduler rather than awaiting a send, so the library's timing equalisation survives.
- One email per event, through the component's caller supplied `idempotencyKey` and the formulas above, so a retried trigger does not double send.
- Every interpolated value is escaped before it reaches an HTML body.
- `sendResetPassword` is the only thing that may send `password_reset`, and it is reached only through the rate limited public endpoint, never from our own server code.

**Security model**:

- All three reset endpoints are deliberately unauthenticated: the token in the link is the authority, and it is single use and expires in 1 hour.
- `redirectTo` is checked against `trustedOrigins`, which already holds `SITE_URL` and the app schemes (`convex/auth.ts`, spec 0003), so a reset link cannot be pointed at an attacker's page.
- Rate limit of 3 requests per 15 minutes on `/request-password-reset`, with `storage: "database"` because the library's default in memory counters are worthless on Convex, where each function instance is separate, and `enabled: true` explicitly because the library disables limiting in development.
  - Global defaults stay generous. Turning the limiter on affects every auth route, and the portal reaches Better Auth through its own same origin proxy (`apps/admin/lib/auth-server.ts`), so if the proxy's address is what the limiter sees, a tight global rule would throttle all portal users as one caller. Only the reset path gets a tight custom rule.
  - The build confirms, once, whether a real client address reaches Better Auth through both paths. If it does not, the limiter is keyed to something useless, and the fallback is the per address throttle table weighed in `rationale.md`.
- `revokeSessionsOnPasswordReset: true`, so a reset deletes every session row for that user. An already issued Convex access token survives until its own expiry; that window is named in AC-8 and measured during the build rather than assumed.
- A Google only account's reset is allowed to proceed; the library creates a password credential on reset. The trust anchor is the person's inbox, which is what Google sign in rests on too.
- The webhook verifies its signature with `RESEND_WEBHOOK_SECRET` before trusting any event, so delivery status cannot be forged.
- No personal data in logs: templates and user ids only.
- `/reset-password` and `/forgot-password` carry `noindex`, and `/reset-password` also sets a no referrer policy, so a token in the URL cannot leak through a referrer header or a search index.

**Configuration required**:

Per Convex deployment (`pnpm exec convex env set`):

- `RESEND_API_KEY`: the Resend API key the component reads. One key per deployment, so revoking one environment never touches another.
- `RESEND_WEBHOOK_SECRET`: the signing secret for `/resend-webhook`.
- `EMAIL_FROM`: the sending address with its display name, as `KLT Cyber Church <address>`. Dev uses Resend's test sender; staging and production use the verified church address.
- `EMAIL_REPLY_TO`: `kingdomlifeug@gmail.com` on every deployment, per the SRS email rules.
- `EMAIL_TEST_MODE`: `true` on dev, `false` on staging and production. The component's `testMode` defaults to `true`, which delivers only to Resend's test addresses, so a missing value here means a silent non delivery rather than an error.

On mobile (`apps/mobile`, public at build time, one value per EAS profile matching that profile's deployment `SITE_URL`):

- `EXPO_PUBLIC_PORTAL_URL`: the portal origin the reset link should return to, so the app can pass `redirectTo` itself and keep the request inside the rate limiter.

**RECOMMEND decisions made here** (each with the runner up):

1. **Greeting fallback**: `users.firstName` when it exists, otherwise the literal `Hello there,`. Many accounts arrive with no name at all, and "Hi ," is worse than a neutral greeting. Runner up: a neutral greeting for everyone, which loses warmth for no gain.
2. **One source for the expiry number**: `PASSWORD_RESET_EXPIRY_SECONDS` in `@klt-cyber/shared` feeds both the Better Auth option and the copy. The mock screen already drifted to "30 minutes" against nothing. Runner up: hardcode both, which is how that drift happened.
3. **The portal forgot password path is a page, not a dialog**: `/forgot-password` in the `(auth)` route group, so it reuses the existing auth shell, can be linked from an email or a bookmark, and gets one middleware allowlist line. Runner up: a dialog on the sign in page, which cannot be linked to and complicates that page's state.
4. **Test mode is configuration, not a code branch**: `EMAIL_TEST_MODE` read into `testMode`. Runner up: an environment check in code, which AC-17 rules out and which hides the real behaviour.
5. **The send helper owns the logging**: `internal.emails.send` writes `email.sent` itself and the webhook handler writes `email.failed`. Callers cannot forget either. Runner up: log at each call site, which guarantees drift across five templates.
6. **A missing `users` row never blocks a reset email**: send, skip the log, report to Sentry. Runner up: throw, which would lock someone out over a bookkeeping problem.
7. **No backfill**: existing accounts get no retrospective welcome email. A welcome weeks after signup is noise. Runner up: a one off backfill, which also risks the dev test sender rejecting every address.
8. **If spec 0002's `reportError` has not merged when this builds**, the failure path writes `console.error` plus the `activityLogs` row and the Sentry call is added when 0002 lands. Runner up: block this feature on 0002, which is the wrong dependency for a launch blocker.
9. **`noindex` is delivered in the route's own metadata**, not a global header rule, so it travels with the page under OpenNext on Cloudflare. Runner up: a `next.config` header, which is easier to lose in a deploy configuration change.
10. **Email conventions belong in `convex/AGENTS.md`**, not root: they matter only when working in the backend. Raised as a follow up for `/sync`.

**Critical test scenarios**:

- Happy path: request a reset on mobile, open the emailed link, set a new password, sign in with it on mobile and on the portal, verifies **AC-1**, **AC-3**, **AC-6**, **AC-7**, **AC-8**.
- Enumeration: request a reset for an address with no account and compare the response body, status and timing with a real one, verifies **AC-4**.
- Expiry and replay: open a link after 1 hour, open a link that already set a password, and open the page with no query at all, verifies **AC-5**, **AC-9**.
- Rate limit: send four requests in 15 minutes, including one after a cold start, from both the mobile path and the portal proxy path, verifies **AC-11**.
- Queue failure: make the enqueue itself fail and confirm the signup still succeeds and nothing throws, verifies **AC-15**.
- Delivery failure: send to an address that bounces, confirm the webhook event arrives, an `email.failed` row is written for the right template and user, and Sentry has the report, verifies **AC-19**.
- Test mode: with `EMAIL_TEST_MODE` true, confirm a send to a real address does not deliver and the behaviour is visible rather than silent; with it false on staging, confirm delivery, verifies **AC-17**.
- Content: render all five templates with a name, without a name, and with a send back reason containing HTML, and confirm every subject, both bodies, and the escaping, verifies **AC-20**.
- Registry: add a sixth template name, and separately call the component's `sendEmail` from another file, and confirm each test fails, verifies **AC-14**.
- Screen states: run the request with the network offline and while rate limited, on both surfaces, verifies **AC-21**.
- Auth and permission: call `internal.emails.send` from a client and confirm it is unreachable; post a forged payload to `/resend-webhook` and confirm the signature check rejects it; open both public pages with no session and confirm they render, verifies **AC-10**, **AC-19**.
- Google only account: request a reset on a Google created account, set a password, then sign in both ways, verifies **AC-18**.

## Build plan

Tracer Bullet ordering, from `AGENTS.md` and the scope header. Tasks 1 to 6 are one thin thread: the password reset working end to end, backend through portal page, because it is the launch blocker and it exercises every part of the new email layer. The remaining emails and the delivery webhook thicken that thread afterwards.

1. Provision Resend as a checklist with a named owner for each line: who owns the account and which login address dev mail can therefore reach, one API key per deployment, the webhook signing secret, and who holds DNS control of `kingdomlifetabernacle.net` (it runs live mail on a host, so this is not a free action). Register `@convex-dev/resend` in `convex/convex.config.ts` with a pinned version, and set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_TEST_MODE` on the dev deployment, satisfies **AC-17**.
2. Add the shared contract in `packages/shared` (`EMAIL_TEMPLATES`, `EmailTemplate`, `RESET_PASSWORD_PATH`, `FORGOT_PASSWORD_PATH`, `PASSWORD_RESET_EXPIRY_SECONDS`) with the Vitest test asserting the registry holds exactly five names, and the test asserting the component's `sendEmail` appears only in `convex/emails.ts`, satisfies **AC-14**.
3. Write `convex/lib/emails/layout.ts` (the shared shell, inline styles, Kingdom Radiant colours, the `escapeHtml` helper) and the `password_reset` template with its subject and both bodies, plus `convex/emails.ts` with `internal.emails.send` (idempotency key per the formulas), the per template senders, and `internal.emails.logSend`, satisfies **AC-3**, **AC-15**, **AC-20**.
4. Wire `convex/auth.ts`: the `sendResetPassword` callback (handing off through the scheduler, resolving our `users` row by `authId` for the log, Sentry on a miss), `resetPasswordTokenExpiresIn` from the shared constant, `revokeSessionsOnPasswordReset: true`, and the `rateLimit` block with `enabled: true`, `storage: "database"`, generous global defaults and the tight custom rule for `/request-password-reset`. Confirm once whether a real client address reaches the limiter through both the mobile and the portal proxy paths, and record the answer; if it does not, switch to the per address throttle in `rationale.md`. Measure the access token window AC-8 names, satisfies **AC-3**, **AC-5**, **AC-8**, **AC-11**, **AC-18**.
5. Build the portal `/reset-password` page: the form (8 character minimum, confirmation field, show and hide), the expired state with the inline re request, the success panel, the no query state, copy for a token that expires between load and submit, `noindex` in the route metadata, the no referrer policy, and the middleware allowlist entry next to `/sign-in` and `/unauthorized`, satisfies **AC-6**, **AC-7**, **AC-9**, **AC-10**.
6. Build the portal `/forgot-password` page in the `(auth)` group with its own allowlist entry, reusing the same request call, the same neutral confirmation, and the loading, offline and rate limited states, satisfies **AC-2**, **AC-10**, **AC-21**.
7. Replace the mock in `apps/mobile/app/(auth)/forgot-password.tsx` with the real `requestPasswordReset` call passing `redirectTo`, add `EXPO_PUBLIC_PORTAL_URL` to every EAS profile, correct the expiry copy from the shared constant, trim and lowercase the address, and add the loading, offline, rate limited and origin mismatch states, satisfies **AC-1**, **AC-4**, **AC-21**.
8. Wire delivery visibility: the `onEmailEvent` option pointing at `internal.emails.handleEmailEvent`, the `/resend-webhook` route in `convex/http.ts` calling `resend.handleResendEventWebhook`, the mapping from a bounce or permanent failure to an `email.failed` row plus a Sentry report, and the webhook registered in the Resend dashboard with the `email.*` events enabled, satisfies **AC-19**.
9. Write the remaining four templates (subjects, both bodies, escaping) and wire the two live triggers: welcome scheduled from the `users` `onCreate` trigger in `convex/auth.ts`, and profile verified scheduled from `verifyProfile` in `convex/memberProfiles.ts` beside the existing push dispatch, satisfies **AC-12**, **AC-13**, **AC-16**, **AC-20**.
10. Verify the sending domain and set the real `EMAIL_FROM` and `EMAIL_TEST_MODE: false` on staging and production. This needs the open DNS decision below settled first, and is the one task with a human prerequisite outside the code, satisfies **AC-17**.

## Consequences

**Positive**:

- The launch blocker goes away: a locked out minister recovers alone, on whatever device they have.
- The whole email capability lands once, so features 8 and 9 each add one line instead of their own integration.
- Reset safety comes from the library rather than from our own code: enumeration safe responses, timing equalisation, single use tokens, and the session revocation option are all already written and tested upstream.
- A closed registry plus two tests makes the SRS's "exactly five emails" rule enforceable instead of aspirational, including against a call that bypasses the helper.
- Failed delivery becomes visible through the webhook, so a broken sending domain is caught by Sentry rather than by a minister mentioning it weeks later.
- The portal landing page means no native deep link setup, so nothing here is blocked on app store builds or domain association files.

**Negative / tradeoffs**:

- A new third party in the critical path. If Resend is down, nobody can reset a password, and the component's retries only help once it is back.
- Another alpha or early version component. `@convex-dev/resend` is at `0.2.x`, so it joins `@convex-dev/better-auth` as a pinned dependency that an unplanned upgrade can break.
- Delivery status needs a webhook, which means one more public HTTP route, one more secret, and a dashboard registration step that is easy to forget in a new environment and whose absence looks exactly like "everything is fine".
- `testMode` defaulting to true is a footgun: a staging deployment missing `EMAIL_TEST_MODE` sends nothing and reports no error.
- A mobile user is sent into a browser and must come back to the app to sign in. That is a seam, and the success panel has to carry it with words.
- A reset signs the person out everywhere, including on the device they are happily using, which slightly dents the stay signed in promise of spec 0003; and an already issued access token still works until it expires, so revocation is not instant.
- The rate limit is keyed to the caller, not the email address, and behind the portal's proxy that caller may be the proxy itself, so its protection is weaker on the portal than on mobile.
- `EXPO_PUBLIC_PORTAL_URL` means the portal origin is baked into each mobile build, so changing the portal domain later needs new builds, and a mismatch with that deployment's `SITE_URL` produces a 403 rather than an obvious error.
- Dev cannot email anyone but the Resend account owner, so every dev signup produces a failed welcome send and some Sentry noise.

**Neutral**:

- No schema migration. The only data change is two new `action` values in an existing append only table.
- Resend's free plan allows 100 emails a day and one domain, which is comfortable for about 50 ministers and worth revisiting before the whole congregation arrives.
- Failure reporting prefers the `reportError` helper from spec 0002, which is `In Progress`; the fallback is written out above so this feature is not blocked on it.
- Google sign in is still off in production (feature 30), so AC-18 is designed now and only becomes reachable then.
- Existing accounts get no retrospective welcome email, by decision.

## Follow-up

- [ ] Decide the Resend sending identity: a sending subdomain such as `mail.kingdomlifetabernacle.net`, or the root domain with its existing SPF record edited by hand. The root already runs live mail (`MX = mail.kingdomlifetabernacle.net`, SPF includes `sendersrv.com`), so the subdomain is the safe recommendation and the root is the pretty one. Build task 10 is blocked until this is answered.
- [ ] Add the Resend DNS records once the identity is chosen, and verify the domain in Resend before staging sends anything real.
- [ ] Register the `/resend-webhook` endpoint in the Resend dashboard for each environment, with all `email.*` events enabled.
- [ ] Check Resend's current plan limits before the congregation wide launch, since the free plan's 100 a day and single domain are sized for the pilot, not for everyone.
- [ ] Record the measured access token window from build task 4 somewhere durable, since AC-8's honesty depends on it and spec 0003 should agree with it.
- [ ] Email conventions (the registry rule, the one send helper, the escaping rule, the no address in logs rule) belong in `convex/AGENTS.md`, not root, since they only matter inside the backend. For `/sync`.
- [ ] `AGENTS.md` tells every UI task to load the `klt-cyber-web-ui` and `klt-cyber-brand` skills, but neither is installed in `.claude/skills/`. The two portal pages and the mobile screen are design surfaces, so either install them or correct `AGENTS.md`.
- [ ] F1-04, changing a password while signed in, is deliberately out of scope here and belongs to feature 14 (My Profile and settings). It sends no email under the five email rule.

## Rationale

Reasoning, the options weighed, and the verified evidence: see [rationale.md](rationale.md).
