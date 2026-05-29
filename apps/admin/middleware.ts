import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const authRoutes = ["/sign-in", "/sign-up"];

/*
  Optimistic auth gate. `getSessionCookie` only checks for the presence of the
  first-party session cookie (set via the same-origin /api/auth proxy) — it
  does NOT validate it. That's intentional and recommended by Better Auth: it's
  a fast redirect, while the real session check happens server-side per page
  (e.g. getToken in app/layout.tsx). Never rely on this alone for security.

  - /sign-in and /sign-up are public.
  - A signed-in user hitting an auth page is bounced to "/".
  - Any other route requires a session cookie, else → /sign-in.
*/
export default function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;
  const isAuthRoute = authRoutes.includes(pathname);

  if (isAuthRoute) {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
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
