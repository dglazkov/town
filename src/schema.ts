// The schema: the store's tables, as each project left them, and the
// migrations that bring an older store to this code's schema on open,
// over the sql seam. It loads no database itself: src/sql.ts does.

import type { CredentialType } from "./credentials.js";
import type { Sql } from "./sql.js";
import { StoreError } from "./store.js";

/** The schema this code writes to `meta.schema`. Gate's store wrote none; vault's wrote 2; compose's 3; hall's 4; wall's 5; consent's 6. */
export const SCHEMA_VERSION = 7;

/** The type every store is made with. */
export const SEEDED_TYPES: ReadonlyArray<Pick<CredentialType, "name" | "origin" | "header">> = [
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

export function setMeta(sql: Sql, key: string, value: string): void {
  sql.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export function getMeta(sql: Sql, key: string): string | null {
  const row = sql.get<Row>("SELECT value FROM meta WHERE key = ?", key);
  return row ? String(row.value) : null;
}

/** The store's tables over `sql`, made or brought to this schema; `where` names the store in a refusal. */
export function openSchema(sql: Sql, where: string): void {
  sql.exec(SCHEMA);
  migrate(sql, where);
}

/**
 * Brings an older store to schema 7, a step at a time. From gate's (no
 * `meta.schema`) to 2: the two tables, the two columns, the seeded type.
 * From vault's 2 to 3: `calls.call_id`, each old row given one, and
 * `calls.parent`, null for every old row. From compose's 3 to 4: the
 * permits table, `shops.owner` and `grants.source`, null for every old
 * row: an operator's shop and an operator's grant. From hall's 4 to 5:
 * `calls.wall`, the kind of wall a call's process ran within, null for
 * every old row, as for a call that ran no process. From wall's 5 to 6,
 * consent's: `credential_types.kind` (`token`), `state` (`held`),
 * `proposed_by`, `guidance` (empty), `oauth`, and `client`, so every old
 * type is a held token type; `credentials.scopes` and `revoked_why`, null;
 * and `shops.tested_at`, set to `added_at`, since every shop in a store
 * made before consent was tested when it was added. From consent's 6 to
 * 7, box's: no column and no row, since `calls.wall` takes a third word,
 * `isolate`, for a call whose process was an isolate on the box, beside
 * `seatbelt` and `none`, and every old row keeps the word it has. Done
 * under a write lock, so a second process opening the same store at the
 * same moment finds the work done.
 */
function migrate(sql: Sql, where: string, now = Date.now()): void {
  const version = () => Number(getMeta(sql, "schema") ?? "1");
  if (version() === SCHEMA_VERSION) return;
  if (version() > SCHEMA_VERSION) {
    throw new StoreError(`${where} is schema ${version()}, newer than this town's ${SCHEMA_VERSION}; run the town that made it`);
  }
  sql.transaction(() => {
    const addColumn = (table: string, column: string, decl: string) => {
      const cols = sql.all<Row>(`PRAGMA table_info(${table})`).map((r) => String(r.name));
      if (!cols.includes(column)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    };
    if (version() < 2) {
      sql.exec(VAULT_TABLES);
      addColumn("grants", "credentials", "TEXT NOT NULL DEFAULT '{}'");
      addColumn("calls", "credentials", "TEXT NOT NULL DEFAULT '[]'");
      for (const t of SEEDED_TYPES) {
        sql.run("INSERT OR IGNORE INTO credential_types (name, origin, header, added_at) VALUES (?, ?, ?, ?)", t.name, t.origin, t.header, now);
      }
      setMeta(sql, "schema", "2");
    }
    if (version() < 3) {
      addColumn("calls", "call_id", "TEXT");
      addColumn("calls", "parent", "TEXT");
      sql.exec("UPDATE calls SET call_id = 'call_' || lower(hex(randomblob(8))) WHERE call_id IS NULL");
      sql.exec(COMPOSE_INDEXES);
      setMeta(sql, "schema", "3");
    }
    if (version() < 4) {
      sql.exec(HALL_TABLES);
      addColumn("shops", "owner", "TEXT");
      addColumn("grants", "source", "TEXT");
      setMeta(sql, "schema", "4");
    }
    if (version() < 5) {
      addColumn("calls", "wall", "TEXT");
      setMeta(sql, "schema", "5");
    }
    if (version() < 6) {
      addColumn("credential_types", "kind", "TEXT NOT NULL DEFAULT 'token'");
      addColumn("credential_types", "state", "TEXT NOT NULL DEFAULT 'held'");
      addColumn("credential_types", "proposed_by", "TEXT");
      addColumn("credential_types", "guidance", "TEXT NOT NULL DEFAULT ''");
      addColumn("credential_types", "oauth", "TEXT");
      addColumn("credential_types", "client", "BLOB");
      addColumn("credentials", "scopes", "TEXT");
      addColumn("credentials", "revoked_why", "TEXT");
      addColumn("shops", "tested_at", "INTEGER");
      sql.exec("UPDATE shops SET tested_at = added_at WHERE tested_at IS NULL");
      setMeta(sql, "schema", "6");
    }
    if (version() < 7) {
      setMeta(sql, "schema", "7");
    }
  });
}
