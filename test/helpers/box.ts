// ring: box
// What the box ring's files share, in workerd: a shop's files and manifest
// read from the checkout at build time with Vite's `?raw`, since the
// isolate is handed files and not a directory; a window made for a call as
// the object will make one, through the Worker's own `exports`; a shop's
// own tests run through runIsolate as spec §6 runs them, each test's lines
// in order against one scratch state made for it; a loader that records
// what each isolate was given and passes it on unchanged; and the fake
// origin's record.

import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { parseArgs, splitWords } from "../../src/args.js";
import type { BundleFile } from "../../src/bundle.js";
import { requestsUnder, type WindowProps } from "../../src/box.js";
import { runIsolate, windowNeeds, type IsolateCredential, type IsolateOptions, type IsolateResult } from "../../src/isolate.js";
import { parseManifest, type Manifest, type TownType } from "../../src/manifest.js";
import type { RunCredential } from "../../src/runtime.js";
import { CONTROL, type SeenRequest } from "./box-origin.js";

declare global {
  interface ImportMeta {
    glob(pattern: string | string[], options: { query: "?raw"; import: "default"; eager: true }): Record<string, string>;
  }
}

/** The checkout's wrangler.jsonc, as text. */
export const WRANGLER = Object.values(import.meta.glob("../../wrangler.jsonc", { query: "?raw", import: "default", eager: true }))[0]!;

/** Every file of every shop and fixture shop the box ring runs, by path from this file. */
const RAW = import.meta.glob(["../../shops/*/*", "../fixtures/worker-shop/*", "../fixtures/mainless-shop/*", "../fixtures/prying-worker/*"], { query: "?raw", import: "default", eager: true });

export interface Shop {
  manifest: Manifest;
  files: Map<string, BundleFile>;
}

/** The shop at `dir`, a path from the repository's root such as `shops/memory`, as files and a validated manifest. */
export function shopFiles(dir: string, types: readonly (string | TownType)[] = ["github-token"]): Shop {
  const prefix = dir.startsWith("shops/") ? `../../${dir}/` : `../${dir.replace(/^test\//, "")}/`;
  const files = new Map<string, BundleFile>();
  for (const [at, content] of Object.entries(RAW)) if (at.startsWith(prefix)) files.set(at.slice(prefix.length), { content, mode: 0o600 });
  const text = files.get("manifest.yaml")?.content;
  if (text === undefined) throw new Error(`${dir} has no manifest.yaml the box ring can see`);
  const { manifest, refusals } = parseManifest(text, types);
  if (!manifest) throw new Error(`${dir}'s manifest is refused:\n${refusals.join("\n")}`);
  return { manifest, files };
}

export const LOADER = (env as unknown as { LOADER: WorkerLoader }).LOADER;

/** A window for a call, made through the Worker's own exports with the call's props, as the object makes one. */
export function windowFor(callId: string, credentials: readonly RunCredential[]): { needs: IsolateCredential[]; outbound: Fetcher } {
  const needs = windowNeeds(credentials);
  const props: WindowProps = { callId, needs };
  const outbound = (exports as unknown as { Window(o: { props: WindowProps }): Fetcher }).Window({ props });
  return { needs, outbound };
}

/** A loader that passes every load to the pool's own and keeps what each isolate was given. */
export function recordingLoader(): WorkerLoader & { given: WorkerLoaderWorkerCode[] } {
  const given: WorkerLoaderWorkerCode[] = [];
  return {
    given,
    load(code: WorkerLoaderWorkerCode) {
      given.push(code);
      return LOADER.load(code);
    },
    get(name: string | null, getCode: () => WorkerLoaderWorkerCode | Promise<WorkerLoaderWorkerCode>) {
      return LOADER.get(name, getCode);
    },
  } as WorkerLoader & { given: WorkerLoaderWorkerCode[] };
}

/** Every request the fake origin was sent, oldest first. */
export async function originSeen(): Promise<SeenRequest[]> {
  return (await (await fetch(CONTROL)).json()) as SeenRequest[];
}

export interface ShopTestResult {
  name: string;
  ok: boolean;
  why?: string;
}

/** Runs every test in `shop`'s manifest through runIsolate, each against a scratch state of its own, as spec §6 says; with `credentials`, each line through a window made for it. */
export async function testShopInIsolates(shop: Shop, opts: { user?: string; credentials?: RunCredential[] } = {}): Promise<ShopTestResult[]> {
  const results: ShopTestResult[] = [];
  for (const test of shop.manifest.tests) {
    let state = new Map<string, string>();
    let last: IsolateResult | null = null;
    let failed: ShopTestResult | null = null;
    const lines = test.run.split("\n").map((l, i) => ({ text: l.trim(), n: i + 1 })).filter((l) => l.text !== "");
    for (const [i, line] of lines.entries()) {
      const fail = (why: string): ShopTestResult => ({ name: test.name, ok: false, why: `line ${line.n} \`${line.text}\` ${why}` });
      const split = splitWords(line.text);
      if (!split.ok) {
        failed = fail(split.error);
        break;
      }
      const [command = "", ...words] = split.words;
      const parsed = parseArgs(shop.manifest, command, words);
      if (!parsed.ok) {
        failed = fail(`is refused: ${parsed.refusals.map((r) => r.message).join("; ")}`);
        break;
      }
      const run: IsolateOptions = { user: opts.user ?? "shop-test", stdin: "", state, loader: LOADER, outbound: null };
      if (opts.credentials?.length) {
        const w = windowFor(`call_test_${i}`, opts.credentials);
        Object.assign(run, { credentials: w.needs, outbound: w.outbound, requests: requestsUnder });
      }
      const r = await runIsolate(shop.files, shop.manifest, command, parsed.values, run);
      if (r.timedOut) {
        failed = fail("ran out of time");
        break;
      }
      if (i < lines.length - 1 && r.exit !== 0) {
        failed = fail(`exited ${r.exit}: ${r.stderr.trim()}`);
        break;
      }
      state = r.state;
      last = r;
    }
    if (failed) {
      results.push(failed);
      continue;
    }
    const e = test.expect;
    const got = last!.stdout.endsWith("\n") ? last!.stdout.slice(0, -1) : last!.stdout;
    const why =
      "contains" in e
        ? last!.stdout.includes(e.contains) ? null : `expected stdout to contain ${JSON.stringify(e.contains)}, got ${JSON.stringify(last!.stdout)}`
        : "equals" in e
          ? got === e.equals ? null : `expected stdout to equal ${JSON.stringify(e.equals)}, got ${JSON.stringify(got)}`
          : last!.exit === e.exit ? null : `expected exit ${e.exit}, got ${last!.exit}: ${last!.stderr.trim()}`;
    results.push(why ? { name: test.name, ok: false, why } : { name: test.name, ok: true });
  }
  return results;
}
