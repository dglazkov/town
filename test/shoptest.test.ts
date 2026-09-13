// ring: checkout
// The shop test runner: the memory shop's own tests pass through
// testShop, and a test that must fail fails. Nothing here asserts
// anything about memory's internals; its manifest's tests do that. A shop
// with a need has its tests run through a teller on the credential given.
// A shop with dependencies has its tests run with the tree, over the
// dependencies' code in a town of the test's own, in scratch, writing
// nothing to the town; `shop test` without --data refuses it. Every line
// runs within the wall the runner is given, and so does every dependency
// below it, as a fake wall's record shows.

import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { main as admin, type Io } from "../src/admin.js";
import { shopDir } from "../src/gate.js";
import { ManifestRefused, loadShop, testShop, townShops } from "../src/shoptest.js";
import { openStore, type Store } from "../src/store.js";
import { openWall } from "../src/wall.js";
import { fakeOrigin } from "./helpers/origin.js";
import { recordingWall } from "./helpers/wall.js";

const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");
const VERDICTS = path.resolve(import.meta.dirname, "fixtures/verdicts-shop");
const TELLER = path.resolve(import.meta.dirname, "fixtures/teller-shop");
const ECHO = path.resolve(import.meta.dirname, "fixtures/echo-shop");
const RECIPE = path.resolve(import.meta.dirname, "fixtures/recipe-shop");
const wall = openWall("none");

describe("a shop with dependencies", () => {
  let data: string;
  let store: Store;
  const made: string[] = [];

  async function add(dir: string, types: string[] = []): Promise<void> {
    const m = await loadShop(dir, types, townShops(store));
    store.upsertShop(m, 1000);
    cpSync(dir, shopDir(store, m.name), { recursive: true });
  }

  /** A copy of the recipe with `edit` applied to its manifest text. */
  async function recipeWith(edit: (text: string) => string): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "town-recipe-"));
    made.push(dir);
    await cp(RECIPE, dir, { recursive: true });
    await writeFile(path.join(dir, "manifest.yaml"), edit(await readFile(path.join(dir, "manifest.yaml"), "utf8")));
    return dir;
  }

  beforeEach(async () => {
    data = mkdtempSync(path.join(os.tmpdir(), "town-shoptest-data-"));
    store = openStore(data);
    await add(ECHO);
  });
  afterEach(() => {
    store.close();
    for (const d of [data, ...made.splice(0)]) rmSync(d, { recursive: true, force: true });
  });

  it("runs the recipe's tests through the tree, over the dependency's code in the town, and writes nothing to the town", async () => {
    const results = await testShop(RECIPE, { types: [], shops: townShops(store), store, wall });
    expect(results).toEqual([
      { name: "a declared command answers through the town", ok: true },
      { name: "an undeclared command is not available", ok: true },
    ]);
    expect(existsSync(store.stateRoot)).toBe(false);
    expect(store.calls()).toEqual([]);
    expect(store.listGrants()).toEqual([]);
  });

  it("runs a dependency in the test's scratch state, as the test user", async () => {
    const dir = await recipeWith((t) => t.replace(/tests:[\s\S]*$/, 'tests:\n  - name: scratch\n    run: relay --words "echo echo --zeta z"\n    expect: { contains: "town-shop-test-" }\n  - name: the test user\n    run: relay --words "echo echo --zeta z"\n    expect: { contains: "test%2Fecho/shop-test" }\n'));
    expect(await testShop(dir, { types: [], shops: townShops(store), store, wall })).toEqual([
      { name: "scratch", ok: true },
      { name: "the test user", ok: true },
    ]);
    expect(existsSync(store.stateRoot)).toBe(false);
  });

  it("fails a test whose call the recipe did not declare, and one that reaches a shop outside the tree", async () => {
    const dir = await recipeWith((t) =>
      t.replace(/tests:[\s\S]*$/, 'tests:\n  - name: sleep\n    run: relay --words "echo sleep"\n    expect: { exit: 0 }\n  - name: the manifest\n    run: relay --words "recipe relay --words x"\n    expect: { exit: 0 }\n'),
    );
    const results = await testShop(dir, { types: [], shops: townShops(store), store, wall });
    expect(results.map((r) => [r.name, r.ok, r.why])).toEqual([
      ["sleep", false, "expected exit 0, got 2: error: command 'sleep' is not available to this grant"],
      ["the manifest", false, "expected exit 0, got 2: error: command 'recipe relay' is not available to this grant"],
    ]);
  });

  it("runs a dependency with a need on the credential given, and needs one for it", async () => {
    const origin = await fakeOrigin();
    try {
      store.addType({ name: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}" }, 1000);
      await add(TELLER, ["test-origin"]);
      const dir = await recipeWith((t) =>
        t
          .replace("    commands: [echo]\n", "    commands: [echo]\n  - shop: test/teller\n    commands: [get]\n")
          .replace(/tests:[\s\S]*$/, 'tests:\n  - name: through the teller\n    run: relay --words "teller get --path /hello"\n    expect: { contains: "hello from the origin" }\n'),
      );
      const credentials = [{ type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: "tok_tree" }];
      const opts = { types: ["test-origin"], shops: townShops(store), store, wall };
      await expect(testShop(dir, opts)).rejects.toThrow(/need credentials of \(test-origin\) and were given \(\)/);
      expect(await testShop(dir, { ...opts, credentials })).toEqual([{ name: "through the teller", ok: true }]);
      expect(origin.seen.map((s) => [s.url, s.headers.authorization])).toEqual([["/hello", "Bearer tok_tree"]]);
    } finally {
      await origin.close();
    }
  });

  it("is refused by townd admin shop test with no --data, naming it; with --data, one ok line per test", async () => {
    let stdout = "";
    let stderr = "";
    const io: Io = { out: (s) => void (stdout += s), err: (s) => void (stderr += s), env: {} };
    expect(await admin(["shop", "test", RECIPE], io, () => ({ open: () => wall }))).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe("depends[0].shop: 'test/echo' cannot be checked with no data directory at hand; write the verb again with --data <dir>, so the town's shops are read, instead (spec §8)\n");
    stderr = "";
    store.close();
    const code = await admin(["shop", "test", RECIPE, "--data", data], io, () => ({ open: () => wall }));
    store = openStore(data);
    expect([code, stderr]).toEqual([0, ""]);
    expect(stdout).toBe("ok a declared command answers through the town\nok an undeclared command is not available\n");
  });
});

