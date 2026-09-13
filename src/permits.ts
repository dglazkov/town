// Permits, as rows: a grant an agent proposed with `request`, pending
// until a person decides it, and kept after with the decision and the
// grant an approval made. A pass holds one pending permit per shop; a new
// one replaces it. The store's methods of these names call here; the
// checks a permit passes are src/grants.ts's.

import { randomBytes } from "node:crypto";
import type { Constraints } from "./constraints.js";
import { isoTime } from "./notices.js";
import { StoreError, nullableNumber, type Store } from "./store.js";

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

type Row = Record<string, unknown>;

const PERMIT_SELECT = "SELECT r.*, u.name AS user_name FROM permits r JOIN passes p ON p.id = r.pass_id JOIN users u ON u.id = p.user_id";

/** A pending permit of the pass at the shop; a pending one of the pass at that shop is replaced, in one write. */
export function newPermit(store: Store, p: { passId: string; shop: string; commands: string[]; constraints: Constraints; why: string }, now = Date.now()): Permit {
  const pass = store.passById(p.passId);
  if (!pass) throw new StoreError(`pass ${p.passId} does not exist; townd admin pass ls lists them`);
  if (!store.getShop(p.shop)) throw new StoreError(`shop ${p.shop} is not in this town; townd admin shop ls lists them`);
  const id = `prm_${randomBytes(8).toString("hex")}`;
  store.inTransaction(() => {
    store.sql.run("DELETE FROM permits WHERE pass_id = ? AND shop = ? AND decision IS NULL", p.passId, p.shop);
    store.sql.run("INSERT INTO permits (id, pass_id, shop, commands, constraints, why, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, p.passId, p.shop, JSON.stringify(p.commands), JSON.stringify(p.constraints), p.why, now);
  });
  return permitById(store, id)!;
}

export function permitById(store: Store, id: string): Permit | null {
  const row = store.sql.get<Row>(`${PERMIT_SELECT} WHERE r.id = ?`, id);
  return row ? toPermit(row) : null;
}

/** Every permit, or one pass's, oldest first, decided ones included. */
export function listPermits(store: Store, passId?: string): Permit[] {
  const order = "ORDER BY r.created_at, r.id";
  const rows = passId === undefined ? store.sql.all<Row>(`${PERMIT_SELECT} ${order}`) : store.sql.all<Row>(`${PERMIT_SELECT} WHERE r.pass_id = ? ${order}`, passId);
  return rows.map(toPermit);
}

/** The permit, when it is there and not yet decided; else the refusal saying which. */
export function pendingPermit(store: Store, id: string): Permit {
  const permit = permitById(store, id);
  if (!permit) throw new StoreError(`permit ${id} does not exist; townd admin permit ls lists them`);
  if (permit.decision !== null) {
    throw new StoreError(`permit ${id} was ${permit.decision} at ${isoTime(permit.decidedAt!)}; a decided permit is not decided again, so the agent asks again`);
  }
  return permit;
}

/** Records a person's decision on a pending permit, with the grant an approval made; a decided permit is refused. */
export function decidePermit(store: Store, id: string, decision: "approved" | "denied", grantId: string | null, now = Date.now()): Permit {
  pendingPermit(store, id);
  store.sql.run("UPDATE permits SET decision = ?, decided_at = ?, grant_id = ? WHERE id = ? AND decision IS NULL", decision, now, grantId, id);
  return permitById(store, id)!;
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
