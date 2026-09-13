// The hall: `town/hall`, the shop every town is born with. Its manifest is
// data here, written to the store's `shops` on every open; its commands
// read and write the store, so they run in the town's process: the gate's
// sixth step calls `runHall` for a manifest whose runtime is `town`, with
// no binding and no process, and takes what it returns as the outcome.
// Everything it tells an agent is derived: help from manifests, refusals
// from `grant new`'s checks and the validator, the namespace from the
// pass's user, the held commands from the pass's live grants. It reads the
// store on every call and keeps nothing. `validate`, `test`, and `publish`
// are one path that stops at three places (design's Publishing): the
// bundle, the manifest, the hall's rules, the dependencies read for this
// pass, and the dependents; then the staging and the tests as the agent,
// src/publish.ts's; then the move, and the publish grant.

import { parse as parseYaml } from "yaml";
import type { ArgValues } from "./args.js";
import type { ResultClass } from "./audit.js";
import { readBundle } from "./bundle.js";
import type { GateDeps } from "./gate.js";
import { checkGrantAtShop, permitTable } from "./grants.js";
import { allowedCommands, helpForShop, typedName } from "./help.js";
import { parseManifest, type Manifest } from "./manifest.js";
import { breaksDependents, sendShop } from "./publish.js";
import { townShops } from "./shoptest.js";
import { SPEC } from "./spec.js";
import { StoreError, type Grant, type Pass, type Store } from "./store.js";

/** The hall's manifest, as the design writes it. */
export const HALL_YAML = `name: town/hall
version: 0.1.0
summary: Where the town's shops are found, made, and asked for.
guidance: |
  A shop is a directory holding a manifest.yaml and the entry it names;
  the manifest specification, printed here, is the whole of how to
  write one. A shop travels on stdin as a tar of its directory, made
  with \`tar --format ustar -cf - -C <dir> .\`. A shop you put in the
  town is named \`<your user>/<shop>\`, declares no credentials of its
  own, and its tests run as you: at the shops it depends on, with your
  grants. What your grants do not allow, ask for; a person decides at
  the box, and \`town --help\` shows the answer.
runtime: town
entry: src/hall.ts
commands:
  - name: search
    summary: List the town's shops, and which you hold.
    effect: read
    args:
      - { name: query, type: string, doc: "A word of a name or summary; every shop when omitted." }
    output: text
  - name: show
    summary: Print a shop's help as a full grant would read it.
    effect: read
    args:
      - { name: shop, type: string, required: true, doc: "A full name, like town/memory.", constrainable: [equals, one_of, prefix] }
    output: text
  - name: spec
    summary: Print the manifest specification.
    effect: read
    output: text
  - name: validate
    summary: Check a shop on stdin against the specification and this town, and say what to fix.
    effect: read
    output: text
  - name: test
    summary: Check a shop on stdin and run its tests as you, keeping nothing.
    effect: write
    output: text
  - name: publish
    summary: Check and test a shop on stdin, keep it under your name, and hold a grant at it.
    effect: write
    output: text
  - name: request
    summary: Ask for a grant at a shop, or a wider one; a person decides.
    effect: write
    args:
      - { name: shop, type: string, required: true, doc: "A full name, like town/memory.", constrainable: [equals, one_of, prefix] }
      - { name: commands, type: string, doc: "Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there. Every command when omitted." }
      - { name: constraint, type: string, doc: "Limits you propose, \`;\`-separated, each \`<command>.<arg> <kind> <value>\`." }
      - { name: why, type: string, doc: "One line a person reads.", constrainable: [max_length] }
    output: text
  - name: requests
    summary: List what you asked for and what became of each.
    effect: read
    output: text
tests:
  - name: the specification prints
    run: spec
    expect: { contains: "# Shop manifest v0" }
  - name: a search lists the hall
    run: search --query hall
    expect: { contains: "town/hall" }
`;

export const HALL = parseYaml(HALL_YAML) as Manifest;

/** The gate's own deps: the store, and for a sent shop's tests the runtime, the vault, the limit, and the path that decides and records each call. */
export type HallDeps = GateDeps;

/** One hall call, decided by the gate's first five steps: the pass, its grant at the hall, the command, and its parsed arguments. */
export interface HallCall {
  pass: Pass;
  grant: Grant;
  command: string;
  values: ArgValues;
  stdin: string | null;
  callId: string;
}

/** The hall's answer, taken whole as the gate's outcome: its words on stdout, one line per finding. */
export interface HallOutcome {
  stdout: string;
  exit: number;
  result: ResultClass;
  detail: string | null;
}

