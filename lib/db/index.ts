/**
 * lib/db/index.ts — the whole database layer, in one place.
 *
 * There is no ORM and no query builder. `db.query(sql, params)` sends the
 * statement straight to Neon's SQL-over-HTTP endpoint, which means:
 *
 *   • one HTTP request per statement, no TCP handshake, no connection pool to
 *     exhaust — ideal for Vercel's short-lived, highly concurrent functions;
 *   • a ~40 kB dependency instead of a code-generated client;
 *   • zero cold-start work: the driver is a `fetch` wrapper.
 *
 * When `DATABASE_URL` is absent the identical SQL is executed by the in-memory
 * engine in `./memory.ts`, so the app runs anywhere.
 */

import { neon } from '@neondatabase/serverless';
import { memoryDb } from './engine';
import { seedMemoryDatabase } from './seed-memory';
import type { Db, Field, Param, QueryFn, QueryOptions, QueryResult, TransactionFn } from './types';
import { OID } from './types';

export * from './types';

const TIMESTAMPS = new Set<number>([OID.timestamptz, OID.timestamp, OID.date]);
const NUMBERS = new Set<number>([OID.int2, OID.int4, OID.int8, OID.float8, OID.numeric]);

/**
 * Neon returns JSON, so every column arrives as text. This is the only place
 * in the app that knows about Postgres type OIDs; everything downstream sees
 * `Date`, `number` and `boolean`.
 */
export function normalizeRows<Row>(rows: Record<string, unknown>[], fields: Field[]): Row[] {
  if (fields.length === 0) return rows as Row[];
  const casts = new Map<string, number>();
  for (const f of fields) casts.set(f.name, f.dataTypeID);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = castValue(value, casts.get(key));
    }
    return out as Row;
  });
}

function castValue(value: unknown, oid: number | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (oid === undefined) return value;
  if (TIMESTAMPS.has(oid)) return value instanceof Date ? value : new Date(String(value));
  if (NUMBERS.has(oid)) return typeof value === 'number' ? value : Number(value);
  if (oid === OID.bool) return typeof value === 'boolean' ? value : value === 't' || value === true;
  if (oid === OID.int8Array) return Array.isArray(value) ? value.map(Number) : value;
  return value;
}

function createNeonDb(url: string): Db {
  // `neon()` returns a tagged-template function; we only ever use `.query()`
  // and `.transaction()` so the SQL stays explicit and greppable.
  const http = neon(url, { fetchOptions: { cache: 'no-store' } });

  const query: QueryFn = async <T>(text: string, params: Param[] = [], options?: QueryOptions) => {
    const result = (await http.query(text, params as unknown[], {
      fullResults: true,
      fetchOptions: { cache: 'no-store', signal: options?.signal },
    })) as unknown as QueryResult;
    return normalizeRows<T>(result.rows, result.fields);
  };

  const transaction: TransactionFn = async <T>(statements: { text: string; params?: Param[] }[]) => {
    // Neon resolves a transaction with one result per statement, so the rows we
    // care about always come from the LAST statement in the batch.
    const result = (await http.transaction(
      // `transaction()` takes lazy query promises, not plain objects — each one
      // is a statement in the same non-interactive Postgres transaction.
      statements.map((statement) => http.query(statement.text, (statement.params ?? []) as unknown[])),
      { fullResults: true },
    )) as unknown;
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    const typed = last as QueryResult;
    return normalizeRows<T>(typed?.rows ?? [], typed?.fields ?? []);
  };

  return { query, transaction, driver: 'neon' };
}

function createMemoryDb(): Db {
  const normalize = <T>(result: QueryResult): T[] =>
    result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        out[key] = castValue(value, result.fields.find((f) => f.name === key)?.dataTypeID);
      }
      return out as T;
    });

  const query: QueryFn = async <T>(text: string, params: Param[] = []) => normalize<T>(memoryDb.query(text, params));

  const transaction: TransactionFn = async <T>(statements: { text: string; params?: Param[] }[]) =>
    normalize<T>(memoryDb.transaction(statements));

  return { query, transaction, driver: 'memory' };
}

let instance: Db | null = null;

export function getDb(): Db {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (url) {
    instance = createNeonDb(url);
  } else {
    // No connection string: run the identical SQL against the in-memory engine
    // and load demo content so the app is immediately usable. Tests opt out
    // with FOLIO_NO_SEED=1 so they start from a known-empty database.
    if (process.env.FOLIO_NO_SEED !== '1') seedMemoryDatabase();
    instance = createMemoryDb();
  }
  return instance;
}

/** True when the app is running against Neon. */
export function isLiveDatabase(): boolean {
  return getDb().driver === 'neon';
}

/** The only two functions the rest of the codebase imports. */
export const query: QueryFn = (text, params, options) => getDb().query(text, params, options);
export const transaction: TransactionFn = (statements) => getDb().transaction(statements);

/* --------------------------------------------------------------- helpers */

/** First row, or `null`. */
export async function queryOne<T>(text: string, params?: Param[], options?: QueryOptions): Promise<T | null> {
  const rows = await query<T>(text, params, options);
  return rows[0] ?? null;
}

/** First row, or throws — for lookups that must exist (404 otherwise). */
export async function queryRequired<T>(text: string, params?: Param[], options?: QueryOptions): Promise<T> {
  const row = await queryOne<T>(text, params, options);
  if (!row) throw new Error('db: expected exactly one row');
  return row;
}

/** A single scalar column from a single row. */
export async function queryValue<T = number>(text: string, params?: Param[]): Promise<T | null> {
  const row = await queryOne<Record<string, T>>(text, params);
  if (!row) return null;
  const [value] = Object.values(row);
  return value ?? null;
}

/** Expands to `$1, $2, … $n` for `IN (...)` lists. */
export function placeholders(count: number, offset = 0): string {
  if (count === 0) return 'null';
  return Array.from({ length: count }, (_, i) => `$${i + 1 + offset}`).join(', ');
}
