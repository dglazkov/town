// A shop's own tests, run through the runtime: each test's lines parsed
// against the manifest and run in order against one scratch state made
// for that test (spec §6). A shop with needs has its tests run through
// tellers on the credentials it is given, against the types' origins. A
// shop with dependencies has its tests run with the tree, over the
// dependencies' code in the town, against the test's scratch state, as
// one of two callers. The operator's, at the box: its calls pass the gate
// with a grant at every shop in the tree of exactly the commands declared
// of it, and nothing is written to the town's store. An agent's, for the
// hall: its calls are the agent's pass with the test's scratch root, so at
// every dependency the gate cuts the agent's own grants by the manifest,
// and records each call under the hall's. A line that fails after a call
// of its was denied says the denial's line. Every line runs within the
// wall it is given, the agent's the gate's own: a shop's tests are the
// shop's code too. The operator's tree at a permit's approval is recorded:
// each line's run a row under the approval's, and every call below it a
// row under the line's. The shop under test is handed to the runtime as
// the shelf of its one directory, its own or the copy staged for it.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalArgv, parseArgs, splitWords } from "./args.js";
import { answerFor, argvHash, newCallId, type Caller, type GateDeps, type Runtime, type TestTree } from "./gate.js";
import { parseManifest, type Manifest, type ShopTest, type TownShop, type TownType } from "./manifest.js";
import { runShelved, type RunCredential, type RunOptions, type RunResult } from "./runtime.js";
import { shopAt, type Shelf } from "./shelf.js";
import type { Pass } from "./passes.js";
import type { Grant, Store } from "./store.js";
import type { Wall } from "./wall.js";

export interface TestResult {
  name: string;
  ok: boolean;
  /** Why it failed; absent when ok. */
  why?: string;
}

/** The manifest at `dir` was refused; `refusals` says why, one line each. */
export class ManifestRefused extends Error {
  constructor(readonly refusals: string[]) {
    super(`manifest refused:\n${refusals.join("\n")}`);
    this.name = "ManifestRefused";
  }
}

export interface TestShopOptions {
  /** What encloses each line's process, and every dependency's below it; the agent's tree uses its gate's, which must be this one. */
  wall: Wall;
  /** What runs each line: the laptop's process runtime when omitted, and the agent's tree uses its gate's. */
  runtime?: Runtime;
  /** The limit each line runs under; the runtime's thirty seconds when omitted. */
  timeoutMs?: number;
  /** The credential types the town holds, with their definitions; omitted when no store is at hand, and then a need is refused. */
  types?: readonly (string | TownType)[];
  /** The shops the town holds; omitted when no store is at hand, and then a dependency is refused. */
  shops?: readonly TownShop[];
  /** The town whose shops a shop with dependencies calls; read, never written. */
  store?: Store;
  /** One per need of the tree, the shop's and its dependencies', each opened as a teller for the call that needs it. */
  credentials?: RunCredential[];
  /**
   * Whom the tree runs as. Omitted, the operator's TestTree over `store`.
   * Given, the agent's pass: each line runs as its user, through the
   * town's runtime in `deps`, and every call
   * below is decided by `deps`'s gate for the pass with the test's scratch
   * root, under `parent`, the hall's call.
   */
  agent?: { deps: GateDeps; pass: Pass; parent: string };
  /**
   * The operator's tree, recorded in `store`'s audit: each line's run a row
   * under `parent`, the approval's row, at `now`, and every call below it
   * decided and recorded by `decide` under the line's row.
   */
  audit?: { parent: string; decide: NonNullable<GateDeps["decide"]>; now: number };
}

/** The opaque user every shop test runs as. */
export const TEST_USER = "shop-test";

/** The shops a store holds, as the validator reads them. */
export function townShops(store: Store): TownShop[] {
  return store.listShops().map((s) => ({ name: s.name, commands: s.manifest.commands.map((c) => c.name) }));
}

/**
 * The tree under `manifest` in `store`: at every shop it reaches through
 * dependencies, a grant of the commands declared of that shop anywhere in
 * the tree with no constraints; and every need in the tree, the shop's
 * first, each type once.
 */