/** Answers one hall call. Never throws for anything the agent sent. */
export async function runHall(deps: HallDeps, call: HallCall): Promise<HallOutcome> {
  const { store } = deps;
  const now = (deps.now ?? Date.now)();
  const ok = (stdout: string, detail: string | null = null): HallOutcome => ({ stdout, exit: 0, result: "ok", detail });
  const refused = (lines: readonly string[], detail: string): HallOutcome => ({ stdout: lines.map((l) => `${l}\n`).join(""), exit: 1, result: "usage", detail });
  const text = (name: string) => (typeof call.values[name] === "string" ? (call.values[name] as string) : undefined);

  switch (call.command) {
    case "search": {
      const live = store.grantsForPass(call.pass.id, now);
      const query = text("query");
      const shops = store.listShops().filter((s) => query === undefined || matches(s.manifest, query));
      if (shops.length === 0) return ok(`no shop in this town matches ${JSON.stringify(query)}\n`);
      const width = Math.max(...shops.map((s) => s.name.length));
      const lines = shops.map(({ manifest: m }) => {
        const held = heldAt(m, live);
        const holds = held.length === 0 ? "none" : held.length === m.commands.length ? "all" : held.join(", ");
        return `${m.name.padEnd(width)}  ${m.summary} [${m.commands.map((c) => c.name).join(", ")}]  held: ${holds}\n`;
      });
      return ok(lines.join(""));
    }
    case "show": {
      const name = text("shop")!;
      const shop = store.getShop(name);
      if (!shop) return refused([`--shop: ${name} is not a shop in this town; town hall search lists the shops it holds`], "no-shop");
      return ok(helpForShop(shop.manifest, heldAt(shop.manifest, store.grantsForPass(call.pass.id, now))));
    }
    case "spec":
      return ok(SPEC);
    case "request": {
      const name = text("shop")!;
      if (!store.getShop(name)) return refused([`request refused: --shop: ${name} is not a shop in this town; town hall search lists the shops it holds`], "request refused");
      const lines = (text("constraint") ?? "").split(";").map((l) => l.trim()).filter((l) => l !== "");
      let checked: ReturnType<typeof checkGrantAtShop>;
      try {
        checked = checkGrantAtShop(store, { shop: name, commands: text("commands"), constraints: lines });
      } catch (err) {
        if (err instanceof StoreError) return refused([`request refused: ${err.message}`], "request refused");
        throw err;
      }
      if (Array.isArray(checked)) return refused(checked.map((r) => `request refused: ${r}`), "request refused");
      const permit = store.newPermit({ passId: call.pass.id, shop: name, commands: checked.commands, constraints: checked.constraints, why: text("why") ?? "" }, now);
      // A permit is a whole grant: if approved, it replaces the pass's grant at the shop, so the answer says what it would drop.
      const held = heldAt(checked.manifest, store.grantsForPass(call.pass.id, now));
      const dropped = held.filter((c) => !checked.commands.includes(c));
      const drops = dropped.length ? `if approved, this replaces your grant at ${name} and drops ${dropped.join(", ")}; name them to keep them\n` : "";
      return ok(`requested ${permit.id}; a person decides at the box, and town --help shows the answer\n${drops}`, `requested ${permit.id}`);
    }
    case "requests":
      return ok(permitTable(store, store.listPermits(call.pass.id), false));
    case "validate":
    case "test":
    case "publish":
      return send(deps, call, now);
  }
  return { stdout: `error: the hall has no command ${call.command}\n`, exit: 1, result: "town-error", detail: "no-command" };
}

/**
 * `validate`, `test`, and `publish`, steps 1 to 9. Refused at steps 1 to 5
 * or in the copy: one line per refusal, exit 1, result `usage`, detail
 * `refused` and each refusal's section. `validate` ends at 5; `test` at 7,
 * `tests n/m`, result `shop-error` when one failed; `publish` at 9.
 */
