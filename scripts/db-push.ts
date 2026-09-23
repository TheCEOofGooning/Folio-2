/**
 * scripts/db-push.ts — applies db/schema.sql to your Neon database.
 *
 *   npm run db:push
 *
 * There is no migration framework on purpose: the schema is idempotent
 * (`create table if not exists`, `create or replace function`), so pushing it
 * is safe to re-run and there is nothing to version. When you need a
 * destructive change, write it as an explicit `alter table` here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
/**
 * Splits a script on `;` while respecting single-quoted strings, `--` line
 * comments and `$$ … $$` function bodies — the one thing a naive split gets
 * wrong, and the reason most hand-rolled pushers choke on triggers.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let inDollar = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      current += char;
      continue;
    }
    if (!inString && !inDollar && char === '-' && next === '-') {
      inLineComment = true;
      current += char;
      continue;
    }
    if (!inString && char === '$' && next === '$') {
      inDollar = !inDollar;
      current += '$$';
      i++;
      continue;
    }
    if (!inDollar && char === "'") {
      inString = !inString;
      current += char;
      continue;
    }
    if (char === ';' && !inString && !inDollar) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.');
    process.exit(1);
  }

  const sql = neon(url);
  const script = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  const statements = splitStatements(script);

  console.log(`Applying ${statements.length} statements to Neon…`);
  for (const [index, statement] of statements.entries()) {
    const label = statement.split('\n')[0].slice(0, 72);
    try {
      await sql.query(statement);
      console.log(`  ${String(index + 1).padStart(3, ' ')} ✓ ${label}`);
    } catch (error) {
      console.error(`  ${String(index + 1).padStart(3, ' ')} ✗ ${label}`);
      console.error(`      ${(error as Error).message}`);
      process.exit(1);
    }
  }
  console.log('Schema applied. Next: npm run db:seed');
}

/**
 * Runs only when executed directly, so `splitStatements` stays importable by
 * the test suite without tripping the DATABASE_URL check.
 */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) void main();
