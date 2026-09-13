// The hall: `town/hall`, the shop every town is born with. Its manifest is
// data here, written to the store's `shops` on every open; its commands
// read and write the store, so they run in the town's process: the gate's
// sixth step calls `runHall` for a manifest whose runtime is `town`, with
// no binding and no process, and takes what it returns as the outcome.
// Everything it tells an agent is derived: help from manifests, refusals
// from `grant new`'s checks, the held commands from the pass's live grants.
// It reads the store on every call and keeps nothing.

import { parse as parseYaml } from "yaml";
import type { ArgValues } from "./args.js";
import type { ResultClass } from "./audit.js";
import { checkGrantAtShop, permitTable } from "./grants.js";
import { allowedCommands, helpForShop } from "./help.js";
import type { Manifest } from "./manifest.js";
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
      - { name: commands, type: string, doc: "Comma-separated; every command when omitted." }
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

export interface HallDeps {
  store: Store;
  now?: () => number;
}

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
      return ok(`requested ${permit.id}; a person decides at the box, and town --help shows the answer\n`, `requested ${permit.id}`);
    }
    case "requests":
      return ok(permitTable(store, store.listPermits(call.pass.id), false));
    case "validate":
    case "test":
    case "publish":
      // Hall phase 1: the bundle, the checks, the tests as the agent, and the publish.
      return { stdout: "error: not built yet\n", exit: 1, result: "town-error", detail: "not built yet" };
  }
  return { stdout: `error: the hall has no command ${call.command}\n`, exit: 1, result: "town-error", detail: "no-command" };
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
