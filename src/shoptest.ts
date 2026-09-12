// A shop's own tests, run through the runtime: each test's lines parsed
// against the manifest and run in order against one scratch state made
// for that test (spec §6). A shop with needs has its tests run through
// tellers on the credentials it is given, against the types' origins.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs, splitWords } from "./args.js";
import { parseManifest, type Manifest, type ShopTest } from "./manifest.js";
import { run, type RunCredential, type RunResult } from "./runtime.js";

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
  /** One per need of the manifest, each opened as a teller for every line. */
  credentials?: RunCredential[];
}

/** The opaque user every shop test runs as. */
export const TEST_USER = "shop-test";

/** Reads and validates `dir/manifest.yaml` against the town's `types`, throwing ManifestRefused when it is not v0. */
export async function loadShop(dir: string, types?: readonly string[]): Promise<Manifest> {
  let text: string;
  try {
    text = await readFile(path.join(dir, "manifest.yaml"), "utf8");
  } catch {
    throw new ManifestRefused([`manifest.yaml: is not in ${dir}; write a manifest.yaml there instead (spec §1)`]);
  }
  const { manifest, refusals } = parseManifest(text, types);
  if (!manifest) throw new ManifestRefused(refusals);
  return manifest;
}

/** Runs every test in the shop's manifest; one result per test, in order. */
export async function testShop(dir: string, opts: TestShopOptions = {}): Promise<TestResult[]> {
  const manifest = await loadShop(dir, opts.types);
  const needs = (manifest.credentials ?? []).map((n) => n.type);
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
      const runOpts = {
        user: TEST_USER,
        stateRoot,
        stdin: "",
        ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
        ...(opts.credentials?.length ? { credentials: opts.credentials } : {}),
      };
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
