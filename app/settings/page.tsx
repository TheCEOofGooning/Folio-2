import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/profile-form';
import { getCurrentUser } from '@/lib/auth/session';
import { findUserById } from '@/lib/db/queries/users';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

export default async function SettingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect('/login?next=/settings');

  const user = await findUserById(session.id);
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-3xl tracking-tight text-ink">Your profile</h1>
      <p className="mb-8 mt-1.5 text-muted">This is what readers see next to your stories.</p>
      <ProfileForm
        defaultValues={{
          displayName: user.display_name,
          bio: user.bio ?? '',
          location: user.location ?? '',
          avatarUrl: user.avatar_url ?? '',
          username: user.username,
        }}
      />
    </div>
  );
}
