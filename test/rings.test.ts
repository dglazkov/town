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
// both projects, so a selector that dropped a ring fails here. The ladder:
// `pnpm test --list`'s rings and `pnpm hermetic --list`'s, each read as it
// prints and checked against the RINGS it prints from, name a ring once,
// share none, and are the inner and the outer rings of the ladder block in
// docs/projects/tent/design.md that are built, read from the design; the
// ladder's package and machine rings, crate's and yard's, are in neither
// list, so a ring built without the ladder saying so fails, and so does a
// ladder ring dropped from a list.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { RINGS, ringOf, testFilesOfRing } from "../scripts/rings-reporter.js";

const HERMETIC = path.resolve(import.meta.dirname, "../scripts/hermetic.mjs");
const { RINGS: OUTER }: { RINGS: [string, string][] } = await import(HERMETIC as string);

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

/** The ladder block under "## The ladder in town": each ring's name, the half it stands in, and the project its line ends on, when one does. */
function ladder(): { ring: string; half: "inner" | "outer"; project: string | null }[] {
  const design = readFileSync(path.join(ROOT, "docs/projects/tent/design.md"), "utf8");
  const at = design.indexOf("\n## The ladder in town\n");
  expect(at, "design.md has the ladder").toBeGreaterThan(-1);
  const block = /\n```\n([^]*?)\n```\n/.exec(design.slice(at))?.[1] ?? "";
  const rungs: { ring: string; half: "inner" | "outer"; project: string | null }[] = [];
  let half: "inner" | "outer" | null = null;
  for (const line of block.split("\n")) {
    const header = /^ +the (inner|outer) rings, pnpm (test|hermetic) --ring <name>$/.exec(line);
    if (header) {
      half = header[1] as "inner" | "outer";
      expect(header[2]).toBe(half === "inner" ? "test" : "hermetic");
      continue;
    }
    const rung = /^ {3}([a-z]+) {2,}(.*?)(?: {2,}([a-z]+))?$/.exec(line);
    if (rung) {
      expect(half, `${rung[1]} stands under a half`).not.toBeNull();
      rungs.push({ ring: rung[1]!, half: half!, project: rung[3] ?? null });
    }
  }
  return rungs;
}

it("pnpm test --list and pnpm hermetic --list are the ladder: each ring named once, no ring in both, and together every ring the design's ladder has built", () => {
  // Each list as it prints, a ring at the start of a line; each runs nothing, and the printed rings are the exported ones.
  const listed = (script: string, ring: RegExp) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, script), "--list"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, CLOUDFLARE_API_TOKEN: "" } });
    expect(r.status, `${script} --list: ${r.stderr}`).toBe(0);
    return r.stdout.split("\n").flatMap((line) => ring.exec(line)?.[1] ?? []);
  };
  const inner = listed("scripts/test.mjs", /^([a-z]+): /);
  const outer = listed("scripts/hermetic.mjs", /^([a-z]+) +needs /);
  expect(inner).toEqual([...RINGS]);
  expect(outer).toEqual(OUTER.map(([ring]) => ring));
  expect(new Set(inner).size, "pnpm test --list names each ring once").toBe(inner.length);
  expect(new Set(outer).size, "pnpm hermetic --list names each ring once").toBe(outer.length);
  expect(inner.filter((r) => outer.includes(r)), "the two lists share no ring").toEqual([]);

  const rungs = ladder();
  expect(rungs.map((r) => r.ring)).toEqual(["checkout", "command", "box", "account", "agent", "package", "machine"]);
  // Not built: the ladder's own word for whose they are.
  const unbuilt: Record<string, string> = { package: "crate", machine: "yard" };
  for (const [ring, project] of Object.entries(unbuilt)) {
    expect(rungs.find((r) => r.ring === ring)?.project, `the ladder gives ${ring} to ${project}`).toBe(project);
    expect(inner, ring).not.toContain(ring);
    expect(outer, ring).not.toContain(ring);
  }
  const built = rungs.filter((r) => !(r.ring in unbuilt));
  expect(inner, "pnpm test --list is the ladder's inner rings").toEqual(built.filter((r) => r.half === "inner").map((r) => r.ring));
  expect(outer, "pnpm hermetic --list is the ladder's outer rings that are built").toEqual(built.filter((r) => r.half === "outer").map((r) => r.ring));
  expect([...inner, ...outer].sort(), "the union misses none of the ladder's built rings and adds none").toEqual(built.map((r) => r.ring).sort());
});
