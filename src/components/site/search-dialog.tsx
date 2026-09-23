"use client";

/**
 * Command-palette search (⌘K / Ctrl-K).
 *
 * Submitting navigates to `/search?q=…` rather than fetching results into the
 * dialog: search results are a page (they deserve their own URL, back button and
 * cache entry), and that keeps the dialog free of result-state management.
 * Recent searches are kept in localStorage for one-tap recall.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { PlusIcon, SearchIcon, TrendingIcon } from "@/components/ui/icons";

const RECENT_KEY = "folio:recent-searches";

export function SearchDialog({
  open,
  onOpenChange,
  suggestions = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Popular tags, passed down from the server-rendered nav shell. */
  suggestions?: string[];
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]);
    } catch {
      setRecent([]);
    }
    // Radix moves focus into the content on open; give the input the first word.
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  const go = useCallback(
    (value: string) => {
      const query = value.trim();
      if (!query) return;
      const next = [query, ...recent.filter((item) => item !== query)].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      onOpenChange(false);
      router.push(`/search?q=${encodeURIComponent(query)}`);
    },
    [recent, router, onOpenChange],
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md" showClose={false} className="top-[18%] translate-y-0 p-0" described={false}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go(term);
          }}
          className="border-b border-line px-4"
        >
          <div className="flex items-center gap-3">
            <SearchIcon className="size-5 shrink-0 text-ink-faint" />
            <input
              ref={inputRef}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search stories, writers and tags…"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-ink-faint"
              aria-label="Search Folio"
            />
            <kbd className="hidden shrink-0 rounded border border-line bg-paper-sunken px-1.5 py-0.5 text-2xs text-ink-faint sm:block">
              esc
            </kbd>
          </div>
        </form>

        <div className="max-h-80 overflow-y-auto p-2">
          {suggestions.length > 0 ? (
            <>
              <p className="px-2 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                Browse by topic
              </p>
              <div className="flex flex-wrap gap-1.5 px-2 pb-3">
                {suggestions.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => go(tag)}
                    className="rounded-full border border-line px-3 py-1 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {recent.length > 0 ? (
            <>
              <p className="px-2 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                Recent
              </p>
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => go(item)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
                >
                  <TrendingIcon className="size-4 shrink-0 text-ink-faint" />
                  {item}
                </button>
              ))}
            </>
          ) : null}

          {recent.length === 0 && suggestions.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-ink-faint">
              <PlusIcon className="mx-auto mb-2 size-5" />
              Try a topic like <span className="text-ink-muted">postgres</span> or{" "}
              <span className="text-ink-muted">typography</span>.
            </p>
          ) : null}
        </div>
      </ModalContent>
    </Modal>
  );
}
