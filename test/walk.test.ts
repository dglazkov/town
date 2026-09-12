// ring: command
// The walk's stage without the agent: scripts/walk.mjs makes a town, a
// grant, an agent's directory, and a shim holding `town` alone; the
// sentence it hands the conductor is README's and SKILL.md's; `--status`
// counts the audit by result; `--teardown` leaves no process and no
// directory. `--shop github` refuses, before any town or directory
// exists, a missing or malformed repo and a stdin with no token; it is
// not run as far as `shop add`, which reaches GitHub. `--search` finds a
// planted value in a file named as the database's WAL, and none in a
// clean directory, and never prints it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ROOT, assertBuilt, cleanEnv, cleanup, tmp, type Ran } from "./helpers/town.js";

const WALK = path.join(ROOT, "scripts/walk.mjs");
const tmpdir = tmp("walk-tmpdir");
const home = tmp("walk-home");
const env = cleanEnv(home, { TMPDIR: tmpdir });
let pid: number | undefined;

beforeAll(() => assertBuilt());

afterAll(() => {
  if (pid !== undefined && alive(pid)) process.kill(pid, "SIGKILL");
  cleanup(tmpdir, home);
});

function alive(p: number): boolean {
  try {
    process.kill(p, 0);
    return true;
  } catch {
    return false;
  }
}

function walk(...args: string[]): Ran {
  const r = spawnSync(process.execPath, [WALK, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

/** The walk script with `input` piped to it through a shell pipe, as `walk.mjs … < <token file>` gives it. */
function walkPiped(input: string, ...args: string[]): Ran {
  const r = spawnSync("/bin/sh", ["-c", 'printf %s "$WALK_TEST_INPUT" | "$0" "$@"', process.execPath, WALK, ...args], {
    env: { ...env, WALK_TEST_INPUT: input },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

const roots = () => readdirSync(tmpdir).filter((e) => e.startsWith("town-walk-"));

it("sets the stage, reports the audit, and strikes it", () => {
  const up = walk();
  expect(up.exit, up.stderr).toBe(0);
  const root = /^walk ready: (.+)$/m.exec(up.stdout)![1]!;
  expect(path.dirname(root)).toBe(tmpdir);
  const w = JSON.parse(readFileSync(path.join(root, "walk.json"), "utf8"));
  pid = w.pid as number;
  expect(alive(pid)).toBe(true);

  // The sentence is README's blockquote, and SKILL.md is that sentence and nothing else.
  expect(w.sentence).toBe("There is a `town` command, and `town --help` says what it can do.");
  expect(readFileSync(path.join(ROOT, "SKILL.md"), "utf8")).toBe(`${w.sentence}\n`);
  expect(up.stdout).toContain(w.sentence);
  expect(up.stdout).toContain(`export PATH="${w.shim}:$PATH"`);
  expect(up.stdout).toContain(`export TOWN_DATA=${w.data}`);

  // The agent's side: data outside the agent's directory, `town` alone in the shim.
  expect(readdirSync(w.shim)).toEqual(["town"]);
  expect(path.relative(w.agent, w.data).startsWith("..")).toBe(true);
  const agentEnv = { ...env, PATH: `${w.shim}:/usr/bin:/bin` };
  const town = (...args: string[]) => spawnSync("town", args, { cwd: w.agent, env: agentEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  expect(spawnSync("/bin/sh", ["-c", "command -v townd"], { env: agentEnv }).status).not.toBe(0);
  const help = town("--help");
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toMatch(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/m);
  expect(town("memory", "remember", "--key", "notes/walk", "--value", "set").status).toBe(0);
  expect(town("memory", "recall", "--key", "notes/walk").stdout).toBe("set\n");
  expect(town("memory", "forget", "--key", "notes/walk").status).toBe(2);

  const status = walk("--status", root);
  expect(status.exit, status.stderr).toBe(0);
  expect(status.stdout).toMatch(/^rows: 4; ok 3, denied 1$/m);
  expect(status.stdout).toMatch(/^credentials: none served$/m);
  expect(status.stdout).toMatch(/^rows for town\/memory with no credential served: 3; ok 2, denied 1$/m);

  expect(walk("--teardown", tmpdir).exit).toBe(1);
  const down = walk("--teardown", root);
  expect(down.exit, down.stderr).toBe(0);
  expect(alive(pid)).toBe(false);
  expect(existsSync(root)).toBe(false);
}, 60_000);

it("refuses --shop github with no repo, a malformed repo, or no token on stdin, one line each and no walk root left", () => {
  const before = roots();
  const refused = [
    walk("--shop", "github"),
    walk("--shop", "github", "--repo", "owner/../../user"),
    walk("--shop", "github", "--repo", "just-a-name"),
    walk("--shop", "github", "--repo", "octo/hello"),
    walkPiped("", "--shop", "github", "--repo", "octo/hello"),
    walkPiped("\n", "--shop", "github", "--repo", "octo/hello"),
    walkPiped("tok_never_used", "--shop", "gitlab", "--repo", "octo/hello"),
  ];
  for (const r of refused) {
    expect(r.exit, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/^walk: [^\n]+\n$/);
  }
  expect(refused[0]!.stderr).toContain("--repo");
  expect(refused[1]!.stderr).not.toContain("user");
  expect(refused[3]!.stderr).toContain("stdin");
  expect(roots()).toEqual(before);
}, 60_000);

it("--search finds the value in a file named as the WAL and prints the file, never the value; a clean directory finds none", () => {
  const VALUE = "github_pat_planted_for_the_search_test_0123456789";
  const dirty = mkdtempSync(path.join(tmpdir, "search-dirty-"));
  mkdirSync(path.join(dirty, "data"));
  writeFileSync(path.join(dirty, "data", "town.db"), "nothing here");
  writeFileSync(path.join(dirty, "data", "town.db-wal"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(VALUE), Buffer.from([0]), Buffer.from(VALUE)]));
  const transcript = path.join(mkdtempSync(path.join(tmpdir, "transcript-")), "session.jsonl");
  writeFileSync(transcript, '{"said":"nothing secret"}\n');

  const found = walkPiped(`${VALUE}\n`, "--search", dirty, transcript);
  expect(found.exit, found.stderr).toBe(1);
  expect(found.stdout).toBe(`2 ${path.join(dirty, "data", "town.db-wal")}\nfound in 1 files\n`);
  expect(found.stdout + found.stderr).not.toContain(VALUE);

  const clean = mkdtempSync(path.join(tmpdir, "search-clean-"));
  writeFileSync(path.join(clean, "town.db-wal"), "nothing here either");
  const none = walkPiped(VALUE, "--search", clean, transcript);
  expect(none.exit, none.stderr).toBe(0);
  expect(none.stdout).toBe("found in 0 files\n");

  expect(walkPiped(VALUE, "--search", clean, path.join(clean, "no-such-transcript")).exit).toBe(2);
  expect(walk("--search", clean).exit).toBe(2);
  cleanup(dirty, clean, path.dirname(transcript));
}, 60_000);
