// A shop's own tests, run through the runtime: each test's lines parsed
// against the manifest and run in order against one scratch state made
// for that test (spec §6). A shop with needs has its tests run through
// tellers on the credentials it is given, against the types' origins. A
// shop with dependencies has its tests run with the tree: its calls pass
// the gate with a grant at every shop in the tree of exactly the commands
// declared of it, over the dependencies' code in the town, against the
// test's scratch state, and nothing is written to the town's store.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs, splitWords } from "./args.js";
import { answerFor, type TestTree } from "./gate.js";
import { parseManifest, type Manifest, type ShopTest, type TownShop } from "./manifest.js";
import { run, type RunCredential, type RunOptions, type RunResult } from "./runtime.js";
import type { Grant, Store } from "./store.js";

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
  /** The limit each line runs under; the runtime's thirty seconds when omitted. */
  timeoutMs?: number;
  /** The credential types the town holds; omitted when no store is at hand, and then a need is refused. */
  types?: readonly string[];
  /** The shops the town holds; omitted when no store is at hand, and then a dependency is refused. */
  shops?: readonly TownShop[];
  /** The town whose shops a shop with dependencies calls; read, never written. */
  store?: Store;
  /** One per need of the tree, the shop's and its dependencies', each opened as a teller for the call that needs it. */
  credentials?: RunCredential[];
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
export async function loadShop(dir: string, types?: readonly string[], shops?: readonly TownShop[]): Promise<Manifest> {
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

/** Runs every test in the shop's manifest; one result per test, in order. */
export async function testShop(dir: string, opts: TestShopOptions = {}): Promise<TestResult[]> {
  const manifest = await loadShop(dir, opts.types, opts.shops);
  const composed = (manifest.depends ?? []).length > 0;
  if (composed && !opts.store) throw new Error(`${manifest.name}'s tests call its dependencies, and were given no town to call them in`);
  const needs = composed ? treeOf(manifest, opts.store!).needs : (manifest.credentials ?? []).map((n) => n.type);
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

async function runTest(dir: string, manifest: Manifest, test: ShopTest, opts: TestShopOptions): Promise<TestResult> {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "town-shop-test-"));
  try {
    const lines = test.run.split("\n").map((l, i) => ({ text: l.trim(), n: i + 1 })).filter((l) => l.text !== "");
    let last: RunResult | null = null;
    for (const [i, line] of lines.entries()) {
      const fail = (why: string): TestResult => ({ name: test.name, ok: false, why: `line ${line.n} \`${line.text}\` ${why}` });
      const split = splitWords(line.text);
      if (!split.ok) return fail(split.error);
      const [command = "", ...words] = split.words;
      const parsed = parseArgs(manifest, command, words);
      if (!parsed.ok) return fail(`is refused: ${parsed.refusals.map((r) => r.message).join("; ")}`);
      const own = (opts.credentials ?? []).filter((c) => (manifest.credentials ?? []).some((n) => n.type === c.type));
      const runOpts: RunOptions = {
        user: TEST_USER,
        stateRoot,
        stdin: "",
        ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
        ...(own.length ? { credentials: own } : {}),
      };
      if (opts.store && (manifest.depends ?? []).length) {
        const test: TestTree = { grants: treeOf(manifest, opts.store).grants, user: TEST_USER, stateRoot, credentials: opts.credentials ?? [] };
        const deps = { store: opts.store, ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }) };
        runOpts.town = { answer: answerFor(deps, { test, manifest, parent: null, depth: 1 }) };
      }
      const result = await run(dir, manifest, command, parsed.values, runOpts);
      if (result.timedOut) return fail("ran out of time");
      if (i < lines.length - 1 && result.exit !== 0) return fail(`exited ${result.exit}${lastLine(result.stderr)}`);
      last = result;
    }
    if (!last) return { name: test.name, ok: false, why: "run has no lines" };
    const why = judge(test, last);
    return why ? { name: test.name, ok: false, why } : { name: test.name, ok: true };
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
}

function judge(test: ShopTest, r: RunResult): string | null {
  const e = test.expect;
  if ("contains" in e) {
    return r.stdout.includes(e.contains) ? null : `expected stdout to contain ${JSON.stringify(e.contains)}, got ${JSON.stringify(r.stdout)}`;
  }
  if ("equals" in e) {
    const got = r.stdout.endsWith("\n") ? r.stdout.slice(0, -1) : r.stdout;
    return got === e.equals ? null : `expected stdout to equal ${JSON.stringify(e.equals)}, got ${JSON.stringify(got)}`;
  }
  return r.exit === e.exit ? null : `expected exit ${e.exit}, got ${r.exit}${lastLine(r.stderr)}`;
}

function lastLine(stderr: string): string {
  const line = stderr.trim().split("\n").pop();
  return line ? `: ${line}` : "";
}
