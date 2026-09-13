// The runtime: runs a shop's entry as a process under the contract in
// spec §7. Canonical argv, exactly three environment names plus one per
// credential, a state directory private to the shop and the user, stdin
// as sent, and a time limit after which the entry and everything it
// started are killed. A credential reaches the process as a teller's URL,
// opened before the process exists and closed after it is gone; the
// token stays in this process's memory. A shop with dependencies gets a
// clerk and a call directory for the call, `town` first on its PATH and
// the grant file at TOWN_GRANT, both gone when the process is. The
// process runs within the wall it is given, around an enclosure built
// once the windows are open: the shop's directory, Node's, the town's
// install, and the call's directory to read, the state to write, and the
// windows' ports to reach.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalArgv, type ArgValues } from "./args.js";
import { openClerk, type Answer, type Clerk } from "./clerk.js";
import type { Manifest } from "./manifest.js";
import { openTeller, type Teller } from "./teller.js";
import type { Enclosure, Wall, WallKind } from "./wall.js";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const STDIN_LIMIT_BYTES = 1024 * 1024;

/** The agent's binary, as the town's own Node runs it: what `town` in a call directory execs. */
export const TOWN_BIN = fileURLToPath(new URL("../bin/town.js", import.meta.url));

export interface RunOptions {
  /** The calling user's opaque id; becomes TOWN_USER. */
  user: string;
  /** The directory under which every shop's per-user state lives. */
  stateRoot: string;
  /** The call's stdin; empty when omitted. */
  stdin?: string | Buffer | null;
  /** The time limit; thirty seconds when omitted. */
  timeoutMs?: number;
  /** One per need the call meets: a teller is opened for each. */
  credentials?: RunCredential[];
  /** The town's answer to the shop's own calls; required when the manifest has dependencies, and unused when it has none. */
  town?: { answer: Answer };
  /** On abort, the process group is killed as at the limit, and the result says aborted. */
  signal?: AbortSignal;
  /** What encloses the process; required, so nothing runs unwalled because a caller forgot. */
  wall: Wall;
}

export interface RunCredential {
  type: string;
  origin: string;
  header: string;
  token: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exit: number;
  timedOut: boolean;
  /** Whether `signal` ended the call. */
  aborted: boolean;
  /** Per credential, how many requests its teller forwarded; empty when there were none. */
  credentials: Array<{ type: string; requests: number }>;
  /** How many calls the shop's clerk answered; 0 with no dependencies. */
  calls: number;
  /** The first denial among those calls, or null. */
  denied: string | null;
  /** The kind of wall the process ran within, or would have. */
  wall: WallKind;
}

