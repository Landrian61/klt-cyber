# 0004. Remove web sign up

## Summary

The web admin portal gets no sign up, per SRS F1-02 and section 3.2: a portal user signs in with the same account they already use on mobile. Deleting the web `/sign-up` page is not enough on its own, since the web sign in page's Google button can also create a brand new account on first use. The first draft of this spec tried to block that everywhere with a single Origin header check, but Google account creation happens inside an OAuth callback that carries no Origin header at all, for web or mobile alike, so that check cannot tell the two apart; it uses Better Auth's own `disableImplicitSignUp` switch for the Google path instead.

**Second correction (this revision):** the email and password path's own Origin header check, built against this spec's first revision, was verified end to end during `/check verify` and found non functional: Convex's HTTP Actions layer strips the `Origin` header from every request before any function runs, confirmed with a throwaway debug route that showed a custom header surviving while `Origin` never arrived. A web origin POST to the sign up endpoint was never actually being rejected. This revision replaces the Origin check with an explicit `X-Client-Platform: mobile` header that the mobile app sets on its email and password sign up call, mirroring the `requestSignUp` flag already used for Google: a deliberate signal from an honest client, not a browser header Convex never delivers. Confirmed working with the same kind of direct test: the header reaches the hook correctly.

## Requirements

**User stories**:
- As a portal user, I sign in to the web admin portal with the same account I already use on mobile; there is no way to create a brand new account from the web.
- As a System Admin or department role holder, the web sign in page no longer suggests I can create an account there.