async function send(deps: HallDeps, call: HallCall, now: number): Promise<HallOutcome> {
  const { store } = deps;
  const refused = (lines: readonly string[], section: number): HallOutcome => ({
    stdout: lines.map((l) => `${l}\n`).join(""),
    exit: 1,
    result: "usage",
    detail: `refused ${lines.map((l) => `§${/\(spec §(\d+)\)$/.exec(l)?.[1] ?? section}`).join(",")}`,
  });
  const bundle = readBundle(call.stdin);
  if ("refusal" in bundle) return refused([bundle.refusal], 1);
  const checked = checkSent(store, call.pass, bundle.files.get("manifest.yaml")!.content, now);
  if (Array.isArray(checked)) return refused(checked, 8);
  const m = checked;
  if (call.command === "validate") {
    return { stdout: `ok ${m.name} ${m.version}: ${m.commands.map((c) => c.name).join(", ")}\n`, exit: 0, result: "ok", detail: `valid ${m.name} ${m.version}` };
  }

  const sent = await sendShop(deps, { pass: call.pass, files: bundle.files, parent: call.callId, keep: call.command === "publish" }, now);
  if ("refused" in sent) return refused(sent.refused, 1);
  const passed = sent.results.filter((r) => r.ok).length;
  const lines = sent.results.map((r) => (r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`));
  const tests = `tests ${passed}/${sent.results.length}`;
  if (passed < sent.results.length) return { stdout: lines.join(""), exit: 1, result: "shop-error", detail: tests };
  if (!sent.kept) return { stdout: lines.join(""), exit: 0, result: "ok", detail: tests };

  const shop = sent.manifest;
  lines.push(...sent.stopped.map((l) => `${l}\n`));
  const stands = publishGrant(store, call.pass, shop, now);
  if (stands) lines.push(`this pass's grant ${stands.id} at ${shop.name} was made by a person, so it stands as it is, and this publish made none\n`);
  const typed = typedName(shop.name, store.grantsForPass(call.pass.id, now).map((g) => g.shop));
  lines.push(`published ${shop.name} ${shop.version}; town ${typed} --help says what it does\n`);
  return { stdout: lines.join(""), exit: 0, result: "ok", detail: `published ${shop.name} ${shop.version}` };
}

/**
 * Steps 2 to 5 for a sent manifest's text: the validator's refusals
 * against this town's types and shops, then the hall's rules, the name
 * under the pass's user's namespace and no credentials; then, for a v0
 * manifest, each dependency covered by the pass's live grants, in the
 * agent's words; then the dependents, in `shop add`'s. The manifest, or
 * the lines refusing it.
 */
function checkSent(store: Store, pass: Pass, text: string, now: number): Manifest | string[] {
  const { manifest, refusals } = parseManifest(text, store.listTypes().map((t) => t.name), townShops(store));
  let raw: unknown = null;
  try {
    raw = parseYaml(text);
  } catch {
    // the validator has said so
  }
  const fields = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name = fields.name;
  if (typeof name === "string" && /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(name) && name.split("/")[0] !== pass.userName) {
    refusals.push(`name: ${name} is not under your namespace; write ${pass.userName}/${name.split("/")[1]} instead (spec §2)`);
  }
  const credentials = fields.credentials;
  if (credentials !== undefined && credentials !== null && !(Array.isArray(credentials) && credentials.length === 0)) {
    refusals.push("credentials: a shop you send holds no credential of its own; depend on the town's shop for that origin, or ask the person at the box to add one (spec §8)");
  }
  if (!manifest || refusals.length) return refusals;

  const live = store.grantsForPass(pass.id, now);
  const uncovered = (manifest.depends ?? []).flatMap((d, i) => {
    const held = live.find((g) => g.shop === d.shop);
    if (!held) return [`depends[${i}]: ${d.shop} at ${d.commands.join(", ")} is not in this grant; ask for it`];
    const missing = d.commands.filter((c) => !held.commands.includes(c));
    return missing.length ? [`depends[${i}]: this grant's ${d.shop} lacks ${missing.join(", ")}, which ${manifest.name} calls; ask for it`] : [];
  });
  if (uncovered.length) return uncovered;
  const broken = breaksDependents(store, manifest);
  return broken ? [broken] : manifest;
}

/**
 * Step 9: when the pass holds no live grant at the shop, or holds one a
 * publish made, every grant of the pass at the shop a publish made is
 * revoked and one at every command, no constraints, source `publish`, is
 * made, expiring never, in one write. When it holds one a person made,
 * that grant stands and is returned.
 */
function publishGrant(store: Store, pass: Pass, shop: Manifest, now: number): Grant | null {
  return store.inTransaction(() => {
    const held = store.grantsForPass(pass.id, now).find((g) => g.shop === shop.name);
    if (held && held.source !== "publish") return held;
    for (const g of store.listGrants(pass.id, now)) {
      if (g.shop === shop.name && g.source === "publish" && g.revokedAt === null) store.revokeGrant(g.id, now);
    }
    store.newGrant({ passId: pass.id, shop: shop.name, commands: shop.commands.map((c) => c.name), constraints: {}, expiresAt: null, source: "publish" }, now);
    return null;
  });
}

/** The commands of `manifest` the pass's live grant there holds, in manifest order; empty when it holds none. */
function heldAt(manifest: Manifest, live: readonly Grant[]): string[] {
  const grant = live.find((g) => g.shop === manifest.name);
  return grant ? allowedCommands(manifest, grant).map((c) => c.name) : [];
}

/** A case-insensitive substring of the shop's name, summary, guidance, or a command's name. */
function matches(m: Manifest, query: string): boolean {
  const q = query.toLowerCase();
  return [m.name, m.summary, m.guidance ?? "", ...m.commands.map((c) => c.name)].some((s) => s.toLowerCase().includes(q));
}
