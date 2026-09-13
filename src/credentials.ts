// Credentials: the store's credential types and the credentials sealed
// under the vault's key, as rows. Every verb here shows a credential
// without its value or its sealed bytes; `openCredential` alone opens
// one, for one use in memory. The store's methods of these names call here.
// A type is held, the town's, or proposed by a shop's manifest and held by
// no credential until a person approves it; a held type's definition is
// never edited, only removed and added again.

import type { OAuthEndpoints } from "./manifest.js";
import { StoreError, newId, nullableNumber, type Store } from "./store.js";
import { parseHeaderTemplate, parseOrigin } from "./teller.js";
import { openCredential as openSealed, sealCredential } from "./vault.js";

/** A credential type: where its secret may be sent, the header it rides in, and whether the town holds it or a shop proposed it. */
export interface CredentialType {
  name: string;
  origin: string;
  header: string;
  addedAt: number;
  /** What its secret is: `token`, a value a person pastes. `oauth` comes in consent phase 1. */
  kind: "token" | "oauth";
  /** `held`, the town's; `proposed`, a shop's manifest's until a person approves it. */
  state: "proposed" | "held";
  /** The shop whose manifest proposed it; null for a seeded type or the operator's. */
  proposedBy: string | null;
  /** Prose for the person who makes the secret: the proposer's, or the operator's; empty when none. */
  guidance: string;
  /** An `oauth` type's endpoints and scopes; null for `token`. */
  oauth: OAuthEndpoints | null;
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

type Row = Record<string, unknown>;

const TYPE_NAME = /^[a-z][a-z0-9-]*$/;

const CREDENTIAL_SELECT = "SELECT c.id, c.user_id, c.type, c.label, c.created_at, c.revoked_at, u.name AS user_name FROM credentials c JOIN users u ON u.id = c.user_id";

// credential types

export function listTypes(store: Store): CredentialType[] {
  return (store.db.prepare("SELECT * FROM credential_types ORDER BY name").all() as Row[]).map(toType);
}

export function getType(store: Store, name: string): CredentialType | null {
  const row = store.db.prepare("SELECT * FROM credential_types WHERE name = ?").get(name) as Row | undefined;
  return row ? toType(row) : null;
}

export function addType(store: Store, t: { name: string; origin: string; header: string; guidance?: string }, now = Date.now()): CredentialType {
  if (!TYPE_NAME.test(t.name)) {
    throw new StoreError(`type name ${JSON.stringify(t.name)} is not a name; write lowercase letters, digits, and "-", starting with a letter`);
  }
  if (!parseOrigin(t.origin)) {
    throw new StoreError(`--origin ${JSON.stringify(t.origin)} is not an origin; write an absolute http: or https: URL with no query or fragment, like https://api.github.com`);
  }
  if (!parseHeaderTemplate(t.header)) {
    throw new StoreError(`--header ${JSON.stringify(t.header)} is not a header; write '<Name>: <value>' with {token} where the secret goes, like 'Authorization: Bearer {token}'`);
  }
  if (getType(store, t.name)) throw new StoreError(`type ${t.name} already exists; townd admin type ls lists them`);
  store.db.prepare("INSERT INTO credential_types (name, origin, header, added_at, guidance) VALUES (?, ?, ?, ?, ?)").run(t.name, t.origin, t.header, now, (t.guidance ?? "").trim());
  return getType(store, t.name)!;
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
  t: { name: string; origin: string; header: string; guidance?: string },
  proposedBy: string,
  held: boolean,
  now = Date.now(),
): CredentialType | null {
  if (getType(store, t.name)) return null;
  if (!TYPE_NAME.test(t.name) || !parseOrigin(t.origin) || !parseHeaderTemplate(t.header)) {
    throw new StoreError(`${proposedBy}'s definition of ${t.name} is not a type's; the validator refuses it (spec §8)`);
  }
  store.db
    .prepare("INSERT INTO credential_types (name, origin, header, added_at, kind, state, proposed_by, guidance) VALUES (?, ?, ?, ?, 'token', ?, ?, ?)")
    .run(t.name, t.origin, t.header, now, held ? "held" : "proposed", proposedBy, (t.guidance ?? "").trim());
  return getType(store, t.name)!;
}

/** The refusal for a credential at a proposed type, naming the verb that makes it the town's. */
export function proposedRefusal(t: CredentialType): string {
  return `type ${t.name} is proposed by ${t.proposedBy} and not yet the town's; townd admin type approve ${t.name} makes it so`;
}

/** Makes a proposed type held; its definition and guidance are the proposal's. Refused for a type not in the town or already held. */
export function approveType(store: Store, name: string): CredentialType {
  const t = getType(store, name);
  if (!t) throw new StoreError(`type ${name} is not in this town; townd admin type ls lists them`);
  if (t.state === "held") throw new StoreError(`type ${name} is already the town's; townd admin type ls lists them`);
  store.db.prepare("UPDATE credential_types SET state = 'held' WHERE name = ? AND state = 'proposed'").run(name);
  return getType(store, name)!;
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
  const id = newId("credential");
  store.db
    .prepare("INSERT INTO credentials (id, user_id, type, label, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, user.id, c.type, c.label, sealCredential(key, id, c.value), now);
  return credentialById(store, id)!;
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

export function revokeCredential(store: Store, id: string, now = Date.now()): Credential {
  const c = credentialById(store, id);
  if (!c) throw new StoreError(`credential ${id} does not exist; townd admin credential ls lists them`);
  if (c.revokedAt === null) store.db.prepare("UPDATE credentials SET revoked_at = ? WHERE id = ?").run(now, id);
  return credentialById(store, id)!;
}

/** How many sealed rows there are, revoked ones included: rows the vault's key must be there to open. */
export function sealedRows(store: Store): number {
  return Number((store.db.prepare("SELECT COUNT(*) AS n FROM credentials").get() as Row).n);
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
  };
}
