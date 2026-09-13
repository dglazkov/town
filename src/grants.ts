// Grants, as the operator makes and reads them: the checks a grant must
// pass before `grant new` makes it (the manifest's commands and
// constraints, the pass, its dependencies covered, its needs bound), and
// the cells `grant ls` prints of one. And permits, the grants an agent
// proposes: `request` is checked by the first half of those checks, and
// `permit approve` makes its grant through all of them, never wider than
// asked. Every refusal is a line the admin or the hall prints as it is.
// At a shop with needs, `permit approve` checks in the order a person
// reads: a type still proposed, a credential of each need, then (the
// admin's, src/admin.ts) the shop's tests, and only then the grant.

import { needStates, needsText } from "./checklist.js";
import { checkGrantShape, parseConstraintLines, type Constraints } from "./constraints.js";
import { table } from "./help.js";
import type { GrantState } from "./liveness.js";
import type { Manifest } from "./manifest.js";
import { isoTime } from "./notices.js";
import { StoreError, type Grant, type Permit, type Store, type User } from "./store.js";

/** What a grant is made of once its checks pass, less when it expires. */
export interface GrantFields {
  passId: string;
  shop: string;
  commands: string[];
  constraints: Constraints;
  credentials: Record<string, string>;
}

/**
 * The first half of `grant new`'s checks: the shop is the town's (thrown),
 * and the commands (every one of the shop's when not given) and the
 * constraint lines fit its manifest (every refusal). What `request` checks.
 */
export function checkGrantAtShop(
  store: Store,
  req: { shop: string; commands: string | undefined; constraints: readonly string[] },
): { manifest: Manifest; commands: string[]; constraints: Constraints } | string[] {
  const shop = store.getShop(req.shop);
  if (!shop) throw new StoreError(`shop ${req.shop} is not in this town; townd admin shop ls lists them`);
  const manifest = shop.manifest;
  const commands = req.commands === undefined ? manifest.commands.map((c) => c.name) : req.commands.split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = parseConstraintLines(manifest, req.constraints);
  const refusals = [...parsed.refusals, ...(parsed.refusals.length ? [] : checkGrantShape(manifest, { commands, constraints: parsed.constraints }))];
  return refusals.length ? refusals : { manifest, commands, constraints: parsed.constraints };
}

/**
 * `grant new`'s checks, in order: checkGrantAtShop, then the pass exists
 * (thrown), its dependencies are covered, its needs are bound by the
 * credentials picked or the user's one of each type. The grant's fields,
 * or the lines refusing it.
 */
export function checkGrant(
  store: Store,
  req: { passId: string; shop: string; commands: string | undefined; constraints: readonly string[]; credentials: readonly string[] },
  now: number,
): GrantFields | string[] {
  const atShop = checkGrantAtShop(store, req);
  if (Array.isArray(atShop)) return atShop;
  const { manifest, commands, constraints } = atShop;
  const pass = store.passById(req.passId);
  if (!pass) throw new StoreError(`pass ${req.passId} does not exist; townd admin pass ls lists them`);
  const uncovered = uncoveredDependency(store, req.passId, manifest, now);
  if (uncovered) return [uncovered];
  const bound = bindNeeds(store, store.userByName(pass.userName)!, manifest.name, needsOf(manifest), req.credentials);
  if (typeof bound === "string") return [bound];
  return { passId: req.passId, shop: manifest.name, commands, constraints, credentials: bound };
}

/** What `permit approve` is given at the box. */
export interface ApproveRequest {
  commands: string | undefined;
  constraints: readonly string[];
  credentials: readonly string[];
  expiresAt: number | null;
}

/**
 * `permit approve`'s checks before the tests: the permit's commands or the
 * subset given (a command it did not ask for is refused as wider); at a
 * shop with needs, no need's type still proposed; then checkGrant, with
 * the permit's constraints on those commands and the given ones added,
 * which binds each need to the user's credential. The grant's fields, or
 * the lines refusing; a refusal leaves the permit pending.
 */
