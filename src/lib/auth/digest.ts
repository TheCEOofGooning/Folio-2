/**
 * Hash helpers built on `crypto.subtle`.
 *
 * Kept separate from `tokens.ts` so the digest utilities can be imported by
 * analytics/instrumentation code without pulling the session-signing module
 * (and its secret validation) along with it.
 */
const encoder = new TextEncoder();

export interface Digest {
  update(value: string): Digest;
  hex(): Promise<string>;
}

/** Streaming-ish SHA-256 helper: `await createHash().update("a").update("b").hex()`. */
export function createHash(): Digest {
  let buffer = "";
  const digest: Digest = {
    update(value: string) {
      buffer += value;
      return digest;
    },
    async hex() {
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(buffer)));
      let out = "";
      for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
      return out;
    },
  };
  return digest;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
