import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getToken } from "@convex-dev/better-auth/utils";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/lib/api";

/*
  Enforces the web portal authorization invariant (docs/DATA_MODEL.md,
  Increment 2): "A web portal session is valid only when the user has ≥1
  active roleAssignments record."

  Two layers, same optimistic-then-real split as PR 3:
  - `getSessionCookie` is a fast, unvalidated presence check — routes
    unauthenticated traffic to /sign-in without a network call.
  - For every other protected path we do a REAL Convex round trip: exchange
    the first-party session cookie for a Convex JWT and call
    `api.roles.getMyRoles`. 0 active roles → /unauthorized.

  Role-check approach chosen: (a) a Convex round trip per navigation, not
  (b) a session/JWT-baked role cache. Rationale: `getToken` re-exported from
  lib/auth-server.ts (and `fetchAuthQuery`) depend on next/headers(), which
  is unavailable in middleware. But the lower-level `getToken(siteUrl,
  headers, opts)` from "@convex-dev/better-auth/utils" takes headers
  explicitly and does a plain `fetch` — no next/headers, no Node APIs — so
  it runs fine here. Paired with `fetchQuery` from "convex/nextjs" (also
  plain-fetch), this gives a real, un-cached role check from middleware
  without needing a Node.js middleware runtime or a JWT-embedded role cache.
  Trade-off: one extra Convex query per navigation to a protected route —
  acceptable for an internal admin portal's traffic volume.
*/

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  convexUrl.replace(/\.convex\.cloud$/, ".convex.site");

/**
 * null = no valid session (stale/invalid cookie, or the Convex round trip
 * failed even after a retry — fails closed rather than crashing the request).
 */
async function activeRoleCount(request: NextRequest): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { token } = await getToken(convexSiteUrl, new Headers(request.headers));
      if (!token) return null;
      const roles = await fetchQuery(api.roles.getMyRoles, {}, { token, url: convexUrl });
      return roles.length;
    } catch (error) {
      if (attempt === 1) {
        console.error("middleware: role check failed", error);
        return null;
      }
    }
  }
  return null;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  // Public landing page: the front door, open to everyone (signed in or out).
  // Its CTAs hand off to /sign-in and /sign-up, which do their own routing.
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Public: users may land here signed in (post role-check) or signed out
  // (direct navigation). The page itself adapts to both.
  if (pathname === "/unauthorized") {
    return NextResponse.next();
  }

  if (pathname === "/sign-in" || pathname === "/sign-up") {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/areas-of-service", request.url));
    }
    return NextResponse.next();
  }

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const roleCount = await activeRoleCount(request);
  if (roleCount === null) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (roleCount === 0) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets, Next internals, and the auth proxy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\..*).*)"],
};
