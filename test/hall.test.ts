// ring: checkout
// The hall, hall phase 0: `town/hall` as a shop, in process. Its manifest
// through the validator with `runtime` its one refusal, and its own tests
// through `runHall`. Then the gate over a store with the hall and the
// memory shop and a fake runtime that records whether a process ran: no
// hall grant denied at step 2 and `spec` alone denied `publish` at step 3;
// a hall call answered with no process; `search` marking what the pass
// holds and filtering; `show` for a shop not held; `spec` as `townd spec`
// prints it; `request` refused in `grant new`'s words and made otherwise,
// replacing a pending one; `requests` in each state; a constraint on
// `request.shop` enforced at step 5; and the sources of every grant after.
// Hall phase 1: `validate`, `test`, and `publish` over bundles the box's
// tar makes, with the fake runtime and the real one: refusals in the
// design's order, `detail` naming their sections; the tests' caller the
// agent's pass with the test's scratch root, shown by a dependency that
// prints TOWN_STATE; a test outside the agent's constraint failing with
// the agent's line and no dependency process; the publish grant made,
// remade, and not made over a person's; the staging gone on every path;
// the grants that stop being live named; and the owner, both doors.
// Wall phase 0: the wall in the gate's deps reaching a sent shop's tests
// and the dependency calls below them, and `shop add`'s, by a fake wall's
// record. Consent phase 0: a bundle whose manifest proposes a token type
// through `validate`, `test`, and `publish` with the fake runtime: the
// refusals of a need, nothing run at `test`, the type proposed with the
// shop, the permit made in the publish grant's place and replaced, a
// publish grant made before the shop gained a need revoked, `tested_at`
// null and cleared by a republish, `requests`, `show`, and `search` with
// needs and the shop's guidance, and the sources of every grant after each
// step. Consent phase 3: the proposer's republish writing its guidance onto
// the type, proposed and held, and saying so; the host rule on the new
// words; another shop's words leaving the type's
// as they are while its own show with its permit, in `show`, and in
// `requests`; the line over a person's grant naming `request`; and the
// store refusing a host or a moved definition.

import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Io } from "../src/admin.js";
import { parseArgs, splitWords } from "../src/args.js";
import { checklist } from "../src/checklist.js";
import { denials } from "../src/denials.js";
import { gate, shopDir, type CallRequest, type GateDeps, type Runtime } from "../src/gate.js";
import { approvePermit } from "../src/grants.js";
import { HALL, HALL_YAML, runHall } from "../src/hall.js";
import { parseManifest, validateManifest } from "../src/manifest.js";
import { shopAdd } from "../src/publish.js";
import { run } from "../src/runtime.js";
import { decideAndRecord } from "../src/server.js";
import { SPEC } from "../src/spec.js";
import { loadShop } from "../src/shoptest.js";
import type { Pass } from "../src/passes.js";
import { openStore, type Store } from "../src/store.js";
import { openWall } from "../src/wall.js";
import { recordingWall, type RecordingWall } from "./helpers/wall.js";

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");

let dir: string;
let store: Store;
let runs: string[];
let deps: GateDeps;

const fakeRuntime: Runtime = async (_dir, manifest, command) => {
  runs.push(`${manifest.name} ${command}`);
  return { stdout: "the shop's output\n", stderr: "", exit: 0, timedOut: false, aborted: false, credentials: [], calls: 0, denied: null, wall: "none" };
};

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-hall-test-"));
  store = openStore(dir);
  store.upsertShop(await loadShop(MEMORY), NOW);
  runs = [];
  deps = { store, wall: openWall("none"), runtime: fakeRuntime, now: () => NOW };
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Dimitri's agent's pass, with a grant at each shop given: every command when none are named. */
function agentWith(grants: Record<string, { commands?: string[]; constraints?: Record<string, Record<string, unknown>> }>, user = "dimitri"): { pass: Pass; token: string } {
  if (!store.userByName(user)) store.addUser(user, NOW);
  const made = store.newPass(user, "the agent", null, NOW);
  for (const [shop, g] of Object.entries(grants)) {
    const commands = g.commands ?? store.getShop(shop)!.manifest.commands.map((c) => c.name);
    store.newGrant({ passId: made.pass.id, shop, commands, constraints: (g.constraints ?? {}) as never, expiresAt: null }, NOW);
  }
  return made;
}

const call = (token: string, argv: string[]): CallRequest => ({ token, argv, stdin: null, json: false });
const hall = (token: string, ...argv: string[]) => gate(deps, call(token, ["hall", ...argv]));

describe("the hall's manifest", () => {
  it("is a v0 manifest in every way but its runtime: the validator's one refusal is runtime", () => {
    const { refusals } = parseManifest(HALL_YAML, [], store.listShops().map((s) => ({ name: s.name, commands: s.manifest.commands.map((c) => c.name) })));
    expect(refusals).toEqual(["runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)"]);
    expect(validateManifest({ ...HALL, runtime: "subprocess" })).toEqual([]);
    expect(HALL.commands.map((c) => c.name)).toEqual(["search", "show", "spec", "validate", "test", "publish", "request", "requests"]);
  });

  it("passes its own tests through runHall, in process", async () => {
    const { pass } = agentWith({ "town/hall": {} });
    const grant = store.grantsForPass(pass.id, NOW).find((g) => g.shop === "town/hall")!;
    for (const test of HALL.tests) {
      const split = splitWords(test.run);
      expect(split.ok, test.name).toBe(true);
      const [command, ...words] = (split as { words: string[] }).words;
      const parsed = parseArgs(HALL, command!, words);
      expect(parsed.ok, test.name).toBe(true);
      const out = await runHall({ store, wall: openWall("none"), now: () => NOW }, { pass, grant, command: command!, values: (parsed as { values: Record<string, string> }).values, stdin: null, callId: "call_test" });
      expect(out.exit, test.name).toBe(0);
      expect(out.stdout, test.name).toContain((test.expect as { contains: string }).contains);
    }
  });
});

