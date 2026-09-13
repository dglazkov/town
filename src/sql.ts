// The sql seam: what the store needs of a database, and nothing more.
// `fileSql` is node:sqlite over a file, the laptop's; the box's is the
// object's `ctx.storage.sql`, the same five. The object's driver binds
// positional parameters alone, and SQLite binds a named one it was not
// given as null and says nothing, so the file driver refuses a query
// with a named parameter before it runs: the laptop proves the box's rule.
// node:sqlite is loaded here, without its warning.

import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | bigint | Uint8Array | null;

export interface Sql {
  all<T>(sql: string, ...params: SqlValue[]): T[];
  get<T>(sql: string, ...params: SqlValue[]): T | undefined;
  run(sql: string, ...params: SqlValue[]): { changes: number };
  /** Many statements, no parameters: the schema and its migrations. */
  exec(text: string): void;
  /** `fn` whole or not at all. */
  transaction<T>(fn: () => T): T;
}

/** A file's Sql, and the file closed when the store is. */
export interface FileSql extends Sql {
  close(): void;
}

// node:sqlite prints an ExperimentalWarning when it loads; the town's
// binaries speak on stderr to people and agents, so that one line is
// dropped and every other warning passes.
let loaded: typeof import("node:sqlite") | null = null;

function loadSqlite(): typeof import("node:sqlite") {
  if (loaded) return loaded;
  const emit = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    return (emit as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    loaded = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    return loaded;
  } finally {
    process.emitWarning = emit;
  }
}

/**
 * The first named parameter in `sql`, `:name`, `@name`, or `$name`, outside
 * string literals, quoted identifiers, and comments; null when there is none.
 */
export function namedParameter(sql: string): string | null {
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === "'" || c === '"' || c === "`") {
      const end = sql.indexOf(c, i + 1);
      if (end === -1) return null;
      i = end; // a doubled quote is two literals back to back, and neither names a parameter
    } else if (c === "[") {
      const end = sql.indexOf("]", i + 1);
      if (end === -1) return null;
      i = end;
    } else if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end === -1) return null;
      i = end;
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return null;
      i = end + 1;
    } else if ((c === ":" || c === "@" || c === "$") && /[A-Za-z_]/.test(sql[i + 1] ?? "")) {
      return `${c}${/^[A-Za-z0-9_]+/.exec(sql.slice(i + 1))![0]}`;
    }
  }
  return null;
}

/** node:sqlite over a file, loaded without its warning. */
export function fileSql(file: string): FileSql {
  const { DatabaseSync } = loadSqlite();
  const db: DatabaseSync = new DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch (err) {
    db.close();
    throw err;
  }
  const prepare = (sql: string) => {
    const named = namedParameter(sql);
    if (named !== null) throw new Error(`the query names a parameter, ${named}; write ? and pass the values in order, since the box's SQL binds positional parameters alone: ${sql.replace(/\s+/g, " ").trim()}`);
    return db.prepare(sql);
  };
  return {
    all: <T>(sql: string, ...params: SqlValue[]) => prepare(sql).all(...params) as T[],
    get: <T>(sql: string, ...params: SqlValue[]) => prepare(sql).get(...params) as T | undefined,
    run: (sql: string, ...params: SqlValue[]) => ({ changes: Number(prepare(sql).run(...params).changes) }),
    exec: (text: string) => db.exec(text),
    transaction<T>(fn: () => T): T {
      db.exec("BEGIN IMMEDIATE");
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    close: () => db.close(),
  };
}
