// ring: checkout
// The runtime contract (spec §7): canonical argv, exactly three
// environment names plus one per credential, private state, stdin, and
// the time limit. A credential reaches the entry as a teller's URL and
// never as its value, and the teller is closed when the process is gone.
// A shop with dependencies gets TOWN_GRANT and `town` first on PATH, from
// a call directory holding those two alone, over a clerk that answers
// with the fake answer the test gives; both are gone after, and an abort
// or the limit ends every call the clerk was answering. The process runs
// within the wall it is given, which is required: the enclosure the
// runtime builds is read from a fake wall's record, and under the box's
// own wall, where it has one, the contract holds as it did without.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as realDelay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadShop } from "../src/shoptest.js";
import type { Manifest } from "../src/manifest.js";
import type { Answer, ClerkCall } from "../src/clerk.js";
import { DEFAULT_TIMEOUT_MS, STDIN_LIMIT_BYTES, TOWN_BIN, credentialEnvName, run, stateDir, type RunCredential } from "../src/runtime.js";
import { openWall, wallOnThisBox } from "../src/wall.js";
import { fakeOrigin, type FakeOrigin } from "./helpers/origin.js";
import { recordingWall } from "./helpers/wall.js";

const ECHO = path.resolve(import.meta.dirname, "fixtures/echo-shop");
const SH = path.resolve(import.meta.dirname, "fixtures/sh-shop");
const TELLER = path.resolve(import.meta.dirname, "fixtures/teller-shop");
const wall = openWall("none");
/** The box's own wall, or null on a box without one; the tests that need it say so and skip. */
const BOX = wallOnThisBox();
const boxWall = BOX ? openWall(BOX) : null;
const needsBox = BOX ? `walled by ${BOX}` : "needs a box with a wall; this box has none, so it skips";
/** Node's own directory and the town's install, as the runtime reads them. */
const NODE_DIR = path.dirname(path.dirname(process.execPath));
const INSTALL = path.resolve(import.meta.dirname, "..");

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
    wall,
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
    const opts = { user: "u1", stateRoot, wall };
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
    const r = await run(SH, m, "args", { word: "two words" }, { user: "u1", stateRoot, wall });
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
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, stdin: over })).rejects.toThrow(RangeError);
  });
});

describe("stdout, stderr, exit", () => {
  it("returns stderr and a nonzero exit as the entry gave them", async () => {
    const r = await run(ECHO, manifest, "fail", {}, { user: "u1", stateRoot, wall });
    expect(r).toEqual({ stdout: "", stderr: "the fixture failed on purpose\n", exit: 3, timedOut: false, aborted: false, credentials: [], calls: 0, denied: null, wall: "none" });
  });
});

