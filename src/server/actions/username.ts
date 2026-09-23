"use server";

/**
 * Live username availability.
 *
 * Deliberately cheap: one indexed `exists()` against `users_username_key`, called
 * on a 420 ms debounce from the signup form. It is a courtesy check only — the
 * unique index remains the arbiter, so a race between two signups still resolves
 * correctly (the register action reports the conflict).
 */
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { isUsernameTaken } from "@/db/queries/users";

const RESERVED = new Set([
  "admin", "api", "about", "explore", "login", "logout", "signup", "signin",
  "settings", "dashboard", "write", "new", "edit", "search", "tags", "me", "u",
  "p", "static", "assets", "public", "system", "folio", "help", "support",
]);

export async function checkUsernameAction(
  username: string,
): Promise<{ ok: boolean; available: boolean; reason?: string }> {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Bounded so this endpoint cannot be used to enumerate usernames at speed.
  const gate = rateLimit(`username:${ip}`, 40, 60);
  if (!gate.allowed) return { ok: false, available: false, reason: "Too many checks — slow down." };

  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_]{1,22})[a-z0-9]$/.test(normalized)) {
    return { ok: false, available: false, reason: "invalid" };
  }
  if (RESERVED.has(normalized)) {
    return { ok: false, available: false, reason: "reserved" };
  }

  try {
    const taken = await isUsernameTaken(normalized);
    return { ok: true, available: !taken };
  } catch {
    // Never block a signup on a failed lookup — the insert will decide.
    return { ok: true, available: true };
  }
}
