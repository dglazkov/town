// ring: checkout
// The runtime contract (spec §7): canonical argv, exactly three
// environment names plus one per credential, private state, stdin, and
// the time limit. A credential reaches the entry as a teller's URL and
// never as its value, and the teller is closed when the process is gone.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as realDelay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadShop } from "../src/shoptest.js";
import type { Manifest } from "../src/manifest.js";
import { DEFAULT_TIMEOUT_MS, STDIN_LIMIT_BYTES, credentialEnvName, run, stateDir, type RunCredential } from "../src/runtime.js";
import { fakeOrigin, type FakeOrigin } from "./helpers/origin.js";

const ECHO = path.resolve(import.meta.dirname, "fixtures/echo-shop");
const SH = path.resolve(import.meta.dirname, "fixtures/sh-shop");
const TELLER = path.resolve(import.meta.dirname, "fixtures/teller-shop");

interface Echo {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  stdin: string;
}

let manifest: Manifest;
let stateRoot: string;

beforeAll(async () => {
  manifest = await loadShop(ECHO);
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "town-runtime-test-"));
});

afterAll(async () => {
  await rm(stateRoot, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TOWN_CANARY;
});

async function echo(args: Record<string, string | number | boolean>, opts: { user?: string; stdin?: string | Buffer; m?: Manifest } = {}) {
  const r = await run(ECHO, opts.m ?? manifest, "echo", args, {
    user: opts.user ?? "u1",
    stateRoot,
    ...(opts.stdin === undefined ? {} : { stdin: opts.stdin }),
  });
  expect(r.exit, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as Echo;
}

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await realDelay(20);
  }
  return false;
}

async function waitForFile(file: string): Promise<string> {
  for (let i = 0; i < 250; i++) {
    const text = await readFile(file, "utf8").catch(() => "");
    if (text.trim()) return text.trim();
    await realDelay(20);
  }
  throw new Error(`${file} never appeared`);
}

describe("argv", () => {
  it("is the command, then --name value in manifest order, defaults filled", async () => {
    const out = await echo({ note: "n", zeta: "z" });
    expect(out.argv).toEqual(["echo", "--zeta", "z", "--alpha", "7", "--mode", "slow", "--loud", "false", "--note", "n"]);
  });

  it("renders given values in canonical form", async () => {
    const out = await echo({ loud: true, mode: "fast", alpha: -3, zeta: "--looks like a flag" });
    expect(out.argv).toEqual(["echo", "--zeta", "--looks like a flag", "--alpha", "-3", "--mode", "fast", "--loud", "true"]);
  });

  it("leaves out an omitted argument with no default", async () => {
    expect((await echo({ zeta: "z" })).argv).not.toContain("--note");
  });

  it("refuses values that are not canonical before a process exists", async () => {
    const opts = { user: "u1", stateRoot };
    await expect(run(ECHO, manifest, "echo", {}, opts)).rejects.toThrow(/--zeta is required/);
    await expect(run(ECHO, manifest, "echo", { zeta: "z", stray: "x" }, opts)).rejects.toThrow(/not an argument/);
    await expect(run(ECHO, manifest, "echo", { zeta: "z", mode: "medium" }, opts)).rejects.toThrow(/wrong type/);
    await expect(run(ECHO, manifest, "nope", {}, opts)).rejects.toThrow(/not a command/);
  });

  it("runs from the shop's directory", async () => {
    expect(await realPath((await echo({ zeta: "z" })).cwd)).toBe(await realPath(ECHO));
  });

  it("executes a non-JavaScript entry directly", async () => {
    const m = await loadShop(SH);
    const r = await run(SH, m, "args", { word: "two words" }, { user: "u1", stateRoot });
    expect(r).toMatchObject({ exit: 0, timedOut: false, stdout: "args\n--word\ntwo words\n" });
  });
});

