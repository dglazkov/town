// The store: the town's tables over the sql seam, and every query the
// gate and the admin need, positional throughout. A store is opened with
// an Sql, a Shelf for the shops' files, and a source for the vault's key;
// `openStore(dataDir)` makes the three from a laptop's data directory:
// node:sqlite over <data>/town.db, <data>/shops, and <data>/vault.key.
// Nothing is cached: a pass is resolved by its token's hash on every
// call, and a grant, a manifest, and a revocation are read from the store
// each time, so `townd admin` in another process is seen by the next
// call. A grant's liveness is one query for what a grant decides alone,
// then a walk over the pass's grants for its shop's dependencies, in
// src/liveness.ts. The tables and their migrations are src/schema.ts; the
// grant queries are here, and the rest are their nouns' files, called
// from here by name: users and passes src/passes.ts, shops src/shops.ts,
// permits src/permits.ts, credentials src/credentials.ts, and calls
// src/audit.ts. Every open writes the hall's row from src/hall.ts, so a
// town is born with its own shop and always holds this town's version of it.

import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as audit from "./audit.js";
import type { BundleFile } from "./bundle.js";
import type { CallRecord, CallRow, TreeRow } from "./audit.js";
import type { Constraints } from "./constraints.js";
import * as credentials from "./credentials.js";
import type { Client, Credential, CredentialType, TypeDefinition } from "./credentials.js";
import { HALL } from "./hall.js";
import { GRANTS_WITH_STATE, withLiveness, type GrantState } from "./liveness.js";
import type { Manifest } from "./manifest.js";
import type { OAuthValue } from "./oauth.js";
import * as passes from "./passes.js";
import type { Pass, User } from "./passes.js";
import * as permits from "./permits.js";
import type { Permit } from "./permits.js";
import { getMeta, openSchema, setMeta } from "./schema.js";
import { diskShelf, shopAt, type Shelf } from "./shelf.js";
import * as shops from "./shops.js";
import type { ShopRow } from "./shops.js";
import { fileSql, type Sql } from "./sql.js";
import { fileKey, type KeySource } from "./vault.js";

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

/** A refusal the admin can print as it is. */
export class StoreError extends Error {}

export function newId(kind: string): string {
  return `${kind}_${randomBytes(8).toString("hex")}`;
}

type Row = Record<string, unknown>;

/** A copy of a shop's files, staged for its tests: a shelf holding that one shop under any name, and its removal. */
export interface Staged {
  shelf: Shelf;
  remove(): Promise<void>;
}

/** What a store is opened over: its SQL, its shelf, its key, where its shops' state is, and on a laptop the data directory they are under. */
export interface StoreSeams {
  sql: Sql;
  shelf: Shelf;
  key: KeySource;
  /** The root every shop's state is under, as the runtime is handed it: <data>/state on a laptop, a name for the object's rows on the box. */
  stateRoot: string;
  /** A copy of a shop's files for its tests: a directory under <data>/shops on a laptop, the files in memory on the box. */
  stage(files: ReadonlyMap<string, BundleFile>): Promise<Staged>;
  /** A state root for one shop test's scratch state, and its removal. */
  scratch(): Promise<{ root: string; remove(): Promise<void> }>;
  /** The data directory; null on the box, which has none. */
  dataDir: string | null;
  /** Where a refusal says the store is: <data>/town.db on a laptop. */
  where: string;
  /** Closes what the seams hold open; nothing when omitted. */
  close?: () => void;
}

export class Store {
  readonly sql: Sql;
  readonly shelf: Shelf;
  readonly key: KeySource;
  readonly dataDir: string | null;
  readonly stateRoot: string;
  private readonly seams: StoreSeams;
  private readonly closeSeams: () => void;

  /** The store over `seams`, its schema made or migrated and the hall's row written; the seams closed again when that fails. */
  constructor(seams: StoreSeams) {
    this.sql = seams.sql;
    this.shelf = seams.shelf;
    this.key = seams.key;
    this.dataDir = seams.dataDir;
    this.stateRoot = seams.stateRoot;
    this.seams = seams;
    this.closeSeams = seams.close ?? (() => {});
    try {
      openSchema(this.sql, seams.where);
      this.writeHall();
    } catch (err) {
      this.closeSeams();
      throw err;
    }
  }

  /** The hall's row, written when it is missing or is not this town's; a second open writes nothing. */
  private writeHall(now = Date.now()): void {
    const held = this.getShop(HALL.name);
    if (held && JSON.stringify(held.manifest) === JSON.stringify(HALL) && held.owner === null) return;
    this.upsertShop(HALL, now);
  }

  /** Runs `fn` whole or not at all: the seam's transaction. */
  inTransaction<T>(fn: () => T): T {
    return this.sql.transaction(fn);
  }

  /** Where a laptop stages a shop's copy: <data>/shops. The box has no directory. */
  get shopsDir(): string {
    if (this.dataDir === null) throw new Error("this store has no data directory");
    return path.join(this.dataDir, "shops");
  }

  /** A copy of a shop's files, staged for its tests; the caller removes it. */
  stage(files: ReadonlyMap<string, BundleFile>): Promise<Staged> {
    return this.seams.stage(files);
  }

  /** A scratch state root for one shop test; the caller removes it. */
  scratch(): Promise<{ root: string; remove(): Promise<void> }> {
    return this.seams.scratch();
  }

  close(): void {
    this.closeSeams();
  }

  // meta

  setMeta(key: string, value: string): void {
    setMeta(this.sql, key, value);
  }

