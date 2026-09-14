// ring: checkout
// The conductor's brief: `.claude/skills/conduct/brief.sh` against the
// fixture project under test/fixtures/baton-project/, a <project> holding a
// "/" being the project's directory. The brief for baton-project phase 1 is
// the fixture's own text, section by section, byte for byte where the design
// says verbatim, in journey 1 step 1's order: the first line with the date
// and the commit; the ⚑ step; the phase; journeys 2 and 1 whole, in the
// order the **Closes:** paragraph names them across its line break; the names
// table and the heading map; phase 0's finding and Open, then the roster;
// AGENTS.md and the rules paragraph; the owned paths; and the tail, pinned
// here as the skill's §1 quoted it at 5a69c92, which the skill now names
// brief.sh as the home of and quotes no longer. Phase 0 is refused as
// CLOSED and briefed with --any; a journey the phase names and journey.md
// lacks is exit 1 with nothing written; a phase not there is exit 2. The
// selector, scripts/test.mjs, is tested by what runs nothing: `--list`
// prints each ring, what it needs, and testFilesOfRing's files for it, all
// three or the one named, and `--watch` with another ring is one line of
// refusal; test/rings.test.ts reads the rest of its ring handling. The
// mutation, scripts/mutate.mjs, is tested against a copy of
// test/fixtures/baton-mutant.txt and a `node -e` command: killed, survived,
// the count refused, SIGINT, a restore that fails, and its source read for
// the word git.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RINGS, testFilesOfRing } from "../scripts/rings-reporter.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const BRIEF = path.join(ROOT, ".claude/skills/conduct/brief.sh");
const SKILL = path.join(ROOT, ".claude/skills/conduct/SKILL.md");
const FIXTURE = path.join(ROOT, "test/fixtures/baton-project");
const REL = "test/fixtures/baton-project";
const SELECTOR = path.join(ROOT, "scripts/test.mjs");

// The tail, copied from the conduct skill's §1 at 5a69c92, after its
// "Files under <paths the phase names>." sentence.
const TAIL = `Nothing under docs/projects/: the
conductor writes the record. Nothing under vendor/ or any vendored
dependency unless the phase says that is the work. No other project's
code.

## Where you stop
- At each ⚑ step without a yes above: build up to it, report.
- When the proof would need a facade: something that passes the named
  test but is not the thing (a fixture that cannot fail, a shim that
  answers the test's question and no other). Stop and say so; that is a
  finding, not a failure.
- When the design turns out wrong: stop, say what you found and what
  you would change. The conductor changes the design, not you.

## What you return
1. What was built: files, and one paragraph of how it works.
2. The proof, as exact commands from the repo root, with the output you
   saw, exit codes included. Not "tests pass": the command and the line
   that says so.
3. What you could not do and why, and where you stopped.
4. Candidate findings: dated one-liners, one claim each, about forty
   words. The conductor keeps, rewrites, or drops them.
5. Anything a later phase should know that the docs do not say.
`;

