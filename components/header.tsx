import Link from 'next/link';
import { SearchBox } from '@/components/search-box';
import { SessionMenu } from '@/components/session-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';

/**
 * Static shell: no cookies, no headers, nothing that would opt the whole app
 * out of prerendering. The only dynamic piece is <SessionMenu/>, which resolves
 * the reader on the client.
 */
export function Header() {
  return (
    <header className="glass sticky top-0 z-40 border-b border-line/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Folio home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary">
          <Link
            href="/?sort=trending"
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Trending
          </Link>
          <Link
            href="/tags"
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Topics
          </Link>
        </nav>

        <div className="ml-auto hidden max-w-xs flex-1 lg:block">
          <SearchBox size="sm" />
        </div>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-2">
          <ThemeToggle />
          <SessionMenu />
        </div>
      </div>
    </header>
  );
}
