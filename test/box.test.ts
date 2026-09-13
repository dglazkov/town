// ring: command
// Wall's journey 1, the operator's box has walls, steps 1 to 3: serve with
// no flag names the box's seatbelt and --wall none names none; a box
// without a wall, told so through the environment name the test alone
// sets, refuses serve and admin before any listen or verb in the design's
// words; shop add fails a test that reads beside the data directory,
// EPERM on its line, and passes it under --wall none; the audit's wall
// column in the table and in a tree, seatbelt where a process ran and -
// where none did; a store hall made printing - on every row; and a data
// directory given through the link /tmp, as AGENTS.md writes it, where
// memory is a worker shop and its calls' rows say seatbelt. Then
// gate's journey 2, the operator's box, steps 1 to 7 as one walk against a
// town on a free port with a data directory made and deleted here; the
// agent's calls of journey 1 inside step 5; and journey 4 step 5, the
// same shop added to a second town and working there unchanged.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, NO_WALL_ENV, ROOT, agent, assertBuilt, cleanup, cleanEnv, serve, tmp, townd, type Agent, type Ran, type Town } from "./helpers/town.js";

const made: string[] = [];
const towns: Town[] = [];

beforeAll(() => assertBuilt());

afterAll(async () => {
  for (const t of towns) await t.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

function track<T extends string>(p: T): T {
  made.push(p);
  return p;
}

function oneLine(r: Ran): string {
  const lines = r.stderr.split("\n").filter((l) => l !== "");
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

function allBytes(dir: string): Buffer {
  const parts: Buffer[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else parts.push(readFileSync(full));
    }
  };
  walk(dir);
  return Buffer.concat(parts);
}

const NO_WALL = "this box has no wall; a shop would run with the box's authority. Write --wall none to run it anyway.";

/** The audit's rows as [shop, command, result, wall], the table's or a tree's, read under its header. */
function walls(table: string): string[][] {
  const [header, ...rows] = table.trimEnd().split("\n");
  const names = header!.split(/\s{2,}/);
  expect(names).toContain("wall");
  return rows.map((r) => {
    const c = r.trim().split(/\s+/);
    const at = (n: string) => c[names.indexOf(n)]!;
    return [at("shop"), at("command"), at("result"), at("wall")];
  });
}

it("walls the operator's box, wall's journey 1 steps 1 to 3: serve names its wall, a box without one is refused, a test reading beside the data directory fails walled, and the audit's wall column", async () => {
  const root = track(tmp("walls"));
  const data = path.join(root, "town");

  // Step 1: serve with no flag is walled by the box's seatbelt, and says so first.
  const town = await serve(data);
  towns.push(town);
  expect(town.line).toBe(`town listening on ${town.url}, shops walled by seatbelt`);
  expect(town.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

  // A box without a wall, told so through the environment name: serve and admin refused, before any listen or verb.
  const noWall = cleanEnv(town.env.HOME!, { [NO_WALL_ENV]: "1" });
  const elsewhere = path.join(root, "never-served");
  expect(townd(["serve", "--data", elsewhere, "--port", "0"], noWall)).toEqual({ stdout: "", stderr: `townd serve: ${NO_WALL}\n`, exit: 1 });
  expect(townd(["serve", "--data", elsewhere, "--port", "0", "--wall", "seatbelt"], noWall)).toEqual({
    stdout: "",
    stderr: `townd serve: --wall seatbelt: this box, ${os.hostname()}, has no seatbelt wall; a shop would run with the box's authority. Write --wall none to run it anyway.\n`,
    exit: 1,
  });
  expect(townd(["serve", "--data", elsewhere, "--port", "0", "--wall", "gvisor"], cleanEnv(root))).toEqual({ stdout: "", stderr: "townd serve: --wall gvisor is not a wall; write seatbelt or none\n", exit: 1 });
  expect(existsSync(elsewhere), "a refused serve made its data directory").toBe(false);
  expect(townd(["admin", "--data", data, "shop", "add", MEMORY], noWall)).toEqual({ stdout: "", stderr: `townd admin: ${NO_WALL}\n`, exit: 1 });
  expect(townd(["admin", "--data", data, "--wall", "seatbelt", "user", "ls"], noWall).stderr).toMatch(/^townd admin: --wall seatbelt: this box, .+, has no seatbelt wall;/);
  expect(town.admin("shop", "ls").stdout).not.toContain("town/memory");
  // --wall none, said out loud, serves on such a box, and names none.
  const unwalled = await serve(path.join(root, "unwalled"), { flags: ["--wall", "none"], env: { [NO_WALL_ENV]: "1" } });
  towns.push(unwalled);
  expect(unwalled.line).toBe(`town listening on ${unwalled.url}, shops walled by none`);

  // Step 2: a shop whose test reads a file beside the data directory fails that test walled, EPERM on its line, and passes it under --wall none.
  writeFileSync(path.join(root, "the-operators-note.txt"), "the operator's note\n");
  const beside = track(tmp("beside-shop"));
  writeFileSync(
    path.join(beside, "manifest.yaml"),
    "name: test/beside\nversion: 0.0.1\nsummary: Reads a file beside the data directory, for the wall's tests.\nruntime: subprocess\nentry: ./main.mjs\ncommands:\n  - name: peek\n    summary: Print the note beside the data directory, or the error's code.\n    effect: read\n    output: text\ntests:\n  - name: reads the note beside the data directory\n    run: peek\n    expect: { contains: \"the operator's note\" }\n",
  );
  // Its copy is tested at <data>/shops/<staging>/, so the data directory is two up and the note beside it.
  writeFileSync(
    path.join(beside, "main.mjs"),
    'import { readFileSync } from "node:fs";\nimport path from "node:path";\nconst data = path.dirname(path.dirname(import.meta.dirname));\ntry { process.stdout.write(readFileSync(path.join(path.dirname(data), "the-operators-note.txt"), "utf8")); } catch (e) { process.stdout.write(`${e.code}\\n`); }\n',
  );
  const walledAdd = town.admin("shop", "add", beside);
  expect([walledAdd.exit, walledAdd.stdout]).toEqual([1, 'not ok reads the note beside the data directory: expected stdout to contain "the operator\'s note", got "EPERM\\n"\n']);
  expect(walledAdd.stderr).toBe("townd admin: shop add refused: test/beside's test 'reads the note beside the data directory' failed; fix the shop and add it again\n");
  expect(town.admin("shop", "ls").stdout).not.toContain("test/beside");
  const unwalledAdd = town.admin("--wall", "none", "shop", "add", beside);
  expect([unwalledAdd.exit, unwalledAdd.stdout], unwalledAdd.stderr).toEqual([0, "ok reads the note beside the data directory\nadded test/beside 0.0.1\n"]);
  expect(town.admin("shop", "rm", "test/beside").exit).toBe(0);

  // Step 3: the wall column. Calls whose process ran say seatbelt, a relay denied one level down included; a denied call, a refused one, a help, and the hall's own say -.
  for (const dir of ["test/fixtures/echo-shop", "test/fixtures/recipe-shop"]) expect(town.admin("shop", "add", path.join(ROOT, dir)).exit).toBe(0);
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "dimitri", "--label", "walled");
  const passId = pass.stderr.trim();
  for (const [shop, commands] of [["test/echo", "echo"], ["test/recipe", "relay"], ["town/hall", "spec"]] as const) {
    expect(town.admin("grant", "new", "--pass", passId, "--shop", shop, "--commands", commands).exit).toBe(0);
  }
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  expect(a.town("recipe", "relay", "--words", "echo echo --zeta z").exit).toBe(0);
  expect(a.town("recipe", "relay", "--words", "echo sleep").exit).toBe(2);
  expect(a.town("echo", "fail").exit).toBe(2);
  expect(a.town("echo", "echo").exit).toBe(1);
  expect(a.town("hall", "spec").exit).toBe(0);
  expect(a.town("--help").exit).toBe(0);
  const audit = town.admin("audit", "--pass", passId);
  expect(audit.stdout.split("\n")[0]).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+wall\s+detail$/);
  // The tree of the relay denied one level down: its process ran, its dependency's did not.
  const deniedRelay = audit.stdout.split("\n").find((l) => /\srelay\s.*\sdenied\s/.test(l))!.split(/\s+/)[11]!;
  const tree = town.admin("audit", "--call", deniedRelay);
  expect(tree.stdout.split("\n")[0]).toMatch(/^call\s+at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+parent\s+wall\s+detail$/);
  expect(walls(tree.stdout)).toEqual([
    ["test/recipe", "relay", "denied", "seatbelt"],
    ["test/echo", "sleep", "denied", "-"],
  ]);
  // And the whole table: the rows a tree does not reach say the same.
  expect(walls(audit.stdout)).toEqual([
    ["test/recipe", "relay", "ok", "seatbelt"],
    ["test/echo", "echo", "ok", "seatbelt"],
    ["test/recipe", "relay", "denied", "seatbelt"],
    ["test/echo", "sleep", "denied", "-"],
    ["test/echo", "fail", "denied", "-"],
    ["test/echo", "echo", "usage", "-"],
    ["town/hall", "spec", "ok", "-"],
    ["-", "-", "ok", "-"],
  ]);
  // Under --wall none, on the box told it has no wall, admin too: a call whose process ran says none.
  const admin2 = (...args: string[]) => unwalled.admin("--wall", "none", ...args);
  expect(unwalled.admin("user", "ls")).toMatchObject({ exit: 1, stderr: `townd admin: ${NO_WALL}\n` });
  expect(admin2("shop", "add", path.join(ROOT, "test/fixtures/echo-shop")).exit).toBe(0);
  expect(admin2("user", "add", "dimitri").exit).toBe(0);
  const pass2 = admin2("pass", "new", "--user", "dimitri", "--label", "unwalled");
  expect(admin2("grant", "new", "--pass", pass2.stderr.trim(), "--shop", "test/echo").exit).toBe(0);
  a.writeGrant(pass2.stdout);
  expect(a.town("echo", "echo", "--zeta", "z").exit).toBe(0);
  expect(walls(admin2("audit").stdout)).toEqual([["test/echo", "echo", "ok", "none"]]);

  // A store hall made opens under wall with every row, the column - on each, in the table and in a tree.
  const hallData = path.join(root, "hall-town");
  mkdirSync(hallData, { mode: 0o700 });
  const fixture = readFileSync(path.join(ROOT, "test/fixtures/hall-store.sql"), "utf8");
  const load = spawnSync(process.execPath, ["--no-warnings", "-e", 'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync(process.argv[1]).exec(require("node:fs").readFileSync(process.argv[2], "utf8"));', path.join(hallData, "town.db"), path.join(ROOT, "test/fixtures/hall-store.sql")], { encoding: "utf8" });
  expect(load.status, load.stderr).toBe(0);
  writeFileSync(path.join(hallData, "vault.key"), Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(fixture)![1]!, "hex"), { mode: 0o600 });
  const hallAudit = townd(["admin", "--data", hallData, "audit"], cleanEnv(root));
  expect(hallAudit.exit, hallAudit.stderr).toBe(0);
  expect(walls(hallAudit.stdout).map((r) => r.join(" "))).toEqual([
    "town/memory remember ok -",
    "town/memory recall ok -",
    "town/memory forget denied -",
    "town/memory remember ok -",
    "town/memory list ok -",
    "town/hall publish ok -",
    "dimitri/todo add ok -",
    "town/memory remember ok -",
    "town/hall request ok -",
  ]);
  expect(walls(townd(["admin", "--data", hallData, "audit", "--call", "call_870c75345727b30e"], cleanEnv(root)).stdout)).toEqual([
    ["town/hall", "publish", "ok", "-"],
    ["town/memory", "remember", "ok", "-"],
    ["town/memory", "list", "ok", "-"],
  ]);
}, 120_000);

