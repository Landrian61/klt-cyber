import { ConvexReactClient } from 'convex/react';

// Convex client for the mobile app, pointed at the deployed backend (PR 2).
// expectAuth defers queries until Better Auth has provided a token, so we
// never fire unauthenticated requests on cold start.
export const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL as string,
  {
    expectAuth: true,
    unsavedChangesWarning: false,
  }
);
