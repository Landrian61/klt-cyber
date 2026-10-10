"use client";

import { useEffect, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { convex } from "@/lib/convex";
import { authClient } from "@/lib/auth";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";

/**
 * Provider tree for the admin app: a Convex React client authenticated with
 * Better Auth. `initialToken` is read server-side in the root layout so the
 * client renders authenticated on first paint.
 */
export function Providers({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      <SentryUserSync />
      {children}
    </ConvexBetterAuthProvider>
  );
}

/** Sentry.setUser wiring (AC-4): only the user's own `users._id`, never an
 * email or name. Clears on sign out. */
function SentryUserSync() {
  const account = useAuthQuery(api.profile.getMyAccount);
  const userId = account?.user._id;

  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
  }, [userId]);

  return null;
}
