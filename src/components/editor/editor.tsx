"use client";

/**
 * The writing studio.
 *
 * ── Autosave ──────────────────────────────────────────────────────────────────
 * Saves 1.4 s after the writer stops typing (a debounce, not an interval, so an
 * idle session writes nothing at all), plus:
 *   • ⌘S / Ctrl-S forces an immediate save
 *   • navigating away flushes the pending save
 *   • `beforeunload` warns while a save is in flight
 *   • every keystroke is mirrored to localStorage, so a crashed tab offers to
 *     restore the newer copy on return
 *
 * ── Why the preview is a server action ────────────────────────────────────────
 * Rendering Markdown in the browser would ship the parser, and would risk the
 * preview and the published article disagreeing. `previewAction` runs the exact
 * function that renders the published page, so what you see is what will be
 * served — and the client bundle stays free of the renderer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "@/components/motion";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
  ArrowRightIcon,
  BoldIcon,
  CheckIcon,
  CloseIcon,
  CodeIcon,
  EyeIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  LoaderIcon,
  PlusIcon,
  QuoteIcon,
  TagIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { Cover } from "@/components/post/cover";
import { publishPostAction, previewAction, savePostAction } from "@/server/actions/posts";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/editor-types";
import { COVER_PRESET_KEYS, cn, relativeTime } from "@/lib/utils";
import { normalizeTags } from "@/lib/validation";
import type { EditorStatus } from "@/lib/editor-types";

export interface EditorPost {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  content: string;
  tags: string[];
  coverImage: string | null;
  coverPreset: string;
  status: "draft" | "published" | "unlisted";
  updatedAt: string;
  publishedAt: string | null;
}

type Mode = "write" | "preview";

export function Editor({ post }: { post: EditorPost }) {
  const router = useRouter();

  const [title, setTitle] = useState(post.title === "Untitled" ? "" : post.title);
  const [subtitle, setSubtitle] = useState(post.subtitle);
  const [content, setContent] = useState(post.content);
  const [tags, setTags] = useState<string[]>(post.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [coverImage, setCoverImage] = useState(post.coverImage ?? "");
  const [coverPreset, setCoverPreset] = useState(post.coverPreset);
  const [status, setStatus] = useState(post.status);

  const [mode, setMode] = useState<Mode>("write");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<EditorStatus>({ state: "idle" });
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | undefined>();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [restorable, setRestorable] = useState<{ content: string; savedAt: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const latestRef = useRef({ title, subtitle, content, tags, coverImage, coverPreset });

  latestRef.current = { title, subtitle, content, tags, coverImage, coverPreset };
  const storageKey = `folio:draft:${post.id}`;

  const words = useMemo(() => (content.trim() ? content.trim().split(/\s+/).length : 0), [content]);
  const minutes = useMemo(() => Math.max(1, Math.round(words / 225)), [words]);
  const isPublished = status === "published";

  // ── Crash recovery ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as { content: string; title: string; savedAt: string };
      const storedAt = new Date(stored.savedAt).getTime();
      const serverAt = new Date(post.updatedAt).getTime();
      if (storedAt > serverAt + 2000 && stored.content !== post.content) {
        setRestorable({ content: stored.content, savedAt: stored.savedAt });
      }
    } catch {
      /* corrupt entry — ignore */
    }
    // Only ever offered once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mirrorLocally = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...latestRef.current, savedAt: new Date().toISOString() }),
      );
    } catch {
      /* storage full or private mode */
    }
  }, [storageKey]);

  const save = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!dirtyRef.current && silent) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setSaveState((current) => ({ ...current, state: "saving" }));
      const result = await savePostAction(post.id, {
        title: latestRef.current.title || "Untitled",
        subtitle: latestRef.current.subtitle,
        content: latestRef.current.content,
        tags: latestRef.current.tags,
        coverImage: latestRef.current.coverImage || null,
        coverPreset: latestRef.current.coverPreset,
      });

      if (!result.ok) {
        setSaveState({ state: "error", message: result.error ?? "Couldn't save." });
        return;
      }

      dirtyRef.current = false;
      setSaveState({
        state: "saved",
        updatedAt: result.data?.updatedAt,
        wordCount: result.data?.wordCount,
        readingMinutes: result.data?.readingMinutes,
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    },
    [post.id, storageKey],
  );

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    mirrorLocally();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
  }, [mirrorLocally, save]);

  // Flush on tab close / navigation while dirty.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) void save({ silent: false });
    };
  }, [save]);

  // ⌘S saves, ⌘⏎ publishes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void publish();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publish = useCallback(async () => {
    setPublishing(true);
    setPublishError(undefined);

    const result = await publishPostAction(post.id, {
      title: latestRef.current.title || "Untitled",
      subtitle: latestRef.current.subtitle,
      content: latestRef.current.content,
      tags: latestRef.current.tags,
      coverImage: latestRef.current.coverImage || null,
      coverPreset: latestRef.current.coverPreset,
    });

    setPublishing(false);
    if (!result.ok || !result.data) {
      setPublishError(result.error ?? "Couldn't publish just now.");
      return;
    }

    dirtyRef.current = false;
    setStatus("published");
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    router.push(`/p/${result.data.slug}`);
    router.refresh();
  }, [post.id, router, storageKey]);

  const showPreview = useCallback(async () => {
    if (mode === "preview") {
      setMode("write");
      return;
    }
    setMode("preview");
    const result = await previewAction(latestRef.current.content);
    setPreviewHtml(result.data?.html ?? "");
  }, [mode]);

  /** Markdown formatting around the current selection. */
  const wrap = useCallback(
    (before: string, after = before, placeholder = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd, value } = textarea;
      const selected = value.slice(selectionStart, selectionEnd) || placeholder;
      const next = `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`;

      setContent(next);
      schedule();
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
      });
    },
    [schedule],
  );

  const prefixLines = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd, value } = textarea;
      const startOfLine = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const block = value.slice(startOfLine, selectionEnd) || "";
      const transformed = block
        .split("\n")
        .map((line) => (line.trim() ? `${prefix}${line}` : line))
        .join("\n");

      const next = `${value.slice(0, startOfLine)}${transformed}${value.slice(selectionEnd)}`;
      setContent(next);
      schedule();
      requestAnimationFrame(() => textarea.focus());
    },
    [schedule],
  );

  const addTag = useCallback(
    (raw: string) => {
      const [next] = normalizeTags([raw]);
      if (!next || tags.includes(next) || tags.length >= 5) return;
      setTags([...tags, next]);
      setTagDraft("");
      schedule();
    },
    [tags, schedule],
  );

  const saveLabel =
    saveState.state === "saving"
      ? "Saving…"
      : saveState.state === "error"
        ? (saveState.message ?? "Save failed")
        : saveState.updatedAt
          ? `Saved ${relativeTime(saveState.updatedAt)}`
          : isPublished
            ? `Published ${relativeTime(post.publishedAt ?? post.updatedAt)}`
            : "Draft — not published yet";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="glass sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:-mx-6 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm text-ink-muted transition-colors hover:text-ink"
        >
          ← Dashboard
        </Link>

        <span
          className="ml-2 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-faint"
          aria-live="polite"
        >
          {saveState.state === "saving" ? (
            <LoaderIcon className="size-3.5" />
          ) : saveState.state === "error" ? (
            <CloseIcon className="size-3.5 text-danger" />
          ) : (
            <CheckIcon className="size-3.5 text-success" />
          )}
          {saveLabel}
        </span>

        <Badge tone={isPublished ? "success" : "draft"} className="ml-1">
          {isPublished ? "Published" : "Draft"}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void showPreview()}>
            <EyeIcon className="size-4" />
            {mode === "preview" ? "Back to writing" : "Preview"}
          </Button>
          {isPublished ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/p/${post.slug}`}>
                View story <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          ) : null}
          <Button variant="primary" size="sm" loading={publishing} onClick={() => void publish()}>
            {isPublished ? "Update" : "Publish"}
          </Button>
        </div>
      </div>

      {publishError ? (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {publishError}
        </p>
      ) : null}

      {/* ── Recovered draft ─────────────────────────────────────────────── */}
      {restorable ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-accent/30 bg-accent-soft px-3 py-2.5 text-sm">
          <span className="text-ink-muted">
            There&rsquo;s a newer local copy from {relativeTime(restorable.savedAt)} — the tab probably
            closed before it saved.
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setContent(restorable.content);
                setRestorable(null);
                schedule();
              }}
            >
              Restore it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRestorable(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Main pane ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {mode === "preview" ? (
            <article className="rounded-xl border border-line bg-paper-raised px-6 py-10 sm:px-10">
              <p className="mb-6 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Preview — exactly what readers will see
              </p>
              <h1 className="font-display text-3xl leading-tight tracking-[-0.03em] text-ink">
                {title || "Untitled"}
              </h1>
              {subtitle ? <p className="mt-3 text-lg text-ink-muted">{subtitle}</p> : null}
              {previewHtml === null ? (
                <p className="mt-8 text-sm text-ink-faint">Rendering…</p>
              ) : (
                <div
                  className="article-body article-body--compact mt-8"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </article>
          ) : (
            <>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  schedule();
                }}
                placeholder="Title"
                aria-label="Story title"
                maxLength={160}
                className="w-full border-0 bg-transparent font-display text-[2.1rem] leading-tight tracking-[-0.03em] text-ink outline-none placeholder:text-ink-faint/60"
              />
              <input
                value={subtitle}
                onChange={(event) => {
                  setSubtitle(event.target.value);
                  schedule();
                }}
                placeholder="Add a subtitle — one sentence about why this matters"
                aria-label="Story subtitle"
                maxLength={240}
                className="mt-3 w-full border-0 bg-transparent text-lg text-ink-muted outline-none placeholder:text-ink-faint/70"
              />

              {/* Formatting bar */}
              <div className="mt-6 flex flex-wrap items-center gap-0.5 border-y border-line py-2">
                <IconButton label="Bold" size="icon-sm" onClick={() => wrap("**", "**", "bold text")}>
                  <BoldIcon className="size-4" />
                </IconButton>
                <IconButton label="Italic" size="icon-sm" onClick={() => wrap("_", "_", "emphasis")}>
                  <ItalicIcon className="size-4" />
                </IconButton>
                <IconButton label="Heading" size="icon-sm" onClick={() => prefixLines("## ")}>
                  <HeadingIcon className="size-4" />
                </IconButton>
                <IconButton label="Quote" size="icon-sm" onClick={() => prefixLines("> ")}>
                  <QuoteIcon className="size-4" />
                </IconButton>
                <IconButton label="List" size="icon-sm" onClick={() => prefixLines("- ")}>
                  <ListIcon className="size-4" />
                </IconButton>
                <IconButton label="Code block" size="icon-sm" onClick={() => wrap("\n```\n", "\n```\n", "code")}>
                  <CodeIcon className="size-4" />
                </IconButton>
                <IconButton
                  label="Link"
                  size="icon-sm"
                  onClick={() => wrap("[", "](https://)", "link text")}
                >
                  <LinkIcon className="size-4" />
                </IconButton>
                <IconButton
                  label="Image"
                  size="icon-sm"
                  onClick={() => wrap("![", "](https://)", "alt text")}
                >
                  <ImageIcon className="size-4" />
                </IconButton>

                <span className="ml-auto flex items-center gap-3 text-xs text-ink-faint">
                  <span className="tabular-nums">
                    {words} {words === 1 ? "word" : "words"} · {minutes} min read
                  </span>
                  <kbd className="hidden rounded border border-line bg-paper-sunken px-1.5 py-0.5 text-2xs sm:inline">
                    ⌘S
                  </kbd>
                </span>
              </div>

              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  schedule();
                }}
                onKeyDown={(event) => {
                  // Tab indents rather than escaping the editor — writers expect it.
                  if (event.key === "Tab") {
                    event.preventDefault();
                    wrap("  ", "", "");
                  }
                }}
                placeholder={"Tell the story.\n\nMarkdown works: ## headings, **bold**, _italics_, > quotes, `code`, and lists."}
                aria-label="Story body"
                spellCheck
                className="mt-6 min-h-[26rem] resize-none border-0 bg-transparent p-0 font-sans text-[1.0625rem] leading-[1.75] focus:ring-0"
              />
            </>
          )}
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="space-y-6 lg:sticky lg:top-32 lg:self-start">
          <section className="rounded-xl border border-line bg-paper-raised p-5">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Cover
            </h2>
            <div className="mt-3">
              <Cover
                image={coverImage || null}
                preset={coverPreset}
                title={title || "Untitled"}
                className="aspect-[16/10] w-full rounded-lg"
                sizes="320px"
              />
            </div>

            <div className="mt-3">
              <Label htmlFor="cover-url" className="text-xs">
                Image URL
              </Label>
              <Input
                id="cover-url"
                value={coverImage}
                onChange={(event) => {
                  setCoverImage(event.target.value);
                  schedule();
                }}
                placeholder="https://images.example.com/photo.jpg"
                className="text-[0.8125rem]"
                inputMode="url"
              />
              {coverImage ? (
                <button
                  type="button"
                  onClick={() => {
                    setCoverImage("");
                    schedule();
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-danger"
                >
                  <TrashIcon className="size-3" /> Remove image
                </button>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs text-ink-faint">
                Or pick a gradient — no image needed, nothing to load.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COVER_PRESET_KEYS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Cover preset ${preset}`}
                    aria-pressed={coverPreset === preset && !coverImage}
                    onClick={() => {
                      setCoverPreset(preset);
                      setCoverImage("");
                      schedule();
                    }}
                    className={cn(
                      "size-7 overflow-hidden rounded-md ring-offset-2 ring-offset-paper-raised transition-all",
                      coverPreset === preset && !coverImage ? "ring-2 ring-ink" : "ring-1 ring-line",
                    )}
                  >
                    <PresetSwatch preset={preset} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-paper-raised p-5">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Topics
            </h2>
            <p className="mt-2 text-xs text-ink-faint">
              Up to five. They decide where your story appears in explore and search.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {tags.map((tag) => (
                  <m.span
                    key={tag}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-sunken py-1 pl-2.5 pr-1.5 text-[0.8125rem] text-ink-muted"
                  >
                    <TagIcon className="size-3" />
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      onClick={() => {
                        setTags(tags.filter((item) => item !== tag));
                        schedule();
                      }}
                      className="rounded-full p-0.5 transition-colors hover:bg-line hover:text-ink"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </m.span>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-3 flex gap-2">
              <Input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag(tagDraft);
                  }
                }}
                placeholder="typography"
                aria-label="Add a topic"
                className="text-[0.8125rem]"
                disabled={tags.length >= 5}
              />
              <Button
                size="icon"
                variant="secondary"
                aria-label="Add topic"
                onClick={() => addTag(tagDraft)}
                disabled={tags.length >= 5}
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-paper-sunken/60 p-5">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Publishing
            </h2>
            <dl className="mt-3 space-y-2 text-[0.8125rem]">
              <div className="flex justify-between">
                <dt className="text-ink-faint">Status</dt>
                <dd className="text-ink">{isPublished ? "Published" : "Draft"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-faint">Length</dt>
                <dd className="tabular-nums text-ink">{words} words</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-faint">Reading time</dt>
                <dd className="text-ink">{minutes} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-faint">Last edit</dt>
                <dd className="text-ink">{relativeTime(saveState.updatedAt ?? post.updatedAt)}</dd>
              </div>
            </dl>

            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
              {isPublished
                ? "Editing a published story updates it in place — the URL never changes, readers never see a draft."
                : "Drafts are private. Autosave keeps them safe; publishing makes the URL public immediately."}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <Button variant="primary" size="md" loading={publishing} onClick={() => void publish()}>
                {isPublished ? "Update story" : "Publish story"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void save()}>
                Save draft
              </Button>
            </div>
          </section>
        </aside>
      </div>

      {/* ── Unsaved-work guard ────────────────────────────────────────────── */}
      <Modal open={confirmLeave} onOpenChange={setConfirmLeave}>
        <ModalContent size="sm">
          <ModalHeader title="Leave without saving?" description="Your latest changes are still only in this tab." />
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
              Keep writing
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void save();
                setConfirmLeave(false);
              }}
            >
              Save and stay
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

/** The preset buttons render the same gradient the feed will use. */
function PresetSwatch({ preset }: { preset: string }) {
  const gradients: Record<string, string> = {
    linen: "linear-gradient(135deg, #f6efe6, #d9c9b6)",
    dusk: "linear-gradient(135deg, #e8e4f4, #a8a2d6)",
    moss: "linear-gradient(135deg, #e6efe4, #a9c6a4)",
    clay: "linear-gradient(135deg, #f7e8e2, #d8a894)",
    sand: "linear-gradient(135deg, #f8f2e2, #d9c79b)",
    indigo: "linear-gradient(135deg, #e3e9f6, #97a8d1)",
    slate: "linear-gradient(135deg, #eceef1, #b0b8c4)",
    rose: "linear-gradient(135deg, #f9e9ee, #d8a8ba)",
  };
  return <span className="block size-full rounded-md" style={{ backgroundImage: gradients[preset] }} aria-hidden />;
}
