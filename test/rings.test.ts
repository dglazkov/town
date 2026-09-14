// ring: checkout
// Every file under test/, fixtures excepted, names its ring in its first
// line; a command-ring file spawns the built binaries through the helper
// and a checkout-ring file does not; a box-ring file imports from
// `cloudflare:test` and a file of no other ring does; and `pnpm test`,
// scripts/test.mjs, builds with package.json's build command, then runs all
// three rings, the box ring's files in workerd through the pool and the
// other two's in this process, and ends on a line naming them. The
// selector's ring handling is read from its source: every ring reaches a
// vitest project by name, and the run with nothing given is vitest over
// both projects, so a selector that dropped a ring fails here.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { RINGS, ringOf, testFilesOfRing } from "../scripts/rings-reporter.js";

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
  expect(pkg.scripts.test).toBe("node scripts/test.mjs");
  const selector = readFileSync(path.join(ROOT, "scripts/test.mjs"), "utf8");
  expect(pkg.scripts.build).toBe("tsc -p tsconfig.build.json");
  expect(/^const BUILD = "([^"]*)";$/m.exec(selector)?.[1], "the selector builds with package.json's build command").toBe(pkg.scripts.build);
  expect(selector).toContain('import { RINGS, testFilesOfRing } from "./rings-reporter.ts";');
  expect(selector).toContain('import { staleness } from "./stale.ts";');
  const project = /^const PROJECT = \{ (.*) \};$/m.exec(selector)?.[1] ?? "";
  const projectOf = Object.fromEntries([...project.matchAll(/(\w+): "(\w+)"/g)].map((m) => [m[1], m[2]]));
  expect(projectOf, "every ring reaches a vitest project by name: checkout and command the node project, box the pool's").toEqual({ checkout: "node", command: "node", box: "box" });
  expect(Object.keys(projectOf)).toEqual([...RINGS]);
  expect(selector, "the run with nothing given is vitest over every project").toContain('const ALL = ["run"];');
  expect(selector).toContain("  build();\n  vitest(ALL);\n");
  expect(selector).toContain('vitest([given.watch ? "watch" : "run", ...projects.flatMap((p) => ["--project", p]), ...filters]);');
  const config = readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
  expect(config).toContain('include: ["test/**/*.test.ts"], exclude: testFilesOfRing(import.meta.dirname, "box")');
  expect(config).toContain('"./vitest.box.config.ts"');
  expect(config).toContain('reporters: ["default", "./scripts/rings-reporter.ts"]');
  expect(config).toContain('test: { name: "node",');
  const box = readFileSync(path.join(ROOT, "vitest.box.config.ts"), "utf8");
  expect(box).toContain('test: { name: "box", include: testFilesOfRing(import.meta.dirname, "box")');
  expect(box).toContain('wrangler: { configPath: "./wrangler.jsonc" }');
  expect(box).toContain("workerLoaders: { LOADER: {} }");
});