describe("the gate, over the hall", () => {
  it("denies a pass with no hall grant at step 2, and help does not list the hall, with no process", async () => {
    const { token } = agentWith({ "town/memory": { commands: ["remember", "recall", "list"] } });
    const o = await hall(token, "spec");
    expect(o).toMatchObject({ exit: 2, result: "denied", error: denials.notAvailable("hall spec"), detail: "no-grant", stdout: "" });
    expect((await gate(deps, call(token, ["--help"]))).stdout).not.toContain("town/hall");
    expect(runs).toEqual([]);
  });

  it("denies publish to a hall grant at spec alone at step 3, lists spec alone in help, and answers spec with no process", async () => {
    const { token } = agentWith({ "town/hall": { commands: ["spec"] } });
    const publish = await hall(token, "publish");
    expect(publish).toMatchObject({ exit: 2, result: "denied", error: denials.notAvailable("publish"), detail: "command", stdout: "" });
    const help = await hall(token, "--help");
    expect(help.stdout).toContain("town hall spec\n");
    expect(help.stdout).not.toMatch(/town hall (search|show|validate|test|publish|request|requests)\b/);
    const spec = await hall(token, "spec");
    expect(runs, "the hall's call started a process").toEqual([]);
    expect(spec).toMatchObject({ exit: 0, result: "ok", stdout: SPEC, error: "", shop: "town/hall", command: "spec", shopExit: null });
  });

  it("denies request to a hall grant at spec, validate, test, and publish, whose help lists those four", async () => {
    const { token, pass } = agentWith({ "town/hall": { commands: ["spec", "validate", "test", "publish"] } });
    expect(await hall(token, "request", "--shop", "town/memory")).toMatchObject({ exit: 2, result: "denied", error: "error: command 'request' is not available to this grant" });
    const help = (await hall(token, "--help")).stdout;
    expect([...help.matchAll(/^  town hall (\S+)/gm)].map((m) => m[1])).toEqual(["spec", "validate", "test", "publish"]);
    expect(store.listPermits(pass.id)).toEqual([]);
    expect(runs).toEqual([]);
  });

  it("lists every shop with its commands and what the pass holds, filters by query, and says so when nothing matches", async () => {
    const { token } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    const all = await hall(token, "search");
    expect(all.exit).toBe(0);
    expect(all.stdout.split("\n")).toEqual([
      "town/hall    Where the town's shops are found, made, and asked for. [search, show, spec, validate, test, publish, request, requests]  held: all",
      "town/memory  Short notes, kept by key. [remember, recall, list, forget]  held: remember, recall, list",
      "",
    ]);
    expect((await hall(token, "search", "--query", "NOTES")).stdout).toMatch(/^town\/memory .* held: remember, recall, list\n$/);
    expect((await hall(token, "search", "--query", "forget")).stdout).toMatch(/^town\/memory /);
    expect(await hall(token, "search", "--query", "todo")).toMatchObject({ exit: 0, result: "ok", stdout: 'no shop in this town matches "todo"\n' });
    const other = agentWith({ "town/hall": { commands: ["search"] } }, "ada");
    expect((await hall(other.token, "search", "--query", "memory")).stdout).toMatch(/held: none\n$/);
    expect(runs).toEqual([]);
  });

  it("shows a shop's help as a full grant reads it, forget included, and which commands the pass holds", async () => {
    const { token } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    const shown = await hall(token, "show", "--shop", "town/memory");
    expect(shown.exit).toBe(0);
    expect(shown.stdout).toMatch(/^town\/memory: Short notes, kept by key\.\n/);
    for (const c of ["remember", "recall", "list", "forget"]) expect(shown.stdout).toContain(`  town town/memory ${c} `);
    expect(shown.stdout).toMatch(/\nthis pass holds: remember, recall, list\n$/);
    const bare = agentWith({ "town/hall": { commands: ["show"] } }, "ada");
    expect((await hall(bare.token, "show", "--shop", "town/memory")).stdout).toMatch(/\nthis pass holds: none of these\n$/);
    expect((await hall(token, "show", "--shop", "town/hall")).stdout).toMatch(/\nthis pass holds: all of these\n$/);
    expect(await hall(token, "show", "--shop", "town/nothing")).toMatchObject({ exit: 1, result: "usage", stdout: "--shop: town/nothing is not a shop in this town; town hall search lists the shops it holds\n" });
    for (const out of [shown.stdout]) expect(out).not.toContain(dir);
  });

  it("refuses a request as grant new refuses a command the shop lacks and a constraint on an argument that takes none, making no permit", async () => {
    const { token, pass } = agentWith({ "town/hall": {} });
    const lacks = await hall(token, "request", "--shop", "town/memory", "--commands", "forget,shout");
    expect(lacks).toMatchObject({
      exit: 1,
      result: "usage",
      detail: "request refused",
      stdout: "request refused: --commands: shout is not a command of town/memory; write some of remember,recall,list,forget\n",
    });
    const none = await hall(token, "request", "--shop", "town/memory", "--commands", "remember", "--constraint", "remember.value prefix x");
    expect(none.stdout).toBe("request refused: --constraint remember.value: town/memory does not mark remember.value constrainable by prefix; write no constraint on it\n");
    const nowhere = await hall(token, "request", "--shop", "town/nothing");
    expect(nowhere.stdout).toBe("request refused: --shop: town/nothing is not a shop in this town; town hall search lists the shops it holds\n");
    expect(store.listPermits(pass.id)).toEqual([]);
  });

  it("makes a request pending, replaces a pending one at the same shop, and lists requests in each state", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["recall"] } });
    let clock = NOW;
    deps = { ...deps, now: () => (clock += 1000) };
    const first = await hall(token, "request", "--shop", "town/memory", "--commands", "forget", "--why", "to clear finished items");
    const firstId = /^requested (prm_[0-9a-f]{16}); a person decides at the box, and town --help shows the answer\n/.exec(first.stdout)![1]!;
    expect(first).toMatchObject({ exit: 0, result: "ok", detail: `requested ${firstId}` });
    // It leaves out recall, which the pass holds: the answer says an approval drops it.
    expect(first.stdout.split("\n")[1]).toBe("if approved, this replaces your grant at town/memory and drops recall; name them to keep them");
    const second = await hall(token, "request", "--shop", "town/memory", "--commands", "remember,recall", "--constraint", "remember.key prefix notes/; recall.key prefix notes/");
    const secondId = /^requested (prm_[0-9a-f]{16});/.exec(second.stdout)![1]!;
    expect(store.listPermits(pass.id).map((p) => [p.id, p.commands, p.constraints, p.why])).toEqual([
      [secondId, ["remember", "recall"], { "remember.key": { prefix: "notes/" }, "recall.key": { prefix: "notes/" } }, ""],
    ]);
    const atHall = /^requested (prm_[0-9a-f]{16});/.exec((await hall(token, "request", "--shop", "town/hall", "--commands", "search", "--why", "to look")).stdout)![1]!;

    const pending = (await hall(token, "requests")).stdout.split("\n");
    expect(pending[0]).toMatch(/^id\s+shop\s+commands\s+constraints\s+why\s+asked\s+state$/);
    expect(pending[1]).toMatch(new RegExp(`^${secondId}\\s+town/memory\\s+remember,recall\\s+remember\\.key prefix notes/; recall\\.key prefix notes/\\s+-\\s+2026-09-12T12:00:02Z\\s+pending$`));
    expect(pending[2]).toMatch(new RegExp(`^${atHall}\\s+town/hall\\s+search\\s+-\\s+to look\\s+\\S+\\s+pending$`));

    const approved = approvePermit(store, secondId, { commands: "recall", constraints: [], credentials: [], expiresAt: null }, NOW);
    if (Array.isArray(approved)) throw new Error(approved.join("\n"));
    store.decidePermit(atHall, "denied", null, NOW);
    const decided = (await hall(token, "requests")).stdout;
    expect(decided).toMatch(new RegExp(`^${secondId}\\s.*\\sapproved as ${approved.grant.id} with recall$`, "m"));
    expect(decided).toMatch(new RegExp(`^${atHall}\\s.*\\sdenied$`, "m"));
    const full = /^requested (prm_[0-9a-f]{16});/.exec((await hall(token, "request", "--shop", "town/memory", "--commands", "forget")).stdout)![1]!;
    const whole = approvePermit(store, full, { commands: undefined, constraints: [], credentials: [], expiresAt: null }, NOW);
    if (Array.isArray(whole)) throw new Error(whole.join("\n"));
    expect((await hall(token, "requests")).stdout).toMatch(new RegExp(`^${full}\\s.*\\sapproved as ${whole.grant.id}$`, "m"));
    // The answer is in the agent's help.
    expect((await gate(deps, call(token, ["--help"]))).stdout).toMatch(/^town\/memory\s+Short notes, kept by key\. \[forget\]$/m);
    expect(runs).toEqual([]);
  });

  it("says on a second line what an approval would drop of the grant the pass holds at the shop, and nothing when it drops nothing", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    const answer = /^requested (prm_[0-9a-f]{16}); a person decides at the box, and town --help shows the answer\n/;
    const dropping = await hall(token, "request", "--shop", "town/memory", "--commands", "forget,recall", "--why", "to clear finished items");
    const dropId = answer.exec(dropping.stdout)![1]!;
    expect(dropping).toMatchObject({
      exit: 0,
      result: "ok",
      detail: `requested ${dropId}`,
      stdout: `requested ${dropId}; a person decides at the box, and town --help shows the answer\nif approved, this replaces your grant at town/memory and drops remember, list; name them to keep them\n`,
    });
    const alone = await hall(token, "request", "--shop", "town/memory", "--commands", "list,forget,recall");
    expect(alone.stdout.split("\n")[1]).toBe("if approved, this replaces your grant at town/memory and drops remember; name them to keep them");
    const keeping = await hall(token, "request", "--shop", "town/memory", "--commands", "remember,recall,list,forget");
    const keepId = answer.exec(keeping.stdout)![1]!;
    expect(keeping).toMatchObject({ exit: 0, result: "ok", detail: `requested ${keepId}`, stdout: `requested ${keepId}; a person decides at the box, and town --help shows the answer\n` });
    const every = await hall(token, "request", "--shop", "town/memory");
    expect(every.stdout).toMatch(/^requested prm_[0-9a-f]{16}; a person decides at the box, and town --help shows the answer\n$/);
    // The last request replaced the pending ones, and the grant held is untouched until a person decides.
    expect(store.listPermits(pass.id).map((p) => p.commands)).toEqual([["remember", "recall", "list", "forget"]]);
    // A pass holding no grant at the shop drops nothing.
    const bare = agentWith({ "town/hall": {} }, "ada");
    expect((await hall(bare.token, "request", "--shop", "town/memory", "--commands", "forget")).stdout).toMatch(/^requested prm_[0-9a-f]{16}; a person decides at the box, and town --help shows the answer\n$/);
    // The help for request says so before either is sent.
    const help = (await hall(token, "--help")).stdout;
    expect(help).toContain("  town hall request --shop <string> [--commands <string>] [--constraint <string>] [--why <string>]\n");
    expect(help).toMatch(/^\s+--commands <string>\s+Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there\. Every command when omitted\.$/m);
    expect(runs).toEqual([]);
  });

  it("enforces a constraint on request.shop at step 5, and the permit is not made", async () => {
    const { token, pass } = agentWith({ "town/hall": { constraints: { "request.shop": { prefix: "town/" } } } });
    const o = await hall(token, "request", "--shop", "alice/notes");
    expect(o).toMatchObject({ exit: 2, result: "denied", error: denials.constraint("shop", "prefix", "town/"), stdout: "" });
    expect(store.listPermits(pass.id)).toEqual([]);
    expect((await hall(token, "request", "--shop", "town/memory")).exit).toBe(0);
    expect(store.listPermits(pass.id)).toHaveLength(1);
  });

  it("answers validate, test, and publish with no stdin with the bundle's refusal, exit 1, detail refused §1", async () => {
    const { token } = agentWith({ "town/hall": {} });
    for (const command of ["validate", "test", "publish"]) {
      expect(await hall(token, command)).toMatchObject({
        stdout: "stdin: is empty; send the shop's directory on stdin, as tar --format ustar -cf - -C <dir> . makes it (spec §1)\n",
        exit: 1,
        result: "usage",
        detail: "refused §1",
        shopExit: null,
      });
    }
    expect(runs).toEqual([]);
  });

  it("leaves no grant a person did not make: every grant's source after the hall's calls is the operator's or a permit's", async () => {
    const { token } = agentWith({ "town/hall": {}, "town/memory": { commands: ["recall"] } });
    for (const argv of [["search"], ["show", "--shop", "town/memory"], ["spec"], ["request", "--shop", "town/memory"], ["requests"], ["validate"], ["test"], ["publish"]]) {
      await hall(token, ...argv);
    }
    expect(store.listGrants().map((g) => g.source)).toEqual([null, null]);
    const [permit] = store.listPermits();
    const made = approvePermit(store, permit!.id, { commands: undefined, constraints: [], credentials: [], expiresAt: null }, NOW);
    if (Array.isArray(made)) throw new Error(made.join("\n"));
    for (const g of store.listGrants()) expect([null, `permit ${permit!.id}`]).toContain(g.source);
    expect(store.listGrants().map((g) => g.source)).toContain(`permit ${permit!.id}`);
  });
});

