"use client";

/**
 * Motion layer.
 *
 * Two decisions keep Framer Motion from costing more than it gives back:
 *
 *  1. **`LazyMotion` + `m`** — only the DOM animation feature set is loaded, and
 *     it is loaded lazily on first use. This is roughly a third of the full
 *     `motion` bundle (~15 KB gzip instead of ~40 KB).
 *  2. **CSS for simple state changes.** Radix enter/exit animations are pure CSS
 *     (see globals.css). Framer is reserved for things CSS genuinely cannot do:
 *     scroll-linked progress, spring physics, gesture-driven claps and
 *     viewport-triggered reveals.
 *
 * `MotionConfig reducedMotion="user"` makes every animation below respect
 * `prefers-reduced-motion` automatically, including the ones that only use
 * transforms.
 */
import { LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export { m, AnimatePresence, useReducedMotion, useInView, useScroll, useSpring, useMotionValue, useTransform, useMotionValueEvent } from "framer-motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/**
 * Reveal — fade + rise as an element scrolls into view, once.
 *
 * `once` matters: re-animating on every pass turns a reading page into a
 * fairground. The initial state is applied only client-side, so server-rendered
 * HTML is never invisible.
 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px 0px -40px 0px" });
  // The element varies (`div`, `section`, `li`, `article`), so the concrete
  // ref type is narrowed once here rather than at four call sites.
  const Component = m[as] as typeof m.div;

  return (
    <Component
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(className)}
    >
      {children}
    </Component>
  );
}

/** Container that staggers its `StaggerItem` children by 60ms. */
export function Stagger({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
      className={cn(className)}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={cn(className)}
    >
      {children}
    </m.div>
  );
}