it("serves a data directory given through the link /tmp, as AGENTS.md writes it, walled: memory added, its tests passing, and a call at it", async () => {
  // Not tmp(), which is os.tmpdir(): a directory made under /tmp itself, so the data directory's path goes through the link.
  const root = track(mkdtempSync("/tmp/town-box-link-"));
  const data = path.join(root, "data");
  const env = cleanEnv(root);
  const added = townd(["admin", "--data", data, "shop", "add", MEMORY], env);
  expect([added.exit, added.stderr]).toEqual([0, ""]);
  expect(added.stdout).toMatch(/^ok roundtrip$/m);
  expect(added.stdout).toMatch(/^added town\/memory 0\.1\.0$/m);
  // Memory is a worker shop (box's journey 3): its calls below run through bin/main.js, within the same seatbelt.
  expect(readFileSync(path.join(data, "shops", "town%2Fmemory", "manifest.yaml"), "utf8")).toMatch(/^runtime: worker$/m);
  const town = await serve(data);
  towns.push(town);
  expect(town.line).toBe(`town listening on ${town.url}, shops walled by seatbelt`);
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "dimitri", "--label", "through the link");
  expect(town.admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "town/memory").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  expect(a.town("memory", "remember", "--key", "notes/link", "--value", "through /tmp")).toEqual({ stdout: "", stderr: "", exit: 0 });
  expect(a.town("memory", "recall", "--key", "notes/link")).toEqual({ stdout: "through /tmp\n", stderr: "", exit: 0 });
  expect(walls(town.admin("audit").stdout)).toEqual([
    ["town/memory", "remember", "ok", "seatbelt"],
    ["town/memory", "recall", "ok", "seatbelt"],
  ]);
}, 60_000);

