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
  },
});