describe("environment", () => {
  // What a Node process puts in its own environment when started with
  // none at all: on macOS, CoreFoundation sets __CF_USER_TEXT_ENCODING at
  // startup; on Linux, nothing. Measured here, not listed, so the
  // assertion below is about what the runtime hands over.
  const selfAdded = (): string[] => {
    const r = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {} });
    return JSON.parse(r.stdout.toString("utf8")) as string[];
  };

  it("is exactly TOWN_STATE, TOWN_USER, and the town's PATH", async () => {
    process.env.TOWN_CANARY = "the town's own environment";
    const added = selfAdded();
    expect(added).not.toContain("TOWN_CANARY");
    const out = await echo({ zeta: "z" }, { user: "opaque-7" });
    expect(Object.keys(out.env).filter((k) => !added.includes(k)).sort()).toEqual(["PATH", "TOWN_STATE", "TOWN_USER"]);
    expect(out.env).not.toHaveProperty("TOWN_CANARY");
    expect(out.env.PATH).toBe(process.env.PATH);
    expect(out.env.TOWN_USER).toBe("opaque-7");
    expect(out.env.TOWN_STATE).toBe(stateDir(stateRoot, manifest.name, "opaque-7"));
    expect((await stat(out.env.TOWN_STATE!)).isDirectory()).toBe(true);
  });
});

describe("TOWN_STATE", () => {
  it("is private to the user: two users of one shop get two directories", async () => {
    const a = (await echo({ zeta: "z" }, { user: "alice" })).env.TOWN_STATE;
    const b = (await echo({ zeta: "z" }, { user: "bob" })).env.TOWN_STATE;
    expect(a).not.toBe(b);
    expect((await stat(a!)).isDirectory() && (await stat(b!)).isDirectory()).toBe(true);
  });

  it("is private to the shop: two shops for one user get two directories", async () => {
    const other: Manifest = { ...manifest, name: "test/other" };
    const a = (await echo({ zeta: "z" }, { user: "alice" })).env.TOWN_STATE;
    const b = (await echo({ zeta: "z" }, { user: "alice", m: other })).env.TOWN_STATE;
    expect(a).not.toBe(b);
  });

  it("is the same directory on the next call for the same shop and user", async () => {
    const a = (await echo({ zeta: "z" }, { user: "carol" })).env.TOWN_STATE;
    expect((await echo({ zeta: "z" }, { user: "carol" })).env.TOWN_STATE).toBe(a);
  });

  it("stays under the state root whatever the names are, and does not collide", async () => {
    const names = ["..", ".", "", "a/b", "a%2Fb", "a/../../b", "ü"];
    const dirs = names.map((u) => stateDir(stateRoot, "town/memory", u));
    for (const d of dirs) expect(path.relative(stateRoot, d).split(path.sep)).toHaveLength(2);
    for (const d of dirs) expect(path.relative(stateRoot, d)).not.toMatch(/(^|[/\\])\.\.?($|[/\\])/);
    expect(new Set(dirs).size).toBe(names.length);
    expect(stateDir(stateRoot, "a/b", "c")).not.toBe(stateDir(stateRoot, "a", "b/c"));
  });
});

describe("stdin", () => {
  it("is the call's stdin", async () => {
    expect((await echo({ zeta: "z" }, { stdin: "line one\nline two\n" })).stdin).toBe("line one\nline two\n");
  });

  it("is empty when the call has none", async () => {
    expect((await echo({ zeta: "z" })).stdin).toBe("");
  });

  it("passes one megabyte and refuses one byte more before a process exists", async () => {
    const mb = Buffer.alloc(STDIN_LIMIT_BYTES, "a");
    expect((await echo({ zeta: "z" }, { stdin: mb })).stdin).toHaveLength(STDIN_LIMIT_BYTES);
    const over = Buffer.alloc(STDIN_LIMIT_BYTES + 1, "a");
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, stdin: over })).rejects.toThrow(RangeError);
  });
});

