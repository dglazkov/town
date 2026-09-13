// ring: checkout
// The trip wire of AGENTS.md's one-noun rule: every file under src/ is
// under the limit, or is named in the ratchet with the count it had when
// it was named, which may only shrink. A phase that would grow a named
// file past its count splits it first; a file that gets under the limit
// leaves the ratchet, so the table never holds a stale entry.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../src");

/** The most lines a file under src/ may hold before it must be split. */
export const LIMIT = 600;

/** The files over the limit when the wire was set, each with the count it had then. Shrink or remove; never grow or add. */
const RATCHET: Record<string, number> = {
  "admin.ts": 720,
  "store.ts": 829,
};

/** Lines as `wc -l` counts them: newlines. */
const lines = (file: string) => (readFileSync(path.join(SRC, file), "utf8").match(/\n/g) ?? []).length;
const files = () => readdirSync(SRC).filter((f) => f.endsWith(".ts"));

it("every file under src/ is under the limit, or no longer than its ratchet", () => {
  for (const f of files()) {
    const n = lines(f);
    const allowed = RATCHET[f] ?? LIMIT;
    expect(n, `src/${f} is ${n} lines; the wire is ${allowed}. Split it along its nouns first (AGENTS.md).`).toBeLessThanOrEqual(allowed);
  }
});

it("the ratchet names only files that exist and are still over the limit", () => {
  const present = files();
  for (const [f, n] of Object.entries(RATCHET)) {
    expect(present, `src/${f} is in the ratchet and not in src/`).toContain(f);
    expect(n, `src/${f}'s ratchet is ${n}, under the limit; drop it from the ratchet`).toBeGreaterThan(LIMIT);
    expect(lines(f), `src/${f} is under the limit now; drop it from the ratchet`).toBeGreaterThan(LIMIT);
  }
});
