// ring: command
// The walk's stage without the agent: scripts/walk.mjs makes a town, a
// grant, an agent's directory, and a shim holding `town` alone; the
// sentence it hands the conductor is README's and SKILL.md's; `--status`
// counts the audit by result and prints it as a tree by parent, a shop's
// calls under the call they served; `--teardown` leaves no process and no
// directory. `--shop github` and `--shop watch` refuse, before any town or
// directory exists, a missing or malformed repo and a stdin with no token;
// neither is run as far as `shop add`, which reaches GitHub. `--search` finds a
// planted value in a file named as the database's WAL, and none in a
// clean directory, and never prints it. `--shop hall` sets the hall's
// stage with no token, and `--status` counts the hall's rows by command
// and detail and the pass's grants by source. `--status` counts the rows
// by wall, and the stage names the wall the town's shops run within.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ROOT, agent, assertBuilt, cleanEnv, cleanup, serve, tmp, type Ran, type Town } from "./helpers/town.js";

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
  expect(up.stdout).toMatch(/^the town: {4}http:\/\/127\.0\.0\.1:\d+ \(pid \d+\), pass pass_[0-9a-f]+, shops walled by seatbelt$/m);
  expect(w.wall).toBe("seatbelt");

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
  // The town the walk starts passes no --wall, so on a Mac every call whose process ran is walled; the denied one ran none.
  expect(status.stdout).toMatch(/^rows by wall: seatbelt 2, - 2$/m);
  expect(status.stdout).toMatch(/^credentials: none served$/m);
  expect(status.stdout).toMatch(/^rows for town\/memory with no credential served: 3; ok 2, denied 1$/m);

  expect(walk("--teardown", tmpdir).exit).toBe(1);
  const down = walk("--teardown", root);
  expect(down.exit, down.stderr).toBe(0);
  expect(alive(pid)).toBe(false);
  expect(existsSync(root)).toBe(false);
}, 60_000);

it.each(["github", "watch"])("refuses --shop %s with no repo, a malformed repo, or no token on stdin, one line each and no walk root left", (shop) => {
  const before = roots();
  const refused = [
    walk("--shop", shop),
    walk("--shop", shop, "--repo", "owner/../../user"),
    walk("--shop", shop, "--repo", "just-a-name"),
    walk("--shop", shop, "--repo", "octo/hello"),
    walkPiped("", "--shop", shop, "--repo", "octo/hello"),
    walkPiped("\n", "--shop", shop, "--repo", "octo/hello"),
    walkPiped("tok_never_used", "--shop", `${shop}x`, "--repo", "octo/hello"),
    walkPiped("tok_never_used", "--shop", shop, "--repo", "octo/hello", "--commands", "mark"),
  ];
  for (const r of refused) {
    expect(r.exit, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/^walk: [^\n]+\n$/);
  }
  expect(refused[0]!.stderr).toBe(`walk: --shop ${shop} needs --repo <owner/name>, the repository the token is scoped to\n`);
  expect(refused[1]!.stderr).not.toContain("user");
  expect(refused[3]!.stderr).toContain("stdin");
  expect(refused[6]!.stderr).toBe(`walk: --shop ${shop}x is not a walk's shop; write --shop github, --shop watch, or --shop hall, or nothing for the memory walk\n`);
  for (const r of refused) expect(r.stderr).not.toContain("tok_never_used");
  expect(roots()).toEqual(before);
}, 60_000);