describe("stdout, stderr, exit", () => {
  it("returns stderr and a nonzero exit as the entry gave them", async () => {
    const r = await run(ECHO, manifest, "fail", {}, { user: "u1", stateRoot });
    expect(r).toEqual({ stdout: "", stderr: "the fixture failed on purpose\n", exit: 3, timedOut: false, credentials: [] });
  });
});

describe("time", () => {
  it("defaults to thirty seconds", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it("kills a sleeping entry and what it started at the limit", async () => {
    const user = "sleeper";
    const started = Date.now();
    const r = await run(ECHO, manifest, "sleep", {}, { user, stateRoot, timeoutMs: 1500 });
    expect(r.timedOut).toBe(true);
    expect(r.exit).toBe(1);
    expect(Date.now() - started).toBeLessThan(10_000);
    const pid = Number(await readFile(path.join(stateDir(stateRoot, manifest.name, user), "grandchild.pid"), "utf8"));
    expect(await gone(pid)).toBe(true);
  });

  it("uses thirty seconds when no limit is given", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const user = "slow-sleeper";
    let settled = false;
    const call = run(ECHO, manifest, "sleep", {}, { user, stateRoot }).then((r) => {
      settled = true;
      return r;
    });
    const pid = Number(await waitForFile(path.join(stateDir(stateRoot, manifest.name, user), "grandchild.pid")));
    vi.advanceTimersByTime(29_999);
    await realDelay(300);
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    const r = await call;
    expect(r.timedOut).toBe(true);
    expect(await gone(pid)).toBe(true);
  });
});

