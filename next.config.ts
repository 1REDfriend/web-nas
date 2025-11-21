import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '100GB',
    serverActions: {
      // @ts-expect-error: allowedDevOrigins exists in runtime but types might be outdated
      allowedDevOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "172.23.19.28"
      ]
    }
  },
};

export default nextConfig;
