"use client";

import { useConvexAuth, usePaginatedQuery } from "convex/react";

/*
  `usePaginatedQuery` that skips while the Convex client is unauthenticated,
  for the same sign out window `useAuthQuery` covers: the token drops while
  the page is still mounted, and a re-run without it must read as "loading",
  not as a thrown error.

  The paginated queries it is used with return an empty, finished page to a
  caller without access rather than null, because `usePaginatedQuery` reads
  `.page` off every result.
*/
export const useAuthPaginatedQuery: typeof usePaginatedQuery = ((
  query: Parameters<typeof usePaginatedQuery>[0],
  args: Parameters<typeof usePaginatedQuery>[1],
  options: Parameters<typeof usePaginatedQuery>[2]
) => {
  const { isAuthenticated } = useConvexAuth();
  return usePaginatedQuery(query, isAuthenticated ? args : "skip", options);
}) as typeof usePaginatedQuery;
