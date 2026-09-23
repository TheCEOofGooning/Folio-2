/**
 * lib/auth/index.ts — register / login / logout.
 *
 * These functions own the whole credential flow so that the Server Actions and
 * the JSON route handlers share one implementation and one set of error
 * messages. They never touch `next/headers`; the caller decides where the
 * returned cookie goes.
 */

import { findUserByEmail, findUserByUsername, createUser } from '@/lib/db/queries/users';
import type { SessionUser } from './session';
import { toSessionUser } from './session';
import { hashPassword, verifyPassword } from './password';
import {
  displayNameFromEmail,
  isValidEmail,
  normalizeEmail,
  normalizeUsername,
  usernameFromEmail,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from './validators';

export interface AuthSuccess {
  ok: true;
  cookie: string;
  user: SessionUser;
}
export interface AuthFailure {
  ok: false;
  error: string;
  field?: 'email' | 'username' | 'password';
}
export type AuthResult = AuthSuccess | AuthFailure;

export interface RegisterInput {
  email: string;
  username?: string;
  displayName?: string;
  password: string;
}

export async function registerUser(
  input: RegisterInput,
  issue: (userId: number) => Promise<string>,
): Promise<AuthResult> {
  const email = normalizeEmail(input.email ?? '');
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.', field: 'email' };

  const passwordError = validatePassword(input.password ?? '');
  if (passwordError) return { ok: false, error: passwordError, field: 'password' };

  const requested = normalizeUsername(input.username ?? usernameFromEmail(email));
  const usernameError = validateUsername(requested);
  if (usernameError) return { ok: false, error: usernameError, field: 'username' };

  const displayNameInput = input.displayName?.trim() || displayNameFromEmail(email);
  const displayNameError = validateDisplayName(displayNameInput);
  if (displayNameError) return { ok: false, error: displayNameError, field: 'username' };

  const [byEmail, byUsername] = await Promise.all([findUserByEmail(email), findUserByUsername(requested)]);
  if (byEmail) return { ok: false, error: 'An account already uses that email.', field: 'email' };
  if (byUsername) return { ok: false, error: 'That username is taken.', field: 'username' };

  // Hashing is the expensive step; everything after it is two fast queries.
  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    email,
    username: requested,
    displayName: displayNameInput,
    passwordHash,
  });

  const cookie = await issue(user.id);
  return { ok: true, cookie, user: toSessionUser(user) };
}

export async function loginUser(
  input: { email: string; password: string },
  issue: (userId: number) => Promise<string>,
): Promise<AuthResult> {
  const email = normalizeEmail(input.email ?? '');
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.', field: 'email' };
  if (!input.password) return { ok: false, error: 'Enter your password.', field: 'password' };

  const user = await findUserByEmail(email);
  if (!user) {
    // Spend the same time as a real verification so the endpoint cannot be
    // used to enumerate registered addresses.
    await verifyPassword(input.password, 'pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    return { ok: false, error: 'That email and password do not match.', field: 'email' };
  }

  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) return { ok: false, error: 'That email and password do not match.', field: 'email' };

  const cookie = await issue(user.id);
  return { ok: true, cookie, user: toSessionUser(user) };
}
