'use client';

import { useEffect } from 'react';

/**
 * Fires the view beacon once per page load.
 *
 * `sendBeacon` survives navigation and tab close; the <img> fallback covers
 * older Safari. Either way the request is a 43-byte GIF and the database
 * de-duplicates by (post, reader, day), so a refresh cannot inflate the count.
 */
export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const url = `/api/track?slug=${encodeURIComponent(slug)}`;
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(url);
      return;
    }
    const image = new Image();
    image.src = url;
  }, [slug]);

  return null;
}
