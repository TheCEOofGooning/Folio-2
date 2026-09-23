/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Folio · `sql` — a 90-line tagged-template query layer (no ORM, no builder)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Everything is a bind parameter by construction, so SQL injection requires
 *  literally concatenating user input into the template (there is an
 *  intentionally awkward `sql.raw()` escape hatch for the rare dynamic fragment,
 *  and it is never fed user input).
 *
 *    const posts = await sql<FeedPost>`
 *      select ${sql.raw(POST_CARD)}
 *      from posts p join users u on u.id = p.author_id
 *      where p.status = 'published'
 *        and (${tag}::text is null or ${sql.array([tag], "text")} && p.tags)
 *      limit ${limit}
 *    `;
 *
 *  Arrays are always expanded to an explicit `ARRAY[...]::cast` so behaviour is
 *  identical on Neon's HTTP endpoint and on the local PGlite sidecar, with no
 *  reliance on driver-specific array binding.
 */
import { getDriver, type SqlParam } from "./driver";

const FRAGMENT = Symbol("folio.fragment");

export interface Fragment {
  readonly [FRAGMENT]: true;
  readonly text: string;
  readonly params: SqlParam[];
}

export function isFragment(value: unknown): value is Fragment {
  return typeof value === "object" && value !== null && FRAGMENT in value;
}

function make(text: string, params: SqlParam[] = []): Fragment {
  return { [FRAGMENT]: true, text, params };
}

/** Escape hatch for trusted, developer-authored SQL (never user input). */
export function raw(text: string): Fragment {
  return make(text);
}

/**
 * `sql.array(["a","b"], "text")` → `ARRAY[$1,$2]::text[]`
 * Empty input becomes `ARRAY[]::text[]`, which keeps `= any(...)` predicates
 * valid instead of producing a syntax error.
 */
export function arrayOf(values: readonly (string | number)[], cast = "text"): Fragment {
  if (values.length === 0) return make(`ARRAY[]::${cast}[]`);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  return make(`ARRAY[${placeholders}]::${cast}[]`, [...values]);
}

/** `sql.join(fragments, ", ")` → safe dynamic lists. */
export function joinFragments(fragments: readonly Fragment[], separator = ", "): Fragment {
  const text: string[] = [];
  const params: SqlParam[] = [];
  fragments.forEach((fragment, index) => {
    if (index > 0) text.push(separator);
    text.push(shift(fragment, params.length).text);
    params.push(...fragment.params);
  });
  return make(text.join(""), params);
}

/** Re-numbers `$n` placeholders inside a pre-built fragment by `offset`. */
function shift(fragment: Fragment, offset: number): Fragment {
  if (offset === 0) return fragment;
  return make(
    fragment.text.replace(/\$(\d+)/g, (_, digits: string) => `$${Number(digits) + offset}`),
    fragment.params,
  );
}

function isPlainArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** A `sql`-tagged query. Returns rows directly — the 95% case. */
export interface SqlTag {
  <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: (SqlParam | Fragment | undefined)[]
  ): Promise<Row[]>;
  raw: typeof raw;
  array: typeof arrayOf;
  join: typeof joinFragments;
  /** For `Fragment` builders that should stay lazy. */
  fragment: typeof make;
}

async function run<Row>(
  strings: TemplateStringsArray,
  // NOTE: this must be a rest parameter. A tagged template calls the function as
  // `fn(strings, v1, v2, …)`, so without the spread `values` receives only the
  // first interpolation — and every query with a second parameter silently loses
  // it. (TypeScript cannot catch this: `values.length` on a number is undefined
  // and the loop simply skips.) Integration-tested by `npm run smoke`.
  ...values: (SqlParam | Fragment | undefined)[]
): Promise<Row[]> {
  const params: SqlParam[] = [];
  let text = "";

  strings.forEach((chunk, index) => {
    text += chunk;
    if (index >= values.length) return;
    const value = values[index];
    if (value === undefined) return; // allow optional fragments to vanish

    if (isFragment(value)) {
      const shifted = shift(value, params.length);
      text += shifted.text;
      params.push(...shifted.params);
      return;
    }

    if (isPlainArray(value)) {
      throw new Error(
        "Passing a bare array to `sql` is not supported — use `sql.array(values, 'text')` so the driver can emit an explicit ARRAY[...] cast.\n" +
          `Offending query: ${strings.join(" ? ")}`,
      );
    }

    params.push(value as SqlParam);
    text += `$${params.length}`;
  });

  const driver = getDriver();
  const result = await driver.query<Row>(text.trim(), params);
  return result.rows;
}

export const sql = run as unknown as SqlTag;
sql.raw = raw;
sql.array = arrayOf;
sql.join = joinFragments;
sql.fragment = make;

/**
 * Imperative builder for statements whose shape depends on runtime input — the
 * autosaving editor is the only user (it sends a different column set on every
 * keystroke batch).
 *
 * It exists so dynamic statements get the *same* guarantees as tagged templates:
 * `add()` and `addArray()` are the only ways to introduce a value, and both emit
 * numbered placeholders. There is no string interpolation of user data, ever.
 */
export class SqlBuilder {
  private readonly parts: string[] = [];
  readonly params: SqlParam[] = [];

  /** Appends raw SQL you authored (column names, keywords, operators). */
  push(text: string): this {
    this.parts.push(text);
    return this;
  }

  /** Appends a bind parameter and returns its placeholder (`$3`). */
  add(value: SqlParam): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** `and name = <placeholder>` convenience. */
  assign(column: string, value: SqlParam, operator = "="): this {
    this.parts.push(`${column} ${operator} ${this.add(value)}`);
    return this;
  }

  /**
   * Expands an array into `ARRAY[$n,$n+1]::cast[]`. Arrays are never sent as
   * bind parameters: Neon's HTTP endpoint and the local sidecar are guaranteed to
   * agree on an explicit ARRAY[…] literal, and on nothing else.
   */
  addArray(values: readonly (string | number)[], cast = "text"): string {
    if (values.length === 0) return `ARRAY[]::${cast}[]`;
    const refs = values.map((value) => this.add(value));
    return `ARRAY[${refs.join(", ")}]::${cast}[]`;
  }

  get text(): string {
    return this.parts.join("");
  }
}

export type { SqlParam };
