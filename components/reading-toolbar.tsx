'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SlidersIcon } from '@/components/icons';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

/**
 * Distraction-free reading, but *your* distraction-free.
 *
 * The three controls write CSS custom properties onto <html> — no React state
 * in the article, no re-render, no layout thrash. Choices persist in
 * localStorage and are applied before the toolbar hydrates.
 */

const KEY = 'folio-reader';

type Prefs = { width: 'narrow' | 'normal' | 'wide'; size: 'sm' | 'md' | 'lg'; font: 'serif' | 'sans' };

const DEFAULTS: Prefs = { width: 'normal', size: 'md', font: 'serif' };

const WIDTHS: Record<Prefs['width'], string> = { narrow: '36rem', normal: '42rem', wide: '52rem' };
const SIZES: Record<Prefs['size'], string> = { sm: '1.0625rem', md: '1.1875rem', lg: '1.3125rem' };

function apply(prefs: Prefs) {
  const root = document.documentElement;
  root.style.setProperty('--reader-width', WIDTHS[prefs.width]);
  root.style.setProperty('--reader-size', SIZES[prefs.size]);
  root.style.setProperty(
    '--reader-font',
    prefs.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex-1 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
              value === option.value ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {value === option.value ? (
              <motion.span
                layoutId={`segmented-${label}`}
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReadingToolbar() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stored: Prefs = DEFAULTS;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) stored = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
    } catch {
      /* first visit */
    }
    setPrefs(stored);
    apply(stored);
  }, []);

  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((previous) => {
      const next = { ...previous, [key]: value };
      apply(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — the session still gets the preference */
      }
      return next;
    });
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 print:hidden">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass w-60 space-y-3.5 rounded-2xl border border-line p-4 shadow-card"
          >
            <Segmented
              label="Width"
              value={prefs.width}
              onChange={(width) => update('width', width)}
              options={[
                { value: 'narrow', label: 'Narrow' },
                { value: 'normal', label: 'Normal' },
                { value: 'wide', label: 'Wide' },
              ]}
            />
            <Segmented
              label="Text size"
              value={prefs.size}
              onChange={(size) => update('size', size)}
              options={[
                { value: 'sm', label: 'S' },
                { value: 'md', label: 'M' },
                { value: 'lg', label: 'L' },
              ]}
            />
            <Segmented
              label="Typeface"
              value={prefs.font}
              onChange={(font) => update('font', font)}
              options={[
                { value: 'serif', label: 'Serif' },
                { value: 'sans', label: 'Sans' },
              ]}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Reading preferences"
        className={buttonClass(open ? 'primary' : 'secondary', 'icon', 'glass shadow-card')}
      >
        <SlidersIcon size={18} />
      </button>
    </div>
  );
}
