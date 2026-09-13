// Credentials: the store's credential types and the credentials sealed
// under the vault's key, as rows. Every verb here shows a credential
// without its value or its sealed bytes; `openCredential` alone opens
// one, for one use in memory. The store's methods of these names call here.

import { StoreError, newId, nullableNumber, type Store } from "./store.js";
import { parseHeaderTemplate, parseOrigin } from "./teller.js";
import { openCredential as openSealed, sealCredential } from "./vault.js";

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

export function addType(store: Store, t: { name: string; origin: string; header: string }, now = Date.now()): CredentialType {
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
  store.db.prepare("INSERT INTO credential_types (name, origin, header, added_at) VALUES (?, ?, ?, ?)").run(t.name, t.origin, t.header, now);
  return getType(store, t.name)!;
}

/** Removes a type; refused while a credential of it is not revoked. */
export function removeType(store: Store, name: string): void {
  if (!getType(store, name)) throw new StoreError(`type ${name} is not in this town; townd admin type ls lists them`);
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
  if (!getType(store, c.type)) {
    throw new StoreError(`type ${c.type} is not a type this town holds; write one of (${listTypes(store).map((t) => t.name).join(", ")}), or add it with townd admin type add`);
  }
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
  return { name: String(r.name), origin: String(r.origin), header: String(r.header), addedAt: Number(r.added_at) };
}
