// ring: command
// What command tests share: the built binaries, a town started on a free
// port over a data directory the test makes and deletes, and the agent's
// `town` run from a scratch directory with a grant file. Nothing here
// imports src/: the binaries run dist/, and a dist older than src fails
// loudly instead of testing yesterday's build.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const TOWN = path.join(ROOT, "bin/town.js");
export const TOWND = path.join(ROOT, "bin/townd.js");
export const MEMORY = path.join(ROOT, "shops/memory");

/** Throws when any src/*.ts is newer than its dist/*.js, or dist is missing. */
export function assertBuilt(): void {
  const src = path.join(ROOT, "src");
  for (const e of readdirSync(src)) {
    if (!e.endsWith(".ts")) continue;
    const js = path.join(ROOT, "dist", e.replace(/\.ts$/, ".js"));
    let built: number;
    try {
      built = statSync(js).mtimeMs;
    } catch {
      throw new Error(`dist/${path.basename(js)} is missing; run pnpm build (pnpm test builds first)`);
    }
    if (statSync(path.join(src, e)).mtimeMs > built) {
      throw new Error(`dist is older than src/${e}; run pnpm build (pnpm test builds first)`);
    }
  }
}

export interface Ran {
  stdout: string;
  stderr: string;
  exit: number;
}

export function tmp(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `town-${prefix}-`));
}

/** A clean environment: no TOWN_GRANT, no TOWN_DATA, and a HOME of its own so ~/.town/grant is not the tester's. */
export function cleanEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, ...extra };
  delete env.TOWN_GRANT;
  delete env.TOWN_DATA;
  return env;
}

/** `townd` with stdin closed, or with `input` on stdin, as `printf … | townd …` gives a secret. */
export function townd(args: string[], env: NodeJS.ProcessEnv, input?: string): Ran {
  const stdin = input === undefined ? "ignore" : "pipe";
  const r = spawnSync(process.execPath, [TOWND, ...args], { env, encoding: "utf8", stdio: [stdin, "pipe", "pipe"], timeout: 30_000, ...(input === undefined ? {} : { input }) });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

export interface Agent {
  dir: string;
  home: string;
  /** `town` with stdin closed, as a harness with no input runs it. */
  town(...args: string[]): Ran;
  /** `town` with `input` piped through a shell pipe, as `printf … | town …`. */
  townPiped(input: string, ...args: string[]): Ran;
  writeGrant(grantFile: string): void;
}

export function agent(): Agent {
  const dir = tmp("agent");
  const home = tmp("home");
  mkdirSync(path.join(dir, ".town"));
  const env = cleanEnv(home);
  return {
    dir,
    home,
    town: (...args) => {
      const r = spawnSync(process.execPath, [TOWN, ...args], { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
      return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
    },
    townPiped: (input, ...args) => {
      const r = spawnSync("/bin/sh", ["-c", 'printf %s "$TOWN_TEST_INPUT" | "$0" "$@"', process.execPath, TOWN, ...args], {
        cwd: dir,
        env: { ...env, TOWN_TEST_INPUT: input },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      });
      return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
    },
    writeGrant: (grantFile) => writeFileSync(path.join(dir, ".town", "grant"), grantFile),
  };
}

export interface Town {
  url: string;
  dataDir: string;
  env: NodeJS.ProcessEnv;
  admin(...args: string[]): Ran;
  /** `townd admin` with `input` on stdin. */
  adminPiped(input: string, ...args: string[]): Ran;
  stop(): Promise<void>;
}

/** `townd serve --data <dataDir> --port 0`, resolved once it prints its address. */
export async function serve(dataDir: string): Promise<Town> {
  const env = cleanEnv(tmp("operator-home"));
  const child: ChildProcess = spawn(process.execPath, [TOWND, "serve", "--data", dataDir, "--port", "0"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error(`townd serve did not start: ${err}`)), 10_000);
    child.stdout!.on("data", (b: Buffer) => {
      out += b.toString("utf8");
      const m = /town listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]!);
      }
    });
    child.stderr!.on("data", (b: Buffer) => (err += b.toString("utf8")));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`townd serve exited ${code}: ${err}`));
    });
  });
  return {
    url,
    dataDir,
    env,
    admin: (...args) => townd(["admin", "--data", dataDir, ...args], env),
    adminPiped: (input, ...args) => townd(["admin", "--data", dataDir, ...args], env, input),
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

/** A request the fake origin recorded: as test/helpers/origin.ts prints it. */
export interface SeenRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  bodyLength: number;
  bodySha256: string;
}

export interface OriginProcess {
  /** `http://127.0.0.1:<port>` */
  url: string;
  /** Every request it has recorded so far, read from its log file. */
  seen(): SeenRequest[];
  stop(): Promise<void>;
}

/**
 * The fake origin, `node test/helpers/origin.ts`, as a process of its own:
 * a command test's `town` and `townd` run synchronously and would stall an
 * origin in this process. It writes its URL, then one JSON line per request
 * before answering it, to a file, so `seen()` read after a call returns
 * holds that call's requests.
 */
export async function originProcess(): Promise<OriginProcess> {
  const dir = tmp("origin");
  const log = path.join(dir, "seen.jsonl");
  const fd = openSync(log, "w");
  const child = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "test/helpers/origin.ts")], { stdio: ["ignore", fd, "pipe"] });
  closeSync(fd);
  const lines = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
  for (let i = 0; lines().length === 0; i++) {
    if (i > 200 || child.exitCode !== null) throw new Error("the fake origin did not start");
    await new Promise((r) => setTimeout(r, 25));
  }
  return {
    url: lines()[0]!,
    seen: () => lines().slice(1).map((l) => JSON.parse(l) as SeenRequest),
    stop: () =>
      new Promise<void>((resolve) => {
        const done = () => (rmSync(dir, { recursive: true, force: true }), resolve());
        if (child.exitCode !== null) return done();
        child.once("exit", done);
        child.kill("SIGTERM");
      }),
  };
}

/** Removes every path given, ignoring what is already gone. */
export function cleanup(...paths: string[]): void {
  for (const p of paths) rmSync(p, { recursive: true, force: true });
}
