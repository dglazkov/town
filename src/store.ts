// The store: the town's tables over node:sqlite at <data>/town.db, and
// every query the gate and the admin need. Nothing is cached: a pass is
// resolved by its token's hash on every call, and a grant, a manifest,
// and a revocation are read from the file each time, so `townd admin` in
// another process is seen by the next call.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { createRequire } from "node:module";
import type { Constraints } from "./constraints.js";
import type { Manifest } from "./manifest.js";

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

export type ResultClass = "ok" | "denied" | "invalid-pass" | "usage" | "shop-error" | "timeout" | "town-error";

export interface User {
  id: string;
  name: string;
  createdAt: number;
}

export interface Pass {
  id: string;
  userId: string;
  userName: string;
  label: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface Grant {
  id: string;
  passId: string;
  shop: string;
  commands: string[];
  constraints: Constraints;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface ShopRow {
  name: string;
  version: string;
  manifest: Manifest;
  addedAt: number;
}

export interface CallRecord {
  at: number;
  passId: string | null;
  grantId: string | null;
  shop: string | null;
  command: string | null;
  argvHash: string;
  result: ResultClass;
  /** What the agent was given. */
  exit: number;
  /** The shop's own exit code; null when the shop did not run. */
  shopExit: number | null;
  latencyMs: number;
  notices: string[];
  /** The shop's stderr, its own log; null when it did not run. */
  stderr: string | null;
  /** Why, for the operator: `expired`, `revoked`, `unknown`, a refusal's kind. */
  detail: string | null;
}

export interface CallRow extends CallRecord {
  id: number;
}

/** A refusal the admin can print as it is. */
export class StoreError extends Error {}

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

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newId(kind: string): string {
  return `${kind}_${randomBytes(8).toString("hex")}`;
}

type Row = Record<string, unknown>;

export class Store {
  readonly db: Database;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.dataDir, "town.db"));
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
  }

  get shopsDir(): string {
    return path.join(this.dataDir, "shops");
  }

  get stateRoot(): string {
    return path.join(this.dataDir, "state");
  }

  close(): void {
    this.db.close();
  }

  // meta

  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as Row | undefined;
    return row ? String(row.value) : null;
  }

  // users

  addUser(name: string, now = Date.now()): User {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      throw new StoreError(`user name ${JSON.stringify(name)} is not a name; write letters, digits, ".", "_" or "-"`);
    }
    if (this.userByName(name)) throw new StoreError(`user ${name} already exists`);
    const user = { id: newId("user"), name, createdAt: now };
    this.db.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(user.id, name, now);
    return user;
  }

  userByName(name: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE name = ?").get(name) as Row | undefined;
    return row ? toUser(row) : null;
  }

  listUsers(): User[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY created_at, name").all() as Row[]).map(toUser);
  }

  // passes

  /** A new pass for `userName`; the token is returned here and stored nowhere but as its hash. */
  newPass(userName: string, label: string, expiresAt: number | null, now = Date.now()): { pass: Pass; token: string } {
    const user = this.userByName(userName);
    if (!user) throw new StoreError(`user ${userName} does not exist; add it with townd admin user add ${userName}`);
    if (label.trim() === "") throw new StoreError("a pass needs a --label saying what holds it");
    const token = randomBytes(32).toString("base64url");
    const id = newId("pass");
    this.db
      .prepare("INSERT INTO passes (id, user_id, label, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, user.id, label, hashToken(token), now, expiresAt);
    return { pass: this.passById(id)!, token };
  }

  /** The pass whose token hashes to `tokenHash`, whatever its state; read from the file every time. */
  passByTokenHash(tokenHash: string): Pass | null {
    const row = this.db
      .prepare("SELECT p.*, u.name AS user_name FROM passes p JOIN users u ON u.id = p.user_id WHERE p.token_hash = ?")
      .get(tokenHash) as Row | undefined;
    return row ? toPass(row) : null;
  }

  passById(id: string): Pass | null {
    const row = this.db
      .prepare("SELECT p.*, u.name AS user_name FROM passes p JOIN users u ON u.id = p.user_id WHERE p.id = ?")
      .get(id) as Row | undefined;
    return row ? toPass(row) : null;
  }

  listPasses(): Array<Pass & { lastUse: number | null }> {
    const rows = this.db
      .prepare(
        `SELECT p.*, u.name AS user_name, (SELECT MAX(at) FROM calls c WHERE c.pass_id = p.id) AS last_use
         FROM passes p JOIN users u ON u.id = p.user_id ORDER BY p.created_at, p.id`,
      )
      .all() as Row[];
    return rows.map((r) => ({ ...toPass(r), lastUse: nullableNumber(r.last_use) }));
  }

  revokePass(id: string, now = Date.now()): Pass {
    const pass = this.passById(id);
    if (!pass) throw new StoreError(`pass ${id} does not exist; townd admin pass ls lists them`);
    if (pass.revokedAt === null) this.db.prepare("UPDATE passes SET revoked_at = ? WHERE id = ?").run(now, id);
    return this.passById(id)!;
  }

  // grants

  newGrant(
    g: { passId: string; shop: string; commands: string[]; constraints: Constraints; expiresAt: number | null },
    now = Date.now(),
  ): Grant {
    const pass = this.passById(g.passId);
    if (!pass) throw new StoreError(`pass ${g.passId} does not exist; townd admin pass ls lists them`);
    if (pass.revokedAt !== null) throw new StoreError(`pass ${g.passId} is revoked; make a new pass`);
    if (!this.getShop(g.shop)) throw new StoreError(`shop ${g.shop} is not in this town; townd admin shop ls lists them`);
    const held = this.grantsForPass(g.passId, now).find((x) => x.shop === g.shop);
    if (held) throw new StoreError(`pass ${g.passId} already holds grant ${held.id} at ${g.shop}; revoke it first, since a pass holds one grant per shop`);
    const id = newId("grant");
    this.db
      .prepare("INSERT INTO grants (id, pass_id, shop, commands, constraints, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, g.passId, g.shop, JSON.stringify(g.commands), JSON.stringify(g.constraints), now, g.expiresAt);
    return this.grantById(id)!;
  }

  grantById(id: string): Grant | null {
    const row = this.db.prepare("SELECT * FROM grants WHERE id = ?").get(id) as Row | undefined;
    return row ? toGrant(row) : null;
  }

  /** The pass's grants in force at `now`: not revoked, not expired. */
  grantsForPass(passId: string, now = Date.now()): Grant[] {
    const rows = this.db
      .prepare("SELECT * FROM grants WHERE pass_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY shop")
      .all(passId, now) as Row[];
    return rows.map(toGrant);
  }

  listGrants(passId?: string): Array<Grant & { lastUse: number | null }> {
    const sql = `SELECT g.*, (SELECT MAX(at) FROM calls c WHERE c.grant_id = g.id) AS last_use FROM grants g
      ${passId ? "WHERE g.pass_id = ?" : ""} ORDER BY g.created_at, g.id`;
    const rows = (passId ? this.db.prepare(sql).all(passId) : this.db.prepare(sql).all()) as Row[];
    return rows.map((r) => ({ ...toGrant(r), lastUse: nullableNumber(r.last_use) }));
  }

  revokeGrant(id: string, now = Date.now()): Grant {
    const grant = this.grantById(id);
    if (!grant) throw new StoreError(`grant ${id} does not exist; townd admin grant ls lists them`);
    if (grant.revokedAt === null) this.db.prepare("UPDATE grants SET revoked_at = ? WHERE id = ?").run(now, id);
    return this.grantById(id)!;
  }

  // shops

  upsertShop(manifest: Manifest, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO shops (name, version, manifest, added_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET version = excluded.version, manifest = excluded.manifest, added_at = excluded.added_at`,
      )
      .run(manifest.name, manifest.version, JSON.stringify(manifest), now);
  }

  getShop(name: string): ShopRow | null {
    const row = this.db.prepare("SELECT * FROM shops WHERE name = ?").get(name) as Row | undefined;
    return row ? toShop(row) : null;
  }

  listShops(): ShopRow[] {
    return (this.db.prepare("SELECT * FROM shops ORDER BY name").all() as Row[]).map(toShop);
  }

  removeShop(name: string): boolean {
    return Number(this.db.prepare("DELETE FROM shops WHERE name = ?").run(name).changes) > 0;
  }

  // calls

  recordCall(c: CallRecord): number {
    const r = this.db
      .prepare(
        `INSERT INTO calls (at, pass_id, grant_id, shop, command, argv_hash, result, exit, shop_exit, latency_ms, notices, stderr, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.at,
        c.passId,
        c.grantId,
        c.shop,
        c.command,
        c.argvHash,
        c.result,
        c.exit,
        c.shopExit,
        Math.round(c.latencyMs),
        JSON.stringify(c.notices),
        c.stderr,
        c.detail,
      );
    return Number(r.lastInsertRowid);
  }

  /** Audit rows, newest last. */
  calls(filter: { passId?: string; shop?: string; since?: number } = {}): CallRow[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filter.passId !== undefined) (where.push("pass_id = ?"), params.push(filter.passId));
    if (filter.shop !== undefined) (where.push("shop = ?"), params.push(filter.shop));
    if (filter.since !== undefined) (where.push("at >= ?"), params.push(filter.since));
    const sql = `SELECT * FROM calls ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at, id`;
    return (this.db.prepare(sql).all(...params) as Row[]).map(toCall);
  }
}

export function openStore(dataDir: string): Store {
  return new Store(dataDir);
}

function nullableNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toUser(r: Row): User {
  return { id: String(r.id), name: String(r.name), createdAt: Number(r.created_at) };
}

function toPass(r: Row): Pass {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    label: String(r.label),
    createdAt: Number(r.created_at),
    expiresAt: nullableNumber(r.expires_at),
    revokedAt: nullableNumber(r.revoked_at),
  };
}

