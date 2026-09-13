// The store: the town's tables over node:sqlite at <data>/town.db, and
// every query the gate and the admin need. Nothing is cached: a pass is
// resolved by its token's hash on every call, and a grant, a manifest,
// and a revocation are read from the file each time, so `townd admin` in
// another process is seen by the next call. A grant's liveness is one
// query for what a grant decides alone, then a walk over the pass's
// grants for its shop's dependencies, in src/liveness.ts. The tables and
// their migrations are src/schema.ts; the credential and audit queries
// are src/credentials.ts and src/audit.ts, called from here by name.
// Every open writes the hall's row from src/hall.ts, so a town is born
// with its own shop and always holds this town's version of it.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import * as audit from "./audit.js";
import type { CallRecord, CallRow, TreeRow } from "./audit.js";
import type { Constraints } from "./constraints.js";
import * as credentials from "./credentials.js";
import type { Client, Credential, CredentialType, TypeDefinition } from "./credentials.js";
import { HALL } from "./hall.js";
import { GRANTS_WITH_STATE, withLiveness, type GrantState } from "./liveness.js";
import type { Manifest } from "./manifest.js";
import type { OAuthValue } from "./oauth.js";
import { isoTime } from "./notices.js";
import { getMeta, openDatabase, setMeta } from "./schema.js";

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
  /** Who made it: null for the operator's `grant new`, `publish`, or `permit <id>`. */
  source: string | null;
}

export interface ShopRow {
  name: string;
  version: string;
  manifest: Manifest;
  addedAt: number;
  /** The user whose agent published it, by id; null for a shop the operator added, and the hall. */
  owner: string | null;
  /** That user's name; null when there is no owner. */
  ownerName: string | null;
  /** When its tests last passed on this code; null for a shop with needs published and not yet approved, so an approval runs them. */
  testedAt: number | null;
}

/** A grant an agent proposed with `request`, pending until a person decides it. */
export interface Permit {
  id: string;
  passId: string;
  userName: string;
  shop: string;
  commands: string[];
  constraints: Constraints;
  /** One line a person reads; empty when the agent gave none. */
  why: string;
  createdAt: number;
  decidedAt: number | null;
  decision: "approved" | "denied" | null;
  /** The grant an approval made; null otherwise. */
  grantId: string | null;
}

/** A refusal the admin can print as it is. */
export class StoreError extends Error {}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newId(kind: string): string {
  return `${kind}_${randomBytes(8).toString("hex")}`;
}

type Row = Record<string, unknown>;

