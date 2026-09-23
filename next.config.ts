import type { NextConfig } from 'next';

/**
 * Folio — Vercel-tuned Next.js 16 configuration.
 *
 * Performance decisions:
 *  - Turbopack is the default bundler in Next 16; nothing to opt into.
 *  - `images.formats: ['image/avif']` — smallest lossy format browsers support.
 *  - `compress` + long-lived immutable cache headers for /_next/static.
 *  - Security + cache headers are applied for every response by `proxy.ts`.
 *  - No `experimental` flags: ISR is expressed with the stable route-segment
 *    `revalidate` export so prerendered routes stay on the Vercel Edge CDN.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    // Cover images are user-supplied URLs. Every request is size/format
    // constrained by next/image, so an open pattern is safe here.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    deviceSizes: [424, 640, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },

  async redirects() {
    return [{ source: '/home', destination: '/', permanent: false }];
  },
};

export default nextConfig;
