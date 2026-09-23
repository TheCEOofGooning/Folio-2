/**
 * lib/db/memory.ts — an in-memory Postgres-subset engine.
 *
 * WHY THIS EXISTS
 * ---------------
 * Folio's data layer is raw SQL, which means a `DATABASE_URL` is normally a
 * hard requirement just to see the UI. That is a bad developer experience and
 * a bad demo. So when no Neon connection string is present, the very same SQL
 * strings are executed here instead: the app boots, you can register, publish,
 * clap, comment, bookmark and read analytics with zero infrastructure.
 *
 * It is NOT a Postgres clone and must never be used in production. It supports
 * exactly the dialect that `lib/db/queries/*.ts` emits — CTEs, inner/outer
 * joins, grouped aggregates, `RETURNING`, `ON CONFLICT`, `INTERVAL` math,
 * `array_agg`, `string_agg`, `date_trunc` and the `tsvector @@ tsquery`
 * operators — and nothing else.
 *
 * It is covered by `tests/db-memory.test.ts`, which runs the real query
 * builders from `lib/db/queries` against it, so the SQL shipped to Neon is the
 * SQL exercised in CI.
 */

import type { Field, Param, QueryResult } from './types';
import { OID } from './types';

/* ------------------------------------------------------------------ schema */

export type ColType =
  | 'bool'
  | 'int'
  | 'bigint'
  | 'text'
  | 'float'
  | 'timestamptz'
  | 'tsvector'
  | 'text[]';

export interface ColumnDef {
  name: string;
  type: ColType;
  /** `identity` => auto-increment, `defaultNow` => now(), `default0` => 0. */
  identity?: boolean;
  defaultNow?: boolean;
  default0?: boolean;
  defaultNull?: boolean;
  /** A literal default, e.g. `'draft'`, mirroring a column DEFAULT clause. */
  defaultValue?: unknown;
  /** A generated column computed from other columns on insert/update. */
  generated?: (row: Row) => unknown;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  /** Column names that together form the primary key / conflict target. */
  unique: string[][];
}

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

/* ------------------------------------------------------------------- lexer */

type Tok =
  | { t: 'word'; v: string }
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: 'param'; v: number }
  | { t: 'op'; v: string }
  | { t: 'punct'; v: string };

const WORD = /[a-z_][a-z0-9_]*/i;

function lex(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let v = '';
      i++;
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            v += quote;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += sql[i++];
      }
      out.push(quote === "'" ? { t: 'str', v } : { t: 'word', v });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let v = '';
      while (i < n && /[0-9._]/.test(sql[i])) v += sql[i++];
      out.push({ t: 'num', v: Number(v) });
      continue;
    }
    if (c === '$') {
      i++;
      let v = '';
      while (i < n && /[0-9]/.test(sql[i])) v += sql[i++];
      out.push({ t: 'param', v: Number(v) });
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (['::', '<=', '>=', '<>', '!=', '@@'].includes(two)) {
      out.push({ t: 'op', v: two === '!=' ? '<>' : two });
      i += 2;
      continue;
    }
    if ('+-*/%<>=@|&'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if ('(),.;'.includes(c)) {
      out.push({ t: 'punct', v: c });
      i++;
      continue;
    }
    const m = WORD.exec(sql.slice(i));
    if (m) {
      out.push({ t: 'word', v: m[0] });
      i += m[0].length;
      continue;
    }
    throw new Error(`memory-db: cannot lex ${JSON.stringify(sql.slice(i, i + 12))}`);
  }
  return out;
}

/* ------------------------------------------------------------------- AST */

interface Lit {
  k: 'lit';
  v: unknown;
}
interface Prm {
  k: 'param';
  i: number;
}
interface Ref {
  k: 'ref';
  table?: string;
  col: string;
  /** `*` for `count(*)` / `select *` */
  star?: boolean;
}
interface Call {
  k: 'call';
  name: string;
  args: Expr[];
  distinct?: boolean;
  orderBy?: { expr: Expr; dir: 'asc' | 'desc' };
}
interface Bin {
  k: 'bin';
  op: string;
  l: Expr;
  r: Expr;
}
interface Un {
  k: 'un';
  op: string;
  e: Expr;
}
interface Cast {
  k: 'cast';
  e: Expr;
  type: string;
}
interface Interval {
  k: 'interval';
  ms: number;
}
interface SubSel {
  k: 'sub';
  sel: SelectNode;
}
type Expr = Lit | Prm | Ref | Call | Bin | Un | Cast | Interval | SubSel;

interface Pred {
  k: 'and' | 'or';
  parts: Where[];
}
interface NotPred {
  k: 'not';
  p: Where;
}
interface Cmp {
  k: 'cmp';
  op: string;
  l: Expr;
  r: Expr;
}
interface InPred {
  k: 'in';
  e: Expr;
  list: Expr[] | SelectNode;
  neg: boolean;
}
interface LikePred {
  k: 'like';
  e: Expr;
  pattern: Expr;
  insensitive: boolean;
  neg: boolean;
}
interface NullPred {
  k: 'null';
  e: Expr;
  neg: boolean;
}
interface ExistsPred {
  k: 'exists';
  sel: SelectNode;
  neg: boolean;
}
interface BetweenPred {
  k: 'between';
  e: Expr;
  lo: Expr;
  hi: Expr;
  neg: boolean;
}
interface MatchPred {
  k: 'match';
  l: Expr;
  r: Expr;
}
type Where = Pred | NotPred | Cmp | InPred | LikePred | NullPred | ExistsPred | BetweenPred | MatchPred;

interface SelectItem {
  expr: Expr;
  alias?: string;
}
interface FromPart {
  name: string | SelectNode;
  alias: string;
}
interface JoinPart {
  part: FromPart;
  type: 'inner' | 'left';
  on?: Where;
}
export interface SelectNode {
  ctes: { name: string; sel: SelectNode }[];
  items: SelectItem[];
  from: FromPart[];
  joins: JoinPart[];
  where?: Where;
  groupBy: Expr[];
  having?: Where;
  orderBy: { expr: Expr; alias?: string; ordinal?: number; dir: 'asc' | 'desc' }[];
  limit?: Expr;
  offset?: Expr;
}
interface InsertNode {
  table: string;
  columns: string[];
  values: Expr[][];
  /** `INSERT … SELECT`, in which case `values` stays empty. */
  select?: SelectNode;
  returning: SelectItem[];
  conflict?: { target: string[]; action: 'nothing' | { set: { col: string; expr: Expr }[] } };
}
interface UpdateNode {
  table: string;
  alias?: string;
  set: { col: string; expr: Expr }[];
  where?: Where;
  returning: SelectItem[];
}
interface DeleteNode {
  table: string;
  alias?: string;
  where?: Where;
  returning: SelectItem[];
}
type Stmt = { ctes: { name: string; sel: SelectNode }[] } & (
  | ({ k: 'select' } & SelectNode)
  | ({ k: 'insert' } & InsertNode)
  | ({ k: 'update' } & UpdateNode)
  | ({ k: 'delete' } & DeleteNode)
);

/* ------------------------------------------------------------------ parser */

class Parser {
  p = 0;
  constructor(
    readonly toks: Tok[],
  ) {}