describe("time", () => {
  it("defaults to thirty seconds", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it("kills a sleeping entry and what it started at the limit", async () => {
    const user = "sleeper";
    const started = Date.now();
    const r = await run(ECHO, manifest, "sleep", {}, { user, stateRoot, wall, timeoutMs: 1500 });
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
    const call = run(ECHO, manifest, "sleep", {}, { user, stateRoot, wall }).then((r) => {
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
    const r = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, stdin: "the call's stdin", credentials: [cred("github-token"), cred("test-origin")] });
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
    const r = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, credentials: [cred("test-origin")] });
    const url = (JSON.parse(r.stdout) as Echo).env.TOWN_CREDENTIAL_TEST_ORIGIN!;
    expect(url).toMatch(URL_SHAPE);
    expect(await refused(`${url}/after`)).toBe(true);
  });

  it("closes the teller after the limit", async () => {
    const user = "teller-sleeper";
    const r = await run(ECHO, manifest, "sleep", {}, { user, stateRoot, wall, timeoutMs: 1500, credentials: [cred("test-origin")] });
    expect(r.timedOut).toBe(true);
    const env = JSON.parse(await readFile(path.join(stateDir(stateRoot, manifest.name, user), "env.json"), "utf8")) as Record<string, string>;
    expect(env.TOWN_CREDENTIAL_TEST_ORIGIN).toMatch(URL_SHAPE);
    expect(await refused(`${env.TOWN_CREDENTIAL_TEST_ORIGIN}/after`)).toBe(true);
    expect(r.credentials).toEqual([{ type: "test-origin", requests: 0 }]);
  });

  it("closes the teller when the entry cannot be started", async () => {
    const servers = countListens();
    const missing: Manifest = { ...manifest, entry: "./no-such-entry.sh" };
    const r = await run(ECHO, missing, "fail", {}, { user: "u1", stateRoot, wall, credentials: [cred("test-origin")] });
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/^town: could not start \.\/no-such-entry\.sh/);
    expect(r.stderr).not.toContain(TOKEN);
    expect(servers).toHaveLength(1);
    expect(servers[0]!.listening).toBe(false);
  });

  it("opens no teller for a call refused before a process exists", async () => {
    const servers = countListens();
    const over = Buffer.alloc(STDIN_LIMIT_BYTES + 1, "a");
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, stdin: over, credentials: [cred("test-origin")] })).rejects.toThrow(RangeError);
    await expect(run(ECHO, manifest, "echo", {}, { user: "u1", stateRoot, wall, credentials: [cred("test-origin")] })).rejects.toThrow(/--zeta is required/);
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, credentials: [cred("test-origin"), cred("test-origin")] })).rejects.toThrow(/two credentials of one type/);
    expect(servers).toEqual([]);
  });

  it("carries a request from the teller shop to the origin, signed, and counts it", async () => {
    const teller = await loadShop(TELLER, ["test-origin"]);
    expect(teller.credentials).toEqual([{ type: "test-origin" }]);
    const before = origin.seen.length;
    const r = await run(TELLER, teller, "get", { path: "/hello?from=shop" }, { user: "u1", stateRoot, wall, credentials: [cred("test-origin")] });
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

describe("dependencies", () => {
  // A shop written for this test: it reports its environment, the call
  // directory under TOWN_GRANT with each entry's mode, and the grant file,
  // then runs `town` from its PATH (probe), or runs `town` and waits (hang).
  const PROBE_MAIN = `
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const [command] = process.argv.slice(2);
const grant = process.env.TOWN_GRANT;
const walk = (dir, pre = "") => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const rel = pre + e.name;
  const mode = (statSync(path.join(dir, e.name)).mode & 0o777).toString(8);
  return e.isDirectory() ? [[rel + "/", mode], ...walk(path.join(dir, e.name), rel + "/")] : [[rel, mode]];
});
const seen = { env: process.env, dir: grant ? (statSync(path.dirname(grant)).mode & 0o777).toString(8) : null, files: grant ? walk(path.dirname(grant)) : null, grant: grant ? readFileSync(grant, "utf8") : null };
if (command === "hang") process.stdout.write(JSON.stringify(seen) + "\\n");
const child = spawn("town", ["echo", "echo", "--zeta", "from-the-probe"], { stdio: ["ignore", "pipe", "pipe"] });
const out = [], err = [];
child.stdout.on("data", (b) => out.push(b));
child.stderr.on("data", (b) => err.push(b));
child.on("error", (e) => { seen.town = { error: e.code }; process.stdout.write(JSON.stringify(seen)); });
child.on("close", (code) => {
  seen.town = { exit: code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") };
  if (command === "probe") process.stdout.write(JSON.stringify(seen));
});
`;
  const command = (name: string) => ({ name, summary: `The ${name} command.`, effect: "read" as const, output: "json" as const });
  const PROBE: Manifest = {
    name: "test/probe",
    version: "0.0.1",
    summary: "Reports what a composed shop is given.",
    runtime: "subprocess",
    entry: "./main.mjs",
    depends: [{ shop: "test/echo", commands: ["echo"] }],
    commands: [command("probe"), command("hang")],
    tests: [{ name: "t", run: "probe", expect: { exit: 0 } }],
  };
  const TOKEN = `tok_${randomBytes(16).toString("hex")}`;
  const GRANT_URL = /^http:\/\/127\.0\.0\.1:\d+$/;

  interface Probe {
    env: Record<string, string>;
    dir: string | null;
    files: Array<[string, string]> | null;
    grant: string | null;
    town?: { exit?: number; stdout?: string; stderr?: string; error?: string };
  }

  let probeDir: string;
  let origin: FakeOrigin;
  let asked: ClerkCall[];
  const answered: Answer = async (call) => {
    asked.push(call);
    return { stdout: "the town's answer\n", stderr: "", exit: 0, denial: null };
  };

  beforeAll(async () => {
    probeDir = await mkdtemp(path.join(os.tmpdir(), "town-probe-shop-"));
    await writeFile(path.join(probeDir, "main.mjs"), PROBE_MAIN);
    origin = await fakeOrigin();
  });
  afterAll(async () => {
    await rm(probeDir, { recursive: true, force: true });
    await origin.close();
  });
  afterEach(() => {
    asked = [];
  });
  asked = [];

  const selfAdded = (): string[] => {
    const r = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {} });
    return JSON.parse(r.stdout.toString("utf8")) as string[];
  };
  const exists = (p: string) => stat(p).then(() => true, () => false);

  it("makes the environment exactly three names, plus one per need, plus TOWN_GRANT when and only when there are dependencies", async () => {
    const added = selfAdded();
    const names = (env: Record<string, string>) => Object.keys(env).filter((k) => !added.includes(k)).sort();
    const cred: RunCredential = { type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: TOKEN };

    // No dependencies: no TOWN_GRANT, whatever town it is handed.
    const plain = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, town: { answer: answered } });
    expect(names((JSON.parse(plain.stdout) as Echo).env)).toEqual(["PATH", "TOWN_STATE", "TOWN_USER"]);
    expect((JSON.parse(plain.stdout) as Echo).env.PATH).toBe(process.env.PATH);
    const plainNeed = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, credentials: [cred], town: { answer: answered } });
    expect(names((JSON.parse(plainNeed.stdout) as Echo).env)).toEqual(["PATH", "TOWN_CREDENTIAL_TEST_ORIGIN", "TOWN_STATE", "TOWN_USER"]);
    expect([plain.calls, plain.denied, plainNeed.calls]).toEqual([0, null, 0]);

    // Dependencies: TOWN_GRANT, and the call's bin first on PATH.
    const composed = await run(probeDir, PROBE, "probe", {}, { user: "u1", stateRoot, wall, town: { answer: answered } });
    expect(composed.exit, composed.stderr).toBe(0);
    const seen = JSON.parse(composed.stdout) as Probe;
    expect(names(seen.env)).toEqual(["PATH", "TOWN_GRANT", "TOWN_STATE", "TOWN_USER"]);
    const callDir = path.dirname(seen.env.TOWN_GRANT!);
    expect(seen.env.PATH).toBe(`${path.join(callDir, "bin")}${path.delimiter}${process.env.PATH}`);
    const withNeed = await run(probeDir, { ...PROBE, credentials: [{ type: "test-origin" }] }, "probe", {}, { user: "u1", stateRoot, wall, credentials: [cred], town: { answer: answered } });
    expect(names((JSON.parse(withNeed.stdout) as Probe).env)).toEqual(["PATH", "TOWN_CREDENTIAL_TEST_ORIGIN", "TOWN_GRANT", "TOWN_STATE", "TOWN_USER"]);
  });

  it("makes a call directory, mode 700, holding bin/town and grant and nothing else, and removes it after", async () => {
    const r = await run(probeDir, PROBE, "probe", {}, { user: "u1", stateRoot, wall, town: { answer: answered } });
    const seen = JSON.parse(r.stdout) as Probe;
    const callDir = path.dirname(seen.env.TOWN_GRANT!);
    expect(path.basename(callDir)).toMatch(/^town-call-/);
    expect(seen.dir).toBe("700");
    expect(seen.files).toEqual([
      ["bin/", "700"],
      ["bin/town", "700"],
      ["grant", "600"],
    ]);
    expect(seen.env.TOWN_GRANT).toBe(path.join(callDir, "grant"));
    expect(await exists(callDir)).toBe(false);
    const again = JSON.parse((await run(probeDir, PROBE, "probe", {}, { user: "u1", stateRoot, wall, town: { answer: answered } })).stdout) as Probe;
    expect(path.dirname(again.env.TOWN_GRANT!)).not.toBe(callDir);
    expect(again.grant).not.toBe(seen.grant);
  });

  it("writes a grant file whose town is the clerk and whose token is none the test holds; town from the process reaches the clerk, dead after", async () => {
    const cred: RunCredential = { type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: TOKEN };
    const r = await run(probeDir, { ...PROBE, credentials: [{ type: "test-origin" }] }, "probe", {}, { user: "u1", stateRoot, wall, credentials: [cred], town: { answer: answered } });
    const seen = JSON.parse(r.stdout) as Probe;
    const grant = JSON.parse(seen.grant!) as { town: string; token: string };
    expect(Object.keys(grant).sort()).toEqual(["token", "town"]);
    expect(grant.town).toMatch(GRANT_URL);
    expect(grant.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(grant.token).not.toBe(TOKEN);
    expect(seen.grant).not.toContain(TOKEN);
    expect(seen.town).toEqual({ exit: 0, stdout: "the town's answer\n", stderr: "" });
    expect(asked).toEqual([{ argv: ["echo", "echo", "--zeta", "from-the-probe"], stdin: null, json: false }]);
    expect([r.calls, r.denied]).toEqual([1, null]);
    expect(await refusedAt(`${grant.town}/`)).toBe(true);
  });

  it("carries the first denial among the clerk's answers on the result", async () => {
    const denying: Answer = async () => ({ stdout: "", stderr: "error: command 'echo' is not available to this grant\n", exit: 2, denial: "error: command 'echo' is not available to this grant" });
    const r = await run(probeDir, PROBE, "probe", {}, { user: "u1", stateRoot, wall, town: { answer: denying } });
    expect((JSON.parse(r.stdout) as Probe).town).toEqual({ exit: 2, stdout: "", stderr: "error: command 'echo' is not available to this grant\n" });
    expect([r.calls, r.denied]).toEqual([1, "error: command 'echo' is not available to this grant"]);
  });

  it("refuses a shop with dependencies and no town before anything is opened", async () => {
    await expect(run(probeDir, PROBE, "probe", {}, { user: "u1", stateRoot, wall })).rejects.toThrow(/has dependencies and run was given no town/);
  });

  it("kills the group on abort, says aborted, and aborts every call its clerk was answering", async () => {
    const user = "abort-sleeper";
    const controller = new AbortController();
    const call = run(ECHO, manifest, "sleep", {}, { user, stateRoot, wall, signal: controller.signal });
    const pid = Number(await waitForFile(path.join(stateDir(stateRoot, manifest.name, user), "grandchild.pid")));
    controller.abort();
    const r = await call;
    expect([r.aborted, r.timedOut, r.exit]).toEqual([true, false, 1]);
    expect(await gone(pid)).toBe(true);

    let inner: AbortSignal | null = null;
    const hanging: Answer = (_call, signal) =>
      new Promise((resolve) => {
        inner = signal;
        signal.addEventListener("abort", () => resolve({ stdout: "", stderr: "", exit: 1, denial: null }));
      });
    const outer = new AbortController();
    const tree = run(probeDir, PROBE, "hang", {}, { user: "u1", stateRoot, wall, signal: outer.signal, town: { answer: hanging } });
    for (let i = 0; i < 250 && !inner; i++) await realDelay(20);
    expect(inner).not.toBeNull();
    outer.abort();
    const t = await tree;
    expect([t.aborted, t.exit]).toEqual([true, 1]);
    expect(inner!.aborted).toBe(true);
    const seen = JSON.parse(t.stdout.split("\n")[0]!) as Probe;
    expect(await exists(path.dirname(seen.env.TOWN_GRANT!))).toBe(false);
    expect(await refusedAt(`${JSON.parse(seen.grant!).town}/`)).toBe(true);

    const before = new AbortController();
    before.abort();
    expect(await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall, signal: before.signal })).toMatchObject({ aborted: true, exit: 1, stdout: "" });
  });

  it("ends every call its clerk was answering at the limit", async () => {
    let inner: AbortSignal | null = null;
    const hanging: Answer = (_call, signal) =>
      new Promise((resolve) => {
        inner = signal;
        signal.addEventListener("abort", () => resolve({ stdout: "", stderr: "", exit: 1, denial: null }));
      });
    const r = await run(probeDir, PROBE, "hang", {}, { user: "u1", stateRoot, wall, timeoutMs: 1500, town: { answer: hanging } });
    expect([r.timedOut, r.aborted, r.exit]).toEqual([true, false, 1]);
    expect(inner).not.toBeNull();
    expect(inner!.aborted).toBe(true);
  });

  it("builds the enclosure of a composed call with a need: the call's directory read, and the teller's and the clerk's ports", async () => {
    const recording = recordingWall();
    const cred: RunCredential = { type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: TOKEN };
    const r = await run(probeDir, { ...PROBE, credentials: [{ type: "test-origin" }] }, "probe", {}, { user: "u1", stateRoot, wall: recording, credentials: [cred], town: { answer: answered } });
    expect(r.exit, r.stderr).toBe(0);
    const seen = JSON.parse(r.stdout) as Probe;
    const callDir = path.dirname(seen.env.TOWN_GRANT!);
    const port = (url: string) => Number(new URL(url).port);
    expect(recording.seen).toEqual([
      {
        file: process.execPath,
        args: [path.join(probeDir, "main.mjs"), "probe"],
        within: {
          reads: [probeDir, NODE_DIR, INSTALL, callDir],
          writes: [stateDir(stateRoot, PROBE.name, "u1")],
          ports: [port(seen.env.TOWN_CREDENTIAL_TEST_ORIGIN!), port((JSON.parse(seen.grant!) as { town: string }).town)],
        },
      },
    ]);
    expect(r.wall).toBe("none");
  });

  it.skipIf(!boxWall)(`runs a composed shop's town within the box's wall, answered by its clerk from the call's grant (${needsBox})`, async () => {
    const r = await run(probeDir, PROBE, "probe", {}, { user: "walled", stateRoot, wall: boxWall!, town: { answer: answered } });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.wall).toBe(BOX);
    const seen = JSON.parse(r.stdout) as Probe;
    const added = selfAdded();
    expect(Object.keys(seen.env).filter((k) => !added.includes(k)).sort()).toEqual(["PATH", "TOWN_GRANT", "TOWN_STATE", "TOWN_USER"]);
    expect(JSON.parse(seen.grant!)).toMatchObject({ town: expect.stringMatching(GRANT_URL) });
    expect(seen.town).toEqual({ exit: 0, stdout: "the town's answer\n", stderr: "" });
    expect(asked).toEqual([{ argv: ["echo", "echo", "--zeta", "from-the-probe"], stdin: null, json: false }]);
    expect([r.calls, r.denied]).toEqual([1, null]);
  });
});

