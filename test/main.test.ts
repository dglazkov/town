// ring: checkout
// The launcher (box's journey 3 step 3): a `runtime: worker` shop's entry
// run by the runtime as a process under the town's own Node through
// bin/main.js, within the box's own wall. A main that returns 3 exits 3;
// one that throws exits 1 with the error's line on stderr; one that calls
// process.exit(2) exits 2; an entry that exports no main exits 1 with spec
// §7's line. A main's wait is awaited, and the contract is a process's:
// argv as process.argv.slice(2), the entry as argv[1], the three names,
// and stdin. The subprocess shop beside it still runs as it did.

import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NO_MAIN } from "../src/main.js";
import type { Manifest } from "../src/manifest.js";
import { MAIN_BIN, run } from "../src/runtime.js";
import { loadShop } from "../src/shoptest.js";
import { SPEC } from "../src/spec.js";
import { openWall, wallOnThisBox } from "../src/wall.js";
import { recordingWall } from "./helpers/wall.js";

const WORKER = path.resolve(import.meta.dirname, "fixtures/worker-shop");
const MAINLESS = path.resolve(import.meta.dirname, "fixtures/mainless-shop");
const ECHO = path.resolve(import.meta.dirname, "fixtures/echo-shop");
/** The box's own wall, or null on a box without one; the tests that need it say so and skip. */
const BOX = wallOnThisBox();
const boxWall = BOX ? openWall(BOX) : null;
const needsBox = BOX ? `walled by ${BOX}` : "needs a box with a wall; this box has none, so it skips";

let worker: Manifest;
let mainless: Manifest;
let stateRoot: string;

beforeAll(async () => {
  worker = await loadShop(WORKER);
  mainless = await loadShop(MAINLESS);
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "town-main-test-"));
});

afterAll(async () => {
  await rm(stateRoot, { recursive: true, force: true });
});

describe("a worker shop's four exits, through the runtime within the box's wall", () => {
  it.skipIf(!boxWall)(`a main that returns 3 exits 3, what it printed after its wait on stdout (${needsBox})`, async () => {
    const r = await run(WORKER, worker, "returns", { code: 3 }, { user: "u1", stateRoot, wall: boxWall! });
    expect([r.exit, r.stdout, r.stderr, r.wall]).toEqual([3, "returning 3\n", "", BOX]);
    const zero = await run(WORKER, worker, "returns", { code: 0 }, { user: "u1", stateRoot, wall: boxWall! });
    expect([zero.exit, zero.stdout]).toEqual([0, "returning 0\n"]);
  });

  it.skipIf(!boxWall)(`a main that throws exits 1 with the error's line on stderr, and what it printed before (${needsBox})`, async () => {
    const r = await run(WORKER, worker, "throws", {}, { user: "u1", stateRoot, wall: boxWall! });
    expect([r.exit, r.stdout, r.stderr]).toEqual([1, "about to throw\n", "Error: the fixture threw on purpose\n"]);
  });

  it.skipIf(!boxWall)(`a main that calls process.exit(2) exits 2 (${needsBox})`, async () => {
    const r = await run(WORKER, worker, "exits", {}, { user: "u1", stateRoot, wall: boxWall! });
    expect([r.exit, r.stdout, r.stderr]).toEqual([2, "", "exiting 2\n"]);
  });

  it.skipIf(!boxWall)(`an entry that exports no main exits 1 with spec §7's line, which is the spec's own (${needsBox})`, async () => {
    const r = await run(MAINLESS, mainless, "run", {}, { user: "u1", stateRoot, wall: boxWall! });
    expect([r.exit, r.stdout, r.stderr]).toEqual([1, "", `${NO_MAIN}\n`]);
    expect(SPEC.split("## 7. ")[1]!.split("## 8. ")[0]!.replace(/\s+/g, " ")).toContain(NO_MAIN);
  });
});

describe("the process a worker shop runs as", () => {
  it("is the town's own Node running bin/main.js with the entry and the canonical argv, in the same enclosure a subprocess shop gets", async () => {
    const wall = recordingWall();
    await run(WORKER, worker, "returns", { code: 0 }, { user: "u1", stateRoot, wall });
    await run(ECHO, await loadShop(ECHO), "echo", { zeta: "z" }, { user: "u1", stateRoot, wall });
    const [asWorker, asProcess] = wall.seen;
    expect([asWorker!.file, asWorker!.args]).toEqual([process.execPath, [MAIN_BIN, path.join(WORKER, "main.mjs"), "returns", "--code", "0"]]);
    expect([asProcess!.file, asProcess!.args[0]]).toEqual([process.execPath, path.join(ECHO, "main.mjs")]);
    expect(MAIN_BIN.startsWith(asWorker!.within.reads[2]! + path.sep)).toBe(true);
    expect(asWorker!.within.reads.slice(1)).toEqual(asProcess!.within.reads.slice(1));
  });

  it.skipIf(!boxWall)(`sees argv as process.argv.slice(2), its entry as argv[1], exactly the contract's names, and stdin (${needsBox})`, async () => {
    // What a Node process adds to an empty environment itself (on macOS, __CF_USER_TEXT_ENCODING), measured as runtime.test.ts measures it.
    const added = JSON.parse(spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {} }).stdout.toString("utf8")) as string[];
    const r = await run(WORKER, worker, "echo", {}, { user: "u1", stateRoot, wall: boxWall!, stdin: "sent on stdin" });
    expect(r.exit, r.stderr).toBe(0);
    const seen = JSON.parse(r.stdout) as { argv: string[]; argv1: string; env: string[]; stdin: string };
    expect({ ...seen, env: seen.env.filter((k) => !added.includes(k)) }).toEqual({ argv: ["echo"], argv1: path.join(WORKER, "main.mjs"), env: ["PATH", "TOWN_STATE", "TOWN_USER"], stdin: "sent on stdin" });
  });

  it("a subprocess shop still runs as it did: its entry is the process, and its exit is its own", async () => {
    const echo = await loadShop(ECHO);
    expect(echo.runtime).toBe("subprocess");
    const r = await run(ECHO, echo, "fail", {}, { user: "u1", stateRoot, wall: boxWall ?? openWall("none") });
    expect([r.exit, r.stderr]).toEqual([3, "the fixture failed on purpose\n"]);
  });
});
