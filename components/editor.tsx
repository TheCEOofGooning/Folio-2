'use client';

/**
 * components/editor.tsx — the writing surface.
 *
 * A Markdown textarea rather than a contenteditable block editor, on purpose:
 * the document the author edits is the document that is stored, so there is no
 * lossy HTML→Markdown round-trip and no `execCommand` browser divergence. All
 * formatting goes through the pure commands in lib/utils/editor-commands.ts,
 * and the preview renders through the same pipeline as the reading page.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';

import { publishAction, saveDraftAction } from '@/lib/actions/posts';
import {
  BoldIcon,
  CheckIcon,
  CodeIcon,
  EyeIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  PenIcon,
  QuoteIcon,
  SparkIcon,
} from '@/components/icons';
import { Button, buttonClass } from '@/components/ui/button';
import { Spinner } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { countWords, markdownToHtml, readMinutes } from '@/lib/utils/markdown';
import { applyCommand, continueList, indent, type EditorCommand } from '@/lib/utils/editor-commands';

export interface EditorPost {
  id?: number | null;
  slug?: string | null;
  title: string;
  subtitle: string;
  coverUrl: string;
  tags: string[];
  content: string;
  status?: 'draft' | 'published';
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const TOOLBAR: { command: EditorCommand; icon: typeof BoldIcon; group: number }[] = [
  { command: 'bold', icon: BoldIcon, group: 1 },
  { command: 'italic', icon: ItalicIcon, group: 1 },
  { command: 'code', icon: CodeIcon, group: 1 },
  { command: 'heading-2', icon: HeadingIcon, group: 2 },
  { command: 'quote', icon: QuoteIcon, group: 2 },
  { command: 'bullet-list', icon: ListIcon, group: 2 },
  { command: 'numbered-list', icon: OrderedListIcon, group: 2 },
  { command: 'link', icon: LinkIcon, group: 3 },
  { command: 'image', icon: ImageIcon, group: 3 },
  { command: 'code-block', icon: CodeIcon, group: 3 },
];

const TITLES: Record<EditorCommand, string> = {
  bold: 'Bold  ⌘B',
  italic: 'Italic  ⌘I',
  strikethrough: 'Strikethrough',
  code: 'Inline code  ⌘E',
  'code-block': 'Code block',
  'heading-2': 'Heading  ⌘⌥2',
  'heading-3': 'Subheading',
  quote: 'Quote',
  'bullet-list': 'Bulleted list',
  'numbered-list': 'Numbered list',
  link: 'Link  ⌘K',
  image: 'Image',
  divider: 'Divider',
};

const STARTER = `## Start with a sentence you believe in

Folio stores what you type: **Markdown** in, a beautiful reading page out.

- Press **⌘B** for bold, **⌘I** for italic, **⌘K** for a link
- Drafts save themselves while you think
- Hit *Publish* when it feels done

> Everything you write here is yours. No paywall, no lock-in.
`;

export function Editor({ post, welcome = false }: { post: EditorPost; welcome?: boolean }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draft, setDraft] = useState<EditorPost>({
    id: post.id ?? null,
    slug: post.slug ?? null,
    title: post.title,
    subtitle: post.subtitle,
    coverUrl: post.coverUrl,
    tags: post.tags,
    content: post.content || (post.id ? '' : STARTER),
    status: post.status ?? 'draft',
  });
  const [tagInput, setTagInput] = useState(post.tags.join(', '));
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();

  const words = useMemo(() => countWords(draft.content), [draft.content]);
  const minutes = useMemo(() => readMinutes(draft.content), [draft.content]);
  const previewHtml = useMemo(() => markdownToHtml(draft.content), [draft.content]);

  const payload = useCallback(
    () => ({
      id: draft.id ?? null,
      title: draft.title,
      subtitle: draft.subtitle,
      coverUrl: draft.coverUrl,
      tags: tagInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      content: draft.content,
    }),
    [draft, tagInput],
  );

  const save = useCallback(
    async (silent = true) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (!draft.title.trim() && !draft.content.trim()) return;
      setSaveState('saving');
      const result = await saveDraftAction(payload());
      if (result.ok) {
        if (result.id && !draft.id) {
          setDraft((current) => ({ ...current, id: result.id ?? null, slug: result.slug ?? null }));
          router.replace(`/write?edit=${result.slug}`, { scroll: false });
        }
        setSaveState('saved');
        if (!silent) setMessage('Draft saved.');
      } else {
        setSaveState('error');
        setMessage(result.error ?? 'Could not save your draft.');
      }
    },
    [draft.id, draft.title, draft.content, payload, router],
  );

  // Debounced auto-save: 1.2s after the last keystroke.
  useEffect(() => {
    if (saveState === 'saving') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.title, draft.subtitle, draft.content, draft.coverUrl, tagInput]);

  const runCommand = useCallback(
    (command: EditorCommand) => {
      const area = textareaRef.current;
      if (!area) return;
      const next = applyCommand(
        { text: draft.content, start: area.selectionStart, end: area.selectionEnd },
        command,
      );
      setDraft((current) => ({ ...current, content: next.text }));
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(next.start, next.end);
      });
    },
    [draft.content],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const area = event.currentTarget;
    const selection = { text: draft.content, start: area.selectionStart, end: area.selectionEnd };
    const meta = event.metaKey || event.ctrlKey;

    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save(false);
      return;
    }
    if (meta && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      runCommand('bold');
      return;
    }
    if (meta && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      runCommand('italic');
      return;
    }
    if (meta && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      runCommand('link');
      return;
    }
    if (meta && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      runCommand('code');
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const continued = continueList(selection);
      if (continued) {
        event.preventDefault();
        setDraft((current) => ({ ...current, content: continued.text }));
        requestAnimationFrame(() => area.setSelectionRange(continued.start, continued.end));
        return;
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const next = indent(selection, event.shiftKey ? -1 : 1);
      setDraft((current) => ({ ...current, content: next.text }));
      requestAnimationFrame(() => area.setSelectionRange(next.start, next.end));
    }
    if (event.key === 'Escape') area.blur();
  };

  const publish = () => {
    setMessage(null);
    startPublish(async () => {
      const saved = await saveDraftAction(payload());
      if (!saved.ok || !saved.id) {
        setSaveState('error');
        setMessage(saved.error ?? 'Could not save before publishing.');
        return;
      }
      const result = await publishAction(saved.id);
      if (!result.ok) {
        setMessage(result.error ?? 'Could not publish.');
        return;
      }
      setDraft((current) => ({ ...current, status: 'published', id: saved.id ?? null, slug: result.slug ?? null }));
      router.push(`/p/${result.slug}`);
      router.refresh();
    });
  };

  const unpublish = () => {
    setMessage(null);
    startPublish(async () => {
      if (!draft.id) return;
      const { unpublishAction } = await import('@/lib/actions/posts');
      await unpublishAction(draft.id);
      setDraft((current) => ({ ...current, status: 'draft' }));
      router.refresh();
      setMessage('Moved back to drafts.');
    });
  };

  const isPublished = draft.status === 'published';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-8 sm:px-6">
      <AnimatePresence>
        {welcome ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3.5 text-sm text-ink"
          >
            <SparkIcon size={18} className="mt-0.5 shrink-0 text-accent" />
            <p>
              Welcome to Folio. Your first draft is already open — rewrite it, or clear it and start from scratch.
              Everything saves itself.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/dashboard/posts" className="text-sm text-muted transition-colors hover:text-ink">
          ← Your stories
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span
            aria-live="polite"
            className={cn(
              'inline-flex items-center gap-1.5 text-[13px]',
              saveState === 'error' ? 'text-red-500' : 'text-muted',
            )}
          >
            {saveState === 'saving' ? <Spinner className="h-3.5 w-3.5" /> : null}
            {saveState === 'saved' ? <CheckIcon size={14} className="text-emerald-500" /> : null}
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Draft saved' : saveState === 'error' ? 'Save failed' : 'Auto-save on'}
          </span>
          {isPublished ? (
            <Button variant="outline" size="sm" onClick={unpublish} disabled={publishing}>
              Unpublish
            </Button>
          ) : null}
          {isPublished && draft.slug ? (
            <Link href={`/p/${draft.slug}`} className={buttonClass('secondary', 'sm')}>
              <EyeIcon size={15} /> View
            </Link>
          ) : null}
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? <Spinner className="h-4 w-4" /> : <PenIcon size={15} />}
            {isPublished ? 'Update' : 'Publish'}
          </Button>
        </div>
      </div>

      <input
        value={draft.title}
        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        placeholder="Title"
        aria-label="Title"
        maxLength={140}
        className="w-full border-0 bg-transparent p-0 font-serif text-4xl font-semibold tracking-tight text-ink placeholder:text-muted/50 focus:outline-none sm:text-5xl"
      />
      <input
        value={draft.subtitle}
        onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
        placeholder="Subtitle — one line that earns the click"
        aria-label="Subtitle"
        maxLength={200}
        className="mt-3 w-full border-0 bg-transparent p-0 text-lg text-muted placeholder:text-muted/50 focus:outline-none"
      />

      <div className="mt-5 flex flex-col gap-3 border-y border-line py-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <ImageIcon size={16} className="shrink-0 text-muted" />
          <input
            value={draft.coverUrl}
            onChange={(event) => setDraft((current) => ({ ...current, coverUrl: event.target.value }))}
            placeholder="Cover image URL (https://…)"
            aria-label="Cover image URL"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted/60 focus:outline-none"
          />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <SparkIcon size={16} className="shrink-0 text-muted" />
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="Topics, comma separated"
            aria-label="Topics"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {TOOLBAR.map((item, index) => {
          const Icon = item.icon;
          const newGroup = index === 0 || TOOLBAR[index - 1].group !== item.group;
          return (
            <span key={item.command} className={cn('flex items-center gap-1', newGroup && index > 0 && 'ml-2')}>
              <button
                type="button"
                onClick={() => runCommand(item.command)}
                title={TITLES[item.command]}
                aria-label={TITLES[item.command]}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Icon size={16} />
              </button>
            </span>
          );
        })}

        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {(['write', 'split', 'preview'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn(
                'rounded-md px-2.5 py-1 text-[13px] font-medium capitalize transition-colors',
                mode === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('mt-5 grid gap-6', mode === 'split' && 'lg:grid-cols-2')}>
        {mode !== 'preview' ? (
          <textarea
            ref={textareaRef}
            value={draft.content}
            onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
            onKeyDown={onKeyDown}
            placeholder="Tell your story…"
            aria-label="Story content"
            spellCheck
            className="min-h-[55vh] w-full resize-y rounded-2xl border border-line bg-surface p-6 font-serif text-[17px] leading-[1.75] text-ink placeholder:text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-4 focus:ring-accent/5"
          />
        ) : null}

        {mode !== 'write' ? (
          <div className="min-h-[55vh] rounded-2xl border border-line bg-surface p-6">
            {draft.content.trim() ? (
              <div className="markdown" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <p className="text-muted">Nothing to preview yet.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
        <span>{words} words</span>
        <span>{minutes} min read</span>
        <span>{draft.content.length} characters</span>
        {message ? <span className={saveState === 'error' ? 'text-red-500' : 'text-emerald-600'}>{message}</span> : null}
        <span className="ml-auto hidden sm:inline">⌘S save · ⌘B bold · ⌘I italic · ⌘K link · Esc blur</span>
      </div>
    </div>
  );
}
