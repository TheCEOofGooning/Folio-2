'use client';

/**
 * components/session-menu.tsx — the personalised corner of the header.
 *
 * The root layout must stay cacheable (it is shared by ISR pages such as
 * /p/[slug]), so it cannot read the session cookie. This component resolves
 * the session on the client from a 1 kB JSON endpoint instead: the page shell
 * stays prerendered and only the menu hydrates.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PenIcon } from '@/components/icons';
import { UserMenu } from '@/components/user-menu';
import { buttonClass } from '@/components/ui/button';
import type { SessionUser } from '@/lib/auth/session';

export function SessionMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user: SessionUser | null } | null) => {
        if (!active) return;
        setUser(data?.user ?? null);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) {
    return <span className="h-8 w-8 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login" className={buttonClass('ghost', 'sm', 'hidden sm:inline-flex')}>
          Sign in
        </Link>
        <Link href="/register" className={buttonClass('primary', 'sm')}>
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/write"
        aria-label="Write a story"
        className={buttonClass('secondary', 'icon', 'text-ink')}
      >
        <PenIcon size={17} />
      </Link>
      <UserMenu user={user} />
    </div>
  );
}
