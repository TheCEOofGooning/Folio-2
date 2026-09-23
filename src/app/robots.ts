import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * robots.txt.
 *
 * Private surfaces are disallowed because they are nobody's business but the
 * account holder's — and because indexing a dashboard wastes crawl budget that
 * should be spent on stories.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/write", "/library", "/settings", "/api/", "/search"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
