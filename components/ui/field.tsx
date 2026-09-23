import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

const CONTROL =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 ' +
  'transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 ' +
  'disabled:opacity-60';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'py-3 leading-relaxed', className)} {...props} />;
}

export function Label({ className, children, ...props }: ComponentProps<'label'>) {
  return (
    <label className={cn('mb-1.5 block text-[13px] font-medium text-muted', className)} {...props}>
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
