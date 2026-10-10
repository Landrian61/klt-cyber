import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Pin the workspace root for this pnpm monorepo so Next.js doesn't
  // infer it from a stray lockfile higher up the tree.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  transpilePackages: ["@klt-cyber/shared"],
};

// Uploads source maps during `next build` so a Sentry stack trace resolves
// to real source (AC-7). No-ops cleanly when SENTRY_AUTH_TOKEN is unset (the
// provisioning step hasn't happened yet) — never blocks a build.
export default withSentryConfig(nextConfig, {
  org: "klt-cyber",
  project: "klt-cyber-admin",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});

// Enables the OpenNext Cloudflare adapter during `next dev` so local dev sees
// the same Workers bindings/runtime as the deployed Worker. No-op in production
// builds. See spec/DEPLOYMENT.md.
initOpenNextCloudflareForDev();
