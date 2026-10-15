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
  async redirects() {
    return [
      {
        source: "/sign-up",
        destination: "/sign-in",
        permanent: false,
      },
      {
        source: "/admin/devotionals",
        destination: "/areas-of-service/media/devotionals",
        permanent: true,
      },
      {
        source: "/admin/past-events",
        destination: "/areas-of-service/media/past-events",
        permanent: true,
      },
      {
        source: "/admin/:path+",
        destination: "/areas-of-service/administration/:path+",
        permanent: true,
      },
      {
        source: "/admin",
        destination: "/areas-of-service/administration",
        permanent: true,
      },
      {
        source: "/media/:path+",
        destination: "/areas-of-service/media/:path+",
        permanent: true,
      },
      {
        source: "/departments/:id",
        destination: "/areas-of-service",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/areas-of-service/administration/:path*",
          destination: "/admin/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
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
