// The audit: one row per call, the agent's and every call a shop made in
// its service, in the store's `calls` table, and the reads the operator's
// `audit` verb makes of it. The store's methods of these names call here.

import { nullableNumber, type Store } from "./store.js";
import type { WallKind } from "./wall.js";

export type ResultClass = "ok" | "denied" | "invalid-pass" | "usage" | "shop-error" | "timeout" | "town-error";

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
  /** The kind of wall the call's process ran within; null when no process ran: denied, refused, the hall's own, or a row made before wall. */
  wall: WallKind | null;
}

export interface CallRow extends CallRecord {
  id: number;
}

/** A row of a call tree: how many calls above it made it, 0 for the root. */
export interface TreeRow extends CallRow {
  depth: number;
}

type Row = Record<string, unknown>;

export function recordCall(store: Store, c: CallRecord): number {
  const r = store.db
    .prepare(
      `INSERT INTO calls (call_id, parent, at, pass_id, grant_id, shop, command, argv_hash, result, exit, shop_exit, latency_ms, notices, stderr, detail, credentials, wall)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      c.wall,
    );
  return Number(r.lastInsertRowid);
}

/** Audit rows, newest last. */
export function calls(store: Store, filter: { passId?: string; shop?: string; since?: number } = {}): CallRow[] {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (filter.passId !== undefined) (where.push("pass_id = ?"), params.push(filter.passId));
  if (filter.shop !== undefined) (where.push("shop = ?"), params.push(filter.shop));
  if (filter.since !== undefined) (where.push("at >= ?"), params.push(filter.since));
  const sql = `SELECT * FROM calls ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at, id`;
  return (store.db.prepare(sql).all(...params) as Row[]).map(toCall);
}

/**
 * One call and every call made in its service: the root at depth 0, then
 * each call's children after it, oldest first, each followed by its own.
 * Empty when there is no call with that id.
 */
export function callTree(store: Store, callId: string): TreeRow[] {
  const rows = store.db
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
    wall: r.wall === null || r.wall === undefined ? null : (String(r.wall) as WallKind),
  };
}
