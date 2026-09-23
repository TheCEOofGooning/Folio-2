"use client";

import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import {
  BookmarkIcon,
  ChartIcon,
  LogoutIcon,
  PenIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/ui/icons";
import { logoutAction } from "@/server/actions/auth";
import { Skeleton } from "@/components/ui/misc";

/**
 * The account island.
 *
 * Two states only: the static shell renders a "Sign in" link (which is correct
 * for the majority of visitors and needs no JavaScript), and the island swaps in
 * the avatar menu once `/api/session` resolves.
 */
export function AccountMenu() {
  const { user, loading, requireAuth } = useSession();

  if (loading) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => requireAuth("default")}>
          Sign in
        </Button>
        <Button variant="primary" size="sm" asChild>
          <Link href="/signup">Start writing</Link>
        </Button>
      </div>
    );
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="rounded-full transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          aria-label={`Account menu for ${user.displayName}`}
        >
          <Avatar user={user} size="sm" />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>
          <span className="block truncate text-xs normal-case tracking-normal text-ink">
            {user.displayName}
          </span>
          <span className="block truncate text-2xs font-normal normal-case tracking-normal text-ink-faint">
            @{user.username}
          </span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/dashboard">
            <ChartIcon /> Dashboard
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/write">
            <PenIcon /> New story
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/library">
            <BookmarkIcon /> Library
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href={`/u/${user.username}`}>
            <UserIcon /> Your profile
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/dashboard/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownItem>
        <DropdownItem danger asChild>
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-2.5">
              <LogoutIcon /> Sign out
            </button>
          </form>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
