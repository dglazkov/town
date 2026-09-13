// ring: command
// Hall's journeys 1, 2, and 3, typed, against towns this test starts,
// with the memory shop, fixtures the test writes, and the box's own tar:
// a scripted agent in a directory with `.town/grant` and `town` on its
// PATH sends shops as `tar --format ustar -cf - -C todo . | town hall …`,
// and the operator decides at the box between its steps. Journey 1 steps
// 1 to 7 and its criteria; journey 2 steps 1 to 6 with a copy of a
// compose-era store; journey 3 steps 1 to 8 with a fixture that prints
// everything it can reach and a dependency that counts its own runs; and
// the sources of every grant after each. And wall's journey 2 step 7: the
// prying fixture sent as a bundle, tested and published within the wall,
// and called, printing journey 2's refusals, and a bundle whose test reads
// beside the data directory failing at test and at publish; the audit's
// wall column on a publish's tree. No token and no network.

import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, ROOT, TOWN, agent, assertBuilt, cleanEnv, cleanup, originProcess, serve, tmp, townd, type Agent, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;
let shim: string;

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
  // `town` on the agent's PATH, and nothing else, as the walk's shim is.
  shim = tmp("publish-shim");
  made.push(shim);
  writeFileSync(path.join(shim, "town"), `#!/bin/sh\nexec '${process.execPath}' '${TOWN}' "$@"\n`);
  chmodSync(path.join(shim, "town"), 0o755);
});

