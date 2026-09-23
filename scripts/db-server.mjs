/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Folio local database — PGlite exposing Neon's SQL-over-HTTP protocol
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  `npm run dev:db`
 *
 *  Why this exists
 *  ---------------
 *  Folio talks to Postgres exclusively through Neon's HTTP endpoint
 *  (`POST https://<host>/sql`). That is what keeps the backend dependency-free
 *  and Edge-ready — but it means there is no `pg` client to point at a local
 *  Postgres. Rather than maintain two drivers, this sidecar implements the same
 *  wire protocol on top of PGlite (real Postgres 17 compiled to WASM).
 *
 *  Result: `npm run dev` on a laptop exercises byte-for-byte the same driver,
 *  the same SQL and the same parameter binding as production on Vercel + Neon.
 *  Schema is applied automatically on boot, so a fresh clone needs two commands:
 *
 *      npm install
 *      npm run dev        # (in another terminal: npm run dev:db && npm run db:seed)
 *
 *  ⚠ Local development only. On Vercel you point DATABASE_URL at Neon and this
 *  file is never loaded — it lives under /scripts and is excluded from the build.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { splitStatements } from "./sql-split.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".data", "folio");
const SCHEMA_FILE = join(ROOT, "src", "db", "schema.sql");

const PORT = Number(process.env.FOLIO_DB_PORT ?? 5433);
const HOST = process.env.FOLIO_DB_HOST ?? "0.0.0.0";
const MAX_BODY_BYTES = 8 * 1024 * 1024;

mkdirSync(DATA_DIR, { recursive: true });

console.log(`\n  \x1b[2mfolio\x1b[0m · local postgres (pglite/wasm)`);
console.log(`  \x1b[2mdata dir\x1b[0m  ${DATA_DIR}`);

const db = new PGlite(DATA_DIR);
await db.waitReady;

// ── Schema bootstrap (idempotent — every statement is `if not exists`) ────────
const schema = readFileSync(SCHEMA_FILE, "utf8");
const statements = splitStatements(schema);
for (const statement of statements) {
  try {
    await db.exec(statement);
  } catch (error) {
    console.error(`  ✗ schema statement failed:\n${statement.slice(0, 160)}…\n`, error.message);
    process.exit(1);
  }
}
console.log(`  \x1b[2mschema\x1b[0m    ${statements.length} statements applied`);

const [{ version }] = (await db.query("select version() as version")).rows;

// ── Neon-compatible HTTP surface ──────────────────────────────────────────────
function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Mirrors Neon's response contract:
 *   { command, fields: [{name, dataTypeID}], rows, rowCount }
 * `rows` items are objects here; the Folio driver accepts both object and
 * array row shapes, so the sidecar stays simple.
 */
async function handleQuery(text, params) {
  const queryText = typeof text === "string" ? text.trim() : "";
  if (!queryText) throw new Error("Empty query");
  const values = Array.isArray(params) ? params : [];

  const started = process.hrtime.bigint();
  const result = await db.query(queryText, values);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const command = (/^\s*(\w+)/.exec(queryText)?.[1] ?? "select").toUpperCase();
  const rows = result.rows ?? [];

  if (process.env.FOLIO_DB_LOG === "1") {
    const compact = queryText.replace(/\s+/g, " ").slice(0, 110);
    console.log(`  \x1b[2m${elapsedMs.toFixed(1)}ms\x1b[0m ${command} ${rows.length}r · ${compact}`);
  }

  return {
    command,
    fields: (result.fields ?? []).map((field) => ({
      name: field.name,
      dataTypeID: field.dataTypeID,
    })),
    rows,
    rowCount: rows.length > 0 ? rows.length : (result.affectedRows ?? 0),
  };
}

function postgresError(error) {
  return {
    message: error?.message ?? "Query failed",
    code: error?.code,
    detail: error?.detail,
    hint: error?.hint,
    severity: "ERROR",
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return send(response, 200, {
      ok: true,
      engine: "pglite",
      version,
      dataDir: DATA_DIR,
      protocol: "neon-sql-over-http",
    });
  }

  if (request.method !== "POST" || url.pathname !== "/sql") {
    return send(response, 404, { message: `No route for ${request.method} ${url.pathname}` });
  }

  // Neon authenticates via this header; locally we only use it to sanity-check
  // that the app is pointed at the sidecar rather than a real database.
  const connectionString = request.headers["neon-connection-string"];
  if (connectionString && !/127\.0\.0\.1|localhost/.test(String(connectionString))) {
    return send(response, 400, {
      message:
        "This sidecar only serves DATABASE_URL values pointing at 127.0.0.1. Use Neon for remote databases.",
    });
  }

  try {
    const raw = await readBody(request);
    const payload = raw ? JSON.parse(raw) : {};
    const batches = Array.isArray(payload) ? payload : [{ ...payload }];

    if (batches.length === 1 && !Array.isArray(payload)) {
      return send(response, 200, await handleQuery(payload.query, payload.params));
    }

    // Array body → [ { query, params, rowMode } ] — only SELECTs are allowed in a
    // multi-statement batch, which keeps this sidecar honest about statelessness.
    const results = [];
    for (const batch of batches) {
      const statement = String(batch.query ?? "").trim();
      if (!/^(select|with)\b/i.test(statement)) {
        throw new Error("Batched requests may only contain SELECT/WITH statements");
      }
      results.push(await handleQuery(statement, batch.params));
    }
    return send(response, 200, results);
  } catch (error) {
    return send(response, 400, postgresError(error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`  \x1b[2mlistening\x1b[0m  ${HOST}:${PORT}`);
  console.log(`  \x1b[2mendpoint\x1b[0m   http://127.0.0.1:${PORT}/sql`);
  console.log(
    `\n  \x1b[32m✓\x1b[0m DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/folio"\n`,
  );
  console.log(`  next: \x1b[1mnpm run db:seed\x1b[0m (demo content) then \x1b[1mnpm run dev\x1b[0m\n`);
});

const shutdown = async () => {
  console.log("\n  \x1b[2mclosing local database…\x1b[0m");
  server.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!existsSync(SCHEMA_FILE)) {
  console.warn("  ⚠ schema.sql missing — skipping bootstrap");
}