  peek(o = 0): Tok | undefined {
    return this.toks[this.p + o];
  }
  isWord(w: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === 'word' && t.v.toLowerCase() === w;
  }
  eatWord(w: string): boolean {
    if (this.isWord(w)) {
      this.p++;
      return true;
    }
    return false;
  }
  expectWord(w: string) {
    if (!this.eatWord(w)) this.fail(`expected ${w}`);
  }
  isPunct(c: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === 'punct' && t.v === c;
  }
  eatPunct(c: string): boolean {
    if (this.isPunct(c)) {
      this.p++;
      return true;
    }
    return false;
  }
  expectPunct(c: string) {
    if (!this.eatPunct(c)) this.fail(`expected ${c}`);
  }
  isOp(o: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'op' && t.v === o;
  }
  word(): string {
    const t = this.peek();
    if (!t || t.t !== 'word') this.fail('expected identifier');
    this.p++;
    return (t as { v: string }).v;
  }
  fail(msg: string): never {
    const around = this.toks
      .slice(Math.max(0, this.p - 4), this.p + 4)
      .map((t) => ('v' in t ? String(t.v) : '?'))
      .join(' ');
    throw new Error(`memory-db parse: ${msg} near "${around}"`);
  }

  parseStmt(): Stmt {
    const ctes: { name: string; sel: SelectNode }[] = [];
    if (this.eatWord('with')) {
      do {
        const name = this.word();
        this.expectWord('as');
        this.expectPunct('(');
        const sel = this.parseSelect();
        this.expectPunct(')');
        ctes.push({ name, sel });
      } while (this.eatPunct(','));
    }
    if (this.isWord('select')) {
      const sel = this.parseSelectBody();
      if (!this.eatPunct(';') && this.peek()) this.fail('trailing tokens after SELECT');
      return { k: 'select', ctes, ...sel };
    }
    if (this.isWord('insert')) return { k: 'insert', ctes, ...this.parseInsert() };
    if (this.isWord('update')) return { k: 'update', ctes, ...this.parseUpdate() };
    if (this.isWord('delete')) return { k: 'delete', ctes, ...this.parseDelete() };
    this.fail('unsupported statement');
  }

  parseSelect(): SelectNode {
    const sel = this.parseSelectBody();
    return { ...sel, ctes: [] };
  }

  parseSelectBody(): Omit<SelectNode, 'ctes'> {
    this.expectWord('select');
    const distinct = this.eatWord('distinct');
    const items: SelectItem[] = [];
    do {
      items.push(this.parseSelectItem());
    } while (this.eatPunct(','));

    const from: FromPart[] = [];
    const joins: JoinPart[] = [];
    if (this.eatWord('from')) {
      do {
        from.push(this.parseFromPart());
      } while (this.eatPunct(','));
      for (;;) {
        let type: 'inner' | 'left' = 'inner';
        if (this.eatWord('inner')) {
          this.expectWord('join');
        } else if (this.eatWord('left')) {
          this.eatWord('outer');
          this.expectWord('join');
          type = 'left';
        } else if (this.eatWord('join')) {
          type = 'inner';
        } else if (this.eatWord('cross')) {
          this.expectWord('join');
          type = 'inner';
        } else break;
        const part = this.parseFromPart();
        let on: Where | undefined;
        if (this.eatWord('on')) on = this.parseWhere();
        joins.push({ part, type, on });
      }
    }

    let where: Where | undefined;
    if (this.eatWord('where')) where = this.parseWhere();

    const groupBy: Expr[] = [];
    if (this.eatWord('group')) {
      this.expectWord('by');
      do {
        groupBy.push(this.parseExpr());
      } while (this.eatPunct(','));
    }
    let having: Where | undefined;
    if (this.eatWord('having')) having = this.parseWhere();

    const orderBy: SelectNode['orderBy'] = [];
    if (this.eatWord('order')) {
      this.expectWord('by');
      do {
        const start = this.p;
        const expr = this.parseExpr();
        let ordinal: number | undefined;
        if (expr.k === 'lit' && typeof expr.v === 'number') ordinal = expr.v;
        let alias: string | undefined;
        if (expr.k === 'ref' && !expr.table) alias = expr.col;
        let dir: 'asc' | 'desc' = 'asc';
        if (this.eatWord('desc')) dir = 'desc';
        else this.eatWord('asc');
        if (this.eatWord('nulls')) {
          this.word(); // first | last — ordering nuance not modelled
        }
        orderBy.push({ expr, alias, ordinal, dir });
        if (this.p === start) this.fail('empty ORDER BY term');
      } while (this.eatPunct(','));
    }

    let limit: Expr | undefined;
    let offset: Expr | undefined;
    if (this.eatWord('limit')) limit = this.parseExpr();
    if (this.eatWord('offset')) offset = this.parseExpr();

  if (distinct) {
    // `SELECT DISTINCT` is applied as a post-pass over the projected rows.
    (orderBy as unknown as { distinct?: boolean }).distinct = true;
  }
  return { items, from, joins, where, groupBy, having, orderBy, limit, offset };
  }

  parseSelectItem(): SelectItem {
    if (this.isOp('*')) {
      this.p++;
      return { expr: { k: 'ref', col: '*', star: true } };
    }
    const expr = this.parseExpr();
    let alias: string | undefined;
    if (this.eatWord('as')) alias = this.word();
    else if (this.peek()?.t === 'word' && !KEYWORD_AFTER_EXPR.has((this.peek() as { v: string }).v.toLowerCase())) {
      alias = this.word();
    }
    return { expr, alias };
  }

  parseFromPart(): FromPart {
    if (this.eatPunct('(')) {
      const sel = this.parseSelect();
      this.expectPunct(')');
      let alias = 'sub';
      if (this.eatWord('as')) alias = this.word();
      else if (this.peek()?.t === 'word') alias = this.word();
      return { name: sel, alias };
    }
    const name = this.word();
    let alias = name;
    if (this.eatWord('as')) alias = this.word();
    else if (this.peek()?.t === 'word' && !KEYWORD_AFTER_EXPR.has((this.peek() as { v: string }).v.toLowerCase())) {
      alias = this.word();
    }
    return { name, alias };
  }

  parseReturning(): SelectItem[] {
    if (!this.eatWord('returning')) return [];
    const items: SelectItem[] = [];
    do {
      items.push(this.parseSelectItem());
    } while (this.eatPunct(','));
    return items;
  }

  parseInsert(): InsertNode {
    this.expectWord('insert');
    this.expectWord('into');
    const table = this.word();
    this.expectPunct('(');
    const columns: string[] = [];
    do {
      columns.push(this.word());
    } while (this.eatPunct(','));
    this.expectPunct(')');
    const values: Expr[][] = [];
    let select: SelectNode | undefined;
    if (this.isWord('select') || this.isWord('with')) {
      select = this.parseSelect();
    } else {
      this.expectWord('values');
      do {
        this.expectPunct('(');
        const row: Expr[] = [];
        do {
          row.push(this.parseExpr());
        } while (this.eatPunct(','));
        this.expectPunct(')');
        values.push(row);
      } while (this.eatPunct(','));
    }

    let conflict: InsertNode['conflict'];
    if (this.eatWord('on')) {
      this.expectWord('conflict');
      const target: string[] = [];
      if (this.eatPunct('(')) {
        do {
          target.push(this.word());
        } while (this.eatPunct(','));
        this.expectPunct(')');
      }
      this.expectWord('do');
      if (this.eatWord('nothing')) {
        conflict = { target, action: 'nothing' };
      } else {
        this.expectWord('update');
        this.expectWord('set');
        const set: { col: string; expr: Expr }[] = [];
        do {
          const col = this.word();
          if (!this.isOp('=')) this.fail('expected = in ON CONFLICT DO UPDATE SET');
          this.p++;
          set.push({ col, expr: this.parseExpr() });
        } while (this.eatPunct(','));
        conflict = { target, action: { set } };
      }
    }
    const returning = this.parseReturning();
    this.eatPunct(';');
    return { table, columns, values, select, returning, conflict };
  }

