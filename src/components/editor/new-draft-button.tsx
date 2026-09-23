"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDraftAction } from "@/server/actions/posts";
import { LoaderIcon, PlusIcon } from "@/components/ui/icons";

/**
 * "New draft" — the one place a draft is created on demand.
 *
 * `/write` deliberately does not create rows while rendering (that turns a GET
 * into a write and breaks prefetching), so starting a *second* draft needs an
 * explicit click. The action returns the new post's slug, and we push the editor
 * at it.
 */
export function NewDraftButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createDraftAction();
      if (!result.ok || !result.data) {
        setError(result.error ?? "Couldn't start a new draft.");
        return;
      }
      router.push(`/write/${result.data.slug}`);
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full border border-dashed border-line px-3.5 py-1.5 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60"
      >
        {pending ? <LoaderIcon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
        {pending ? "Starting…" : "New draft"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