describe("credentials", () => {
  // What the tests hand the runtime: a token that must turn up nowhere the
  // process can see, and a fake origin on loopback standing in for the type's.
  const TOKEN = `tok_${randomBytes(16).toString("hex")}`;
  const URL_SHAPE = /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/;
  let origin: FakeOrigin;
  const cred = (type: string): RunCredential => ({ type, origin: origin.url, header: "Authorization: Bearer {token}", token: TOKEN });

  beforeAll(async () => {
    origin = await fakeOrigin();
  });
  afterAll(async () => {
    await origin.close();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Counts every listener opened from here on, and keeps them to ask whether each is still listening. */
  function countListens(): http.Server[] {
    const servers: http.Server[] = [];
    const listen = http.Server.prototype.listen;
    vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (this: http.Server, ...args: unknown[]) {
      servers.push(this);
      return (listen as (...a: unknown[]) => http.Server).apply(this, args);
    });
    return servers;
  }

  function refused(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, { agent: false }, (res) => {
        res.resume();
        resolve(false);
      });
      req.on("error", (e: NodeJS.ErrnoException) => resolve(e.code === "ECONNREFUSED"));
    });
  }

  it("names the environment TOWN_CREDENTIAL_<TYPE>, upper-cased with - as _", () => {
    expect(credentialEnvName("github-token")).toBe("TOWN_CREDENTIAL_GITHUB_TOKEN");
    expect(credentialEnvName("test-origin")).toBe("TOWN_CREDENTIAL_TEST_ORIGIN");
    expect(credentialEnvName("a1-b-c")).toBe("TOWN_CREDENTIAL_A1_B_C");
  });

  it("makes the environment exactly the three names plus one per need, each a teller's URL, the token in no name and no value", async () => {
    const added = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {} });
    const selfAdded = JSON.parse(added.stdout.toString("utf8")) as string[];
    const r = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, stdin: "the call's stdin", credentials: [cred("github-token"), cred("test-origin")] });
    expect(r.exit, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as Echo;
    expect(Object.keys(out.env).filter((k) => !selfAdded.includes(k)).sort()).toEqual([
      "PATH",
      "TOWN_CREDENTIAL_GITHUB_TOKEN",
      "TOWN_CREDENTIAL_TEST_ORIGIN",
      "TOWN_STATE",
      "TOWN_USER",
    ]);
    expect(out.env.TOWN_CREDENTIAL_GITHUB_TOKEN).toMatch(URL_SHAPE);
    expect(out.env.TOWN_CREDENTIAL_TEST_ORIGIN).toMatch(URL_SHAPE);
    expect(out.env.TOWN_CREDENTIAL_GITHUB_TOKEN).not.toBe(out.env.TOWN_CREDENTIAL_TEST_ORIGIN);
    for (const [name, value] of Object.entries(out.env)) {
      expect(name).not.toContain(TOKEN);
      expect(value, name).not.toContain(TOKEN);
    }
    expect(r.stdout).not.toContain(TOKEN);
    expect(r.stderr).not.toContain(TOKEN);
    expect(out.argv.join(" ")).not.toContain(TOKEN);
    expect(r.credentials).toEqual([
      { type: "github-token", requests: 0 },
      { type: "test-origin", requests: 0 },
    ]);
  });

  it("closes the teller after the process exits: its URL refuses at the socket", async () => {
    const r = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, credentials: [cred("test-origin")] });
    const url = (JSON.parse(r.stdout) as Echo).env.TOWN_CREDENTIAL_TEST_ORIGIN!;
    expect(url).toMatch(URL_SHAPE);
    expect(await refused(`${url}/after`)).toBe(true);
  });

  it("closes the teller after the limit", async () => {
    const user = "teller-sleeper";
    const r = await run(ECHO, manifest, "sleep", {}, { user, stateRoot, timeoutMs: 1500, credentials: [cred("test-origin")] });
    expect(r.timedOut).toBe(true);
    const env = JSON.parse(await readFile(path.join(stateDir(stateRoot, manifest.name, user), "env.json"), "utf8")) as Record<string, string>;
    expect(env.TOWN_CREDENTIAL_TEST_ORIGIN).toMatch(URL_SHAPE);
    expect(await refused(`${env.TOWN_CREDENTIAL_TEST_ORIGIN}/after`)).toBe(true);
    expect(r.credentials).toEqual([{ type: "test-origin", requests: 0 }]);
  });

  it("closes the teller when the entry cannot be started", async () => {
    const servers = countListens();
    const missing: Manifest = { ...manifest, entry: "./no-such-entry.sh" };
    const r = await run(ECHO, missing, "fail", {}, { user: "u1", stateRoot, credentials: [cred("test-origin")] });
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/^town: could not start \.\/no-such-entry\.sh/);
    expect(r.stderr).not.toContain(TOKEN);
    expect(servers).toHaveLength(1);
    expect(servers[0]!.listening).toBe(false);
  });

  it("opens no teller for a call refused before a process exists", async () => {
    const servers = countListens();
    const over = Buffer.alloc(STDIN_LIMIT_BYTES + 1, "a");
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, stdin: over, credentials: [cred("test-origin")] })).rejects.toThrow(RangeError);
    await expect(run(ECHO, manifest, "echo", {}, { user: "u1", stateRoot, credentials: [cred("test-origin")] })).rejects.toThrow(/--zeta is required/);
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, credentials: [cred("test-origin"), cred("test-origin")] })).rejects.toThrow(/two credentials of one type/);
    expect(servers).toEqual([]);
  });

  it("carries a request from the teller shop to the origin, signed, and counts it", async () => {
    const teller = await loadShop(TELLER, ["test-origin"]);
    expect(teller.credentials).toEqual([{ type: "test-origin" }]);
    const before = origin.seen.length;
    const r = await run(TELLER, teller, "get", { path: "/hello?from=shop" }, { user: "u1", stateRoot, credentials: [cred("test-origin")] });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toBe("200\nhello from the origin");
    const seen = origin.seen.slice(before);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "GET", url: "/hello?from=shop" });
    expect(seen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(r.credentials).toEqual([{ type: "test-origin", requests: 1 }]);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });
});

async function realPath(p: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(p);
}
