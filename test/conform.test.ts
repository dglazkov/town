// ring: command
// Road's journey 1, steps 2 to 4 and its first two criteria: conformance,
// scripts/conform.mjs, run as a harness author runs it. On the laptop
// binary, `node bin/town.js`, every check passes. On the broken harness,
// test/fixtures/broken-harness.mjs, unbroken it is conformant too, and in
// each mode exactly the checks that mode breaks fail, by name, and no
// other; every check is failed by some mode, so none can only say ok. A
// harness command that cannot be run is exit 2 before any town is made; an
// interrupted run stops its town; and no run leaves a directory behind.
// --town is not run here: a second `wrangler dev` beside test/dev.test.ts's
// breaks that test, and road phase 2 walks --town against the box.
// The modes run a few at a time, each its own town.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ROOT, assertBuilt } from "./helpers/town.js";

const CONFORM = path.join(ROOT, "scripts/conform.mjs");
const BROKEN = path.join(ROOT, "test/fixtures/broken-harness.mjs");

/** For each mode of the broken harness, the checks it must fail and no others; "" is the harness unbroken. */
const BREAKS: Record<string, string[]> = {
  "": [],
  "drop-stderr-on-success": ["call"],
  "split-argv": ["argv-empty-word", "argv-spaces"],
  "latin1-argv": ["argv-non-ascii"],
  "json-in-argv": ["json-before", "json-among", "json-after", "json-denial"],
  "json-first-only": ["json-among", "json-after"],
  "own-help": ["help", "help-at-shop"],
  "no-stdin": ["stdin-pipe", "stdin-file", "stdin-text", "stdin-large", "stdin-too-large", "stdin-not-text"],
  "pipe-only": ["stdin-file"],
  "socket-stdin": ["stdin-socket"],
  "trim-stdin": ["stdin-text"],
  "stdin-one-chunk": ["stdin-large", "stdin-too-large"],
  "non-utf8-stdin": ["stdin-not-text"],
  "append-call": ["request-town-slash"],
  "strict-value": ["grant-whitespace"],
  "leak-grant": ["grant-not-a-grant", "grant-bare-token"],
  "no-url-check": ["grant-not-a-grant"],
  "no-grant-exit-1": ["no-grant", "json-refusal"],
  "json-refusal-plain": ["json-refusal"],
  "crash-unreachable": ["unreachable"],
  "retry-on-failure": ["call-once"],
  "own-failure-words": ["stdin-too-large", "shop-fails", "usage-error"],
  "clamp-exit": ["revoked"],
  "denial-exit-1": ["json-denial", "denied-command", "denied-constraint"],
};

/** How many conformance runs go at once. */
const AT_ONCE = 2;

interface Run {
  stdout: string;
  stderr: string;
  exit: number | null;
  ms: number;
}

function conform(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<Run> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CONFORM, ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    child.on("close", (exit) => resolve({ stdout, stderr, exit, ms: Date.now() - started }));
  });
}

