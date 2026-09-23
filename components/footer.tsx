import Link from 'next/link';
import { Logo } from '@/components/logo';

const COLUMNS = [
  {
    title: 'Read',
    links: [
      { href: '/', label: 'Latest' },
      { href: '/?sort=trending', label: 'Trending' },
      { href: '/tags', label: 'Topics' },
      { href: '/search', label: 'Search' },
    ],
  },
  {
    title: 'Write',
    links: [
      { href: '/register', label: 'Create account' },
      { href: '/write', label: 'New story' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/saved', label: 'Saved stories' },
    ],
  },
  {
    title: 'Stack',
    links: [
      { href: 'https://nextjs.org', label: 'Next.js 16' },
      { href: 'https://neon.tech', label: 'Neon Postgres' },
      { href: 'https://vercel.com', label: 'Vercel' },
      { href: 'https://tailwindcss.com', label: 'Tailwind CSS' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            A fast, free home for writing. No paywall, no trackers, no editor in your way — just your words and the
            people who read them.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink">{column.title}</h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Folio. Built on raw SQL and Web Crypto.</p>
          <p className="flex items-center gap-4">
            <span>Free forever</span>
            <span aria-hidden="true">·</span>
            <span>No tracking</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