export class Store {
  readonly db: Database;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.db = openDatabase(this.dataDir);
    try {
      this.writeHall();
    } catch (err) {
      this.db.close();
      throw err;
    }
  }

  /** The hall's row, written when it is missing or is not this town's; a second open writes nothing. */
  private writeHall(now = Date.now()): void {
    const held = this.getShop(HALL.name);
    if (held && JSON.stringify(held.manifest) === JSON.stringify(HALL) && held.owner === null) return;
    this.upsertShop(HALL, now);
  }

  /** Runs `fn` under a write lock, all of it or none. */
  inTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
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
    setMeta(this.db, key, value);
  }

  getMeta(key: string): string | null {
    return getMeta(this.db, key);
  }

  // users

  addUser(name: string, now = Date.now()): User {
    // A user's name is the namespace its agents publish under, the first part of a shop's name.
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new StoreError(`user name ${JSON.stringify(name)} is not a namespace; write lowercase letters, digits, and "-", starting with a letter, since it is the first part of the name of every shop the user's agents publish`);
    }
    if (name === HALL.name.split("/")[0]) {
      throw new StoreError(`user name ${name} is the operator's namespace; write another name`);
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
    g: { passId: string; shop: string; commands: string[]; constraints: Constraints; expiresAt: number | null; credentials?: Record<string, string>; source?: string | null },
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
      .prepare("INSERT INTO grants (id, pass_id, shop, commands, constraints, created_at, expires_at, credentials, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, g.passId, g.shop, JSON.stringify(g.commands), JSON.stringify(g.constraints), now, g.expiresAt, JSON.stringify(g.credentials ?? {}), g.source ?? null);
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
    return withLiveness(rows, this.manifests()).map(({ row, state }) => ({ ...toGrant(row), lastUse: nullableNumber(row.last_use), state }));
  }

  /** Every grant of the pass, whatever its state, oldest first. */
  private passGrants(passId: string, now: number): Array<Grant & { state: GrantState }> {
    const rows = this.db.prepare(`SELECT * FROM (${GRANTS_WITH_STATE}) WHERE pass_id = :pass ORDER BY created_at, id`).all({ now, pass: passId }) as Row[];
    return withLiveness(rows, this.manifests()).map(({ row, state }) => ({ ...toGrant(row), state }));
  }

  /** The town's shops' manifests by name, as liveness reads them. */
  private manifests(): Map<string, Manifest> {
    return new Map(this.listShops().map((s) => [s.name, s.manifest]));
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

  /**
   * Latest only: the row for `manifest.name`, with `owner` the publishing
   * user's id, or null for the operator's, and `testedAt` when its tests
   * passed on this code, or null when they have not run on it.
   */
  upsertShop(manifest: Manifest, now = Date.now(), owner: string | null = null, testedAt: number | null = now): void {
    this.db
      .prepare(
        `INSERT INTO shops (name, version, manifest, added_at, owner, tested_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET version = excluded.version, manifest = excluded.manifest, added_at = excluded.added_at, owner = excluded.owner, tested_at = excluded.tested_at`,
      )
      .run(manifest.name, manifest.version, JSON.stringify(manifest), now, owner, testedAt);
  }

  /** Records that the shop's tests passed on its code at `now`. */
  markTested(name: string, now = Date.now()): void {
    this.db.prepare("UPDATE shops SET tested_at = ? WHERE name = ?").run(now, name);
  }

  getShop(name: string): ShopRow | null {
    const row = this.db.prepare(`${SHOP_SELECT} WHERE s.name = ?`).get(name) as Row | undefined;
    return row ? toShop(row) : null;
  }

  listShops(): ShopRow[] {
    return (this.db.prepare(`${SHOP_SELECT} ORDER BY s.name`).all() as Row[]).map(toShop);
  }

  removeShop(name: string): boolean {
    return Number(this.db.prepare("DELETE FROM shops WHERE name = ?").run(name).changes) > 0;
  }

  // permits

  /** A pending permit of the pass at the shop; a pending one of the pass at that shop is replaced, in one write. */
  newPermit(p: { passId: string; shop: string; commands: string[]; constraints: Constraints; why: string }, now = Date.now()): Permit {
    const pass = this.passById(p.passId);
    if (!pass) throw new StoreError(`pass ${p.passId} does not exist; townd admin pass ls lists them`);
    if (!this.getShop(p.shop)) throw new StoreError(`shop ${p.shop} is not in this town; townd admin shop ls lists them`);
    const id = `prm_${randomBytes(8).toString("hex")}`;
    this.inTransaction(() => {
      this.db.prepare("DELETE FROM permits WHERE pass_id = ? AND shop = ? AND decision IS NULL").run(p.passId, p.shop);
      this.db
        .prepare("INSERT INTO permits (id, pass_id, shop, commands, constraints, why, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, p.passId, p.shop, JSON.stringify(p.commands), JSON.stringify(p.constraints), p.why, now);
    });
    return this.permitById(id)!;
  }

  permitById(id: string): Permit | null {
    const row = this.db.prepare(`${PERMIT_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
    return row ? toPermit(row) : null;
  }

  /** Every permit, or one pass's, oldest first, decided ones included. */
  listPermits(passId?: string): Permit[] {
    const order = "ORDER BY r.created_at, r.id";
    const rows = (passId === undefined ? this.db.prepare(`${PERMIT_SELECT} ${order}`).all() : this.db.prepare(`${PERMIT_SELECT} WHERE r.pass_id = ? ${order}`).all(passId)) as Row[];
    return rows.map(toPermit);
  }

  /** The permit, when it is there and not yet decided; else the refusal saying which. */
  pendingPermit(id: string): Permit {
    const permit = this.permitById(id);
    if (!permit) throw new StoreError(`permit ${id} does not exist; townd admin permit ls lists them`);
    if (permit.decision !== null) {
      throw new StoreError(`permit ${id} was ${permit.decision} at ${isoTime(permit.decidedAt!)}; a decided permit is not decided again, so the agent asks again`);
    }
    return permit;
  }

  /** Records a person's decision on a pending permit, with the grant an approval made; a decided permit is refused. */
  decidePermit(id: string, decision: "approved" | "denied", grantId: string | null, now = Date.now()): Permit {
    this.pendingPermit(id);
    this.db.prepare("UPDATE permits SET decision = ?, decided_at = ?, grant_id = ? WHERE id = ? AND decision IS NULL").run(decision, now, grantId, id);
    return this.permitById(id)!;
  }

  // credential types and credentials: src/credentials.ts

  listTypes(): CredentialType[] {
    return credentials.listTypes(this);
  }

  getType(name: string): CredentialType | null {
    return credentials.getType(this, name);
  }

  addType(t: TypeDefinition & { client?: Client }, now = Date.now(), key?: Buffer): CredentialType {
    return credentials.addType(this, t, now, key);
  }

  proposeType(t: TypeDefinition, proposedBy: string, held: boolean, now = Date.now(), registration?: { client: Client; key: Buffer }): CredentialType | null {
    return credentials.proposeType(this, t, proposedBy, held, now, registration);
  }

  reviseGuidance(t: TypeDefinition, by: string): boolean {
    return credentials.reviseGuidance(this, t, by);
  }

  checkApprove(name: string, withClient: boolean): CredentialType {
    return credentials.checkApprove(this, name, withClient);
  }

  approveType(name: string, registration?: { client: Client; key: Buffer }): CredentialType {
    return credentials.approveType(this, name, registration);
  }

  removeType(name: string): void {
    credentials.removeType(this, name);
  }

  addCredential(c: { userName: string; type: string; label: string; value: string }, key: Buffer, now = Date.now()): Credential {
    return credentials.addCredential(this, c, key, now);
  }

  credentialById(id: string): Credential | null {
    return credentials.credentialById(this, id);
  }

  listCredentials(userName?: string): Credential[] {
    return credentials.listCredentials(this, userName);
  }

  liveCredentials(userId: string, type: string): Credential[] {
    return credentials.liveCredentials(this, userId, type);
  }

  openCredential(id: string, key: Buffer): string {
    return credentials.openCredential(this, id, key);
  }

  openClient(type: string, key: Buffer): Client {
    return credentials.openClient(this, type, key);
  }

  connectCredential(c: { userName: string; type: string; label: string; value: OAuthValue }, key: Buffer, now = Date.now()): Credential {
    return credentials.connectCredential(this, c, key, now);
  }

  refreshCredential(id: string, value: OAuthValue, key: Buffer): void {
    credentials.refreshCredential(this, id, value, key);
  }

  revokeCredential(id: string, now = Date.now(), why: string | null = null): Credential {
    return credentials.revokeCredential(this, id, now, why);
  }

  checkReplace(id: string, userName: string, type: string): Credential {
    return credentials.checkReplace(this, id, userName, type);
  }

  replaceCredential(old: string, make: () => Credential, now = Date.now()): { credential: Credential; moved: Array<{ id: string; shop: string }> } {
    return credentials.replaceCredential(this, old, make, now);
  }

  sealedRows(): number {
    return credentials.sealedRows(this);
  }

  // calls: src/audit.ts

  recordCall(c: CallRecord): number {
    return audit.recordCall(this, c);
  }

  calls(filter: { passId?: string; shop?: string; since?: number } = {}): CallRow[] {
    return audit.calls(this, filter);
  }

  callTree(callId: string): TreeRow[] {
    return audit.callTree(this, callId);
  }
}

export function openStore(dataDir: string): Store {
  return new Store(dataDir);
}

export function nullableNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

const SHOP_SELECT = "SELECT s.*, u.name AS owner_name FROM shops s LEFT JOIN users u ON u.id = s.owner";
const PERMIT_SELECT = "SELECT r.*, u.name AS user_name FROM permits r JOIN passes p ON p.id = r.pass_id JOIN users u ON u.id = p.user_id";

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
    source: r.source === null || r.source === undefined ? null : String(r.source),
  };
}

function toShop(r: Row): ShopRow {
  const owner = r.owner === null || r.owner === undefined ? null : String(r.owner);
  return {
    name: String(r.name),
    version: String(r.version),
    manifest: JSON.parse(String(r.manifest)) as Manifest,
    addedAt: Number(r.added_at),
    owner,
    ownerName: r.owner_name === null || r.owner_name === undefined ? null : String(r.owner_name),
    testedAt: nullableNumber(r.tested_at),
  };
}

function toPermit(r: Row): Permit {
  return {
    id: String(r.id),
    passId: String(r.pass_id),
    userName: String(r.user_name),
    shop: String(r.shop),
    commands: JSON.parse(String(r.commands)) as string[],
    constraints: JSON.parse(String(r.constraints)) as Constraints,
    why: String(r.why),
    createdAt: Number(r.created_at),
    decidedAt: nullableNumber(r.decided_at),
    decision: r.decision === null ? null : (String(r.decision) as "approved" | "denied"),
    grantId: r.grant_id === null ? null : String(r.grant_id),
  };
}
