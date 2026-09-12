// ring: command
// The walk's stage without the agent: scripts/walk.mjs makes a town, a
// grant, an agent's directory, and a shim holding `town` alone; the
// sentence it hands the conductor is README's and SKILL.md's; `--status`
// counts the audit by result; `--teardown` leaves no process and no
// directory.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  expect(walk("--teardown", tmpdir).exit).toBe(1);
  const down = walk("--teardown", root);
  expect(down.exit, down.stderr).toBe(0);
  expect(alive(pid)).toBe(false);
  expect(existsSync(root)).toBe(false);
}, 60_000);
