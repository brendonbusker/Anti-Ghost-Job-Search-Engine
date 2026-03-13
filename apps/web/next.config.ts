import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@anti-ghost/database", "@anti-ghost/domain"],
};

export default nextConfig;
