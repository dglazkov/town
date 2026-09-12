// ring: checkout
// Every file under test/, fixtures excepted, names its ring in its first
// line; a command-ring file spawns the built binaries through the helper
// and a checkout-ring file does not; and `pnpm test` builds, then runs
// both rings, and ends on a line naming them.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { ringOf } from "../scripts/rings-reporter.js";

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
  for (const f of all) expect(ringOf(f), path.relative(ROOT, f)).toMatch(/^(checkout|command)$/);
});

it("a command-ring test uses the helper that spawns the binaries, and a checkout-ring test does not", () => {
  const tests = files(TEST).filter((f) => f.endsWith(".test.ts"));
  const byRing = { checkout: 0, command: 0 } as Record<string, number>;
  for (const f of tests) {
    const ring = ringOf(f);
    byRing[ring]!++;
    const spawns = /from "\.\/helpers\/town\.js"/.test(readFileSync(f, "utf8"));
    expect(spawns, `${path.relative(ROOT, f)} is ring ${ring}`).toBe(ring === "command");
  }
  expect(byRing.checkout).toBeGreaterThan(0);
  expect(byRing.command).toBeGreaterThan(0);
});

it("pnpm test builds first, runs every test file of both rings, and reports the rings last", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  expect(pkg.scripts.test).toBe("tsc -p tsconfig.build.json && vitest run");
  const config = readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
  expect(config).toContain('include: ["test/**/*.test.ts"]');
  expect(config).toContain('reporters: ["default", "./scripts/rings-reporter.ts"]');
});