  parseUpdate(): UpdateNode {
    this.expectWord('update');
    const table = this.word();
    let alias: string | undefined;
    if (this.eatWord('as')) alias = this.word();
    else if (this.peek()?.t === 'word' && !this.isWord('set')) alias = this.word();
    this.expectWord('set');
    const set: { col: string; expr: Expr }[] = [];
    do {
      const col = this.word();
      if (!this.isOp('=')) this.fail('expected = in SET');
      this.p++;
      set.push({ col, expr: this.parseExpr() });
    } while (this.eatPunct(','));
    let where: Where | undefined;
    if (this.eatWord('where')) where = this.parseWhere();
    const returning = this.parseReturning();
    this.eatPunct(';');
    return { table, alias, set, where, returning };
  }

  parseDelete(): DeleteNode {
    this.expectWord('delete');
    this.expectWord('from');
    const table = this.word();
    let alias: string | undefined;
    if (this.eatWord('as')) alias = this.word();
    else if (this.peek()?.t === 'word' && !this.isWord('where') && !this.isWord('returning')) {
      alias = this.word();
    }
    let where: Where | undefined;
    if (this.eatWord('where')) where = this.parseWhere();
    const returning = this.parseReturning();
    this.eatPunct(';');
    return { table, alias, where, returning };
  }

  /* ---------------------------------------------------------- predicates */

  parseWhere(): Where {
    return this.parseOr();
  }
  parseOr(): Where {
    const parts: Where[] = [this.parseAnd()];
    while (this.eatWord('or')) parts.push(this.parseAnd());
    return parts.length === 1 ? parts[0] : { k: 'or', parts };
  }
  parseAnd(): Where {
    const parts: Where[] = [this.parseNot()];
    while (this.eatWord('and')) parts.push(this.parseNot());
    return parts.length === 1 ? parts[0] : { k: 'and', parts };
  }
  parseNot(): Where {
    if (this.eatWord('not')) return { k: 'not', p: this.parseNot() };
    return this.parsePrimaryPred();
  }
  parsePrimaryPred(): Where {
    if (this.eatPunct('(')) {
      const inner = this.parseWhere();
      this.expectPunct(')');
      return inner;
    }
    let neg = false;
    if (this.isWord('not')) {
      const save = this.p;
      this.p++;
      if (this.isWord('exists') || this.peek()?.t === 'punct') {
        neg = true;
      } else {
        this.p = save;
      }
    }
    if (this.eatWord('exists')) {
      this.expectPunct('(');
      const sel = this.parseSelect();
      this.expectPunct(')');
      return { k: 'exists', sel, neg };
    }
    const l = this.parseExpr();
    if (neg) this.fail('unsupported NOT placement');

    if (this.isOp('@@')) {
      this.p++;
      return { k: 'match', l, r: this.parseExpr() };
    }
    const t = this.peek();
    if (t?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
      const op = t.v;
      this.p++;
      return { k: 'cmp', op, l, r: this.parseExpr() };
    }
    if (this.isWord('is')) {
      this.p++;
      const isNeg = this.eatWord('not');
      if (!this.eatWord('null')) this.fail('expected NULL after IS');
      return { k: 'null', e: l, neg: isNeg };
    }
    if (this.isWord('not') && this.isWord('in', 1)) {
      this.p += 2;
      return this.parseIn(l, true);
    }
    if (this.eatWord('in')) return this.parseIn(l, false);
    if (this.isWord('not') && (this.isWord('like', 1) || this.isWord('ilike', 1))) {
      this.p++;
      return this.parseLike(l, true);
    }
    if (this.isWord('like') || this.isWord('ilike')) return this.parseLike(l, false);
    if (this.isWord('not') && this.isWord('between', 1)) {
      this.p += 2;
      return this.parseBetween(l, true);
    }
    if (this.eatWord('between')) return this.parseBetween(l, false);
    // A bare boolean column/expression, e.g. `WHERE published`.
    return { k: 'cmp', op: '=', l, r: { k: 'lit', v: true } };
  }
  parseIn(e: Expr, neg: boolean): InPred {
    this.expectPunct('(');
    if (this.isWord('select') || this.isWord('with')) {
      const sel = this.parseSelect();
      this.expectPunct(')');
      return { k: 'in', e, list: sel, neg };
    }
    const list: Expr[] = [];
    do {
      list.push(this.parseExpr());
    } while (this.eatPunct(','));
    this.expectPunct(')');
    return { k: 'in', e, list, neg };
  }
  parseLike(e: Expr, neg: boolean): LikePred {
    const insensitive = this.isWord('ilike');
    this.p++;
    return { k: 'like', e, pattern: this.parseExpr(), insensitive, neg };
  }
  parseBetween(e: Expr, neg: boolean): BetweenPred {
    const lo = this.parseExpr();
    this.expectWord('and');
    const hi = this.parseExpr();
    return { k: 'between', e, lo, hi, neg };
  }

  /* --------------------------------------------------------- expressions */

  parseExpr(): Expr {
    return this.parseAdd();
  }
  parseAdd(): Expr {
    let l = this.parseMul();
    while (this.isOp('+') || this.isOp('-') || this.isOp('||')) {
      const op = (this.peek() as { v: string }).v;
      this.p++;
      l = { k: 'bin', op, l, r: this.parseMul() };
    }
    return l;
  }
  parseMul(): Expr {
    let l = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.peek() as { v: string }).v;
      this.p++;
      l = { k: 'bin', op, l, r: this.parseUnary() };
    }
    return l;
  }
  parseUnary(): Expr {
    if (this.isOp('-')) {
      this.p++;
      return { k: 'un', op: '-', e: this.parseUnary() };
    }
    return this.parseCast();
  }
  parseCast(): Expr {
    let e = this.parseTerm();
    while (this.isOp('::')) {
      this.p++;
      const t = this.word();
      e = { k: 'cast', e, type: t.toLowerCase() };
    }
    return e;
  }
  parseTerm(): Expr {
    const t = this.peek();
    if (!t) this.fail('unexpected end of statement');
    if (t.t === 'num') {
      this.p++;
      return { k: 'lit', v: t.v };
    }
    if (t.t === 'str') {
      this.p++;
      return { k: 'lit', v: t.v };
    }
    if (t.t === 'param') {
      this.p++;
      return { k: 'param', i: t.v };
    }
    if (t.t === 'punct' && t.v === '(') {
      this.p++;
      if (this.isWord('select') || this.isWord('with')) {
        const sel = this.parseSelect();
        this.expectPunct(')');
        return { k: 'sub', sel };
      }
      const e = this.parseExpr();
      this.expectPunct(')');
      return e;
    }
    if (t.t === 'word') {
      const w = t.v.toLowerCase();
      if (w === 'true' || w === 'false') {
        this.p++;
        return { k: 'lit', v: w === 'true' };
      }
      if (w === 'null') {
        this.p++;
        return { k: 'lit', v: null };
      }
      if (w === 'interval') {
        this.p++;
        const s = this.peek();
        if (!s || s.t !== 'str') this.fail('expected interval literal');
        this.p++;
        return { k: 'interval', ms: parseInterval(s.v) };
      }
      if (w === 'case') return this.parseCase();
      if (this.peek(1)?.t === 'punct' && (this.peek(1) as { v: string }).v === '(') {
        return this.parseCall();
      }
      const first = this.word();
      if (this.isPunct('.')) {
        this.p++;
        if (this.isOp('*')) {
          this.p++;
          return { k: 'ref', table: first, col: '*', star: true };
        }
        const col = this.word();
        return { k: 'ref', table: first, col };
      }
      return { k: 'ref', col: first };
    }
    this.fail(`unexpected token ${JSON.stringify(t)}`);
  }
  parseCall(): Call {
    const name = this.word().toLowerCase();
    this.expectPunct('(');
    const call: Call = { k: 'call', name, args: [] };
    if (this.isOp('*')) {
      this.p++;
      call.args = [{ k: 'ref', col: '*', star: true }];
    } else if (!this.isPunct(')')) {
      if (this.eatWord('distinct')) call.distinct = true;
      do {
        call.args.push(this.parseExpr());
      } while (this.eatPunct(','));
    }
    if (this.eatWord('order')) {
      this.expectWord('by');
      const expr = this.parseExpr();
      let dir: 'asc' | 'desc' = 'asc';
      if (this.eatWord('desc')) dir = 'desc';
      else this.eatWord('asc');
      call.orderBy = { expr, dir };
    }
    this.expectPunct(')');
    if (this.eatWord('filter')) {
      this.expectPunct('(');
      this.expectWord('where');
      this.parseWhere(); // modelled as unfiltered
      this.expectPunct(')');
    }
    return call;
  }
  /**
   * Only the searched form is supported: `CASE WHEN <pred> THEN a ELSE b END`.
   * It is lowered to a 3-argument pseudo function so the evaluator stays flat.
   */
  parseCase(): Expr {
    this.expectWord('case');
    this.expectWord('when');
    const cond = this.parseWhere();
    this.expectWord('then');
    const then = this.parseExpr();
    let els: Expr = { k: 'lit', v: null };
    if (this.eatWord('else')) els = this.parseExpr();
    this.expectWord('end');
    return { k: 'call', name: '__case', args: [cond as unknown as Expr, then, els] };
  }
}

