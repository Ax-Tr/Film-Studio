import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    const backendUrl = process.env.API_URL || 'http://127.0.0.1:4000';
    return [
      {
        source: '/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
      {
        source: '/ready',
        destination: `${backendUrl}/ready`,
      },
      {
        source: '/films',
        destination: `${backendUrl}/v1/films`,
      },
      {
        source: '/films/:path*',
        has: [
          {
            type: 'header',
            key: 'accept',
            value: '.*application/json.*',
          },
        ],
        destination: `${backendUrl}/v1/films/:path*`,
      },
      {
        source: '/organizations',
        destination: `${backendUrl}/v1/organizations`,
      },
      {
        source: '/organizations/:path*',
        destination: `${backendUrl}/v1/organizations/:path*`,
      },
      {
        source: '/me/:path*',
        destination: `${backendUrl}/v1/me/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${backendUrl}/v1/auth/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
