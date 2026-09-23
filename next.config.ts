import type { NextConfig } from "next";

/**
 * Folio — Vercel-optimised Next.js configuration.
 *
 * Design notes
 * ------------
 * • No webpack/turbopack customisation: the app is plain RSC + Server Actions, so
 *   the bundler stays on the fast path and the framework can apply its own defaults.
 * • `images.remotePatterns` is intentionally permissive for `https` because article
 *   cover images are user supplied URLs. Optimisation still happens on Vercel's edge
 *   (AVIF/WebP, 30-day CDN TTL) so the browser never downloads an unoptimised asset.
 * • Security headers deliberately omit `X-Frame-Options` / `frame-ancestors` so the
 *   app can be embedded (preview panes, editorial embeds). Add them if you don't
 *   need embedding — see README "Hardening".
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Dev-server hosts allowed to talk to HMR / Server Actions from a proxied origin.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "*.vercel.app", "localhost:3000"],

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },

  experimental: {
    // Server Actions are the only "API" the browser talks to; raise the body limit a
    // little so pasted markdown / data-URI covers don't get rejected.
    serverActions: {
      bodySizeLimit: "4mb",
      allowedOrigins: ["*.e2b.app", "*.arena.ai", "*.vercel.app", "localhost:3000"],
    },
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // Immutable hashed assets — the single biggest LCP win on repeat visits.
        source: "/covers/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  async rewrites() {
    return [
      // Pretty profile URLs: /@ada → /u/ada (keeps the route table unambiguous).
      { source: "/@:username", destination: "/u/:username" },
    ];
  },
};

export default nextConfig;
