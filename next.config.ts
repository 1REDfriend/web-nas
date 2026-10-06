import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Large uploads pass through proxy.ts before reaching the upload route
    proxyClientMaxBodySize: '100GB',
  },
};

export default nextConfig;
