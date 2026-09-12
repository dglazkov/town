// The runtime: runs a shop's entry as a process under the contract in
// spec §7. Canonical argv, exactly three environment names, a state
// directory private to the shop and the user, stdin as sent, and a time
// limit after which the entry and everything it started are killed.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { canonicalArgv, type ArgValues } from "./args.js";
import type { Manifest } from "./manifest.js";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const STDIN_LIMIT_BYTES = 1024 * 1024;

export interface RunOptions {
  /** The calling user's opaque id; becomes TOWN_USER. */
  user: string;
  /** The directory under which every shop's per-user state lives. */
  stateRoot: string;
  /** The call's stdin; empty when omitted. */
  stdin?: string | Buffer | null;
  /** The time limit; thirty seconds when omitted. */
  timeoutMs?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exit: number;
  timedOut: boolean;
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

  const state = stateDir(path.resolve(opts.stateRoot), manifest.name, opts.user);
  await mkdir(state, { recursive: true, mode: 0o700 });

  const env: Record<string, string> = {
    TOWN_STATE: state,
    TOWN_USER: opts.user,
    PATH: process.env.PATH ?? "",
  };

  const isNode = /\.m?js$/.test(entry);
  const file = isNode ? process.execPath : entry;
  const fileArgs = isNode ? [entry, ...argv] : argv;
  const limit = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<RunResult>((resolve) => {
    const child = spawn(file, fileArgs, {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true, // its own process group, so a kill reaches what it started
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
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

    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.stdin.on("error", () => {
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
      let stderr = Buffer.concat(err).toString("utf8");
      let exit = exitCode ?? code ?? 1; // killed by a signal: no code
      if (spawnError) {
        stderr += `town: could not start ${manifest.entry}: ${(spawnError as Error).message}\n`;
        exit = 1;
      }
      if (timedOut) exit = 1;
      resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr, exit, timedOut });
    });

    child.stdin.end(stdin);
  });
}
