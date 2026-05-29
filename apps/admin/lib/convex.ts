import { ConvexReactClient } from "convex/react";

// Single browser-side Convex client. NEXT_PUBLIC_CONVEX_URL is inlined at
// build time and points at the deployed Convex backend (PR 2).
export const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!,
);
