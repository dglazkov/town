// Grants, as the operator makes and reads them: the checks a grant must
// pass before `grant new` makes it (the manifest's commands and
// constraints, the pass, its dependencies covered, its needs bound), and
// the cells `grant ls` prints of one. Every refusal is a line the admin
// prints as it is.

import { checkGrantShape, parseConstraintLines, type Constraints } from "./constraints.js";
import type { GrantState } from "./liveness.js";
import type { Manifest } from "./manifest.js";
import { StoreError, type Grant, type Store, type User } from "./store.js";

/** What a grant is made of once its checks pass, less when it expires. */
export interface GrantFields {
  passId: string;
  shop: string;
  commands: string[];
  constraints: Constraints;
  credentials: Record<string, string>;
}

/**
 * `grant new`'s checks, in order: the shop is the town's (thrown), the
 * commands (every one of the shop's when not given) and the constraint
 * lines against its manifest (every refusal), the pass exists (thrown),
 * its dependencies are covered, its needs are bound by the credentials
 * picked or the user's one of each type. The grant's fields, or the lines
 * refusing it.
 */
export function checkGrant(
  store: Store,
  req: { passId: string; shop: string; commands: string | undefined; constraints: readonly string[]; credentials: readonly string[] },
  now: number,
): GrantFields | string[] {
  const shop = store.getShop(req.shop);
  if (!shop) throw new StoreError(`shop ${req.shop} is not in this town; townd admin shop ls lists them`);
  const manifest = shop.manifest;
  const commands = req.commands === undefined ? manifest.commands.map((c) => c.name) : req.commands.split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = parseConstraintLines(manifest, req.constraints);
  const refusals = [...parsed.refusals, ...(parsed.refusals.length ? [] : checkGrantShape(manifest, { commands, constraints: parsed.constraints }))];
  if (refusals.length) return refusals;
  const pass = store.passById(req.passId);
  if (!pass) throw new StoreError(`pass ${req.passId} does not exist; townd admin pass ls lists them`);
  const uncovered = uncoveredDependency(store, req.passId, manifest, now);
  if (uncovered) return [uncovered];
  const bound = bindNeeds(store, store.userByName(pass.userName)!, manifest.name, needsOf(manifest), req.credentials);
  if (typeof bound === "string") return [bound];
  return { passId: req.passId, shop: manifest.name, commands, constraints: parsed.constraints, credentials: bound };
}

/**
 * Why a grant at `manifest`'s shop may not be made for the pass yet: the
 * first dependency the pass holds no live grant at covering its declared
 * commands, in the words that say which and the verb that fixes it; null
 * when every one is covered.
 */
export function uncoveredDependency(store: Store, passId: string, manifest: Manifest, now: number): string | null {
  const live = store.grantsForPass(passId, now);
  for (const dep of manifest.depends ?? []) {
    const held = live.filter((g) => g.shop === dep.shop);
    if (held.some((g) => dep.commands.every((c) => g.commands.includes(c)))) continue;
    if (held.length === 0) {
      return `pass ${passId} holds no grant at ${dep.shop} covering ${dep.commands.join(", ")}; grant one with townd admin grant new --pass ${passId} --shop ${dep.shop} --commands ${dep.commands.join(",")} first`;
    }
    const g = held[0]!;
    const missing = dep.commands.filter((c) => !g.commands.includes(c));
    return `pass ${passId}'s grant ${g.id} at ${dep.shop} lacks ${missing.join(", ")}, which ${manifest.name} calls; revoke it and grant one that has ${missing.length === 1 ? "it" : "them"}`;
  }
  return null;
}

/** A grant's state in `grant ls`: live, revoked, expired, or not live and why. */
export function grantStateText(store: Store, g: Grant, st: GrantState, now: number): string {
  if (st.kind === "lacks") {
    const held = store.grantsForPass(g.passId, now).some((x) => x.shop === st.shop);
    return held ? `not live: ${st.shop} lacks ${st.commands.join(", ")}` : `not live: ${st.shop} not granted`;
  }
  if (st.kind !== "unmet") return st.kind;
  const id = g.credentials[st.type];
  if (id === undefined) return `not live: no ${st.type} bound`;
  return store.credentialById(id)?.revokedAt != null ? `not live: ${id} removed` : `not live: ${st.type} unmet`;
}

/** A grant's bindings as `<type>=<id>`, comma-separated; `-` when none. */
export function bindingText(b: Record<string, string>): string {
  const parts = Object.entries(b).map(([type, id]) => `${type}=${id}`);
  return parts.length ? parts.join(",") : "-";
}

function needsOf(manifest: { credentials?: Array<{ type: string }> }): string[] {
  return (manifest.credentials ?? []).map((n) => n.type);
}

/**
 * For each need, the credential of `user` that meets it: the one given
 * with --credential, or the user's one unrevoked credential of the type.
 * Returns the binding, `{ "<type>": "<credential id>" }`, or the line
 * refusing: none of the type, several and none picked, or a picked
 * credential that is not the user's, is removed, or meets no need.
 */
export function bindNeeds(store: Store, user: User, shop: string, needs: string[], picked: readonly string[]): Record<string, string> | string {
  if (needs.length === 0 && picked.length) return `${shop} has no credentials to meet, so --credential binds nothing; leave it out`;
  const chosen = new Map<string, string>();
  for (const id of picked) {
    const c = store.credentialById(id);
    if (!c || c.userId !== user.id) return `--credential ${id} is not a credential of user ${user.name}; townd admin credential ls --user ${user.name} lists them`;
    if (c.revokedAt !== null) return `--credential ${id} is removed; townd admin credential ls --user ${user.name} lists the ones that are not`;
    if (!needs.includes(c.type)) return `--credential ${id} is a ${c.type} credential, and ${shop} needs ${needs.join(", ")}`;
    if (chosen.has(c.type)) return `--credential names two ${c.type} credentials (${chosen.get(c.type)}, ${id}); give one per need`;
    chosen.set(c.type, id);
  }
  const out: Record<string, string> = {};
  for (const type of needs) {
    const pick = chosen.get(type);
    if (pick !== undefined) {
      out[type] = pick;
      continue;
    }
    const held = store.liveCredentials(user.id, type);
    if (held.length === 0) return `user ${user.name} holds no ${type} credential; add one with townd admin credential add`;
    if (held.length > 1) return `user ${user.name} holds ${held.length} ${type} credentials (${held.map((c) => c.id).join(", ")}); pick one with --credential <id>`;
    out[type] = held[0]!.id;
  }
  return out;
}

export function constraintText(c: Constraints): string {
  const parts: string[] = [];
  for (const [target, rules] of Object.entries(c)) {
    for (const [kind, rule] of Object.entries(rules)) parts.push(`${target} ${kind} ${Array.isArray(rule) ? rule.join(",") : String(rule)}`);
  }
  return parts.length ? parts.join("; ") : "-";
}
