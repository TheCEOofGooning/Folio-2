'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { loginAction, registerAction, type AuthFormState } from '@/lib/actions/auth';
import { AlertIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

export function AuthForm({ mode, next = '/' }: { mode: 'login' | 'register'; next?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState | null, FormData>(
    mode === 'login' ? loginAction : registerAction,
    null,
  );
  const isRegister = mode === 'register';
  const errorFor = (field: string) => (state?.field === field ? state.error : undefined);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <AnimatePresence>
        {state?.error && !state.field ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400"
          >
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            {state.error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Field label="Email" error={errorFor('email')}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className={cn(state?.field === 'email' && 'border-red-500/60')}
        />
      </Field>

      {isRegister ? (
        <Field label="Username" hint="Your profile lives at folio.dev/username" error={errorFor('username')}>
          <Input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
            placeholder="ada"
            className={cn(state?.field === 'username' && 'border-red-500/60')}
          />
        </Field>
      ) : null}

      <Field
        label="Password"
        error={errorFor('password')}
        hint={isRegister ? 'At least 8 characters. Hashed with PBKDF2-SHA256.' : undefined}
      >
        <Input
          type="password"
          name="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          minLength={8}
          placeholder="••••••••"
          className={cn(state?.field === 'password' && 'border-red-500/60')}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="w-full justify-center">
        {pending ? <Spinner /> : null}
        {isRegister ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted">
        {isRegister ? 'Already writing on Folio?' : 'New here?'}{' '}
        <Link href={isRegister ? '/login' : '/register'} className="text-accent hover:underline">
          {isRegister ? 'Sign in' : 'Create a free account'}
        </Link>
      </p>
    </form>
  );
}
