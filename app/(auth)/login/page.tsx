import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect('/');

  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight text-ink">Welcome back</h1>
      <p className="mb-7 mt-1.5 text-sm text-muted">Pick up where you left off.</p>
      {/* `//host` would be an open redirect, so only same-origin paths are honoured. */}
      <AuthForm mode="login" next={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} />
    </>
  );
}
