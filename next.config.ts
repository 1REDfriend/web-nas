import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts buffers every request body it sees in memory, up to this size.
    // Uploads skip proxy.ts (see its matcher); everything left takes small JSON.
    proxyClientMaxBodySize: '10mb',
  },
};

export default nextConfig;