/** The to-do shop the test writes: a recipe over memory at remember and list. */
const TODO_MANIFEST = `name: dimitri/todo
version: 0.1.0
summary: Things to do, kept in the town's notes.
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
      - { name: item, type: string, required: true }
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
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (command === "add") town("memory", "remember", "--key", "todo/" + args.item, "--value", "open");
else if (command === "done") town("memory", "remember", "--key", "todo/" + args.item, "--value", "done");
else if (command === "list") town("memory", "list", "--prefix", "todo/");
else if (command === "probe") town("where", "state");
`;

/** A shop's files, written to a directory of the test's and sent through the box's tar, as the hall's stdin carries them. */
function bundleOf(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "town-hall-bundle-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), content);
    }
    const r = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", root, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    if (r.status !== 0) throw new Error(r.stderr.toString());
    return r.stdout.toString("utf8");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const todo = (manifest = TODO_MANIFEST) => bundleOf({ "manifest.yaml": manifest, "main.mjs": TODO_ENTRY });
/** The to-do manifest with its tests replaced by one that exits 0, for the fake runtime. */
const exitZero = (manifest = TODO_MANIFEST) => manifest.replace(/tests:[\s\S]*$/, "tests:\n  - name: it runs\n    run: list\n    expect: { exit: 0 }\n");

const stagings = () => (existsSync(store.shopsDir) ? readdirSync(store.shopsDir).filter((e) => e.startsWith(".staging-")) : []);
const send = (token: string, command: string, stdin: string, d: GateDeps = deps) => gate(d, { token, argv: ["hall", command], stdin, json: false });

