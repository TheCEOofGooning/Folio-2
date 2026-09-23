'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-sm hover:opacity-90 active:opacity-100 disabled:bg-muted disabled:text-bg',
  secondary: 'bg-surface-2 text-ink hover:bg-line/70 border border-line/60',
  outline: 'border border-line text-ink hover:bg-surface-2 hover:border-muted/40',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl justify-center',
};

const BASE =
  'inline-flex items-center font-medium transition-all duration-200 select-none ' +
  'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: CommonProps & ComponentProps<'button'>) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  href,
  ...props
}: CommonProps & { href: string } & Omit<ComponentProps<typeof Link>, 'href'>) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon-only control with an accessible label. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'icon',
  className,
  ...props
}: CommonProps & ComponentProps<'button'> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={buttonClass(variant, size, className)} {...props} />
  );
}