/** The check names --list prints, in order. */
function listed(): string[] {
  const r = spawnSync(process.execPath, [CONFORM, "--list"], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim().split("\n").map((l) => /^(\S+) \(§\d+\)/.exec(l)![1]!);
}

/** The FAIL lines' check names, with the verdict line checked against them. */
function failedChecks(run: Run, total: number): string[] {
  const lines = run.stdout.trim().split("\n");
  const names = lines.filter((l) => /^(ok|FAIL) /.test(l)).map((l) => /^(?:ok|FAIL) (\S+) \(§\d+\)/.exec(l)![1]!);
  expect(names.length, run.stdout + run.stderr).toBe(total);
  const failed = lines.filter((l) => l.startsWith("FAIL ")).map((l) => /^FAIL (\S+) /.exec(l)![1]!);
  expect(lines.at(-1)).toBe(failed.length === 0 ? `conformant: ${total} checks` : `not conformant: ${failed.length} of ${total} checks failed`);
  expect(run.exit).toBe(failed.length === 0 ? 0 : 1);
  return failed;
}

const leftovers = () => readdirSync(os.tmpdir()).filter((e) => e.startsWith("town-conform-"));
let before: string[];
let checks: string[];

beforeAll(() => {
  assertBuilt();
  before = leftovers();
  checks = listed();
});

afterAll(() => {
  expect(leftovers().filter((e) => !before.includes(e)), "a run left its directory").toEqual([]);
});

it("the laptop binary is conformant, every check ok", async () => {
  const run = await conform(["--", "node", "bin/town.js"]);
  process.stdout.write(`conformance on the laptop binary: ${run.ms} ms\n`);
  expect(checks.length).toBeGreaterThanOrEqual(20);
  expect(failedChecks(run, checks.length), run.stdout).toEqual([]);
}, 60_000);

it("the broken harness fails, in each mode, exactly the checks that mode breaks, and every check is failed by some mode", async () => {
  const source = readFileSync(BROKEN, "utf8");
  const modes = [...source.matchAll(/^ {2}"([a-z0-9-]+)": "/gm)].map((m) => m[1]!);
  expect(Object.keys(BREAKS).filter((m) => m !== "").sort(), "every mode of the fixture has its expected failures here").toEqual([...modes].sort());
  for (const names of Object.values(BREAKS)) for (const n of names) expect(checks, `${n} is a check`).toContain(n);
  expect(checks.filter((c) => !Object.values(BREAKS).some((names) => names.includes(c))), "a check no mode fails").toEqual([]);

  const started = Date.now();
  const entries = Object.entries(BREAKS);
  const results = new Map<string, Run>();
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < entries.length) {
        const [mode] = entries[next++]!;
        results.set(mode, await conform(["--", "env", `BROKEN=${mode}`, "node", "test/fixtures/broken-harness.mjs"]));
      }
    }),
  );
  process.stdout.write(`conformance on the broken harness in ${entries.length} modes: ${Date.now() - started} ms\n`);
  for (const [mode, expected] of entries) {
    const run = results.get(mode)!;
    expect(failedChecks(run, checks.length).sort(), `BROKEN=${mode}\n${run.stdout}${run.stderr}`).toEqual([...expected].sort());
  }
}, 120_000);

it("a harness command that cannot be run is exit 2, before any town is made", async () => {
  const run = await conform(["--", "/nonexistent"]);
  expect(run.exit).toBe(2);
  expect(run.stdout).toBe("");
  expect(run.stderr).toMatch(/^conform: the harness command cannot be run: /);
  expect(run.stderr).not.toContain("set up");
}, 30_000);

it("an interrupted run stops its town and removes its directory", async () => {
  const mine = new Set(leftovers());
  // The held-socket check waits twenty seconds on this mode: long enough to interrupt a run mid-check.
  const child = spawn(process.execPath, [CONFORM, "--", "env", "BROKEN=socket-stdin", "node", "test/fixtures/broken-harness.mjs"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
  let root: string | undefined;
  for (const end = Date.now() + 20_000; Date.now() < end && root === undefined; await new Promise((r) => setTimeout(r, 50))) {
    root = leftovers().find((e) => !mine.has(e) && existsSync(path.join(os.tmpdir(), e, "run-3")));
  }
  expect(root, "the run made its directory and began its checks").toBeDefined();
  await new Promise((r) => setTimeout(r, 1500));
  const data = path.join(os.tmpdir(), root!, "data");
  const serving = () => spawnSync("/bin/ps", ["-ax", "-o", "command="], { encoding: "utf8" }).stdout.split("\n").filter((l) => l.includes(data));
  expect(serving().length, "its town is up").toBeGreaterThan(0);
  child.kill("SIGINT");
  expect(await exited).toBe(130);
  expect(existsSync(path.join(os.tmpdir(), root!))).toBe(false);
  for (const end = Date.now() + 5_000; Date.now() < end && serving().length > 0; await new Promise((r) => setTimeout(r, 50)));
  expect(serving()).toEqual([]);
}, 60_000);
