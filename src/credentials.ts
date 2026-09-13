// Credentials: the store's credential types and the credentials sealed
// under the vault's key, as rows. Every verb here shows a credential
// without its value or its sealed bytes; `openCredential` alone opens
// one, for one use in memory. The store's methods of these names call here.
// A type is held, the town's, or proposed by a shop's manifest and held by
// no credential until a person approves it; a held type's definition is
// never edited, only removed and added again; its guidance alone follows
// the shop that proposed it, rewritten by that shop's next publish. A
// credential is replaced, not removed and added: the new one sealed, every
// unrevoked grant bound to the old pointed at it, and the old revoked, in
// one write. An `oauth` type holds its
// registration, the client id and secret sealed under the vault's key, and
// an `oauth` credential's value is the tokens as JSON, connected by
// src/consent.ts and sealed again by the gate when it refreshes them.

import type { OAuthEndpoints } from "./manifest.js";
import { namedHosts, sameDefinition } from "./needs.js";
import { parseEndpoint, type OAuthValue } from "./oauth.js";
import { StoreError, newId, nullableNumber, type Store } from "./store.js";
import { parseHeaderTemplate, parseOrigin } from "./teller.js";
import { openCredential as openSealed, sealCredential } from "./vault.js";

/** A credential type: where its secret may be sent, the header it rides in, and whether the town holds it or a shop proposed it. */
export interface CredentialType {
  name: string;
  origin: string;
  header: string;
  addedAt: number;
  /** What its secret is: `token`, a value a person pastes; `oauth`, a refresh token the town trades for access tokens. */
  kind: "token" | "oauth";
  /** `held`, the town's; `proposed`, a shop's manifest's until a person approves it. */
  state: "proposed" | "held";
  /** The shop whose manifest proposed it; null for a seeded type or the operator's. */
  proposedBy: string | null;
  /** Prose for the person who makes the secret: the proposer's, or the operator's; empty when none. */
  guidance: string;
  /** An `oauth` type's endpoints and scopes; null for `token`. */
  oauth: OAuthEndpoints | null;
  /** Whether an `oauth` type holds its registration; never the registration itself. */
  hasClient: boolean;
}

/** An `oauth` type's registration at the provider: the client id, and the secret, empty for a public client. */
export interface Client {
  id: string;
  secret: string;
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
  /** Why it was revoked, when the town revoked it: `refresh refused`; null otherwise. */
  revokedWhy: string | null;
  /** An `oauth` credential's granted scopes, plain; empty for a `token` credential. */
  scopes: string[];
  /** The grants whose bindings name it. */
  grants: string[];
}

type Row = Record<string, unknown>;

const TYPE_NAME = /^[a-z][a-z0-9-]*$/;

const CREDENTIAL_SELECT = "SELECT c.id, c.user_id, c.type, c.label, c.created_at, c.revoked_at, c.revoked_why, c.scopes, u.name AS user_name FROM credentials c JOIN users u ON u.id = c.user_id";

/** A type's registration as a sealed row's associated data: never a credential's id, which starts `credential_`. */
const clientSeal = (name: string) => `client:${name}`;

// credential types

export function listTypes(store: Store): CredentialType[] {
  return (store.db.prepare("SELECT * FROM credential_types ORDER BY name").all() as Row[]).map(toType);
}

export function getType(store: Store, name: string): CredentialType | null {
  const row = store.db.prepare("SELECT * FROM credential_types WHERE name = ?").get(name) as Row | undefined;
  return row ? toType(row) : null;
}

