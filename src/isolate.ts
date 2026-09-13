// The isolate: a `runtime: worker` shop's process on the box. A Worker is
// loaded from the loader for the call alone, `load` and never `get`, so
// nothing carries over from one call to the next; its modules are the
// town's entry and the shop's files, code by Node's rule and every other
// file as bytes, all readable under /bundle; its `env` is the contract's
// names as strings and nothing else; its `globalOutbound` is the window
// the caller made for the call, or null for a shop with no need, so its
// `fetch` goes there or throws. The entry, below as source text, lays the
// state down under /tmp/state, sets the process up as spec §7 gives it to
// a process, awaits the shop's `main` once, and hands back what was
// printed, the exit, and the state. The call is raced against its time
// limit and its abort, and the stub disposed whichever wins. A load
// error, which is how a shop that does not parse arrives, is exit 1 with
// the runtime's line. The state is capped: a call that would leave more
// than eight megabytes fails with the cap's line, and the state is handed
// back as it was before the call. The exits, the lines, and the argv are
// src/main.ts's, so both boxes print alike.

import { posix } from "node:path";
import { canonicalArgv, type ArgValues } from "./args.js";
import type { BundleFile } from "./bundle.js";
import { NO_MAIN } from "./main.js";
import type { Manifest } from "./manifest.js";
import { DEFAULT_TIMEOUT_MS, STDIN_LIMIT_BYTES, credentialEnvName, type RunCredential, type RunOptions, type RunResult } from "./runtime.js";

/** The box's compatibility date, wrangler.jsonc's; every isolate is loaded with it. */
export const COMPATIBILITY_DATE = "2026-08-22";

/** The loader's limits for one call: ten seconds of CPU, enforced by the platform and not by local workerd, and a hundred subrequests. */
export const ISOLATE_LIMITS = { cpuMs: 10_000, subRequests: 100 } as const;

/** The most a shop's state may hold after a call, in bytes of its paths and contents. */
export const STATE_CAP_BYTES = 8 * 1024 * 1024;

/** The entry's module name, beside the shop's files at the bundle's root; no shop file may take it. */
export const ENTRY_MODULE = "__town_entry.mjs";

/** Where the entry lays the state down, and what TOWN_STATE names. */
export const ISOLATE_STATE = "/tmp/state";

/** The window's host: `http://window/<nonce>` is a need's URL in the isolate. */
export const WINDOW_HOST = "window";

/** A need as the isolate is given it: the credential, and the nonce its window answers under. */
export interface IsolateCredential extends RunCredential {
  nonce: string;
}

export interface IsolateOptions extends Omit<RunOptions, "stateRoot" | "wall" | "town" | "credentials"> {
  /** The state's rows before the call, by path. */
  state: Map<string, string>;
  /** One per need the call meets, each with the nonce of the window made for it. */
  credentials?: IsolateCredential[];
  /** A window for the call, made by the caller with the call's props; null for a shop with no need and no dependency. */
  outbound: Fetcher | null;
  loader: WorkerLoader;
  /** How many requests the window forwarded under a nonce; required with credentials, since the window keeps the count and not the isolate. */
  requests?: (nonce: string) => number;
}

export interface IsolateResult extends Omit<RunResult, "wall"> {
  /** The state after the call, by path; what the object keeps. As it was before when the call timed out, was aborted, or left more than the cap. */
  state: Map<string, string>;
  /** `isolate` once a Worker was loaded for the call; null when none was, as for a call aborted before one. */
  wall: "isolate" | null;
}

/** The cap's line, on stderr for a call whose state the cap refuses. */
export function stateCapLine(bytes: number): string {
  return `town: the state would be ${bytes} bytes after this call, over the eight megabyte cap; it is kept as it was before the call`;
}

/** Fresh nonces for a call's needs, one each, as the window's props and the isolate's URLs both carry them. */
export function windowNeeds(credentials: readonly RunCredential[]): IsolateCredential[] {
  return credentials.map((c) => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return { ...c, nonce: [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("") };
  });
}

export type LoaderModule = { js: string } | { cjs: string } | { json: unknown } | { data: ArrayBuffer };

