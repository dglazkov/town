// The object's seams: what the store needs, over the box's Durable
// Object and nothing of a disk. The driver is the sql seam's five over
// `ctx.storage.sql`: a query's rows by `exec(...).toArray()`, a write's
// changes by `rowsWritten`, many statements by one `exec`, and a
// transaction by `transactionSync`, whole or not at all; it binds
// positional parameters alone, as the file driver proves on a laptop, so a
// named one is refused before it runs, and blobs come back as bytes, as
// node:sqlite gives them. The shelf is the `shop_files` table, a row per
// file by shop and path with its content and mode; a put is whole. A
// shop's state is `shop_state`, a row per file by root, shop, user, and
// path: the store's own root for a call, a scratch root for a shop test,
// removed with its rows. A consent waiting on its landing is `consents`.
// These three tables are the object's own, beside the store's schema,
// which src/schema.ts makes and migrates over the driver as on a laptop.
// The key is the `TOWN_VAULT_KEY` secret, thirty-two bytes as hex, made
// by the deploy and never by the town; a box without it refuses to seal or
// open with vault's words and the secret's name. Staging is the files in
// memory, since the isolate is handed a map and never a directory.

import { randomBytes } from "node:crypto";
import type { BundleFile } from "./bundle.js";
import { KEY_MISSING } from "./gate.js";
import { filesShelf } from "./publish.js";
import type { Shelf } from "./shelf.js";
import { refuseNamed, type Sql, type SqlValue } from "./sql.js";
import { Store } from "./store.js";
import { KEY_BYTES, VaultError, type KeySource } from "./vault.js";

/** The object's name: one per box. */
export const TOWN_OBJECT = "town";

/** The secret the vault's key is read from on the box. */
export const KEY_SECRET = "TOWN_VAULT_KEY";

/** The root the store's shops' state is kept under in `shop_state`: a name, not a path. */
export const BOX_STATE_ROOT = "state";

/** Where a refusal says the box's store is. */
export const BOX_STORE = "the box's object";

/** The object's own tables, beside the store's: the shelf, the shops' state, and the consents waiting on a landing. */
export const OBJECT_TABLES = `
CREATE TABLE IF NOT EXISTS shop_files (
  shop TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  mode INTEGER NOT NULL,
  PRIMARY KEY (shop, path)
);
CREATE TABLE IF NOT EXISTS shop_state (
  root TEXT NOT NULL,
  shop TEXT NOT NULL,
  user TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (root, shop, user, path)
);
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  sealed BLOB NOT NULL,
  expires_at INTEGER NOT NULL,
  landing INTEGER NOT NULL DEFAULT 0,
  outcome TEXT
);
`;

type Row = Record<string, unknown>;

/** A parameter as the object's SQL binds it: bytes as an ArrayBuffer, a bigint as a number. */
function bind(v: SqlValue): string | number | ArrayBuffer | null {
  if (v instanceof Uint8Array) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  if (typeof v === "bigint") return Number(v);
  return v;
}

/** A row as node:sqlite gives it: a blob as bytes. */
function unbind(r: Row): Row {
  for (const [k, v] of Object.entries(r)) if (v instanceof ArrayBuffer) r[k] = new Uint8Array(v);
  return r;
}

/** The sql seam over a Durable Object's own SQLite. */
export function objectSql(storage: DurableObjectStorage): Sql {
  const exec = (sql: string, params: SqlValue[]) => {
    refuseNamed(sql);
    return storage.sql.exec(sql, ...params.map(bind));
  };
  return {
    all: <T>(sql: string, ...params: SqlValue[]) => exec(sql, params).toArray().map(unbind) as T[],
    get: <T>(sql: string, ...params: SqlValue[]) => exec(sql, params).toArray().map(unbind)[0] as T | undefined,
    run(sql: string, ...params: SqlValue[]) {
      const cursor = exec(sql, params);
      cursor.toArray();
      return { changes: cursor.rowsWritten };
    },
    exec: (text: string) => void storage.sql.exec(text).toArray(),
    transaction: <T>(fn: () => T): T => storage.transactionSync(fn),
  };
}

