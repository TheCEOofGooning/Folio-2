"use client";

/**
 * Top navigation.
 *
 * A static glass shell (rendered by the root layout, so it is part of the cached
 * HTML) plus three small islands: theme, account and search. The only state the
 * nav owns is "which overlay is open" — everything identity-related comes from
 * the session context, which resolves once per page load.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu } from "./account-menu";
import { ThemeToggle } from "./theme-toggle";
import { SearchDialog } from "./search-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { MenuIcon, PenIcon, SearchIcon } from "@/components/ui/icons";
import { Modal, ModalBody, ModalContent } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/library", label: "Library" },
];

export function Nav({ suggestions = [] }: { suggestions?: string[] }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // ⌘K / Ctrl-K opens search from anywhere. Registered once, at the top level.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <header className="glass sticky top-0 z-40 border-b border-line/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link
            href="/"
            className="font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink transition-opacity hover:opacity-80"
          >
            Folio
          </Link>

          <nav aria-label="Main" className="ml-3 hidden items-center gap-0.5 md:flex">
            {LINKS.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {link.label}
                  {active ? (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-ink" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Search (⌘K)" onClick={() => setSearchOpen(true)}>
              <SearchIcon />
            </IconButton>
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/write">
                <PenIcon className="size-4" /> Write
              </Link>
            </Button>
            <AccountMenu />
            <IconButton
              label="Open menu"
              className="md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          </div>
        </div>
      </header>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} suggestions={suggestions} />

      <Modal open={menuOpen} onOpenChange={setMenuOpen}>
        <ModalContent size="sm" className="top-[12%] translate-y-0" described={false}>
          <ModalBody className="space-y-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-3 text-base text-ink transition-colors hover:bg-paper-sunken"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/write"
              className="flex items-center gap-2 rounded-md px-3 py-3 text-base text-ink transition-colors hover:bg-paper-sunken"
            >
              <PenIcon className="size-4" /> Write a story
            </Link>
            <div className="rule my-2" />
            <Link
              href="/about"
              className="block rounded-md px-3 py-3 text-base text-ink-muted transition-colors hover:bg-paper-sunken"
            >
              About Folio
            </Link>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable ||
    element.getAttribute("role") === "textbox"
  );
}
