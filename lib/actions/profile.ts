'use server';

/** lib/actions/profile.ts — profile customisation. */

import { revalidatePath } from 'next/cache';
import { readSessionUserId } from '@/lib/auth/session';
import { updateUserProfile } from '@/lib/db/queries/users';
import { validateDisplayName } from '@/lib/auth/validators';

export interface ProfileFormState {
  ok?: boolean;
  error?: string;
  field?: 'displayName' | 'bio' | 'location' | 'avatarUrl';
}

export async function updateProfileAction(
  _previous: ProfileFormState | null,
  formData: FormData,
): Promise<ProfileFormState> {
  const userId = await readSessionUserId();
  if (!userId) return { error: 'Your session expired — sign in again.' };

  const displayName = String(formData.get('displayName') ?? '').trim();
  const nameError = validateDisplayName(displayName);
  if (nameError) return { error: nameError, field: 'displayName' };

  const bio = String(formData.get('bio') ?? '').trim().slice(0, 280) || null;
  const location = String(formData.get('location') ?? '').trim().slice(0, 60) || null;
  const avatarUrl = String(formData.get('avatarUrl') ?? '').trim() || null;

  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
    return { error: 'Avatar must be an http(s) URL.', field: 'avatarUrl' };
  }

  const updated = await updateUserProfile(userId, { displayName, bio, location, avatarUrl });
  if (!updated) return { error: 'Could not save your profile.' };

  revalidatePath(`/${updated.username}`);
  revalidatePath('/dashboard');
  return { ok: true };
}
