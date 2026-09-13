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

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, splitWords } from "../src/args.js";
import { denials } from "../src/denials.js";
import { gate, type CallRequest, type GateDeps, type Runtime } from "../src/gate.js";
import { approvePermit } from "../src/grants.js";
import { HALL, HALL_YAML, runHall } from "../src/hall.js";
import { parseManifest, validateManifest } from "../src/manifest.js";
import { SPEC } from "../src/spec.js";
import { loadShop } from "../src/shoptest.js";
import { openStore, type Pass, type Store } from "../src/store.js";

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");

let dir: string;
let store: Store;
let runs: string[];
let deps: GateDeps;

const fakeRuntime: Runtime = async (_dir, manifest, command) => {
  runs.push(`${manifest.name} ${command}`);
  return { stdout: "the shop's output\n", stderr: "", exit: 0, timedOut: false, aborted: false, credentials: [], calls: 0, denied: null };
};

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-hall-test-"));
  store = openStore(dir);
  store.upsertShop(await loadShop(MEMORY), NOW);
  runs = [];
  deps = { store, runtime: fakeRuntime, now: () => NOW };
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
      const out = await runHall({ store, now: () => NOW }, { pass, grant, command: command!, values: (parsed as { values: Record<string, string> }).values, stdin: null, callId: "call_test" });
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
    const firstId = /^requested (prm_[0-9a-f]{16}); a person decides at the box, and town --help shows the answer\n$/.exec(first.stdout)![1]!;
    expect(first).toMatchObject({ exit: 0, result: "ok", detail: `requested ${firstId}` });
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

  it("enforces a constraint on request.shop at step 5, and the permit is not made", async () => {
    const { token, pass } = agentWith({ "town/hall": { constraints: { "request.shop": { prefix: "town/" } } } });
    const o = await hall(token, "request", "--shop", "alice/notes");
    expect(o).toMatchObject({ exit: 2, result: "denied", error: denials.constraint("shop", "prefix", "town/"), stdout: "" });
    expect(store.listPermits(pass.id)).toEqual([]);
    expect((await hall(token, "request", "--shop", "town/memory")).exit).toBe(0);
    expect(store.listPermits(pass.id)).toHaveLength(1);
  });

  it("answers validate, test, and publish with not built yet, exit 1, as the town's error", async () => {
    const { token } = agentWith({ "town/hall": {} });
    for (const command of ["validate", "test", "publish"]) {
      expect(await hall(token, command)).toMatchObject({ stdout: "error: not built yet\n", exit: 1, result: "town-error", detail: "not built yet", shopExit: null });
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