afterAll(async () => {
  for (const t of towns) await t.stop();
  await origin?.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

const HALL_COMMANDS = "search,show,spec,validate,test,publish,request,requests";

/** A line the agent types in its directory, with `town` on its PATH: a shell, so a pipe is a pipe. */
function typed(a: Agent, line: string, input?: Buffer): Ran {
  const env = { ...cleanEnv(a.home), PATH: `${shim}:${process.env.PATH}` };
  const r = spawnSync("/bin/sh", ["-c", line], { cwd: a.dir, env, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], timeout: 60_000, ...(input === undefined ? {} : { input }) });
  return { stdout: r.stdout.toString("utf8"), stderr: r.stderr.toString("utf8"), exit: r.status ?? -1 };
}

const sendTar = (a: Agent, dir: string, command: string) => typed(a, `tar --format ustar -cf - -C ${dir} . | town hall ${command}`);

function oneLine(r: Ran): string {
  const lines = r.stderr.split("\n").filter(Boolean);
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

function rowOf(table: string, first: string): string {
  const row = table.split("\n").find((l) => l.startsWith(first));
  expect(row, `${first} in\n${table}`).toBeDefined();
  return row!;
}

interface AuditRow {
  pass: string;
  shop: string;
  command: string;
  result: string;
  exit: string;
  shopExit: string;
  call: string;
  parent: string;
  wall: string;
  detail: string;
}

/** `townd admin audit`'s rows, by column; the detail is the rest of the line. */
function auditRows(stdout: string): AuditRow[] {
  const [header, ...lines] = stdout.trim().split("\n");
  expect(header).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+wall\s+detail$/);
  return lines.map((l) => {
    const c = l.split(/\s+/);
    return { pass: c[1]!, shop: c[2]!, command: c[3]!, result: c[5]!, exit: c[6]!, shopExit: c[7]!, call: c[11]!, parent: c[12]!, wall: c[13]!, detail: c.slice(14).join(" ") };
  });
}

/** Rows of a query over the town's database, read as a separate process reads the file. */
function db(data: string, sql: string): Array<Record<string, unknown>> {
  const script = `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1]); db.exec("PRAGMA busy_timeout = 5000");
    process.stdout.write(JSON.stringify(db.prepare(process.argv[2]).all()));`;
  const r = spawnSync(process.execPath, ["--no-warnings", "-e", script, path.join(data, "town.db"), sql], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as Array<Record<string, unknown>>;
}

/** Every grant's source is a person's (the operator's or a permit's), or the publish grant of the pass at a shop its user owns and it published, and never at a shop with needs (consent's rule). */
function expectSourcesPersonOrPublish(data: string): void {
  const rows = db(data, "SELECT g.id, g.source, g.pass_id, g.shop, s.owner, p.user_id, json_array_length(json_extract(s.manifest, '$.credentials')) AS needs, (SELECT COUNT(*) FROM calls c WHERE c.pass_id = g.pass_id AND c.shop = 'town/hall' AND c.detail LIKE 'published ' || g.shop || ' %') AS published FROM grants g JOIN passes p ON p.id = g.pass_id LEFT JOIN shops s ON s.name = g.shop");
  expect(rows.length).toBeGreaterThan(0);
  for (const g of rows) {
    const source = g.source as string | null;
    if (source === null || /^permit prm_[0-9a-f]{16}$/.test(source)) continue;
    expect(source, String(g.id)).toBe("publish");
    expect(Number(g.needs ?? 0), `${g.id}: a publish grant at a shop with needs`).toBe(0);
    expect(Number(g.published), `${g.id}: a publish grant at a shop its pass did not publish`).toBeGreaterThan(0);
    if (g.owner !== null) expect(g.owner, String(g.id)).toBe(g.user_id);
  }
}

const TODO_MANIFEST = `name: dimitri/todo
version: 0.1.0
summary: Things to do, kept in the town's notes.
guidance: |
  An item is one word, like milk.
runtime: subprocess
entry: ./main.mjs
depends:
  - shop: town/memory
    commands: [remember, list]
commands:
  - name: add
    summary: Add an item.
    effect: write
    args:
      - { name: item, type: string, required: true, doc: "One word." }
    output: text
  - name: done
    summary: Mark an item done.
    effect: write
    args:
      - { name: item, type: string, required: true }
    output: text
  - name: list
    summary: Show every item.
    effect: read
    output: text
tests:
  - name: an added item is listed
    run: |
      add --item milk
      list
    expect: { contains: todo/milk }
`;

const TODO_ENTRY = `import { spawnSync } from "node:child_process";
const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].slice(2)] = rest[i + 1];
const town = (...words) => {
  const r = spawnSync("town", words, { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? "");
    process.exit(r.status ?? 1);
  }
  return r.stdout;
};
if (command === "add") {
  town("memory", "remember", "--key", "todo/" + args.item, "--value", "open");
  process.stdout.write("added " + args.item + "\\n");
} else if (command === "done") {
  town("memory", "remember", "--key", "todo/" + args.item, "--value", "done");
  process.stdout.write("done " + args.item + "\\n");
} else if (command === "list") process.stdout.write(town("memory", "list", "--prefix", "todo/"));
else if (command === "clear") process.stdout.write("cleared\\n");
else if (command === "go") process.stdout.write(town("count", "tick", "--tag", "theirs/x"));
`;

/** A shop directory under the agent's own, as the agent writes one with the shell. */
function writeShop(a: Agent, dir: string, manifest: string, entry: string): void {
  mkdirSync(path.join(a.dir, dir), { recursive: true });
  writeFileSync(path.join(a.dir, dir, "manifest.yaml"), manifest);
  writeFileSync(path.join(a.dir, dir, "main.mjs"), entry);
}

/** A town with the memory shop, dimitri, and a pass with the hall whole and memory at remember, recall, and list; the agent's directory holding its grant. */
async function hallTown(root: string): Promise<{ town: Town; data: string; a: Agent; passId: string; token: string; hallGrant: string; memoryGrant: string }> {
  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "dimitri", "--label", "the agent");
  const passId = pass.stderr.trim();
  const hallGrant = town.admin("grant", "new", "--pass", passId, "--shop", "town/hall").stdout.trim();
  const memoryGrant = town.admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list").stdout.trim();
  expect(hallGrant).toMatch(/^grant_[0-9a-f]{16}$/);
  expect(memoryGrant).toMatch(/^grant_[0-9a-f]{16}$/);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  return { town, data, a, passId, token: JSON.parse(pass.stdout).token as string, hallGrant, memoryGrant };
}

const stagings = (data: string) => (existsSync(path.join(data, "shops")) ? readdirSync(path.join(data, "shops")).filter((e) => e.startsWith(".staging-")) : []);

it("walks journey 1 steps 1 to 7: help, search and show, spec, validate, test, publish, and a request a person decides", async () => {
  const root = tmp("hall-journey-1");
  made.push(root);
  const { town, data, a, passId, token } = await hallTown(root);
  const said: Ran[] = [];
  const say = (r: Ran) => (said.push(r), r);

  // Step 1: help lists the hall and memory; the hall's help is its manifest's, naming no address, user, or directory.
  const help = say(typed(a, "town --help"));
  expect(help.exit).toBe(0);
  expect(help.stdout).toMatch(/^town\/hall\s+Where the town's shops are found, made, and asked for\. \[search, show, spec, validate, test, publish, request, requests\]$/m);
  expect(help.stdout).toMatch(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/m);
  const hallHelp = say(typed(a, "town hall --help"));
  expect(hallHelp.exit).toBe(0);
  expect(hallHelp.stdout).toMatch(/^town\/hall: Where the town's shops are found, made, and asked for\.\n/);
  expect(hallHelp.stdout.match(/tar --format ustar -cf - -C <dir> \./g)).toHaveLength(1);
  expect([...hallHelp.stdout.matchAll(/^  town hall (\S+)/gm)].map((m) => m[1])).toEqual(HALL_COMMANDS.split(","));
  expect(hallHelp.stdout).toContain("  town hall request --shop <string> [--commands <string>] [--constraint <string>] [--why <string>]\n");
  expect(hallHelp.stdout).toContain("this grant: the agent; does not expire");
  for (const word of [town.url, "dimitri", data, a.dir, os.tmpdir()]) expect(hallHelp.stdout, word).not.toContain(word);

  // Step 2: search lists every shop with what this pass holds; a query that matches nothing says so; show prints a full grant's help.
  const search = say(typed(a, "town hall search"));
  expect(search.stdout.split("\n")).toEqual([
    "town/hall    Where the town's shops are found, made, and asked for. [search, show, spec, validate, test, publish, request, requests]  held: all",
    "town/memory  Short notes, kept by key. [remember, recall, list, forget]  held: remember, recall, list",
    "",
  ]);
  expect(say(typed(a, "town hall search --query todo"))).toEqual({ stdout: 'no shop in this town matches "todo"\n', stderr: "", exit: 0 });
  const show = say(typed(a, "town hall show --shop town/memory"));
  expect(show.stdout).toContain("  town town/memory forget --key <string>\n");
  expect(show.stdout).toMatch(/\nthis pass holds: remember, recall, list\n$/);

  // Step 3: the spec, byte for byte townd's.
  expect(say(typed(a, "town hall spec")).stdout).toBe(townd(["spec"], town.env).stdout);

  // Step 4: a shop written with the shell; validate refuses with sections, then says ok; the town has no new shop.
  writeShop(a, "todo", TODO_MANIFEST.replace("name: dimitri/todo", "name: town/todo").replace("summary: Show every item.", "summary: Show every item.\n    colour: blue"), TODO_ENTRY);
  const refused = say(sendTar(a, "todo", "validate"));
  expect(refused.exit).toBe(1);
  expect(refused.stdout.split("\n")).toEqual([
    "commands[2].colour: is not a command field; write only name, summary, effect, args, output instead (spec §3)",
    "name: town/todo is not under your namespace; write dimitri/todo instead (spec §2)",
    "",
  ]);
  writeShop(a, "todo", TODO_MANIFEST, TODO_ENTRY);
  const valid = say(sendTar(a, "todo", "validate"));
  expect(valid).toEqual({ stdout: "ok dimitri/todo 0.1.0: add, done, list\n", stderr: "", exit: 0 });
  const shopsBefore = town.admin("shop", "ls").stdout;
  expect(shopsBefore).not.toContain("dimitri/todo");

  // Step 5: test runs the tests as the agent and keeps nothing: no new shop, no new state.
  const tested = say(sendTar(a, "todo", "test"));
  expect(tested).toEqual({ stdout: "ok an added item is listed\n", stderr: "", exit: 0 });
  expect(town.admin("shop", "ls").stdout).toBe(shopsBefore);
  expect(existsSync(path.join(data, "state")), "a test wrote to the town's state").toBe(false);
  expect(readdirSync(path.join(data, "shops")).sort()).toEqual(["town%2Fmemory"]);

  // Step 6: publish: the test lines, then the published line; help lists it; a call runs the agent's code; a fourth command follows.
  const published = say(sendTar(a, "todo", "publish"));
  expect(published).toEqual({ stdout: "ok an added item is listed\npublished dimitri/todo 0.1.0; town todo --help says what it does\n", stderr: "", exit: 0 });
  expect(say(typed(a, "town --help")).stdout).toMatch(/^dimitri\/todo\s+Things to do, kept in the town's notes\. \[add, done, list\]$/m);
  expect(say(typed(a, "town todo add --item milk"))).toEqual({ stdout: "added milk\n", stderr: "", exit: 0 });
  expect(say(typed(a, "town todo list"))).toEqual({ stdout: "todo/milk\n", stderr: "", exit: 0 });
  writeShop(a, "todo", TODO_MANIFEST.replace("tests:", "  - name: clear\n    summary: Forget the finished items.\n    effect: destructive\n    output: text\ntests:"), TODO_ENTRY);
  const again = say(sendTar(a, "todo", "publish"));
  expect(again.exit, again.stdout).toBe(0);
  expect(say(typed(a, "town --help")).stdout).toMatch(/^dimitri\/todo\s+Things to do, kept in the town's notes\. \[add, done, list, clear\]$/m);
  expect(say(typed(a, "town todo list")).stdout).toBe("todo/milk\n");

  // The criterion: held by the publishing pass at exactly its commands, and by no other pass.
  const other = town.admin("pass", "new", "--user", "dimitri", "--label", "another agent");
  const b = agent();
  made.push(b.dir, b.home);
  b.writeGrant(other.stdout);
  expect(town.admin("grant", "new", "--pass", other.stderr.trim(), "--shop", "town/memory", "--commands", "remember,recall,list").exit).toBe(0);
  expect(typed(b, "town --help").stdout).not.toContain("dimitri/todo");
  expect(typed(b, "town todo list")).toMatchObject({ exit: 2, stdout: "" });
  const atTodo = town.admin("grant", "ls").stdout.split("\n").filter((l) => /\sdimitri\/todo\s/.test(l));
  expect(atTodo.filter((l) => /\slive\s/.test(l)).map((l) => l.split(/\s+/).slice(1, 5))).toEqual([[passId, "dimitri/todo", "add,done,list,clear", "publish"]]);

  // Step 7: the request help says an approval replaces the grant; a request naming forget alone says what it would drop; the request
  // naming all four replaces it as pending; approved at the box, help lists memory's four and the to-do shop still; another denied, help unchanged.
  const answer = /^requested (prm_[0-9a-f]{16}); a person decides at the box, and town --help shows the answer\n/;
  expect(say(typed(a, "town hall --help")).stdout).toMatch(/^\s+--commands <string>\s+Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there\. Every command when omitted\.$/m);
  const alone = say(typed(a, 'town hall request --shop town/memory --commands forget --why "to clear finished items"'));
  const first = answer.exec(alone.stdout)?.[1];
  expect(first, alone.stdout + alone.stderr).toBeDefined();
  expect(alone).toEqual({
    stdout: `requested ${first}; a person decides at the box, and town --help shows the answer\nif approved, this replaces your grant at town/memory and drops remember, recall, list; name them to keep them\n`,
    stderr: "",
    exit: 0,
  });
  const asked = say(typed(a, 'town hall request --shop town/memory --commands remember,recall,list,forget --why "to clear finished items"'));
  const permit = answer.exec(asked.stdout)?.[1];
  expect(asked).toEqual({ stdout: `requested ${permit}; a person decides at the box, and town --help shows the answer\n`, stderr: "", exit: 0 });
  const pending = say(typed(a, "town hall requests")).stdout;
  expect(pending.trimEnd().split("\n").slice(1)).toHaveLength(1);
  expect(pending).toMatch(new RegExp(`^${permit}\\s+town/memory\\s+remember,recall,list,forget\\s+-\\s+to clear finished items\\s+\\S+\\s+pending$`, "m"));
  expect(pending).not.toContain(first!);
  const approve = town.admin("permit", "approve", permit!);
  expect(approve.exit, approve.stderr).toBe(0);
  const granted = approve.stdout.trim().split("\n").at(-1)!;
  expect(approve.stdout).toMatch(new RegExp(`^revoked grant_[0-9a-f]{16} at town/memory, which ${permit} replaces\\ngrant_[0-9a-f]{16}\\n$`));
  const helped = say(typed(a, "town --help")).stdout;
  expect(helped).toMatch(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list, forget\]$/m);
  expect(helped).toMatch(/^dimitri\/todo\s+Things to do, kept in the town's notes\. \[add, done, list, clear\]$/m);
  expect(say(typed(a, "town todo list"))).toEqual({ stdout: "todo/milk\n", stderr: "", exit: 0 });
  expect(say(typed(a, "town hall requests")).stdout).toMatch(new RegExp(`^${permit}\\s.*\\sapproved as ${granted}$`, "m"));
  const narrower = say(typed(a, 'town hall request --shop town/memory --commands remember,recall,list --why "forget no more"'));
  const second = answer.exec(narrower.stdout)![1]!;
  expect(narrower.stdout.split("\n")[1]).toBe("if approved, this replaces your grant at town/memory and drops forget; name them to keep them");
  expect(town.admin("permit", "deny", second)).toMatchObject({ exit: 0, stdout: `denied ${second}\n` });
  expect(say(typed(a, "town hall requests")).stdout).toMatch(new RegExp(`^${second}\\s.*\\sdenied$`, "m"));
  expect(say(typed(a, "town --help")).stdout).toBe(helped);

  // The criteria: nothing the hall said names the box's paths, the data directory, or the token.
  for (const r of said) {
    for (const word of [token, data, a.dir, root, os.homedir(), town.url]) expect(r.stdout + r.stderr, word).not.toContain(word);
  }
  // Every hall call is a row under the agent's pass with a detail the survey counts; a publish's test calls are rows under it.
  const rows = auditRows(town.admin("audit", "--shop", "town/hall").stdout).filter((r) => r.command !== "-");
  expect(rows.map((r) => [r.pass, r.command, r.detail])).toEqual([
    [passId, "search", "-"],
    [passId, "search", "-"],
    [passId, "show", "-"],
    [passId, "spec", "-"],
    [passId, "validate", "refused §3,§2"],
    [passId, "validate", "valid dimitri/todo 0.1.0"],
    [passId, "test", "tests 1/1"],
    [passId, "publish", "published dimitri/todo 0.1.0"],
    [passId, "publish", "published dimitri/todo 0.1.0"],
    [passId, "request", `requested ${first}`],
    [passId, "request", `requested ${permit}`],
    [passId, "requests", "-"],
    [passId, "requests", "-"],
    [passId, "request", `requested ${second}`],
    [passId, "requests", "-"],
  ]);
  const all = auditRows(town.admin("audit").stdout);
  for (const hallCall of rows.filter((r) => ["test", "publish"].includes(r.command))) {
    const inner = all.filter((r) => r.parent === hallCall.call);
    expect(inner.map((r) => [r.pass, r.shop, r.command, r.result, r.wall])).toEqual([
      [passId, "town/memory", "remember", "ok", "seatbelt"],
      [passId, "town/memory", "list", "ok", "seatbelt"],
    ]);
    // The hall's own row ran no process of a shop's.
    expect(hallCall.wall).toBe("-");
  }
  expectSourcesPersonOrPublish(data);
  expect(stagings(data)).toEqual([]);
}, 180_000);

it("walks journey 2 steps 1 to 6: the hall at the box, a narrow hall grant, permits decided, a published shop removed, and the audit", async () => {
  const root = tmp("hall-journey-2");
  made.push(root);

  // Step 1: a store made by compose opens under hall with its rows, and gains the table, the columns, and the row.
  const composeData = path.join(root, "compose-town");
  mkdirSync(composeData, { mode: 0o700 });
  const fixture = readFileSync(path.join(ROOT, "test/fixtures/compose-store.sql"), "utf8");
  const load = spawnSync(process.execPath, ["--no-warnings", "-e", 'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync(process.argv[1]).exec(require("node:fs").readFileSync(process.argv[2], "utf8"));', path.join(composeData, "town.db"), path.join(ROOT, "test/fixtures/compose-store.sql")], { encoding: "utf8" });
  expect(load.status, load.stderr).toBe(0);
  writeFileSync(path.join(composeData, "vault.key"), Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(fixture)![1]!, "hex"), { mode: 0o600 });
  const before = { users: db(composeData, "SELECT * FROM users"), passes: db(composeData, "SELECT * FROM passes"), calls: db(composeData, "SELECT * FROM calls") };
  const composeTown = await serve(composeData);
  towns.push(composeTown);
  const composeShops = composeTown.admin("shop", "ls").stdout;
  expect(composeShops.split("\n")[0]).toMatch(/^name\s+version\s+owner\s+commands\s+depends\s+added$/);
  expect(rowOf(composeShops, "town/hall")).toMatch(/^town\/hall\s+0\.1\.0\s+-\s+search,show,spec,validate,test,publish,request,requests\s+-\s/);
  expect(rowOf(composeShops, "town/memory")).toMatch(/^town\/memory\s+0\.1\.0\s+-\s/);
  expect(db(composeData, "SELECT * FROM users")).toEqual(before.users);
  expect(db(composeData, "SELECT * FROM passes")).toEqual(before.passes);
  // Wall's column on every old row, null: printed as -, a row made before any process was walled.
  expect(db(composeData, "SELECT * FROM calls")).toEqual(before.calls.map((r) => ({ ...r, wall: null })));
  expect(db(composeData, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'permits'")).toEqual([{ name: "permits" }]);
  expect(db(composeData, "SELECT name FROM pragma_table_info('shops') WHERE name = 'owner'")).toEqual([{ name: "owner" }]);
  expect(db(composeData, "SELECT name FROM pragma_table_info('grants') WHERE name = 'source'")).toEqual([{ name: "source" }]);
  expect(db(composeData, "SELECT value FROM meta WHERE key = 'schema'")).toEqual([{ value: "6" }]);
  expect(composeTown.admin("grant", "ls").stdout).toMatch(/^grant_[0-9a-f]{16}\s+pass_e4dca651fb4453dc\s+town\/memory\s+\S+\s+-\s/m);
  await composeTown.stop();

  // A store made new has the hall alone, and the hall is the town's own at shop rm and shop add.
  const { town, data, a, passId, hallGrant } = await hallTown(root);
  const admin = town.admin;
  expect(rowOf(admin("shop", "ls").stdout, "town/hall")).toMatch(/^town\/hall\s+0\.1\.0\s+-\s/);
  expect(oneLine(admin("shop", "rm", "town/hall"))).toBe("townd admin: shop rm refused: town/hall is the town's own shop, in every town from its first open; revoke the grants at it instead");
  const named = path.join(root, "named-hall");
  cpSync(MEMORY, named, { recursive: true });
  const memoryText = readFileSync(path.join(named, "manifest.yaml"), "utf8");
  writeFileSync(path.join(named, "manifest.yaml"), memoryText.replace("name: town/memory", "name: town/hall"));
  expect(oneLine(admin("shop", "add", named))).toBe("townd admin: shop add refused: town/hall is the town's own shop, in every town from its first open; name the shop under another namespace");
  writeFileSync(path.join(named, "manifest.yaml"), memoryText.replace("runtime: subprocess", "runtime: town"));
  expect(admin("shop", "add", named).stderr).toContain("runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)\n");

  // Step 2: a hall grant at four commands: request is not available, and help lists the four.
  expect(admin("grant", "revoke", hallGrant).exit).toBe(0);
  const four = admin("grant", "new", "--pass", passId, "--shop", "town/hall", "--commands", "spec,validate,test,publish").stdout.trim();
  const notRequest = typed(a, "town hall request --shop town/memory --commands forget");
  expect([notRequest.exit, oneLine(notRequest)]).toEqual([2, "error: command 'request' is not available to this grant"]);
  expect([...typed(a, "town hall --help").stdout.matchAll(/^  town hall (\S+)/gm)].map((m) => m[1])).toEqual(["spec", "validate", "test", "publish"]);
  expect(admin("grant", "revoke", four).exit).toBe(0);
  expect(admin("grant", "new", "--pass", passId, "--shop", "town/hall").exit).toBe(0);

  // Step 3: permit ls, approve as asked, narrower, refused wider, replacing a grant; deny; decided once.
  const request = (words: string) => /^requested (prm_[0-9a-f]{16});/.exec(typed(a, `town hall request ${words}`).stdout)![1]!;
  const both = request('--shop town/memory --commands remember,recall --why "to keep notes"');
  const ls = admin("permit", "ls").stdout;
  expect(ls.split("\n")[0]).toMatch(/^id\s+pass\s+user\s+shop\s+commands\s+constraints\s+why\s+asked\s+state$/);
  expect(rowOf(ls, both)).toMatch(new RegExp(`^${both}\\s+${passId}\\s+dimitri\\s+town/memory\\s+remember,recall\\s+-\\s+to keep notes\\s+\\d{4}-\\S+\\s+pending$`));
  const wider = admin("permit", "approve", both, "--commands", "forget");
  expect(wider.stderr).toBe(`townd admin: permit approve refused: --commands: forget is wider than ${both} asked; write some of remember,recall, or leave it out for all it asked\ntownd admin: ${both} is still pending\n`);
  const narrowed = admin("permit", "approve", both, "--commands", "recall");
  expect(narrowed.exit, narrowed.stderr).toBe(0);
  const [revokedLine, recallGrant] = narrowed.stdout.trim().split("\n");
  expect(revokedLine).toMatch(new RegExp(`^revoked grant_[0-9a-f]{16} at town/memory, which ${both} replaces$`));
  expect(rowOf(admin("grant", "ls").stdout, recallGrant!)).toMatch(new RegExp(`^${recallGrant}\\s+${passId}\\s+town/memory\\s+recall\\s+permit ${both}\\s+-\\s+-\\s+-\\s+live\\s`));
  expect(rowOf(admin("permit", "ls").stdout, both)).toMatch(new RegExp(`\\sapproved as ${recallGrant} with recall$`));
  expect(admin("permit", "deny", both).stderr).toMatch(new RegExp(`^townd admin: permit ${both} was approved at \\S+; a decided permit is not decided again, so the agent asks again\\n$`));
  const three = request("--shop town/memory --commands remember,recall,list");
  expect(admin("permit", "approve", three).stdout).toMatch(new RegExp(`^revoked ${recallGrant} at town/memory, which ${three} replaces\\ngrant_[0-9a-f]{16}\\n$`));
  const denied = request("--shop town/memory --commands forget");
  expect(admin("permit", "deny", denied)).toMatchObject({ exit: 0, stdout: `denied ${denied}\n` });
  expect(admin("permit", "approve", denied).stderr).toMatch(/was denied at/);

  // Step 4: approve at a composed shop whose dependency the pass lacks, and at a shop with a need the user cannot meet: refused, pending.
  expect(admin("shop", "add", path.join(ROOT, "test/fixtures/echo-shop")).exit).toBe(0);
  expect(admin("shop", "add", path.join(ROOT, "test/fixtures/recipe-shop")).exit).toBe(0);
  const composed = request("--shop test/recipe");
  expect(admin("permit", "approve", composed).stderr).toBe(`townd admin: permit approve refused: pass ${passId} holds no grant at test/echo covering echo; grant one with townd admin grant new --pass ${passId} --shop test/echo --commands echo first\ntownd admin: ${composed} is still pending\n`);
  expect(admin("type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}").exit).toBe(0);
  expect(admin("user", "add", "ada").exit).toBe(0);
  expect(town.adminPiped("hall-test-not-a-token\n", "credential", "add", "--user", "ada", "--type", "test-origin").exit).toBe(0);
  const teller = admin("shop", "add", path.join(ROOT, "test/fixtures/teller-shop"), "--user", "ada");
  expect(teller.exit, teller.stderr).toBe(0);
  const needy = request("--shop test/teller --commands get");
  expect(admin("permit", "approve", needy).stderr).toBe(`townd admin: permit approve refused: user dimitri holds no test-origin credential; add one with townd admin credential add --user dimitri --type test-origin\ntownd admin: ${needy} is still pending\nto do:\n        printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type test-origin --label test-origin\n        townd admin permit approve ${needy}\n`);
  // A permit at a shop with needs adds the needs column: none for the composed shop, and the teller's need unmet for dimitri.
  expect(rowOf(admin("permit", "ls").stdout, composed)).toMatch(/\spending\s+-$/);
  expect(rowOf(admin("permit", "ls").stdout, needy)).toMatch(/\spending\s+test-origin: held, none connected$/);

  // Step 5: a published shop at the box: owner, the publish grant, and shop rm, after which it reaches nothing.
  writeShop(a, "todo", TODO_MANIFEST, TODO_ENTRY);
  const published = sendTar(a, "todo", "publish");
  expect(published.exit, published.stdout + published.stderr).toBe(0);
  expect(rowOf(admin("shop", "ls").stdout, "dimitri/todo")).toMatch(/^dimitri\/todo\s+0\.1\.0\s+dimitri\s+add,done,list\s+town\/memory\[remember,list\]\s/);
  const publishRow = admin("grant", "ls", "--pass", passId).stdout.split("\n").find((l) => /\sdimitri\/todo\s/.test(l))!;
  expect(publishRow).toMatch(new RegExp(`^grant_[0-9a-f]{16}\\s+${passId}\\s+dimitri/todo\\s+add,done,list\\s+publish\\s+-\\s+-\\s+-\\s+live\\s`));
  const publishId = auditRows(admin("audit", "--shop", "town/hall").stdout).find((r) => r.command === "publish")!.call;

  // Step 6: the hall's calls with their details; the publish's tree with its tests' calls at memory under the agent's pass.
  const hallRows = auditRows(admin("audit", "--shop", "town/hall").stdout).filter((r) => r.command !== "-");
  expect(hallRows.map((r) => r.detail)).toEqual([
    "command",
    ...[both, three, denied, composed, needy].map((id) => `requested ${id}`),
    "published dimitri/todo 0.1.0",
  ]);
  const tree = admin("audit", "--call", publishId);
  expect(tree.exit, tree.stderr).toBe(0);
  expect(tree.stdout.trimEnd().split("\n").slice(1).map((l) => /^( *)(call_[0-9a-f]{16})\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l)!.slice(1))).toEqual([
    ["", publishId, passId, "town/hall", "publish"],
    ["  ", expect.stringMatching(/^call_/), passId, "town/memory", "remember"],
    ["  ", expect.stringMatching(/^call_/), passId, "town/memory", "list"],
  ]);
  expect(oneLine(admin("user", "add", "Dimitri_G"))).toBe('townd admin: user name "Dimitri_G" is not a namespace; write lowercase letters, digits, and "-", starting with a letter, since it is the first part of the name of every shop the user\'s agents publish');

  const removed = admin("shop", "rm", "dimitri/todo");
  expect(removed.exit, removed.stderr).toBe(0);
  expect(typed(a, "town --help").stdout).not.toContain("dimitri/todo");
  expect(typed(a, "town todo list")).toMatchObject({ exit: 2, stderr: "error: command 'todo list' is not available to this grant\n" });

  // The criterion: the operator's verbs with the server stopped read the same database.
  const running = ["permit ls", "grant ls", "shop ls", "audit --shop town/hall"].map((v) => admin(...v.split(" ")).stdout);
  await town.stop();
  expect(["permit ls", "grant ls", "shop ls", "audit --shop town/hall"].map((v) => admin(...v.split(" ")).stdout)).toEqual(running);
  expect(admin("permit", "deny", needy).exit).toBe(0);
  expectSourcesPersonOrPublish(data);
  expect(stagings(data)).toEqual([]);
}, 180_000);

it("walks journey 3 steps 1 to 8: the hall is a shop, and never more than the agent", async () => {
  const root = tmp("hall-journey-3");
  made.push(root);
  const { town, data, a, passId, token, memoryGrant } = await hallTown(root);
  const admin = town.admin;

  // Step 1: a pass with no hall grant is told not available, and help does not list it; a constraint on request.shop holds, and no permit is made.
  const bare = admin("pass", "new", "--user", "dimitri", "--label", "no hall");
  const b = agent();
  made.push(b.dir, b.home);
  b.writeGrant(bare.stdout);
  expect(admin("grant", "new", "--pass", bare.stderr.trim(), "--shop", "town/memory", "--commands", "recall").exit).toBe(0);
  const noHall = typed(b, "town hall spec");
  expect([noHall.exit, oneLine(noHall)]).toEqual([2, "error: command 'hall spec' is not available to this grant"]);
  expect(typed(b, "town --help").stdout).not.toContain("town/hall");
  expect(admin("grant", "new", "--pass", bare.stderr.trim(), "--shop", "town/hall", "--commands", "request", "--constraint", "request.shop prefix town/").exit).toBe(0);
  const outside = typed(b, "town hall request --shop alice/notes");
  expect([outside.exit, outside.stdout, oneLine(outside)]).toEqual([2, "", "error: --shop must start with 'town/' under this grant"]);
  expect(admin("permit", "ls").stdout.trim().split("\n")).toHaveLength(1);

  // Step 2: a need moving a held type's origin, a name outside the namespace, and runtime: town, refused and written nowhere.
  const shopsBefore = admin("shop", "ls").stdout;
  const dirsBefore = readdirSync(path.join(data, "shops")).sort();
  const withCredentials = TODO_MANIFEST.replace("entry: ./main.mjs\n", 'entry: ./main.mjs\ncredentials:\n  - { type: github-token, origin: "https://api.github.example", header: "Authorization: Bearer {token}" }\n');
  writeShop(a, "creds", withCredentials, TODO_ENTRY);
  expect(sendTar(a, "creds", "publish")).toEqual({
    stdout: "credentials[0]: github-token is a type this town holds, at https://api.github.com in Authorization; leave the definition out, or write that (spec §8)\n",
    stderr: "",
    exit: 1,
  });
  for (const [dir, name, instead] of [["operators", "town/todo", "dimitri/todo"], ["adas", "ada/todo", "dimitri/todo"]] as const) {
    writeShop(a, dir, TODO_MANIFEST.replace("name: dimitri/todo", `name: ${name}`), TODO_ENTRY);
    expect(sendTar(a, dir, "publish").stdout).toBe(`name: ${name} is not under your namespace; write ${instead} instead (spec §2)\n`);
  }
  writeShop(a, "own-runtime", TODO_MANIFEST.replace("runtime: subprocess", "runtime: town"), TODO_ENTRY);
  expect(sendTar(a, "own-runtime", "publish")).toMatchObject({ exit: 1, stdout: "runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)\n" });
  expect(admin("shop", "ls").stdout).toBe(shopsBefore);
  expect(readdirSync(path.join(data, "shops")).sort()).toEqual(dirsBefore);

  // Step 3: an uncovered dependency is refused before any test, naming the shop and the command; a value outside the agent's constraint fails the test with the agent's line, and the dependency ran no process.
  const count = path.join(root, "count-shop");
  mkdirSync(count);
  writeFileSync(
    path.join(count, "manifest.yaml"),
    "name: test/count\nversion: 0.0.1\nsummary: Keeps a tally in its state, for the hall's tests.\nruntime: subprocess\nentry: ./main.mjs\ncommands:\n  - name: tick\n    summary: Add a line to the tally.\n    effect: write\n    args:\n      - { name: tag, type: string, required: true, constrainable: [prefix] }\n    output: text\ntests:\n  - name: it counts\n    run: tick --tag mine/a\n    expect: { contains: ticked }\n",
  );
  writeFileSync(path.join(count, "main.mjs"), 'import { appendFileSync } from "node:fs";\nimport path from "node:path";\nappendFileSync(path.join(process.env.TOWN_STATE, "runs.log"), "tick\\n");\nprocess.stdout.write("ticked\\n");\n');
  expect(admin("shop", "add", count).exit).toBe(0);
  const ticker = TODO_MANIFEST.replace("name: dimitri/todo", "name: dimitri/ticker")
    .replace("shop: town/memory\n    commands: [remember, list]", "shop: test/count\n    commands: [tick]")
    .replace(/commands:\n  - name: add[\s\S]*?(?=tests:)/, "commands:\n  - name: go\n    summary: Tick once, under a tag of someone else's.\n    effect: write\n    output: text\n")
    .replace(/tests:[\s\S]*$/, "tests:\n  - name: it goes\n    run: go\n    expect: { contains: ticked }\n");
  writeShop(a, "ticker", ticker, TODO_ENTRY);
  const uncovered = sendTar(a, "ticker", "test");
  expect(uncovered).toEqual({ stdout: "depends[0]: test/count at tick is not in this grant; ask for it\n", stderr: "", exit: 1 });
  const countGrant = admin("grant", "new", "--pass", passId, "--shop", "test/count", "--constraint", "tick.tag prefix mine/");
  expect(countGrant.exit, countGrant.stderr).toBe(0);
  const lacking = TODO_MANIFEST.replace("commands: [remember, list]", "commands: [remember, recall, list]");
  expect(admin("grant", "revoke", memoryGrant).exit).toBe(0);
  const listOnly = admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,list").stdout.trim();
  writeShop(a, "lacking", lacking, TODO_ENTRY);
  expect(sendTar(a, "lacking", "validate").stdout).toBe("depends[0]: this grant's town/memory lacks recall, which dimitri/todo calls; ask for it\n");
  const constrained = sendTar(a, "ticker", "publish");
  expect(constrained).toEqual({ stdout: 'not ok it goes: expected stdout to contain "ticked", got "": error: --tag must start with \'mine/\' under this grant\n', stderr: "", exit: 1 });
  const tickerCall = auditRows(admin("audit", "--shop", "town/hall").stdout).at(-1)!;
  expect(tickerCall).toMatchObject({ command: "publish", result: "shop-error", detail: "tests 0/1" });
  // The dependency ran no process for the denied call. Its tally is in the test's scratch state, which the hall deletes, so the audit is the witness here: no shop exit, no wall.
  expect(auditRows(admin("audit", "--pass", passId).stdout).filter((r) => r.parent === tickerCall.call).map((r) => [r.shop, r.command, r.result, r.shopExit, r.wall, r.detail])).toEqual([["test/count", "tick", "denied", "-", "-", "constraint tick.tag prefix"]]);
  expect(admin("shop", "ls").stdout).not.toContain("dimitri/ticker");

  // Step 4: a bundle holding a .., an absolute path, a link, a pax or GNU header, or no manifest at its root, refused naming the tar command; no staging after any.
  const odd = path.join(a.dir, "odd");
  writeShop(a, "odd", TODO_MANIFEST, TODO_ENTRY);
  writeFileSync(path.join(a.dir, "outside.mjs"), "export {};\n");
  writeShop(a, "linked", TODO_MANIFEST, TODO_ENTRY);
  symlinkSync("../outside.mjs", path.join(a.dir, "linked", "link.mjs"));
  writeShop(a, "long", TODO_MANIFEST, TODO_ENTRY);
  writeFileSync(path.join(a.dir, "long", `${"a".repeat(110)}.mjs`), "export {};\n");
  const cmd = "tar --format ustar -cf - -C <dir> .";
  const refusals: Array<[string, string]> = [
    ["tar --format ustar -P -cf - -C odd ./manifest.yaml ../outside.mjs | town hall validate", `"../outside.mjs": holds a .. segment; make the tar with ${cmd}, so every path is inside the shop (spec §1)`],
    [`tar --format ustar -P -cf - -C odd ./manifest.yaml ${path.join(a.dir, "outside.mjs")} | town hall validate`, `${JSON.stringify(path.join(a.dir, "outside.mjs"))}: is an absolute path; make the tar with ${cmd}, so every path is inside the shop (spec §1)`],
    ["tar --format ustar -cf - -C linked . | town hall validate", `"./link.mjs": is a symbolic link, not a plain file; a shop is plain files, so put the file itself there and make the tar with ${cmd} (spec §1)`],
    [`tar --format pax --no-xattrs --no-mac-metadata -cf - -C odd . | town hall validate`, `"PaxHeader/currentdir": is a pax header (type x), which a long path or an odd name needs; shorten the path and make the tar with ${cmd} (spec §1)`],
    ["tar --format gnutar -cf - -C long . | town hall validate", `"././@LongLink": is a GNU long-name header (type L), which a long path or an odd name needs; shorten the path and make the tar with ${cmd} (spec §1)`],
    ["tar --format ustar -cf - odd | town hall validate", `manifest.yaml: is not at the root of the tar; make it with ${cmd}, from the shop's directory, so the shop's files are (spec §1)`],
  ];
  for (const [line, refusal] of refusals) {
    const r = typed(a, line);
    expect([r.exit, r.stdout, r.stderr], line).toEqual([1, `${refusal}\n`, ""]);
    expect(stagings(data), line).toEqual([]);
  }
  const cut = typed(a, "tar --format ustar -cf - -C odd . | head -c 1100 | town hall publish");
  expect([cut.exit, cut.stderr]).toEqual([1, ""]);
  expect(cut.stdout).toMatch(/^"\.\/manifest\.yaml": the tar ends \d+ bytes into its content; send the whole of what tar --format ustar -cf - -C <dir> \. makes \(spec §1\)\n$|^stdin: the tar ends inside a header at byte \d+; /);
  // Bytes that are not text never leave the agent's binary.
  const rowsBefore = auditRows(admin("audit").stdout).length;
  const binary = typed(a, "printf 'us\\377\\376t' | town hall validate");
  expect(binary).toEqual({ stdout: "", stderr: "error: stdin is not text; the town carries text, so send a shop as a tar of text files\n", exit: 1 });
  expect(auditRows(admin("audit").stdout)).toHaveLength(rowsBefore);
  expect(stagings(data)).toEqual([]);
  expect(existsSync(odd)).toBe(true);

  // Step 5: a published shop runs under the contract: exactly the three names, its state under the town's root for the shop and the user, its stderr in its row; and the agent's token is in nothing it can reach.
  const envShop = `name: dimitri/reach
version: 0.1.0
summary: Prints what it can reach, for the hall's tests.
runtime: subprocess
entry: ./main.mjs
commands:
  - name: dump
    summary: Print the environment, argv, stdin, and every file under the state.
    effect: write
    args:
      - { name: note, type: string }
    output: json
tests:
  - name: it prints
    run: dump --note hi
    expect: { contains: TOWN_STATE }
`;
  const envEntry = `import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
writeFileSync(path.join(process.env.TOWN_STATE, "seen.txt"), "seen\\n");
const files = {};
const walk = (d) => { for (const e of readdirSync(d)) { const f = path.join(d, e); if (statSync(f).isDirectory()) walk(f); else files[f] = readFileSync(f, "utf8"); } };
walk(process.env.TOWN_STATE);
process.stderr.write("reached\\n");
process.stdout.write(JSON.stringify({ env: process.env, argv: process.argv.slice(2), stdin: Buffer.concat(chunks).toString("utf8"), files }));
`;
  writeShop(a, "reach", envShop, envEntry);
  expect(sendTar(a, "reach", "publish")).toMatchObject({ exit: 0, stdout: "ok it prints\npublished dimitri/reach 0.1.0; town reach --help says what it does\n" });
  const reached = typed(a, "echo from-the-agent | town reach dump --note hello");
  expect(reached.exit, reached.stderr).toBe(0);
  const seen = JSON.parse(reached.stdout) as { env: Record<string, string>; argv: string[]; stdin: string; files: Record<string, string> };
  const selfAdded = JSON.parse(spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {}, encoding: "utf8" }).stdout) as string[];
  expect(Object.keys(seen.env).filter((k) => !selfAdded.includes(k)).sort()).toEqual(["PATH", "TOWN_STATE", "TOWN_USER"]);
  const userId = db(data, "SELECT id FROM users WHERE name = 'dimitri'")[0]!.id as string;
  expect(seen.env.TOWN_USER).toBe(userId);
  expect(seen.env.TOWN_STATE).toBe(path.join(data, "state", "dimitri%2Freach", userId));
  expect(seen.argv).toEqual(["dump", "--note", "hello"]);
  expect(seen.stdin).toBe("from-the-agent\n");
  expect(Object.values(seen.files)).toEqual(["seen\n"]);
  expect(reached.stdout).not.toContain(token);
  const bytesUnder = (dir: string): Buffer => Buffer.concat(readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => readFileSync(path.join(e.parentPath, e.name))));
  expect(bytesUnder(data).includes(Buffer.from(token)), "the token is in the data directory").toBe(false);
  expect(db(data, "SELECT stderr FROM calls WHERE shop = 'dimitri/reach' AND command = 'dump'")).toEqual([{ stderr: "reached\n" }]);
  // And a published recipe runs as memory's callers do, its call to memory answered through the town.
  writeShop(a, "todo", TODO_MANIFEST, TODO_ENTRY);
  expect(sendTar(a, "todo", "publish").exit).toBe(0);
  expect(typed(a, "town todo add --item milk")).toEqual({ stdout: "added milk\n", stderr: "", exit: 0 });

  // Step 6: the publish grant is at the shop's commands, no constraints, source publish, on this pass alone; a person's grant over it stands.
  const reachRow = admin("grant", "ls").stdout.split("\n").filter((l) => /\sdimitri\/reach\s/.test(l));
  expect(reachRow.map((l) => l.split(/\s+/).slice(1, 6))).toEqual([[passId, "dimitri/reach", "dump", "publish", "-"]]);
  const second = admin("pass", "new", "--user", "dimitri", "--label", "second");
  const c = agent();
  made.push(c.dir, c.home);
  c.writeGrant(second.stdout);
  expect(typed(c, "town --help").stdout).toBe("This pass holds no grants.\n");
  expect(admin("grant", "new", "--pass", second.stderr.trim(), "--shop", "dimitri/reach").exit).toBe(0);
  expect(typed(c, "town --help").stdout).toMatch(/^dimitri\/reach\s/m);
  const publishGrant = reachRow[0]!.split(/\s+/)[0]!;
  expect(admin("grant", "revoke", publishGrant).exit).toBe(0);
  const persons = admin("grant", "new", "--pass", passId, "--shop", "dimitri/reach").stdout.trim();
  const over = sendTar(a, "reach", "publish");
  expect(over).toEqual({
    stdout: `ok it prints\nthis pass's grant ${persons} at dimitri/reach was made by a person, so it stands as it is, and this publish made none\npublished dimitri/reach 0.1.0; town reach --help says what it does\n`,
    stderr: "",
    exit: 0,
  });
  expect(rowOf(admin("grant", "ls").stdout, persons)).toMatch(/\s+-\s+-\s+-\s+-\s+live\s/);

  // Step 7: the published recipe is live by compose's rule: memory narrowed under it hides it; granted again, it is back.
  expect(typed(a, "town --help").stdout).toMatch(/^dimitri\/todo\s/m);
  expect(admin("grant", "revoke", listOnly).exit).toBe(0);
  const recallOnly = admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "recall").stdout.trim();
  expect(typed(a, "town --help").stdout).not.toContain("dimitri/todo");
  const hidden = typed(a, "town todo list");
  expect([hidden.exit, oneLine(hidden)]).toEqual([2, "error: command 'todo list' is not available to this grant"]);
  expect(admin("grant", "revoke", recallOnly).exit).toBe(0);
  expect(admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list").exit).toBe(0);
  expect(typed(a, "town --help").stdout).toMatch(/^dimitri\/todo\s+Things to do, kept in the town's notes\. \[add, done, list\]$/m);
  expect(typed(a, "town todo list")).toEqual({ stdout: "todo/milk\n", stderr: "", exit: 0 });

  // Step 8: runtime: town at shop add, and a dependency on the hall at the validator.
  const ownRuntime = path.join(a.dir, "own-runtime");
  expect(admin("shop", "add", ownRuntime).stderr).toContain("runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)\n");
  writeShop(a, "on-hall", TODO_MANIFEST.replace("shop: town/memory", "shop: town/hall").replace("commands: [remember, list]", "commands: [search]"), TODO_ENTRY);
  expect(sendTar(a, "on-hall", "validate")).toMatchObject({ exit: 1, stdout: "depends[0].shop: is town/hall, the town's own shop, which answers agents and never a shop; write a shop other than town/hall instead (spec §8)\n" });

  // The criteria: every inner call of a hall call carries the agent's pass and the agent's grant at that shop; no test grant exists; every grant's source is a person's or its publisher's.
  const inner = db(data, "SELECT c.pass_id, c.grant_id, c.shop FROM calls c JOIN calls h ON h.call_id = c.parent WHERE h.shop = 'town/hall'");
  expect(inner.length).toBeGreaterThan(0);
  const grantsById = new Map(db(data, "SELECT id, pass_id, shop FROM grants").map((g) => [g.id as string, g]));
  for (const call of inner) {
    expect(call.pass_id).toBe(passId);
    if (call.grant_id !== null) expect(grantsById.get(call.grant_id as string), JSON.stringify(call)).toMatchObject({ pass_id: passId, shop: call.shop });
  }
  expect(db(data, "SELECT COUNT(*) AS n FROM calls WHERE grant_id LIKE 'shop-test:%'")).toEqual([{ n: 0 }]);
  expectSourcesPersonOrPublish(data);
  expect(stagings(data)).toEqual([]);
}, 240_000);

it("walks wall's journey 2 step 7: a prying shop sent as a bundle runs its tests and its calls within the wall, and a test that reads beside the data directory fails at test and at publish", async () => {
  const root = tmp("hall-wall");
  made.push(root);
  const { town, data, a, passId } = await hallTown(root);
  expect(town.line).toBe(`town listening on ${town.url}, shops walled by seatbelt`);
  const listener = await originProcess();
  try {
    // The prying fixture as the agent would send it: its own name, and no credential, which a sent shop may not hold.
    const prying = readFileSync(path.join(ROOT, "test/fixtures/prying/manifest.yaml"), "utf8").replace("name: test/prying", "name: dimitri/prying").replace("credentials:\n  - type: test-origin\n", "");
    writeShop(a, "prying", prying, readFileSync(path.join(ROOT, "test/fixtures/prying/main.mjs"), "utf8"));
    expect(sendTar(a, "prying", "test")).toEqual({ stdout: "ok it reports\n", stderr: "", exit: 0 });
    expect(sendTar(a, "prying", "publish")).toEqual({ stdout: "ok it reports\npublished dimitri/prying 0.0.1; town prying --help says what it does\n", stderr: "", exit: 0 });

    // A sealed credential of dimitri's, so the vault's key is on disk to be refused: a missing file under a hidden directory is ENOENT, not EPERM.
    expect(town.adminPiped("hall-wall-not-a-token\n", "credential", "add", "--user", "dimitri", "--type", "github-token").exit).toBe(0);
    expect(existsSync(path.join(data, "vault.key"))).toBe(true);
    const mark = `town-hall-prying-${process.pid}.txt`;
    const input = JSON.stringify({ town: town.url, port: Number(new URL(listener.url).port), pid: town.pid, mark });
    const called = typed(a, `printf %s '${input}' | town prying pry`);
    expect([called.exit, called.stderr]).toEqual([0, ""]);
    const lines = called.stdout.trim().split("\n").map((l) => JSON.parse(l) as { act: string; target: string; result: string; path?: string });
    const result = (act: string, target: string) => lines.find((l) => l.act === act && l.target === target)?.result ?? `no ${act} of ${target}`;
    const d = realpathSync(data);
    const shop = path.join(d, "shops", "dimitri%2Fprying");
    const home = os.userInfo().homedir;
    expect(lines.find((l) => l.act === "computed" && l.target === "data")?.path).toBe(d);
    const refusals = Object.fromEntries(
      [
        ["read", path.join(shop, "main.mjs")],
        ["write", path.join(shop, "beside-the-entry.txt")],
        ["read", path.join(d, "vault.key")],
        ["read", path.join(d, "town.db")],
        ["list", d],
        ["list", path.join(d, "shops")],
        ["list", path.join(d, "shops", "town%2Fmemory")],
        ["list", home],
        ["list", "/tmp"],
        ["read", "/etc/hosts"],
        ["write", path.join("/Users/Shared", mark)],
        ["connect", "town"],
        ["connect", "port"],
        ["kill-0", "town"],
        ["child", "/bin/sleep"],
      ].map(([act, target]) => [`${act} ${target}`, result(act!, target!)]),
    );
    expect(refusals).toEqual({
      [`read ${path.join(shop, "main.mjs")}`]: "ok",
      [`write ${path.join(shop, "beside-the-entry.txt")}`]: "EPERM",
      [`read ${path.join(d, "vault.key")}`]: "EPERM",
      [`read ${path.join(d, "town.db")}`]: "EPERM",
      [`list ${d}`]: "EPERM",
      [`list ${path.join(d, "shops")}`]: "EPERM",
      [`list ${path.join(d, "shops", "town%2Fmemory")}`]: "EPERM",
      [`list ${home}`]: "EPERM",
      ["list /tmp"]: "EPERM",
      ["read /etc/hosts"]: "ok",
      [`write ${path.join("/Users/Shared", mark)}`]: "EPERM",
      ["connect town"]: "EPERM",
      ["connect port"]: "EPERM",
      ["kill-0 town"]: "EPERM",
      ["child /bin/sleep"]: "ok",
    });
    expect(["EPERM", "ENOTFOUND"]).toContain(result("connect", "public"));
    expect(lines.filter((l) => l.act === "write" && l.result === "ok").map((l) => path.basename(l.target))).toEqual(["pried.txt"]);
    expect(listener.seen()).toEqual([]);
    expect(existsSync(path.join("/Users/Shared", mark))).toBe(false);
    const rows = auditRows(town.admin("audit", "--pass", passId).stdout);
    expect(rows.filter((r) => r.shop === "dimitri/prying").map((r) => [r.command, r.result, r.wall])).toEqual([["pry", "ok", "seatbelt"]]);
    expect(rows.filter((r) => r.shop === "town/hall").map((r) => [r.command, r.wall])).toEqual([["test", "-"], ["publish", "-"]]);

    // A test that reads beside the data directory fails at test and at publish, the entry's EPERM on its line; nothing is published.
    writeFileSync(path.join(root, "the-operators-note.txt"), "the operator's note\n");
    const beside = "name: dimitri/beside\nversion: 0.0.1\nsummary: Reads a file beside the data directory.\nruntime: subprocess\nentry: ./main.mjs\ncommands:\n  - name: peek\n    summary: Print the note beside the data directory, or the error's code.\n    effect: read\n    output: text\ntests:\n  - name: reads the note beside the data directory\n    run: peek\n    expect: { contains: \"the operator's note\" }\n";
    const peek = 'import { readFileSync } from "node:fs";\nimport path from "node:path";\nconst data = path.dirname(path.dirname(import.meta.dirname));\ntry { process.stdout.write(readFileSync(path.join(path.dirname(data), "the-operators-note.txt"), "utf8")); } catch (e) { process.stdout.write(`${e.code}\\n`); }\n';
    writeShop(a, "beside", beside, peek);
    const failed = 'not ok reads the note beside the data directory: expected stdout to contain "the operator\'s note", got "EPERM\\n"\n';
    expect(sendTar(a, "beside", "test")).toEqual({ stdout: failed, stderr: "", exit: 1 });
    expect(sendTar(a, "beside", "publish")).toEqual({ stdout: failed, stderr: "", exit: 1 });
    expect(town.admin("shop", "ls").stdout).not.toContain("dimitri/beside");
    expect(stagings(data)).toEqual([]);
  } finally {
    await listener.stop();
  }
}, 120_000);
