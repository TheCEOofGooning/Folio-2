"use client";

/**
 * Adjustable reading layout: type scale, column width, serif vs. sans.
 *
 * The controls write CSS custom properties onto `document.documentElement`
 * instead of wrapping the article in a client component. Two consequences that
 * matter: the article body stays a **server** component (no Markdown shipped to
 * the browser), and changing a control never re-renders the article — the browser
 * re-lays out from the variable alone.
 *
 * Preferences persist in `localStorage` and are applied on mount, so a reader who
 * prefers a wide column gets it on every story without a flash.
 */
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, m } from "@/components/motion";
import { Button, IconButton } from "@/components/ui/button";
import { ColumnsIcon, TextSizeIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "folio:reader-preferences";

const SCALES = [0.9, 1, 1.12, 1.25] as const;
const MEASURES = ["38rem", "42rem", "50rem", "62rem"] as const;

interface Preferences {
  scaleIndex: number;
  measureIndex: number;
  serif: boolean;
}

const DEFAULTS: Preferences = { scaleIndex: 1, measureIndex: 1, serif: true };

function apply(preferences: Preferences) {
  const root = document.documentElement;
  root.style.setProperty("--reader-scale", String(SCALES[preferences.scaleIndex]));
  root.style.setProperty("--reader-measure", MEASURES[preferences.measureIndex]);
  root.style.setProperty(
    "--reader-family",
    preferences.serif
      ? "var(--font-playfair), ui-serif, Georgia, serif"
      : "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  );
}

export function ReaderControls() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Preferences | null;
      const next = stored ? { ...DEFAULTS, ...stored } : DEFAULTS;
      setPreferences(next);
      apply(next);
    } catch {
      apply(DEFAULTS);
    }
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private mode — preferences simply don't persist */
      }
      return next;
    });
  }, []);

  const scaleLabel = `${Math.round(SCALES[preferences.scaleIndex] * 100)}%`;

  return (
    <div className="relative">
      <IconButton
        label={`Reading options — text size ${scaleLabel}`}
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="border border-line bg-paper-raised"
      >
        <TextSizeIcon className="size-4" />
      </IconButton>

      <AnimatePresence>
        {open ? (
          <>
            {/* Click-away layer: keeps the popover dismissible without a library. */}
            <button
              type="button"
              aria-label="Close reading options"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <m.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-line bg-paper-raised p-4 shadow-[var(--shadow-lg)]"
            >
              <Row label="Text size" hint={scaleLabel}>
                <Stepper
                  value={preferences.scaleIndex}
                  max={SCALES.length - 1}
                  onChange={(index) => update({ scaleIndex: index })}
                />
              </Row>

              <Row label="Column width" hint={MEASURES[preferences.measureIndex]}>
                <div className="flex items-center gap-1.5">
                  {MEASURES.map((measure, index) => (
                    <button
                      key={measure}
                      type="button"
                      aria-label={`Column width ${index + 1}`}
                      onClick={() => update({ measureIndex: index })}
                      className={cn(
                        "h-7 rounded border transition-colors",
                        index === preferences.measureIndex
                          ? "border-ink bg-ink"
                          : "border-line hover:border-line-strong",
                      )}
                      style={{ width: 18 + index * 8 }}
                    />
                  ))}
                </div>
              </Row>

              <Row label="Typeface" hint={preferences.serif ? "Serif" : "Sans"}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => update({ serif: !preferences.serif })}
                >
                  <ColumnsIcon className="size-3.5" />
                  {preferences.serif ? "Switch to sans" : "Switch to serif"}
                </Button>
              </Row>

              <button
                type="button"
                onClick={() => update(DEFAULTS)}
                className="mt-2 w-full rounded-md py-1.5 text-xs text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
              >
                Reset to defaults
              </button>
            </m.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 last:mb-0">
      <div>
        <p className="text-[0.8125rem] font-medium text-ink">{label}</p>
        {hint ? <p className="text-2xs text-ink-faint">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (index: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: max + 1 }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Text size ${index + 1} of ${max + 1}`}
          aria-pressed={index === value}
          onClick={() => onChange(index)}
          className={cn(
            "size-6 rounded-full border text-2xs transition-colors",
            index === value ? "border-ink bg-ink text-paper" : "border-line text-ink-faint hover:border-line-strong",
          )}
        >
          A
        </button>
      ))}
    </div>
  );
}
