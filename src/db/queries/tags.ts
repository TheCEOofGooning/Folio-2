/**
 * Tags and discovery.
 *
 * `tag_stats` is a materialised-by-write aggregate: it exists so the explore rail
 * is one tiny indexed scan instead of `unnest(tags) + group by` over every post
 * on every render. It is recomputed after a publish/unpublish, which is a single
 * statement over a table with a handful of rows.
 */
import { sql, many } from "@/db";
import type { TagStat } from "@/db/types";

/** Rebuilds the whole aggregate. Cheap, idempotent, safe to call on every publish. */
export async function recomputeTagStats(): Promise<number> {
  const rows = await sql`
    insert into tag_stats (tag, post_count, clap_count, last_post_at)
    select tag,
           count(*)::int,
           coalesce(sum(p.clap_count), 0)::int,
           max(coalesce(p.published_at, p.created_at))
      from posts p, unnest(p.tags) as tag
     where p.status = 'published'
     group by tag
    on conflict (tag) do update
      set post_count   = excluded.post_count,
          clap_count   = excluded.clap_count,
          last_post_at = excluded.last_post_at
    returning tag
  `;

  // Tags that no longer have any published post should disappear from the rail.
  await sql`
    delete from tag_stats
     where tag not in (
       select distinct tag from posts, unnest(tags) as tag where status = 'published'
     )
  `;

  return rows.length;
}

/**
 * Tags ordered by claps, falling back to a live computation when `tag_stats` is
 * empty (fresh install before the first publish).
 */
export async function getTopTags(limit = 14): Promise<TagStat[]> {
  const rows = await many<TagStat>(sql`
    select tag, post_count as "postCount", clap_count as "clapCount"
      from tag_stats
     where post_count > 0
     order by clap_count desc, post_count desc, tag asc
     limit ${limit}
  `);
  if (rows.length > 0) return rows;

  return many<TagStat>(sql`
    select tag, count(*)::int as "postCount", coalesce(sum(p.clap_count), 0)::int as "clapCount"
      from posts p, unnest(p.tags) as tag
     where p.status = 'published'
     group by tag
     order by "clapCount" desc, "postCount" desc, tag asc
     limit ${limit}
  `);
}

/** Distinct authors with at least one published post — for the search facets. */
export async function getActiveAuthors(limit = 8): Promise<{ username: string; displayName: string }[]> {
  return many(sql`
    select u.username, u.display_name as "displayName"
      from users u
      join posts p on p.author_id = u.id and p.status = 'published'
     group by u.id
     order by count(p.id) desc
     limit ${limit}
  `);
}