describe("validate, test, and publish: the checks before any test", () => {
  it("refuses in the design's order, one line each with its section, and detail names the sections; nothing is written", async () => {
    const { token } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    // The bundle first: its one refusal is the answer.
    const link = await send(token, "validate", "not a tar at all, a line of text".repeat(20));
    expect(link).toMatchObject({ exit: 1, result: "usage", detail: "refused §1" });
    expect(link.stdout).toMatch(/^stdin: is not a ustar tar .* \(spec §1\)\n$/);

    // Then the validator's refusals, then the hall's rules.
    const wrong = TODO_MANIFEST.replace("name: dimitri/todo", "name: town/todo").replace("entry: ./main.mjs\n", "entry: ./main.mjs\ncolour: blue\ncredentials:\n  - type: github-token\n");
    const refused = await send(token, "validate", todo(wrong));
    expect(refused.stdout.split("\n")).toEqual([
      "colour: is not a manifest field; write only the fields in §2 (name, version, summary, guidance, runtime, entry, credentials, depends, commands, tests) instead (spec §2)",
      "name: town/todo is not under your namespace; write dimitri/todo instead (spec §2)",
      "",
    ]);
    expect(refused).toMatchObject({ exit: 1, result: "usage", detail: "refused §2,§2", shopExit: null });

    // runtime: town, and a dependency on the hall, are the validator's.
    const townRuntime = await send(token, "validate", todo(TODO_MANIFEST.replace("runtime: subprocess", "runtime: town").replace("shop: town/memory", "shop: town/hall")));
    expect(townRuntime.stdout).toContain("runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)\n");
    expect(townRuntime.stdout).toContain("depends[0].shop: is town/hall, the town's own shop, which answers agents and never a shop; write a shop other than town/hall instead (spec §8)\n");
    expect(townRuntime.detail).toMatch(/^refused §2,§8/);
    const anotherUser = await send(token, "publish", todo(TODO_MANIFEST.replace("name: dimitri/todo", "name: ada/todo")));
    expect(anotherUser.stdout).toBe("name: ada/todo is not under your namespace; write dimitri/todo instead (spec §2)\n");

    // Then the dependencies, read for this pass, in the agent's words.
    const narrow = agentWith({ "town/hall": {}, "town/memory": { commands: ["list"] } });
    const lacks = await send(narrow.token, "test", todo());
    expect(lacks).toMatchObject({ exit: 1, result: "usage", detail: "refused §8", stdout: "depends[0]: this grant's town/memory lacks remember, which dimitri/todo calls; ask for it\n" });
    const none = agentWith({ "town/hall": {} });
    const withTwo = TODO_MANIFEST.replace("    commands: [remember, list]\n", "    commands: [remember, list]\n  - shop: town/hall-like\n    commands: [x]\n");
    expect((await send(none.token, "publish", todo(withTwo))).stdout).toMatch(/^depends\[1\]\.shop: 'town\/hall-like' is not a shop this town holds;/);
    expect((await send(none.token, "publish", todo())).stdout).toBe("depends[0]: town/memory at remember, list is not in this grant; ask for it\n");

    // Then the dependents, in shop add's words.
    store.upsertShop({ ...(await loadShop(MEMORY)), name: "dimitri/uses-todo", depends: [{ shop: "dimitri/todo", commands: ["clear"] }] } as never, NOW);
    const breaks = await send(token, "validate", todo());
    expect(breaks).toMatchObject({
      exit: 1,
      detail: "refused §8",
      stdout: "dimitri/todo would not have every command its dependents declare of it: dimitri/uses-todo calls clear; keep it in dimitri/todo, or add dimitri/uses-todo again without it first\n",
    });
    store.removeShop("dimitri/uses-todo");

    // And a shop that passes: validate says so, and nothing was written or run.
    const ok = await send(token, "validate", todo());
    expect(ok).toMatchObject({ exit: 0, result: "ok", stdout: "ok dimitri/todo 0.1.0: add, done, list\n", detail: "valid dimitri/todo 0.1.0" });
    expect(store.getShop("dimitri/todo")).toBeNull();
    expect(stagings()).toEqual([]);
    expect(existsSync(store.shopsDir)).toBe(false);
    expect(runs).toEqual([]);
    for (const out of [refused.stdout, lacks.stdout, ok.stdout]) expect(out).not.toContain(dir);
  });
});

describe("validate, test, and publish: the tests, as the agent", () => {
  let real: GateDeps;
  let processes: string[];
  let walled: RecordingWall;

  /** A shop the operator adds for the test: its manifest in the row and its files in the town. */
  function addFixture(name: string, manifest: string, entry: string): void {
    const parsed = parseManifest(manifest, [], []);
    if (!parsed.manifest) throw new Error(parsed.refusals.join("\n"));
    store.upsertShop(parsed.manifest, NOW);
    mkdirSync(shopDir(store, name), { recursive: true });
    writeFileSync(path.join(shopDir(store, name), "manifest.yaml"), manifest);
    writeFileSync(path.join(shopDir(store, name), "main.mjs"), entry);
  }

  beforeEach(async () => {
    cpSync(MEMORY, shopDir(store, "town/memory"), { recursive: true });
    processes = [];
    const counted: Runtime = (shop, manifest, command, values, opts) => {
      processes.push(`${manifest.name} ${command}`);
      return run(shop, manifest, command, values, opts);
    };
    walled = recordingWall();
    real = { store, wall: walled, runtime: counted, now: () => NOW, decide: decideAndRecord };
  });

  it("runs the tests with the agent's pass as the caller and the test's scratch root as the state, every inner call a row under the hall's", async () => {
    addFixture(
      "test/where",
      "name: test/where\nversion: 0.0.1\nsummary: Says where it keeps things, for the hall's tests.\nruntime: subprocess\nentry: ./main.mjs\ncommands:\n  - name: state\n    summary: Print TOWN_STATE on stdout and stderr.\n    effect: read\n    output: text\ntests:\n  - name: it says\n    run: state\n    expect: { exit: 0 }\n",
      "process.stdout.write(process.env.TOWN_STATE + '\\n');\nprocess.stderr.write(process.env.TOWN_STATE + '\\n');\n",
    );
    const { token, pass } = agentWith({ "town/hall": {}, "test/where": {} });
    const whereGrant = store.grantsForPass(pass.id, NOW).find((g) => g.shop === "test/where")!;
    const probe = TODO_MANIFEST.replace("shop: town/memory\n    commands: [remember, list]", "shop: test/where\n    commands: [state]")
      .replace(/commands:\n  - name: add[\s\S]*?(?=tests:)/, "commands:\n  - name: probe\n    summary: Ask the dependency where its state is.\n    effect: read\n    output: text\n")
      .replace(/tests:[\s\S]*$/, "tests:\n  - name: scratch\n    run: probe\n    expect: { contains: town-shop-test- }\n");
    const tested = await decideAndRecord(real, { token, argv: ["hall", "test"], stdin: todo(probe), json: false });
    expect(tested).toMatchObject({ exit: 0, result: "ok", stdout: "ok scratch\n", detail: "tests 1/1" });
    const inner = store.calls().filter((c) => c.parent === tested.callId);
    expect(inner.map((c) => [c.passId, c.grantId, c.shop, c.command, c.result])).toEqual([[pass.id, whereGrant.id, "test/where", "state", "ok"]]);
    const printed = inner[0]!.stderr!.trim();
    expect(printed).toContain(`${path.sep}town-shop-test-`);
    expect(printed.endsWith(path.join("test%2Fwhere", pass.userId))).toBe(true);
    expect(printed.startsWith(store.dataDir)).toBe(false);
    expect(existsSync(store.stateRoot), "a test's call wrote under the town's state").toBe(false);
    expect(existsSync(path.dirname(path.dirname(printed))), "the test's scratch root outlived it").toBe(false);
    // The hall's own row is the root of that tree.
    expect(store.callTree(tested.callId).map((c) => [c.depth, c.shop, c.command])).toEqual([[0, "town/hall", "test"], [1, "test/where", "state"]]);
    expect(store.getShop("dimitri/todo")).toBeNull();
    expect(stagings()).toEqual([]);
  }, 30_000);

  it("fails a test whose call is outside the agent's constraint with the agent's line, and no process runs at the dependency", async () => {
    const { token } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"], constraints: { "remember.key": { prefix: "notes/" } } } });
    const tested = await decideAndRecord(real, { token, argv: ["hall", "test"], stdin: todo(), json: false });
    expect(tested).toMatchObject({
      exit: 1,
      result: "shop-error",
      detail: "tests 0/1",
      stdout: "not ok an added item is listed: line 1 `add --item milk` exited 2: error: --key must start with 'notes/' under this grant\n",
    });
    expect(processes).toEqual(["dimitri/todo add"]);
    const inner = store.calls().filter((c) => c.parent === tested.callId);
    expect(inner.map((c) => [c.shop, c.command, c.result, c.detail, c.shopExit])).toEqual([["town/memory", "remember", "denied", "constraint remember.key prefix", null]]);
    // The same bundle published is test's answer, and the town has no shop.
    const published = await decideAndRecord(real, { token, argv: ["hall", "publish"], stdin: todo(), json: false });
    expect(published).toMatchObject({ exit: 1, result: "shop-error", detail: "tests 0/1" });
    expect(store.getShop("dimitri/todo")).toBeNull();
    expect(stagings()).toEqual([]);
  }, 30_000);

  it("publishes with the real runtime: the tests' lines, the published line, the shop owned by the user, the publish grant at every command, and the shop runs", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    const published = await decideAndRecord(real, { token, argv: ["hall", "publish"], stdin: todo(), json: false });
    expect(published).toMatchObject({ exit: 0, result: "ok", detail: "published dimitri/todo 0.1.0", stdout: "ok an added item is listed\npublished dimitri/todo 0.1.0; town todo --help says what it does\n" });
    expect(store.getShop("dimitri/todo")).toMatchObject({ owner: pass.userId, ownerName: "dimitri", version: "0.1.0" });
    expect(store.listGrants(pass.id).filter((g) => g.shop === "dimitri/todo").map((g) => [g.commands, g.constraints, g.source, g.expiresAt])).toEqual([[["add", "done", "list"], {}, "publish", null]]);
    // Its tests' calls are rows under the publish, with the agent's pass; they wrote nothing to the user's memory.
    expect(store.calls().filter((c) => c.parent === published.callId).map((c) => [c.passId, c.shop, c.command])).toEqual([
      [pass.id, "town/memory", "remember"],
      [pass.id, "town/memory", "list"],
    ]);
    expect(existsSync(store.stateRoot)).toBe(false);
    // The wall reached the sent shop's tests, at the staging copy, and the dependency's process each of them called.
    const enclosedAt = walled.seen.map((e) => e.within.reads[0]!);
    expect(enclosedAt.map((d) => (path.basename(d).startsWith(".staging-") ? "staging" : path.relative(store.shopsDir, d)))).toEqual(["staging", "town%2Fmemory", "staging", "town%2Fmemory"]);
    expect(path.dirname(enclosedAt[0]!)).toBe(store.shopsDir);
    const added = await decideAndRecord(real, { token, argv: ["todo", "add", "--item", "milk"], stdin: null, json: false });
    expect(added).toMatchObject({ exit: 0, result: "ok" });
    expect((await decideAndRecord(real, { token, argv: ["todo", "list"], stdin: null, json: false })).stdout).toBe("todo/milk\n");
    expect(stagings()).toEqual([]);
  }, 30_000);
});

