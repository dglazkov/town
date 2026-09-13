// The schema: the store's tables at <data>/town.db, as each project left
// them, and the migrations that bring an older store's file to this code's
// schema on open. node:sqlite is loaded here, without its warning.

import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { createRequire } from "node:module";
import type { CredentialType } from "./credentials.js";
import { StoreError } from "./store.js";

// node:sqlite prints an ExperimentalWarning when it loads; the town's
// binaries speak on stderr to people and agents, so that one line is
// dropped and every other warning passes.
const { DatabaseSync } = loadSqlite();

function loadSqlite(): typeof import("node:sqlite") {
  const emit = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    return (emit as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  } finally {
    process.emitWarning = emit;
  }
}

/** The schema this code writes to `meta.schema`. Gate's store wrote none; vault's wrote 2; compose's 3; hall's 4. */
export const SCHEMA_VERSION = 5;

/** The type every store is made with. */
export const SEEDED_TYPES: ReadonlyArray<Omit<CredentialType, "addedAt">> = [
  { name: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}" },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES passes(id),
  shop TEXT NOT NULL,
  commands TEXT NOT NULL,
  constraints TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS shops (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  pass_id TEXT,
  grant_id TEXT,
  shop TEXT,
  command TEXT,
  argv_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  exit INTEGER NOT NULL,
  shop_exit INTEGER,
  latency_ms INTEGER NOT NULL,
  notices TEXT NOT NULL,
  stderr TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS calls_pass ON calls(pass_id, at);
CREATE INDEX IF NOT EXISTS calls_grant ON calls(grant_id, at);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Schema 2, vault's: made on a new store and on a store gate made, the
// same way, in one transaction on open.
const VAULT_TABLES = `
CREATE TABLE IF NOT EXISTS credential_types (
  name TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  header TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sealed BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS credentials_user ON credentials(user_id, type);
`;

// Schema 3, compose's: the call tree's two columns are added by the
// migration, on a new store as on vault's, and indexed here.
const COMPOSE_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS calls_call_id ON calls(call_id);
CREATE INDEX IF NOT EXISTS calls_parent ON calls(parent);
`;

// Schema 4, hall's: the permits table, and at most one pending permit of
// a pass at a shop. `shops.owner` and `grants.source` are added by the
// migration, on a new store as on compose's.
const HALL_TABLES = `
CREATE TABLE IF NOT EXISTS permits (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES passes(id),
  shop TEXT NOT NULL,
  commands TEXT NOT NULL,
  constraints TEXT NOT NULL,
  why TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decision TEXT,
  grant_id TEXT
);
CREATE INDEX IF NOT EXISTS permits_pass ON permits(pass_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS permits_pending ON permits(pass_id, shop) WHERE decision IS NULL;
`;

type Row = Record<string, unknown>;

export function setMeta(db: Database, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as Row | undefined;
  return row ? String(row.value) : null;
}

/** The store's file under `dataDir`, made or brought to this schema; closed again when that fails. */
export function openDatabase(dataDir: string): Database {
  const db = new DatabaseSync(path.join(dataDir, "town.db"));
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  try {
    db.exec(SCHEMA);
    migrate(db, dataDir);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

/**
 * Brings an older store to schema 5, a step at a time. From gate's (no
 * `meta.schema`) to 2: the two tables, the two columns, the seeded type.
 * From vault's 2 to 3: `calls.call_id`, each old row given one, and
 * `calls.parent`, null for every old row. From compose's 3 to 4: the
 * permits table, `shops.owner` and `grants.source`, null for every old
 * row: an operator's shop and an operator's grant. From hall's 4 to 5:
 * `calls.wall`, the kind of wall a call's process ran within, null for
 * every old row, as for a call that ran no process. Done under a write
 * lock, so a second process opening the same file at the same moment
 * finds the work done.
 */
function migrate(db: Database, dataDir: string, now = Date.now()): void {
  const version = () => Number(getMeta(db, "schema") ?? "1");
  if (version() === SCHEMA_VERSION) return;
  if (version() > SCHEMA_VERSION) {
    throw new StoreError(`${path.join(dataDir, "town.db")} is schema ${version()}, newer than this town's ${SCHEMA_VERSION}; run the town that made it`);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const addColumn = (table: string, column: string, decl: string) => {
      const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => String(r.name));
      if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    };
    if (version() < 2) {
      db.exec(VAULT_TABLES);
      addColumn("grants", "credentials", "TEXT NOT NULL DEFAULT '{}'");
      addColumn("calls", "credentials", "TEXT NOT NULL DEFAULT '[]'");
      for (const t of SEEDED_TYPES) {
        db.prepare("INSERT OR IGNORE INTO credential_types (name, origin, header, added_at) VALUES (?, ?, ?, ?)").run(t.name, t.origin, t.header, now);
      }
      setMeta(db, "schema", "2");
    }
    if (version() < 3) {
      addColumn("calls", "call_id", "TEXT");
      addColumn("calls", "parent", "TEXT");
      db.exec("UPDATE calls SET call_id = 'call_' || lower(hex(randomblob(8))) WHERE call_id IS NULL");
      db.exec(COMPOSE_INDEXES);
      setMeta(db, "schema", "3");
    }
    if (version() < 4) {
      db.exec(HALL_TABLES);
      addColumn("shops", "owner", "TEXT");
      addColumn("grants", "source", "TEXT");
      setMeta(db, "schema", "4");
    }
    if (version() < 5) {
      addColumn("calls", "wall", "TEXT");
      setMeta(db, "schema", "5");
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
