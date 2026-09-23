/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Folio · Neon SQL-over-HTTP driver — zero dependencies, Edge-compatible
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Why hand-rolled instead of `@neondatabase/serverless`?
 *  ------------------------------------------------------
 *  Neon exposes its database over plain HTTPS: `POST https://<host>/sql` with a
 *  JSON body `{ query, params }` and the connection string in a header. That is
 *  the entire protocol. The official package is excellent, but it exists mostly
 *  to *emulate* node-postgres (pools, WebSockets, `Client#connect`, type parsers
 *  for `pg` compatibility) — none of which Folio needs.
 *
 *  Rolling the ~120 lines here means:
 *    • no `pg`, no `pg-types`, no `ws` — nothing in the server bundle that isn't
 *      native `fetch`
 *    • works unchanged on Vercel's Edge, Node and Lambda runtimes
 *    • no cold-start cost beyond parsing this module
 *    • one `fetch` per query: no TCP handshake, no TLS negotiation, no pool to
 *      exhaust — PgBouncer terminates on Neon's side and the request is stateless
 *
 *  The same module talks to the local PGlite sidecar (`npm run dev:db`) because
 *  that sidecar implements this exact protocol — so dev and prod share one path.
 */

/** Values the driver knows how to send as bind parameters. */
export type SqlParam = string | number | boolean | null | Date;

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
  /** `SELECT`, `INSERT`, `UPDATE`, `DELETE`, … as reported by Postgres. */
  command: string;
}

/** Postgres error surface, preserved so callers can react to `23505` etc. */
export class DatabaseError extends Error {
  readonly code: string | undefined;
  readonly detail: string | undefined;
  readonly hint: string | undefined;
  readonly status: number;

  constructor(message: string, status: number, fields: Partial<DatabaseError> = {}) {
    super(message);
    this.name = "DatabaseError";
    this.status = status;
    this.code = fields.code;
    this.detail = fields.detail;
    this.hint = fields.hint;
  }

  /** True for `unique_violation` — how Folio detects "username taken". */
  get isUniqueViolation() {
    return this.code === "23505";
  }
}

