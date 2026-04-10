import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["snarkjs"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
