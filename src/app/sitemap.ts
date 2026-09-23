import type { MetadataRoute } from "next";
import { getCachedActiveAuthors, getCachedSlugs } from "@/db/cached";

/**
 * Sitemap.
 *
 * Generated from the database at build/revalidate time and cached, so a crawl of
 * 10,000 pages does not become 10,000 queries. `revalidate` keeps the file fresh
 * without regenerating it per request.
 */
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, authors] = await Promise.all([
    getCachedSlugs(1000).catch(() => []),
    getCachedActiveAuthors(200).catch(() => []),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.4 },
  ];

  return [
    ...staticRoutes,
    ...slugs.map((row) => ({
      url: `${SITE_URL}/p/${row.slug}`,
      lastModified: row.updatedAt ? new Date(row.updatedAt) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...authors.map((author) => ({
      url: `${SITE_URL}/u/${author.username}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