describe("the wall", () => {
  const names = (env: Record<string, string>) => {
    const r = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {} });
    const added = JSON.parse(r.stdout.toString("utf8")) as string[];
    return Object.keys(env).filter((k) => !added.includes(k)).sort();
  };

  it("is required: run without one is refused by the type checker, and at run time before anything is made", async () => {
    const user = "no-wall";
    // @ts-expect-error run takes a wall, and there is no default
    await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user, stateRoot })).rejects.toThrow(/run was given no wall for test\/echo/);
    expect(await stat(stateDir(stateRoot, manifest.name, user)).then(() => true, () => false)).toBe(false);
  });

  it("is given the enclosure the design names: the shop's directory, Node's, and the town's install to read, the state to write, no port", async () => {
    const recording = recordingWall();
    const r = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall: recording });
    expect(r.exit, r.stderr).toBe(0);
    expect(path.dirname(path.dirname(TOWN_BIN))).toBe(INSTALL);
    expect(recording.seen).toEqual([
      {
        file: process.execPath,
        args: [path.join(ECHO, "main.mjs"), "echo", "--zeta", "z", "--alpha", "7", "--mode", "slow", "--loud", "false"],
        within: { reads: [ECHO, NODE_DIR, INSTALL], writes: [stateDir(stateRoot, manifest.name, "u1")], ports: [] },
      },
    ]);
    const sh = await loadShop(SH);
    const shRecording = recordingWall();
    await run(SH, sh, "args", { word: "w" }, { user: "u1", stateRoot, wall: shRecording });
    expect(shRecording.seen.map((e) => [e.file, e.args])).toEqual([[path.join(SH, "entry.sh"), ["args", "--word", "w"]]]);
  });

  it("closes every window it opened when the wall refuses the enclosure", async () => {
    const refusing = { kind: "none" as const, enclose: () => { throw new Error("the wall refused"); } };
    const origin = await fakeOrigin();
    const listens: http.Server[] = [];
    const listen = http.Server.prototype.listen;
    const spy = vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (this: http.Server, ...args: unknown[]) {
      listens.push(this);
      return (listen as (...a: unknown[]) => http.Server).apply(this, args);
    });
    try {
      const cred: RunCredential = { type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: "tok_refused" };
      await expect(run(ECHO, manifest, "echo", { zeta: "z" }, { user: "u1", stateRoot, wall: refusing, credentials: [cred] })).rejects.toThrow(/the wall refused/);
      expect(listens.map((s) => s.listening)).toEqual([false]);
    } finally {
      spy.mockRestore();
      await origin.close();
    }
  });

  it.skipIf(!boxWall)(`keeps the environment exactly the contract's three names under the box's wall (${needsBox})`, async () => {
    const r = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "opaque-7", stateRoot, wall: boxWall!, stdin: "walled stdin" });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.wall).toBe(BOX);
    const out = JSON.parse(r.stdout) as Echo;
    expect(names(out.env)).toEqual(["PATH", "TOWN_STATE", "TOWN_USER"]);
    expect(out.env.PATH).toBe(process.env.PATH);
    expect(out.argv).toEqual(["echo", "--zeta", "z", "--alpha", "7", "--mode", "slow", "--loud", "false"]);
    expect(out.stdin).toBe("walled stdin");
    expect(await realPath(out.cwd)).toBe(await realPath(ECHO));
  });

  it.skipIf(!boxWall)(`gives the same TOWN_STATE path within the box's wall as without it (${needsBox})`, async () => {
    const unwalled = JSON.parse((await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "same", stateRoot, wall })).stdout) as Echo;
    const walled = await run(ECHO, manifest, "echo", { zeta: "z" }, { user: "same", stateRoot, wall: boxWall! });
    expect(walled.exit, walled.stderr).toBe(0);
    expect((JSON.parse(walled.stdout) as Echo).env.TOWN_STATE).toBe(unwalled.env.TOWN_STATE);
    expect(unwalled.env.TOWN_STATE).toBe(stateDir(stateRoot, manifest.name, "same"));
  });

  it.skipIf(!boxWall)(`kills a sleeping entry at the limit under the box's wall, with nothing left in its group (${needsBox})`, async () => {
    const user = "walled-sleeper";
    const call = run(ECHO, manifest, "sleep", {}, { user, stateRoot, timeoutMs: 1500, wall: boxWall! });
    const pid = Number(await waitForFile(path.join(stateDir(stateRoot, manifest.name, user), "grandchild.pid")));
    const pgid = Number(spawnSync("/bin/ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim());
    expect(pgid).toBeGreaterThan(1);
    expect(pgid).not.toBe(process.pid);
    const r = await call;
    expect([r.timedOut, r.exit, r.wall]).toEqual([true, 1, BOX]);
    expect(await gone(pid)).toBe(true);
    let group: string | undefined;
    try {
      process.kill(-pgid, 0);
      group = "alive";
    } catch (e) {
      group = (e as NodeJS.ErrnoException).code;
    }
    expect(group, `process group ${pgid}`).toBe("ESRCH");
  });
});

function refusedAt(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { agent: false }, (res) => {
      res.resume();
      resolve(false);
    });
    req.on("error", (e: NodeJS.ErrnoException) => resolve(e.code === "ECONNREFUSED"));
  });
}

async function realPath(p: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(p);
}
