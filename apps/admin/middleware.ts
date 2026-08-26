import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/*
  Cheap, non-authoritative routing gate. It answers one question — "does this
  request carry a session cookie at all?" — and does it without a network
  call, so no protected navigation pays a round trip here.

  It deliberately does NOT check roles.

  The web portal authorization invariant (docs/DATA_MODEL.md) — a portal
  session is valid only when the user holds >=1 active `roleAssignments`
  record — is still enforced, but at the points that can actually enforce it:

    /admin/*             app/(admin)/admin/layout.tsx
    /system-admin/*      app/(admin)/system-admin/layout.tsx
    /areas-of-service    the page itself, right after its account fetch
    /departments/[id]    convex getDepartmentAccess

  Those first three already made the same Convex call this file used to make,
  so the role check here was a second, serial round trip that produced an
  answer the layout was about to fetch anyway. Removing it halves the
  pre-HTML round trips (two to one) on every protected navigation — which
  matters most on the connections this portal is actually used over.

  `getSessionCookie` is an unvalidated presence check by design: it reads the
  cookie without verifying the signature. That is fine here precisely because
  this is not the security boundary. A forged or expired cookie gets past this
  file and is rejected by the real gates above, which do verify — and by every
  Convex function behind them, which re-checks identity and authority per
  operation regardless of how the request was routed.

  Trade-off worth knowing: middleware ran on every navigation, whereas a
  layout does not re-run when navigating within the segment it already
  rendered. So a user whose last role is revoked mid-session keeps the portal
  shell until they cross segments, hard-navigate, or refresh. They lose access
  to data immediately — every gated Convex query throws for an authenticated
  caller without authority — but the chrome lingers. Accepted deliberately;
  see docs/ARCHITECTURE.md §5.2.
*/

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

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets, Next internals, and the auth proxy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\..*).*)"],
};
