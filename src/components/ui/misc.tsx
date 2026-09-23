import { cn } from "@/lib/utils";

/** Tiny presentational primitives, kept in one file because each is ~10 lines. */

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { tone?: "neutral" | "accent" | "clap" | "success" | "draft" }) {
  const tones = {
    neutral: "border-line bg-paper-sunken text-ink-muted",
    accent: "border-accent/25 bg-accent-soft text-accent",
    clap: "border-clap/25 bg-clap-soft text-clap",
    success: "border-success/25 bg-success/10 text-success",
    draft: "border-line-strong bg-paper text-ink-faint",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "horizontal" ? "h-px w-full" : "h-full w-px", "bg-line", className)}
    />
  );
}

/** Small label above a heading, used to introduce sections. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint", className)}>
      {children}
    </p>
  );
}

/**
 * Reads a number as a sentence rather than as a dashboard widget — Folio's
 * editorial position on metrics (see the design notes in the README).
 */
export function StatSentence({
  value,
  label,
  delta,
  className,
}: {
  value: string;
  label: string;
  delta?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</span>
      <span className="font-display text-3xl leading-none tracking-[-0.02em] text-ink">{value}</span>
      {typeof delta === "number" && Number.isFinite(delta) && delta !== 0 ? (
        <span className={cn("text-[0.8125rem]", delta > 0 ? "text-success" : "text-ink-faint")}>
          {delta > 0 ? "↑" : "↓"} {Math.abs(Math.round(delta))}% vs. previous period
        </span>
      ) : null}
    </div>
  );
}
