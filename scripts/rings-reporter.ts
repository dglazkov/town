// The last line of `pnpm test`: how many test files of each ring this run
// actually ran and passed, read from each file's `// ring:` header. A
// file with no header counts as `unmarked`, and test/rings.test.ts fails it.

import { readFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";

const RINGS = ["checkout", "command"] as const;

export function ringOf(file: string): string {
  const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
  return /^\/\/ ring: (checkout|command)$/.exec(first)?.[1] ?? "unmarked";
}

export default class RingsReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const counts = new Map<string, { files: number; passed: number }>();
    for (const ring of RINGS) counts.set(ring, { files: 0, passed: 0 });
    for (const m of modules) {
      const ring = ringOf(m.moduleId);
      const c = counts.get(ring) ?? { files: 0, passed: 0 };
      c.files++;
      if (m.state() === "passed") c.passed++;
      counts.set(ring, c);
    }
    const parts = [...counts].map(([ring, c]) => `${ring} ${c.files} files (${c.passed} passed)`);
    process.stdout.write(`\nrings: ${parts.join(", ")}\n`);
  }
}