const SPECIFIER = /(?:\bimport\s*(?:[^'"()]*?\bfrom\s*)?|\bexport\s+[^'"]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const ESM_SYNTAX = /^\s*(?:import\s*[\w{*'"]|export\s+(?:default|const|let|var|function|class|async|\{|\*))/m;

/** Node's rule for a code file: `.mjs` and `.cjs` by name; otherwise the nearest package.json's `type`, else what the file's own syntax says. */
export function moduleKind(file: string, source: string, files: ReadonlyMap<string, BundleFile>): "js" | "cjs" {
  if (file.endsWith(".mjs")) return "js";
  if (file.endsWith(".cjs")) return "cjs";
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    const pkg = files.get(dir === "." ? "package.json" : `${dir}/package.json`);
    if (pkg !== undefined) {
      try {
        const type = (JSON.parse(pkg.content) as { type?: unknown }).type;
        if (type === "module") return "js";
        if (type === "commonjs") return "cjs";
      } catch {
        // Not JSON; Node would say so, and fall through to the syntax.
      }
      break;
    }
    if (dir === ".") break;
  }
  return ESM_SYNTAX.test(source) ? "js" : "cjs";
}

/** What a relative specifier from `from` names among the shop's files, resolved as Node would: exact, then the extensions, then an index. */
function resolveSpecifier(from: string, specifier: string, files: ReadonlyMap<string, BundleFile>): string | undefined {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (base === ".." || base.startsWith("../")) return undefined;
  return [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`, `${base}/index.js`, `${base}/index.mjs`, `${base}/index.cjs`].find((c) => files.has(c));
}

/**
 * The modules an isolate is loaded with: the entry, and every file of the
 * shop under its own path. The shop's entry and what it reaches by
 * relative specifiers are code, `js` or `cjs` by Node's rule and `json`
 * when they are JSON; every other file is bytes, since the loader
 * compiles every code module at start and a file that is not code would
 * fail every call.
 */
export function moduleTable(entry: string, files: ReadonlyMap<string, BundleFile>): Record<string, LoaderModule> {
  const kinds = new Map<string, "js" | "cjs" | "json">();
  const queue = [entry];
  while (queue.length > 0) {
    const at = queue.shift()!;
    const file = files.get(at);
    if (kinds.has(at) || file === undefined) continue;
    if (at.endsWith(".json")) {
      kinds.set(at, "json");
      continue;
    }
    kinds.set(at, moduleKind(at, file.content, files));
    for (const m of file.content.matchAll(SPECIFIER)) {
      const specifier = m[1]!;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
      const resolved = resolveSpecifier(at, specifier, files);
      if (resolved !== undefined) queue.push(resolved);
    }
  }
  const modules: Record<string, LoaderModule> = { [ENTRY_MODULE]: { js: ENTRY_SOURCE } };
  const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
  for (const [at, file] of files) {
    const kind = kinds.get(at);
    if (kind === "js") modules[at] = { js: file.content };
    else if (kind === "cjs") modules[at] = { cjs: file.content };
    else if (kind === "json") {
      try {
        modules[at] = { json: JSON.parse(file.content) };
      } catch {
        modules[at] = { data: bytes(file.content) };
      }
    } else modules[at] = { data: bytes(file.content) };
  }
  return modules;
}

interface EntryStub {
  run(entry: string, argv: string[], stdin: string, state: Record<string, string>): Promise<{ stdout: string; stderr: string; exit: number; state: Record<string, string> }>;
  [Symbol.dispose]?(): void;
}

/** Runs `command` of the shop whose files are `files` in an isolate loaded for the call; the runtime the gate is given on the box. */
export async function runIsolate(files: ReadonlyMap<string, BundleFile>, manifest: Manifest, command: string, args: ArgValues, opts: IsolateOptions): Promise<IsolateResult> {
  const argv = canonicalArgv(manifest, command, args);
  const stdin = opts.stdin == null ? "" : typeof opts.stdin === "string" ? opts.stdin : new TextDecoder().decode(opts.stdin);
  const stdinBytes = new TextEncoder().encode(stdin).length;
  if (stdinBytes > STDIN_LIMIT_BYTES) throw new RangeError(`stdin is ${stdinBytes} bytes, over the one megabyte limit`);

  const entry = posix.normalize(manifest.entry);
  if (entry === ".." || entry.startsWith("../") || entry.startsWith("/")) throw new Error(`entry ${manifest.entry} is outside the shop`);
  if (files.has(ENTRY_MODULE)) throw new Error(`${manifest.name} has a file named ${ENTRY_MODULE}, which is the town's entry`);
  if ((manifest.depends ?? []).length > 0) throw new Error(`${manifest.name} has dependencies and runIsolate was given no clerk to answer its calls`);

  const credentials = opts.credentials ?? [];
  const names = credentials.map((c) => credentialEnvName(c.type));
  if (new Set(names).size !== names.length) throw new Error("runIsolate was given two credentials of one type");
  if (credentials.length > 0 && (opts.outbound === null || !opts.requests)) throw new Error(`${manifest.name} meets a need and runIsolate was given no window to reach it through`);
  if (credentials.length === 0 && opts.outbound !== null) throw new Error(`${manifest.name} meets no need and runIsolate was given a window`);
  for (const key of opts.state.keys()) {
    const normal = posix.normalize(key);
    if (normal !== key || key === "." || key.startsWith("../") || key.startsWith("/")) throw new Error(`a state row's path ${JSON.stringify(key)} is not a plain relative path`);
  }

  const counts = () => credentials.map((c) => ({ type: c.type, requests: opts.requests!(c.nonce) }));
  const before = new Map(opts.state);
  if (opts.signal?.aborted) {
    return { stdout: "", stderr: "", exit: 1, timedOut: false, aborted: true, credentials: counts(), calls: 0, denied: null, wall: null, state: before };
  }

  const env: Record<string, string> = { TOWN_USER: opts.user };
  credentials.forEach((c, i) => (env[names[i]!] = `http://${WINDOW_HOST}/${c.nonce}`));
  const worker = opts.loader.load({
    compatibilityDate: COMPATIBILITY_DATE,
    mainModule: ENTRY_MODULE,
    modules: moduleTable(entry, files),
    env,
    globalOutbound: opts.outbound,
    limits: { ...ISOLATE_LIMITS },
  });
  const stub = worker.getEntrypoint() as unknown as EntryStub;

  const limit = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const ended = new Promise<"timeout" | "aborted">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), limit);
    onAbort = () => resolve("aborted");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
  const done = (r: Pick<IsolateResult, "stdout" | "stderr" | "exit"> & Partial<IsolateResult>): IsolateResult => ({
    timedOut: false,
    aborted: false,
    calls: 0,
    denied: null,
    state: before,
    wall: "isolate",
    ...r,
    credentials: counts(),
  });
  try {
    const call = stub.run(entry, argv, stdin, Object.fromEntries(opts.state));
    // A rejection after the race is settled is nobody's; keep it from being unhandled.
    call.catch(() => undefined);
    const won = await Promise.race([call, ended]);
    if (won === "timeout") return done({ stdout: "", stderr: "", exit: 1, timedOut: true });
    if (won === "aborted") return done({ stdout: "", stderr: "", exit: 1, aborted: true });
    const after = new Map(Object.entries(won.state));
    const bytes = stateBytes(after);
    if (bytes > STATE_CAP_BYTES) return done({ stdout: won.stdout, stderr: `${won.stderr}${stateCapLine(bytes)}\n`, exit: 1 });
    return done({ stdout: won.stdout, stderr: won.stderr, exit: won.exit, state: after });
  } catch (err) {
    // A load error, which is how a shop that does not parse arrives, and anything else the isolate threw: the runtime's line.
    const message = (err instanceof Error ? err.message : String(err)).replace(/^Failed to start Worker:\s*/, "");
    return done({ stdout: "", stderr: `${message.replace(/\s*[\r\n]+\s*/g, " ").trim()}\n`, exit: 1 });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort !== undefined) opts.signal?.removeEventListener("abort", onAbort);
    try {
      stub[Symbol.dispose]?.();
    } catch {
      // Already gone.
    }
  }
}

