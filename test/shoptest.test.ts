// ring: checkout
// The shop test runner: the memory shop's own tests pass through
// testShop, and a test that must fail fails. Nothing here asserts
// anything about memory's internals; its manifest's tests do that.

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { ManifestRefused, testShop } from "../src/shoptest.js";

const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");
const VERDICTS = path.resolve(import.meta.dirname, "fixtures/verdicts-shop");

describe("the memory shop", () => {
  it("passes its own tests, one result per test in the manifest", async () => {
    const manifest = parseYaml(await readFile(path.join(MEMORY, "manifest.yaml"), "utf8"));
    const results = await testShop(MEMORY);
    expect(results.map((r) => r.name)).toEqual(manifest.tests.map((t: { name: string }) => t.name));
    for (const r of results) expect(r, r.why).toEqual({ name: r.name, ok: true });
  });
});

describe("verdicts", () => {
  it("passes what passes and fails what must fail, saying why", async () => {
    const results = await testShop(VERDICTS);
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
      expect(await testShop(dir, { timeoutMs: 500 })).toEqual([{ name: "sleeps", ok: false, why: "line 1 `sleep` ran out of time" }]);
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
      const err = await testShop(dir).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ManifestRefused);
      expect((err as ManifestRefused).refusals).toEqual([expect.stringMatching(/^credentials: .*project vault/)]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
