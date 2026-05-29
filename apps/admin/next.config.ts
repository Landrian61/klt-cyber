import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root for this pnpm monorepo so Next.js doesn't
  // infer it from a stray lockfile higher up the tree.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  transpilePackages: ["@klt-cyber/shared"],
};

export default nextConfig;
