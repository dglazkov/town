// The store: the town's tables over node:sqlite at <data>/town.db, and
// every query the gate and the admin need. Nothing is cached: a pass is
// resolved by its token's hash on every call, and a grant, a manifest,
// and a revocation are read from the file each time, so `townd admin` in
// another process is seen by the next call. A grant's liveness is one
// query for what a grant decides alone, then a walk over the pass's
// grants for its shop's dependencies.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { createRequire } from "node:module";
import type { Constraints } from "./constraints.js";
import type { Manifest } from "./manifest.js";
import { parseHeaderTemplate, parseOrigin } from "./teller.js";
import { openCredential, sealCredential } from "./vault.js";

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
  /** The binding: for each need, the credential that meets it, `{ "<type>": "<credential id>" }`. */
  credentials: Record<string, string>;
}

/**
 * A grant's state: `live` when it is not revoked, not expired, every need
 * of its shop's current manifest has a binding of its type to the pass's
 * user's credential that is not revoked, and for each dependency of that
 * manifest the pass holds a live grant at the dependency whose commands
 * cover the declared ones; else why not. `unmet` names the first need
 * with no such binding; `lacks` the first dependency not covered and the
 * commands missing there, all of the declared ones when the pass holds no
 * live grant at that shop.
 */
export type GrantState =
  | { kind: "live" }
  | { kind: "revoked" }
  | { kind: "expired" }
  | { kind: "unmet"; type: string }
  | { kind: "lacks"; shop: string; commands: string[] };

export interface ShopRow {
  name: string;
  version: string;
  manifest: Manifest;
  addedAt: number;
}

export interface CallRecord {
  /** The call's own id, `call_<16 hex>`, minted before the gate ran. */
  callId: string;
  /** The id of the call whose shop made this one; null for an agent's own. */
  parent: string | null;
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
  /** Per need the call's tellers served, how many requests each forwarded; empty when the shop did not run. */
  credentials: Array<{ type: string; requests: number }>;
}

export interface CallRow extends CallRecord {
  id: number;
}

/** A row of a call tree: how many calls above it made it, 0 for the root. */
export interface TreeRow extends CallRow {
  depth: number;
}

/** A credential type: where its secret may be sent, and the header it rides in. */
export interface CredentialType {
  name: string;
  origin: string;
  header: string;
  addedAt: number;
}

/** A credential as every verb may show it: never its value, never its sealed bytes. */
export interface Credential {
  id: string;
  userId: string;
  userName: string;
  type: string;
  label: string;
  createdAt: number;
  revokedAt: number | null;
  /** The grants whose bindings name it. */
  grants: string[];
}

/** A refusal the admin can print as it is. */
export class StoreError extends Error {}

/** The schema this code writes to `meta.schema`. Gate's store wrote none; vault's wrote 2. */
export const SCHEMA_VERSION = 3;

/** The type every store is made with. */
export const SEEDED_TYPES: ReadonlyArray<Omit<CredentialType, "addedAt">> = [
  { name: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}" },
];

const TYPE_NAME = /^[a-z][a-z0-9-]*$/;

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

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newId(kind: string): string {
  return `${kind}_${randomBytes(8).toString("hex")}`;
}

type Row = Record<string, unknown>;

/**
 * Every grant with its liveness, as one query: `state` is `revoked`,
 * `expired`, `unmet`, or `live`, and `unmet` the first need of the shop's
 * current manifest with no binding of its type to an unrevoked credential
 * of the pass's user. A binding whose type the manifest does not name is
 * not read. Bound to `:now`. Every reader of a pass's grants reads this,
 * through `withLiveness`, which adds the fourth reason, dependencies.
 */
