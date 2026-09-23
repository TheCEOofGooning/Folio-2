/**
 * Splits a SQL script into individual statements.
 *
 * Deliberately not a regex one-liner: it tracks single quotes (with `''`
 * escaping), double-quoted identifiers, line comments, block comments and
 * Postgres dollar-quoted bodies (`$$ … $$`, `$tag$ … $tag$`, used by the
 * pg_trgm guard in `schema.sql`). A naive `split(";")` would break that block.
 */
export function splitStatements(script) {
  const statements = [];
  let current = "";
  let index = 0;

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed && !/^[\s;]*$/.test(trimmed)) statements.push(trimmed);
    current = "";
  };

  while (index < script.length) {
    const char = script[index];
    const next = script[index + 1];

    // -- line comment
    if (char === "-" && next === "-") {
      const end = script.indexOf("\n", index);
      index = end === -1 ? script.length : end + 1;
      current += "\n";
      continue;
    }

    // /* block comment */
    if (char === "/" && next === "*") {
      const end = script.indexOf("*/", index + 2);
      index = end === -1 ? script.length : end + 2;
      continue;
    }

    // 'string literal' (with '' escape)
    if (char === "'") {
      let cursor = index + 1;
      while (cursor < script.length) {
        if (script[cursor] === "'" && script[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (script[cursor] === "'") break;
        cursor += 1;
      }
      current += script.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }

    // "quoted identifier"
    if (char === '"') {
      const end = script.indexOf('"', index + 1);
      index = end === -1 ? script.length : end + 1;
      current += script.slice(index - (end - index + 1) - 1 + 1, index);
      continue;
    }

    // $tag$ … $tag$ dollar-quoted body
    if (char === "$") {
      const tagMatch = /^\$[A-Za-z_]*\$/.exec(script.slice(index));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = script.indexOf(tag, index + tag.length);
        const stop = end === -1 ? script.length : end + tag.length;
        current += script.slice(index, stop);
        index = stop;
        continue;
      }
    }

    if (char === ";") {
      pushCurrent();
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  pushCurrent();
  return statements;
}

/** Statements that reset a Folio database (child tables first). */
export const DROP_STATEMENTS = [
  "drop table if exists comments cascade",
  "drop table if exists claps cascade",
  "drop table if exists bookmarks cascade",
  "drop table if exists reading_history cascade",
  "drop table if exists post_views cascade",
  "drop table if exists follows cascade",
  "drop table if exists tag_stats cascade",
  "drop table if exists sessions cascade",
  "drop table if exists posts cascade",
  "drop table if exists users cascade",
];