/** A state's size: the UTF-8 bytes of every path and every content. */
export function stateBytes(state: ReadonlyMap<string, string>): number {
  const encoder = new TextEncoder();
  let n = 0;
  for (const [key, value] of state) n += encoder.encode(key).length + encoder.encode(value).length;
  return n;
}

/**
 * The entry, as source text: loaded beside the shop's files as the
 * isolate's main module. Its one method, `run`, writes the state under
 * /tmp/state; sets process.env to the isolate's own strings and
 * TOWN_STATE, process.argv to node, the entry's path under /bundle, and
 * the canonical argv, and process.stdin to the call's stdin; captures
 * process.stdout, process.stderr, and console; makes process.exit throw;
 * imports the shop's entry and awaits its `main` once; and returns what
 * was printed, the exit, and every file under /tmp/state. The exit is
 * src/main.ts's: `main`'s return when it is an integer and 0 otherwise, a
 * throw as 1 with its `Name: message` on one line, process.exit as it
 * says, and no `main` as 1 with spec §7's line. It is plain JavaScript in
 * a string, and the box ring is what checks it.
 */
export const ENTRY_SOURCE = String.raw`
import { WorkerEntrypoint } from "cloudflare:workers";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { Readable } from "node:stream";
import { format } from "node:util";

const NO_MAIN = ${JSON.stringify(NO_MAIN)};
const STATE = ${JSON.stringify(ISOLATE_STATE)};

class Exit extends Error {
  constructor(code) {
    super("process.exit(" + code + ")");
    this.name = "Exit";
  }
}

function oneLine(err) {
  const text = err instanceof Error ? err.name + ": " + err.message : String(err);
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

function walk(dir, prefix, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + "/" + e.name;
    if (e.isDirectory()) walk(full, prefix + e.name + "/", out);
    else if (e.isFile()) out[prefix + e.name] = readFileSync(full, "utf8");
  }
  return out;
}

export default class extends WorkerEntrypoint {
  async run(entry, argv, stdin, state) {
    let stdout = "";
    let stderr = "";
    const text = (chunk) => (typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    const sink = (to) => (chunk, encoding, callback) => {
      if (to === "out") stdout += text(chunk);
      else stderr += text(chunk);
      const cb = typeof encoding === "function" ? encoding : callback;
      if (typeof cb === "function") queueMicrotask(cb);
      return true;
    };
    process.stdout.write = sink("out");
    process.stderr.write = sink("err");
    const line = (to) => (...parts) => sink(to)(format(...parts) + "\n");
    console.log = console.info = console.debug = line("out");
    console.warn = console.error = console.trace = line("err");

    mkdirSync(STATE, { recursive: true });
    for (const [rel, content] of Object.entries(state)) {
      const file = STATE + "/" + rel;
      mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
      writeFileSync(file, content);
    }

    for (const name of Object.keys(process.env)) delete process.env[name];
    for (const [name, value] of Object.entries(this.env)) if (typeof value === "string") process.env[name] = value;
    process.env.TOWN_STATE = STATE;
    process.argv = ["node", "/bundle/" + entry, ...argv];
    Object.defineProperty(process, "stdin", { value: Readable.from(stdin === "" ? [] : [Buffer.from(stdin, "utf8")]), configurable: true, writable: true });
    let exited;
    process.exit = (code) => {
      if (exited === undefined) exited = code === undefined ? Number(process.exitCode ?? 0) : Number(code);
      throw new Exit(exited);
    };

    let exit = 0;
    try {
      const mod = await import("./" + entry);
      if (typeof mod.default !== "function") {
        stderr += NO_MAIN + "\n";
        exit = 1;
      } else {
        const code = await mod.default();
        exit = typeof code === "number" && Number.isInteger(code) ? code : 0;
      }
    } catch (err) {
      if (exited === undefined) {
        stderr += oneLine(err) + "\n";
        exit = 1;
      }
    }
    if (exited !== undefined) exit = exited;
    return { stdout, stderr, exit, state: walk(STATE, "", {}) };
  }
}
`;
