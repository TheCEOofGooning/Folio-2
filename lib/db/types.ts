/**
 * Neon's SQL-over-HTTP endpoint answers with JSON. This module defines the
 * shape of that answer once, so the rest of the app never has to know whether
 * a row came from `fetch()` against Neon or from the in-memory engine.
 */

/** One column of a result set, mirroring Neon's `fields` array. */
export interface Field {
  /**
   * Postgres type OID of the column. We only ever branch on the handful of
   * types Folio stores, so a numeric OID is enough.
   */
  dataTypeID: number;
  name: string;
}

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  fields: Field[];
  rowCount: number;
  command: string;
}

/** Anything the app hands to a statement as a `$n` parameter. */
export type Param = string | number | boolean | null | Date | (string | number)[];

export interface QueryOptions {
  /** Abort an in-flight HTTP query (used for request timeouts). */
  signal?: AbortSignal;
}

/**
 * The single entry point every query in Folio goes through.
 *
 * Rows are normalised: `timestamptz` columns arrive as `Date`, `bigint`/
 * `numeric` arrive as `number`, `text[]` arrives as `string[]`.
 */
export type QueryFn = <T = Record<string, unknown>>(
  text: string,
  params?: Param[],
  options?: QueryOptions,
) => Promise<T[]>;

export interface TransactionFn {
  /** Runs `statements` as one non-interactive Neon transaction. */
  <T = Record<string, unknown>>(statements: { text: string; params?: Param[] }[]): Promise<T[]>;
}

export interface Db {
  query: QueryFn;
  transaction: TransactionFn;
  /** `neon` in production, `memory` when no DATABASE_URL is configured. */
  driver: 'neon' | 'memory';
}

/** Postgres type OIDs Folio actually branches on. */
export const OID = {
  bool: 16,
  int8: 20,
  int2: 21,
  int4: 23,
  text: 25,
  float8: 701,
  numeric: 1700,
  timestamptz: 1184,
  timestamp: 1114,
  date: 1082,
  tsvector: 3614,
  textArray: 1009,
  int8Array: 1016,
} as const;
