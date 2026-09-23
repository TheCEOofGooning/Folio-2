"use client";

/**
 * Scroll-linked progress bar.
 *
 * One of the few places Framer Motion is genuinely necessary: the bar is driven
 * by a `MotionValue` from `useScroll`, so it updates on the compositor every
 * frame without a single React re-render. A `useState` + `scroll` listener would
 * re-render the article tree ~60 times a second while somebody reads it.
 *
 * The percentage is exposed to assistive tech as a progressbar, throttled to
 * whole numbers.
 */
import { m, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "@/components/motion";
import { useState } from "react";

export function ReadingProgress({ title }: { title: string }) {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();

  // A stiff spring removes the jitter of trackpad scrolling without lagging.
  const smooth = useSpring(scrollYProgress, { stiffness: 320, damping: 42, restDelta: 0.001 });
  const scaleX = prefersReducedMotion ? scrollYProgress : smooth;
  const opacity = useTransform(scrollYProgress, [0, 0.04], [0, 1]);
  const [percent, setPercent] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.min(100, Math.max(0, Math.round(value * 100)));
    setPercent((current) => (current === next ? current : next));
  });

  return (
    <>
      <div className="fixed inset-x-0 top-14 z-30 h-0.5 bg-transparent" aria-hidden>
        <m.div
          className="h-full origin-left bg-ink/80"
          style={{ scaleX, opacity }}
        />
      </div>
      <div
        role="progressbar"
        aria-label={`Reading progress through ${title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% read`}
        className="visually-hidden"
      />
    </>
  );
}
