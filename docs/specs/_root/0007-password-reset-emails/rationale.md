# 0007. Password reset and the five system emails · rationale

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: the code side of this feature is small, and the real blocker is not code. Better Auth already ships the entire reset flow; it is dormant only because `sendResetPassword` is absent. The thing that can actually hold this up is the sending domain, and `kingdomlifetabernacle.net` already runs the church's live mail (`MX = mail.kingdomlifetabernacle.net`, SPF `v=spf1 +a +mx +ip4:104.243.33.38 +ip4:104.243.34.41 +include:sendersrv.com ~all`, DMARC `p=none`), so this touches records that people's working inboxes depend on. Treat the DNS decision as the critical path and the code as the easy part. Named as a follow up rather than decided here, at the engineer's request.

Password reset is one of the SRS's named launch blockers (§10.2, alongside session persistence). Today a minister who forgets their password has no way back in: the mobile screen exists but its submit handler is a `setTimeout` with a `// TODO: Integrate real password reset`, and the portal has no reset path at all. With about 50 ministers at launch on 29 November 2026 and no help desk, every forgotten password becomes a direct message to one person.

The app also cannot send email of any kind. There is no Resend integration, no mail component in `convex/convex.config.ts`, and no send function anywhere in `convex/`. Three other SRS stories are waiting on that same missing capability: profile verified (F4-06), profile sent back (F2-05), and account deletion confirmed (F1-06). The SRS is unusually firm about the boundary: exactly five events send email, nothing else, from a church domain address replying to `kingdomlifeug@gmail.com`.

Two constraints shape the design more than anything else. First, Convex is the only backend, and both apps reach it through the typed client, so email has to be a Convex action and the reset endpoints have to be the Better Auth HTTP routes already mounted in `convex/http.ts`. Second, `@convex-dev/better-auth` is pinned deliberately (`AGENTS.md`: its Convex integration API is alpha, an upgrade is a separate end to end tested change), which means this feature must work with what `better-auth@1.6.11` actually does, not with what its latest documentation describes.

A prerequisite worth stating: failure reporting here depends on the `reportError` helper introduced by spec 0002, which is still `In Progress`. This feature assumes that helper stays action callable.

## Options considered

### Option 1: build the reset flow ourselves

Our own token table, our own expiry, our own endpoints, with Resend called directly over REST from a Convex action.

**Pros**:

- Total control over the token shape, the expiry, and the wording of every response.
- No dependency on how Better Auth happens to spell its options this month, which matters given the pinned alpha integration.

**Cons**:

- It rebuilds the one thing the project already decided to buy rather than build. Authentication details are where quiet breaches live: token entropy, single use enforcement, timing equalisation on unknown addresses, session revocation. Better Auth already does all four in code we can read.
- A new table, new indexes, new cleanup of expired rows, and our own rate limiting, none of which exist today.
- It would be the only part of auth not handled by the auth library, so the next person has to learn two systems.

### Option 2: switch on Better Auth's reset flow, add a thin email layer (chosen)

Supply the `sendResetPassword` callback, set three options, send through the `@convex-dev/resend` component, and write the five bodies as plain template functions behind a closed registry. Land the link on a new public portal page.

**Pros**:

- The security sensitive half is already written, and verified in the installed source: unknown addresses get an identical response plus a faked token and dummy lookup to equalise timing; tokens are single use (`deleteVerificationByIdentifier`); expiry defaults to exactly the chosen 1 hour; session revocation and a database backed rate limiter are each one option, and the component already ships the `rateLimit` table.
- The email layer stays small and ours: one send helper, one layout, five templates, one closed list.
- The portal landing page needs no native deep link work, so nothing is blocked on app store builds or domain association files, and it serves portal only role holders too.

**Cons**:

