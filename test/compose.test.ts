// ring: command
// Compose's journeys 2 and 1, typed, against towns this test starts, on
// fixture shops and a fake origin, so nothing needs a token or the
// network. The composed shop is test/fixtures/pair-shop, a recipe over
// test/teller at get (a need, so a teller on the user's credential) and
// test/echo at echo and sleep: journey 2's watch over github and memory,
// with the fixtures standing in. Journey 2: shop add refusing what it must,
// shop ls, grant new refused until the dependencies are held, liveness
// when one is revoked or narrowed, the audit as a tree, shop rm and a
// replacement refused, and the copy served, with a store vault made served
// too. Journey 1: help naming no dependency, one call and its three rows,
// a constraint one level down told as the agent's line with nothing sent,
// and the narrowing that hides the recipe and the grant that brings it back.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, ROOT, agent, assertBuilt, cleanup, originProcess, serve, tmp, townd, type Agent, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const ECHO = path.join(ROOT, "test/fixtures/echo-shop");
const TELLER = path.join(ROOT, "test/fixtures/teller-shop");
const PAIR = path.join(ROOT, "test/fixtures/pair-shop");
const SECRET = "compose-test-not-a-token-6c1f";
const ANSWER_BYTES = Buffer.byteLength("200\nhello from the origin");

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
});

