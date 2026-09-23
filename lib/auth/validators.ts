/** lib/auth/validators.ts — input rules shared by the forms and the server actions. */

export const RESERVED_USERNAMES = new Set([
  'about',
  'admin',
  'api',
  'assets',
  'dashboard',
  'feed',
  'fonts',
  'home',
  'login',
  'me',
  'p',
  'register',
  'saved',
  'search',
  'settings',
  'signup',
  'static',
  'tags',
  'write',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value)) && value.length <= 254;
}

export function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (username.length < 3) return 'Usernames need at least 3 characters.';
  if (username.length > 20) return 'Usernames are limited to 20 characters.';
  if (!/^[a-z0-9_]+$/.test(username)) return 'Use letters, numbers and underscores only.';
  if (/^\d+$/.test(username)) return 'Usernames cannot be only numbers.';
  if (RESERVED_USERNAMES.has(username)) return 'That username is reserved.';
  return null;
}

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (name.length < 2) return 'Tell us what to call you (2 characters minimum).';
  if (name.length > 60) return 'Display names are limited to 60 characters.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) return 'Passwords need at least 8 characters.';
  if (value.length > 200) return 'Passwords are limited to 200 characters.';
  return null;
}

/** Derives a presentable name from an email so signup stays a two-field form. */
export function displayNameFromEmail(email: string): string {
  const handle = normalizeEmail(email).split('@')[0] ?? 'reader';
  const words = handle.split(/[._-]+/).filter(Boolean);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (name || 'Reader').slice(0, 60);
}

export function usernameFromEmail(email: string): string {
  const base = normalizeUsername(normalizeEmail(email).split('@')[0] ?? '');
  return base.length >= 3 ? base : `reader${base}`.slice(0, 20);
}
