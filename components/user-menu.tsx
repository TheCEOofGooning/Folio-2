'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  BookmarkIcon,
  ChartIcon,
  FileIcon,
  LogoutIcon,
  PenIcon,
  SlidersIcon,
  UserIcon,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import type { SessionUser } from '@/lib/auth/session';

const ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted outline-none ' +
  'transition-colors data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink';

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = () => {
    setSigningOut(true);
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Avatar name={user.display_name} username={user.username} src={user.avatar_url} size="sm" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-50 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-card"
        >
          <div className="border-b border-line px-2.5 pb-2.5 pt-2">
            <p className="truncate text-sm font-semibold text-ink">{user.display_name}</p>
            <p className="truncate text-xs text-muted">@{user.username}</p>
          </div>

          <div className="py-1">
            <DropdownMenu.Item className={ITEM} asChild>
              <Link href="/write">
                <PenIcon size={16} /> New story
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <Link href="/dashboard">
                <ChartIcon size={16} /> Dashboard
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <Link href="/dashboard/posts">
                <FileIcon size={16} /> Your stories
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <Link href={`/${user.username}`}>
                <UserIcon size={16} /> Public profile
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <Link href="/saved">
                <BookmarkIcon size={16} /> Saved stories
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} asChild>
              <Link href="/settings">
                <SlidersIcon size={16} /> Settings
              </Link>
            </DropdownMenu.Item>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <DropdownMenu.Item
            onSelect={signOut}
            disabled={pending}
            className={cn(ITEM, 'text-red-500 data-[highlighted]:text-red-500')}
          >
            {signingOut ? <Spinner className="h-4 w-4" /> : <LogoutIcon size={16} />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