afterAll(async () => {
  for (const t of towns) await t.stop();
  await origin?.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

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

/** A copy of a fixture shop under the test's root with `edit` applied to its manifest. */
function shopCopy(root: string, from: string, name: string, edit: (text: string) => string): string {
  const dir = path.join(root, name);
  cpSync(from, dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.yaml"), edit(readFileSync(path.join(dir, "manifest.yaml"), "utf8")));
  return dir;
}

interface AuditRow {
  pass: string;
  shop: string;
  command: string;
  result: string;
  exit: string;
  shopExit: string;
  credentials: string;
  call: string;
  parent: string;
  detail: string;
}

/** `townd admin audit`'s rows, by column; the detail is the rest of the line. */
function auditRows(stdout: string): AuditRow[] {
  const [header, ...lines] = stdout.trim().split("\n");
  expect(header).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+detail$/);
  return lines.map((l) => {
    const c = l.split(/\s+/);
    return { pass: c[1]!, shop: c[2]!, command: c[3]!, result: c[5]!, exit: c[6]!, shopExit: c[7]!, credentials: c[10]!, call: c[11]!, parent: c[12]!, detail: c.slice(13).join(" ") };
  });
}

/** A town with the type, a user, a credential, echo, and teller, as each journey starts. */
async function townWithFixtures(root: string): Promise<{ town: Town; data: string }> {
  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}").exit).toBe(0);
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const c = town.adminPiped(`${SECRET}\n`, "credential", "add", "--user", "dimitri", "--type", "test-origin");
  expect(c.exit, c.stderr).toBe(0);
  return { town, data };
}

function addShop(town: Town, dir: string, ...extra: string[]): Ran {
  const r = town.admin("shop", "add", dir, ...extra);
  expect(r.exit, r.stderr).toBe(0);
  return r;
}

/** A column of every call row in the database, read as a separate process reads the file. */
function dbColumn(data: string, sql: string): unknown[] {
  const script = `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1]); db.exec("PRAGMA busy_timeout = 5000");
    process.stdout.write(JSON.stringify(db.prepare(process.argv[2]).all()));`;
  const r = spawnSync(process.execPath, ["--no-warnings", "-e", script, path.join(data, "town.db"), sql], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as unknown[];
}

it("walks journey 2 steps 1 to 7: shop add, shop ls, grant new, liveness, the audit as a tree, shop rm, and the copy", async () => {
  const root = tmp("compose-operator");
  made.push(root);
  const { town, data } = await townWithFixtures(root);
  const admin = town.admin;

  // Step 1: the dependencies must be in the town first, with the commands named.
  const early = admin("shop", "add", PAIR, "--user", "dimitri");
  expect(early.exit).toBe(1);
  expect(early.stderr).toMatch(/^depends\[0\]\.shop: 'test\/teller' is not a shop this town holds; write one of \(\), or add it with townd admin shop add first, instead \(spec §8\)$/m);
  expect(early.stderr).toMatch(/^depends\[1\]\.shop: 'test\/echo' is not a shop this town holds;/m);
  addShop(town, ECHO);
  addShop(town, TELLER, "--user", "dimitri");
  const lacking = shopCopy(root, PAIR, "pair-lacking", (t) => t.replace("commands: [get]", "commands: [get, list]"));
  const lack = admin("shop", "add", lacking, "--user", "dimitri");
  expect(lack.exit).toBe(1);
  expect(lack.stderr).toMatch(/^depends\[0\]\.commands\[1\]: 'list' is not a command test\/teller has; write one of \(get, post\) instead \(spec §8\)$/m);
  const itself = shopCopy(root, PAIR, "pair-itself", (t) => t.replace("depends:\n", "depends:\n  - shop: test/pair\n    commands: [mark]\n"));
  expect(admin("shop", "add", itself, "--user", "dimitri").stderr).toMatch(/^depends\[0\]\.shop: is test\/pair, this shop itself; write a shop other than this one instead \(spec §8\)$/m);
  const noUser = admin("shop", "add", PAIR);
  expect([noUser.exit, oneLine(noUser)]).toEqual([1, "townd admin: shop add refused: test/pair needs test-origin; write --user <name> for whose credential its tests run on"]);
  const seenBefore = origin.seen().length;
  const pairAdd = admin("shop", "add", PAIR, "--user", "dimitri");
  expect(pairAdd, pairAdd.stderr).toEqual({ exit: 0, stdout: "ok a mark through both\nok the same answer twice\nadded test/pair 0.0.1\n", stderr: "" });
  // Its tests ran the tree: teller's calls at the origin, on dimitri's credential.
  expect(origin.seen().slice(seenBefore).map((s) => [s.url, s.headers.authorization])).toEqual([
    ["/hello", `Bearer ${SECRET}`],
    ["/hello", `Bearer ${SECRET}`],
    ["/hello", `Bearer ${SECRET}`],
  ]);
  // A loop: echo made to depend on the shop that depends on it.
  const looping = shopCopy(root, ECHO, "echo-looping", (t) => t.replace("entry: ./main.mjs\n", "entry: ./main.mjs\ndepends:\n  - shop: test/pair\n    commands: [mark]\n"));
  const loop = admin("shop", "add", looping, "--user", "dimitri");
  expect([loop.exit, oneLine(loop)]).toEqual([
    1,
    "townd admin: shop add refused: test/echo would close a loop, test/echo -> test/pair -> test/echo; a shop cannot depend on a shop that depends on it, so take test/pair out of its depends",
  ]);

  // Step 2: shop ls shows each shop's dependencies.
  const ls = admin("shop", "ls");
  expect(ls.stdout.split("\n")[0]).toMatch(/^name\s+version\s+commands\s+depends\s+added$/);
  expect(rowOf(ls.stdout, "test/pair")).toMatch(/^test\/pair\s+0\.0\.1\s+mark,changes\s+test\/teller\[get\] test\/echo\[echo,sleep\]\s+\d{4}-/);
  expect(rowOf(ls.stdout, "test/echo")).toMatch(/^test\/echo\s+0\.0\.1\s+echo,sleep,fail\s+-\s+\d{4}-/);

  // Step 3: grant new at the recipe waits for each dependency, saying which and the verb.
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "watcher");
  const passId = pass.stderr.trim();
  const a: Agent = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  const refusedTeller = admin("grant", "new", "--pass", passId, "--shop", "test/pair");
  expect([refusedTeller.exit, oneLine(refusedTeller)]).toEqual([
    1,
    `townd admin: grant refused: pass ${passId} holds no grant at test/teller covering get; grant one with townd admin grant new --pass ${passId} --shop test/teller --commands get first`,
  ]);
  expect(admin("grant", "new", "--pass", passId, "--shop", "test/teller", "--commands", "get").exit).toBe(0);
  const refusedEcho = admin("grant", "new", "--pass", passId, "--shop", "test/pair");
  expect(oneLine(refusedEcho)).toBe(`townd admin: grant refused: pass ${passId} holds no grant at test/echo covering echo, sleep; grant one with townd admin grant new --pass ${passId} --shop test/echo --commands echo,sleep first`);
  const echoOnly = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo").stdout.trim();
  const refusedLacks = admin("grant", "new", "--pass", passId, "--shop", "test/pair");
  expect([refusedLacks.exit, oneLine(refusedLacks)]).toEqual([1, `townd admin: grant refused: pass ${passId}'s grant ${echoOnly} at test/echo lacks sleep, which test/pair calls; revoke it and grant one that has it`]);
  expect(admin("grant", "ls", "--pass", passId).stdout).not.toContain("test/pair");
  expect(admin("grant", "revoke", echoOnly).exit).toBe(0);
  const echoGrant = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo,sleep");
  expect(echoGrant.exit, echoGrant.stderr).toBe(0);
  const pairGrant = admin("grant", "new", "--pass", passId, "--shop", "test/pair");
  expect(pairGrant.exit, pairGrant.stderr).toBe(0);
  const pairId = pairGrant.stdout.trim();
  expect(rowOf(admin("grant", "ls").stdout, pairId)).toMatch(/\s+live\s+-$/);
  expect(a.town("pair", "mark", "--path", "/one")).toEqual({ stdout: `marked ${ANSWER_BYTES} bytes\n`, stderr: "", exit: 0 });

  // Step 4: a dependency revoked makes the recipe's grant not live, at once; granted again, live again; narrowed, not live.
  expect(admin("grant", "revoke", echoGrant.stdout.trim()).exit).toBe(0);
  const helpAfter = a.town("--help");
  expect(helpAfter.stdout).toMatch(/^test\/teller\s/m);
  expect(helpAfter.stdout, "town --help lists the recipe with a dependency revoked").not.toContain("test/pair");
  const gone = a.town("pair", "mark", "--path", "/two");
  expect([gone.exit, oneLine(gone)]).toEqual([2, "error: command 'pair mark' is not available to this grant"]);
  expect(rowOf(admin("grant", "ls").stdout, pairId)).toMatch(/\s+not live: test\/echo not granted\s+\S+$/);
  const again = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo,sleep");
  expect(again.exit, again.stderr).toBe(0);
  expect(rowOf(admin("grant", "ls").stdout, pairId)).toMatch(/\s+live\s+\S+$/);
  expect(a.town("--help").stdout).toMatch(/^test\/pair\s/m);
  expect(admin("grant", "revoke", again.stdout.trim()).exit).toBe(0);
  const narrowed = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo");
  expect(narrowed.exit).toBe(0);
  expect(rowOf(admin("grant", "ls").stdout, pairId)).toMatch(/\s+not live: test\/echo lacks sleep\s+\S+$/);
  expect(a.town("pair", "mark", "--path", "/three").exit).toBe(2);
  expect(admin("grant", "revoke", narrowed.stdout.trim()).exit).toBe(0);
  expect(admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo,sleep").exit).toBe(0);
  expect(a.town("pair", "mark", "--path", "/four").exit).toBe(0);

  // Step 5: the audit shows the recipe's call and the two its shop made, with both ids; --call prints the tree.
  const rows = auditRows(admin("audit", "--pass", passId).stdout);
  const outer = rows.filter((r) => r.shop === "test/pair" && r.result === "ok").at(-1)!;
  expect(outer).toMatchObject({ command: "mark", parent: "-", exit: "0", shopExit: "0" });
  expect(outer.call).toMatch(/^call_[0-9a-f]{16}$/);
  const inner = rows.filter((r) => r.parent === outer.call);
  expect(inner.map((r) => [r.shop, r.command, r.result, r.credentials])).toEqual([
    ["test/teller", "get", "ok", "test-origin:1"],
    ["test/echo", "echo", "ok", "-"],
  ]);
  const passes = admin("pass", "ls").stdout;
  for (const r of rows) {
    expect(r.pass).toBe(passId);
    expect(passes).toContain(r.pass);
  }
  const tree = admin("audit", "--call", outer.call);
  expect(tree.exit, tree.stderr).toBe(0);
  const treeLines = tree.stdout.trimEnd().split("\n");
  expect(treeLines[0]).toMatch(/^call\s+at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+parent\s+detail$/);
  expect(treeLines.slice(1).map((l) => /^( *)(call_[0-9a-f]{16})\s+\S+\s+\S+\s+(\S+)\s+(\S+)/.exec(l)!.slice(1))).toEqual([
    ["", outer.call, "test/pair", "mark"],
    ["  ", inner[0]!.call, "test/teller", "get"],
    ["  ", inner[1]!.call, "test/echo", "echo"],
  ]);
  const nope = admin("audit", "--call", "call_0000000000000000");
  expect([nope.exit, oneLine(nope)]).toEqual([1, "townd admin: call call_0000000000000000 is not in the audit; townd admin audit lists the calls with their ids"]);

  // Step 6: a shop depended on is not removed, nor replaced by one lacking a command its dependent declares.
  const rm = admin("shop", "rm", "test/echo");
  expect([rm.exit, oneLine(rm)]).toEqual([1, "townd admin: shop rm refused: test/pair depends on test/echo; remove it first, or add it again without test/echo"]);
  const noSleep = shopCopy(root, ECHO, "echo-no-sleep", (t) => t.replace(/  - name: sleep\n(    .*\n)+?(?=  - name: fail)/, ""));
  expect(readFileSync(path.join(noSleep, "manifest.yaml"), "utf8")).not.toContain("sleep");
  const replaced = admin("shop", "add", noSleep);
  expect([replaced.exit, oneLine(replaced)]).toEqual([
    1,
    "townd admin: shop add refused: test/echo would not have every command its dependents declare of it: test/pair calls sleep; keep it in test/echo, or add test/pair again without it first",
  ]);
  expect(admin("shop", "ls").stdout).toBe(ls.stdout);
  expect(a.town("pair", "mark", "--path", "/five").exit).toBe(0);

  // Step 7: every verb with the server stopped; the directory copied and served is the same town.
  await town.stop();
  const stoppedGrants = admin("grant", "ls");
  expect(stoppedGrants.exit).toBe(0);
  expect(admin("audit", "--call", outer.call).stdout).toBe(tree.stdout);
  const copy = path.join(root, "copy");
  cpSync(data, copy, { recursive: true });
  const copied = await serve(copy);
  towns.push(copied);
  expect(townd(["admin", "--data", copy, "grant", "ls"], town.env).stdout).toBe(stoppedGrants.stdout);
  a.writeGrant(JSON.stringify({ ...JSON.parse(pass.stdout), town: copied.url }));
  expect(a.town("pair", "mark", "--path", "/from-the-copy")).toEqual({ stdout: `marked ${ANSWER_BYTES} bytes\n`, stderr: "", exit: 0 });
  expect(origin.seen().at(-1)).toMatchObject({ url: "/from-the-copy", headers: { authorization: `Bearer ${SECRET}` } });
  const copiedRows = auditRows(copied.admin("audit", "--pass", passId).stdout);
  const fromTheCopy = copiedRows.filter((r) => r.shop === "test/pair").at(-1)!;
  expect(copiedRows.filter((r) => r.parent === fromTheCopy.call).map((r) => r.shop)).toEqual(["test/teller", "test/echo"]);

  // A store vault made, served under compose: its rows are there and gain the columns.
  const vaultData = path.join(root, "vault-town");
  mkdirSync(vaultData, { mode: 0o700 });
  const fixture = readFileSync(path.join(ROOT, "test/fixtures/vault-store.sql"), "utf8");
  const load = spawnSync(process.execPath, ["--no-warnings", "-e", 'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync(process.argv[1]).exec(require("node:fs").readFileSync(process.argv[2], "utf8"));', path.join(vaultData, "town.db"), path.join(ROOT, "test/fixtures/vault-store.sql")], { encoding: "utf8" });
  expect(load.status, load.stderr).toBe(0);
  writeFileSync(path.join(vaultData, "vault.key"), Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(fixture)![1]!, "hex"), { mode: 0o600 });
  const vaultTown = await serve(vaultData);
  towns.push(vaultTown);
  expect(vaultTown.admin("user", "ls").stdout).toMatch(/^user_77d9a83d236eb0ef\s+dimitri\s/m);
  expect(vaultTown.admin("pass", "ls").stdout).toMatch(/^pass_a648d98fa018fc7c\s+dimitri\s+research assistant\s/m);
  expect(rowOf(vaultTown.admin("grant", "ls").stdout, "grant_030cbc25002da6c4")).toMatch(/town\/memory\s+remember,recall\s+remember\.key prefix notes\/\s+-\s+-\s+live\s+\S+$/);
  expect(rowOf(vaultTown.admin("credential", "ls").stdout, "credential_8022cf4f70caccdb")).toMatch(/dimitri\s+github-token\s+dimitri's PAT\s+\S+\s+active\s+-$/);
  const oldRows = auditRows(vaultTown.admin("audit").stdout);
  expect(oldRows.map((r) => [r.command, r.result, r.parent, r.detail])).toEqual([
    ["remember", "ok", "-", "-"],
    ["recall", "ok", "-", "-"],
    ["forget", "denied", "-", "command"],
  ]);
  for (const r of oldRows) expect(r.call).toMatch(/^call_[0-9a-f]{16}$/);
  expect(dbColumn(vaultData, "SELECT value FROM meta WHERE key = 'schema'")).toEqual([{ value: "3" }]);
  // And it is a working town: memory added again, a new pass, a call, a new row after the old.
  addShop(vaultTown, MEMORY);
  const vaultPass = vaultTown.admin("pass", "new", "--user", "dimitri", "--label", "after the migration");
  expect(vaultTown.admin("grant", "new", "--pass", vaultPass.stderr.trim(), "--shop", "town/memory", "--commands", "recall").exit).toBe(0);
  const b: Agent = agent();
  made.push(b.dir, b.home);
  b.writeGrant(vaultPass.stdout);
  expect(b.town("memory", "recall", "--key", "notes/none")).toMatchObject({ exit: 1 });
  expect(auditRows(vaultTown.admin("audit").stdout)).toHaveLength(4);
}, 180_000);

it("walks journey 1 steps 1 to 6 on the fixture recipe: help, one call and its three rows, a denial one level down, and the narrowing", async () => {
  const root = tmp("compose-agent");
  made.push(root);
  const { town, data } = await townWithFixtures(root);
  const admin = town.admin;
  addShop(town, ECHO);
  addShop(town, TELLER, "--user", "dimitri");
  addShop(town, PAIR, "--user", "dimitri");
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "issue watcher");
  const passId = pass.stderr.trim();
  const tellerGrant = admin("grant", "new", "--pass", passId, "--shop", "test/teller", "--commands", "get", "--constraint", "get.path prefix /repos/mine/").stdout.trim();
  let echoGrant = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo,sleep").stdout.trim();
  const pairGrant = admin("grant", "new", "--pass", passId, "--shop", "test/pair").stdout.trim();
  for (const g of [tellerGrant, echoGrant, pairGrant]) expect(g).toMatch(/^grant_[0-9a-f]{16}$/);
  const a: Agent = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  // Step 1: the three shops with their commands, and nothing of which depends on which.
  const help = a.town("--help");
  expect(help.exit).toBe(0);
  const shopLines = help.stdout.split("\n").filter((l) => l.startsWith("test/"));
  expect(shopLines.map((l) => [l.split(/\s+/)[0], /\[[^\]]*\]$/.exec(l)![0]])).toEqual([
    ["test/echo", "[echo, sleep]"],
    ["test/pair", "[mark, changes]"],
    ["test/teller", "[get]"],
  ]);
  expect(help.stdout.toLowerCase()).not.toContain("depend");
  expect(rowOf(help.stdout, "test/pair")).not.toMatch(/teller|echo/);

  // Step 2: the recipe's help is gate's help: summary, guidance, its two commands, the grant; nothing about a dependency.
  const pairHelp = a.town("pair", "--help");
  expect(pairHelp.exit).toBe(0);
  expect(pairHelp.stdout).toContain("test/pair: Fetches a path at the origin and hands the answer on, a recipe over two shops for compose's tests.");
  expect(pairHelp.stdout).toContain("A path starts with a slash.");
  expect(pairHelp.stdout).toContain("  town pair mark --path <string>\n");
  expect(pairHelp.stdout).toContain("  town pair changes --path <string>\n");
  expect(pairHelp.stdout).toContain("this grant: issue watcher; does not expire\nconstraints: none");
  for (const word of ["teller", "echo", "depend", "test-origin", tellerGrant, echoGrant]) expect(pairHelp.stdout.toLowerCase(), word).not.toContain(word.toLowerCase());

  // Step 3: one call, and three audit rows, the inner two naming the outer, each with the agent's pass and grant.
  const seen = origin.seen().length;
  expect(a.town("pair", "mark", "--path", "/repos/mine/issues")).toEqual({ stdout: `marked ${ANSWER_BYTES} bytes\n`, stderr: "", exit: 0 });
  expect(origin.seen().slice(seen).map((s) => s.url)).toEqual(["/repos/mine/issues"]);
  // Help calls are rows too, with no command; the call is the rest, the outer started first.
  const rows = auditRows(admin("audit", "--pass", passId).stdout).filter((r) => r.command !== "-");
  const mark = rows.find((r) => r.shop === "test/pair")!;
  expect(rows.map((r) => [r.pass, r.shop, r.command, r.result, r.parent === "-" ? "outer" : r.parent === mark.call ? "inner" : "?"])).toEqual([
    [passId, "test/pair", "mark", "ok", "outer"],
    [passId, "test/teller", "get", "ok", "inner"],
    [passId, "test/echo", "echo", "ok", "inner"],
  ]);
  const granted = dbColumn(data, "SELECT call_id, pass_id, grant_id FROM calls WHERE command IS NOT NULL ORDER BY at, id") as Array<{ call_id: string; pass_id: string; grant_id: string }>;
  expect(granted.map((r) => [r.pass_id, r.grant_id])).toEqual([
    [passId, pairGrant],
    [passId, tellerGrant],
    [passId, echoGrant],
  ]);

  // Step 4: the other command, through both again.
  expect(a.town("pair", "changes", "--path", "/repos/mine/issues")).toEqual({ stdout: "changed: no\n", stderr: "", exit: 0 });

  // Step 5: a value outside the agent's constraint at the teller is the teller's line, exit 2, and nothing reaches the origin.
  const before = origin.seen().length;
  const outside = a.town("pair", "mark", "--path", "/repos/someone-else/issues");
  expect([outside.exit, outside.stdout, oneLine(outside)]).toEqual([2, "", "error: --path must start with '/repos/mine/' under this grant"]);
  const direct = a.town("teller", "get", "--path", "/repos/someone-else/issues");
  expect(direct.stderr).toBe(outside.stderr);
  expect(origin.seen().length).toBe(before);
  const denied = auditRows(admin("audit", "--pass", passId).stdout).slice(-3, -1);
  expect(denied.map((r) => [r.shop, r.command, r.result, r.exit, r.shopExit, r.detail])).toEqual([
    ["test/pair", "mark", "denied", "2", "2", "inner"],
    ["test/teller", "get", "denied", "2", "-", "constraint get.path prefix"],
  ]);
  expect(denied[1]!.parent).toBe(denied[0]!.call);

  // Step 6: echo narrowed under the recipe: help drops it, a call is not available, the dependencies answer as before; widened, it is back.
  expect(admin("grant", "revoke", echoGrant).exit).toBe(0);
  const narrow = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo").stdout.trim();
  const narrowed = a.town("--help").stdout;
  expect(narrowed).not.toContain("test/pair");
  expect(narrowed).toMatch(/^test\/echo\s.*\[echo\]$/m);
  const hidden = a.town("pair", "mark", "--path", "/repos/mine/issues");
  expect([hidden.exit, oneLine(hidden)]).toEqual([2, "error: command 'pair mark' is not available to this grant"]);
  expect(a.town("teller", "get", "--path", "/repos/mine/issues")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  expect(a.town("echo", "echo", "--zeta", "z").exit).toBe(0);
  expect(admin("grant", "revoke", narrow).exit).toBe(0);
  echoGrant = admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo,sleep").stdout.trim();
  expect(a.town("--help").stdout).toMatch(/^test\/pair\s.*\[mark, changes\]$/m);
  expect(a.town("pair", "mark", "--path", "/repos/mine/issues").exit).toBe(0);

  // The criteria: every row carries the agent's pass, every grant named is the agent's, nothing restarted.
  const all = dbColumn(data, "SELECT pass_id, grant_id FROM calls") as Array<{ pass_id: string; grant_id: string | null }>;
  const agentGrants = admin("grant", "ls", "--pass", passId).stdout;
  for (const r of all) {
    expect(r.pass_id).toBe(passId);
    if (r.grant_id !== null) expect(agentGrants).toContain(r.grant_id);
  }
}, 180_000);
