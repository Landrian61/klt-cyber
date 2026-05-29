import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

/*
  Server-side Better Auth helpers for Next.js.

  - `handler`        backs the same-origin proxy at /api/auth/[...all], which
                     forwards Better Auth requests to the Convex deployment.
  - `getToken`       reads the first-party session cookie (set via the proxy)
                     and exchanges it for a Convex JWT, used to authenticate the
                     Convex client on the server (see app/layout.tsx).
  - `isAuthenticated`server-side session check for RSC/route guards.

  `convexSiteUrl` must be the deployment's *.convex.site origin (the HTTP
  actions host). We derive it from NEXT_PUBLIC_CONVEX_URL (the .convex.cloud
  origin) so a single env var is enough, while still allowing an explicit
  override via NEXT_PUBLIC_CONVEX_SITE_URL.
*/
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  convexUrl.replace(/\.convex\.cloud$/, ".convex.site");

export const { handler, getToken, isAuthenticated, fetchAuthQuery } =
  convexBetterAuthNextJs({
    convexUrl,
    convexSiteUrl,
  });
