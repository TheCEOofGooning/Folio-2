'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useTheme, type Theme } from '@/components/theme-provider';

const OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render the light icon until mounted so SSR and the first client paint agree.
  const CurrentIcon = resolved === 'dark' ? MoonIcon : SunIcon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Change theme"
        className={buttonClass('ghost', 'icon', 'relative text-muted hover:text-ink')}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mounted ? resolved : 'light'}
            initial={{ opacity: 0, rotate: -35, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 35, scale: 0.8 }}
            transition={{ duration: 0.18 }}
            className="grid place-items-center"
          >
            <CurrentIcon size={18} />
          </motion.span>
        </AnimatePresence>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className={cn(
            'z-50 w-40 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-card',
            'data-[state=open]:animate-in data-[state=open]:fade-in',
          )}
        >
          {OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const active = theme === option.value;
            return (
              <DropdownMenu.Item
                key={option.value}
                onSelect={() => setTheme(option.value)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none',
                  'text-muted transition-colors data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink',
                  active && 'text-accent',
                )}
              >
                <OptionIcon size={16} />
                {option.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
