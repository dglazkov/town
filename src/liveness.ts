// Liveness: whether a grant reaches its shop now, compose's rule. One
// query decides what a grant decides alone, revoked, expired, or a need
// with no binding; a walk over the pass's grants decides the fourth
// reason, a dependency of its shop the pass does not hold. The store reads
// every grant of a pass through both.

import type { Manifest } from "./manifest.js";

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

type Row = Record<string, unknown>;

/**
 * Every grant with its liveness, as one query: `state` is `revoked`,
 * `expired`, `unmet`, or `live`, and `unmet` the first need of the shop's
 * current manifest with no binding of its type to an unrevoked credential
 * of the pass's user. A binding whose type the manifest does not name is
 * not read. Its one parameter, positional, is the time now. Every reader
 * of a pass's grants reads this, through `withLiveness`, which adds the
 * fourth reason, dependencies.
 */
export const GRANTS_WITH_STATE = `
SELECT x.*,
  CASE
    WHEN x.revoked_at IS NOT NULL THEN 'revoked'
    WHEN x.expires_at IS NOT NULL AND x.expires_at <= ? THEN 'expired'
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
 * `manifests` is the town's shops by name.
 */
export function withLiveness(rows: Row[], manifests: ReadonlyMap<string, Manifest>): Array<{ row: Row; state: GrantState }> {
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

function toState(r: Row): GrantState {
  const state = String(r.state);
  if (state === "unmet") return { kind: "unmet", type: String(r.unmet) };
  return { kind: state as "live" | "revoked" | "expired" };
}