/** The environment name a credential type's teller URL is handed in: `TOWN_CREDENTIAL_<TYPE>`, "-" as "_". */
export function credentialEnvName(type: string): string {
  return `TOWN_CREDENTIAL_${type.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * The state directory for one shop and one user. Both names are escaped
 * to a single path segment, so no name reaches outside `stateRoot` and
 * no two (shop, user) pairs share a directory.
 */
export function stateDir(stateRoot: string, shop: string, user: string): string {
  return path.join(stateRoot, segment(shop), segment(user));
}

/** One path segment for a name: letters, digits, "_" and "-" kept, every other byte %XX. */
export function segment(name: string): string {
  // Letters, digits, "_" and "-" stay; every other byte, "." and "%"
  // included, becomes %XX. The result is never "", "." or "..".
  const escaped = [...Buffer.from(name, "utf8")]
    .map((b) => {
      const c = String.fromCharCode(b);
      return /[A-Za-z0-9_-]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
  return escaped === "" ? "%" : escaped;
}

/** Runs `command` of the shop at `shopDir` with `args`, under the contract. */
export async function run(
  shopDir: string,
  manifest: Manifest,
  command: string,
  args: ArgValues,
  opts: RunOptions,
): Promise<RunResult> {
  const argv = canonicalArgv(manifest, command, args);
  const stdin = opts.stdin == null ? Buffer.alloc(0) : Buffer.from(opts.stdin);
  if (stdin.length > STDIN_LIMIT_BYTES) {
    throw new RangeError(`stdin is ${stdin.length} bytes, over the one megabyte limit`);
  }

  const root = path.resolve(shopDir);
  const entry = path.resolve(root, manifest.entry);
  if (!entry.startsWith(root + path.sep)) throw new Error(`entry ${manifest.entry} is outside the shop`);

  const credentials = opts.credentials ?? [];
  const names = credentials.map((c) => credentialEnvName(c.type));
  if (new Set(names).size !== names.length) throw new Error("run was given two credentials of one type");

  if (!opts.wall) throw new Error(`run was given no wall for ${manifest.name}; name one, openWall("none") included`);
  const wall = opts.wall;

  const composed = (manifest.depends ?? []).length > 0;
  if (composed && !opts.town) throw new Error(`${manifest.name} has dependencies and run was given no town to answer its calls`);

  const state = stateDir(path.resolve(opts.stateRoot), manifest.name, opts.user);
  await mkdir(state, { recursive: true, mode: 0o700 });

  const env: Record<string, string> = {
    TOWN_STATE: state,
    TOWN_USER: opts.user,
    PATH: process.env.PATH ?? "",
  };

  // Every check that can refuse the call is above: from here on a
  // teller, a clerk, or a call directory is open, and every path below
  // closes and removes them.
  const tellers: Teller[] = [];
  let clerk: Clerk | null = null;
  let callDir: string | null = null;
  const finish = async () => {
    const counts = credentials.map((c, i) => ({ type: c.type, requests: tellers[i]?.requests ?? 0 }));
    await Promise.all([...tellers.map((t) => t.close()), clerk?.close()]);
    if (callDir) await rm(callDir, { recursive: true, force: true });
    return { credentials: counts, calls: clerk?.calls ?? 0, denied: clerk?.denied ?? null, wall: wall.kind };
  };
  if (opts.signal?.aborted) {
    return { stdout: "", stderr: "", exit: 1, timedOut: false, aborted: true, ...(await finish()) };
  }
  try {
    for (const c of credentials) tellers.push(await openTeller({ origin: c.origin, header: c.header, token: c.token }));
    if (composed) {
      clerk = await openClerk({ answer: opts.town!.answer });
      callDir = await mkdtemp(path.join(os.tmpdir(), "town-call-"));
      await mkdir(path.join(callDir, "bin"), { mode: 0o700 });
      await writeFile(path.join(callDir, "grant"), `${JSON.stringify({ town: clerk.url, token: clerk.token })}\n`, { mode: 0o600 });
      await writeFile(path.join(callDir, "bin", "town"), `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(TOWN_BIN)} "$@"\n`, { mode: 0o700 });
    }
  } catch (err) {
    await finish();
    throw err;
  }
  credentials.forEach((c, i) => (env[names[i]!] = tellers[i]!.url));
  if (callDir) {
    env.TOWN_GRANT = path.join(callDir, "grant");
    env.PATH = [path.join(callDir, "bin"), process.env.PATH].filter(Boolean).join(path.delimiter);
  }

  const isNode = /\.m?js$/.test(entry);
  const limit = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const within: Enclosure = {
    reads: [root, path.dirname(path.dirname(process.execPath)), path.dirname(path.dirname(TOWN_BIN)), ...(callDir ? [callDir] : [])],
    writes: [state],
    ports: [...tellers.map((t) => t.url), ...(clerk ? [clerk.url] : [])].map((u) => Number(new URL(u).port)),
  };
  let file: string;
  let fileArgs: string[];
  try {
    ({ file, args: fileArgs } = wall.enclose(isNode ? process.execPath : entry, isNode ? [entry, ...argv] : argv, within));
  } catch (err) {
    await finish();
    throw err;
  }

  return new Promise<RunResult>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(file, fileArgs, {
        cwd: root,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true, // its own process group, so a kill reaches what it started
      });
    } catch (e) {
      void finish().then((done) =>
        resolve({ stdout: "", stderr: `town: could not start ${manifest.entry}: ${(e as Error).message}\n`, exit: 1, timedOut: false, aborted: false, ...done }),
      );
      return;
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    let aborted = false;
    let spawnError: Error | null = null;
    let exitCode: number | null = null;

    const killGroup = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // the group is already gone
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, limit);
    const onAbort = () => {
      aborted = true;
      killGroup();
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    if (opts.signal?.aborted) onAbort();

    child.stdout!.on("data", (b: Buffer) => out.push(b));
    child.stderr!.on("data", (b: Buffer) => err.push(b));
    child.stdin!.on("error", () => {
      // an entry that exits without reading its stdin; not the call's failure
    });
    child.on("error", (e) => {
      spawnError = e;
    });
    child.on("exit", (code) => {
      exitCode = code;
      // Nothing a call started outlives it; this also lets the pipes close.
      killGroup();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      let stderr = Buffer.concat(err).toString("utf8");
      let exit = exitCode ?? code ?? 1; // killed by a signal: no code
      if (spawnError) {
        stderr += `town: could not start ${manifest.entry}: ${(spawnError as Error).message}\n`;
        exit = 1;
      }
      if (timedOut || aborted) exit = 1;
      void finish().then((done) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr, exit, timedOut, aborted, ...done }));
    });

    child.stdin!.end(stdin);
  });
}

/** A word the shell reads as itself: single-quoted, each ' as '\''. */
function shellQuote(word: string): string {
  return `'${word.replace(/'/g, "'\\''")}'`;
}