  getMeta(key: string): string | null {
    return getMeta(this.sql, key);
  }

  // users and passes: src/passes.ts

  addUser(name: string, now = Date.now()): User {
    return passes.addUser(this, name, now);
  }

  userByName(name: string): User | null {
    return passes.userByName(this, name);
  }

  listUsers(): User[] {
    return passes.listUsers(this);
  }

  newPass(userName: string, label: string, expiresAt: number | null, now = Date.now()): { pass: Pass; token: string } {
    return passes.newPass(this, userName, label, expiresAt, now);
  }

  passByTokenHash(tokenHash: string): Pass | null {
    return passes.passByTokenHash(this, tokenHash);
  }

  passById(id: string): Pass | null {
    return passes.passById(this, id);
  }

  listPasses(): Array<Pass & { lastUse: number | null }> {
    return passes.listPasses(this);
  }

  revokePass(id: string, now = Date.now()): Pass {
    return passes.revokePass(this, id, now);
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
    this.sql.run(
      "INSERT INTO grants (id, pass_id, shop, commands, constraints, created_at, expires_at, credentials, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, g.passId, g.shop, JSON.stringify(g.commands), JSON.stringify(g.constraints), now, g.expiresAt, JSON.stringify(g.credentials ?? {}), g.source ?? null,
    );
    return this.grantById(id)!;
  }

  grantById(id: string): Grant | null {
    const row = this.sql.get<Row>("SELECT * FROM grants WHERE id = ?", id);
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
    const row = this.sql.get<Row>("SELECT pass_id FROM grants WHERE id = ?", id);
    if (!row) return null;
    return this.passGrants(String(row.pass_id), now).find((g) => g.id === id)!.state;
  }

  listGrants(passId?: string, now = Date.now()): Array<Grant & { lastUse: number | null; state: GrantState }> {
    // GRANTS_WITH_STATE binds `now` first; the pass follows it.
    const sql = `SELECT g.*, (SELECT MAX(at) FROM calls c WHERE c.grant_id = g.id) AS last_use FROM (${GRANTS_WITH_STATE}) g
      ${passId ? "WHERE g.pass_id = ?" : ""} ORDER BY g.created_at, g.id`;
    const rows = passId ? this.sql.all<Row>(sql, now, passId) : this.sql.all<Row>(sql, now);
    return withLiveness(rows, this.manifests()).map(({ row, state }) => ({ ...toGrant(row), lastUse: nullableNumber(row.last_use), state }));
  }

  /** Every grant of the pass, whatever its state, oldest first. */
  private passGrants(passId: string, now: number): Array<Grant & { state: GrantState }> {
    const rows = this.sql.all<Row>(`SELECT * FROM (${GRANTS_WITH_STATE}) WHERE pass_id = ? ORDER BY created_at, id`, now, passId);
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
    if (grant.revokedAt === null) this.sql.run("UPDATE grants SET revoked_at = ? WHERE id = ?", now, id);
    return this.grantById(id)!;
  }

  // shops: src/shops.ts

  upsertShop(manifest: Manifest, now = Date.now(), owner: string | null = null, testedAt: number | null = now): void {
    shops.upsertShop(this, manifest, now, owner, testedAt);
  }

  markTested(name: string, now = Date.now()): void {
    shops.markTested(this, name, now);
  }

  getShop(name: string): ShopRow | null {
    return shops.getShop(this, name);
  }

  listShops(): ShopRow[] {
    return shops.listShops(this);
  }

  removeShop(name: string): boolean {
    return shops.removeShop(this, name);
  }

  // permits: src/permits.ts

  newPermit(p: { passId: string; shop: string; commands: string[]; constraints: Constraints; why: string }, now = Date.now()): Permit {
    return permits.newPermit(this, p, now);
  }

  permitById(id: string): Permit | null {
    return permits.permitById(this, id);
  }

  listPermits(passId?: string): Permit[] {
    return permits.listPermits(this, passId);
  }

  pendingPermit(id: string): Permit {
    return permits.pendingPermit(this, id);
  }

  decidePermit(id: string, decision: "approved" | "denied", grantId: string | null, now = Date.now()): Permit {
    return permits.decidePermit(this, id, decision, grantId, now);
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

/** The store of a laptop's data directory, made when missing: node:sqlite over <data>/town.db, the shelf at <data>/shops, the key at <data>/vault.key, the state under <data>/state, and staging and scratch on the disk. */
export function openStore(dataDir: string): Store {
  const dir = path.resolve(dataDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "town.db");
  const shops = path.join(dir, "shops");
  const sql = fileSql(file);
  return new Store({
    sql,
    shelf: diskShelf(shops),
    key: fileKey(dir),
    stateRoot: path.join(dir, "state"),
    async stage(files) {
      await mkdir(shops, { recursive: true });
      const staging = path.join(shops, `.staging-${randomBytes(6).toString("hex")}`);
      await mkdir(staging, { mode: 0o700 });
      const shelf = shopAt(staging);
      try {
        shelf.put("", files);
      } catch (err) {
        await rm(staging, { recursive: true, force: true });
        throw err;
      }
      return { shelf, remove: () => rm(staging, { recursive: true, force: true }) };
    },
    async scratch() {
      const root = await mkdtemp(path.join(os.tmpdir(), "town-shop-test-"));
      return { root, remove: () => rm(root, { recursive: true, force: true }) };
    },
    dataDir: dir,
    where: file,
    close: () => sql.close(),
  });
}

export function nullableNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
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
