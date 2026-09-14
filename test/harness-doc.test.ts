// ring: checkout
// Road's journey 1, its third criterion: the contract and conformance cite
// each other. Every numbered section of docs/harness.md, `## §<n>. …`,
// numbered from 1 without a gap, is cited by at least one check that
// `node scripts/conform.mjs --list` prints, and every check cites a
// section that exists. --list builds nothing and starts no town.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

function sections(): number[] {
  const doc = readFileSync(path.join(ROOT, "docs/harness.md"), "utf8");
  return [...doc.matchAll(/^## §(\d+)\. \S/gm)].map((m) => Number(m[1]));
}

function checks(): Array<{ name: string; section: number }> {
  // A temporary directory of its own, so a conformance run elsewhere in the suite is not counted against --list.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "town-harness-doc-"));
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/conform.mjs"), "--list"], { encoding: "utf8", timeout: 10_000, env: { ...process.env, TMPDIR: tmp } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe("");
    expect(readdirSync(tmp), "--list made a directory").toEqual([]);
    return parseList(r.stdout);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function parseList(stdout: string): Array<{ name: string; section: number }> {
  const lines = stdout.trim().split("\n");
  return lines.map((l) => {
    const m = /^(\S+) \(§(\d+)\) {2,}\S/.exec(l);
    expect(m, `a line --list printed: ${l}`).not.toBeNull();
    return { name: m![1]!, section: Number(m![2]) };
  });
}

it("docs/harness.md numbers its sections from 1 without a gap", () => {
  const ns = sections();
  expect(ns.length).toBeGreaterThan(5);
  expect(ns).toEqual(ns.map((_, i) => i + 1));
});

it("every section of the contract is cited by a check, and every check cites a section that exists", () => {
  const ns = sections();
  const cs = checks();
  expect(new Set(cs.map((c) => c.name)).size, "check names are unique").toBe(cs.length);
  for (const c of cs) expect(ns, `${c.name} cites §${c.section}`).toContain(c.section);
  for (const n of ns) expect(cs.filter((c) => c.section === n).map((c) => c.name), `§${n} is cited by no check`).not.toEqual([]);
});