function toGrant(r: Row): Grant {
  return {
    id: String(r.id),
    passId: String(r.pass_id),
    shop: String(r.shop),
    commands: JSON.parse(String(r.commands)) as string[],
    constraints: JSON.parse(String(r.constraints)) as Constraints,
    createdAt: Number(r.created_at),
    expiresAt: nullableNumber(r.expires_at),
    revokedAt: nullableNumber(r.revoked_at),
  };
}

function toShop(r: Row): ShopRow {
  return { name: String(r.name), version: String(r.version), manifest: JSON.parse(String(r.manifest)) as Manifest, addedAt: Number(r.added_at) };
}

function toCall(r: Row): CallRow {
  return {
    id: Number(r.id),
    at: Number(r.at),
    passId: r.pass_id === null ? null : String(r.pass_id),
    grantId: r.grant_id === null ? null : String(r.grant_id),
    shop: r.shop === null ? null : String(r.shop),
    command: r.command === null ? null : String(r.command),
    argvHash: String(r.argv_hash),
    result: String(r.result) as ResultClass,
    exit: Number(r.exit),
    shopExit: nullableNumber(r.shop_exit),
    latencyMs: Number(r.latency_ms),
    notices: JSON.parse(String(r.notices)) as string[],
    stderr: r.stderr === null ? null : String(r.stderr),
    detail: r.detail === null ? null : String(r.detail),
  };
}
