"use client";

/**
 * Feed controls: sort tabs and tag filtering.
 *
 * State lives in the URL (`?sort=trending&tag=craft`), not in React. That means
 * the feed stays a server-rendered, cacheable page, the browser's back button
 * works, and a filtered feed is a shareable link. The component is only client
 * because it needs `useRouter` for instant transitions and a pending state.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { LoaderIcon } from "@/components/ui/icons";

const SORTS = [
  { key: "latest", label: "Latest" },
  { key: "trending", label: "Trending" },
  { key: "discussed", label: "Most discussed" },
] as const;

export function SortTabs({ label = "Sort stories" }: { label?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = searchParams.get("sort") ?? "latest";

  const hrefFor = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sort === "latest") params.delete("sort");
    else params.set("sort", sort);
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };

  return (
    <div className="flex items-center gap-1" role="tablist" aria-label={label}>
      {SORTS.map((sort) => {
        const isActive = active === sort.key;
        return (
          <Link
            key={sort.key}
            href={hrefFor(sort.key)}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            onClick={(event) => {
              event.preventDefault();
              // `router.push` inside a transition is what gives us the pending
              // flag for the spinner — the server re-renders the feed while the
              // current list stays interactive and visually unchanged.
              startTransition(() => router.push(hrefFor(sort.key), { scroll: false }));
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive ? "bg-paper-sunken font-medium text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            {sort.label}
          </Link>
        );
      })}
      <span
        className={cn("ml-1 transition-opacity duration-200", pending ? "opacity-100" : "opacity-0")}
        aria-hidden={!pending}
      >
        <LoaderIcon className="size-3.5 text-ink-faint" />
      </span>
      <span className="visually-hidden" role="status">
        {pending ? "Loading stories" : ""}
      </span>
    </div>
  );
}

/** Tag chips used on explore and on the home rail. */
export function TagFilter({ tags, activeTag }: { tags: { tag: string; postCount: number }[]; activeTag?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href = (tag: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!tag) params.delete("tag");
    else params.set("tag", tag);
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      <Link
        href={href(null)}
        className={cn(
          "rounded-full border px-3 py-1 text-[0.8125rem] transition-colors",
          !activeTag
            ? "border-ink bg-ink text-paper"
            : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
        )}
      >
        All
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag.tag}
          href={href(tag.tag)}
          className={cn(
            "rounded-full border px-3 py-1 text-[0.8125rem] transition-colors",
            activeTag === tag.tag
              ? "border-ink bg-ink text-paper"
              : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {tag.tag}
          <span className="ml-1.5 text-2xs opacity-60">{tag.postCount}</span>
        </Link>
      ))}
    </div>
  );
}
