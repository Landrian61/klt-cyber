import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scopes Vite's root to this directory so test discovery only globs convex/
// (it is not a pnpm workspace member, so `pnpm -r run test` never reaches it;
// see the root `test:convex` script).
const dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: dirname,
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // The first function call in each file loads every Convex module,
    // including the AWS S3 SDK behind convex/recordings.ts (spec 0019). That
    // takes about three seconds alone and can pass Vitest's 5s default while
    // every file runs in parallel. Later tests in a file take milliseconds.
    testTimeout: 15_000,
  },
});
