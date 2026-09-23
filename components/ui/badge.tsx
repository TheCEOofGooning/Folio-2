import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent-soft text-accent border-accent/20',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A tag pill that links to its tag page. */
export function TagPill({ tag, className }: { tag: string; className?: string }) {
  return (
    <Link
      href={`/tags/${encodeURIComponent(tag)}`}
      className={cn(
        'inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[12px]',
        'text-muted transition-colors duration-200 hover:border-accent/40 hover:text-accent',
        className,
      )}
    >
      #{tag}
    </Link>
  );
}
