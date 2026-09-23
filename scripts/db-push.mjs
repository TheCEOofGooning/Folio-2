/**
 * `npm run db:push`          — apply src/db/schema.sql (idempotent, safe to re-run)
 * `npm run db:push --reset`  — drop every Folio table first, then apply
 *
 * Targets whatever DATABASE_URL points at: the local PGlite sidecar in dev, or a
 * Neon branch in CI/production. No ORM, no migration table — schema.sql is the
 * source of truth and every statement is `if not exists`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, query, resolveEndpoint, connectionString } from "./neon-http.mjs";
import { DROP_STATEMENTS, splitStatements } from "./sql-split.mjs";

loadEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reset = process.argv.includes("--reset");
const url = connectionString();

console.log(`\n  \x1b[2mfolio · db:push\x1b[0m`);
console.log(`  \x1b[2mtarget\x1b[0m   ${url.replace(/:\/\/[^@]*@/, "://•••@")}`);
console.log(`  \x1b[2mendpoint\x1b[0m ${resolveEndpoint(url)}`);

async function run(statements, label) {
  let done = 0;
  for (const statement of statements) {
    try {
      await query(statement);
      done += 1;
    } catch (error) {
      console.error(`\n  ✗ ${label} failed on statement ${done + 1}:\n`);
      console.error(`    ${statement.replace(/\s+/g, " ").slice(0, 300)}\n`);
      console.error(`    ${error.message}\n`);
      process.exit(1);
    }
  }
  return done;
}

if (reset) {
  const dropped = await run(DROP_STATEMENTS, "reset");
  console.log(`  \x1b[33mreset\x1b[0m    dropped ${dropped} tables`);
}

const statements = splitStatements(readFileSync(resolve(root, "src/db/schema.sql"), "utf8"));
const applied = await run(statements, "schema");

const { rows } = await query(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`,
);
const tables = rows.map((row) => row.table_name);

console.log(`  \x1b[32m✓\x1b[0m schema   ${applied} statements applied`);
console.log(`  \x1b[2mtables\x1b[0m   ${tables.join(", ")}\n`);
console.log(`  next: \x1b[1mnpm run db:seed\x1b[0m to load demo authors and essays\n`);