describe("the wall", () => {
  it("encloses every line of a shop's tests: one enclosure per line, the shop's directory read and the test's scratch state written", async () => {
    const recording = recordingWall();
    const results = await testShop(VERDICTS, { wall: recording });
    expect(results).toHaveLength(7);
    const manifest = parseYaml(await readFile(path.join(VERDICTS, "manifest.yaml"), "utf8")) as { tests: Array<{ run: string }> };
    const lines = manifest.tests.flatMap((t) => t.run.split("\n").filter((l) => l.trim() !== ""));
    // A failing middle line stops its test, so one line of the seven tests' is never run.
    expect(recording.seen.length).toBe(lines.length - 1);
    for (const e of recording.seen) {
      expect(e.within.reads[0]).toBe(VERDICTS);
      expect(e.within.writes).toHaveLength(1);
      expect(path.basename(path.dirname(path.dirname(e.within.writes[0]!)))).toMatch(/^town-shop-test-/);
      expect(e.within.ports).toEqual([]);
    }
  });

  it("encloses a dependency's process below a composed shop's test, and reaches it through townd admin shop test", async () => {
    const data = mkdtempSync(path.join(os.tmpdir(), "town-shoptest-wall-"));
    try {
      const store = openStore(data);
      store.upsertShop(await loadShop(ECHO), 1000);
      cpSync(ECHO, shopDir(store, "test/echo"), { recursive: true });
      const recording = recordingWall();
      expect(await testShop(RECIPE, { types: [], shops: townShops(store), store, wall: recording })).toEqual([
        { name: "a declared command answers through the town", ok: true },
        { name: "an undeclared command is not available", ok: true },
      ]);
      const shops = recording.seen.map((e) => e.within.reads[0]);
      expect(shops).toContain(RECIPE);
      expect(shops).toContain(shopDir(store, "test/echo"));
      // The recipe's process reaches its clerk, and reads its call directory.
      const recipe = recording.seen.find((e) => e.within.reads[0] === RECIPE)!;
      expect(recipe.within.ports).toHaveLength(1);
      expect(path.basename(recipe.within.reads.at(-1)!)).toMatch(/^town-call-/);
      const echoDir = shopDir(store, "test/echo");
      store.close();

      const byAdmin = recordingWall();
      const io: Io = { out: () => {}, err: () => {}, env: {} };
      expect(await admin(["shop", "test", RECIPE, "--data", data], io, () => ({ open: () => byAdmin }))).toBe(0);
      expect(byAdmin.seen.map((e) => e.within.reads[0])).toEqual(expect.arrayContaining([RECIPE, echoDir]));
      const alone = recordingWall();
      expect(await admin(["shop", "test", MEMORY], io, () => ({ open: () => alone }))).toBe(0);
      expect(alone.seen.length).toBeGreaterThan(0);
      expect(alone.seen.every((e) => e.within.reads[0] === MEMORY)).toBe(true);
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });
});

describe("a shop with a need", () => {
  it("runs its tests through a teller on the credential given, against the type's origin", async () => {
    const origin = await fakeOrigin();
    try {
      const credentials = [{ type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: "tok_shoptest" }];
      expect(await testShop(TELLER, { types: ["test-origin"], credentials, wall })).toEqual([{ name: "the origin answers", ok: true }]);
      expect(origin.seen.map((s) => [s.url, s.headers.authorization])).toEqual([["/hello", "Bearer tok_shoptest"]]);
    } finally {
      await origin.close();
    }
  });

  it("is refused with no store at hand, naming --data, and runs nothing without the credential", async () => {
    const err = await testShop(TELLER, { wall }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ManifestRefused);
    expect((err as ManifestRefused).refusals).toEqual([expect.stringMatching(/^credentials\[0\]\.type: 'test-origin' cannot be checked with no data directory at hand; write .*--data/)]);
    await expect(testShop(TELLER, { types: ["test-origin"], wall })).rejects.toThrow(/need credentials of \(test-origin\) and were given \(\)/);
  });
});

describe("the memory shop", () => {
  it("passes its own tests, one result per test in the manifest", async () => {
    const manifest = parseYaml(await readFile(path.join(MEMORY, "manifest.yaml"), "utf8"));
    const results = await testShop(MEMORY, { wall });
    expect(results.map((r) => r.name)).toEqual(manifest.tests.map((t: { name: string }) => t.name));
    for (const r of results) expect(r, r.why).toEqual({ name: r.name, ok: true });
  });
});

describe("verdicts", () => {
  it("passes what passes and fails what must fail, saying why", async () => {
    const results = await testShop(VERDICTS, { wall });
    const by = Object.fromEntries(results.map((r) => [r.name, r]));
    expect(results).toHaveLength(7);

    expect(by["passes"]).toEqual({ name: "passes", ok: true });
    expect(by["quoted words, nothing expanded"]).toEqual({ name: "quoted words, nothing expanded", ok: true });
    expect(by["lines share one state"]).toEqual({ name: "lines share one state", ok: true });
    expect(by["each test starts empty"]).toEqual({ name: "each test starts empty", ok: true });

    expect(by["wrong output fails"]!.ok).toBe(false);
    expect(by["wrong output fails"]!.why).toMatch(/expected stdout to contain "bye"/);

    expect(by["a failing middle line fails"]!.ok).toBe(false);
    expect(by["a failing middle line fails"]!.why).toBe("line 1 `fail` exited 2: boom");

    expect(by["wrong exit fails"]!.ok).toBe(false);
    expect(by["wrong exit fails"]!.why).toMatch(/expected exit 1, got 0/);
  });

  it("fails a line that runs out of time", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "town-shoptest-"));
    try {
      await cp(path.resolve(import.meta.dirname, "fixtures/echo-shop"), dir, { recursive: true });
      const text = (await readFile(path.join(dir, "manifest.yaml"), "utf8")).replace(
        /tests:[\s\S]*$/,
        "tests:\n  - name: sleeps\n    run: sleep\n    expect: { contains: sleeping }\n",
      );
      await writeFile(path.join(dir, "manifest.yaml"), text);
      expect(await testShop(dir, { timeoutMs: 500, wall })).toEqual([{ name: "sleeps", ok: false, why: "line 1 `sleep` ran out of time" }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a shop whose manifest is refused, running nothing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "town-shoptest-"));
    try {
      await cp(VERDICTS, dir, { recursive: true });
      const text = await readFile(path.join(dir, "manifest.yaml"), "utf8");
      await writeFile(path.join(dir, "manifest.yaml"), `${text}credentials:\n  - type: api-key\n`);
      const err = await testShop(dir, { types: ["github-token"], wall }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ManifestRefused);
      expect((err as ManifestRefused).refusals).toEqual([
        "credentials[0].type: 'api-key' is not a type this town holds; write one of (github-token), or an origin and a header beside it to propose one, instead (spec §8)",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
