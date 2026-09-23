"use client";

/**
 * Theme control.
 *
 * Cycles light → dark → system. The icon crossfades with Framer's
 * `AnimatePresence`, and the accessible label always names the *next* state
 * rather than the current one, so screen-reader users know what pressing it does.
 */
import { AnimatePresence, m } from "framer-motion";
import { useTheme, type ThemeChoice } from "@/components/theme-provider";
import { IconButton } from "@/components/ui/button";
import { MoonIcon, SunIcon, SystemIcon } from "@/components/ui/icons";

const ICONS: Record<ThemeChoice, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemIcon,
};

const LABELS: Record<ThemeChoice, string> = {
  light: "Light theme — switch to dark",
  dark: "Dark theme — switch to system",
  system: "System theme — switch to light",
};

export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  const Icon = ICONS[theme];

  return (
    <IconButton label={LABELS[theme]} onClick={cycle} variant="ghost">
      <span className="relative flex size-5 items-center justify-center">
        <AnimatePresence initial={false} mode="wait">
          <m.span
            key={theme}
            initial={{ opacity: 0, rotate: -35, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 35, scale: 0.7 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Icon className="size-5" />
          </m.span>
        </AnimatePresence>
      </span>
    </IconButton>
  );
}
