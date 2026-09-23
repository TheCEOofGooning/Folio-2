import { ImageResponse } from 'next/og';

export const alt = 'Folio — publish and read, free';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Social card, generated at request time and cached by the CDN.
 *
 * No font file is fetched: `next/og` ships a Latin default, so this route has
 * zero network dependencies and cannot fail because a font CDN is down.
 */
export default function OpengraphImage() {
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
          padding: '80px',
          color: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: '4px solid #818cf8',
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>Folio</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Satori wants an explicit `display` on any node with more than one
              child, so the two lines are separate nodes rather than a <br />. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05 }}>
              A quiet, fast home
            </div>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05 }}>
              for your writing.
            </div>
          </div>
          <div style={{ fontSize: 30, color: '#a1a1aa' }}>
            Markdown in. Beautiful reading out. Free forever.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, fontSize: 24, color: '#a1a1aa' }}>
          <div style={{ display: 'flex', border: '1px solid #3f3f46', borderRadius: 999, padding: '10px 22px' }}>
            No paywall
          </div>
          <div style={{ display: 'flex', border: '1px solid #3f3f46', borderRadius: 999, padding: '10px 22px' }}>
            No trackers
          </div>
          <div style={{ display: 'flex', border: '1px solid #3f3f46', borderRadius: 999, padding: '10px 22px' }}>
            Publish in one click
          </div>
        </div>
      </div>
    ),
    size,
  );
}
