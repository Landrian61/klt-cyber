"use client";

import { useConvexAuth, useQuery } from "convex/react";

/*
  `useQuery` that skips while the Convex client is unauthenticated.

  Every admin query requires auth (`requireUser`/`requireSystemAdmin` throw).
  Server layouts guarantee a session on render, but the client subscription
  outlives it: on sign-out, ConvexBetterAuthProvider drops the token while
  the page's queries are still mounted, they re-execute unauthenticated, and
  the thrown "Not authenticated" surfaces as a runtime error before the
  redirect to /sign-in lands. Skipping turns that window into the queries'
  ordinary `undefined` loading state, which every screen already renders as
  skeletons. The cast preserves `useQuery`'s exact signature and inference.
*/
export const useAuthQuery: typeof useQuery = ((
  query: Parameters<typeof useQuery>[0],
  ...args: unknown[]
) => {
  const { isAuthenticated } = useConvexAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(query, ...((isAuthenticated ? args : ["skip"]) as any));
}) as typeof useQuery;
