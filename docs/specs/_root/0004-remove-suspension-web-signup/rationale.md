# 0004. Remove suspension and web sign up, move System Admin pages into Administration, rationale

## Context

Scope feature 5 bundles three concerns under one line: retire suspension, retire web sign up, and fold the System Admin area into Administration. They read as one feature because they share a motive (trim the admin surface down to only what the product actually wants) and because they touch the same corner of the codebase (`apps/admin`'s auth and System Admin pages, plus `convex/auth.ts` and `convex/admin.ts`), but they are three separable decisions with different forces behind each, which is why this spec is an umbrella with a child spec per decision rather than one flat file.

A read only scan of the current code (not just the SRS's description of it) turned up four things the SRS text alone does not say, each of which shapes a child's design:

1. Suspension is not enforced anywhere today. No authorization check, on the backend or in any layout, reads `users.status`. The admin UI's own copy claims it "blocks sign in until reactivated", which is false. Removing it removes no real access control, only a field, two mutations, and some UI.
2. The `status` field is required in `convex/schema.ts` and every existing user document already carries it. Removing the field from the schema validator is not a pure deletion, it needs a migration first, or an existing document could fail validation on the next schema push.
3. Web sign up is not purely a web concept on the backend. `convex/auth.ts` has one shared `emailAndPassword` and one shared `onCreate` trigger for both apps, and the web sign in page's Google button creates a new account on first use through that same trigger. Deleting only the web `/sign-up` page would leave that gap open.
4. Two of the five pages SRS F3-03's prose names (platform analytics, cost register) do not exist anywhere in the codebase. They are scope feature 31, not feature 5. And Content (Themes), which does exist under `/system-admin` today, is named by SRS as moving to Pastoral (feature 19), not Administration, and Pastoral's portal does not exist yet to receive it.

## Options considered

### Option 1: Three independent thin slices, suspension first, in one umbrella spec

Build suspension removal, web sign up removal, and the System Admin relocation as three separate end to end slices (each touching schema/backend/UI together where it needs to), specified as child specs under one umbrella, built in that order.

**Pros**:
- Each slice is independently shippable and independently testable; a problem in one does not block the other two.
- The order follows real risk and real dependency: suspension is confirmed dead code (lowest risk, ships first), web sign up is small and mostly self contained, the System Admin move is the largest and benefits from the portal already being otherwise stable.
- Matches the project's existing umbrella precedent (spec 0002, error screens plus Sentry plus update channels), so the shape is already familiar.

**Cons**:
- Three child specs is more files to read than one flat spec, though each is short and the index ties them together.

### Option 2: One flat spec covering all three

Write everything into a single spec file, since scope treats this as one feature with one "Build it" checkbox.

**Pros**:
- One file, nothing to navigate between.

**Cons**:
- The three concerns have genuinely different data models, API surfaces, and security models (a schema migration, an auth hook, a page move and nav change); cramming all three into one `## Feature design` section would either blur them together or force one section to carry three unrelated tables. The project's own writing rule says to split into an umbrella once a spec needs multiple independent decisions.

### Option 3: Defer the System Admin move to a later, separate feature

Ship suspension removal and web sign up removal now, leave the System Admin move for whenever feature 19 (Pastoral) is designed, since that is when Content/Themes' real destination becomes clear anyway.

**Pros**:
- Sidesteps the Content/Themes ambiguity entirely for now.

**Cons**:
- Scope feature 5 explicitly bundles the System Admin move with these two removals, and most of the move (Accounts, Roles, Audit log into Administration) has nothing to do with Themes or Pastoral at all; deferring the whole move to wait on one unrelated subpage throws away work that is ready to do now.

## Rationale

Option 1 was chosen because the three concerns, while related in motive, do not share a data model, API surface, or security model, which is exactly the signal the project's own spec writing rule uses to call for an umbrella rather than one flat file. The build order (suspension, then web sign up, then the System Admin move) follows directly from finding 1 above: suspension is proven dead code, so it is both the safest and the most independent piece to ship first, and its dashboard cleanup step is a real prerequisite for the System Admin move's own dashboard folding step. Option 3 was rejected because finding 4 shows the System Admin move is mostly unrelated to Themes/Pastoral: Accounts, Roles and Audit log have a clear, ready destination today (Administration), and only Content/Themes needs to wait on feature 19, so the engineer's own answer (leave Content/Themes under `/system-admin` for now) lets the rest of the move ship without waiting on an unrelated feature.

### Suspension's real state (verified against code, not assumed from the SRS)

`convex/lib/authz.ts`'s `getCurrentUser` and `requireUser` return a user row regardless of `status`; the only code that reads `status` for an access decision does not exist. This matters for the spec: removing suspension is purely a cleanup, it introduces no behavior change for any currently suspended account, since nothing was ever stopping them. The one genuine risk is the schema migration itself (a required field disappearing from documents that currently all carry `status: "active"` or `status: "suspended"`), covered in the suspension removal child spec's own Migration plan.

### Web sign up's real gap, and a correction found by this spec's own cross check

`better-auth/minimal`'s `betterAuth()` (used in `convex/auth.ts`) accepts the full `BetterAuthOptions` type from `@better-auth/core`, which includes `databaseHooks.user.create.before`. That hook receives `(user, context)` where `context: GenericEndpointContext | null` carries `request: Request` and `headers: HeadersInit` (confirmed in `node_modules/better-call/dist/context.d.mts` and `node_modules/@better-auth/core/dist/types/init-options.d.mts`), and returning `false` (or throwing an `APIError`) from the hook blocks the user row from being created.

The first draft of this spec assumed that hook's `Origin` header alone could tell a web request apart from a mobile one, for every sign up method. An independent cross check of the drafted spec, reading `better-auth`'s own callback and account linking source, found that assumption wrong for the Google path: Google account creation happens inside an OAuth callback, a top level browser GET redirect from `accounts.google.com`, and browsers do not send an `Origin` header on a GET navigation, for the web app or the mobile app's system browser alike. An Origin only check would therefore either let a brand new web Google account through, or block mobile Google sign up, depending on which way it was written.

The corrected mechanism, reflected in the web sign up removal child spec: Better Auth's own `disableImplicitSignUp` option on the Google provider rejects a new account unless the caller explicitly passes `requestSignUp: true` on `signIn.social(...)`, which mobile's two sign in/sign up screens now do and the web sign in page does not. The `databaseHooks.user.create.before` Origin check is kept, narrowed to only the email/password sign up endpoint (`ctx.path === "/sign-up/email"`), where the header is reliably present on both platforms. This also means the security model is restated as enforcing a product rule for an honest client, not a hard security boundary; the real boundary stays the role check every sensitive page and function already performs.

### A second correction, found by actually running the built code (`/check verify`, 2026-10-14)

The "reliably present on both platforms" assumption above was itself wrong, and this time no amount of reading the installed package's types would have caught it: Convex's HTTP Actions layer strips the `Origin` header at the platform edge, before any function, including deep inside Better Auth's own request handling, ever sees it. The built hook was reading `context.getHeader("origin")` and consistently getting `null`, meaning the check never actually rejected a web request, even a direct POST sent with the real `SITE_URL` as its Origin. A passing typecheck and a correctly shaped hook gave no signal that anything was wrong; only sending a real request and inspecting what arrived did. This was confirmed with a throwaway `/debug-headers` httpAction route added directly to `convex/http.ts` during the verify run, which echoed back every header the deployment actually delivered: a custom test header survived, `origin` did not, on two separate Convex dev deployments.

The fix, applied in the same spirit as the first correction: stop relying on a header the platform won't deliver, and have the honest client say so explicitly instead, the same pattern `requestSignUp` already uses for Google. Mobile's email/password sign up call now sets `X-Client-Platform: mobile` via `fetchOptions.headers`, and the hook requires it. This was verified to actually work, not just assumed to, with the same direct-request technique used to find the original defect: the custom header was confirmed to reach the hook correctly where `Origin` had not.

The broader lesson, worth keeping for future Convex HTTP Action work in this project: a header based signal is only as good as the platform's willingness to deliver that specific header. `Origin` (and likely other browser controlled or "reserved" headers) cannot be trusted to arrive through Convex's HTTP Actions; a custom, application chosen header name is the reliable channel.

This finding was made against plain `GET`/`POST` requests, not a CORS preflight (`OPTIONS`). `convex/auth.ts`'s own `trustedOrigins` and `convex/http.ts`'s `registerRoutes(..., { cors: true })` both also read `Origin` (Better Auth's own origin check, and `convex-helpers`' `corsRouter` allow list), and predate this feature; whether Convex's edge treats a preflight's `Origin` differently from a normal request's was not tested here, so whether those two mechanisms actually work as configured is an open question, not a confirmed second finding. Flagged as a follow up in the web sign up removal child spec, not resolved by this one.

## References

None. This is an internal restructuring and removal decision grounded in this project's own SRS and codebase (per the engineer's choice not to add a References section).
