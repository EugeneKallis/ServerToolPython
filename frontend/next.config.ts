import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
});

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://backend:8080/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `http://backend:8080/ws/:path*`,
      },
    ];
  },
};

export default withPWA(nextConfig);
