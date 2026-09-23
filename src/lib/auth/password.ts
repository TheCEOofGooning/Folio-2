/**
 * Password hashing — Web Crypto PBKDF2-SHA256, no third-party dependency.
 *
 * Why PBKDF2 and not bcrypt/argon2?
 * ---------------------------------
 * • It is the only password KDF available *natively* in both Node and Vercel's
 *   Edge runtime (`crypto.subtle.deriveBits`). bcrypt/argon2 need native
 *   binaries or WASM, which is exactly the weight Folio exists to avoid.
 * • 210,000 iterations is the OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
 *   and costs ~80–120 ms on serverless hardware — cheap for one login, and
 *   roughly four orders of magnitude too expensive for an offline cracker.
 *
 * Stored format (self-describing so it can be upgraded without a schema change):
 *
 *     pbkdf2$sha256$210000$<salt-b64url>$<hash-b64url>
 */
const ALGORITHM = "PBKDF2";
const HASH = "SHA-256";
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

// ── base64url without Buffer (Edge-compatible) ────────────────────────────────
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt: salt as unknown as BufferSource, iterations, hash: HASH },
    keyMaterial,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$${HASH.toLowerCase()}$${ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

/**
 * Constant-time comparison — never short-circuits, so response time cannot leak
 * how many leading bytes of the hash were correct.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, hashName, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
  if (scheme !== "pbkdf2" || hashName?.toLowerCase() !== "sha256" || !saltRaw || !hashRaw) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;

  try {
    const expected = base64UrlToBytes(hashRaw);
    const actual = await deriveBits(password, base64UrlToBytes(saltRaw), iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash uses parameters we no longer consider strong enough. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return true;
  const iterations = Number(stored.split("$")[2]);
  return !Number.isFinite(iterations) || iterations < ITERATIONS;
}