- Couples the reset flow to a pinned alpha integration's behaviour, so an eventual Better Auth upgrade has to re test this path.
- Adds a second early version Convex component (`@convex-dev/resend`, `0.2.x`).
- Knowing whether a send actually arrived needs the component's event webhook, so this option carries one extra public route, one extra secret, and a dashboard registration step per environment.
- Its `testMode` defaults to on, which means a deployment missing that one variable silently delivers nothing.
- Sends a mobile user into a browser and back again, which is a visible seam.

### Option 3: Better Auth's flow, but deep link into the mobile app

Same backend, with the email link opening the app at an in app reset screen through the `kltcyber://` scheme.

**Pros**:

- The smoothest path for the common case, a minister reading mail on the phone that has the app.
- No new public page in the portal.

**Cons**:

- Dead on a laptop, dead on a phone without the app, and dead for a portal only role holder, which are exactly the people most likely to be locked out of the portal.
- Doing it properly needs universal links and app site association files on the church domain, which is more DNS and native configuration than the whole rest of this feature.

### Option 4: Better Auth's flow, email templates stored in Resend

Same backend and landing page, with the five bodies authored in Resend's dashboard and only variables sent from Convex.

**Pros**:

- Non developers could edit copy without a deploy.
- Less markup in the repository.

**Cons**:

- The templates leave git, so they leave code review, history, and the dev, staging and production parity the project insists on elsewhere.
- Three Resend accounts or one shared account both end badly: either the environments drift or dev edits change production email.

## Rationale

Option 2 wins on the specific forces in Context rather than on taste. The flow is a launch blocker with no help desk behind it, so the fastest safe path matters; and because the auth library is pinned alpha, the cheapest thing to depend on is what its installed code already does, which is why every claim in the spec was checked against `node_modules/better-auth/dist/api/routes/password.mjs` instead of its documentation. Reading that file turned three design questions into facts: enumeration safety is already handled, the chosen 1 hour expiry is already the default, and the token is already single use. Option 1 would have meant rebuilding those three properties by hand, in the part of a codebase where being subtly wrong is least visible.

The landing page choice follows from who gets locked out. The SRS's portal users are role holders, and spec 0004 removed web signup specifically so a portal user signs in with the account they made on mobile. A deep link only reset (Option 3) would therefore have served everyone except the people whose lockout is hardest to resolve. A browser page costs one seam in the mobile journey and removes four failure cases.

On the Resend component over a direct REST call, the deciding force is that one of these five emails is the only way back into an account. The component gives durable queueing, retries, and caller supplied idempotency that we would otherwise write ourselves, and the project already runs three Convex components, so the pattern is familiar rather than new. The honest costs are a second early version dependency and the event webhook, both of which the spec now carries explicitly rather than discovering mid build. A cross check argued for dropping the component precisely because of that webhook; the comparison is below, and the component still wins, because the retry behaviour it replaces is the part we would least want to hand roll on the one path that unlocks an account.

Two of the engineer's early answers were revised once the installed source contradicted them, and both revisions are theirs, not mine. The Google only account was first answered as "send nothing", which the library cannot do without an extra accounts lookup on the reset path; shown that `/reset-password` creates a `credential` row when none exists, the engineer took the library default, which keeps the five email rule intact and rests on the same inbox trust that Google sign in already assumes. The per address throttle was also set aside in favour of the library's caller keyed limiter: it is one config block against a new table and a check on the reset path, and for about 50 users the gap it leaves is inbox nuisance, not account risk. That gap is stated in the spec's security model rather than hidden.

## Evidence

### Verified in the installed packages (not from documentation)

Read directly from `node_modules` at `better-auth@1.6.11`, `@convex-dev/better-auth@0.12.2`:

