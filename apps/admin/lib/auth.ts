"use client";

import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

/*
  Better Auth React client for the admin web app.

  The admin talks to Better Auth through the SAME-ORIGIN proxy route at
  /api/auth/* (app/api/auth/[...all]/route.ts), which forwards to the Convex
  deployment. Because the proxy is same-origin, the session cookie is set
  first-party on the admin domain — so the standard cookie flow works and the
  `convexClient()` plugin is all we need here.

  The backend's `crossDomain` plugin (PR 2) stays dormant for this client: its
  hooks only fire when a request carries the `better-auth-cookie` header, which
  is the Expo/mobile path — not the web proxy path. See lib/auth-server.ts.
*/
export const authClient = createAuthClient({
  plugins: [convexClient()],
});
