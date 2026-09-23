'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SearchIcon, XIcon } from '@/components/icons';
import { cn } from '@/lib/utils/cn';

/**
 * Instant search: the query lives in the URL, so results are shareable and the
 * browser back button works. Typing updates the address bar (debounced, and
 * with `scroll: false` so the page does not jump) while the server component
 * behind it re-renders the results.
 */
export function SearchBox({
  defaultValue = '',
  placeholder = 'Search stories, people, tags…',
  autoFocus = false,
  size = 'md',
  className,
}: {
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => setValue(defaultValue), [defaultValue]);

  // ⌘K / Ctrl+K focuses the field from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      const current = new URLSearchParams(window.location.search).get('q') ?? '';
      if (value.trim() === current.trim()) return;
      const params = new URLSearchParams(window.location.search);
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      router.replace(`/search?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [value, router]);

  const heights = { sm: 'h-9 text-sm', md: 'h-11 text-[15px]', lg: 'h-14 text-base' } as const;

  return (
    <div className={cn('relative w-full', className)}>
      <SearchIcon
        size={size === 'lg' ? 20 : 17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setValue('');
        }}
        placeholder={placeholder}
        aria-label="Search"
        className={cn(
          'w-full rounded-xl border border-line bg-surface pl-10 pr-20 text-ink placeholder:text-muted/70',
          'transition-all duration-200 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10',
          '[&::-webkit-search-cancel-button]:hidden',
          heights[size],
        )}
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {value ? (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label="Clear search"
            className="rounded-md p-1 text-muted transition-colors hover:text-ink"
          >
            <XIcon size={15} />
          </button>
        ) : null}
        <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted sm:block">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