| Fact | Where |
|---|---|
| Unknown address returns `{ status: true, message: "If this email exists in our system, check your email for the reset link" }`, after calling `generateId(24)` and a dummy verification lookup to equalise timing | `better-auth/dist/api/routes/password.mjs`, `requestPasswordReset` |
| `sendResetPassword` receives `{ user, url, token }` plus the request; absence of it makes the endpoint throw `RESET_PASSWORD_DISABLED` | same file |
| Reset URL shape: the source builds `${ctx.context.baseURL}/reset-password/${token}?callbackURL=<encoded redirectTo>`, and since our `baseURL` is `CONVEX_SITE_URL` and the routes mount under the default `/api/auth` base path, the real emailed URL is `${CONVEX_SITE_URL}/api/auth/reset-password/<token>?callbackURL=…`, which is the one shape `index.md` states | same file |
| `redirectTo` passes through `originCheck`, so it must match `trustedOrigins` | same file, endpoint options |
| Expiry defaults to `3600` seconds via `resetPasswordTokenExpiresIn` | same file, and `@better-auth/core/dist/types/init-options.d.mts` line 590 |
| The GET callback validates expiry and redirects to `?error=INVALID_TOKEN`, otherwise to `?token=…` | same file, `requestPasswordResetCallback` |
| `/reset-password` creates a `credential` account when the user has none, otherwise updates the password, then deletes the verification row, then calls `onPasswordReset`, then revokes sessions if configured | same file, `resetPassword` |
| `revokeSessionsOnPasswordReset` exists, default `false`; `onPasswordReset` exists | `@better-auth/core/dist/types/init-options.d.mts` lines 595, 623 |
| The Convex component already defines a `rateLimit` table and generates its schema with `rateLimit: { storage: "database" }` | `@convex-dev/better-auth/dist/component/schema.d.ts` line 213, `dist/auth-options.js` line 17 |
| Our `createAuth` currently sets no `rateLimit` block at all, so it would default to in memory counters | `convex/auth.ts` |

### Verified by web check during the design conversation

- Better Auth client methods are `requestPasswordReset` and `resetPassword`; `forgetPassword` reads as legacy naming.
- Better Auth's limiter is enabled by default in production and disabled in development, and its own documentation calls the in memory default unsuitable for serverless, which is why `storage: "database"` is not optional here.
- Server side `auth.api` calls bypass rate limiting entirely. This is the fact that decided who builds the return URL: wrapping the request in our own Convex action would have silently removed the limiter.
- `@convex-dev/resend` provides queueing, batching, idempotency key management, Resend rate limit handling, and automatic retries, registered with `app.use(resend)` and reading `RESEND_API_KEY`.
- Resend requires a verified sending domain, recommends a sending subdomain to isolate reputation, and warns that changing root MX can break receiving. `onboarding@resend.dev` delivers only to the Resend account's own address. Free plan: 100 emails a day.

### Confirmed from the component's own README, after the cross check

Read directly from `@convex-dev/resend`'s published README, because three design points depended on it and none could be checked in `node_modules` (the component is not installed yet):

| Fact | Consequence for this spec |
|---|---|
| `replyTo` is supported on `sendEmail`, along with other headers | the SRS reply address rule is satisfiable on the component path, so the REST fallback branch was deleted from build task 1 rather than carried |
| `idempotencyKey` is caller supplied, and a repeat key returns the existing email id | the one email per event invariant is real, and the per template key formulas in `index.md` are what make it work |
| `testMode` defaults to **true**, delivering only to Resend's test addresses | a staging or production deployment missing `EMAIL_TEST_MODE` sends nothing and raises no error, which is why that variable is in the configuration list and in AC-17 |
| delivery and bounce outcomes arrive through an `onEmailEvent` internal mutation, fed by an HTTP route calling `resend.handleResendEventWebhook`, with the signing secret in `RESEND_WEBHOOK_SECRET` | `email.failed` cannot be written at send time, so AC-15 was split into AC-15 (queued) and AC-19 (delivery outcome), and build task 8 exists |
| it reads `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`, or takes both as options | the configuration list names both, one key per deployment |

A cross check also doubted that the caller could supply an idempotency key; the README contradicts that, which is why the invariant stayed. The same pass was right about `testMode` and about the webhook, and both corrections landed before any code was written.

### Why not a direct REST call instead

