import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DashboardNav } from '@/components/dashboard-nav';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

/** Auth boundary for the whole creator suite. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">Your studio</h1>
        <p className="mt-1.5 text-muted">Analytics, drafts and everything you have published.</p>
      </header>
      <DashboardNav />
      <div className="mt-8">{children}</div>
    </div>
  );
}