it("walks the operator's box, journey 2 steps 1 to 7", async () => {
  const root = track(tmp("box"));
  const data = path.join(root, "town");

  // Step 1: serve refuses a data directory under an agent's directory, and starts outside one.
  const agentsDir = path.join(root, "someone-agent");
  mkdirSync(path.join(agentsDir, ".town"), { recursive: true });
  writeFileSync(path.join(agentsDir, ".town", "grant"), "{}");
  const refused = townd(["serve", "--data", path.join(agentsDir, "deep", "data"), "--port", "0"], cleanEnv(root));
  expect(refused.exit).toBe(1);
  expect(refused.stderr).toContain(path.join(agentsDir, ".town", "grant"));
  expect(existsSync(path.join(agentsDir, "deep"))).toBe(false);

  const town = await serve(data);
  towns.push(town);
  expect(town.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(await (await fetch(`${town.url}/`)).text()).toBe("town\n");

  // Step 2: shop add validates, runs the shop's tests, copies the directory.
  const broken = track(tmp("broken-shop"));
  cpSync(MEMORY, broken, { recursive: true });
  writeFileSync(path.join(broken, "manifest.yaml"), readFileSync(path.join(broken, "manifest.yaml"), "utf8").replace("effect: destructive", "effect: delete"));
  const badManifest = town.admin("shop", "add", broken);
  expect(badManifest.exit).toBe(1);
  expect(badManifest.stderr).toMatch(/^commands\[3\]\.effect: is not an effect; write one of read, write, destructive instead \(spec §3\)$/m);

  const failing = track(tmp("failing-shop"));
  cpSync(MEMORY, failing, { recursive: true });
  writeFileSync(path.join(failing, "manifest.yaml"), readFileSync(path.join(failing, "manifest.yaml"), "utf8").replace("expect: { contains: hello }", "expect: { contains: goodbye }"));
  const badTests = town.admin("shop", "add", failing);
  expect(badTests.exit).toBe(1);
  expect(badTests.stderr).toContain("'roundtrip' failed");
  expect(town.admin("shop", "ls").stdout).not.toContain("town/memory");

  const added = town.admin("shop", "add", MEMORY);
  expect(added.exit, added.stderr).toBe(0);
  expect(added.stdout).toMatch(/^ok roundtrip$/m);
  expect(added.stdout).toMatch(/^added town\/memory 0\.1\.0$/m);
  expect(readFileSync(path.join(data, "shops", "town%2Fmemory", "manifest.yaml"), "utf8")).toBe(readFileSync(path.join(MEMORY, "manifest.yaml"), "utf8"));

  // Step 3: a user, a pass; the grant file on stdout, the id on stderr. From here the shell names the data directory once.
  const opEnv = { ...town.env, TOWN_DATA: data };
  const admin = (...args: string[]) => townd(["admin", ...args], opEnv);
  expect(admin("user", "add", "dimitri").exit).toBe(0);
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "research assistant");
  expect(pass.exit, pass.stderr).toBe(0);
  const grantFile = JSON.parse(pass.stdout) as { town: string; token: string };
  expect(Object.keys(grantFile).sort()).toEqual(["token", "town"]);
  expect(grantFile.town).toBe(town.url);
  expect(Buffer.from(grantFile.token, "base64url").length).toBeGreaterThanOrEqual(32);
  const passId = pass.stderr.trim();
  expect(passId).toMatch(/^pass_[0-9a-f]+$/);
  expect(admin("pass", "ls").stdout).not.toContain(grantFile.token);

  // Step 4: the grant, and grant ls with its last use.
  const grant = admin(
    "grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list",
    "--constraint", "remember.key prefix notes/", "--constraint", "recall.key prefix notes/", "--expires", "30d",
  );
  expect(grant.exit, grant.stderr).toBe(0);
  const grantId = grant.stdout.trim();
  expect(grantId).toMatch(/^grant_[0-9a-f]+$/);
  const before = admin("grant", "ls").stdout.split("\n").find((l) => l.startsWith(grantId))!;
  expect(before).toContain("remember,recall,list");
  expect(before).toMatch(/\s-\s+\S+\s+live\s+-$/);

  // Step 5: the agent of journey 1 works.
  const a: Agent = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  const help = a.town("--help");
  expect(help.exit, help.stderr).toBe(0);
  const shopLines = help.stdout.split("\n").filter((l) => /^\S+\/\S+\s/.test(l));
  expect(shopLines).toEqual([expect.stringMatching(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/)]);
  for (const secret of [grantFile.token, town.url, "127.0.0.1", "dimitri", passId]) expect(help.stdout).not.toContain(secret);
  expect(help.stdout).not.toContain("forget");

  const shopHelp = a.town("memory", "--help");
  expect(shopHelp.exit).toBe(0);
  expect(shopHelp.stdout).toContain("research assistant");
  expect(shopHelp.stdout).toContain("keys under `notes/` only");
  expect(shopHelp.stdout).not.toContain("forget");

  const remember = a.town("memory", "remember", "--key", "notes/lunch", "--value", "tacos, Thursday");
  expect(remember).toEqual({ stdout: "", stderr: "", exit: 0 });
  expect(a.town("memory", "recall", "--key", "notes/lunch")).toEqual({ stdout: "tacos, Thursday\n", stderr: "", exit: 0 });
  const forget = a.town("memory", "forget", "--key", "notes/lunch");
  expect(forget.exit).toBe(2);
  expect(oneLine(forget)).toBe("error: command 'forget' is not available to this grant");
  const json = a.town("memory", "recall", "--key", "notes/lunch", "--json");
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout)).toEqual({ ok: true, output: "tacos, Thursday\n", notices: [], exit: 0 });

  // Stdin through a shell pipe reaches the shop.
  expect(a.townPiped("soup, Friday", "memory", "remember", "--key", "notes/dinner").exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "notes/dinner").stdout).toBe("soup, Friday\n");

  // The operator's words are unknown to the agent's command.
  for (const word of ["serve", "admin", "spec"]) {
    const r = a.town(word);
    expect(r.exit, word).toBe(1);
    expect(oneLine(r)).toBe(`error: town has no command '${word}'`);
  }

  const audit = admin("audit", "--pass", passId);
  expect(audit.exit).toBe(0);
  const rows = audit.stdout.trim().split("\n");
  expect(rows[0]).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+wall\s+detail$/);
  const body = rows.slice(1);
  expect(body.map((r) => r.split(/\s+/)[5])).toEqual(["ok", "ok", "ok", "ok", "denied", "ok", "ok", "ok", "usage", "usage", "usage"]);
  expect(body[4]).toMatch(/town\/memory\s+forget\s+[0-9a-f]{64}\s+denied\s+2\s+-/);
  const at = body.map((r) => r.split(/\s+/)[0]!);
  expect([...at].sort()).toEqual(at);
  for (const secret of ["tacos", "notes/lunch", "soup"]) expect(audit.stdout).not.toContain(secret);
  const stored = allBytes(data);
  expect(stored.includes(Buffer.from(grantFile.token))).toBe(false);
  expect(stored.includes(Buffer.from("tacos, Thursday"))).toBe(true); // the shop's state is here; the audit is not
  const lastUse = admin("grant", "ls").stdout.split("\n").find((l) => l.startsWith(grantId))!;
  expect(lastUse).toMatch(/live\s+\d{4}-\d\d-\d\dT[\d:]+Z$/);

  // A second pass for the same user, to find the town whole in step 7.
  const pass2 = admin("pass", "new", "--user", "dimitri", "--label", "second");
  const pass2Id = pass2.stderr.trim();
  expect(admin("grant", "new", "--pass", pass2Id, "--shop", "town/memory", "--commands", "recall").exit).toBe(0);
  const b: Agent = agent();
  made.push(b.dir, b.home);
  b.writeGrant(pass2.stdout);

  // Step 6: revocation is seen by the next call, no restart.
  expect(admin("grant", "revoke", grantId).exit).toBe(0);
  const afterGrant = a.town("memory", "recall", "--key", "notes/lunch");
  expect(afterGrant.exit).toBe(2);
  expect(oneLine(afterGrant)).toBe("error: command 'memory recall' is not available to this grant");
  const helpAfter = a.town("--help");
  expect(helpAfter.exit).toBe(0);
  expect(helpAfter.stdout).not.toContain("memory");

  expect(admin("pass", "revoke", passId).exit).toBe(0);
  for (const call of [["--help"], ["memory", "recall", "--key", "notes/lunch"], ["anything", "at", "all"]]) {
    const r = a.town(...call);
    expect(r.exit, call.join(" ")).toBe(3);
    expect(oneLine(r)).toBe("error: this pass is not valid: its token is unknown, revoked, or expired");
  }
  expect(b.town("memory", "recall", "--key", "notes/lunch").stdout).toBe("tacos, Thursday\n");

  // Step 7: stop, copy, serve the copy: the same town.
  const grantsBefore = admin("grant", "ls").stdout;
  await town.stop();
  expect(admin("pass", "ls").exit).toBe(0); // the admin works with the server stopped
  const copy = path.join(root, "copy");
  cpSync(data, copy, { recursive: true });
  const second = await serve(copy);
  towns.push(second);
  expect(townd(["admin", "--data", copy, "grant", "ls"], opEnv).stdout).toBe(grantsBefore);
  b.writeGrant(JSON.stringify({ ...JSON.parse(pass2.stdout), town: second.url }));
  expect(b.town("memory", "recall", "--key", "notes/lunch")).toEqual({ stdout: "tacos, Thursday\n", stderr: "", exit: 0 });
  a.writeGrant(JSON.stringify({ ...grantFile, town: second.url }));
  expect(a.town("--help").exit).toBe(3);

  // Step 1's claim, at the end: the data directory holds the database, the shops' code, and the shops' state.
  expect(readdirSync(data).filter((f) => !/^town\.db(-wal|-shm)?$/.test(f)).sort()).toEqual(["shops", "state"]);
}, 120_000);

