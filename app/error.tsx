'use client';

import { useEffect } from 'react';
import { AlertIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Wire this to Sentry/Axiom in production; the digest is what you search for.
    console.error('[folio]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-red-500">
        <AlertIcon size={22} />
      </span>
      <h1 className="mt-5 font-serif text-3xl tracking-tight text-ink">Something went wrong</h1>
      <p className="mt-3 text-muted">
        That one is on us. Try again — if it keeps happening, the reference below helps us find it.
      </p>
      {error.digest ? (
        <code className="mt-4 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-muted">
          {error.digest}
        </code>
      ) : null}
      <Button className="mt-7" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