function brief(...args: string[]) {
  const r = spawnSync("bash", [BRIEF, ...args], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Lines <from> to <to> of a fixture file, 1-based and inclusive, checked to
// start where the test thinks they do.
function lines(file: string, from: number, to: number, starts: string): string {
  const text = readFileSync(path.join(FIXTURE, file), "utf8").split("\n").slice(from - 1, to).join("\n");
  expect(text.startsWith(starts), `${file}:${from} starts with ${starts}`).toBe(true);
  return text;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function head(): string {
  return spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
}

// Split a brief at its own top-level headings, in the order given; each
// section's text runs to the line before the next.
function sections(text: string, headings: string[]): string[] {
  const at = headings.map((h) => text.indexOf(`\n${h}\n`));
  at.forEach((i, k) => expect(i, `the brief has "${headings[k]}"`).toBeGreaterThan(-1));
  for (let k = 1; k < at.length; k++) expect(at[k]!, `"${headings[k]}" follows "${headings[k - 1]}"`).toBeGreaterThan(at[k - 1]!);
  return at.map((i, k) => text.slice(i + 1, k + 1 < at.length ? at[k + 1]! + 1 : text.length));
}

it("the brief for a fixture phase is the fixture's own text, section by section, in journey 1 step 1's order", () => {
  const r = brief(FIXTURE, "1");
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);

  const design = path.join(FIXTURE, "design.md");
  const expected: [string, string][] = [
    ["# baton-project phase 1: The tail", `# baton-project phase 1: The tail — briefed ${today()} at ${head()}\n\n`],
    [
      "## Asked before the phase starts",
      "## Asked before the phase starts\n\nThe ⚑ steps of this phase, asked out loud with the price before it starts:\n\n" +
        lines("phases.md", 44, 45, "**⚑ provision:**") + "\n\n",
    ],
    [`## The phase (${REL}/phases.md, verbatim)`, `## The phase (${REL}/phases.md, verbatim)\n\n` + lines("phases.md", 39, 55, "## Phase 1: The tail") + "\n\n"],
    [
      `## The journeys it closes (${REL}/journey.md, verbatim)`,
      `## The journeys it closes (${REL}/journey.md, verbatim)\n\n` +
        lines("journey.md", 24, 34, "## Journey 2:") + "\n\n" + lines("journey.md", 12, 22, "## Journey 1:") + "\n\n",
    ],
    [
      `## The mechanism (${REL}/design.md)`,
      `## The mechanism (${REL}/design.md)\n\nThe names, verbatim:\n\n` + lines("design.md", 7, 10, "| Word |") +
        "\n\nEvery heading, to read by path:\n\n```\n" +
        `sed -n '1,29p' ${design}  # # Kite — the design\n` +
        `sed -n '5,13p' ${design}  # ## The names\n` +
        `sed -n '14,26p' ${design}  # ## The string\n` +
        `sed -n '23,26p' ${design}  # ### The knot\n` +
        `sed -n '27,29p' ${design}  # ## The tail\n` +
        "```\n\n",
    ],
    [
      "## Findings so far that bind you",
      "## Findings so far that bind you\n\nEvery finding of every earlier phase, verbatim:\n\n### baton-project phase 0: The string\n\n" +
        lines("phases.md", 31, 35, "- **2026-09-13 — The string") +
        `\n\nThe Open roster, every Open in ${REL}/phases.md:\n\n` + lines("phases.md", 34, 35, "- **2026-09-13 — Open:") + "\n\n",
    ],
    [
      "## House rules",
      "## House rules\n\n" + readFileSync(path.join(ROOT, "AGENTS.md"), "utf8") +
        `\nThe project's own rules (${REL}/phases.md, verbatim):\n\n` + lines("phases.md", 1, 10, "# Kite:") + "\n\n",
    ],
    [
      "## What you own",
      "## What you own\n\n" +
        ["src/tail.ts", "src/string.ts", "scripts/fly.mjs", "test/tail.test.ts", "test/fixtures/knots/", ".claude/skills/fly/SKILL.md", "docs/drafts/kite.md"]
          .map((p) => `- \`${p}\``).join("\n") + "\n\n" + TAIL,
    ],
  ];

  expect(r.stdout.startsWith(expected[0]![1]), "the first line names the project, the phase, the date, and the commit").toBe(true);
  const bodies = sections(r.stdout, expected.slice(1).map(([h]) => h));
  bodies.forEach((body, k) => expect(body, expected[k + 1]![0]).toBe(expected[k + 1]![1]));
  expect(r.stdout).toBe(expected.map(([, body]) => body).join(""));
  expect(r.stdout.endsWith(`\n\n${TAIL}`), "the tail is the skill's, byte for byte").toBe(true);
});

it("a phase whose status is CLOSED is refused with the word, exit 1, and --any writes its brief anyway", () => {
  const refused = brief(FIXTURE, "0");
  expect(refused.code).toBe(1);
  expect(refused.stdout).toBe("");
  expect(refused.stderr).toMatch(/^CLOSED: baton-project phase 0 is CLOSED/);
  expect(refused.stderr).toContain("--any");

  const any = brief("--any", FIXTURE, "0");
  expect(any.stderr).toBe("");
  expect(any.code).toBe(0);
  expect(any.stdout.split("\n")[0]).toBe(`# baton-project phase 0: The string — briefed ${today()} at ${head()}`);
  expect(any.stdout).toContain("before it starts:\n\nnone\n\n## The phase");
  expect(any.stdout).toContain(`verbatim)\n\n${lines("journey.md", 12, 22, "## Journey 1:")}\n\n## The mechanism`);
  expect(any.stdout).not.toContain("## Journey 2:");
  expect(any.stdout).toContain("verbatim:\n\nnone: no phase before baton-project phase 0 has a finding\n\nThe Open roster");
  expect(any.stdout).toContain("## What you own\n\n- `src/string.ts`\n\n" + TAIL);
});

it("a journey the phase names and journey.md lacks is exit 1 naming it, and no brief is written", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "baton-"));
  try {
    const project = path.join(dir, "baton-project");
    cpSync(FIXTURE, project, { recursive: true });
    const phases = path.join(project, "phases.md");
    const text = readFileSync(phases, "utf8");
    expect(text).toContain("**Closes:** journey 2 steps 1 to 3");
    writeFileSync(phases, text.replace("**Closes:** journey 2 steps 1 to 3", "**Closes:** journey 7 steps 1 to 3"));
    const r = brief(project, "1");
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("journey 7");
    expect(r.stderr).toContain(path.join(project, "journey.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("a phase that is not in phases.md is exit 2 naming the file", () => {
  const r = brief(FIXTURE, "9");
  expect(r.code).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain(path.join(FIXTURE, "phases.md"));
});

it("the tail lives in brief.sh: the skill's §1 names it in one sentence and quotes it no longer", () => {
  const skill = readFileSync(SKILL, "utf8");
  const start = skill.indexOf("\n## 1. Brief\n");
  const end = skill.indexOf("\n## 2. Verify\n");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const one = skill.slice(start, end);
  expect(one.replace(/\s+/g, " ")).toContain(
    "The tail, what the subagent owns, where it stops, and what it returns, is `brief.sh`'s, and this skill no longer quotes it.",
  );
  for (const quoted of ["## Where you stop", "## What you return", "Nothing under docs/projects/: the", "Candidate findings"]) {
    expect(skill, quoted).not.toContain(quoted);
  }
  expect(readFileSync(BRIEF, "utf8")).toContain(TAIL);
  expect(skill.slice(skill.indexOf("\n## 0. Orient\n"), start)).toContain(".claude/skills/conduct/brief.sh <project> <N>");
});

function selector(...args: string[]) {
  const r = spawnSync(process.execPath, [SELECTOR, ...args], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

it("pnpm test --list prints each ring, what it needs, and its files, and builds and runs nothing; --ring names one", () => {
  const needs: Record<string, string> = {
    checkout: "this process and the modules under src/, nothing built",
    command: "the built binaries, dist/ no older than src/, each against a townd serve of its own",
    box: "workerd, through the vitest pool over wrangler.jsonc, no account and no network",
  };
  const block = (ring: string) => {
    const files = testFilesOfRing(ROOT, ring);
    expect(files.length, `ring ${ring} has files`).toBeGreaterThan(0);
    return `${ring}: ${needs[ring]}; ${files.length} files\n` + files.map((f) => `  ${f}\n`).join("");
  };

  const all = selector("--list");
  expect(all.stderr).toBe("");
  expect(all.code).toBe(0);
  expect(all.stdout, "the three rings in order, and not a line of a build or a run").toBe(RINGS.map(block).join(""));

  for (const ring of RINGS) {
    const one = selector("--list", "--ring", ring);
    expect(one.code, ring).toBe(0);
    expect(one.stdout, ring).toBe(block(ring));
  }
  expect(selector("--list", "--ring", "box,checkout").stdout).toBe(block("checkout") + block("box"));
});

it("pnpm test --watch with the command or box ring refuses in one line saying why, and a ring not there is refused by name", () => {
  const command = selector("--watch", "--ring", "command");
  expect(command.code).toBe(2);
  expect(command.stdout).toBe("");
  expect(command.stderr).toBe("--watch watches the checkout ring alone: the command ring runs dist/ as it was built before the watch began, so a watch would rerun yesterday's build\n");
  const box = selector("--watch", "--ring", "box");
  expect(box.code).toBe(2);
  expect(box.stderr.trimEnd().split("\n")).toHaveLength(1);
  expect(box.stderr).toMatch(/^--watch watches the checkout ring alone: the box ring/);
  const nope = selector("--ring", "checkout,nope");
  expect(nope.code).toBe(2);
  expect(nope.stderr).toBe('no ring "nope": the rings are checkout, command, box\n');
});

// The mutation, scripts/mutate.mjs, run by plain node on a copy of
// test/fixtures/baton-mutant.txt in a directory of the test's own, with
// TMPDIR a second directory so the backup's path is known and its removal
// seen. The command is `node -e` that prints the line it read and the
// file's mtime, then exits 1 when "at dusk" is gone from it: a mutation to
// "at dawn" is killed, one that keeps "at dusk" and adds a comment survives.
// Journey 2's four steps, each with the file's bytes after.

const MUTATE = path.join(ROOT, "scripts/mutate.mjs");
const MUTANT = path.join(ROOT, "test/fixtures/baton-mutant.txt");
const FROM = "counts the flock at dusk";
const CHECK =
  'const fs = require("fs"); const t = fs.readFileSync(process.argv[1], "utf8"); ' +
  'console.log("the command read: " + t.split("\\n")[3]); console.log("mtime " + fs.statSync(process.argv[1]).mtimeMs); ' +
  'process.exit(t.includes("at dusk") ? 0 : 1)';

function mutantScratch() {
  const dir = mkdtempSync(path.join(tmpdir(), "baton-mutant-"));
  const tmp = path.join(dir, "tmp");
  mkdirSync(tmp);
  const target = path.join(dir, "baton-mutant.txt");
  writeFileSync(target, readFileSync(MUTANT));
  return { dir, tmp, target, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function mutate(tmp: string, args: string[]) {
  const r = spawnSync(process.execPath, [MUTATE, ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, TMPDIR: tmp } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

it("mutate.mjs: a mutation the command catches prints the backup first, the command's output, the file put back, and `mutation killed by`, exit 0", () => {
  const s = mutantScratch();
  try {
    const command = [process.execPath, "-e", CHECK, s.target];
    const r = mutate(s.tmp, [s.target, "--from", FROM, "--to", "counts the flock at dawn", "--", ...command]);
    expect(r.stderr).toBe("");
    const out = r.stdout.trimEnd().split("\n");
    expect(out[0]).toMatch(/^backup: /);
    const backup = out[0]!.slice("backup: ".length);
    expect(path.dirname(path.dirname(backup)), "the backup is in a directory of its own under the temporary directory").toBe(s.tmp);
    expect(out[1], "the command ran against the mutated file, its output on mutate's stdout").toBe(
      "the command read: The shepherd counts the flock at dawn — every one of them.",
    );
    expect(out[3]).toBe(`mutation killed by ${command.join(" ")} (exit 1)`);
    expect(out).toHaveLength(4);
    expect(r.code).toBe(0);
    expect(readFileSync(s.target).equals(readFileSync(MUTANT)), "the file's bytes are the fixture's").toBe(true);
    expect(readdirSync(s.tmp), "the backup is removed").toEqual([]);
    expect(readdirSync(s.dir).sort(), "no other file was written").toEqual(["baton-mutant.txt", "tmp"]);
    const mutated = Number(out[2]!.slice("mtime ".length));
    expect(statSync(s.target).mtimeMs, "the restore takes a new mtime, later than the mutation's, so a build of the mutation reads stale").toBeGreaterThan(mutated);
  } finally {
    s.done();
  }
});

it("mutate.mjs: a mutation the command does not catch ends on `mutation survived`, exit 1, the file put back all the same", () => {
  const s = mutantScratch();
  try {
    const command = [process.execPath, "-e", CHECK, s.target];
    const r = mutate(s.tmp, [s.target, "--from", FROM, "--to", `${FROM} /* a comment */`, "--", ...command]);
    expect(r.stderr).toBe("");
    const out = r.stdout.trimEnd().split("\n");
    expect(out[0]).toMatch(new RegExp(`^backup: ${s.tmp}/mutate-[^/]+/baton-mutant\\.txt$`));
    expect(out[1]).toBe("the command read: The shepherd counts the flock at dusk /* a comment */ — every one of them.");
    expect(out[3]).toBe(`mutation survived ${command.join(" ")} (exit 0)`);
    expect(r.code).toBe(1);
    expect(readFileSync(s.target).equals(readFileSync(MUTANT))).toBe(true);
    expect(readdirSync(s.tmp)).toEqual([]);
  } finally {
    s.done();
  }
});

it("mutate.mjs: a --from that occurs twice, or not at all, is refused with the count before any copy, exit 2", () => {
  const s = mutantScratch();
  try {
    for (const [from, count] of [["gate on the", 2], ["at noon", 0]] as const) {
      const r = mutate(s.tmp, [s.target, "--from", from, "--to", "a wall", "--", process.execPath, "-e", CHECK, s.target]);
      expect(r.code, from).toBe(2);
      expect(r.stdout, "no backup line, and the command never ran").toBe("");
      expect(r.stderr).toBe(`"${from}" occurs ${count} times in ${s.target}, not once; nothing was copied or changed\n`);
      expect(readdirSync(s.tmp), "no backup was made").toEqual([]);
      expect(readFileSync(s.target).equals(readFileSync(MUTANT))).toBe(true);
    }
  } finally {
    s.done();
  }
});

it.each([
  ["to mutate.mjs alone, the command still running", false],
  ["to the process group, as ^C at a terminal, the command stopping too", true],
])("mutate.mjs: SIGINT %s puts the file back, removes the backup, and exits 130", async (_, group) => {
  const s = mutantScratch();
  try {
    const hold = 'const t = require("fs").readFileSync(process.argv[1], "utf8"); console.log("running on: " + t.split("\\n")[3]); setTimeout(() => {}, 60000)';
    const p = spawn(process.execPath, [MUTATE, s.target, "--from", FROM, "--to", "counts the flock at dawn", "--", process.execPath, "-e", hold, s.target], {
      cwd: ROOT,
      env: { ...process.env, TMPDIR: s.tmp },
      detached: group,
    });
    let stdout = "";
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    const closed = new Promise<number | null>((resolve) => p.on("close", (code) => resolve(code)));
    await new Promise<void>((resolve) =>
      p.stdout.on("data", (d) => {
        stdout += d;
        if (stdout.includes("running on: ")) resolve();
      }),
    );
    expect(stdout).toContain("running on: The shepherd counts the flock at dawn");
    expect(readFileSync(s.target).equals(readFileSync(MUTANT)), "the mutation is in place while the command runs").toBe(false);
    process.kill(group ? -p.pid! : p.pid!, "SIGINT");
    const code = await closed;
    expect(stderr).toBe("");
    expect(code).toBe(130);
    expect(stdout.trimEnd().split("\n").at(-1)).toMatch(/^mutation interrupted/);
    expect(readFileSync(s.target).equals(readFileSync(MUTANT)), "the file's bytes are the fixture's").toBe(true);
    expect(readdirSync(s.tmp), "the backup is removed").toEqual([]);
  } finally {
    s.done();
  }
});

it("mutate.mjs: a restore that fails is exit 3, the backup kept and its path in the last line", () => {
  const s = mutantScratch();
  try {
    const clobber = 'const fs = require("fs"); fs.rmSync(process.argv[1]); fs.mkdirSync(process.argv[1])';
    const r = mutate(s.tmp, [s.target, "--from", FROM, "--to", "counts the flock at dawn", "--", process.execPath, "-e", clobber, s.target]);
    expect(r.code).toBe(3);
    const backup = r.stdout.split("\n")[0]!.slice("backup: ".length);
    expect(r.stdout).toBe(`backup: ${backup}\n`);
    expect(r.stderr.trimEnd().split("\n").at(-1)).toBe(`${s.target} may still hold the mutation; its original is at ${backup}`);
    expect(r.stderr).toMatch(/^restore failed: .*EISDIR/);
    expect(readFileSync(backup).equals(readFileSync(MUTANT)), "the backup holds the original bytes").toBe(true);
  } finally {
    s.done();
  }
});

it("mutate.mjs contains no invocation of git: the word appears nowhere in its source, comments included", () => {
  const source = readFileSync(MUTATE, "utf8");
  expect(source).toContain("spawn(");
  expect(source.match(/\bgit\b/gi)).toBeNull();
});
