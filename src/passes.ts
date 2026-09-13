// Users and passes: a user is a name, the namespace its agents publish
// under, and a pass is what one of its agents holds, a bearer token stored
// only as its hash and resolved by that hash on every call, read from the
// file each time. The store's methods of these names call here.

import { createHash, randomBytes } from "node:crypto";
import { HALL } from "./hall.js";
import { StoreError, newId, nullableNumber, type Store } from "./store.js";

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

type Row = Record<string, unknown>;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// users

export function addUser(store: Store, name: string, now = Date.now()): User {
  // A user's name is the namespace its agents publish under, the first part of a shop's name.
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new StoreError(`user name ${JSON.stringify(name)} is not a namespace; write lowercase letters, digits, and "-", starting with a letter, since it is the first part of the name of every shop the user's agents publish`);
  }
  if (name === HALL.name.split("/")[0]) {
    throw new StoreError(`user name ${name} is the operator's namespace; write another name`);
  }
  if (userByName(store, name)) throw new StoreError(`user ${name} already exists`);
  const user = { id: newId("user"), name, createdAt: now };
  store.sql.run("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)", user.id, name, now);
  return user;
}

export function userByName(store: Store, name: string): User | null {
  const row = store.sql.get<Row>("SELECT * FROM users WHERE name = ?", name);
  return row ? toUser(row) : null;
}

export function listUsers(store: Store): User[] {
  return store.sql.all<Row>("SELECT * FROM users ORDER BY created_at, name").map(toUser);
}

// passes

/** A new pass for `userName`; the token is returned here and stored nowhere but as its hash. */
export function newPass(store: Store, userName: string, label: string, expiresAt: number | null, now = Date.now()): { pass: Pass; token: string } {
  const user = userByName(store, userName);
  if (!user) throw new StoreError(`user ${userName} does not exist; add it with townd admin user add ${userName}`);
  if (label.trim() === "") throw new StoreError("a pass needs a --label saying what holds it");
  const token = randomBytes(32).toString("base64url");
  const id = newId("pass");
  store.sql.run("INSERT INTO passes (id, user_id, label, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)", id, user.id, label, hashToken(token), now, expiresAt);
  return { pass: passById(store, id)!, token };
}

/** The pass whose token hashes to `tokenHash`, whatever its state; read from the file every time. */
export function passByTokenHash(store: Store, tokenHash: string): Pass | null {
  const row = store.sql.get<Row>("SELECT p.*, u.name AS user_name FROM passes p JOIN users u ON u.id = p.user_id WHERE p.token_hash = ?", tokenHash);
  return row ? toPass(row) : null;
}

export function passById(store: Store, id: string): Pass | null {
  const row = store.sql.get<Row>("SELECT p.*, u.name AS user_name FROM passes p JOIN users u ON u.id = p.user_id WHERE p.id = ?", id);
  return row ? toPass(row) : null;
}

export function listPasses(store: Store): Array<Pass & { lastUse: number | null }> {
  const rows = store.sql.all<Row>(
    `SELECT p.*, u.name AS user_name, (SELECT MAX(at) FROM calls c WHERE c.pass_id = p.id) AS last_use
     FROM passes p JOIN users u ON u.id = p.user_id ORDER BY p.created_at, p.id`,
  );
  return rows.map((r) => ({ ...toPass(r), lastUse: nullableNumber(r.last_use) }));
}

export function revokePass(store: Store, id: string, now = Date.now()): Pass {
  const pass = passById(store, id);
  if (!pass) throw new StoreError(`pass ${id} does not exist; townd admin pass ls lists them`);
  if (pass.revokedAt === null) store.sql.run("UPDATE passes SET revoked_at = ? WHERE id = ?", now, id);
  return passById(store, id)!;
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
