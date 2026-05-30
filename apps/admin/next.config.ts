import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Pin the workspace root for this pnpm monorepo so Next.js doesn't
  // infer it from a stray lockfile higher up the tree.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  transpilePackages: ["@klt-cyber/shared"],
};

export default nextConfig;

// Enables the OpenNext Cloudflare adapter during `next dev` so local dev sees
// the same Workers bindings/runtime as the deployed Worker. No-op in production
// builds. See docs/DEPLOYMENT.md.
initOpenNextCloudflareForDev();