Worth stating, since the webhook work makes the component look heavier than it first did. A single internal action posting to `https://api.resend.com/emails` would remove the second early version dependency, make the reply address certain without reading anyone's README, and let a non success response write `email.failed` inline with no webhook at all. What it gives up is the queue and the automatic retries, which would become our own scheduler based retry loop on the one path that unlocks an account, plus Resend rate limit handling and idempotency bookkeeping. It also still would not see an asynchronous bounce, so delivery truth needs a webhook either way. The component keeps the retry logic out of our code; that is the trade.

If the component ever has to be dropped, this is the shape that replaces it, keeping every other decision intact (same registry, same templates, same logging, same triggers):

```ts
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  },
  body: JSON.stringify({
    from: process.env.EMAIL_FROM,
    to: [to],
    reply_to: process.env.EMAIL_REPLY_TO,
    subject,
    html,
    text,
  }),
});
```

Replace the queue with `ctx.scheduler.runAfter` retries on a failed send, capped at three attempts, then the same `email.failed` log and Sentry report. Note the REST field is `reply_to` in snake case, which was not fetched from Resend's API reference and should be confirmed against it.

### The per address throttle, held in reserve

The chosen limiter keys on the caller, and the portal reaches Better Auth through its own same origin proxy, so the address the limiter sees on that path may be the proxy rather than the person. Build task 4 settles that question once. If no real client address arrives, the limiter is keyed to something useless and this is the replacement: a small table (`email`, `windowStart`, `count`) checked inside `sendResetPassword` before each send, keyed on the normalised address, which also closes the inbox flooding gap the caller keyed limiter leaves open. The cost is a new table and a check on the reset path, which is why it is reserve rather than default.

## References

**Project sources** (verifiable in this repo):

- `spec/SRS.md` §4.1 F1-03, F1-10, the email rules, and the notification catalogue rows N01, N02, N03, N05, N06
- `spec/SRS.md` §10.2, password reset named as a launch blocker
- spec [0002](../0002-error-screens-sentry-update-channels/index.md), the `reportError` helper this feature's failure path uses
- spec [0003](../0003-stay-signed-in/index.md), the 30 day session policy and `trustedOrigins`
- spec [0004](../0004-remove-suspension-web-signup/index.md), no web signup, so portal users are mobile created accounts
- `convex/auth.ts`, `convex/http.ts`, `convex/memberProfiles.ts` (`verifyProfile`), `apps/admin/middleware.ts`, `apps/mobile/app/(auth)/forgot-password.tsx`
- `AGENTS.md`, the pinned Better Auth integration rule, the shared package contract rule, and the `activityLogs` convention
- the installed packages read directly, listed in Evidence above

**Practices & standards**:

- identical response, status and timing for unknown accounts, the standard defence against account enumeration
- single use, short lived reset tokens
- session revocation on credential change
- rate limiting every unauthenticated endpoint
- idempotency keys for operations with external side effects
- no personal data in audit logs
- a sending subdomain to protect an existing mail domain's deliverability

**Links** (web verified during the design conversation):

- Better Auth email and password, including `sendResetPassword`: https://www.better-auth.com/docs/authentication/email-password
- Better Auth options reference (`resetPasswordTokenExpiresIn`, `revokeSessionsOnPasswordReset`, `onPasswordReset`): https://www.better-auth.com/docs/reference/options
- Better Auth rate limiting, including the serverless storage warning: https://www.better-auth.com/docs/concepts/rate-limit
- Convex Resend component: https://www.convex.dev/components/resend
- The component's own README, the source for `replyTo`, `idempotencyKey`, `testMode`, `onEmailEvent` and `handleResendEventWebhook`: https://cdn.jsdelivr.net/npm/@convex-dev/resend/README.md
- Resend, add and verify a domain: https://resend.com/docs/add-a-domain
- Resend DNS record guidance: https://resend.com/docs/guides/dns/cloudflare
- Resend pricing: https://resend.com/pricing
