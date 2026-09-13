// The last line of `pnpm test`: how many test files of each ring this run
// actually ran and passed, read from each file's `// ring:` header. A
// file with no header counts as `unmarked`, and test/rings.test.ts fails it.
// The box ring's files are named after its count with the pool they ran
// in, so the line shows they ran in workerd and not in this process.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Reporter, TestModule } from "vitest/node";

export const RINGS = ["checkout", "command", "box"] as const;

export function ringOf(file: string): string {
  const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
  return /^\/\/ ring: (checkout|command|box)$/.exec(first)?.[1] ?? "unmarked";
}

/** The test files under `dir` whose header names `ring`, relative to `root`: what vitest.config.ts leaves out of this process and vitest.box.config.ts runs in workerd. */
export function testFilesOfRing(root: string, ring: string, dir = "test"): string[] {
  return readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".test.ts") && !f.split(path.sep).includes("fixtures"))
    .map((f) => path.join(dir, f).split(path.sep).join("/"))
    .filter((f) => ringOf(path.join(root, f)) === ring)
    .sort();
}

export default class RingsReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const counts = new Map<string, { files: number; passed: number; names: string[]; pools: Set<string> }>();
    for (const ring of RINGS) counts.set(ring, { files: 0, passed: 0, names: [], pools: new Set() });
    for (const m of modules) {
      const ring = ringOf(m.moduleId);
      const c = counts.get(ring) ?? { files: 0, passed: 0, names: [], pools: new Set() };
      c.files++;
      if (m.state() === "passed") c.passed++;
      c.names.push(path.relative(process.cwd(), m.moduleId));
      c.pools.add(String(m.project.config.pool));
      counts.set(ring, c);
    }
    const parts = [...counts].map(([ring, c]) => {
      const said = `${ring} ${c.files} files (${c.passed} passed)`;
      return ring === "box" ? `${said} in ${[...c.pools].join(", ") || "no pool"}: ${c.names.sort().join(" ")}` : said;
    });
    process.stdout.write(`\nrings: ${parts.join(", ")}\n`);
  }
}
