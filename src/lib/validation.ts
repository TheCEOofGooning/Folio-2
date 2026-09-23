/**
 * Input validation.
 *
 * Plain functions returning discriminated results — no schema library, because
 * there are exactly three shapes to validate and a validator DSL would be more
 * code than the rules themselves. Every message is written to be shown to a
 * person, since that is where they end up.
 */
export interface FieldErrors {
  [field: string]: string | undefined;
}

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  errors: FieldErrors;
}

export class ValidationError extends Error {
  readonly errors: FieldErrors;
  constructor(errors: FieldErrors) {
    super(Object.values(errors)[0] ?? "Invalid input");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export function throwIfInvalid<T>(result: ValidationResult<T>): T {
  if (!result.ok || !result.data) throw new ValidationError(result.errors);
  return result.data;
}

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_]{1,22})[a-z0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const RESERVED_USERNAMES = new Set([
  "admin", "api", "about", "explore", "login", "logout", "signup", "signin",
  "settings", "dashboard", "write", "new", "edit", "search", "tags", "me", "u",
  "p", "static", "assets", "public", "system", "folio", "help", "support",
]);

export interface RegisterInput {
  email: string;
  username: string;
  displayName: string;
  password: string;
}

export function validateRegister(form: {
  email?: string;
  username?: string;
  displayName?: string;
  password?: string;
}): ValidationResult<RegisterInput> {
  const errors: FieldErrors = {};
  const email = (form.email ?? "").trim().toLowerCase();
  const username = (form.username ?? "").trim().toLowerCase();
  const displayName = (form.displayName ?? "").trim();
  const password = form.password ?? "";

  if (!email) errors.email = "An email address is required.";
  else if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = "That email address doesn't look right.";

  if (!username) errors.username = "Pick a username.";
  else if (username.length < 3) errors.username = "Usernames need at least 3 characters.";
  else if (username.length > 24) errors.username = "Usernames are limited to 24 characters.";
  else if (!USERNAME_PATTERN.test(username))
    errors.username = "Use letters, numbers and underscores — starting and ending with a letter or number.";
  else if (RESERVED_USERNAMES.has(username)) errors.username = `"${username}" is reserved. Try another.`;

  if (!displayName) errors.displayName = "A display name is required.";
  else if (displayName.length > 60) errors.displayName = "Display names are limited to 60 characters.";

  if (password.length < 8) errors.password = "Passwords need at least 8 characters.";
  else if (password.length > 200) errors.password = "That password is too long (200 characters max).";
  else if (/^(?:password|12345678|qwertyui)$/i.test(password)) errors.password = "Choose something less guessable.";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { email, username, displayName, password },
  };
}

export function validateLogin(form: { identifier?: string; password?: string }): ValidationResult<{
  identifier: string;
  password: string;
}> {
  const errors: FieldErrors = {};
  const identifier = (form.identifier ?? "").trim();
  const password = form.password ?? "";

  if (!identifier) errors.identifier = "Enter your email or username.";
  if (!password) errors.password = "Enter your password.";

  return { ok: Object.keys(errors).length === 0, errors, data: { identifier, password } };
}

export interface ProfileInput {
  displayName: string;
  bio: string;
  tagline: string;
  avatarUrl: string | null;
}

export function validateProfile(form: {
  displayName?: string;
  bio?: string;
  tagline?: string;
  avatarUrl?: string;
}): ValidationResult<ProfileInput> {
  const errors: FieldErrors = {};
  const displayName = (form.displayName ?? "").trim();
  const bio = (form.bio ?? "").trim();
  const tagline = (form.tagline ?? "").trim();
  const avatarUrlRaw = (form.avatarUrl ?? "").trim();

  if (!displayName) errors.displayName = "A display name is required.";
  else if (displayName.length > 60) errors.displayName = "Display names are limited to 60 characters.";

  if (bio.length > 400) errors.bio = "Bios are limited to 400 characters.";
  if (tagline.length > 120) errors.tagline = "Taglines are limited to 120 characters.";

  let avatarUrl: string | null = null;
  if (avatarUrlRaw) {
    if (!/^https:\/\/.+/i.test(avatarUrlRaw) && !avatarUrlRaw.startsWith("data:image/")) {
      errors.avatarUrl = "Avatar images must be an https:// URL or an uploaded image.";
    } else if (avatarUrlRaw.length > 500_000) {
      errors.avatarUrl = "That image is too large — try one under 400 KB.";
    } else {
      avatarUrl = avatarUrlRaw;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, data: { displayName, bio, tagline, avatarUrl } };
}

/**
 * Normalises a tag list from free-text input: lowercase, slug-shaped, deduped,
 * capped. Doing it in one place means the feed, the search index and the tag rail
 * can never disagree about what "Web Performance" is called.
 */
export function normalizeTags(input: string | string[] | null | undefined, limit = 5): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  const seen = new Set<string>();

  for (const tag of raw) {
    const normalized = tag
      .trim()
      .toLowerCase()
      .replace(/[#@]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24);
    if (normalized.length >= 2) seen.add(normalized);
    if (seen.size >= limit) break;
  }

  return [...seen];
}

/** Guards against absurd payloads reaching Postgres (and the response cache). */
export function clampText(input: unknown, max: number): string {
  return String(input ?? "").slice(0, max);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug);
}

/** Only https images and data URIs are stored; nothing can become a script URL. */
export function sanitizeImageUrl(input: unknown): string | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  if (value.startsWith("data:image/") && value.length < 900_000) return value;
  if (/^https:\/\/[^\s"'<>]+$/i.test(value) && value.length < 2048) return value;
  return null;
}