it("adds the same shop to a second town, where it works unchanged (journey 4 step 5)", async () => {
  const data = track(tmp("second-town"));
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "someone").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "someone", "--label", "elsewhere");
  expect(town.admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "town/memory").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  expect(a.town("memory", "remember", "--key", "x/y", "--value", "here too").exit).toBe(0);
  expect(a.town("memory", "list").stdout).toBe("x/y\n");
  expect(a.town("memory", "forget", "--key", "x/y").exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "x/y").exit).toBe(1);
}, 60_000);

it("keeps no argument in the audit, even from a shop that failed (journey 1's first criterion)", async () => {
  const data = track(tmp("no-arguments"));
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "someone").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "someone", "--label", "careful");
  const passId = pass.stderr.trim();
  expect(town.admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list", "--constraint", "recall.key prefix notes/").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  const distinctive = ["notes/zebra-4417", "quagga-value-9203", "secret/okapi-5581", "gnu-stray-7730", "tapir-escape-3319"];
  const failedRecall = a.town("memory", "recall", "--key", "notes/zebra-4417");
  expect(failedRecall).toEqual({ stdout: "", stderr: "error: town/memory recall failed\nno value under that key\n", exit: 1 });
  expect(a.town("memory", "remember", "--key", "notes/a", "--value", "quagga-value-9203").exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "secret/okapi-5581").exit).toBe(2);
  expect(a.town("memory", "list", "gnu-stray-7730").exit).toBe(1);
  expect(a.town("memory", "remember", "--key", "../tapir-escape-3319", "--value", "x")).toMatchObject({ exit: 1, stderr: "error: town/memory remember failed\nthe key is outside the state\n" });
  expect(a.town("memory", "forget", "--key", "notes/zebra-4417").exit).toBe(2);

  const audit = town.admin("audit", "--pass", passId);
  expect(audit.exit).toBe(0);
  const rows = audit.stdout.trim().split("\n").slice(1);
  expect(rows.map((r) => r.split(/\s+/)[5])).toEqual(["shop-error", "ok", "denied", "usage", "shop-error", "denied"]);
  const files = ["town.db", "town.db-wal"].map((f) => path.join(data, f)).filter((f) => existsSync(f));
  expect(files.map((f) => path.basename(f))).toContain("town.db-wal");
  const stored = Buffer.concat(files.map((f) => readFileSync(f)));
  expect(stored.includes(Buffer.from("town/memory"))).toBe(true); // the reading can find what is there
  for (const word of distinctive) {
    expect(stored.includes(Buffer.from(word)), `${word} in town.db`).toBe(false);
    expect(audit.stdout, `${word} in the audit`).not.toContain(word);
  }
}, 60_000);