export interface DriverOptions {
  /** Neon (or Postgres) connection string. Defaults to `DATABASE_URL`. */
  connectionString?: string;
  /** Override for self-hosted Neon proxies / NeON-compatible gateways. */
  endpoint?: string;
  /** Abort a query after this many ms. Serverless functions are not free. */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/**
 * `ep-cool-name-pooler.us-east-2.aws.neon.tech` -> `api.us-east-2.aws.neon.tech`
 *
 * Swapping the first hostname label for `api.` is how Neon's SQL-over-HTTP proxy
 * is addressed, and it is what `@neondatabase/serverless` does in its default
 * `fetchEndpoint` (checked against the package source, not the prose docs).
 * Written as an index scan rather than a regex so there is no escaping to get
 * wrong when the file is edited by tooling.
 */
function toApiHost(hostname: string): string {
  const dot = hostname.indexOf(".");
  return dot === -1 ? hostname : `api.${hostname.slice(dot + 1)}`;
}

/**
 * `postgres://user:pw@host/db?params` -> the SQL-over-HTTP endpoint.
 *
 * Neon does **not** serve the SQL endpoint on your database host: posting there
 * gets a 404 from Neon's edge. It lives on the region API host (see `toApiHost`),
 * so the compute label is discarded. Pooled and direct connection strings resolve
 * to the same API host, because pooling is chosen by the string we send in the
 * `Neon-Connection-String` header, not by the URL we POST to.
 *
 * This is the one thing local development cannot verify: the dev sidecar is our
 * own code and accepts whatever endpoint this returns, so the transform is
 * asserted against real Neon URL shapes in `scripts/smoke.mjs`.
 *
 * Localhost keeps its raw host for the bundled PGlite sidecar, and
 * `DATABASE_HTTP_ENDPOINT` overrides everything for Neon-compatible gateways
 * (Layerbase, PlanetScale, self-hosted proxies) that do route /sql on the database
 * host itself.
 */
export function resolveEndpoint(connectionString: string): string {
  const url = new URL(connectionString);
  if (LOCAL_HOSTS.has(url.hostname)) return `http://${url.host}/sql`;
  return `https://${toApiHost(url.hostname)}/sql`;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

/** JSON-safe parameter encoding. `Date` → ISO string, which Postgres casts. */
function serializeParam(value: SqlParam): string | number | boolean | null {
  if (value instanceof Date) return value.toISOString();
  if (value === null) return null;
  return value;
}

interface RawResponse {
  command?: string;
  fields?: { name: string; dataTypeID?: number }[];
  rows?: unknown[] | unknown[][];
  rowCount?: number;
  // Error shape
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
}

/**
 * Normalises the two row shapes Neon may return (array-mode and object-mode)
 * into plain objects. Array mode is requested because it is meaningfully smaller
 * on the wire for wide result sets (no repeated column names).
 */
function toObjects(raw: RawResponse): Record<string, unknown>[] {
  const { rows = [], fields = [] } = raw;
  if (rows.length === 0) return [];
  if (Array.isArray(rows[0])) {
    return (rows as unknown[][]).map((tuple) => {
      const object: Record<string, unknown> = {};
      for (let i = 0; i < fields.length; i += 1) object[fields[i].name] = tuple[i];
      return object;
    });
  }
  return rows as Record<string, unknown>[];
}

export class SqlDriver {
  private readonly connectionString: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DriverOptions = {}) {
    const connectionString = options.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new DatabaseError(
        "DATABASE_URL is not set. " +
          "On Vercel: add it under Project > Settings > Environment Variables (the pooled Neon " +
          "connection string) and then REDEPLOY — variables only apply to new deployments. " +
          "Locally: run `npm run dev:db`, or copy `.env.example` to `.env.local`. " +
          "This build stops here on purpose: deploying without a database would produce a site " +
          "that errors on every page.",
        0,
      );
    }
    this.connectionString = connectionString;
    this.endpoint =
      options.endpoint ?? process.env.DATABASE_HTTP_ENDPOINT ?? resolveEndpoint(connectionString);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async query<Row = Record<string, unknown>>(
    text: string,
    params: SqlParam[] = [],
  ): Promise<QueryResult<Row>> {
    const body = JSON.stringify({
      query: text,
      params: params.map(serializeParam),
    });

    // One retry, only for gateway-level failures (429/503): those responses are
    // emitted before Postgres executes anything, so a retry cannot double-write.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Neon's auth + routing header. Also how the dev sidecar picks a database.
            // The connection string decides pooling (the `-pooler` host), so the
            // same string is reused here verbatim.
            "Neon-Connection-String": this.connectionString,
            // Positional tuples instead of keyed objects: measurably smaller on the
            // wire for wide result sets. `toObjects` re-keys them from `fields`.
            "Neon-Array-Mode": "true",
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
          // Deliberately no `cache: "no-store"` here.
          //
          // Next.js inspects `fetch` options during static generation, and an
          // explicit `no-store` is a signal to opt the *whole route* out of static
          // rendering ("Dynamic server usage" at build time). That would defeat
          // ISR for every page, so the pragma would be self-defeating.
          //
          // It is also unnecessary: Next only caches GET requests, and a query is
          // always a POST. Nothing about this call is cacheable at the HTTP layer —
          // Folio's caching decisions are made explicitly, one level up, in
          // `db/cached.ts` where they can be tagged and invalidated.
        });

        if (response.ok) {
          const payload = (await response.json()) as RawResponse;
          const rows = toObjects(payload) as Row[];
          return {
            rows,
            rowCount: payload.rowCount ?? rows.length,
            command: (payload.command ?? "SELECT").toUpperCase(),
          };
        }

        if ((response.status === 429 || response.status === 503) && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180));
          continue;
        }

        const payload = (await response.json().catch(() => ({}))) as RawResponse;
        // Server-side only: the failing SQL is the fastest route to a fix, and
        // bind parameters are deliberately excluded from the log.
        console.error(
          `[folio/db] ${payload.message ?? `HTTP ${response.status}`}\n${text.replace(/\s+/g, " ").slice(0, 600)}`,
        );
        throw new DatabaseError(
          payload.message ?? `Database request failed with HTTP ${response.status}`,
          response.status,
          payload,
        );
      } catch (error) {
        lastError = error;
        if (error instanceof DatabaseError) throw error;
        if (attempt === 0) continue;
        throw new DatabaseError(
          error instanceof Error ? error.message : "Unknown database transport failure",
          0,
        );
      }
    }
    throw lastError;
  }

  /** Convenience for scripts: run several statements without bind parameters. */
  async exec(sql: string): Promise<void> {
    await this.query(sql);
  }
}

/** Process-wide singleton — one driver per runtime, zero state on the hot path. */
let cached: SqlDriver | undefined;

export function getDriver(): SqlDriver {
  if (!cached) cached = new SqlDriver();
  return cached;
}

export function driverFor(options: DriverOptions): SqlDriver {
  return new SqlDriver(options);
}

export { describe as describeParam };
