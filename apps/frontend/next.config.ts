import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@henglosio/ui"],
  allowedDevOrigins: ["hio.localhost"],
  // A self-contained server (.next/standalone) for the Docker image — traced
  // from the monorepo's root, so the workspace packages come along.
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "../../.."),
};

export default nextConfig;
