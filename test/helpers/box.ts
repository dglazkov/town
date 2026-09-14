// ring: box
// What the box ring's files share, in workerd: a shop's files and manifest
// read from the checkout at build time with Vite's `?raw`, since the
// isolate is handed files and not a directory; a window made for a call as
// the object will make one, through the Worker's own `exports`; a shop's
// own tests run through runIsolate as spec §6 runs them, each test's lines
// in order against one scratch state made for it; a loader that records
// what each isolate was given and passes it on unchanged; and the fake
// origin's record. And the door as a test reaches it: the wire's verbs
// posted with the operator's token, an agent's call posted with a pass's,
// a shop's files as the ustar tar the wire and the hall read, and the
// object's store read inside the object.

import { SELF, env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { parseArgs, splitWords } from "../../src/args.js";
import type { BundleFile } from "../../src/bundle.js";
import type { Town, WindowProps } from "../../src/box.js";
import { TOWN_OBJECT } from "../../src/rows.js";
import { runIsolate, windowNeeds, type IsolateCredential, type IsolateOptions, type IsolateResult } from "../../src/isolate.js";
import type { CallRow } from "../../src/audit.js";
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
const RAW = import.meta.glob(["../../shops/*/*", "../fixtures/worker-shop/*", "../fixtures/mainless-shop/*", "../fixtures/prying-worker/*", "../fixtures/teller-shop/*", "../fixtures/echo-shop/*"], { query: "?raw", import: "default", eager: true });

export interface Shop {
  manifest: Manifest;
  files: Map<string, BundleFile>;
}

/** The shop at `dir`, a path from the repository's root such as `shops/memory`, as files and a validated manifest. */
export function shopFiles(dir: string, types: readonly (string | TownType)[] = ["github-token"], shops: readonly Shop[] = []): Shop {
  const prefix = dir.startsWith("shops/") ? `../../${dir}/` : `../${dir.replace(/^test\//, "")}/`;
  const files = new Map<string, BundleFile>();
  for (const [at, content] of Object.entries(RAW)) if (at.startsWith(prefix)) files.set(at.slice(prefix.length), { content, mode: 0o600 });
  const text = files.get("manifest.yaml")?.content;
  if (text === undefined) throw new Error(`${dir} has no manifest.yaml the box ring can see`);
  const { manifest, refusals } = parseManifest(text, types, shops.map((s) => ({ name: s.manifest.name, commands: s.manifest.commands.map((c) => c.name) })));
  if (!manifest) throw new Error(`${dir}'s manifest is refused:\n${refusals.join("\n")}`);
  return { manifest, files };
}

export const LOADER = (env as unknown as { LOADER: WorkerLoader }).LOADER;

/** The box's object, as the door reaches it. */
export function townObject(): DurableObjectStub<Town> {
  return (env as unknown as { TOWN: DurableObjectNamespace<Town> }).TOWN.getByName(TOWN_OBJECT);
}

/** A window for a call, made through the Worker's own exports with the call's props, as the object makes one; its forwards are counted in the object, and `requests` takes the count. */
export function windowFor(callId: string, credentials: readonly RunCredential[]): { needs: IsolateCredential[]; outbound: Fetcher; requests: (nonce: string) => Promise<number> } {
  const needs = windowNeeds(credentials);
  const ns = (env as unknown as { TOWN: DurableObjectNamespace<Town> }).TOWN;
  const town = ns.idFromName(TOWN_OBJECT).toString();
  const run = `run_${callId}_${Math.random().toString(16).slice(2)}`;
  const props: WindowProps = { town, run, callId, needs };
  const outbound = (exports as unknown as { Window(o: { props: WindowProps }): Fetcher }).Window({ props });
  return { needs, outbound, requests: (nonce) => townObject().requestsUnder(run, nonce) };
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
        Object.assign(run, { credentials: w.needs, outbound: w.outbound, requests: w.requests });
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

/** The box's secrets and build as the pool binds them: made for the run by vitest.box.config.ts. */
export const BOX_ENV = env as unknown as { TOWN_OPERATOR: string; TOWN_VAULT_KEY: string; TOWN_BUILD: string };

/** The address the door is reached at in the ring. */
export const DOOR = "https://town.example";

/** A shop's files as `tar --format ustar -cf - -C <dir> .` makes them, as text. */
export function tarOf(files: ReadonlyMap<string, BundleFile>): string {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  const put = (h: Uint8Array, at: number, text: string) => h.set(enc.encode(text), at);
  const octal = (n: number, width: number) => `${n.toString(8).padStart(width - 1, "0")}\0`;
  for (const [path, file] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const content = enc.encode(file.content);
    const h = new Uint8Array(512);
    put(h, 0, `./${path}`);
    put(h, 100, octal(file.mode & 0o777, 8));
    put(h, 108, octal(0, 8));
    put(h, 116, octal(0, 8));
    put(h, 124, octal(content.length, 12));
    put(h, 136, octal(0, 12));
    put(h, 148, "        ");
    put(h, 156, "0");
    put(h, 257, "ustar\0");
    put(h, 263, "00");
    const sum = h.reduce((a, b) => a + b, 0);
    put(h, 148, `${sum.toString(8).padStart(6, "0")}\0 `);
    blocks.push(h, content, new Uint8Array((512 - (content.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const all = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of blocks) (all.set(b, at), (at += b.length));
  return new TextDecoder().decode(all);
}

export interface AdminReply {
  status: number;
  build: string | null;
  stdout: string;
  stderr: string;
  exit: number;
  wait?: string;
}

async function reply(res: Response): Promise<AdminReply> {
  const build = res.headers.get("x-town-build");
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, build, stdout: String(body.stdout ?? ""), stderr: String(body.stderr ?? ""), exit: Number(body.exit ?? -1), ...(typeof body.wait === "string" ? { wait: body.wait } : {}) };
}

/** A verb posted to the door's /admin as the wire posts it, with the operator's token or the one given. */
export async function admin(argv: string[], stdin: string | null = null, token: string | null = BOX_ENV.TOWN_OPERATOR): Promise<AdminReply> {
  return reply(await SELF.fetch(`${DOOR}/admin`, { method: "POST", headers: token === null ? {} : { authorization: `Bearer ${token}` }, body: JSON.stringify({ argv, stdin }) }));
}

/** The wire's wait on a consent, as the pipe asks it. */
export async function waitConsent(state: string, token: string | null = BOX_ENV.TOWN_OPERATOR): Promise<AdminReply> {
  return reply(await SELF.fetch(`${DOOR}/admin/consent/${encodeURIComponent(state)}`, { headers: token === null ? {} : { authorization: `Bearer ${token}` } }));
}

/** An agent's call posted to the door's /call as `town` posts it. */
export async function call(token: string | null, argv: string[], stdin: string | null = null): Promise<AdminReply> {
  return reply(await SELF.fetch(`${DOOR}/call`, { method: "POST", headers: token === null ? {} : { authorization: `Bearer ${token}` }, body: JSON.stringify({ argv, stdin, json: false }) }));
}

/** A fresh user name, a namespace, so the ring's tests share the box's one object without meeting. */
export const userName = () => `u${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

/** A user, a pass for it, and the grant file `pass new` printed: its token and its pass's id. */
export async function passFor(user: string, label = "research assistant"): Promise<{ token: string; passId: string; town: string }> {
  expect0(await admin(["user", "add", user]));
  const made = expect0(await admin(["pass", "new", "--user", user, "--label", label]));
  const grant = JSON.parse(made.stdout) as { town: string; token: string };
  return { token: grant.token, passId: made.stderr.trim(), town: grant.town };
}

/** A reply whose exit is 0, or a throw naming what it printed. */
export function expect0(r: AdminReply): AdminReply {
  if (r.exit !== 0) throw new Error(`exit ${r.exit}: ${r.stdout}${r.stderr}`);
  return r;
}

/** Reads the box's object's store, inside the object. */
export function inTown<T>(fn: (town: Town) => T | Promise<T>): Promise<T> {
  return runInDurableObject(townObject(), (town) => fn(town));
}

/** The audit rows of a pass, newest last, read from the object. */
export function rowsOf(passId: string): Promise<CallRow[]> {
  return inTown((town) => town.store.calls({ passId }));
}
