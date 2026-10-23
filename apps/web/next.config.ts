import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@reelio/timeline-schema", "@reelio/remotion-comps"],
  reactStrictMode: true,
};

export default nextConfig;