**Acceptance criteria**:
- **AC-1**: The `/sign-up` page is deleted from `apps/admin`; visiting the old URL redirects to `/sign-in`.
- **AC-2**: No link, button, or call to action anywhere in `apps/admin` (the "Create an account" link on `/sign-in`, the landing page's ghost call to action) points at sign up.
- **AC-3**: An attempt to create a brand new account through the web sign in page's Google button is rejected with a clear message on `/sign-in`; signing in with Google to an existing account still succeeds normally.
- **AC-4**: Mobile Google and email/password sign up both keep working, each by explicitly asking to create an account (a one line change on each of the two mobile call sites, not a silent default); `packages/shared`'s `signUpInputSchema` and the mobile sign up screen's own fields are unchanged.
- **AC-5**: `apps/admin/middleware.ts`'s redirect if already signed in branch no longer references `/sign-up`.
- **AC-6**: A direct POST to the Better Auth email/password sign up endpoint is rejected server side unless it carries the mobile app's explicit `X-Client-Platform: mobile` header, independent of whether the `/sign-up` page still exists.

## Feature design

**Data model sketch**: none, no schema change.

**API surface**: no new Convex function or HTTP route. The backend changes are inside `convex/auth.ts`'s existing `createAuth()` config: `socialProviders.google.disableImplicitSignUp: true`, and a `databaseHooks.user.create.before` hook scoped to the email/password sign up endpoint only. Two mobile call sites each add one argument to an existing call; a third mobile call site adds one header.

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| A new Google sign in attempt | Whether Better Auth creates the account or returns an error | `disableImplicitSignUp: true` on the Google provider, which rejects creating a new account unless the caller explicitly passed `requestSignUp: true` on `signIn.social(...)`. Mobile's two sign in/sign up screens pass it; the web sign in page's Google button does not |
| A new email/password sign up attempt | Whether to allow or block it | The request's `X-Client-Platform` header, read via the hook's `context.getHeader("x-client-platform")`, required to equal `mobile`. Mobile's `sign-up.tsx` sets it explicitly on its `authClient.signUp.email(...)` call via `fetchOptions.headers`. The hook only runs for `ctx.path === "/sign-up/email"`, so it never touches Google or sign in. This check is a product rule, not the real security boundary, see Security model below. (Not the request's `Origin` header: confirmed during `/check verify` that Convex's HTTP Actions layer strips `Origin` before any function runs, so an Origin based check silently never fires — see the umbrella `rationale.md`) |
| A visit to the old `/sign-up` URL | Redirect target | A static redirect to `/sign-in`, added to `apps/admin/next.config`'s `redirects()` |
| A rejected web Google attempt | The message shown | `errorCallbackURL: "/sign-in?error=no_account"` passed on the web sign in page's Google call, rendered as a fixed message ("No account found. Create one in the KLT Cyber mobile app first.") on `/sign-in` when that query param is present |
| A rejected direct email/password sign up attempt | The message shown (API callers only, no page renders it) | The hook's `APIError("FORBIDDEN", { message })`, text: "Sign up from the web isn't available. Create your account in the KLT Cyber mobile app first." |

**Key invariants**: a new user row is only ever created when the caller explicitly asked to sign up (`requestSignUp: true` for Google, the `X-Client-Platform: mobile` header for email/password) from the mobile app; a caller missing that explicit signal is rejected, by either method.

**Shared contract**: the header name and its expected value are not hand typed in two places. `packages/shared/src/constants/auth.ts` exports `CLIENT_PLATFORM_HEADER = "x-client-platform"` and `MOBILE_CLIENT_PLATFORM = "mobile"`; both `apps/mobile`'s sign up screen and `convex/auth.ts`'s hook import from `@klt-cyber/shared`, per this project's rule that a value used in more than one place belongs in `packages/shared` (`AGENTS.md`).

**Security model**: this check enforces a product rule for an honest client, it is not the application's real access boundary. Any caller, browser or script, can set the `X-Client-Platform` header or pass `requestSignUp: true` itself (a browser can do this too, e.g. from devtools, not only a non browser client), so this alone does not stop a determined caller from creating a visitor account. That is acceptable: a self created account lands as a `visitor` with no `roleAssignments`, and the real boundary, the role check in `admin/layout.tsx` and the `requireSystemAdmin`/Administration authority checks on every sensitive Convex function, still sends it to `/unauthorized` regardless of how the account was created. Treat this feature as closing the product rule gap (no self service web sign up), not as a new security control.

Kept deliberately even though `/sign-up` no longer exists as a page: gating the endpoint itself, not only the UI, matches the Google path (which also gates the endpoint via `disableImplicitSignUp`, not only by hiding a button) and defends against a direct script call or a future reintroduced web form, not just today's UI. The `context === null` fail open case is not exploitable: Better Auth only passes `null` for a server side/programmatic call (no HTTP request to inspect), never for an actual HTTP sign up attempt, so there is no request path where failing open lets a real caller bypass the check.

**Critical test scenarios**:
- Happy path: an existing System Admin visits `/sign-in`, signs in with Google, succeeds, verifies **AC-3**.
- Failure case: a brand new Google account (no existing user matched for that email or account) attempts sign in from the web sign in page, is rejected and shown the fixed message, verifies **AC-3**.
- Mobile unaffected (Google): mobile sign up with Google still creates a new visitor as before, now via the explicit `requestSignUp: true` argument, verifies **AC-4**.
- Mobile unaffected (email/password), on a real device or simulator, not only a unit/typecheck pass: mobile's email/password sign up still creates a new visitor, now via the explicit `X-Client-Platform: mobile` header merged into the Expo Better Auth client's own default headers, verifies **AC-4**. Flagged because this exact path was never device tested during the first build (`verify.md` marked it blocked).
- Direct API call: a POST straight to `/sign-up/email` with no `X-Client-Platform: mobile` header (what a bare script or the deleted web sign up page would send) is rejected; the same POST carrying that header succeeds, regardless of whether `/sign-up` still exists as a page, verifies **AC-6**.

## Build plan

1. Set `socialProviders.google.disableImplicitSignUp: true` in `convex/auth.ts`'s `createAuth()` config, satisfies **AC-3**
2. Add `requestSignUp: true` to the Google `signIn.social(...)` call on `apps/mobile/app/(auth)/sign-in.tsx` and `sign-up.tsx`, satisfies **AC-4**
3. Add `packages/shared/src/constants/auth.ts` exporting `CLIENT_PLATFORM_HEADER = "x-client-platform"` and `MOBILE_CLIENT_PLATFORM = "mobile"`, re-exported from the barrel, satisfies **AC-6** (shared contract, see Feature design)
4. Add `fetchOptions: { headers: { [CLIENT_PLATFORM_HEADER]: MOBILE_CLIENT_PLATFORM } }` (imported from `@klt-cyber/shared`) to the email/password `authClient.signUp.email(...)` call on `apps/mobile/app/(auth)/sign-up.tsx`, satisfies **AC-4**, **AC-6**
5. Rewrite the existing `databaseHooks.user.create.before` hook in `convex/auth.ts` (scoped to `ctx.path === "/sign-up/email"` only): replace its `origin === siteUrl` check with `context.getHeader(CLIENT_PLATFORM_HEADER) !== MOBILE_CLIENT_PLATFORM` (imported from `@klt-cyber/shared`), rejecting via `APIError("FORBIDDEN", { message })` (not a bare `false`, so the message reaches the client); fail open (allow, and log) if `context` is `null`, since this is a product rule, not the security boundary, satisfies **AC-6**
6. Delete `apps/admin/app/(auth)/sign-up/page.tsx`; add a `/sign-up` to `/sign-in` redirect in `apps/admin/next.config`'s `redirects()`, satisfies **AC-1**
7. Remove the "Create an account" link from `sign-in/page.tsx`, add `errorCallbackURL: "/sign-in?error=no_account"` to that page's Google call, and render the fixed message when `error=no_account` is present; remove the ghost call to action from the landing page and its related comment, satisfies **AC-2**, **AC-3**
8. Update `apps/admin/middleware.ts`'s redirect if already signed in branch to drop `/sign-up`, satisfies **AC-5**

**Already landed (first revision of this build plan, before the Origin header defect was found):** today's step 1, step 2, and steps 6 to 8 above are already built and verified (see the umbrella `verify.md`; they were numbered 1, 2, and 4 to 6 in that earlier revision, shifted by the two new steps below). Only the email/password path changes: steps 3 and 4 are new (the shared constant, the mobile header), and step 5 rewrites the existing hook's check in place, it does not add a second hook.

**Steps 3 to 5 rebuilt** (`/develop`, this pass): `packages/shared/src/constants/auth.ts` added and barrel exported; `apps/mobile/app/(auth)/sign-up.tsx`'s `signUp.email` call sets `fetchOptions.headers[CLIENT_PLATFORM_HEADER]`; `convex/auth.ts`'s hook now checks that header instead of `Origin`. Convex and mobile typecheck clean, `pnpm --filter @klt-cyber/shared test` and `pnpm --filter mobile lint` both green. Not yet re-verified live: `/check verify`'s AC-6 scenario (it is the one that failed last run) and the mobile device test for AC-4's email/password half (the one `verify.md` marked blocked).

**Rollout order (new, per the cross check)**: steps 4 (mobile header) and 5 (Convex hook) ship together in this project's normal pipeline (a push to `main` deploys Convex and publishes the mobile OTA update in the same workflow run, per `AGENTS.md`). A device that has not yet applied the OTA when the hook goes live will have its email/password sign up rejected until the update lands, typically on next app foreground. Accepted as a brief, self healing window, the same way the Google `disableImplicitSignUp` + `requestSignUp` pair already ships.

## Consequences of this child (bootstrapping)

The seed bootstrapped System Admin (`SEED_ADMIN_EMAIL`, via `seed:bootstrapSystemAdmin`) must already exist as a Better Auth user before this ships to an environment, since that account can now only be created from the mobile app, never from the web. Confirm this account has signed in at least once on mobile in every environment before relying on web sign in there.

## Rationale (inline)

The first design (an Origin check on every account creation) was wrong: Google account creation happens inside an OAuth callback, a browser GET redirect with no Origin header, for web and mobile alike, so the check could not tell them apart (confirmed against the installed `better-auth` package's own callback and account linking source during this spec's cross check). `disableImplicitSignUp` plus an explicit `requestSignUp: true` from mobile is Better Auth's own documented mechanism for exactly this distinction.

The second design (keeping the Origin check for email/password sign up, where the header looked reliably present) was also wrong, found by `/check verify` actually running the built code against a live deployment rather than reasoning about it: Convex's HTTP Actions layer strips the `Origin` header before any function, including deep inside Better Auth's own request handling, ever sees it. A throwaway `/debug-headers` httpAction route proved this directly: a custom header sent alongside `Origin` on the same request arrived intact while `Origin` was simply absent from every header Convex delivered. This is a platform behavior, reproduced identically on two different Convex deployments, not a bug in how the hook read the header.

The fix follows the same pattern as the Google correction: stop trying to infer "is this a browser" from a header the platform won't deliver, and instead have the honest client (mobile) say so explicitly. `X-Client-Platform: mobile`, set by mobile's own code on its one email/password sign up call, is a header Convex does deliver (confirmed with the same kind of direct test used to find the defect), and the hook's default (reject unless present) matches the product rule: no explicit mobile signal, no sign up. See the umbrella's [rationale.md](rationale.md) for the surrounding context.

## Follow-up

- [ ] Open question, not resolved by this spec: `convex/auth.ts`'s `trustedOrigins` and `convex/http.ts`'s `registerRoutes(..., { cors: true })` both predate this feature and also read the `Origin` header (Better Auth's own origin check, and `convex-helpers`' `corsRouter` allow list). This spec's finding (`Origin` absent from a plain GET/POST) does not by itself prove those are broken too, since a CORS preflight (`OPTIONS`) request may be handled differently by Convex's edge than a normal request; that was not tested. Worth a dedicated, narrow investigation (not blocking this fix, since the `X-Client-Platform` approach does not depend on `Origin` at all): confirm whether `trustedOrigins`/CORS enforcement on this project's Convex HTTP Actions actually works as configured.
