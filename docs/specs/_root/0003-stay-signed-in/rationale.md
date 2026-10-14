# 0003. Fix session persistence across mobile and the web portal — rationale

## Context

The product requirement (F1 09, NF 10 in `spec/SRS.md`) is simple: reopening the app should go straight to Home, and a session should last until the person signs out, deletes their account, or doesn't open the app for a long stretch, now written to also hold for the web admin portal (this spec updates NF 10 to say so). Today none of that holds on mobile: ministers are signed out on every cold launch, confirmed on the real preview APK build, not only during local testing. The web admin portal has no reported bug, but it also has no deliberate session length, it has been running on whatever Better Auth's own library default happens to be, since `convex/auth.ts` sets none today.

The mobile app's own storage wiring looks correct on its face. `apps/mobile/lib/auth.ts` stores the session only in the device's secure keychain, and `apps/mobile/app/_layout.tsx` already waits for that stored session to resolve before deciding what to show. An earlier pass at this spec assumed that a missing server plugin (`expo()`, from `@better-auth/expo`) explained the cold launch sign out, since it is genuinely missing from `convex/auth.ts` and genuinely required by that library's own setup guide. An independent check of that assumption, reading Better Auth's own origin check code directly, found the assumption does not hold: the requests made on a cold launch are `GET` requests, and Better Auth's origin check only rejects a missing origin on a request that also carries a cookie, which rules the missing plugin out as the cold launch's cause. That check did surface a different, real bug instead: signing out is a `POST` that does carry the cookie, so it is the one request that fails that same check today, meaning a sign out may not actually end the session on the server even though the app forgets it locally. The actual cause of the cold launch sign out stays open, and finding it for real, instead of assuming it a second time, is this spec's first build step.

## Options considered

### Option 1: Diagnose the real cold launch cause first, then fix what is confirmed, for both surfaces

Before changing anything, capture what the mobile app's cold launch session check actually does on a real preview build. Separately fix the sign out bug that is already confirmed (register the `expo()` server plugin, widen `trustedOrigins`), and set one explicit 30 day rolling session length for both surfaces in `convex/auth.ts`, which the web portal receives for free since both apps run through the same Better Auth configuration.

**Pros**:
- Does not repeat the mistake of shipping a fix for a cause that was never actually confirmed.
- The sign out fix and the session length policy are worth doing regardless of what the diagnostic finds: one is a confirmed bug, the other is simply undecided today.
- The web portal's session length is a one line config change, not new work, since the policy is shared backend configuration.

**Cons**:
- This spec cannot promise the cold launch bug is closed yet, only that it will be properly investigated as the first step, which is less satisfying than a confirmed fix.

### Option 2: Ship the plugin and trusted origins fix anyway, on the theory that it probably still helps

Register `expo()` and widen `trustedOrigins` as originally planned, skip a dedicated diagnostic step, and see if the cold launch symptom goes away in practice.

**Pros**:
- Faster to write, one less step before building.

**Cons**:
- The independent check already showed this does not explain the cold launch path, since `GET` requests skip the exact check that plugin affects. Shipping it without diagnosing risks declaring the bug fixed when it is not, which is the mistake this spec is now correcting.

### Option 3: Replace Better Auth's Expo integration with a custom token flow

Stop relying on `@better-auth/expo`'s cookie bridging and build a custom token refresh flow by hand, before even knowing what is actually wrong.

**Pros**:
- Full control over the token lifecycle.

**Cons**:
- Reinvents a large, security sensitive part of the library for a problem whose real cause has not even been found yet, far too large a response before the diagnostic even runs.

## Rationale

An independent read of Better Auth's own origin check code (`better-auth/dist/api/middlewares/origin-check.mjs`) shows it only rejects a missing origin on a request that also carries a cookie. The cold launch's two calls (`/get-session`, `/convex/token`) are `GET` requests that skip that check entirely, so the originally proposed fix cannot be the explanation for being signed out on every cold launch. It does explain a different, confirmed problem: signing out is a `POST` that does carry the cookie, so it is rejected by that same check today, meaning the session on the server may outlive the local sign out. Registering `expo()` (which rewrites the mobile app's `expo origin` header into a trusted origin) and widening `trustedOrigins` to the app's own schemes fixes that confirmed bug on its own merits, regardless of what caused the cold launch symptom, so it stays in this spec. The cold launch cause itself is left to the diagnostic in build task 1, rather than assumed a second time.

The 30 day rolling session length is a separate, deliberate decision that both surfaces currently lack, since `convex/auth.ts` sets no explicit session policy today. Sharing one Better Auth configuration between the mobile app and the admin portal means this single change reaches both, for the same reason that the undiagnosed bug stays scoped to mobile only: the two surfaces share backend configuration but not client code.

### Build-time confirmation (2026-10-13)

During the actual build, the `expo()` plugin's behavior and the origin-check middleware's `GET`-skips-validation logic were both re-confirmed directly against the installed `node_modules` source (not just re-asserted from this document), since the fix's correctness depends on exactly how those two pieces interact. Both matched this rationale exactly: `@better-auth/expo`'s `onRequest` only rewrites the `origin` header when an `expo-origin` header is present and no `origin` header already exists, and `better-auth`'s `originCheckMiddleware` returns immediately for `GET`/`HEAD`/`OPTIONS` requests before any trusted-origin check runs.
