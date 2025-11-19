import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standard Next.js config for Vercel deployment
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'https://applyo-worker.applyo.workers.dev'}/api/:path*`,
      },
    ]
  }
};

export default nextConfig;