describe("the publish grant, the staging, and the owner", () => {
  it("makes the publish grant at every command, remakes it at a republish with a new command, and names nothing it did not make", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    const first = await send(token, "publish", todo(exitZero()));
    expect(first).toMatchObject({ exit: 0, stdout: "ok it runs\npublished dimitri/todo 0.1.0; town todo --help says what it does\n" });
    const [made] = store.grantsForPass(pass.id, NOW).filter((g) => g.shop === "dimitri/todo");
    expect(made).toMatchObject({ commands: ["add", "done", "list"], constraints: {}, source: "publish", expiresAt: null });
    const four = exitZero(TODO_MANIFEST.replace("version: 0.1.0", "version: 0.2.0").replace("tests:", "  - name: clear\n    summary: Forget an item.\n    effect: destructive\n    args:\n      - { name: item, type: string, required: true }\n    output: text\ntests:"));
    const second = await send(token, "publish", todo(four));
    expect(second).toMatchObject({ exit: 0, detail: "published dimitri/todo 0.2.0" });
    const atTodo = store.listGrants(pass.id).filter((g) => g.shop === "dimitri/todo");
    expect(atTodo.map((g) => [g.id === made!.id, g.revokedAt === null, g.commands, g.source]).sort((a, b) => Number(b[0]) - Number(a[0]))).toEqual([
      [true, false, ["add", "done", "list"], "publish"],
      [false, true, ["add", "done", "list", "clear"], "publish"],
    ]);
    expect((await gate(deps, call(token, ["--help"]))).stdout).toMatch(/^dimitri\/todo\s+Things to do, kept in the town's notes\. \[add, done, list, clear\]$/m);
    // No other pass of the user holds it.
    const other = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    expect((await gate(deps, call(other.token, ["--help"]))).stdout).not.toContain("dimitri/todo");
    expect(await gate(deps, call(other.token, ["todo", "list"]))).toMatchObject({ exit: 2, result: "denied" });
    // Every grant is a person's, or the publish grant of the pass that published.
    for (const g of store.listGrants()) expect(g.source === null || (g.source === "publish" && g.passId === pass.id && g.shop === "dimitri/todo"), `${g.id} ${g.source}`).toBe(true);
    expect(stagings()).toEqual([]);
  });

  it("leaves a grant a person made at the shop, by grant new or by a permit, as it is, and says so", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    expect((await send(token, "publish", todo(exitZero()))).exit).toBe(0);
    const publishGrant = store.grantsForPass(pass.id, NOW).find((g) => g.shop === "dimitri/todo")!;
    store.revokeGrant(publishGrant.id, NOW);
    const person = store.newGrant({ passId: pass.id, shop: "dimitri/todo", commands: ["list"], constraints: {}, expiresAt: null }, NOW);
    const again = await send(token, "publish", todo(exitZero()));
    expect(again).toMatchObject({ exit: 0, stdout: `ok it runs\nthis pass's grant ${person.id} at dimitri/todo was made by a person, so it stands as it is, and this publish made none\npublished dimitri/todo 0.1.0; town todo --help says what it does\n` });
    expect(store.grantsForPass(pass.id, NOW).filter((g) => g.shop === "dimitri/todo")).toEqual([person]);

    store.revokeGrant(person.id, NOW);
    const asked = await hall(token, "request", "--shop", "dimitri/todo", "--commands", "add,list");
    const id = /^requested (prm_[0-9a-f]{16})/.exec(asked.stdout)![1]!;
    const approved = approvePermit(store, id, { commands: undefined, constraints: [], credentials: [], expiresAt: null }, NOW);
    if (Array.isArray(approved)) throw new Error(approved.join("\n"));
    const third = await send(token, "publish", todo(exitZero()));
    expect(third.stdout).toContain(`this pass's grant ${approved.grant.id} at dimitri/todo was made by a person, so it stands as it is, and this publish made none\n`);
    expect(store.grantsForPass(pass.id, NOW).filter((g) => g.shop === "dimitri/todo").map((g) => [g.id, g.source])).toEqual([[approved.grant.id, `permit ${id}`]]);
  });

  it("names the grants at the shop that stop being live, as shop add names them", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    expect((await send(token, "publish", todo(exitZero()))).exit).toBe(0);
    // A person grants the shop to another pass, which holds memory at list alone.
    const other = agentWith({ "town/memory": { commands: ["remember", "list"] } });
    const given = store.newGrant({ passId: other.pass.id, shop: "dimitri/todo", commands: ["list"], constraints: {}, expiresAt: null }, NOW);
    const wider = exitZero(TODO_MANIFEST.replace("commands: [remember, list]", "commands: [remember, recall, list]"));
    const republished = await send(token, "publish", todo(wider));
    expect(republished.exit, republished.stdout).toBe(0);
    expect(republished.stdout.split("\n")).toEqual([
      "ok it runs",
      `${given.id} at dimitri/todo is no longer live: town/memory lacks recall, a dependency the shop gained`,
      "published dimitri/todo 0.1.0; town todo --help says what it does",
      "",
    ]);
    expect(store.grantsForPass(pass.id, NOW).some((g) => g.shop === "dimitri/todo")).toBe(true);
  });

  it("leaves no staging on any path: refused, tested, failed, published, and a runtime that throws", async () => {
    const { token } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    const failing = exitZero().replace("expect: { exit: 0 }", "expect: { exit: 3 }");
    for (const [command, stdin] of [["test", todo(exitZero())], ["test", todo(failing)], ["publish", todo(failing)], ["publish", todo(exitZero())], ["publish", todo(TODO_MANIFEST.replace("name: dimitri/todo", "name: town/todo"))]] as const) {
      await send(token, command, stdin);
      expect(stagings(), `${command}`).toEqual([]);
    }
    expect(readdirSync(store.shopsDir)).toEqual(["dimitri%2Ftodo"]);
    const throwing: Runtime = async () => {
      throw new Error("the runtime broke");
    };
    const broken = await decideAndRecord({ ...deps, runtime: throwing }, { token, argv: ["hall", "publish"], stdin: todo(exitZero()), json: false });
    expect(broken).toMatchObject({ exit: 1, result: "town-error" });
    expect(stagings()).toEqual([]);
  });

  it("writes the agent's user as owner at the hall's door and none at the operator's, over a published shop too", async () => {
    const { token, pass } = agentWith({ "town/hall": {}, "town/memory": { commands: ["remember", "recall", "list"] } });
    expect((await send(token, "publish", todo(exitZero()))).exit).toBe(0);
    expect(store.getShop("dimitri/todo")).toMatchObject({ owner: pass.userId, ownerName: "dimitri" });
    const at = mkdtempSync(path.join(os.tmpdir(), "town-hall-owner-"));
    try {
      writeFileSync(path.join(at, "manifest.yaml"), exitZero());
      writeFileSync(path.join(at, "main.mjs"), TODO_ENTRY);
      chmodSync(path.join(at, "main.mjs"), 0o644);
      let out = "";
      const io: Io = { out: (x) => void (out += x), err: (x) => void (out += x), env: {} };
      // The operator's tree runs the shop's tests with the real runtime; memory's code is in the town for it.
      cpSync(MEMORY, shopDir(store, "town/memory"), { recursive: true });
      const byOperator = recordingWall();
      expect(await shopAdd(store, null, at, { user: () => undefined, credentials: [] }, io, NOW, byOperator), out).toBe(0);
      expect(byOperator.seen.map((e) => path.basename(e.within.reads[0]!).replace(/^\.staging-[0-9a-f]+$/, "staging"))).toEqual(["staging", "town%2Fmemory"]);
      expect(store.getShop("dimitri/todo")).toMatchObject({ owner: null, ownerName: null });
      expect((await send(token, "publish", todo(exitZero()))).exit).toBe(0);
      expect(store.getShop("dimitri/todo")).toMatchObject({ owner: pass.userId });
    } finally {
      rmSync(at, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("consent: a shop that proposes a type, through the hall", () => {
  const FIGMA_DIR = path.resolve(import.meta.dirname, "fixtures/figma-shop");
  const FIGMA_MANIFEST = readFileSync(path.join(FIGMA_DIR, "manifest.yaml"), "utf8").replace("http://127.0.0.1:9", "https://api.figma.com");
  const FIGMA_ENTRY = readFileSync(path.join(FIGMA_DIR, "main.mjs"), "utf8");
  const GUIDANCE = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";
  const figma = (manifest = FIGMA_MANIFEST) => bundleOf({ "manifest.yaml": manifest, "main.mjs": FIGMA_ENTRY });
  const WAIT = "tests wait: dimitri/figma needs figma, which no grant of yours binds; they run when a person approves your permit\n";

  /** The criterion: no grant at a shop with needs that no person made, whatever its state; a revoked publish grant made before the shop gained its need is the only other. */
  function expectNoGrantAtNeedsNoPersonMade(step: string): void {
    for (const g of store.listGrants()) {
      const needs = store.getShop(g.shop)?.manifest.credentials ?? [];
      if (needs.length === 0) continue;
      const person = g.source === null || /^permit prm_[0-9a-f]{16}$/.test(g.source);
      expect(person || (g.source === "publish" && g.revokedAt !== null), `${step}: ${g.id} at ${g.shop} source ${g.source}`).toBe(true);
    }
  }

  it("validates a proposal and refuses a need's mistakes, runs nothing at test, and at publish proposes the type, keeps the shop untested, and asks for a permit in the publish grant's place", async () => {
    const { token, pass } = agentWith({ "town/hall": {} });

    // validate: ok, and each refusal of a need; nothing written.
    expect(await send(token, "validate", figma())).toMatchObject({ exit: 0, stdout: "ok dimitri/figma 0.1.0: file, comments\n", detail: "valid dimitri/figma 0.1.0" });
    const elsewhere = await send(token, "validate", figma(FIGMA_MANIFEST.replace("and paste it.", "and paste it at https://paste.example.com/figma.")));
    expect(elsewhere).toMatchObject({ exit: 1, result: "usage", detail: "refused §8", stdout: "credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)\n" });
    const held = await send(token, "validate", figma(FIGMA_MANIFEST.replace("type: figma", "type: github-token")));
    expect(held.stdout).toBe("credentials[0]: github-token is a type this town holds, at https://api.github.com in Authorization; leave the definition out, or write that (spec §8)\n");
    const registration = FIGMA_MANIFEST.replace("    guidance:", "    oauth: { authorize: https://www.figma.com/oauth, token: https://api.figma.com/v1/oauth/token, scopes: [file_read], client_id: abc }\n    guidance:");
    expect((await send(token, "validate", figma(registration))).stdout).toMatch(/^credentials\[0\]\.oauth\.client_id: is a registration, which is the operator's and never a manifest's; /);
    const oauth = registration.replace(", client_id: abc", "");
    // An oauth definition validates since consent phase 1, and validate proposes nothing.
    expect((await send(token, "validate", figma(oauth))).stdout).toBe("ok dimitri/figma 0.1.0: file, comments\n");
    expect(store.listTypes().map((t) => t.name)).toEqual(["github-token"]);
    expectNoGrantAtNeedsNoPersonMade("validate");

    // test: the wait line, exit 0, nothing run, nothing kept.
    const tested = await send(token, "test", figma());
    expect(tested).toMatchObject({ exit: 0, result: "ok", stdout: WAIT, detail: "tests wait" });
    expect(runs).toEqual([]);
    expect([store.getShop("dimitri/figma"), store.getType("figma"), store.listPermits()]).toEqual([null, null, []]);
    expect(stagings()).toEqual([]);
    expectNoGrantAtNeedsNoPersonMade("test");

    // publish: the wait line, then the permit's; the type proposed, the shop owned and untested, no grant, the permit pending at every command.
    const published = await send(token, "publish", figma());
    const permit = /requested (prm_[0-9a-f]{16}),/.exec(published.stdout)?.[1];
    expect(published).toMatchObject({
      exit: 0,
      result: "ok",
      stdout: `${WAIT}published dimitri/figma 0.1.0; it needs figma, so a person decides at the box: requested ${permit}, and town --help shows the answer\n`,
      detail: `published dimitri/figma 0.1.0; requested ${permit}`,
    });
    expectNoGrantAtNeedsNoPersonMade("publish");
    expect(runs).toEqual([]);
    expect(store.getShop("dimitri/figma")).toMatchObject({ owner: pass.userId, testedAt: null });
    expect(existsSync(path.join(shopDir(store, "dimitri/figma"), "main.mjs"))).toBe(true);
    expect(store.getType("figma")).toMatchObject({ kind: "token", state: "proposed", proposedBy: "dimitri/figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", guidance: GUIDANCE });
    expect(store.listPermits(pass.id).map((p) => [p.id, p.shop, p.commands, p.constraints, p.why, p.decision])).toEqual([[permit, "dimitri/figma", ["file", "comments"], {}, "published dimitri/figma 0.1.0", null]]);
    expect(store.listGrants().filter((g) => g.shop === "dimitri/figma")).toEqual([]);
    expect((await gate(deps, call(token, ["--help"]))).stdout).not.toContain("dimitri/figma");

    // requests, show, and search say the need, never an id, with the shop's guidance under its name.
    const requests = (await hall(token, "requests")).stdout.split("\n");
    expect(requests[0]).toMatch(/^id\s+shop\s+commands\s+constraints\s+why\s+asked\s+state\s+needs$/);
    expect(requests[1]).toMatch(new RegExp(`^${permit}\\s+dimitri/figma\\s+file,comments\\s+-\\s+published dimitri/figma 0\\.1\\.0\\s+\\S+\\s+pending\\s+figma: proposed \\(https://api\\.figma\\.com\\), none connected$`));
    expect(requests.slice(2)).toEqual([`dimitri/figma says: ${GUIDANCE}`, ""]);
    const shown = (await hall(token, "show", "--shop", "dimitri/figma")).stdout;
    expect(shown).toMatch(/^dimitri\/figma: Reads Figma documents/);
    expect(shown.endsWith(`\nthis pass holds: none of these\nneeds figma (none connected)\ndimitri/figma says: ${GUIDANCE}\n`)).toBe(true);
    expect((await hall(token, "search", "--query", "figma")).stdout).toMatch(/^dimitri\/figma\s+Reads Figma .* held: none  needs figma \(none connected\)\n$/);

    // A second publish moving the origin is refused, naming what the town holds; the proposal stands as first written.
    const moved = await send(token, "publish", figma(FIGMA_MANIFEST.replace("origin: https://api.figma.com", "origin: https://api.figma.com/v2")));
    expect(moved).toMatchObject({ exit: 1, stdout: "credentials[0]: figma is a type this town holds, at https://api.figma.com in X-Figma-Token; leave the definition out, or write that (spec §8)\n" });
    expect(store.getType("figma")?.origin).toBe("https://api.figma.com");

    // A second publish with a new command replaces the shop and the pending permit, which asks for three.
    const three = FIGMA_MANIFEST.replace("tests:", "  - name: environment\n    summary: Print the environment the shop was given.\n    effect: read\n    output: json\ntests:");
    const again = await send(token, "publish", figma(three));
    const second = /requested (prm_[0-9a-f]{16}),/.exec(again.stdout)![1]!;
    expect(second).not.toBe(permit);
    expect(store.listPermits(pass.id).map((p) => [p.id, p.commands, p.decision])).toEqual([[second, ["file", "comments", "environment"], null]]);
    expect(store.permitById(permit!)).toBeNull();
    expectNoGrantAtNeedsNoPersonMade("republish");

    // Approved at the box (the type, a credential, the tests, the grant): then a republish keeps the person's grant and clears tested_at.
    store.approveType("figma");
    const cred = store.addCredential({ userName: "dimitri", type: "figma", label: "figma", value: "figma-not-a-token" }, Buffer.alloc(32, 7), NOW);
    store.markTested("dimitri/figma", NOW);
    const approved = approvePermit(store, second, { commands: undefined, constraints: [], credentials: [], expiresAt: null }, NOW);
    if (Array.isArray(approved)) throw new Error(approved.join("\n"));
    expect(approved.grant).toMatchObject({ source: `permit ${second}`, credentials: { figma: cred.id } });
    expectNoGrantAtNeedsNoPersonMade("approve");
    const kept = await send(token, "publish", figma(three.replace("version: 0.1.0", "version: 0.1.1")));
    expect(kept).toMatchObject({
      exit: 0,
      stdout: `${WAIT}this pass's grant ${approved.grant.id} at dimitri/figma was made by a person, so it stands as it is, and this publish asked for none; if the shop needs a new secret, town hall request --shop dimitri/figma asks a person\npublished dimitri/figma 0.1.1; town figma --help says what it does\n`,
    });
    expect(store.getShop("dimitri/figma")).toMatchObject({ version: "0.1.1", testedAt: null });
    expect(store.listPermits(pass.id).map((p) => p.decision)).toEqual(["approved"]);
    expect(runs).toEqual([]);
    expectNoGrantAtNeedsNoPersonMade("republish after approval");
  });

  it("revokes a publish grant made before the shop gained a need, and asks for a permit in its place", async () => {
    const { token, pass } = agentWith({ "town/hall": {} });
    const noNeeds = FIGMA_MANIFEST.replace(/credentials:\n(    .*\n|  - .*\n)*/, "").replace(/tests:[\s\S]*$/, "tests:\n  - name: it runs\n    run: file --key x\n    expect: { exit: 0 }\n");
    const first = await send(token, "publish", figma(noNeeds));
    expect(first).toMatchObject({ exit: 0, stdout: "ok it runs\npublished dimitri/figma 0.1.0; town figma --help says what it does\n" });
    const [made] = store.grantsForPass(pass.id, NOW).filter((g) => g.shop === "dimitri/figma");
    expect(made).toMatchObject({ source: "publish" });
    expect(store.getShop("dimitri/figma")?.testedAt).toBe(NOW);
    expectNoGrantAtNeedsNoPersonMade("publish with no needs");
    runs = [];

    const needy = await send(token, "publish", figma());
    const permit = /requested (prm_[0-9a-f]{16}),/.exec(needy.stdout)![1]!;
    expect(needy.stdout).toBe(`${WAIT}${made!.id} at dimitri/figma is no longer live: it binds no credential for a need the shop gained\na grant made again with townd admin grant new binds a credential for each need\npublished dimitri/figma 0.1.0; it needs figma, so a person decides at the box: requested ${permit}, and town --help shows the answer\n`);
    expect(store.grantById(made!.id)?.revokedAt).toBe(NOW);
    expect(store.listGrants(pass.id).filter((g) => g.shop === "dimitri/figma" && g.revokedAt === null)).toEqual([]);
    expect(store.getShop("dimitri/figma")?.testedAt).toBeNull();
    expect(runs).toEqual([]);
    expectNoGrantAtNeedsNoPersonMade("publish that gained a need");
  });
});

describe("consent phase 3: a type's guidance follows the shop that proposed it", () => {
  const FIGMA_DIR = path.resolve(import.meta.dirname, "fixtures/figma-shop");
  const WIDE_DIR = path.resolve(import.meta.dirname, "fixtures/figma-shop-0.2.0");
  const at = (dir: string) => readFileSync(path.join(dir, "manifest.yaml"), "utf8").replace("http://127.0.0.1:9", "https://api.figma.com");
  const NARROW = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";
  const WIDE = "Make a personal access token at Figma > Settings > Security, with file_content:read and file_comments:read, and paste it.";
  const OTHER = "Ask the design lead for a token made at Figma > Settings > Security.";
  const ENTRY = readFileSync(path.join(FIGMA_DIR, "main.mjs"), "utf8");
  const figma = (manifest: string) => bundleOf({ "manifest.yaml": manifest, "main.mjs": ENTRY });
  const WAIT = (shop: string) => `tests wait: ${shop} needs figma, which no grant of yours binds; they run when a person approves your permit\n`;
  const requested = (stdout: string) => /requested (prm_[0-9a-f]{16}),/.exec(stdout)![1]!;

  it("writes the proposer's new words onto the type, proposed and then held, and says so; the definition never moves, the same words say nothing, and a republish over a person's grant says how to ask again", async () => {
    const { token, pass } = agentWith({ "town/hall": {} });
    expect((await send(token, "publish", figma(at(FIGMA_DIR)))).exit).toBe(0);
    expect(store.getType("figma")).toMatchObject({ state: "proposed", guidance: NARROW });

    // Proposed: the republish's words are the type's, and the line says so.
    const wide = await send(token, "publish", figma(at(WIDE_DIR)));
    expect(wide).toMatchObject({ exit: 0, stdout: `${WAIT("dimitri/figma")}published dimitri/figma 0.2.0; figma's guidance is now dimitri/figma 0.2.0's; it needs figma, so a person decides at the box: requested ${requested(wide.stdout)}, and town --help shows the answer\n` });
    expect(store.getType("figma")).toMatchObject({ state: "proposed", proposedBy: "dimitri/figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", guidance: WIDE });

    // The same words again: nothing to say.
    const same = await send(token, "publish", figma(at(WIDE_DIR).replace("version: 0.2.0", "version: 0.2.1")));
    expect(same.stdout).toContain("published dimitri/figma 0.2.1; it needs figma,");
    expect(same.stdout).not.toContain("guidance");

    // Words naming a host the type does not send to: refused, and the type's stand.
    const elsewhere = await send(token, "publish", figma(at(WIDE_DIR).replace("and paste it.", "and paste it at paste.example.com.").replace("version: 0.2.0", "version: 0.2.2")));
    expect(elsewhere).toMatchObject({ exit: 1, stdout: "credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)\n" });
    expect(store.getType("figma")!.guidance).toBe(WIDE);

    // Held, with a person's grant: new words reach the type; the grant stands, and the line says how to ask for a new secret.
    const permit = requested(same.stdout);
    store.approveType("figma");
    const cred = store.addCredential({ userName: "dimitri", type: "figma", label: "figma", value: "figma-not-a-token" }, Buffer.alloc(32, 7), NOW);
    store.markTested("dimitri/figma", NOW);
    const approved = approvePermit(store, permit, { commands: undefined, constraints: [], credentials: [], expiresAt: null }, NOW);
    if (Array.isArray(approved)) throw new Error(approved.join("\n"));
    const narrowAgain = await send(token, "publish", figma(at(FIGMA_DIR).replace("version: 0.1.0", "version: 0.3.0")));
    expect(narrowAgain).toMatchObject({
      exit: 0,
      stdout: `${WAIT("dimitri/figma")}this pass's grant ${approved.grant.id} at dimitri/figma was made by a person, so it stands as it is, and this publish asked for none; if the shop needs a new secret, town hall request --shop dimitri/figma asks a person\npublished dimitri/figma 0.3.0; figma's guidance is now dimitri/figma 0.3.0's; town figma --help says what it does\n`,
      detail: "published dimitri/figma 0.3.0",
    });
    expect(store.getType("figma")).toMatchObject({ state: "held", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", guidance: NARROW });
    expect(store.grantById(approved.grant.id)).toMatchObject({ revokedAt: null, credentials: { figma: cred.id } });
    expect(store.listPermits(pass.id).filter((p) => p.decision === null)).toEqual([]);
  });

  it("leaves the type's words as they are when another shop defines it with its own, and shows that shop's own words with its permit, in show, and in permit show; a shop naming the type bare shows the type's", async () => {
    const { token } = agentWith({ "town/hall": {} });
    expect((await send(token, "publish", figma(at(FIGMA_DIR)))).exit).toBe(0);
    const notes = at(WIDE_DIR).replace("name: dimitri/figma", "name: dimitri/figma-notes").replace(WIDE, OTHER);
    const other = await send(token, "publish", figma(notes));
    expect(other.stdout).toBe(`${WAIT("dimitri/figma-notes")}published dimitri/figma-notes 0.2.0; it needs figma, so a person decides at the box: requested ${requested(other.stdout)}, and town --help shows the answer\n`);
    expect(store.getType("figma")).toMatchObject({ proposedBy: "dimitri/figma", guidance: NARROW });

    store.approveType("figma");
    store.addCredential({ userName: "dimitri", type: "figma", label: "figma", value: "figma-not-a-token" }, Buffer.alloc(32, 7), NOW);

    // Its own words, attributed to it: show, and the checklist; the proposer's shop shows the type's.
    const bare = at(FIGMA_DIR).replace("name: dimitri/figma", "name: dimitri/figma-bare").replace(/    origin:.*\n    header:.*\n    guidance:.*\n/, "");
    const bareSent = await send(token, "publish", figma(bare));
    expect(bareSent.exit, bareSent.stdout).toBe(0);
    expect((await hall(token, "show", "--shop", "dimitri/figma-notes")).stdout.endsWith(`needs figma (connected)\ndimitri/figma-notes says: ${OTHER}\n`)).toBe(true);
    expect((await hall(token, "show", "--shop", "dimitri/figma-bare")).stdout.endsWith(`needs figma (connected)\ndimitri/figma says: ${NARROW}\n`)).toBe(true);
    expect(checklist(store, store.permitById(requested(other.stdout))!)).toContain(`    dimitri/figma-notes says: ${OTHER}\n    dimitri's: `);
    expect(checklist(store, store.permitById(requested(bareSent.stdout))!)).toContain(`    dimitri/figma says: ${NARROW}\n    dimitri's: `);
  });

  it("shows each pending permit's unmet need with its own shop's words in requests", async () => {
    const { token } = agentWith({ "town/hall": {} });
    expect((await send(token, "publish", figma(at(FIGMA_DIR)))).exit).toBe(0);
    expect((await send(token, "publish", figma(at(WIDE_DIR).replace("name: dimitri/figma", "name: dimitri/figma-notes").replace(WIDE, OTHER)))).exit).toBe(0);
    const lines = (await hall(token, "requests")).stdout.trimEnd().split("\n");
    // Both permits were asked at the same moment, so the table's order between them is the ids'.
    expect(lines.slice(3).sort()).toEqual([`dimitri/figma says: ${NARROW}`, `dimitri/figma-notes says: ${OTHER}`]);
  });

  it("writes guidance only for the proposer, with its definition, and never a host the type does not send to, at the store too", () => {
    store.proposeType({ name: "figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", guidance: NARROW }, "dimitri/figma", false, NOW);
    const def = { name: "figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}" };
    expect(store.reviseGuidance({ ...def, guidance: WIDE }, "dimitri/figma-notes")).toBe(false);
    expect(store.reviseGuidance(def, "dimitri/figma")).toBe(false);
    expect(store.reviseGuidance({ ...def, guidance: `${NARROW}\n` }, "dimitri/figma")).toBe(false);
    expect(() => store.reviseGuidance({ ...def, guidance: "Paste it at paste.example.com." }, "dimitri/figma")).toThrow("dimitri/figma's guidance for figma names paste.example.com, which is not where this type sends; the validator refuses it (spec §8)");
    expect(() => store.reviseGuidance({ ...def, origin: "https://api.figma.com/v2", guidance: WIDE }, "dimitri/figma")).toThrow("dimitri/figma's definition of figma is not the town's; the validator refuses it (spec §8)");
    expect(store.getType("figma")!.guidance).toBe(NARROW);
    expect(store.reviseGuidance({ ...def, guidance: "Make one at https://api.figma.com/settings, with file_comments:read." }, "dimitri/figma")).toBe(true);
    expect(store.getType("figma")).toMatchObject({ ...def, state: "proposed", guidance: "Make one at https://api.figma.com/settings, with file_comments:read." });
  });
});
