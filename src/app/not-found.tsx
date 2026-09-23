import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, SearchIcon } from "@/components/ui/icons";

/**
 * 404.
 *
 * A static page with two useful exits. Note what is missing: no "you might also
 * like" rail that hits the database, because the fastest 404 is the one that
 * never wakes a function.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center sm:px-6">
      <p className="font-display text-[5rem] leading-none tracking-[-0.04em] text-ink-faint">404</p>
      <h1 className="mt-4 font-display text-3xl tracking-[-0.02em] text-ink">
        That page isn&rsquo;t here
      </h1>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
        The story may have been unpublished, or the link may have a typo. Either way, there is
        nothing to read at this address.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" asChild>
          <Link href="/explore">
            Browse stories <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        <Button variant="secondary" size="lg" asChild>
          <Link href="/search">
            <SearchIcon className="size-4" /> Search Folio
          </Link>
        </Button>
      </div>
    </div>
  );
}
