/**
 * Shared Neon HTTP client for the CLI scripts (db:push, db:seed).
 *
 * This mirrors `src/db/driver.ts` — the scripts are plain .mjs so they run with
 * `node` alone (no ts-node, no build step, no extra dependency), and they speak
 * the same protocol as the application.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/** `ep-x-pooler.us-east-2.aws.neon.tech` -> `api.us-east-2.aws.neon.tech` */
function toApiHost(hostname) {
  const dot = hostname.indexOf(".");
  return dot === -1 ? hostname : `api.${hostname.slice(dot + 1)}`;
}

/**
 * Neon's SQL-over-HTTP proxy is not on the database host - see the long note in
 * `src/db/driver.ts`, which this mirrors (the scripts are plain .mjs so they run
 * with node alone, no build step).
 */
export function resolveEndpoint(connectionString) {
  if (process.env.DATABASE_HTTP_ENDPOINT) return process.env.DATABASE_HTTP_ENDPOINT;
  const url = new URL(connectionString);
  if (LOCAL_HOSTS.has(url.hostname)) return `http://${url.host}/sql`;
  return `https://${toApiHost(url.hostname)}/sql`;
}

export function loadEnvFile(relativePath, { override = false } = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const contents = readFileSync(resolve(root, relativePath), "utf8");
    for (const line of contents.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!value) continue;
      if (override || !process.env[key]) process.env[key] = value;
    }
  } catch {
    /* file is optional */
  }
}

/** Loads `.env.local` then `.env`, without clobbering real environment vars. */
export function loadEnv() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

export function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "\n  ✗ DATABASE_URL is not set.\n" +
        "    Local:      run `npm run dev:db` and make sure .env.local is present\n" +
        "    Production: DATABASE_URL='postgres://…neon.tech/folio?sslmode=require' npm run db:push\n",
    );
    process.exit(1);
  }
  return url;
}

export async function query(text, params = []) {
  const url = connectionString();
  const response = await fetch(resolveEndpoint(url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": url,
      "Neon-Array-Mode": "true",
    },
    body: JSON.stringify({ query: text, params }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message ?? `HTTP ${response.status}`);
    error.code = payload.code;
    throw error;
  }

  const { fields = [], rows = [] } = payload;
  const objects = Array.isArray(rows[0])
    ? rows.map((tuple) => Object.fromEntries(fields.map((field, index) => [field.name, tuple[index]])))
    : rows;

  return { rows: objects, rowCount: payload.rowCount ?? objects.length };
}
