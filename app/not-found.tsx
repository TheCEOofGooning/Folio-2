import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';

/*
 * Note on status codes: Next.js answers `notFound()` with HTTP 200 when the
 * response is streamed, and 404 only when it is not — and every route here
 * streams. The robots metadata on this file is ignored for the same reason, so
 * each dynamic route marks its own missing-resource case `noindex` inside
 * `generateMetadata`, which does run before the throw.
 */
export default function NotFound() {
  return (
    <div className="ambient relative mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="font-serif text-7xl text-accent">404</p>
      <h1 className="mt-4 font-serif text-3xl tracking-tight text-ink">This page wandered off</h1>
      <p className="mt-3 text-muted">
        The story may have been unpublished, or the link was mistyped. The rest of Folio is still here.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Back to the feed</ButtonLink>
        <ButtonLink href="/search" variant="outline">
          Search stories
        </ButtonLink>
      </div>
      <Link href="/tags" className="mt-6 text-sm text-muted hover:text-ink">
        Browse topics →
      </Link>
    </div>
  );
}
