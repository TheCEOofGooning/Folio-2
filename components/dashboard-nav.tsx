'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChartIcon, FileIcon, PenIcon } from '@/components/icons';
import { cn } from '@/lib/utils/cn';

const LINKS = [
  { href: '/dashboard', label: 'Overview', icon: ChartIcon, exact: true },
  { href: '/dashboard/posts', label: 'Stories', icon: FileIcon, exact: false },
  { href: '/write', label: 'Write', icon: PenIcon, exact: false },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex items-center gap-1 border-b border-line">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative -mb-px flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <Icon size={16} />
            {link.label}
            {active ? (
              <motion.span
                layoutId="dashboard-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