export function treeOf(manifest: Manifest, store: Store): { grants: Grant[]; needs: string[] } {
  const commands = new Map<string, Set<string>>();
  const needs = new Set((manifest.credentials ?? []).map((n) => n.type));
  const seen = new Set([manifest.name]);
  const queue = [manifest];
  while (queue.length) {
    for (const d of queue.shift()!.depends ?? []) {
      const at = commands.get(d.shop) ?? new Set<string>();
      for (const c of d.commands) at.add(c);
      commands.set(d.shop, at);
      if (seen.has(d.shop)) continue;
      seen.add(d.shop);
      const dep = store.getShop(d.shop);
      if (!dep) throw new Error(`${d.shop} is not a shop this town holds`);
      for (const n of dep.manifest.credentials ?? []) needs.add(n.type);
      queue.push(dep.manifest);
    }
  }
  const grants = [...commands].map(([shop, cs]) => ({
    id: `shop-test:${shop}`,
    passId: "",
    shop,
    commands: [...cs],
    constraints: {},
    createdAt: 0,
    expiresAt: null,
    revokedAt: null,
    credentials: {},
    source: null,
  }));
  return { grants, needs: [...needs] };
}

/** Reads and validates `dir/manifest.yaml` against the town's `types` and `shops`, throwing ManifestRefused when it is not v0. */
export async function loadShop(dir: string, types?: readonly (string | TownType)[], shops?: readonly TownShop[]): Promise<Manifest> {
  let text: string;
  try {
    text = await readFile(path.join(dir, "manifest.yaml"), "utf8");
  } catch {
    throw new ManifestRefused([`manifest.yaml: is not in ${dir}; write a manifest.yaml there instead (spec §1)`]);
  }
  const { manifest, refusals } = parseManifest(text, types, shops);
  if (!manifest) throw new ManifestRefused(refusals);
  return manifest;
}

/** Reads and validates the manifest among a shop's files against the town's `types` and `shops`, throwing ManifestRefused when it is not v0; `where` names the shop in the refusal. */
export function manifestOf(files: ReadonlyMap<string, { content: string }>, where: string, types?: readonly (string | TownType)[], shops?: readonly TownShop[]): Manifest {
  const text = files.get("manifest.yaml")?.content;
  if (text === undefined) throw new ManifestRefused([`manifest.yaml: is not in ${where}; write a manifest.yaml there instead (spec §1)`]);
  const { manifest, refusals } = parseManifest(text, types, shops);
  if (!manifest) throw new ManifestRefused(refusals);
  return manifest;
}

/** Runs every test in the shop's manifest, the shop a directory or a shelf of its files staged; one result per test, in order. */
export async function testShop(shop: string | Shelf, opts: TestShopOptions): Promise<TestResult[]> {
  if (opts.agent && opts.agent.deps.wall !== opts.wall) throw new Error("a shop's tests were given one wall and its gate another");
  if (opts.audit && (opts.agent || !opts.store)) throw new Error("a shop's tests are recorded for the operator's tree in a store alone");
  const dir = typeof shop === "string" ? shopAt(shop) : shop;
  const manifest = typeof shop === "string" ? await loadShop(shop, opts.types, opts.shops) : manifestOf(filesOf(shop), "the copy", opts.types, opts.shops);
  const composed = (manifest.depends ?? []).length > 0;
  if (composed && !opts.store && !opts.agent) throw new Error(`${manifest.name}'s tests call its dependencies, and were given no town to call them in`);
  // The agent's tree opens its dependencies' bindings at the gate, from the agent's grants; only the operator's is handed credentials.
  const needs = composed && !opts.agent ? treeOf(manifest, opts.store!).needs : (manifest.credentials ?? []).map((n) => n.type);
  const given = (opts.credentials ?? []).map((c) => c.type);
  if (needs.length !== given.length || !needs.every((t) => given.includes(t))) {
    throw new Error(`${manifest.name}'s tests need credentials of (${needs.join(", ")}) and were given (${given.join(", ")})`);
  }
  const results: TestResult[] = [];
  for (const test of manifest.tests) {
    results.push(await runTest(dir, manifest, test, opts));
  }
  return results;
}

/** The files a shelf of one shop holds, a thing on it that is not a plain file thrown as the shelf says. */
function filesOf(shelf: Shelf): Map<string, { content: string }> {
  return shelf.read("") ?? new Map();
}

