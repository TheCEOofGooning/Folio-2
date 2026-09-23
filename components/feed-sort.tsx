'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { value: 'latest', label: 'Latest' },
  { value: 'trending', label: 'Trending' },
  { value: 'discussed', label: 'Discussed' },
] as const;

type Tab = (typeof TABS)[number]['value'];

/** Sort tabs backed by the URL (?sort=), so the choice is shareable. */
export function FeedSort({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active: Tab = TABS.some((tab) => tab.value === current) ? (current as Tab) : 'latest';

  return (
    <div
      role="tablist"
      aria-label="Sort stories"
      className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1"
    >
      {TABS.map((tab) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={selected}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set('sort', tab.value);
              router.push(`${pathname}?${params.toString()}`, { scroll: false });
            }}
            className={cn(
              'relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
              selected ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {selected ? (
              <motion.span
                layoutId="feed-sort-pill"
                className="absolute inset-0 rounded-lg bg-surface-2"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
