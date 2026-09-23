import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Create your account' };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/');

  return (
    <>
      <h1 className="font-serif text-3xl tracking-tight text-ink">Start writing</h1>
      <p className="mb-7 mt-1.5 text-sm text-muted">
        Ten seconds to an account. No card, no trial, no newsletter you did not ask for.
      </p>
      <AuthForm mode="register" />
    </>
  );
}