const KEYWORD_AFTER_EXPR = new Set([
  'from',
  'where',
  'group',
  'order',
  'limit',
  'offset',
  'returning',
  'on',
  'join',
  'inner',
  'left',
  'cross',
  'and',
  'or',
  'as',
  'set',
  'values',
  'having',
  'then',
  'else',
  'end',
  'when',
  'do',
  'conflict',
  'is',
  'in',
  'like',
  'ilike',
  'between',
  'not',
  'asc',
  'desc',
  'nulls',
  'filter',
]);

function parseInterval(s: string): number {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(microsecond|millisecond|second|minute|hour|day|week|month|year)s?\s*$/i.exec(
    s,
  );
  if (!m) throw new Error(`memory-db: cannot parse interval '${s}'`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const per: Record<string, number> = {
    microsecond: 1e-3,
    millisecond: 1,
    second: 1e3,
    minute: 6e4,
    hour: 36e5,
    day: 864e5,
    week: 6048e5,
    month: 2592e6,
    year: 31536e6,
  };
  return n * per[unit];
}

export function parseSql(sql: string): Stmt {
  return new Parser(lex(sql)).parseStmt();
}

/* --------------------------------------------------------------- runtime */

type CtxRow = Record<string, unknown>;
interface EvalCtx {
  row: CtxRow;
  params: Param[];
  tables: Tables;
  schema: Record<string, TableDef>;
  /** Named CTE / subquery results visible to this scope. */
  named: Record<string, Row[]>;
  /** Row of the enclosing query, so correlated subqueries can resolve `p.id`. */
  outer?: CtxRow;
}

const NUMERIC = new Set(['int', 'int2', 'int4', 'int8', 'bigint', 'smallint', 'integer', 'float', 'float4', 'float8', 'double', 'numeric', 'decimal', 'real']);
const TEXTUAL = new Set(['text', 'varchar', 'char', 'citext', 'uuid', 'name']);
const TIMED = new Set(['timestamptz', 'timestamp', 'date', 'time']);

function colTypeOf(type: string): ColType {
  const t = type.toLowerCase();
  if (t === 'bool' || t === 'boolean') return 'bool';
  if (t.endsWith('[]')) return 'text[]';
  if (t === 'tsvector') return 'tsvector';
  if (TIMED.has(t)) return 'timestamptz';
  if (t === 'float8' || t === 'float4' || t === 'double precision' || t === 'real' || t === 'numeric' || t === 'decimal') {
    return 'float';
  }
  if (NUMERIC.has(t)) return t === 'int8' || t === 'bigint' ? 'bigint' : 'int';
  return 'text';
}

function coerce(v: unknown, type: ColType): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'bool':
      if (typeof v === 'boolean') return v;
      return ['t', 'true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
    case 'int':
    case 'bigint':
    case 'float':
      return typeof v === 'number' ? v : Number(v);
    case 'timestamptz': {
      if (v instanceof Date) return v.toISOString();
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
    }
    case 'text[]':
      return Array.isArray(v) ? v.map(String) : String(v);
    case 'tsvector':
      return toTsvector(String(v));
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

/** Postgres `to_tsvector('simple', text)` modelled as a sorted unique lexeme list. */
export function toTsvector(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return Array.from(new Set(words)).sort().join(' ');
}

function tsvectorTokens(v: unknown): string[] {
  return String(v ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

function tokensMatch(vec: string[], query: unknown): boolean {
  const q = String(query ?? '').toLowerCase();
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/^[&|!()']+|[&|!()'']+$/g, '').replace(/:?\*$/, ''))
    .filter((t) => t.length > 0 && t !== '&' && t !== '|');
  if (terms.length === 0) return false;
  return terms.every((term) => vec.some((tok) => tok === term || tok.startsWith(term)));
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`);
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  return Boolean(v);
}

function cmpValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
      return na === nb;
    }
  }
  return String(a) === String(b);
}

function isAggregate(name: string): boolean {
  return ['count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg', 'bool_or', 'bool_and'].includes(name);
}

function evalExpr(e: Expr | Where, ctx: EvalCtx): unknown {
  switch (e.k) {
    // Predicates lowered into expression position (searched CASE conditions).
    case 'cmp':
    case 'and':
    case 'or':
    case 'not':
    case 'match':
    case 'null':
    case 'like':
    case 'in':
    case 'between':
    case 'exists':
      return evalPred(e as unknown as Where, ctx);
    case 'lit':
      return e.v;
    case 'param':
      return ctx.params[e.i - 1] ?? null;
    case 'interval':
      return e.ms;
    case 'ref': {
      if (e.star) return ctx.row;
      const key = e.table ? `${e.table}.${e.col}` : e.col;
      if (key in ctx.row) return ctx.row[key];
      if (!e.table) {
        const hit = Object.keys(ctx.row).find((k) => k.endsWith(`.${e.col}`));
        if (hit) return ctx.row[hit];
      }
      if (ctx.outer) {
        if (key in ctx.outer) return ctx.outer[key];
        const outerHit = Object.keys(ctx.outer).find((k) => k.endsWith(`.${e.col}`));
        if (outerHit) return ctx.outer[outerHit];
      }
      throw new Error(`memory-db: unknown column ${key}`);
    }
    case 'cast': {
      const v = evalExpr(e.e, ctx);
      return coerce(v, colTypeOf(e.type));
    }
    case 'un':
      return -Number(evalExpr(e.e, ctx));
    case 'sub': {
      const rows = runSelect(e.sel, ctx.tables, ctx.schema, { ...ctx.named }, ctx.params, undefined, {
        ...(ctx.outer ?? {}),
        ...ctx.row,
      });
      if (rows.length === 0) return null;
      const first = rows[0];
      const keys = Object.keys(first);
      return keys.length ? first[keys[0]] : null;
    }
    case 'call':
      return evalScalarFn(e, ctx);
    case 'bin': {
      const l = evalExpr(e.l, ctx);
      const r = evalExpr(e.r, ctx);
      return applyBin(e.op, l, r);
    }
    default:
      throw new Error(`memory-db: cannot evaluate expression node ${JSON.stringify((e as { k: string }).k)}`);
  }
}

function applyBin(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case '||':
      return `${l ?? ''}${r ?? ''}`;
    case '+':
      if (isDateLike(l) && typeof r === 'number') return new Date(new Date(String(l)).getTime() + r).toISOString();
      if (typeof l === 'number' && isDateLike(r)) return new Date(new Date(String(r)).getTime() + l).toISOString();
      if (isDateLike(l) && typeof r === 'number') return l;
      return Number(l) + Number(r);
    case '-':
      if (isDateLike(l) && typeof r === 'number') return new Date(new Date(String(l)).getTime() - r).toISOString();
      if (isDateLike(l) && isDateLike(r)) return new Date(String(l)).getTime() - new Date(String(r)).getTime();
      return Number(l) - Number(r);
    case '*':
      return Number(l) * Number(r);
    case '/':
      return Number(r) === 0 ? 0 : Number(l) / Number(r);
    case '%':
      return Number(l) % Number(r);
    case '@@':
      // Full-text match: `tsvector @@ tsquery`.
      return tsqueryMatches(String(l ?? ''), String(r ?? ''));
    default:
      throw new Error(`memory-db: unsupported operator ${op}`);
  }
}

function isDateLike(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
}

/**
 * Stand-in for Postgres' `tsvector @@ tsquery`: every term of the query must
 * match the start of some word in the haystack.
 */
function tsqueryMatches(haystack: string, tsquery: string): boolean {
  const words = haystack.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const terms = tsquery
    .split(/&|\||!|\(|\)|\s+/)
    .map((t) => t.replace(/:?\*$/, '').trim())
    .filter(Boolean);
  if (terms.length === 0) return false;
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}

/** Scalar functions only. Aggregates are folded by `foldAggregate`. */
function evalScalarFn(e: Call, ctx: EvalCtx): unknown {
  const a = e.args.map((x) => evalExpr(x, ctx));
  switch (e.name) {
    case '__case':
      return truthy(a[0]) ? a[1] : a[2];
    case 'coalesce':
      return a.find((v) => v !== null && v !== undefined) ?? null;
    case 'nullif':
      return eq(a[0], a[1]) ? null : a[0];
    case 'websearch_to_tsquery':
      // Postgres returns a tsquery node; here it is the same terms joined by
      // `&`, which is what `tsqueryMatches` parses.
      return String(a[1] ?? '')
        .toLowerCase()
        .split(/[^a-z0-9'-]+/)
        .filter(Boolean)
        .map((term) => `'${term}'`)
        .join(' & ');
    case 'to_tsvector':
    case 'plainto_tsquery':
    case 'ts_rank':
      // The generated `search` column already holds plain text.
      return a[a.length - 1] ?? null;
    case 'lower':
      return String(a[0] ?? '').toLowerCase();
    case 'upper':
      return String(a[0] ?? '').toUpperCase();
    case 'length':
    case 'char_length':
      return String(a[0] ?? '').length;
    case 'trim':
      return String(a[0] ?? '').trim();
    case 'left':
      return String(a[0] ?? '').slice(0, Number(a[1]));
    case 'right':
      return String(a[0] ?? '').slice(-Number(a[1]));
    case 'substr':
    case 'substring':
      return String(a[0] ?? '').substr(Number(a[1]) - 1, a[2] === undefined ? undefined : Number(a[2]));
    case 'replace':
      return String(a[0] ?? '').split(String(a[1])).join(String(a[2]));
    case 'concat':
      return a.map((v) => (v === null ? '' : String(v))).join('');
    case 'concat_ws':
      return a
        .slice(1)
        .filter((v) => v !== null && v !== undefined)
        .map(String)
        .join(String(a[0]));
    case 'floor':
      return Math.floor(Number(a[0]));
    case 'ceil':
    case 'ceiling':
      return Math.ceil(Number(a[0]));
    case 'round':
      return a[1] === undefined ? Math.round(Number(a[0])) : Number(Number(a[0]).toFixed(Number(a[1])));
    case 'abs':
      return Math.abs(Number(a[0]));
    case 'greatest':
      return Math.max(...a.map(Number));
    case 'least':
      return Math.min(...a.map(Number));
    case 'exp':
      return Math.exp(Number(a[0]));
    case 'power':
    case 'pow':
      return Math.pow(Number(a[0]), Number(a[1]));
    case 'sqrt':
      return Math.sqrt(Number(a[0]));
    case 'now':
    case 'current_timestamp':
      return new Date().toISOString();
    case 'date_trunc': {
      const unit = String(a[0]);
      const d = new Date(String(a[1]));
      const out = new Date(d);
      out.setUTCMilliseconds(0);
      out.setUTCSeconds(0);
      out.setUTCMinutes(0);
      if (unit !== 'minute') out.setUTCHours(0);
      if (unit === 'week') {
        out.setUTCDate(out.getUTCDate() - ((out.getUTCDay() + 6) % 7));
      } else if (unit === 'month') {
        out.setUTCDate(1);
      } else if (unit === 'year') {
        out.setUTCDate(1);
        out.setUTCMonth(0);
      }
      return out.toISOString();
    }
    case 'to_tsvector':
      return toTsvector(String(a.length > 1 ? a[1] : a[0] ?? ''));
    case 'websearch_to_tsquery':
    case 'plainto_tsquery':
    case 'to_tsquery':
      return String(a.length > 1 ? a[1] : a[0] ?? '');
    case 'ts_rank':
    case 'ts_rank_cd': {
      const vec = tsvectorTokens(a[0]);
      const q = String(a[1] ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      let score = 0;
      for (const term of q) {
        const clean = term.replace(/^[&|!()']+|[&|!()'']+$/g, '');
        if (!clean) continue;
        score += vec.filter((t) => t === clean || t.startsWith(clean)).length / (1 + vec.length / 10);
      }
      return score;
    }
    case 'array_length':
      return Array.isArray(a[0]) ? a[0].length : null;
    case 'cardinality':
      return Array.isArray(a[0]) ? a[0].length : 0;
    case 'sha256':
    case 'md5':
      return String(a[0]);
    default:
      if (isAggregate(e.name)) {
        throw new Error(`memory-db: aggregate ${e.name}() used outside of an aggregate context`);
      }
      throw new Error(`memory-db: unsupported function ${e.name}()`);
  }
}

function evalPred(p: Where, ctx: EvalCtx): boolean {
  switch (p.k) {
    case 'and':
      return p.parts.every((x) => evalPred(x, ctx));
    case 'or':
      return p.parts.some((x) => evalPred(x, ctx));
    case 'not':
      return !evalPred(p.p, ctx);
    case 'cmp': {
      const l = evalExpr(p.l, ctx);
      const r = evalExpr(p.r, ctx);
      switch (p.op) {
        case '=':
          return eq(l, r);
        case '<>':
          return !eq(l, r);
        case '<':
          return cmpValues(l, r) < 0;
        case '>':
          return cmpValues(l, r) > 0;
        case '<=':
          return cmpValues(l, r) <= 0;
        case '>=':
          return cmpValues(l, r) >= 0;
      }
      return false;
    }
    case 'match': {
      const vec = tsvectorTokens(evalExpr(p.l, ctx));
      return tokensMatch(vec, evalExpr(p.r, ctx));
    }
    case 'null': {
      const v = evalExpr(p.e, ctx);
      const isNull = v === null || v === undefined;
      return p.neg ? !isNull : isNull;
    }
    case 'like': {
      const value = String(evalExpr(p.e, ctx) ?? '');
      const pattern = String(evalExpr(p.pattern, ctx) ?? '');
      const re = likeToRegExp(pattern);
      const hit = p.insensitive ? re.test(value.toLowerCase()) : re.test(value);
      return p.neg ? !hit : hit;
    }
    case 'in': {
      const value = evalExpr(p.e, ctx);
      const list =
        p.list instanceof Array
          ? p.list.map((x) => evalExpr(x, ctx))
          : runSelect(p.list, ctx.tables, ctx.schema, ctx.named, ctx.params, undefined, {
              ...(ctx.outer ?? {}),
              ...ctx.row,
            }).flatMap((r) => Object.values(r));
      const hit = list.some((v) => eq(value, v));
      return p.neg ? !hit : hit;
    }
    case 'between': {
      const v = evalExpr(p.e, ctx);
      const hit = cmpValues(v, evalExpr(p.lo, ctx)) >= 0 && cmpValues(v, evalExpr(p.hi, ctx)) <= 0;
      return p.neg ? !hit : hit;
    }
    case 'exists': {
      const rows = runSelect(p.sel, ctx.tables, ctx.schema, ctx.named, ctx.params, 1, {
        ...(ctx.outer ?? {}),
        ...ctx.row,
      });
      return p.neg ? rows.length === 0 : rows.length > 0;
    }
  }
}

/* ------------------------------------------------------------- relations */

interface Relation {
  rows: CtxRow[];
  /** Alias-qualified column names, so an empty outer join can still be padded. */
  columns: string[];
}

function relationRows(part: FromPart, tables: Tables, named: Record<string, Row[]>, schema: Record<string, TableDef>, params: Param[]): Relation {
  let rows: Row[];
  let names: string[];
  if (typeof part.name === 'string') {
    if (named[part.name]) rows = named[part.name];
    else if (tables[part.name]) rows = tables[part.name];
    else throw new Error(`memory-db: unknown relation ${part.name}`);
    names = schema[part.name]?.columns.map((c) => c.name) ?? Object.keys(rows[0] ?? {});
  } else {
    rows = runSelect(part.name, tables, schema, named, params);
    names = Object.keys(rows[0] ?? {});
  }
  const prefix = part.alias;
  return {
    columns: names.map((name) => `${prefix}.${name}`),
    rows: rows.map((row) => {
      const out: CtxRow = {};
      for (const name of names) out[`${prefix}.${name}`] = row[name] ?? null;
      return out;
    }),
  };
}

function buildRelation(
  node: Pick<SelectNode, 'from' | 'joins'>,
  tables: Tables,
  schema: Record<string, TableDef>,
  named: Record<string, Row[]>,
  params: Param[],
): CtxRow[] {
  if (node.from.length === 0) return [{}];
  let acc = relationRows(node.from[0], tables, named, schema, params).rows;
  for (let i = 1; i < node.from.length; i++) {
    const right = relationRows(node.from[i], tables, named, schema, params);
    acc = acc.flatMap((l) => right.rows.map((r) => ({ ...l, ...r })));
  }
  for (const join of node.joins) {
    const right = relationRows(join.part, tables, named, schema, params);
    const next: CtxRow[] = [];
    for (const l of acc) {
      let matched = false;
      for (const r of right.rows) {
        const combined = { ...l, ...r };
        if (!join.on || evalPred(join.on, { row: combined, params, tables, schema, named })) {
          next.push(combined);
          matched = true;
        }
      }
      if (!matched && join.type === 'left') {
        // Null-pad every column of the right side, even when it returned no
        // rows at all, so `select count(p.id) ... left join posts p` resolves.
        const empty: CtxRow = {};
        for (const column of right.columns) empty[column] = null;
        next.push({ ...l, ...empty });
      }
    }
    acc = next;
  }
  return acc;
}

/* ------------------------------------------------------------ aggregates */

function containsAggregate(e: Expr): boolean {
  switch (e.k) {
    case 'call':
      return isAggregate(e.name) || e.args.some(containsAggregate);
    case 'bin':
      return containsAggregate(e.l) || containsAggregate(e.r);
    case 'un':
      return containsAggregate(e.e);
    case 'cast':
      return containsAggregate(e.e);
    case 'sub':
      return false;
    default:
      return false;
  }
}

/**
 * Folds one aggregate over a group. `ORDER BY` inside an aggregate sorts the
 * group rows first, so `string_agg(name, ',' order by name)` behaves.
 */
function evalAggregate(e: Call, group: CtxRow[], ctx: Omit<EvalCtx, 'row'>): unknown {
  const arg = e.args[0];
  const star = Boolean(arg && 'star' in arg && arg.star);

  let rows = group;
  if (e.orderBy) {
    const spec = e.orderBy;
    rows = [...group].sort((a, b) => {
      const comparison = cmpValues(evalExpr(spec.expr, { ...ctx, row: a }), evalExpr(spec.expr, { ...ctx, row: b }));
      return spec.dir === 'desc' ? -comparison : comparison;
    });
  }

  let values: unknown[] = rows.map((row) => (star ? 1 : evalExpr(arg as Expr, { ...ctx, row })));
  // `count(distinct x)` de-duplicates first; objects are compared by their JSON
  // form because Set uses reference equality.
  if (e.distinct) {
    values = Array.from(new Set(values.map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))));
  }
  const present = values.filter((v) => v !== null && v !== undefined);

  switch (e.name) {
    case 'count':
      return star ? rows.length : present.length;
    case 'sum':
      return present.reduce<number>((acc, v) => acc + Number(v), 0);
    case 'avg':
      return present.length ? present.reduce<number>((acc, v) => acc + Number(v), 0) / present.length : null;
    case 'min':
      return present.reduce<unknown>((a, b) => (a === undefined || cmpValues(b, a) < 0 ? b : a), undefined);
    case 'max':
      return present.reduce<unknown>((a, b) => (a === undefined || cmpValues(b, a) > 0 ? b : a), undefined);
    case 'array_agg':
      return present;
    case 'string_agg': {
      const separator = e.args[1] ? String(evalExpr(e.args[1], { ...ctx, row: rows[0] ?? {} })) : ',';
      return present.map(String).join(separator);
    }
    case 'bool_or':
      return values.some(truthy);
    case 'bool_and':
      return values.every(truthy);
    default:
      throw new Error(`memory-db: unsupported aggregate ${e.name}()`);
  }
}

function sortRows(rows: CtxRow[], orderBy: { expr: Expr; dir: 'asc' | 'desc' }[], ctx: EvalCtx): CtxRow[] {
  if (orderBy.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const o of orderBy) {
      const av = evalExpr(o.expr, { ...ctx, row: a });
      const bv = evalExpr(o.expr, { ...ctx, row: b });
      const c = cmpValues(av, bv);
      if (c !== 0) return o.dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

/** Replaces aggregate calls inside an expression with their folded value. */
function foldAggregates(e: Expr, group: CtxRow[], ctx: Omit<EvalCtx, 'row'>, cache: Map<Expr, unknown>): Expr {
  if (e.k === 'call' && isAggregate(e.name)) {
    if (!cache.has(e)) cache.set(e, evalAggregate(e, group, ctx));
    return { k: 'lit', v: cache.get(e) };
  }
  if (e.k === 'bin') {
    return { k: 'bin', op: e.op, l: foldAggregates(e.l, group, ctx, cache), r: foldAggregates(e.r, group, ctx, cache) };
  }
  if (e.k === 'cast') return { k: 'cast', e: foldAggregates(e.e, group, ctx, cache), type: e.type };
  if (e.k === 'un') return { k: 'un', op: e.op, e: foldAggregates(e.e, group, ctx, cache) };
  if (e.k === 'call') {
    return { k: 'call', name: e.name, args: e.args.map((a) => foldAggregates(a, group, ctx, cache)), distinct: e.distinct, orderBy: e.orderBy };
  }
  return e;
}

/* ---------------------------------------------------------------- SELECT */

export function runSelect(
  node: SelectNode,
  tables: Tables,
  schema: Record<string, TableDef>,
  named: Record<string, Row[]>,
  params: Param[],
  hardLimit?: number,
  outerRow?: CtxRow,
): Row[] {
  const scope: Record<string, Row[]> = { ...named };
  for (const cte of node.ctes) {
    scope[cte.name] = runSelect(cte.sel, tables, schema, scope, params);
  }
  const base: Omit<EvalCtx, 'row'> = { params, tables, schema, named: scope, outer: outerRow };
  let rows = buildRelation(node, tables, schema, scope, params);
  if (node.where) rows = rows.filter((row) => evalPred(node.where as Where, { ...base, row }));

  const grouped = node.groupBy.length > 0 || node.items.some((i) => containsAggregate(i.expr));
  let outRows: Row[] = [];
  const ordinals = node.orderBy.map((_, i) => `__ord${i}`);

  if (grouped) {
    const groups = new Map<string, CtxRow[]>();
    if (node.groupBy.length === 0) {
      groups.set('', rows);
    } else {
      for (const row of rows) {
        const key = node.groupBy.map((g) => JSON.stringify(evalExpr(g, { ...base, row }))).join('|');
        const bucket = groups.get(key);
        if (bucket) bucket.push(row);
        else groups.set(key, [row]);
      }
    }
    for (const group of groups.values()) {
      const cache = new Map<Expr, unknown>();
      const out: Row = {};
      const first = group[0] ?? {};
      for (const item of node.items) {
        const name = itemName(item);
        if ('star' in item.expr && item.expr.star) {
          Object.assign(out, stripPrefix(first, item.expr.table));
          continue;
        }
        const folded = foldAggregates(item.expr, group, base, cache);
        out[name] = evalExpr(folded, { ...base, row: first });
      }
      if (node.having) {
        const cache2 = new Map<Expr, unknown>();
        const folded = foldPredAggregates(node.having, group, base, cache2);
        if (!evalPred(folded, { ...base, row: first })) continue;
      }
      // ORDER BY may reference aggregates or input columns that are not part of
      // the projection, so its keys are evaluated against the full group scope.
      node.orderBy.forEach((o, i) => {
        if (o.alias && o.alias in out) {
          out[ordinals[i]] = out[o.alias];
          return;
        }
        const expr = o.ordinal ? ({ k: 'ref', col: Object.keys(out)[o.ordinal - 1] ?? '' } as Expr) : o.expr;
        const cache3 = new Map<Expr, unknown>();
        out[ordinals[i]] = evalExpr(foldAggregates(expr, group, base, cache3), { ...base, row: first });
      });
      outRows.push(out);
    }
  } else {
    for (const row of rows) {
      const out: Row = {};
      for (const item of node.items) {
        if ('star' in item.expr && item.expr.star) {
          if (item.expr.table) Object.assign(out, stripPrefix(row, item.expr.table));
          else Object.assign(out, stripPrefix(row));
          continue;
        }
        out[itemName(item)] = evalExpr(item.expr, { ...base, row });
      }
      node.orderBy.forEach((o, i) => {
        out[ordinals[i]] = evalExpr(o.expr, { ...base, row });
      });
      outRows.push(out);
    }
  }

  outRows = sortRows(
    outRows,
    node.orderBy.map((o, i) => ({ expr: { k: 'ref', col: ordinals[i] } as Expr, dir: o.dir })),
    base as EvalCtx,
  );

  if ((node.orderBy as unknown as { distinct?: boolean })?.distinct) {
    const seen = new Set<string>();
    outRows = outRows.filter((r) => {
      const key = JSON.stringify(stripOrdinals(r, ordinals));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const offset = node.offset ? Number(evalExpr(node.offset, base as EvalCtx)) : 0;
  if (offset) outRows = outRows.slice(offset);
  const limit = hardLimit ?? (node.limit ? Number(evalExpr(node.limit, base as EvalCtx)) : undefined);
  if (limit !== undefined) outRows = outRows.slice(0, limit);
  return outRows.map((r) => stripOrdinals(r, ordinals));
}

function stripOrdinals(row: Row, ordinals: string[]): Row {
  if (ordinals.length === 0) return row;
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!ordinals.includes(k)) out[k] = v;
  return out;
}

function stripPrefix(row: CtxRow, only?: string): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    const dot = k.indexOf('.');
    if (dot === -1) continue;
    const table = k.slice(0, dot);
    const col = k.slice(dot + 1);
    if (only && table !== only) continue;
    out[col] = v;
  }
  return out;
}

function itemName(item: SelectItem): string {
  if (item.alias) return item.alias;
  const e = item.expr;
  if (e.k === 'ref') return e.col;
  if (e.k === 'call') return e.name;
  return '?column?';
}

function foldPredAggregates(p: Where, group: CtxRow[], base: Omit<EvalCtx, 'row'>, cache: Map<Expr, unknown>): Where {
  if (p.k === 'and' || p.k === 'or') return { ...p, parts: p.parts.map((x) => foldPredAggregates(x, group, base, cache)) };
  if (p.k === 'not') return { ...p, p: foldPredAggregates(p.p, group, base, cache) };
  if (p.k === 'cmp') return { ...p, l: foldAggregates(p.l, group, base, cache), r: foldAggregates(p.r, group, base, cache) };
  return p;
}

/* ------------------------------------------------- INSERT / UPDATE / DELETE */

function generateRow(def: TableDef, provided: Record<string, unknown>, counters: Record<string, number>): Row {
  const row: Row = {};
  for (const col of def.columns) {
    if (col.name in provided) {
      row[col.name] = coerce(provided[col.name], col.type);
    } else if (col.identity) {
      counters[col.name] = (counters[col.name] ?? 0) + 1;
      row[col.name] = counters[col.name];
    } else if (col.defaultNow) {
      row[col.name] = new Date().toISOString();
    } else if (col.default0) {
      row[col.name] = 0;
    } else if ('defaultValue' in col) {
      row[col.name] = coerce(col.defaultValue, col.type);
    } else if (col.defaultNull) {
      row[col.name] = null;
    } else if (col.generated) {
      row[col.name] = null;
    } else {
      row[col.name] = null;
    }
  }
  for (const col of def.columns) {
    if (col.generated) row[col.name] = col.generated(row);
  }
  return row;
}

function execInsert(node: InsertNode, tables: Tables, schema: Record<string, TableDef>, counters: Record<string, number>, params: Param[]): Row[] {
  const def = schema[node.table];
  if (!def) throw new Error(`memory-db: unknown table ${node.table}`);
  const inserted: Row[] = [];
  const tuples: unknown[][] = node.select
    ? runSelect(node.select, tables, schema, {}, params).map((row) => Object.values(row))
    : node.values.map((tuple) => tuple.map((e) => evalExpr(e, { row: {}, params, tables, schema, named: {} })));
  for (const tuple of tuples) {
    const provided: Record<string, unknown> = {};
    node.columns.forEach((col, i) => {
      provided[col] = tuple[i];
    });
    const candidate = generateRow(def, provided, counters);
    const conflictKey = node.conflict?.target.length ? node.conflict.target : def.unique[0] ?? [];
    const clash = conflictKey.length
      ? tables[node.table].find((r) => conflictKey.every((k) => eq(r[k], candidate[k])))
      : undefined;
    if (clash) {
      if (!node.conflict || node.conflict.action === 'nothing') continue;
      for (const s of node.conflict.action.set) {
        // `excluded` is exposed as a row alias, exactly like Postgres does.
        clash[s.col] = coerce(
          evalExpr(s.expr, {
            row: { ...prefix(node.table, clash), ...prefix('excluded', candidate) },
            params,
            tables,
            schema,
            named: {},
          }),
          colType(def, s.col),
        );
      }
      for (const col of def.columns) if (col.generated) clash[col.name] = col.generated(clash);
      clash.updated_at = new Date().toISOString();
      inserted.push(clash);
      continue;
    }
    tables[node.table].push(candidate);
    inserted.push(candidate);
  }
  return project(inserted, node.returning, node.table, params, tables, schema);
}

function prefix(alias: string, row: Row): CtxRow {
  const out: CtxRow = {};
  for (const [k, v] of Object.entries(row)) out[`${alias}.${k}`] = v;
  return out;
}

function colType(def: TableDef, name: string): ColType {
  return def.columns.find((c) => c.name === name)?.type ?? 'text';
}

function execUpdate(node: UpdateNode, tables: Tables, schema: Record<string, TableDef>, params: Param[]): Row[] {
  const def = schema[node.table];
  if (!def) throw new Error(`memory-db: unknown table ${node.table}`);
  const alias = node.alias ?? node.table;
  const rows = tables[node.table];
  const ctxBase = { params, tables, schema, named: {} };
  const hits = rows.filter((row) => !node.where || evalPred(node.where, { ...ctxBase, row: prefix(alias, row) }));
  for (const row of hits) {
    const scope = prefix(alias, row);
    for (const s of node.set) {
      row[s.col] = coerce(evalExpr(s.expr, { ...ctxBase, row: scope }), colType(def, s.col));
    }
    for (const col of def.columns) if (col.generated) row[col.name] = col.generated(row);
    // Mirrors the `set_updated_at()` trigger.
    if (def.columns.some((c) => c.name === 'updated_at')) row.updated_at = new Date().toISOString();
  }
  return project(hits, node.returning, node.table, params, tables, schema);
}

function execDelete(node: DeleteNode, tables: Tables, schema: Record<string, TableDef>, params: Param[]): Row[] {
  const alias = node.alias ?? node.table;
  const rows = tables[node.table];
  if (!rows) throw new Error(`memory-db: unknown table ${node.table}`);
  const ctxBase = { params, tables, schema, named: {} };
  const hits = rows.filter((row) => !node.where || evalPred(node.where, { ...ctxBase, row: prefix(alias, row) }));
  const hitSet = new Set(hits);
  tables[node.table] = rows.filter((r) => !hitSet.has(r));
  cascadeDeletes(node.table, hits, tables, schema);
  return project(hits, node.returning, node.table, params, tables, schema);
}

const FK_CHILDREN: Record<string, { table: string; column: string }[]> = {
  users: [
    { table: 'sessions', column: 'user_id' },
    { table: 'posts', column: 'author_id' },
    { table: 'claps', column: 'user_id' },
    { table: 'comments', column: 'user_id' },
    { table: 'bookmarks', column: 'user_id' },
  ],
  posts: [
    { table: 'post_tags', column: 'post_id' },
    { table: 'claps', column: 'post_id' },
    { table: 'comments', column: 'post_id' },
    { table: 'bookmarks', column: 'post_id' },
    { table: 'post_views', column: 'post_id' },
  ],
  tags: [{ table: 'post_tags', column: 'tag_id' }],
  comments: [{ table: 'comments', column: 'parent_id' }],
};

function cascadeDeletes(table: string, deleted: Row[], tables: Tables, schema: Record<string, TableDef>) {
  for (const child of FK_CHILDREN[table] ?? []) {
    if (!tables[child.table]) continue;
    const doomed = tables[child.table].filter((r) => deleted.some((d) => eq(r[child.column], d.id)));
    if (doomed.length === 0) continue;
    const set = new Set(doomed);
    tables[child.table] = tables[child.table].filter((r) => !set.has(r));
    cascadeDeletes(child.table, doomed, tables, schema);
  }
}

function project(rows: Row[], items: SelectItem[], table: string, params: Param[], tables: Tables, schema: Record<string, TableDef>): Row[] {
  if (items.length === 0) return [];
  return rows.map((row) => {
    const out: Row = {};
    const scope = { ...prefix(table, row), ...row };
    for (const item of items) {
      if ('star' in item.expr && item.expr.star) {
        Object.assign(out, row);
        continue;
      }
      out[itemName(item)] = evalExpr(item.expr, { row: scope, params, tables, schema, named: {} });
    }
    return out;
  });
}

/* ------------------------------------------------------------ result meta */

function fieldFor(def: TableDef | undefined, col: string): Field {
  const type = def?.columns.find((c) => c.name === col)?.type ?? 'text';
  return { name: col, dataTypeID: oidFor(type) };
}

export function oidFor(type: ColType): number {
  switch (type) {
    case 'bool':
      return OID.bool;
    case 'int':
      return OID.int4;
    case 'bigint':
      return OID.int8;
    case 'float':
      return OID.float8;
    case 'timestamptz':
      return OID.timestamptz;
    case 'tsvector':
      return OID.tsvector;
    case 'text[]':
      return OID.textArray;
    default:
      return OID.text;
  }
}

function inferFields(rows: Row[], schema: Record<string, TableDef>): Field[] {
  if (rows.length === 0) return [];
  const byName = new Map<string, ColType>();
  for (const def of Object.values(schema)) {
    for (const c of def.columns) if (!byName.has(c.name)) byName.set(c.name, c.type);
  }
  return Object.entries(rows[0]).map(([name, value]) => ({
    name,
    dataTypeID: oidFor(
      byName.get(name) ??
        (typeof value === 'number'
          ? 'float'
          : typeof value === 'boolean'
            ? 'bool'
            : Array.isArray(value)
              ? 'text[]'
              : isDateLike(value)
                ? 'timestamptz'
                : 'text'),
    ),
  }));
}

/* ------------------------------------------------------------------ engine */

export class MemoryDb {
  readonly tables: Tables = {};
  private counters: Record<string, number> = {};

  constructor(public readonly schema: Record<string, TableDef>) {
    for (const name of Object.keys(schema)) this.tables[name] = [];
  }

  reset() {
    for (const name of Object.keys(this.tables)) this.tables[name] = [];
    this.counters = {};
  }

  /** Seeds a table with rows that skip SQL parsing (used by db/seed.ts). */
  insertRow(table: string, values: Record<string, unknown>): Row {
    const def = this.schema[table];
    if (!def) throw new Error(`memory-db: unknown table ${table}`);
    const row = generateRow(def, values, this.counters);
    this.tables[table].push(row);
    return row;
  }

  exec<T = Record<string, unknown>>(sql: string, params: Param[] = []): T[] {
    const stmt = parseSql(sql);
    const named: Record<string, Row[]> = {};
    const schema = this.schema;
    const tables = this.tables;
    for (const cte of stmt.ctes) named[cte.name] = runSelect(cte.sel, tables, schema, named, params);

    if (stmt.k === 'select') {
      const rows = runSelect(stmt as unknown as SelectNode, tables, schema, named, params);
      this.lastFields = inferFields(rows, schema);
      this.lastCommand = 'SELECT';
      return rows as T[];
    }
    if (stmt.k === 'insert') {
      const rows = execInsert(stmt, tables, schema, this.counters, params);
      this.lastFields = inferFields(rows, schema);
      this.lastCommand = 'INSERT';
      return rows as T[];
    }
    if (stmt.k === 'update') {
      const rows = execUpdate(stmt, tables, schema, params);
      this.lastFields = inferFields(rows, schema);
      this.lastCommand = 'UPDATE';
      return rows as T[];
    }
    const rows = execDelete(stmt, tables, schema, params);
    this.lastFields = inferFields(rows, schema);
    this.lastCommand = 'DELETE';
    return rows as T[];
  }

  private lastFields: Field[] = [];
  private lastCommand = 'SELECT';

  query<T = Record<string, unknown>>(sql: string, params: Param[] = []): QueryResult<T> {
    const rows = this.exec<T>(sql, params);
    return { rows, fields: this.lastFields, rowCount: rows.length, command: this.lastCommand };
  }

  transaction<T = Record<string, unknown>>(statements: { text: string; params?: Param[] }[]): QueryResult<T> {
    const snapshot = JSON.stringify(this.tables);
    try {
      let last: T[] = [];
      for (const s of statements) last = this.exec<T>(s.text, s.params ?? []);
      return { rows: last, fields: this.lastFields, rowCount: last.length, command: this.lastCommand };
    } catch (error) {
      // `tables` is readonly, so the snapshot is restored in place.
      const restored = JSON.parse(snapshot) as Tables;
      for (const key of Object.keys(this.tables)) delete this.tables[key];
      Object.assign(this.tables, restored);
      throw error;
    }
  }
}