export function checkPermit(store: Store, id: string, req: ApproveRequest, now: number): GrantFields | string[] {
  const permit = store.pendingPermit(id);
  const commands = req.commands === undefined ? permit.commands : req.commands.split(",").map((s) => s.trim()).filter(Boolean);
  const wider = commands.filter((c) => !permit.commands.includes(c));
  if (wider.length) {
    return [`--commands: ${wider.join(", ")} is wider than ${id} asked; write some of ${permit.commands.join(",")}, or leave it out for all it asked`];
  }
  const proposed = needStates(store, permit.shop, permit.userName).find((n) => n.t?.state === "proposed");
  if (proposed) return [`${proposed.type} is proposed and not yet the town's; townd admin type approve ${proposed.type} first`];
  return checkGrant(
    store,
    { passId: permit.passId, shop: permit.shop, commands: commands.join(","), constraints: [...constraintLinesOf(permit.constraints, commands), ...req.constraints], credentials: req.credentials },
    now,
  );
}

/**
 * `permit approve`, whole for a shop whose tests need not run: checkPermit,
 * then makePermitGrant. The admin runs a shop's tests between the two.
 */
export function approvePermit(store: Store, id: string, req: ApproveRequest, now: number): { grant: Grant; revoked: Grant | null } | string[] {
  const checked = checkPermit(store, id, req, now);
  if (Array.isArray(checked)) return checked;
  return makePermitGrant(store, id, checked, req.expiresAt, now);
}

/**
 * The permit's grant, made in one write: the pass's live grant at the shop
 * revoked, the grant made with source `permit <id>`, and the decision
 * recorded with it.
 */
export function makePermitGrant(store: Store, id: string, checked: GrantFields, expiresAt: number | null, now: number): { grant: Grant; revoked: Grant | null } {
  const permit = store.pendingPermit(id);
  return store.inTransaction(() => {
    const held = store.grantsForPass(permit.passId, now).find((g) => g.shop === permit.shop) ?? null;
    if (held) store.revokeGrant(held.id, now);
    const grant = store.newGrant({ ...checked, expiresAt, source: `permit ${id}` }, now);
    store.decidePermit(id, "approved", grant.id, now);
    return { grant, revoked: held };
  });
}

/**
 * Permits as a table, newest last: the agent's own in `requests`, and with
 * the pass and its user's name in `permit ls`. When any is at a shop with
 * needs, a last column says each need's state; the agent's never names a
 * credential.
 */
export function permitTable(store: Store, permits: readonly Permit[], withPass: boolean): string {
  const needs = permits.map((p) => needsText(needStates(store, p.shop, p.userName), !withPass));
  const withNeeds = needs.some((n) => n !== "");
  const header = ["id", ...(withPass ? ["pass", "user"] : []), "shop", "commands", "constraints", "why", "asked", "state", ...(withNeeds ? ["needs"] : [])];
  const rows = permits.map((p, i) => [
    p.id,
    ...(withPass ? [p.passId, p.userName] : []),
    p.shop,
    p.commands.join(","),
    constraintText(p.constraints),
    p.why === "" ? "-" : p.why,
    isoTime(p.createdAt),
    permitStateText(store, p),
    ...(withNeeds ? [needs[i] || "-"] : []),
  ]);
  return table(header, rows);
}

/** `pending`, `denied`, or `approved as <grant id>`, with the commands granted when they are fewer than asked. */
function permitStateText(store: Store, p: Permit): string {
  if (p.decision === null) return "pending";
  if (p.decision === "denied") return "denied";
  const granted = p.grantId === null ? null : store.grantById(p.grantId);
  const fewer = granted && granted.commands.length < p.commands.length ? ` with ${granted.commands.join(",")}` : "";
  return `approved as ${p.grantId}${fewer}`;
}

/** A grant's constraints on `commands` as the `--constraint` lines that make them, the order kept. */
export function constraintLinesOf(c: Constraints, commands?: readonly string[]): string[] {
  const lines: string[] = [];
  for (const [target, rules] of Object.entries(c)) {
    if (commands && !commands.includes(target.split(".")[0]!)) continue;
    for (const [kind, rule] of Object.entries(rules)) lines.push(`${target} ${kind} ${Array.isArray(rule) ? rule.join(",") : String(rule)}`);
  }
  return lines;
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

export function needsOf(manifest: { credentials?: Array<{ type: string }> }): string[] {
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
    if (held.length === 0) return `user ${user.name} holds no ${type} credential; add one with townd admin credential add --user ${user.name} --type ${type}`;
    if (held.length > 1) return `user ${user.name} holds ${held.length} ${type} credentials (${held.map((c) => c.id).join(", ")}); pick one with --credential <id>`;
    out[type] = held[0]!.id;
  }
  return out;
}

export function constraintText(c: Constraints): string {
  const parts = constraintLinesOf(c);
  return parts.length ? parts.join("; ") : "-";
}
