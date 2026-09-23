'use client';

import { motion, useScroll, useSpring } from 'framer-motion';

/**
 * Top-of-page reading progress bar. Driven by `useScroll` (rAF-batched) and a
 * spring on `scaleX`, so it animates on the compositor and never triggers
 * layout.
 */
export function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 40, restDelta: 0.001 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent"
    />
  );
}
