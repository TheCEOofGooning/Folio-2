'use server';

/**
 * lib/actions/auth.ts — Server Actions for the credential forms.
 *
 * Server Actions rather than JSON endpoints because the forms then work
 * without any client-side fetch code: the browser posts, Next streams the
 * redirect. The interactive endpoints (claps, bookmarks, comments) stay as
 * route handlers because they need instant, optimistic responses.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginUser, registerUser } from '@/lib/auth';
import { issueSession, setSessionCookie } from '@/lib/auth/session';
import { rateLimitAuth } from '@/lib/utils/rate-limit';

export type AuthField = 'email' | 'username' | 'password';
export interface AuthFormState {
  error?: string;
  field?: AuthField;
  ok?: boolean;
}

async function guard(): Promise<AuthFormState | null> {
  const store = await headers();
  const ip = store.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limited = rateLimitAuth(ip);
  if (!limited.ok) {
    return { error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` };
  }
  return null;
}

export async function loginAction(_previous: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  const limited = await guard();
  if (limited) return limited;

  const result = await loginUser(
    { email: String(formData.get('email') ?? ''), password: String(formData.get('password') ?? '') },
    issueSession,
  );
  if (!result.ok) return { error: result.error, field: result.field };

  await setSessionCookie(result.cookie);
  const next = String(formData.get('next') ?? '/');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function registerAction(_previous: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  const limited = await guard();
  if (limited) return limited;

  const result = await registerUser(
    {
      email: String(formData.get('email') ?? ''),
      username: String(formData.get('username') ?? ''),
      displayName: String(formData.get('displayName') ?? ''),
      password: String(formData.get('password') ?? ''),
    },
    issueSession,
  );
  if (!result.ok) return { error: result.error, field: result.field };

  await setSessionCookie(result.cookie);
  redirect('/write?welcome=1');
}