const GRANTS_WITH_STATE = `
SELECT x.*,
  CASE
    WHEN x.revoked_at IS NOT NULL THEN 'revoked'
    WHEN x.expires_at IS NOT NULL AND x.expires_at <= :now THEN 'expired'
    WHEN x.unmet IS NOT NULL THEN 'unmet'
    ELSE 'live'
  END AS state
FROM (
  SELECT g.*, (
    SELECT json_extract(need.value, '$.type')
    FROM shops s, json_each(s.manifest, '$.credentials') need
    WHERE s.name = g.shop AND NOT EXISTS (
      SELECT 1
      FROM json_each(g.credentials) b
      JOIN credentials c ON c.id = b.value
      JOIN passes p ON p.id = g.pass_id
      WHERE b.key = json_extract(need.value, '$.type') AND c.type = b.key AND c.user_id = p.user_id AND c.revoked_at IS NULL
    )
    ORDER BY need.key
    LIMIT 1
  ) AS unmet
  FROM grants g
) x`;

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
    try {
      this.db.exec(SCHEMA);
      this.migrate();
    } catch (err) {
      this.db.close();
      throw err;
    }
  }

  /**
   * Brings an older store to schema 3, a step at a time. From gate's (no
   * `meta.schema`) to 2: the two tables, the two columns, the seeded type.
   * From vault's 2 to 3: `calls.call_id`, each old row given one, and
   * `calls.parent`, null for every old row. Done under a write lock, so a
   * second process opening the same file at the same moment finds the
   * work done.
   */
  private migrate(now = Date.now()): void {
    const version = () => Number(this.getMeta("schema") ?? "1");
    if (version() === SCHEMA_VERSION) return;
    if (version() > SCHEMA_VERSION) {
      throw new StoreError(`${path.join(this.dataDir, "town.db")} is schema ${version()}, newer than this town's ${SCHEMA_VERSION}; run the town that made it`);
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const addColumn = (table: string, column: string, decl: string) => {
        const cols = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => String(r.name));
        if (!cols.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
      };
      if (version() < 2) {
        this.db.exec(VAULT_TABLES);
        addColumn("grants", "credentials", "TEXT NOT NULL DEFAULT '{}'");
        addColumn("calls", "credentials", "TEXT NOT NULL DEFAULT '[]'");
        for (const t of SEEDED_TYPES) {
          this.db.prepare("INSERT OR IGNORE INTO credential_types (name, origin, header, added_at) VALUES (?, ?, ?, ?)").run(t.name, t.origin, t.header, now);
        }
        this.setMeta("schema", "2");
      }
      if (version() < 3) {
        addColumn("calls", "call_id", "TEXT");
        addColumn("calls", "parent", "TEXT");
        this.db.exec("UPDATE calls SET call_id = 'call_' || lower(hex(randomblob(8))) WHERE call_id IS NULL");
        this.db.exec(COMPOSE_INDEXES);
        this.setMeta("schema", "3");
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
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
    g: { passId: string; shop: string; commands: string[]; constraints: Constraints; expiresAt: number | null; credentials?: Record<string, string> },
    now = Date.now(),
  ): Grant {
    const pass = this.passById(g.passId);
    if (!pass) throw new StoreError(`pass ${g.passId} does not exist; townd admin pass ls lists them`);
    if (pass.revokedAt !== null) throw new StoreError(`pass ${g.passId} is revoked; make a new pass`);
    if (!this.getShop(g.shop)) throw new StoreError(`shop ${g.shop} is not in this town; townd admin shop ls lists them`);
    // Live grants only: a grant dead by its credential or a new need never blocks its replacement.
    const held = this.grantsForPass(g.passId, now).find((x) => x.shop === g.shop);
    if (held) throw new StoreError(`pass ${g.passId} already holds grant ${held.id} at ${g.shop}; revoke it first, since a pass holds one grant per shop`);
    const id = newId("grant");
    this.db
      .prepare("INSERT INTO grants (id, pass_id, shop, commands, constraints, created_at, expires_at, credentials) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, g.passId, g.shop, JSON.stringify(g.commands), JSON.stringify(g.constraints), now, g.expiresAt, JSON.stringify(g.credentials ?? {}));
    return this.grantById(id)!;
  }

  grantById(id: string): Grant | null {
    const row = this.db.prepare("SELECT * FROM grants WHERE id = ?").get(id) as Row | undefined;
    return row ? toGrant(row) : null;
  }

  /** The pass's live grants at `now` (see GrantState): what the gate, help, and notices read. */
  grantsForPass(passId: string, now = Date.now()): Grant[] {
    return this.passGrants(passId, now)
      .filter((g) => g.state.kind === "live")
      .sort((a, b) => (a.shop < b.shop ? -1 : a.shop > b.shop ? 1 : 0))
      .map(({ state: _state, ...g }) => g);
  }

  /** One grant's state at `now`; null when there is no such grant. */
  grantState(id: string, now = Date.now()): GrantState | null {
    const row = this.db.prepare("SELECT pass_id FROM grants WHERE id = ?").get(id) as Row | undefined;
    if (!row) return null;
    return this.passGrants(String(row.pass_id), now).find((g) => g.id === id)!.state;
  }

  listGrants(passId?: string, now = Date.now()): Array<Grant & { lastUse: number | null; state: GrantState }> {
    const sql = `SELECT g.*, (SELECT MAX(at) FROM calls c WHERE c.grant_id = g.id) AS last_use FROM (${GRANTS_WITH_STATE}) g
      ${passId ? "WHERE g.pass_id = :pass" : ""} ORDER BY g.created_at, g.id`;
    const rows = this.db.prepare(sql).all(passId ? { now, pass: passId } : { now }) as Row[];
    return this.withLiveness(rows).map(({ row, state }) => ({ ...toGrant(row), lastUse: nullableNumber(row.last_use), state }));
  }

  /** Every grant of the pass, whatever its state, oldest first. */
  private passGrants(passId: string, now: number): Array<Grant & { state: GrantState }> {
    const rows = this.db.prepare(`SELECT * FROM (${GRANTS_WITH_STATE}) WHERE pass_id = :pass ORDER BY created_at, id`).all({ now, pass: passId }) as Row[];
    return this.withLiveness(rows).map(({ row, state }) => ({ ...toGrant(row), state }));
  }

  /**
   * The rows of GRANTS_WITH_STATE, each with its whole state: the query's
   * three reasons, then the fourth, walked in code over the rows of each
   * pass, each grant decided once. A grant the query calls live is live
   * when, for each dependency of its shop's current manifest in order, the
   * pass holds a grant at that shop that is itself live and whose commands
   * cover the declared ones; else it `lacks` the first one not covered. A
   * walk that comes back to a grant it is still deciding (a loop, which
   * `shop add` never makes) counts that grant not live. Every row of each
   * pass in `rows` must be there, since a dependency's grant is one of them.
   */
  private withLiveness(rows: Row[]): Array<{ row: Row; state: GrantState }> {
    const manifests = new Map(this.listShops().map((s) => [s.name, s.manifest]));
    const byPass = new Map<string, Row[]>();
    for (const r of rows) {
      const pass = String(r.pass_id);
      if (!byPass.has(pass)) byPass.set(pass, []);
      byPass.get(pass)!.push(r);
    }
    const decided = new Map<string, GrantState>();
    const deciding = new Set<string>();
    const commandsOf = (r: Row) => JSON.parse(String(r.commands)) as string[];
    const stateOf = (r: Row): GrantState => {
      const id = String(r.id);
      const known = decided.get(id);
      if (known) return known;
      if (deciding.has(id)) return { kind: "lacks", shop: String(r.shop), commands: [] };
      let state = toState(r);
      const depends = state.kind === "live" ? (manifests.get(String(r.shop))?.depends ?? []) : [];
      deciding.add(id);
      for (const dep of depends) {
        const live = byPass.get(String(r.pass_id))!.filter((x) => String(x.shop) === dep.shop && stateOf(x).kind === "live");
        if (live.some((x) => dep.commands.every((c) => commandsOf(x).includes(c)))) continue;
        const missing = live.length ? dep.commands.filter((c) => !commandsOf(live[0]!).includes(c)) : [...dep.commands];
        state = { kind: "lacks", shop: dep.shop, commands: missing };
        break;
      }
      deciding.delete(id);
      decided.set(id, state);
      return state;
    };
    return rows.map((row) => ({ row, state: stateOf(row) }));
  }

  /** The ids of the grants live at `now`, of those given. */
  liveOf(grantIds: readonly string[], now = Date.now()): string[] {
    return grantIds.filter((id) => this.grantState(id, now)?.kind === "live");
  }

  /** The grants at `shop` live at `now`. */
  liveGrantsAt(shop: string, now = Date.now()): Grant[] {
    return this.listGrants(undefined, now)
      .filter((g) => g.shop === shop && g.state.kind === "live")
      .map(({ state: _state, lastUse: _lastUse, ...g }) => g);
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

  // credential types

  listTypes(): CredentialType[] {
    return (this.db.prepare("SELECT * FROM credential_types ORDER BY name").all() as Row[]).map(toType);
  }

  getType(name: string): CredentialType | null {
    const row = this.db.prepare("SELECT * FROM credential_types WHERE name = ?").get(name) as Row | undefined;
    return row ? toType(row) : null;
  }

  addType(t: { name: string; origin: string; header: string }, now = Date.now()): CredentialType {
    if (!TYPE_NAME.test(t.name)) {
      throw new StoreError(`type name ${JSON.stringify(t.name)} is not a name; write lowercase letters, digits, and "-", starting with a letter`);
    }
    if (!parseOrigin(t.origin)) {
      throw new StoreError(`--origin ${JSON.stringify(t.origin)} is not an origin; write an absolute http: or https: URL with no query or fragment, like https://api.github.com`);
    }
    if (!parseHeaderTemplate(t.header)) {
      throw new StoreError(`--header ${JSON.stringify(t.header)} is not a header; write '<Name>: <value>' with {token} where the secret goes, like 'Authorization: Bearer {token}'`);
    }
    if (this.getType(t.name)) throw new StoreError(`type ${t.name} already exists; townd admin type ls lists them`);
    this.db.prepare("INSERT INTO credential_types (name, origin, header, added_at) VALUES (?, ?, ?, ?)").run(t.name, t.origin, t.header, now);
    return this.getType(t.name)!;
  }

  /** Removes a type; refused while a credential of it is not revoked. */
  removeType(name: string): void {
    if (!this.getType(name)) throw new StoreError(`type ${name} is not in this town; townd admin type ls lists them`);
    const held = (this.db.prepare("SELECT id FROM credentials WHERE type = ? AND revoked_at IS NULL ORDER BY created_at, id").all(name) as Row[]).map((r) => String(r.id));
    if (held.length) {
      const many = held.length !== 1;
      throw new StoreError(`type ${name} is held by ${many ? `${held.length} credentials` : "a credential"} (${held.join(", ")}); remove ${many ? "them" : "it"} with townd admin credential rm first`);
    }
    this.db.prepare("DELETE FROM credential_types WHERE name = ?").run(name);
  }

  // credentials

  /** Seals `value` under `key` for a new credential and stores the sealed row; returns the credential, never the value. */
  addCredential(c: { userName: string; type: string; label: string; value: string }, key: Buffer, now = Date.now()): Credential {
    const user = this.userByName(c.userName);
    if (!user) throw new StoreError(`user ${c.userName} does not exist; add it with townd admin user add ${c.userName}`);
    if (!this.getType(c.type)) {
      throw new StoreError(`type ${c.type} is not a type this town holds; write one of (${this.listTypes().map((t) => t.name).join(", ")}), or add it with townd admin type add`);
    }
    const id = newId("credential");
    this.db
      .prepare("INSERT INTO credentials (id, user_id, type, label, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, user.id, c.type, c.label, sealCredential(key, id, c.value), now);
    return this.credentialById(id)!;
  }

  credentialById(id: string): Credential | null {
    const row = this.db.prepare(`${CREDENTIAL_SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
    return row ? this.toCredential(row) : null;
  }

  /** Every credential, or one user's, oldest first, revoked ones included. */
  listCredentials(userName?: string): Credential[] {
    const rows = (userName === undefined
      ? this.db.prepare(`${CREDENTIAL_SELECT} ORDER BY c.created_at, c.id`).all()
      : this.db.prepare(`${CREDENTIAL_SELECT} WHERE u.name = ? ORDER BY c.created_at, c.id`).all(userName)) as Row[];
    return rows.map((r) => this.toCredential(r));
  }

  /** A user's credentials of a type that are not revoked. */
  liveCredentials(userId: string, type: string): Credential[] {
    const rows = this.db.prepare(`${CREDENTIAL_SELECT} WHERE c.user_id = ? AND c.type = ? AND c.revoked_at IS NULL ORDER BY c.created_at, c.id`).all(userId, type) as Row[];
    return rows.map((r) => this.toCredential(r));
  }

  /** A credential's value, opened from its sealed row for one use in memory. */
  openCredential(id: string, key: Buffer): string {
    const row = this.db.prepare("SELECT sealed FROM credentials WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new StoreError(`credential ${id} does not exist; townd admin credential ls lists them`);
    return openCredential(key, id, row.sealed as Uint8Array);
  }

  revokeCredential(id: string, now = Date.now()): Credential {
    const c = this.credentialById(id);
    if (!c) throw new StoreError(`credential ${id} does not exist; townd admin credential ls lists them`);
    if (c.revokedAt === null) this.db.prepare("UPDATE credentials SET revoked_at = ? WHERE id = ?").run(now, id);
    return this.credentialById(id)!;
  }

  /** How many sealed rows there are, revoked ones included: rows the vault's key must be there to open. */
  sealedRows(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM credentials").get() as Row).n);
  }

  private toCredential(r: Row): Credential {
    const grants = (this.db.prepare("SELECT DISTINCT g.id FROM grants g, json_each(g.credentials) j WHERE j.value = ? ORDER BY g.id").all(String(r.id)) as Row[]).map((g) => String(g.id));
    return {
      id: String(r.id),
      userId: String(r.user_id),
      userName: String(r.user_name),
      type: String(r.type),
      label: String(r.label),
      createdAt: Number(r.created_at),
      revokedAt: nullableNumber(r.revoked_at),
      grants,
    };
  }

  // calls

  recordCall(c: CallRecord): number {
    const r = this.db
      .prepare(
        `INSERT INTO calls (call_id, parent, at, pass_id, grant_id, shop, command, argv_hash, result, exit, shop_exit, latency_ms, notices, stderr, detail, credentials)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.callId,
        c.parent,
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
        JSON.stringify(c.credentials.map((x) => ({ type: x.type, requests: x.requests }))),
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

  /**
   * One call and every call made in its service: the root at depth 0, then
   * each call's children after it, oldest first, each followed by its own.
   * Empty when there is no call with that id.
   */
  callTree(callId: string): TreeRow[] {
    const rows = this.db
      .prepare(
        `WITH RECURSIVE tree(call_id, depth) AS (
           SELECT call_id, 0 FROM calls WHERE call_id = :id
           UNION ALL
           SELECT c.call_id, t.depth + 1 FROM calls c JOIN tree t ON c.parent = t.call_id
         )
         SELECT calls.*, tree.depth FROM tree JOIN calls ON calls.call_id = tree.call_id ORDER BY calls.at, calls.id`,
      )
      .all({ id: callId }) as Row[];
    const all = rows.map((r) => ({ ...toCall(r), depth: Number(r.depth) }));
    const out: TreeRow[] = [];
    const visit = (row: TreeRow) => {
      out.push(row);
      for (const child of all.filter((c) => c.parent === row.callId)) visit(child);
    };
    const root = all.find((r) => r.depth === 0);
    if (root) visit(root);
    return out;
  }
}

const CREDENTIAL_SELECT = "SELECT c.id, c.user_id, c.type, c.label, c.created_at, c.revoked_at, u.name AS user_name FROM credentials c JOIN users u ON u.id = c.user_id";

export function openStore(dataDir: string): Store {
  return new Store(dataDir);
}

function nullableNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toType(r: Row): CredentialType {
  return { name: String(r.name), origin: String(r.origin), header: String(r.header), addedAt: Number(r.added_at) };
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
    credentials: JSON.parse(String(r.credentials ?? "{}")) as Record<string, string>,
  };
}

function toState(r: Row): GrantState {
  const state = String(r.state);
  if (state === "unmet") return { kind: "unmet", type: String(r.unmet) };
  return { kind: state as "live" | "revoked" | "expired" };
}

function toShop(r: Row): ShopRow {
  return { name: String(r.name), version: String(r.version), manifest: JSON.parse(String(r.manifest)) as Manifest, addedAt: Number(r.added_at) };
}

function toCall(r: Row): CallRow {
  return {
    id: Number(r.id),
    callId: String(r.call_id),
    parent: r.parent === null || r.parent === undefined ? null : String(r.parent),
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
    credentials: JSON.parse(String(r.credentials ?? "[]")) as Array<{ type: string; requests: number }>,
  };
}