async function runTest(dir: Shelf, manifest: Manifest, test: ShopTest, opts: TestShopOptions): Promise<TestResult> {
  const scratch = opts.store ? await opts.store.scratch() : await localScratch();
  const stateRoot = scratch.root;
  try {
    const lines = test.run.split("\n").map((l, i) => ({ text: l.trim(), n: i + 1 })).filter((l) => l.text !== "");
    let last: RunResult | null = null;
    for (const [i, line] of lines.entries()) {
      const fail = (why: string): TestResult => ({ name: test.name, ok: false, why: `line ${line.n} \`${line.text}\` ${why}` });
      const agent = opts.agent;
      const split = splitWords(line.text);
      if (!split.ok) return fail(split.error);
      const [command = "", ...words] = split.words;
      const parsed = parseArgs(manifest, command, words);
      if (!parsed.ok) return fail(`is refused: ${parsed.refusals.map((r) => r.message).join("; ")}`);
      const own = (opts.credentials ?? []).filter((c) => (manifest.credentials ?? []).some((n) => n.type === c.type));
      const runOpts: RunOptions = {
        user: agent ? agent.pass.userId : TEST_USER,
        stateRoot,
        stdin: "",
        wall: opts.wall,
        ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
        ...(own.length ? { credentials: own } : {}),
      };
      const lineId = newCallId();
      const started = performance.now();
      if (agent && (manifest.depends ?? []).length) {
        const caller: Caller = { passId: agent.pass.id, stateRoot, manifest, parent: agent.parent, depth: 1 };
        runOpts.town = { answer: answerFor(agent.deps, caller) };
      } else if (opts.store && (manifest.depends ?? []).length) {
        const test: TestTree = { grants: treeOf(manifest, opts.store).grants, user: TEST_USER, stateRoot, credentials: opts.credentials ?? [] };
        const deps: GateDeps = { store: opts.store, wall: opts.wall, runtime: opts.runtime ?? runShelved, ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }), ...(opts.audit ? { decide: opts.audit.decide } : {}) };
        runOpts.town = { answer: answerFor(deps, { test, manifest, parent: opts.audit ? lineId : null, depth: 1 }) };
      }
      runOpts.callId = lineId;
      const result = await (agent?.deps.runtime ?? opts.runtime ?? runShelved)(dir, manifest, command, parsed.values, runOpts);
      if (opts.audit) {
        opts.store!.recordCall({
          callId: lineId,
          parent: opts.audit.parent,
          at: opts.audit.now,
          passId: null,
          grantId: `shop-test:${manifest.name}`,
          shop: manifest.name,
          command,
          argvHash: argvHash(canonicalArgv(manifest, command, parsed.values)),
          result: result.timedOut ? "timeout" : result.exit === 0 ? "ok" : "shop-error",
          exit: result.exit === 0 ? 0 : 1,
          shopExit: result.exit,
          latencyMs: performance.now() - started,
          notices: [],
          stderr: result.stderr,
          detail: `test ${test.name}`,
          credentials: result.credentials,
          wall: result.wall,
        });
      }
      if (result.timedOut) return fail("ran out of time");
      if (i < lines.length - 1 && result.exit !== 0) return fail(`exited ${result.exit}${said(result)}`);
      last = result;
    }
    if (!last) return { name: test.name, ok: false, why: "run has no lines" };
    const why = judge(test, last);
    return why ? { name: test.name, ok: false, why } : { name: test.name, ok: true };
  } finally {
    await scratch.remove();
  }
}

/** A scratch state root in the temporary directory, for a shop test with no store at hand. */
async function localScratch(): Promise<{ root: string; remove(): Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "town-shop-test-"));
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

function judge(test: ShopTest, r: RunResult): string | null {
  const e = test.expect;
  const denied = r.denied === null ? "" : `: ${r.denied}`;
  if ("contains" in e) {
    return r.stdout.includes(e.contains) ? null : `expected stdout to contain ${JSON.stringify(e.contains)}, got ${JSON.stringify(r.stdout)}${denied}`;
  }
  if ("equals" in e) {
    const got = r.stdout.endsWith("\n") ? r.stdout.slice(0, -1) : r.stdout;
    return got === e.equals ? null : `expected stdout to equal ${JSON.stringify(e.equals)}, got ${JSON.stringify(got)}${denied}`;
  }
  return r.exit === e.exit ? null : `expected exit ${e.exit}, got ${r.exit}${said(r)}`;
}

/** What a failed line said: the denial of a call it made, or its stderr's last line; empty when neither. */
function said(r: RunResult): string {
  const line = r.denied ?? r.stderr.trim().split("\n").pop();
  return line ? `: ${line}` : "";
}
