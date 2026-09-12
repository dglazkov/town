// ring: command
// Journey 3, the narrow grant, against a real town: after `shop add`, each
// shop's entry under the data directory is swapped for one that writes a
// marker file, so every denied, malformed, and invalid-pass call can be
// checked for a process that should not have existed, and every allowed
// call for one that should. Also journey 1 step 6's notice, a day from
// expiry, in both forms.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MEMORY, ROOT, agent, assertBuilt, cleanup, serve, tmp, type Agent, type Ran, type Town } from "./helpers/town.js";

const ECHO = path.join(ROOT, "test/fixtures/echo-shop");

let town: Town;
let data: string;
let marker: string;
const made: string[] = [];

function swapEntry(shopDirName: string): void {
  const entry = path.join(data, "shops", shopDirName, "main.mjs");
  writeFileSync(entry, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(" "));\nprocess.stdout.write("ran\\n");\n`);
}

function newAgent(user: string, label: string, grantArgs: string[]): { a: Agent; passId: string; grant: Ran } {
  const pass = town.admin("pass", "new", "--user", user, "--label", label);
  expect(pass.exit, pass.stderr).toBe(0);
  const passId = pass.stderr.trim();
  const grant = town.admin("grant", "new", "--pass", passId, ...grantArgs);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  return { a, passId, grant };
}

/** The call ran no shop: nothing wrote the marker. */
function notRun(r: Ran, exit: number): Ran {
  expect(r.exit, `${r.stdout}${r.stderr}`).toBe(exit);
  expect(existsSync(marker), "the shop ran on a call it should not have").toBe(false);
  return r;
}

/** The call ran the shop: the marker is there, and is removed for the next check. */
function ran(r: Ran): Ran {
  expect(r.exit, r.stderr).toBe(0);
  expect(existsSync(marker), "the shop did not run on an allowed call").toBe(true);
  rmSync(marker);
  return r;
}

function line(r: Ran): string {
  const lines = r.stderr.split("\n").filter(Boolean);
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

beforeAll(async () => {
  assertBuilt();
  const root = tmp("narrow");
  made.push(root);
  data = path.join(root, "town");
  marker = path.join(root, "marker");
  town = await serve(data);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("shop", "add", ECHO).exit).toBe(0);
  swapEntry("town%2Fmemory");
  swapEntry("test%2Fecho");
  expect(town.admin("user", "add", "ana").exit).toBe(0);
}, 60_000);

afterAll(async () => {
  await town?.stop();
  cleanup(...made, town?.env.HOME ?? "");
});

describe("journey 3", () => {
  it("step 1: a grant of recall alone shows recall and runs nothing else", () => {
    const { a, grant } = newAgent("ana", "recall only", ["--shop", "town/memory", "--commands", "recall"]);
    expect(grant.exit, grant.stderr).toBe(0);
    const help = a.town("memory", "--help");
    expect(help.exit).toBe(0);
    const commandLines = help.stdout.split("\n").filter((l) => l.startsWith("  town "));
    expect(commandLines).toEqual(["  town memory recall --key <string>"]);
    expect(line(notRun(a.town("memory", "remember", "--key", "notes/a", "--value", "x"), 2))).toBe("error: command 'remember' is not available to this grant");
    expect(line(notRun(a.town("memory", "forget", "--key", "notes/a"), 2))).toBe("error: command 'forget' is not available to this grant");
    ran(a.town("memory", "recall", "--key", "anything"));
  });

  it("step 2: a prefix constraint runs inside it, denies outside it, and help says the same", () => {
    const { a, grant } = newAgent("ana", "notes", ["--shop", "town/memory", "--commands", "remember,list", "--constraint", "remember.key prefix notes/", "--constraint", "list.prefix prefix notes/"]);
    expect(grant.exit, grant.stderr).toBe(0);
    ran(a.town("memory", "remember", "--key", "notes/a", "--value", "x"));
    expect(line(notRun(a.town("memory", "remember", "--key", "secret/a", "--value", "x"), 2))).toBe("error: --key must start with 'notes/' under this grant");
    // A constrained argument left out is not a way around the constraint.
    expect(line(notRun(a.town("memory", "list"), 2))).toBe("error: --prefix must start with 'notes/' under this grant");
    ran(a.town("memory", "list", "--prefix", "notes/x"));
    const help = a.town("memory", "--help").stdout;
    expect(help).toContain("remember --key: keys under `notes/` only");
    expect(help).toContain("list --prefix: prefixes under `notes/` only, and --prefix must be given");
  });

  it("step 2, the other kinds memory marks constrainable: regex and max_length", () => {
    const { a, grant } = newAgent("ana", "short keys", ["--shop", "town/memory", "--commands", "remember,recall", "--constraint", "remember.key max_length 8", "--constraint", "recall.key regex [a-z]+/[a-z]+"]);
    expect(grant.exit, grant.stderr).toBe(0);
    ran(a.town("memory", "remember", "--key", "notes/ab", "--value", "x"));
    expect(line(notRun(a.town("memory", "remember", "--key", "notes/abc", "--value", "x"), 2))).toBe("error: --key must be at most 8 characters under this grant");
    ran(a.town("memory", "recall", "--key", "notes/ab"));
    expect(line(notRun(a.town("memory", "recall", "--key", "notes/ab/c"), 2))).toBe("error: --key must match the pattern '[a-z]+/[a-z]+' as a whole under this grant");
  });

  it("step 3: a kind the manifest does not mark constrainable is refused when the grant is made", () => {
    const pass = town.admin("pass", "new", "--user", "ana", "--label", "refused").stderr.trim();
    const cases: Array<[string[], RegExp]> = [
      [["--commands", "recall", "--constraint", "recall.key max_length 5"], /town\/memory does not mark recall\.key constrainable by max_length; write one of prefix, regex/],
      [["--commands", "recall", "--constraint", "recall.key in_folder x"], /in_folder is not a constraint kind; write one of equals, one_of, prefix, regex, max_length/],
      [["--commands", "recall,forget2"], /forget2 is not a command of town\/memory/],
      [["--commands", "recall", "--constraint", "recall.path prefix x"], /path is not an argument of recall; write one of key/],
      [["--commands", "recall", "--constraint", "remember.key prefix x"], /remember is not in this grant's commands/],
    ];
    for (const [args, message] of cases) {
      const r = town.admin("grant", "new", "--pass", pass, "--shop", "town/memory", ...args);
      expect(r.exit, args.join(" ")).toBe(1);
      expect(r.stderr).toMatch(message);
    }
    expect(town.admin("grant", "ls", "--pass", pass).stdout.trim().split("\n")).toHaveLength(1);
  });

  it("step 4: a missing required argument, an unknown one, a value of the wrong type: exit 1, usage for the grant, no shop", () => {
    const { a, grant } = newAgent("ana", "echo", ["--shop", "test/echo", "--commands", "echo"]);
    expect(grant.exit, grant.stderr).toBe(0);
    const usage = "usage: town echo echo --zeta <string> [--alpha <int>] [--mode <fast|slow>] [--loud [true|false]] [--note <string>]";
    expect(notRun(a.town("echo", "echo"), 1).stderr).toBe(`error: --zeta is required\n${usage}\n`);
    expect(notRun(a.town("echo", "echo", "--zeta", "z", "--colour", "red"), 1).stderr).toBe(`error: --colour is not an argument of echo\n${usage}\n`);
    expect(notRun(a.town("echo", "echo", "--zeta", "z", "--alpha", "1.5"), 1).stderr).toBe(`error: --alpha must be an int, not 1.5\n${usage}\n`);
    // The usage for a shop names only the grant's commands.
    expect(notRun(a.town("echo"), 1).stderr).toBe("error: no command given\nusage: town echo <echo> [--name value ...]; town echo --help says more\n");
    ran(a.town("echo", "echo", "--zeta", "z"));
  });

  it("step 5: an expired pass is exit 3 on any call, and the audit row says so", () => {
    const { a, passId, grant } = newAgent("ana", "soon gone", ["--shop", "town/memory"]);
    expect(grant.exit).toBe(0);
    ran(a.town("memory", "recall", "--key", "k"));
    // No verb makes a pass already expired; the test moves its expiry into the past in the file itself.
    const script = `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1]);
      db.exec("PRAGMA busy_timeout = 5000"); db.prepare("UPDATE passes SET expires_at = ? WHERE id = ?").run(Date.now() - 1000, process.argv[2]); db.close();`;
    const expire = spawnSync(process.execPath, ["--no-warnings", "-e", script, path.join(data, "town.db"), passId], { encoding: "utf8" });
    expect(expire.status, expire.stderr).toBe(0);
    for (const call of [["--help"], ["memory", "recall", "--key", "k"], ["memory", "--help"]]) {
      expect(line(notRun(a.town(...call), 3))).toBe("error: this pass is not valid: its token is unknown, revoked, or expired");
    }
    const rows = town.admin("audit", "--pass", passId).stdout.trim().split("\n").slice(1);
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(1)) expect(row).toMatch(/\binvalid-pass\s+3\s+-\s+\d+\s+-\s+expired$/);
  });

  it("a shop the pass holds no grant for and a shop the town does not have are the same line", () => {
    const { a } = newAgent("ana", "memory only", ["--shop", "town/memory", "--commands", "recall"]);
    const held = notRun(a.town("echo", "echo", "--zeta", "z"), 2);
    expect(town.admin("shop", "rm", "test/echo").exit).toBe(0);
    const missing = notRun(a.town("echo", "echo", "--zeta", "z"), 2);
    expect(missing).toEqual(held);
    expect(held.stderr).toBe("error: command 'echo echo' is not available to this grant\n");
  });
});

describe("journey 1 step 6: a grant a day from expiry", () => {
  it("carries grant-expires in --json, and as one town-notice line on stderr with stdout untouched", () => {
    const { a, grant } = newAgent("ana", "a day left", ["--shop", "town/memory", "--commands", "recall", "--expires", "1d"]);
    expect(grant.exit, grant.stderr).toBe(0);
    const json = a.town("memory", "recall", "--key", "k", "--json");
    rmSync(marker);
    expect(json.stderr).toBe("");
    const envelope = JSON.parse(json.stdout);
    expect(Object.keys(envelope)).toEqual(["ok", "output", "notices", "exit"]);
    expect(envelope).toMatchObject({ ok: true, output: "ran\n", exit: 0 });
    expect(envelope.notices).toEqual([{ kind: "grant-expires", shop: "town/memory", expires: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/) }]);

    const plain = ran(a.town("memory", "recall", "--key", "k"));
    expect(plain.stdout).toBe(envelope.output);
    expect(plain.stderr).toBe(`town-notice: grant-expires shop=town/memory expires=${envelope.notices[0].expires}\n`);

    const denied = a.town("memory", "remember", "--key", "k", "--json");
    expect(JSON.parse(denied.stdout)).toEqual({
      ok: false,
      output: "",
      notices: envelope.notices,
      exit: 2,
      error: "error: command 'remember' is not available to this grant",
    });
    expect(existsSync(marker)).toBe(false);
  });
});
