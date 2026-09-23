/**
 * lib/auth/crypto.ts — Web Crypto primitives.
 *
 * Folio ships no auth library. Everything security-critical is built on the
 * `crypto.subtle` API that browsers, Node 20+ and the Vercel Edge runtime all
 * provide natively, which keeps ~200 kB of auth dependencies out of the bundle
 * and removes a whole class of supply-chain risk.
 */

const encoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding — URL/cookie safe, and no Buffer dependency. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
  }
  return out;
}

export function fromBase64Url(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = B64URL.indexOf(char);
    if (value === -1) throw new Error('crypto: invalid base64url input');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return new Uint8Array(digest);
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await sha256(input));
}

export async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

export async function hmacSha256Base64Url(secret: string, data: string): Promise<string> {
  return toBase64Url(await hmacSha256(secret, data));
}

/** Length-independent constant-time comparison for MACs and password hashes. */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const left = typeof a === 'string' ? encoder.encode(a) : a;
  const right = typeof b === 'string' ? encoder.encode(b) : b;
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/**
 * PBKDF2-HMAC-SHA256. Argon2 would be stronger but is not available in the Web
 * Crypto API, and reaching for a native module would defeat the point of an
 * edge-ready, dependency-free auth layer. 210k iterations is the current OWASP
 * recommendation for this construction.
 */
export async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    keyLengthBytes * 8,
  );
  return new Uint8Array(bits);
}
