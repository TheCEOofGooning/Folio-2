/**
 * Session tokens — stateless HMAC signature + a database row for revocation.
 *
 * Token shape (all base64url, dot-separated):
 *
 *     v1.<payload>.<signature>
 *     payload = { sid: <session row id>, uid: <user id>, exp: <unix seconds> }
 *
 * The cookie is `httpOnly`, `sameSite=lax` and `secure` in production, so it is
 * invisible to JavaScript and never crosses a cross-site request. Because the
 * payload carries a session-row id, deleting the row revokes the cookie instantly
 * ("sign out everywhere", password change) without rotating the server secret.
 *
 * HMAC-SHA256 via `crypto.subtle` — no `jsonwebtoken`, no `jose`, ~30 lines.
 */
import { sha256Hex } from "./digest";

export const SESSION_COOKIE = "folio_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  /** Session row id — the revocation handle. */
  sid: string;
  /** User id. */
  uid: string;
  /** Expiry, unix seconds. */
  exp: number;
}

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToText(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
}

function base64UrlToBytes(value: string): Uint8Array {
  const binary = base64UrlToText(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The signing secret. In production this must be set explicitly; locally we fall
 * back to a deterministic dev secret so sessions survive a `next dev` restart.
 */
let cachedKey: Promise<CryptoKey> | undefined;

function getSecret(): string {
  const secret = process.env.FOLIO_SESSION_SECRET;
  if (secret && secret.length >= 24) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FOLIO_SESSION_SECRET is missing or too short. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
  }
  return `folio-dev-secret::${process.env.DATABASE_URL ?? "no-database"}::do-not-ship`;
}

function getKey(): Promise<CryptoKey> {
  cachedKey ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getKey();
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`v1.${body}`) as unknown as BufferSource),
  );
  return `v1.${body}.${bytesToBase64Url(signature)}`;
}

async function timingSafeEqual(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const [, body, signatureRaw] = parts;
  try {
    const key = await getKey();
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(`v1.${body}`) as unknown as BufferSource),
    );
    if (!(await timingSafeEqual(expected, base64UrlToBytes(signatureRaw)))) return null;

    const payload = JSON.parse(base64UrlToText(body)) as SessionPayload;
    if (
      typeof payload?.sid !== "string" ||
      typeof payload?.uid !== "string" ||
      typeof payload?.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Stable, non-reversible reader identifier for analytics.
 *
 * `post_views` counts *readers*, not page loads, so we need a key that is stable
 * for a device and instant. It is derived from IP + user agent + the site secret
 * — no cookie, no fingerprinting library, and it cannot be reversed into an IP.
 * Rotating the secret resets reader counts, which is the intended privacy lever.
 */
export async function viewerHash(ip: string, userAgent: string, userId?: string | null): Promise<string> {
  const material = [
    ip || "0.0.0.0",
    userAgent.slice(0, 180),
    userId ?? "anon",
    getSecret(),
  ].join("|");
  return sha256Hex(material);
}
