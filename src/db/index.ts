/**
 * Folio's data layer entry point.
 *
 *   import { sql, one, many, maybe } from "@/db";
 *
 * `sql` is the tagged template; the helpers below just shape the result. There is
 * deliberately no `withTransaction`: Neon's HTTP endpoint is stateless (each call
 * may land on a different PgBouncer connection), so Folio performs multi-table
 * writes inside a single statement using data-modifying CTEs. See
 * `src/db/queries/social.ts` for the pattern — every counter update is atomic
 * with the row it counts, in one round trip.
 */
import { getDriver, DatabaseError, type QueryResult, type SqlParam } from "./driver";
import { sql } from "./sql";

export { sql };
export { DatabaseError };
export type { SqlParam };

/** First row, or `null`. */
export async function maybe<Row>(query: Promise<Row[]>): Promise<Row | null> {
  const rows = await query;
  return rows[0] ?? null;
}

/** First row, throwing when the row is required by contract. */
export async function one<Row>(query: Promise<Row[]>, context = "row"): Promise<Row> {
  const row = await maybe(query);
  if (!row) throw new DatabaseError(`Expected a ${context} but the query returned nothing`, 404);
  return row;
}

/** Alias that reads well at call sites: `many(sql\`select …\`)`. */
export function many<Row>(query: Promise<Row[]>): Promise<Row[]> {
  return query;
}

/** Raw result (rows + rowCount + command) for statements that report counts. */
export function execute<Row = Record<string, unknown>>(
  text: string,
  params: SqlParam[] = [],
): Promise<QueryResult<Row>> {
  return getDriver().query<Row>(text, params);
}