it("--shop hall sets the stage with no token, and --status counts the hall's rows by command and detail and the grants by source", () => {
  expect(walk("--shop", "hall", "--repo", "octo/hello")).toMatchObject({ exit: 1, stdout: "", stderr: "walk: --shop hall takes no other flag; it needs no repository and no token\n" });
  const up = walk("--shop", "hall");
  expect(up.exit, up.stderr).toBe(0);
  const root = /^walk ready: (.+)$/m.exec(up.stdout)![1]!;
  const w = JSON.parse(readFileSync(path.join(root, "walk.json"), "utf8"));
  pid = w.pid as number;
  try {
    expect(w.shop).toBe("town/hall");
    expect(Object.keys(w.grants).sort()).toEqual(["town/hall", "town/memory"]);
    expect(up.stdout).toContain(`admin permit ls --pass ${w.passId}`);
    expect(up.stdout).toMatch(/^the grants:  grant_[0-9a-f]{16} town\/hall search,show,spec,validate,test,publish,request,requests; no constraints; expires 1d$/m);
    expect(readdirSync(w.shim)).toEqual(["town"]);

    // The agent's side, scripted: help, a refused validate, a publish, and a request.
    const agentEnv = { ...env, PATH: `${w.shim}:/usr/bin:/bin` };
    const sh = (line: string) => spawnSync("/bin/sh", ["-c", line], { cwd: w.agent, env: agentEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
    const help = sh("town --help");
    expect(help.stdout).toMatch(/^town\/hall\s.*\[search, show, spec, validate, test, publish, request, requests\]$/m);
    expect(help.stdout).toMatch(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/m);
    const manifest = "name: dimitri/hello\nversion: 0.1.0\nsummary: Says a word.\nruntime: subprocess\nentry: ./main.mjs\ncommands:\n  - name: hi\n    summary: Print a greeting.\n    effect: read\n    output: text\ntests:\n  - name: it greets\n    run: hi\n    expect: { contains: hello }\n";
    mkdirSync(path.join(w.agent, "hello"));
    writeFileSync(path.join(w.agent, "hello", "main.mjs"), "process.stdout.write('hello\\n');\n");
    writeFileSync(path.join(w.agent, "hello", "manifest.yaml"), manifest.replace("dimitri/hello", "walker/hello"));
    expect(sh("tar --format ustar -cf - -C hello . | town hall validate").stdout).toBe("name: walker/hello is not under your namespace; write dimitri/hello instead (spec §2)\n");
    writeFileSync(path.join(w.agent, "hello", "manifest.yaml"), manifest);
    expect(sh("tar --format ustar -cf - -C hello . | town hall validate").status).toBe(0);
    expect(sh("tar --format ustar -cf - -C hello . | town hall publish").stdout).toBe("ok it greets\npublished dimitri/hello 0.1.0; town hello --help says what it does\n");
    expect(sh("town hall request --shop town/memory --commands forget").status).toBe(0);

    const status = walk("--status", root);
    expect(status.exit, status.stderr).toBe(0);
    const counts = status.stdout.split("hall rows by command: ")[1]!.trimEnd().split("\n");
    expect(counts).toEqual([
      "4",
      "  validate 2: refused 1, valid 1; sections refused: §2 1",
      "  publish 1: published 1",
      "  request 1: requested 1",
      "grants by source: operator 2, publish 1",
    ]);
    expect(walk("--teardown", root).exit).toBe(0);
    expect(existsSync(root)).toBe(false);
  } finally {
    if (alive(pid)) process.kill(pid, "SIGKILL");
  }
}, 60_000);

it("--status prints the audit as a tree: a shop's calls indented under the call they served, and how many there were", async () => {
  const root = mkdtempSync(path.join(tmpdir, "town-walk-"));
  const data = path.join(root, "data");
  let town: Town | undefined;
  const a = agent();
  try {
    town = await serve(data);
    for (const dir of ["test/fixtures/echo-shop", "test/fixtures/recipe-shop"]) expect(town.admin("shop", "add", path.join(ROOT, dir)).exit).toBe(0);
    expect(town.admin("user", "add", "walker").exit).toBe(0);
    const pass = town.admin("pass", "new", "--user", "walker", "--label", "walk");
    const passId = pass.stderr.trim();
    expect(town.admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo").exit).toBe(0);
    expect(town.admin("grant", "new", "--pass", passId, "--shop", "test/recipe", "--commands", "relay").exit).toBe(0);
    a.writeGrant(pass.stdout);
    expect(a.town("recipe", "relay", "--words", "echo echo --zeta z").exit).toBe(0);
    expect(a.town("recipe", "relay", "--words", "echo sleep").exit).toBe(2);
    expect(a.town("echo", "echo", "--zeta", "z").exit).toBe(0);
    writeFileSync(path.join(root, "walk.json"), JSON.stringify({ root, data, pid: 2 ** 22 + 7, passId, shop: "test/recipe" }));

    const status = walk("--status", root);
    expect(status.exit, status.stderr).toBe(0);
    const section = status.stdout.split(`audit of ${passId}, as a tree by parent:\n`)[1]!.split("\n\n")[0]!;
    const lines = section.split("\n");
    expect(lines[0]).toMatch(/^call\s+at\s+pass\s+shop\s+command\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+detail$/);
    expect(lines.slice(1, -1).map((l) => /^( *)call_[0-9a-f]{16}\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l)!.slice(1))).toEqual([
      ["", passId, "test/recipe", "relay", "ok"],
      ["  ", passId, "test/echo", "echo", "ok"],
      ["", passId, "test/recipe", "relay", "denied"],
      ["  ", passId, "test/echo", "sleep", "denied"],
      ["", passId, "test/echo", "echo", "ok"],
    ]);
    expect(lines.at(-1)).toBe("rows made in a shop's service: 2, under 2 calls");
    expect(status.stdout).toMatch(/^rows: 5; ok 3, denied 2$/m);
  } finally {
    await town?.stop();
    cleanup(root, a.dir, a.home, ...(town ? [town.env.HOME!] : []));
  }
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