/** A type the operator defines: `token`, or `oauth` with its endpoints and scopes and the registration, sealed under `key`. */
export function addType(store: Store, t: TypeDefinition & { client?: Client }, now = Date.now(), key?: Buffer): CredentialType {
  if (!TYPE_NAME.test(t.name)) {
    throw new StoreError(`type name ${JSON.stringify(t.name)} is not a name; write lowercase letters, digits, and "-", starting with a letter`);
  }
  if (!parseOrigin(t.origin)) {
    throw new StoreError(`--origin ${JSON.stringify(t.origin)} is not an origin; write an absolute http: or https: URL with no query or fragment, like https://api.github.com`);
  }
  if (!parseHeaderTemplate(t.header)) {
    throw new StoreError(`--header ${JSON.stringify(t.header)} is not a header; write '<Name>: <value>' with {token} where the secret goes, like 'Authorization: Bearer {token}'`);
  }
  if (t.oauth) checkOAuth(t.oauth);
  if (getType(store, t.name)) throw new StoreError(`type ${t.name} already exists; townd admin type ls lists them`);
  if (t.oauth && !t.client) throw new StoreError(`type ${t.name} is an oauth type and needs its registration; write --client-id <id>, with the client secret on stdin`);
  if (!t.oauth && t.client) throw new StoreError(`type ${t.name} is a token type and takes no registration; leave out --client-id, or write --kind oauth with its endpoints`);
  store.db
    .prepare("INSERT INTO credential_types (name, origin, header, added_at, guidance, kind, oauth, client) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(t.name, t.origin, t.header, now, (t.guidance ?? "").trim(), t.oauth ? "oauth" : "token", t.oauth ? oauthJson(t.oauth) : null, t.client ? sealClient(t.name, t.client, key) : null);
  return getType(store, t.name)!;
}

/** What defines a type: its origin and header, an `oauth` type's endpoints and scopes, and guidance. */
export interface TypeDefinition {
  name: string;
  origin: string;
  header: string;
  guidance?: string;
  oauth?: OAuthEndpoints;
}

/** Refuses endpoints that are not https: (or http: on loopback) and scopes that are not a list of words. */
function checkOAuth(o: OAuthEndpoints): void {
  if (!parseEndpoint(o.authorize)) throw new StoreError(`--authorize ${JSON.stringify(o.authorize)} is not an endpoint; write the provider's https: URL, like https://accounts.google.com/o/oauth2/v2/auth`);
  if (!parseEndpoint(o.token)) throw new StoreError(`--token ${JSON.stringify(o.token)} is not an endpoint; write the provider's https: URL, like https://oauth2.googleapis.com/token`);
  if (!Array.isArray(o.scopes) || o.scopes.length === 0 || !o.scopes.every((x) => typeof x === "string" && /^\S+$/.test(x))) {
    throw new StoreError("--scopes is not a list of scopes; write them comma-separated, like https://www.googleapis.com/auth/documents.readonly");
  }
}

const oauthJson = (o: OAuthEndpoints) => JSON.stringify({ authorize: o.authorize, token: o.token, scopes: o.scopes });

function sealClient(name: string, client: Client, key: Buffer | undefined): Buffer {
  if (!key) throw new StoreError(`type ${name}'s registration is sealed under the vault's key, and none was given`);
  if (client.id.trim() === "") throw new StoreError("--client-id is empty; write the client id the provider gave the registration");
  return sealCredential(key, clientSeal(name), JSON.stringify({ id: client.id, secret: client.secret }));
}

/** An `oauth` type's registration, opened for one use in memory. */
export function openClient(store: Store, name: string, key: Buffer): Client {
  const row = store.db.prepare("SELECT client FROM credential_types WHERE name = ?").get(name) as Row | undefined;
  if (!row || row.client === null || row.client === undefined) throw new StoreError(`type ${name} holds no registration; townd admin type ls lists the types`);
  const c = JSON.parse(openSealed(key, clientSeal(name), row.client as Uint8Array)) as Client;
  return { id: String(c.id), secret: String(c.secret) };
}

/**
 * Writes the type a shop's manifest defines and the town lacks: proposed,
 * by `proposedBy`, with the need's guidance, or held in the same write when
 * the operator's `shop add` defines it. A type the town holds is left as
 * it is, since the validator has already refused a definition that
 * differs. Returns the type when this wrote one.
 */
export function proposeType(
  store: Store,
  t: TypeDefinition,
  proposedBy: string,
  held: boolean,
  now = Date.now(),
  registration?: { client: Client; key: Buffer },
): CredentialType | null {
  if (getType(store, t.name)) return null;
  if (!TYPE_NAME.test(t.name) || !parseOrigin(t.origin) || !parseHeaderTemplate(t.header)) {
    throw new StoreError(`${proposedBy}'s definition of ${t.name} is not a type's; the validator refuses it (spec §8)`);
  }
  if (t.oauth) checkOAuth(t.oauth);
  // A held oauth type is the operator's, with the registration; a proposal never holds one.
  if (held && t.oauth && !registration) throw new StoreError(`${proposedBy} defines ${t.name}, an oauth type, and holding it needs its registration; write --client-id <id>, with the client secret on stdin`);
  const client = held && t.oauth && registration ? sealClient(t.name, registration.client, registration.key) : null;
  store.db
    .prepare("INSERT INTO credential_types (name, origin, header, added_at, kind, state, proposed_by, guidance, oauth, client) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(t.name, t.origin, t.header, now, t.oauth ? "oauth" : "token", held ? "held" : "proposed", proposedBy, (t.guidance ?? "").trim(), t.oauth ? oauthJson(t.oauth) : null, client);
  return getType(store, t.name)!;
}

/**
 * Writes the guidance of `by`'s manifest onto the type `by` proposed, held
 * or proposed, when the need's definition is the type's and its words
 * differ; the origin, header, and `oauth` a person approved never move. A
 * shop that did not propose the type, a need with no guidance, and the same
 * words write nothing. The words name no host the type does not send to, as
 * the validator refuses (spec §8). Whether it wrote.
 */
export function reviseGuidance(store: Store, t: TypeDefinition, by: string): boolean {
  const held = getType(store, t.name);
  const words = (t.guidance ?? "").trim();
  if (!held || held.proposedBy !== by || words === "" || words === held.guidance) return false;
  if (!sameDefinition(held, { type: t.name, origin: t.origin, header: t.header, ...(t.oauth ? { oauth: t.oauth } : {}) })) throw new StoreError(`${by}'s definition of ${t.name} is not the town's; the validator refuses it (spec §8)`);
  const sends = [held.origin, ...(held.oauth ? [held.oauth.authorize, held.oauth.token] : [])].map((u) => new URL(u).hostname.toLowerCase());
  const other = namedHosts(words).find((h) => !sends.includes(h));
  if (other !== undefined) throw new StoreError(`${by}'s guidance for ${t.name} names ${other}, which is not where this type sends; the validator refuses it (spec §8)`);
  store.db.prepare("UPDATE credential_types SET guidance = ? WHERE name = ? AND proposed_by = ?").run(words, t.name, by);
  return true;
}

/** The refusal for a credential at a proposed type, naming the verb that makes it the town's. */
export function proposedRefusal(t: CredentialType): string {
  return `type ${t.name} is proposed by ${t.proposedBy} and not yet the town's; townd admin type approve ${t.name} makes it so`;
}

/**
 * Makes a proposed type held; its definition and guidance are the
 * proposal's, and an `oauth` type's registration is the operator's, given
 * here and sealed under `key`. Refused for a type not in the town or
 * already held, an `oauth` type without a registration, and a `token` type
 * with one.
 */
export function approveType(store: Store, name: string, registration?: { client: Client; key: Buffer }): CredentialType {
  const t = checkApprove(store, name, registration !== undefined);
  const client = registration ? sealClient(name, registration.client, registration.key) : null;
  store.db.prepare("UPDATE credential_types SET state = 'held', client = COALESCE(?, client) WHERE name = ? AND state = 'proposed'").run(client, t.name);
  return getType(store, name)!;
}

/** The type `type approve` may approve, given a registration or not; else its refusal, thrown. */
export function checkApprove(store: Store, name: string, withClient: boolean): CredentialType {
  const t = getType(store, name);
  if (!t) throw new StoreError(`type ${name} is not in this town; townd admin type ls lists them`);
  if (t.state === "held") throw new StoreError(`type ${name} is already the town's; townd admin type ls lists them`);
  if (t.kind === "oauth" && !withClient) throw new StoreError(`type ${name} is an oauth type and needs its registration; write --client-id <id>, with the client secret on stdin`);
  if (t.kind === "token" && withClient) throw new StoreError(`type ${name} is a token type and takes no registration; leave out --client-id`);
  return t;
}

/** Removes a type: a held one refused while a credential of it is not revoked, a proposed one while a shop's manifest names it. */
export function removeType(store: Store, name: string): void {
  const t = getType(store, name);
  if (!t) throw new StoreError(`type ${name} is not in this town; townd admin type ls lists them`);
  if (t.state === "proposed") {
    const naming = store.listShops().filter((s) => (s.manifest.credentials ?? []).some((n) => n.type === name)).map((s) => s.name);
    if (naming.length) {
      const many = naming.length !== 1;
      throw new StoreError(`type ${name} is proposed and named by ${many ? "shops" : "a shop"} (${naming.join(", ")}); remove ${many ? "them" : "it"} with townd admin shop rm first`);
    }
  }
  const held = (store.db.prepare("SELECT id FROM credentials WHERE type = ? AND revoked_at IS NULL ORDER BY created_at, id").all(name) as Row[]).map((r) => String(r.id));
  if (held.length) {
    const many = held.length !== 1;
    throw new StoreError(`type ${name} is held by ${many ? `${held.length} credentials` : "a credential"} (${held.join(", ")}); remove ${many ? "them" : "it"} with townd admin credential rm first`);
  }
  store.db.prepare("DELETE FROM credential_types WHERE name = ?").run(name);
}

// credentials

/** Seals `value` under `key` for a new credential and stores the sealed row; returns the credential, never the value. */
export function addCredential(store: Store, c: { userName: string; type: string; label: string; value: string }, key: Buffer, now = Date.now()): Credential {
  const user = store.userByName(c.userName);
  if (!user) throw new StoreError(`user ${c.userName} does not exist; add it with townd admin user add ${c.userName}`);
  const t = getType(store, c.type);
  if (!t) {
    throw new StoreError(`type ${c.type} is not a type this town holds; write one of (${listTypes(store).map((t) => t.name).join(", ")}), or add it with townd admin type add`);
  }
  if (t.state === "proposed") throw new StoreError(proposedRefusal(t));
  if (t.kind === "oauth") throw new StoreError(oauthRefusal(t, c.userName));
  const id = newId("credential");
  store.db
    .prepare("INSERT INTO credentials (id, user_id, type, label, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, user.id, c.type, c.label, sealCredential(key, id, c.value), now);
  return credentialById(store, id)!;
}

/** The refusal for a pasted credential at an `oauth` type, naming the verb that connects one. */
export function oauthRefusal(t: CredentialType, userName: string): string {
  return `type ${t.name} is an oauth type, connected in a browser and never pasted; townd admin credential connect --user ${userName} --type ${t.name} connects one`;
}

/**
 * The type `credential connect` connects at, for `userName`: held, `oauth`,
 * holding its registration, and the user in the town; else the refusal,
 * thrown, a `token` type's naming `credential add`.
 */
export function connectableType(store: Store, userName: string, type: string): CredentialType {
  if (!store.userByName(userName)) throw new StoreError(`user ${userName} does not exist; add it with townd admin user add ${userName}`);
  const t = getType(store, type);
  if (!t) throw new StoreError(`type ${type} is not a type this town holds; write one of (${listTypes(store).map((x) => x.name).join(", ")}), or add it with townd admin type add`);
  if (t.state === "proposed") throw new StoreError(proposedRefusal(t));
  if (t.kind === "token") throw new StoreError(`type ${t.name} is a token type, pasted and never connected; townd admin credential add --user ${userName} --type ${t.name} adds one, the secret on stdin`);
  if (!t.hasClient) throw new StoreError(`type ${t.name} holds no registration; townd admin type rm ${t.name} and type add it again with --client-id`);
  return t;
}

/** Seals a consent's tokens as a new credential of an `oauth` type, its scopes the granted ones; returns the credential, never the value. */
export function connectCredential(store: Store, c: { userName: string; type: string; label: string; value: OAuthValue }, key: Buffer, now = Date.now()): Credential {
  connectableType(store, c.userName, c.type);
  const user = store.userByName(c.userName)!;
  const id = newId("credential");
  store.db
    .prepare("INSERT INTO credentials (id, user_id, type, label, sealed, created_at, scopes) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, user.id, c.type, c.label, sealCredential(key, id, JSON.stringify(c.value)), now, JSON.stringify(c.value.scope.split(/\s+/).filter(Boolean)));
  return credentialById(store, id)!;
}

/** Seals an `oauth` credential's row again with the value a refresh made, its scopes with it. */
export function refreshCredential(store: Store, id: string, value: OAuthValue, key: Buffer): void {
  store.db
    .prepare("UPDATE credentials SET sealed = ?, scopes = ? WHERE id = ?")
    .run(sealCredential(key, id, JSON.stringify(value)), JSON.stringify(value.scope.split(/\s+/).filter(Boolean)), id);
}

export function credentialById(store: Store, id: string): Credential | null {
  const row = store.db.prepare(`${CREDENTIAL_SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  return row ? toCredential(store, row) : null;
}

/** Every credential, or one user's, oldest first, revoked ones included. */
export function listCredentials(store: Store, userName?: string): Credential[] {
  const rows = (userName === undefined
    ? store.db.prepare(`${CREDENTIAL_SELECT} ORDER BY c.created_at, c.id`).all()
    : store.db.prepare(`${CREDENTIAL_SELECT} WHERE u.name = ? ORDER BY c.created_at, c.id`).all(userName)) as Row[];
  return rows.map((r) => toCredential(store, r));
}

/** A user's credentials of a type that are not revoked. */
export function liveCredentials(store: Store, userId: string, type: string): Credential[] {
  const rows = store.db.prepare(`${CREDENTIAL_SELECT} WHERE c.user_id = ? AND c.type = ? AND c.revoked_at IS NULL ORDER BY c.created_at, c.id`).all(userId, type) as Row[];
  return rows.map((r) => toCredential(store, r));
}

/** A credential's value, opened from its sealed row for one use in memory. */
export function openCredential(store: Store, id: string, key: Buffer): string {
  const row = store.db.prepare("SELECT sealed FROM credentials WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new StoreError(`credential ${id} does not exist; townd admin credential ls lists them`);
  return openSealed(key, id, row.sealed as Uint8Array);
}

/** Revokes a credential, with why when the town revoked it; a revoked one keeps its first revocation. */
export function revokeCredential(store: Store, id: string, now = Date.now(), why: string | null = null): Credential {
  const c = credentialById(store, id);
  if (!c) throw new StoreError(`credential ${id} does not exist; townd admin credential ls lists them`);
  if (c.revokedAt === null) store.db.prepare("UPDATE credentials SET revoked_at = ?, revoked_why = ? WHERE id = ?").run(now, why, id);
  return credentialById(store, id)!;
}

/**
 * The credential `--replace <id>` names for a new credential of `type` for
 * `userName`; else the refusal, thrown, naming which: none by that id, one
 * already revoked, one of another type, or another user's.
 */
export function checkReplace(store: Store, id: string, userName: string, type: string): Credential {
  const c = credentialById(store, id);
  if (!c) throw new StoreError(`--replace ${id}: credential ${id} does not exist; townd admin credential ls --user ${userName} lists ${userName}'s`);
  if (c.revokedAt !== null) throw new StoreError(`--replace ${id}: credential ${id} is revoked${c.revokedWhy ? ` (${c.revokedWhy})` : ""}, so nothing reads it to replace; leave out --replace`);
  if (c.type !== type) throw new StoreError(`--replace ${id}: credential ${id} is of type ${c.type}, not ${type}; a credential is replaced by one of its own type`);
  if (c.userName !== userName) throw new StoreError(`--replace ${id}: credential ${id} is user ${c.userName}'s, not ${userName}'s; a credential is replaced by one of its own user's`);
  return c;
}

/**
 * A credential replaced, in one write: `make` seals the new one; then, the
 * old checked as checkReplace checks it, every unrevoked grant bound to the
 * old is bound to the new instead, its shop, commands, constraints, and
 * source untouched, and the old is revoked, `replaced by <new id>`. The new
 * credential and the grants moved, by id; nothing written on a refusal.
 */
export function replaceCredential(store: Store, old: string, make: () => Credential, now = Date.now()): { credential: Credential; moved: Array<{ id: string; shop: string }> } {
  return store.inTransaction(() => {
    const c = make();
    checkReplace(store, old, c.userName, c.type);
    const bound = store.db.prepare("SELECT DISTINCT g.id, g.shop, g.credentials FROM grants g, json_each(g.credentials) j WHERE j.value = ? AND g.revoked_at IS NULL ORDER BY g.id").all(old) as Row[];
    const moved = bound.map((g) => {
      const binding = Object.fromEntries(Object.entries(JSON.parse(String(g.credentials)) as Record<string, string>).map(([type, id]) => [type, id === old ? c.id : id]));
      store.db.prepare("UPDATE grants SET credentials = ? WHERE id = ?").run(JSON.stringify(binding), String(g.id));
      return { id: String(g.id), shop: String(g.shop) };
    });
    revokeCredential(store, old, now, `replaced by ${c.id}`);
    return { credential: credentialById(store, c.id)!, moved };
  });
}

/** How many sealed rows there are, revoked credentials and types' registrations included: rows the vault's key must be there to open. */
export function sealedRows(store: Store): number {
  return Number((store.db.prepare("SELECT (SELECT COUNT(*) FROM credentials) + (SELECT COUNT(*) FROM credential_types WHERE client IS NOT NULL) AS n").get() as Row).n);
}

function toCredential(store: Store, r: Row): Credential {
  const grants = (store.db.prepare("SELECT DISTINCT g.id FROM grants g, json_each(g.credentials) j WHERE j.value = ? ORDER BY g.id").all(String(r.id)) as Row[]).map((g) => String(g.id));
  return {
    id: String(r.id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    type: String(r.type),
    label: String(r.label),
    createdAt: Number(r.created_at),
    revokedAt: nullableNumber(r.revoked_at),
    revokedWhy: r.revoked_why === null || r.revoked_why === undefined ? null : String(r.revoked_why),
    scopes: r.scopes === null || r.scopes === undefined ? [] : (JSON.parse(String(r.scopes)) as string[]),
    grants,
  };
}

function toType(r: Row): CredentialType {
  return {
    name: String(r.name),
    origin: String(r.origin),
    header: String(r.header),
    addedAt: Number(r.added_at),
    kind: String(r.kind) === "oauth" ? "oauth" : "token",
    state: String(r.state) === "proposed" ? "proposed" : "held",
    proposedBy: r.proposed_by === null || r.proposed_by === undefined ? null : String(r.proposed_by),
    guidance: String(r.guidance ?? ""),
    oauth: r.oauth === null || r.oauth === undefined ? null : (JSON.parse(String(r.oauth)) as OAuthEndpoints),
    hasClient: r.client !== null && r.client !== undefined,
  };
}
