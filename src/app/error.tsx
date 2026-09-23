"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";

/**
 * Error boundary.
 *
 * The most common real-world failure here is a misconfigured `DATABASE_URL`, so
 * the recovery copy says so explicitly rather than showing a generic shrug — a
 * self-hosted install should be debuggable from the page it broke on.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel captures this automatically; the local log keeps `next dev` useful.
    console.error("[folio] render error:", error.message);
  }, [error]);

  const looksLikeDatabase =
    /DATABASE_URL|fetch failed|ECONNREFUSED|connect|database/i.test(error.message);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center sm:px-6">
      <span className="flex size-12 items-center justify-center rounded-full border border-danger/30 bg-danger/8 text-danger">
        <AlertIcon className="size-5" />
      </span>
      <h1 className="mt-5 font-display text-3xl tracking-[-0.02em] text-ink">Something broke</h1>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
        {looksLikeDatabase
          ? "Folio couldn't reach its database. Locally, run `npm run dev:db`; on Vercel, check DATABASE_URL points at your Neon pooled connection string."
          : "An unexpected error stopped this page from rendering. Trying again usually works."}
      </p>

      {error.digest ? (
        <p className="mt-3 text-xs text-ink-faint">Reference: {error.digest}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" onClick={reset}>
          Try again
        </Button>
        <Button variant="secondary" size="lg" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>

      <pre className="mt-8 max-w-full overflow-x-auto rounded-lg border border-line bg-paper-sunken px-4 py-3 text-left text-xs text-ink-muted">
        <code>{error.message}</code>
      </pre>
    </div>
  );
}
