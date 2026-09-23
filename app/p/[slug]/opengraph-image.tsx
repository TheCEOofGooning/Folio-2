import { ImageResponse } from 'next/og';
import { getPublishedPostBySlug } from '@/lib/db/queries/posts';

export const alt = 'Story on Folio';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Per-story social card.
 *
 * Follows the page's own ISR window so a shared link gets a card that names the
 * actual story instead of a generic banner. No font file is fetched — `next/og`
 * ships a Latin default — so this route has no network dependency that could
 * make a share card fail.
 */
export default async function PostOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  // Unknown or unpublished: fall back to the site card rather than 500ing on a
  // crawler. The page itself renders the 404.
  if (!post) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(140deg, #09090b 0%, #17171b 55%, #1e1b4b 100%)',
            color: '#fafafa',
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          Folio
        </div>
      ),
      size,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(140deg, #09090b 0%, #17171b 55%, #1e1b4b 100%)',
          padding: '72px',
          color: '#fafafa',
        }}
      >
        {/* Satori requires an explicit `display` on every node with more than
            one child, hence flex on each row rather than bare divs. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: '4px solid #818cf8',
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>Folio</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 68,
              fontWeight: 700,
              letterSpacing: -2.2,
              lineHeight: 1.12,
            }}
          >
            {post.title}
          </div>
          {post.subtitle ? (
            <div style={{ display: 'flex', fontSize: 30, color: '#a1a1aa', lineHeight: 1.4 }}>
              {post.subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 26, color: '#a1a1aa' }}>
          <div style={{ display: 'flex', color: '#fafafa', fontWeight: 600 }}>{post.display_name}</div>
          <div style={{ display: 'flex' }}>·</div>
          <div style={{ display: 'flex' }}>{post.read_minutes} min read</div>
          {post.tags && post.tags.length > 0 ? (
            <>
              <div style={{ display: 'flex' }}>·</div>
              <div style={{ display: 'flex', color: '#a5b4fc' }}>#{post.tags[0]}</div>
            </>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