/** The shelf as rows: `shop_files`, a shop's files by path. */
export function rowsShelf(sql: Sql): Shelf {
  return {
    read(shop) {
      const rows = sql.all<{ path: string; content: string; mode: number }>("SELECT path, content, mode FROM shop_files WHERE shop = ? ORDER BY path", shop);
      return rows.length ? new Map(rows.map((r) => [r.path, { content: r.content, mode: Number(r.mode) }])) : null;
    },
    put(shop, files) {
      sql.transaction(() => {
        sql.run("DELETE FROM shop_files WHERE shop = ?", shop);
        for (const [path, file] of files) sql.run("INSERT INTO shop_files (shop, path, content, mode) VALUES (?, ?, ?, ?)", shop, path, file.content, file.mode);
      });
    },
    remove: (shop) => void sql.run("DELETE FROM shop_files WHERE shop = ?", shop),
  };
}

/** The most one file of a shop's state may hold on the box, its path and content in UTF-8: the platform's two megabytes a row. */
export const ROW_LIMIT_BYTES = 2_000_000;

/** The largest file of a state past the row limit, its bytes; null when every file fits. */
export function overRowLimit(state: ReadonlyMap<string, string>): number | null {
  const encoder = new TextEncoder();
  let most: number | null = null;
  for (const [path, content] of state) {
    const bytes = encoder.encode(path).length + encoder.encode(content).length;
    if (bytes > ROW_LIMIT_BYTES && (most === null || bytes > most)) most = bytes;
  }
  return most;
}

/** The row limit's line, on stderr for a call that would leave a file past it. */
export function rowLimitLine(bytes: number): string {
  return `town: a file of the state would be ${bytes} bytes after this call, over the box's two megabyte limit on one file; it is kept as it was before the call`;
}

/** One shop's state for one user under `root`, by path. */
export function readState(sql: Sql, root: string, shop: string, user: string): Map<string, string> {
  const rows = sql.all<{ path: string; content: string }>("SELECT path, content FROM shop_state WHERE root = ? AND shop = ? AND user = ? ORDER BY path", root, shop, user);
  return new Map(rows.map((r) => [r.path, r.content]));
}

/** The state after a call kept, in one write: what changed written, what is gone removed, what stayed untouched. */
export function writeState(sql: Sql, root: string, shop: string, user: string, before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): void {
  if (before === after) return;
  sql.transaction(() => {
    for (const path of before.keys()) if (!after.has(path)) sql.run("DELETE FROM shop_state WHERE root = ? AND shop = ? AND user = ? AND path = ?", root, shop, user, path);
    for (const [path, content] of after) {
      if (before.get(path) === content) continue;
      sql.run("INSERT INTO shop_state (root, shop, user, path, content) VALUES (?, ?, ?, ?, ?) ON CONFLICT (root, shop, user, path) DO UPDATE SET content = excluded.content", root, shop, user, path, content);
    }
  });
}

/** The key from the secret's value: thirty-two bytes as hex, or none. The box makes no key: `ensure` refuses without one. */
export function secretKey(value: string | undefined): KeySource {
  const read = (): Buffer | null => {
    if (value === undefined || value === "") return null;
    if (!/^[0-9a-fA-F]+$/.test(value) || value.length !== KEY_BYTES * 2) throw new VaultError(`${KEY_SECRET} is not ${KEY_BYTES} bytes as hex; set the secret the deploy made`);
    return Buffer.from(value, "hex");
  };
  return {
    read,
    ensure() {
      const key = read();
      if (key === null) throw new VaultError(`${KEY_MISSING}: this box's ${KEY_SECRET} secret is not set, and the town never makes one; the deploy does`);
      return key;
    },
    require(sealedRows) {
      const key = read();
      if (key === null && sealedRows > 0) {
        throw new VaultError(`${KEY_MISSING}: this box's ${KEY_SECRET} secret is not set, and the credentials table has ${sealedRows} row${sealedRows === 1 ? "" : "s"} sealed by it; set the secret they were sealed with`);
      }
      return key;
    },
  };
}

/** The store over a Durable Object: its SQL with the object's tables made, the shelf in rows, the key from the secret's value, the state in rows, staging in memory. */
export function objectStore(storage: DurableObjectStorage, vaultKey: string | undefined): Store {
  const sql = objectSql(storage);
  sql.exec(OBJECT_TABLES);
  return new Store({
    sql,
    shelf: rowsShelf(sql),
    key: secretKey(vaultKey),
    stateRoot: BOX_STATE_ROOT,
    stage: async (files: ReadonlyMap<string, BundleFile>) => ({ shelf: filesShelf(files), remove: async () => {} }),
    async scratch() {
      const root = `scratch-${randomBytes(8).toString("hex")}`;
      return { root, remove: async () => void sql.run("DELETE FROM shop_state WHERE root = ?", root) };
    },
    dataDir: null,
    where: BOX_STORE,
  });
}
