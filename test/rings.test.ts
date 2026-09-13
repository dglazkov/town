// ring: checkout
// Every file under test/, fixtures excepted, names its ring in its first
// line; a command-ring file spawns the built binaries through the helper
// and a checkout-ring file does not; a box-ring file imports from
// `cloudflare:test` and a file of no other ring does; and `pnpm test`
// builds, then runs all three rings, the box ring's files in workerd
// through the pool and the other two's in this process, and ends on a line
// naming them.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { ringOf, testFilesOfRing } from "../scripts/rings-reporter.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEST = path.join(ROOT, "test");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "fixtures" ? [] : files(full);
    return [full];
  });
}

it("every file under test/ names its ring", () => {
  const all = files(TEST);
  expect(all.length).toBeGreaterThan(10);
  for (const f of all) expect(ringOf(f), path.relative(ROOT, f)).toMatch(/^(checkout|command|box)$/);
});

it("a command-ring test uses the helper that spawns the binaries, a box-ring test imports from cloudflare:test, and a test of any other ring does neither", () => {
  const tests = files(TEST).filter((f) => f.endsWith(".test.ts"));
  const byRing = { checkout: 0, command: 0, box: 0 } as Record<string, number>;
  for (const f of tests) {
    const ring = ringOf(f);
    byRing[ring]!++;
    const source = readFileSync(f, "utf8");
    const spawns = /from "\.\/helpers\/town\.js"/.test(source);
    const pooled = /^import .* from "cloudflare:test";$/m.test(source);
    expect(spawns, `${path.relative(ROOT, f)} is ring ${ring}`).toBe(ring === "command");
    expect(pooled, `${path.relative(ROOT, f)} is ring ${ring}`).toBe(ring === "box");
  }
  expect(byRing.checkout).toBeGreaterThan(0);
  expect(byRing.command).toBeGreaterThan(0);
  expect(byRing.box).toBeGreaterThan(0);
  expect(testFilesOfRing(ROOT, "box")).toEqual(tests.filter((f) => ringOf(f) === "box").map((f) => path.relative(ROOT, f)).sort());
});

it("pnpm test builds first, runs every test file of the three rings, the box ring's in the pool and no other's, and reports the rings last", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  expect(pkg.scripts.test).toBe("tsc -p tsconfig.build.json && vitest run");
  const config = readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
  expect(config).toContain('include: ["test/**/*.test.ts"], exclude: testFilesOfRing(import.meta.dirname, "box")');
  expect(config).toContain('"./vitest.box.config.ts"');
  expect(config).toContain('reporters: ["default", "./scripts/rings-reporter.ts"]');
  const box = readFileSync(path.join(ROOT, "vitest.box.config.ts"), "utf8");
  expect(box).toContain('include: testFilesOfRing(import.meta.dirname, "box")');
  expect(box).toContain('wrangler: { configPath: "./wrangler.jsonc" }');
  expect(box).toContain("workerLoaders: { LOADER: {} }");
});
