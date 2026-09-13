// ring: checkout
// The gate's six steps in the design's order, against a real store and a
// fake runtime that records whether it ran: every denial in order, each
// step beating the next, the result class per outcome, one audit row per
// call, and the enumeration of denials.ts, every sentence the agent can
// be told. Step 6 with a binding: a fake vault counting what it opens and
// every listener counted, so a denied, malformed, or dead call, and a
// grant not live, is seen to open nothing. A caller in place of a bearer:
// `effective` enumerated, a caller's grants the effective ones through a
// fake runtime, and through the real one a recipe and a deep shop over
// fixtures, each call cut from the agent's own grants by its calling
// shop's manifest. The inner-denial rule in its three cases, the depth
// bound, and every call in a tree recorded with its parent.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArgValues } from "../src/args.js";
import { denials } from "../src/denials.js";
import { MAX_DEPTH, effective, gate, shopDir, type CallRequest, type GateDeps, type Runtime, type Vault } from "../src/gate.js";
import { parseManifest, type Manifest } from "../src/manifest.js";
import { stateDir, type RunCredential, type RunOptions, type RunResult } from "../src/runtime.js";
import { handleCall, respond } from "../src/server.js";
import { loadShop } from "../src/shoptest.js";
import { hashToken, openStore, type Grant, type Pass, type Store } from "../src/store.js";
import { fakeOrigin, type FakeOrigin } from "./helpers/origin.js";

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const DAY = 86_400_000;

const MEMORY = parseManifest(readFileSync(path.resolve(import.meta.dirname, "../shops/memory/manifest.yaml"), "utf8")).manifest!;
const KINDS = parseManifest(`
name: test/kinds
version: 0.0.1
summary: Every constraint kind.
runtime: subprocess
entry: ./main.mjs
commands:
  - name: pick
    summary: Pick one.
    effect: read
    args:
      - { name: word, type: string, required: true, constrainable: [equals, one_of, prefix, regex, max_length] }
      - { name: n, type: int, constrainable: [equals, one_of] }
    output: text
tests:
  - { name: t, run: pick --word a, expect: { exit: 0 } }
`).manifest!;

interface Recorded {
  shop: string;
  command: string;
  args: ArgValues;
  user: string;
  stdin: string | Buffer | null | undefined;
  credentials?: RunCredential[] | undefined;
  town?: RunOptions["town"];
}

let dir: string;
let store: Store;
let runs: Recorded[];
let next: RunResult;
let deps: GateDeps;

const fakeRuntime: Runtime = async (shopDir, manifest: Manifest, command, args, opts) => {
  runs.push({ shop: manifest.name, command, args, user: opts.user, stdin: opts.stdin, ...(opts.credentials ? { credentials: opts.credentials } : {}), ...(opts.town ? { town: opts.town } : {}) });
  void shopDir;
  return next;
};

function passWith(grants: Array<{ shop: string; commands?: string[]; constraints?: Record<string, Record<string, unknown>>; expiresAt?: number | null }>, passExpires: number | null = null): { pass: Pass; token: string } {
  const name = `u${Math.random().toString(16).slice(2, 8)}`;
  store.addUser(name, NOW);
  const made = store.newPass(name, "a label", passExpires, NOW);
  for (const g of grants) {
    const manifest = store.getShop(g.shop)!.manifest;
    store.newGrant({ passId: made.pass.id, shop: g.shop, commands: g.commands ?? manifest.commands.map((c) => c.name), constraints: (g.constraints ?? {}) as never, expiresAt: g.expiresAt ?? null }, NOW);
  }
  return made;
}

const call = (token: string | null, argv: string[], extra: Partial<CallRequest> = {}): CallRequest => ({ token, argv, stdin: null, json: false, ...extra });

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-gate-test-"));
  store = openStore(dir);
  store.upsertShop(MEMORY, NOW);
  store.upsertShop(KINDS, NOW);
  runs = [];
  next = { stdout: "the shop's output\n", stderr: "", exit: 0, timedOut: false, aborted: false, credentials: [], calls: 0, denied: null };
  deps = { store, runtime: fakeRuntime, now: () => NOW };
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the six steps, in order", () => {
  it("walks journey 2's grant through every outcome, the runtime reached only on the last", async () => {
    const { token } = passWith([{ shop: "town/memory", commands: ["remember", "recall", "list"], constraints: { "remember.key": { prefix: "notes/" }, "recall.key": { prefix: "notes/" } } }]);
    const steps: Array<[string, CallRequest, number, string, string]> = [
      ["1 no bearer", call(null, ["memory", "recall", "--key", "notes/a"]), 3, "invalid-pass", denials.invalidPass()],
      ["1 unknown bearer", call("nope", ["memory", "recall", "--key", "notes/a"]), 3, "invalid-pass", denials.invalidPass()],
      ["2 a reserved word", call(token, ["serve"]), 1, "usage", denials.noSuchCommand("serve")],
      ["2 a shop with no grant", call(token, ["kinds", "pick", "--word", "a"]), 2, "denied", denials.notAvailable("kinds pick")],
      ["3 a command not in the grant", call(token, ["memory", "forget", "--key", "notes/a"]), 2, "denied", denials.notAvailable("forget")],
      ["3 no command", call(token, ["memory"]), 1, "usage", denials.usage(["no command given"], "town memory <remember|recall|list> [--name value ...]; town memory --help says more")],
      ["4 a missing argument", call(token, ["memory", "recall"]), 1, "usage", denials.usage(["--key is required"], "town memory recall --key <string>")],
      ["4 stdin over a megabyte", call(token, ["memory", "remember", "--key", "notes/a"], { stdin: "x".repeat(1024 * 1024 + 1) }), 1, "usage", denials.stdinTooLarge(1024 * 1024 + 1)],
      ["5 a constraint missed", call(token, ["memory", "recall", "--key", "secret/a"]), 2, "denied", denials.constraint("key", "prefix", "notes/")],
    ];
    for (const [label, req, exit, result, error] of steps) {
      const o = await gate(deps, req);
      expect({ label, exit: o.exit, result: o.result, error: o.error }).toEqual({ label, exit, result, error });
      expect(runs, label).toEqual([]);
      expect(o.shopExit, label).toBeNull();
    }
    const ok = await gate(deps, call(token, ["memory", "recall", "--key", "notes/a"]));
    expect(ok).toMatchObject({ exit: 0, result: "ok", stdout: "the shop's output\n", error: "", shopExit: 0 });
    expect(runs).toEqual([{ shop: "town/memory", command: "recall", args: { key: "notes/a" }, user: expect.stringMatching(/^user_/), stdin: null }]);
  });

  it("decides each step before the next: an earlier failure wins over every later one", async () => {
    const { token, pass } = passWith([{ shop: "town/memory", commands: ["recall"], constraints: { "recall.key": { prefix: "notes/" } } }]);
    // 1 before 2: a revoked pass typing a reserved word.
    store.revokePass(pass.id, NOW);
    expect((await gate(deps, call(token, ["serve"]))).exit).toBe(3);
    const other = passWith([{ shop: "town/memory", commands: ["recall"], constraints: { "recall.key": { prefix: "notes/" } } }]).token;
    // 3 before 4: a command not granted, with arguments that would not parse.
    expect((await gate(deps, call(other, ["memory", "forget", "--nonsense"]))).exit).toBe(2);
    // 4 before 5: arguments that do not parse, with a value outside the constraint.
    expect((await gate(deps, call(other, ["memory", "recall", "--key", "secret/a", "--extra", "x"]))).exit).toBe(1);
    // 3 before help: --help after a command the grant lacks is that command's denial.
    expect((await gate(deps, call(other, ["memory", "forget", "--help"]))).result).toBe("denied");
    expect(runs).toEqual([]);
  });

  it("gives every kind its denial, and runs inside each", async () => {
    const { token } = passWith([{ shop: "test/kinds", constraints: { "pick.word": { equals: "abc", one_of: ["abc", "abd"], prefix: "ab", regex: "a[a-z]c", max_length: 3 }, "pick.n": { one_of: [1, 2] } } }]);
    const cases: Array<[string[], string]> = [
      [["--word", "xbc", "--n", "1"], denials.constraint("word", "equals", "abc")],
      [["--word", "abc", "--n", "3"], denials.constraint("n", "one_of", [1, 2])],
      [["--word", "abc"], denials.constraint("n", "one_of", [1, 2])],
    ];
    for (const [args, error] of cases) {
      const o = await gate(deps, call(token, ["kinds", "pick", ...args]));
      expect([o.exit, o.error]).toEqual([2, error]);
    }
    expect(runs).toEqual([]);
    expect((await gate(deps, call(token, ["kinds", "pick", "--word", "abc", "--n", "2"]))).exit).toBe(0);
    expect(runs).toHaveLength(1);
    for (const [kind, rule, value] of [["one_of", ["x", "y"], "z"], ["prefix", "ab", "ba"], ["regex", "a+", "aab"], ["max_length", 2, "abc"]] as const) {
      const t = passWith([{ shop: "test/kinds", commands: ["pick"], constraints: { "pick.word": { [kind]: rule } } }]).token;
      const o = await gate(deps, call(t, ["kinds", "pick", "--word", value]));
      expect([o.exit, o.error]).toEqual([2, denials.constraint("word", kind, rule as never)]);
    }
    expect(runs).toHaveLength(1);
  });
});

describe("step 1: the pass", () => {
  it("is invalid when revoked or expired, with the same line and the reason for the audit", async () => {
    const revoked = passWith([{ shop: "town/memory" }]);
    store.revokePass(revoked.pass.id, NOW - 1);
    const expired = passWith([{ shop: "town/memory" }], NOW - 1);
    const r = await gate(deps, call(revoked.token, ["--help"]));
    const e = await gate(deps, call(expired.token, ["memory", "--help"]));
    expect([r.exit, r.error, r.detail, r.passId]).toEqual([3, denials.invalidPass(), "revoked", revoked.pass.id]);
    expect([e.exit, e.error, e.detail, e.passId]).toEqual([3, denials.invalidPass(), "expired", expired.pass.id]);
    expect(runs).toEqual([]);
  });

  it("is read from the store on every call", async () => {
    const { token, pass } = passWith([{ shop: "town/memory" }]);
    expect((await gate(deps, call(token, ["--help"]))).exit).toBe(0);
    const admin = openStore(dir);
    admin.revokePass(pass.id, NOW);
    admin.close();
    expect((await gate(deps, call(token, ["--help"]))).exit).toBe(3);
  });
});

describe("step 2: the shop", () => {
  it("answers a shop that does not exist and a shop with no grant in the same bytes", async () => {
    const { token } = passWith([{ shop: "town/memory" }]);
    const ungranted = await gate(deps, call(token, ["kinds", "pick", "--word", "a"]));
    store.removeShop("test/kinds");
    const missing = await gate(deps, call(token, ["kinds", "pick", "--word", "a"]));
    expect(respond(missing, false)).toEqual(respond(ungranted, false));
    expect(respond(missing, true)).toEqual(respond(ungranted, true));
  });

  it("takes the full name, and the last segment only when no other grant shares it", async () => {
    store.upsertShop({ ...MEMORY, name: "other/memory" }, NOW);
    const both = passWith([{ shop: "town/memory" }, { shop: "other/memory" }]).token;
    expect((await gate(deps, call(both, ["memory", "list"]))).exit).toBe(2);
    expect((await gate(deps, call(both, ["town/memory", "list"]))).exit).toBe(0);
    const one = passWith([{ shop: "town/memory" }]).token;
    expect((await gate(deps, call(one, ["memory", "list"]))).exit).toBe(0);
  });

  it("treats a revoked or expired grant as no grant", async () => {
    const { token, pass } = passWith([{ shop: "town/memory", expiresAt: NOW - 1 }]);
    expect((await gate(deps, call(token, ["memory", "list"]))).error).toBe(denials.notAvailable("memory list"));
    const g = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["list"], constraints: {}, expiresAt: null }, NOW);
    expect((await gate(deps, call(token, ["memory", "list"]))).exit).toBe(0);
    store.revokeGrant(g.id, NOW);
    expect((await gate(deps, call(token, ["memory", "list"]))).exit).toBe(2);
  });
});

describe("step 6 and after: the result class per outcome", () => {
  it("is ok, shop-error with the shop's exit, or timeout", async () => {
    const { token } = passWith([{ shop: "town/memory" }]);
    const req = call(token, ["memory", "recall", "--key", "k"]);
    expect((await gate(deps, req)).result).toBe("ok");

    next = { stdout: "partial\n", stderr: "line one\nno value under k\n", exit: 7, timedOut: false, aborted: false, credentials: [], calls: 0, denied: null };
    const failed = await gate(deps, req);
    expect(failed).toMatchObject({ result: "shop-error", exit: 1, shopExit: 7, stdout: "partial\n", shopStderr: next.stderr });
    expect(failed.error).toBe(denials.shopFailed("town/memory", "recall", "line one\nno value under k"));

    next = { stdout: "", stderr: "", exit: 1, timedOut: true, aborted: false, credentials: [], calls: 0, denied: null };
    const slow = await gate({ ...deps, timeoutMs: 30_000 }, req);
    expect(slow).toMatchObject({ result: "timeout", exit: 1, error: denials.shopTimedOut("town/memory", "recall", 30) });
  });

  it("passes the call's stdin and the user's opaque id to the runtime", async () => {
    const { token, pass } = passWith([{ shop: "town/memory" }]);
    await gate(deps, call(token, ["memory", "remember", "--key", "k"], { stdin: "from a pipe" }));
    expect(runs[0]).toMatchObject({ stdin: "from a pipe", user: pass.userId });
  });
});

describe("the audit", () => {
  it("writes exactly one row per call whatever happened, with the shop's exit only when it ran", async () => {
    const { token, pass } = passWith([{ shop: "town/memory", commands: ["recall"] }]);
    const reqs = [
      call(null, ["--help"]),
      call(token, ["--help"]),
      call(token, ["memory", "forget", "--key", "k"]),
      call(token, ["memory", "recall"]),
      call(token, ["memory", "recall", "--key", "tacos-thursday"]),
    ];
    for (const r of reqs) await handleCall(deps, r);
    const rows = store.calls();
    expect(rows.map((r) => [r.result, r.exit, r.shopExit])).toEqual([
      ["invalid-pass", 3, null],
      ["ok", 0, null],
      ["denied", 2, null],
      ["usage", 1, null],
      ["ok", 0, 0],
    ]);
    expect(rows.slice(1).every((r) => r.passId === pass.id)).toBe(true);
    for (const r of rows) expect(r.argvHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("tacos-thursday");
  });

  it("writes a row when the gate itself throws, and tells the agent the town failed", async () => {
    const { token } = passWith([{ shop: "town/memory" }]);
    const broken: GateDeps = { ...deps, runtime: async () => { throw new Error("boom"); } };
    const wire = await handleCall(broken, call(token, ["memory", "list"]));
    expect(wire).toEqual({ stdout: "", stderr: `${denials.townFailed()}\n`, exit: 1 });
    expect(store.calls().map((r) => [r.result, r.exit, r.shopExit, r.detail])).toEqual([["town-error", 1, null, "Error"]]);
  });
});

describe("notices and the envelope", () => {
  it("carries grant-expires a day from expiry, as a stderr line or in the envelope, stdout untouched", async () => {
    const { token } = passWith([{ shop: "town/memory", expiresAt: NOW + DAY }], NOW + 3 * DAY);
    const o = await gate(deps, call(token, ["memory", "recall", "--key", "k"]));
    expect(o.notices).toEqual([
      { kind: "grant-expires", shop: "town/memory", expires: "2026-09-13T12:00:00Z" },
      { kind: "pass-expires", expires: "2026-09-15T12:00:00Z" },
    ]);
    expect(respond(o, false)).toEqual({
      stdout: "the shop's output\n",
      stderr: "town-notice: grant-expires shop=town/memory expires=2026-09-13T12:00:00Z\ntown-notice: pass-expires expires=2026-09-15T12:00:00Z\n",
      exit: 0,
    });
    const env = JSON.parse(respond(o, true).stdout);
    expect(env).toEqual({ ok: true, output: "the shop's output\n", notices: o.notices, exit: 0 });
    expect(respond(o, true).stderr).toBe("");
  });

  it("says nothing seven days or more out", async () => {
    const { token } = passWith([{ shop: "town/memory", expiresAt: NOW + 7 * DAY }], NOW + 30 * DAY);
    expect((await gate(deps, call(token, ["memory", "list"]))).notices).toEqual([]);
  });

  it("puts the line that would have gone to stderr in error, only when not ok", async () => {
    const { token } = passWith([{ shop: "town/memory", commands: ["recall"] }]);
    const denied = respond(await gate(deps, call(token, ["memory", "forget", "--key", "k"])), true);
    expect(JSON.parse(denied.stdout)).toEqual({ ok: false, output: "", notices: [], exit: 2, error: denials.notAvailable("forget") });
    expect(denied.stderr).toBe("");
  });
});

describe("denials.ts", () => {
  const samples: Record<keyof typeof denials, () => string> = {
    notAvailable: () => denials.notAvailable("forget"),
    constraint: () => denials.constraint("key", "prefix", "notes/"),
    usage: () => denials.usage(["--key is required"], "town memory recall --key <string>"),
    noSuchCommand: () => denials.noSuchCommand("serve"),
    invalidPass: () => denials.invalidPass(),
    shopFailed: () => denials.shopFailed("town/memory", "recall", "no value under k"),
    shopTimedOut: () => denials.shopTimedOut("town/memory", "recall", 30),
    stdinTooLarge: () => denials.stdinTooLarge(2_000_000),
    badCall: () => denials.badCall(),
    townFailed: () => denials.townFailed(),
    noGrantFile: () => denials.noGrantFile(),
    badGrantFile: () => denials.badGrantFile(".town/grant"),
    flagNeedsValue: () => denials.flagNeedsValue("--grant"),
    townUnreachable: () => denials.townUnreachable(),
    stdinNotText: () => denials.stdinNotText(),
  };

  it("is exactly these sentences", () => {
    expect(Object.keys(denials).sort()).toEqual(Object.keys(samples).sort());
  });

  it.each(Object.keys(samples) as Array<keyof typeof denials>)("%s is one sentence on one line starting with error:", (name) => {
    const text = samples[name]();
    const [first, ...rest] = text.split("\n");
    expect(first).toMatch(/^error: [^\n]+$/);
    if (name === "usage") expect(rest).toEqual(["usage: town memory recall --key <string>"]);
    else if (name === "shopFailed") expect(rest).toEqual(["no value under k"]);
    else expect(rest).toEqual([]);
  });

  it("words the journey's two denials as the journey does", () => {
    expect(denials.notAvailable("forget")).toBe("error: command 'forget' is not available to this grant");
    expect(denials.constraint("key", "prefix", "notes/")).toBe("error: --key must start with 'notes/' under this grant");
  });

  it("gives each constraint kind its own sentence", () => {
    const lines = [
      denials.constraint("key", "equals", "a"),
      denials.constraint("key", "one_of", ["a", "b"]),
      denials.constraint("key", "prefix", "a"),
      denials.constraint("key", "regex", "a+"),
      denials.constraint("key", "max_length", 4),
    ];
    expect(lines).toEqual([
      "error: --key must be 'a' under this grant",
      "error: --key must be one of 'a', 'b' under this grant",
      "error: --key must start with 'a' under this grant",
      "error: --key must match the pattern 'a+' as a whole under this grant",
      "error: --key must be at most 4 characters under this grant",
    ]);
  });
});

describe("step 6: the bindings", () => {
  const TELLER_DIR = path.resolve(import.meta.dirname, "fixtures/teller-shop");
  const TOKEN = "the-gate-test-token-7c1e";
  let origin: FakeOrigin;
  let opened: string[];
  let vault: Vault;
  let listens: http.Server[];

  beforeAll(async () => {
    origin = await fakeOrigin();
  });
  afterAll(async () => {
    await origin.close();
  });

  beforeEach(async () => {
    store.addType({ name: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}" }, NOW);
    store.upsertShop(await loadShop(TELLER_DIR, ["test-origin"]), NOW);
    cpSync(TELLER_DIR, shopDir(store, "test/teller"), { recursive: true });
    opened = [];
    vault = { open: (id) => (opened.push(id), `${TOKEN}`) };
    listens = [];
    const listen = http.Server.prototype.listen;
    vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (this: http.Server, ...args: unknown[]) {
      listens.push(this);
      return (listen as (...a: unknown[]) => http.Server).apply(this, args);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A pass whose user holds one test-origin credential, with a grant at test/teller bound to it, or bound to nothing. */
  function boundPass(opts: { commands?: string[]; constraints?: Record<string, Record<string, unknown>>; bind?: boolean } = {}) {
    const name = `u${Math.random().toString(16).slice(2, 8)}`;
    store.addUser(name, NOW);
    const made = store.newPass(name, "a label", null, NOW);
    const c = store.addCredential({ userName: name, type: "test-origin", label: "", value: "sealed, never opened by this test" }, Buffer.alloc(32, 1), NOW);
    const g = store.newGrant(
      { passId: made.pass.id, shop: "test/teller", commands: opts.commands ?? ["get", "post"], constraints: (opts.constraints ?? {}) as never, expiresAt: null, ...(opts.bind === false ? {} : { credentials: { "test-origin": c.id } }) },
      NOW,
    );
    return { ...made, credential: c, grant: g };
  }

  it("hands a live grant's bindings to the runtime with the type's origin and header, opened once, at step 6", async () => {
    const { token, credential } = boundPass();
    const o = await gate({ ...deps, vault }, call(token, ["teller", "get", "--path", "/x"]));
    expect(o.exit, o.error).toBe(0);
    expect(opened).toEqual([credential.id]);
    expect(runs).toEqual([
      expect.objectContaining({ shop: "test/teller", command: "get", credentials: [{ type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: TOKEN }] }),
    ]);
    expect(listens).toEqual([]); // the fake runtime opens no teller
    expect(JSON.stringify(o)).not.toContain(TOKEN);
  });

  it("through the real runtime, a live call opens one teller, the request arrives signed, and the audit row counts it", async () => {
    const { token } = boundPass();
    const before = origin.seen.length;
    const real: GateDeps = { store, vault, now: () => NOW };
    const wire = await handleCall(real, call(token, ["teller", "get", "--path", "/signed"]));
    expect(wire).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
    expect(listens).toHaveLength(1);
    expect(listens[0]!.listening).toBe(false);
    expect(origin.seen.slice(before).map((s) => [s.url, s.headers.authorization])).toEqual([["/signed", `Bearer ${TOKEN}`]]);
    const row = store.calls().at(-1)!;
    expect(row.credentials).toEqual([{ type: "test-origin", requests: 1 }]);
    expect(JSON.stringify(store.calls())).not.toContain(TOKEN);
  });

  it("opens nothing and listens nowhere on a denied, a malformed, or a dead-pass call, through the real runtime", async () => {
    const { token, pass } = boundPass({ commands: ["get"], constraints: { "get.path": { prefix: "/ok/" } } });
    const real: GateDeps = { store, vault, now: () => NOW };
    const cases: Array<[string, CallRequest, number, string]> = [
      ["a command not granted", call(token, ["teller", "post", "--path", "/ok/a", "--body", "b"]), 2, denials.notAvailable("post")],
      ["a constraint missed", call(token, ["teller", "get", "--path", "/elsewhere"]), 2, denials.constraint("path", "prefix", "/ok/")],
      ["malformed: a missing argument", call(token, ["teller", "get"]), 1, denials.usage(["--path is required"], "town teller get --path <string>")],
      ["malformed: an unknown argument", call(token, ["teller", "get", "--path", "/ok/a", "--colour", "red"]), 1, denials.usage(["--colour is not an argument of get"], "town teller get --path <string>")],
    ];
    for (const [label, req, exit, error] of cases) {
      const o = await handleCall(real, req);
      expect([label, o.exit, o.stderr]).toEqual([label, exit, `${error}\n`]);
    }
    store.revokePass(pass.id, NOW);
    expect((await handleCall(real, call(token, ["teller", "get", "--path", "/ok/a"]))).exit).toBe(3);
    expect(opened).toEqual([]);
    expect(listens).toEqual([]);
    expect(store.calls().every((r) => r.credentials.length === 0)).toBe(true);
  });

  it("makes a grant whose credential is revoked not live: 'not available', nothing opened, nothing listening, help without the shop", async () => {
    const { token, pass, credential } = boundPass();
    const real: GateDeps = { store, vault, now: () => NOW };
    expect((await gate(real, call(token, ["--help"]))).stdout).toContain("test/teller");
    store.revokeCredential(credential.id, NOW);
    const o = await gate(real, call(token, ["teller", "get", "--path", "/x"]));
    expect([o.exit, o.result, o.error]).toEqual([2, "denied", denials.notAvailable("teller get")]);
    expect((await gate(real, call(token, ["teller", "--help"]))).error).toBe(denials.notAvailable("teller"));
    expect((await gate(real, call(token, ["--help"]))).stdout).toBe("This pass holds no grants.\n");
    expect(store.grantById(store.listGrants(pass.id)[0]!.id)!.revokedAt).toBeNull();
    expect(opened).toEqual([]);
    expect(listens).toEqual([]);
  });

  it("makes a grant with a need its bindings do not meet not live, the same way", async () => {
    const { token } = boundPass({ bind: false });
    const real: GateDeps = { store, vault, now: () => NOW };
    const o = await gate(real, call(token, ["teller", "get", "--path", "/x"]));
    expect([o.exit, o.error]).toEqual([2, denials.notAvailable("teller get")]);
    expect(opened).toEqual([]);
    expect(listens).toEqual([]);
  });

  it("fails on the town's side, in words that name no credential, when there is no vault key to open a binding with", async () => {
    const { token, credential } = boundPass();
    const noKey: Vault = { open: () => { throw new Error("/some/data/vault.key cannot be read: EACCES"); } };
    const wire = await handleCall({ store, vault: noKey, now: () => NOW }, call(token, ["teller", "get", "--path", "/x"]));
    expect(wire).toEqual({ stdout: "", stderr: `${denials.townFailed()}\n`, exit: 1 });
    const row = store.calls().at(-1)!;
    expect([row.result, row.detail, row.credentials]).toEqual(["town-error", "a credential did not open under the vault key", []]);
    const none = await handleCall({ store, now: () => NOW }, call(token, ["teller", "get", "--path", "/x"]));
    expect(none.stderr).toBe(`${denials.townFailed()}\n`);
    expect(store.calls().at(-1)!.detail).toBe("the vault key is missing");
    for (const text of [JSON.stringify(wire), JSON.stringify(store.calls())]) {
      expect(text).not.toContain(credential.id);
      expect(text).not.toContain("vault.key");
    }
    expect(listens).toEqual([]);
  });
});

describe("effective", () => {
  const grant = (shop: string, commands: string[], extra: Partial<Grant> = {}): Grant => ({
    id: `grant_${shop.replace("/", "_")}`,
    passId: "pass_1",
    shop,
    commands,
    constraints: {},
    createdAt: NOW,
    expiresAt: null,
    revokedAt: null,
    credentials: {},
    source: null,
    ...extra,
  });
  const composed = (depends: Manifest["depends"]): Manifest => ({ ...MEMORY, name: "test/composed", depends });

  it("is the agent's grant at each dependency, commands intersected, constraints on them kept, bindings its own; the rest absent", () => {
    const agent = [
      grant("town/memory", ["remember", "recall", "list", "forget"], {
        constraints: { "recall.key": { prefix: "notes/" }, "forget.key": { prefix: "tmp/" }, "remember.key": { max_length: 8 } },
        expiresAt: NOW + DAY,
      }),
      grant("test/kinds", ["pick"], { constraints: { "pick.word": { equals: "a" } } }),
      grant("test/teller", ["get", "post"], { credentials: { "test-origin": "cred_1" } }),
      grant("test/undeclared", ["anything"]),
    ];
    const m = composed([
      { shop: "town/memory", commands: ["recall", "remember", "shout"] },
      { shop: "test/teller", commands: ["get"] },
      { shop: "test/lacking", commands: ["read"] },
    ]);
    expect(effective(agent, m)).toEqual([
      grant("town/memory", ["remember", "recall"], { constraints: { "recall.key": { prefix: "notes/" }, "remember.key": { max_length: 8 } }, expiresAt: NOW + DAY }),
      grant("test/teller", ["get"], { credentials: { "test-origin": "cred_1" } }),
    ]);
  });

  it("cases, one at a time: an undeclared command, an undeclared shop, a dependency the agent lacks, a declared command the agent lacks", () => {
    const memory = grant("town/memory", ["recall", "forget"], { constraints: { "recall.key": { prefix: "notes/" } } });
    const cases: Array<[string, Grant[], Manifest["depends"], Array<{ shop: string; commands: string[] }>]> = [
      ["the declared command alone", [memory], [{ shop: "town/memory", commands: ["recall"] }], [{ shop: "town/memory", commands: ["recall"] }]],
      ["an undeclared command is cut", [memory], [{ shop: "town/memory", commands: ["list"] }], []],
      ["an undeclared shop is absent", [memory], [{ shop: "test/kinds", commands: ["pick"] }], []],
      ["a dependency the agent lacks is absent", [], [{ shop: "town/memory", commands: ["recall"] }], []],
      ["no dependencies, nothing", [memory], undefined, []],
      ["never wider than the agent", [memory], [{ shop: "town/memory", commands: ["recall", "forget", "remember", "list"] }], [{ shop: "town/memory", commands: ["recall", "forget"] }]],
    ];
    for (const [label, agent, depends, want] of cases) {
      expect(effective(agent, composed(depends)).map((g) => ({ shop: g.shop, commands: g.commands })), label).toEqual(want);
    }
  });

  it("is a subset of the agent's grants in commands and in constraints, and pure", () => {
    const agent = [grant("town/memory", ["recall", "forget", "list"], { constraints: { "recall.key": { prefix: "n/" }, "list.prefix": { prefix: "n/" } } })];
    const before = JSON.stringify(agent);
    const m = composed([{ shop: "town/memory", commands: ["recall", "remember"] }]);
    const out = effective(agent, m);
    expect(JSON.stringify(agent)).toBe(before);
    expect(effective(agent, m)).toEqual(out);
    for (const g of out) {
      const a = agent.find((x) => x.shop === g.shop)!;
      for (const c of g.commands) expect(a.commands).toContain(c);
      for (const [target, rules] of Object.entries(g.constraints)) expect(a.constraints[target]).toEqual(rules);
      expect(Object.keys(a.constraints).filter((t) => g.commands.includes(t.split(".")[0]!)).sort()).toEqual(Object.keys(g.constraints).sort());
    }
  });
});

describe("a caller, with a fake runtime", () => {
  const COMPOSED: Manifest = { ...KINDS, name: "test/composed", depends: [{ shop: "town/memory", commands: ["recall", "list"] }] };

  beforeEach(() => {
    store.upsertShop(COMPOSED, NOW);
  });

  const inner = (pass: Pass, argv: string[], manifest = COMPOSED): CallRequest => ({ token: null, argv, stdin: null, json: false, caller: { passId: pass.id, manifest, parent: "call_outer", depth: 1 } });

  it("has the effective grants: help lists them, not available covers the rest, constraints are checked, and the runtime runs as the agent's user", async () => {
    const { pass } = passWith([
      { shop: "town/memory", constraints: { "recall.key": { prefix: "notes/" }, "forget.key": { prefix: "notes/" } } },
      { shop: "test/kinds" },
      { shop: "test/composed" },
    ]);
    const help = await gate(deps, inner(pass, ["--help"]));
    expect(help.stdout).toContain("town/memory");
    expect(help.stdout).toContain("[recall, list]");
    expect(help.stdout).not.toContain("test/kinds");
    expect(help.stdout).not.toContain("test/composed");
    const shopHelp = await gate(deps, inner(pass, ["memory", "--help"]));
    expect(shopHelp.stdout).toContain("town memory recall --key <string>");
    expect(shopHelp.stdout).not.toContain("forget");
    expect(shopHelp.stdout).toContain("recall --key: keys under `notes/` only");

    const cases: Array<[string[], number, string]> = [
      [["memory", "forget", "--key", "notes/a"], 2, denials.notAvailable("forget")],
      [["memory", "remember", "--key", "notes/a"], 2, denials.notAvailable("remember")],
      [["kinds", "pick", "--word", "a"], 2, denials.notAvailable("kinds pick")],
      [["composed", "pick", "--word", "a"], 2, denials.notAvailable("composed pick")],
      [["memory", "recall", "--key", "secret/a"], 2, denials.constraint("key", "prefix", "notes/")],
    ];
    for (const [argv, exit, error] of cases) {
      const o = await gate(deps, inner(pass, argv));
      expect([argv.join(" "), o.exit, o.result, o.error]).toEqual([argv.join(" "), exit, "denied", error]);
    }
    expect(runs).toEqual([]);
    const ok = await gate(deps, inner(pass, ["memory", "recall", "--key", "notes/a"]));
    expect(ok).toMatchObject({ exit: 0, result: "ok", passId: pass.id, shop: "town/memory", command: "recall" });
    expect(runs).toEqual([{ shop: "town/memory", command: "recall", args: { key: "notes/a" }, user: pass.userId, stdin: null }]);
  });

  it("reads the pass by id on every call: revoked or expired is exit 3", async () => {
    const { pass } = passWith([{ shop: "town/memory" }]);
    expect((await gate(deps, inner(pass, ["memory", "list"]))).exit).toBe(0);
    store.revokePass(pass.id, NOW);
    const revoked = await gate(deps, inner(pass, ["memory", "list"]));
    expect([revoked.exit, revoked.result, revoked.error, revoked.detail]).toEqual([3, "invalid-pass", denials.invalidPass(), "revoked"]);
    const expired = passWith([{ shop: "town/memory" }], NOW - 1);
    expect((await gate(deps, inner(expired.pass, ["--help"]))).exit).toBe(3);
    expect((await gate(deps, { ...inner(expired.pass, ["--help"]), caller: { passId: "pass_nope", manifest: COMPOSED, parent: null, depth: 1 } })).detail).toBe("unknown");
    expect(runs).toHaveLength(1);
  });

  it("hands the runtime answer for a shop with dependencies, and nothing for one without; answer is this gate for the caller one deeper", async () => {
    const { token, pass } = passWith([{ shop: "town/memory", commands: ["recall", "list"] }, { shop: "test/composed" }, { shop: "test/kinds" }]);
    expect((await gate(deps, call(token, ["kinds", "pick", "--word", "a"]))).exit).toBe(0);
    expect(runs[0]!.town).toBeUndefined();
    expect((await gate(deps, call(token, ["composed", "pick", "--word", "a"]))).exit).toBe(0);
    const answer = runs[1]!.town!.answer;
    const signal = new AbortController().signal;
    expect(await answer({ argv: ["memory", "recall", "--key", "k"], stdin: null, json: false }, signal)).toEqual({ stdout: "the shop's output\n", stderr: "", exit: 0, denial: null });
    expect(runs[2]).toMatchObject({ shop: "town/memory", command: "recall", user: pass.userId });
    expect(await answer({ argv: ["memory", "forget", "--key", "k"], stdin: null, json: false }, signal)).toEqual({ stdout: "", stderr: `${denials.notAvailable("forget")}\n`, exit: 2, denial: denials.notAvailable("forget") });
    expect(await answer({ argv: ["kinds", "pick", "--word", "a"], stdin: null, json: true }, signal)).toEqual({
      stdout: `${JSON.stringify({ ok: false, output: "", notices: [], exit: 2, error: denials.notAvailable("kinds pick") })}\n`,
      stderr: "",
      exit: 2,
      denial: denials.notAvailable("kinds pick"),
    });
    expect(await answer({ argv: ["memory"], stdin: null, json: false }, signal)).toMatchObject({ exit: 1, denial: null });
    store.revokePass(pass.id, NOW);
    expect(await answer({ argv: ["memory", "recall", "--key", "k"], stdin: null, json: false }, signal)).toEqual({ stdout: "", stderr: `${denials.invalidPass()}\n`, exit: 3, denial: null });
    expect(runs).toHaveLength(3);
  });
});

describe("a shop's calls, with a fake runtime: the inner-denial rule, the depth bound, and the tree's rows", () => {
  const COMPOSED: Manifest = { ...KINDS, name: "test/composed", depends: [{ shop: "town/memory", commands: ["recall", "list"] }] };
  const shopRun = (exit: number, denied: string | null): RunResult => ({ stdout: "what the shop printed\n", stderr: "the shop's log\n", exit, timedOut: false, aborted: false, credentials: [], calls: denied ? 1 : 0, denied });

  beforeEach(() => {
    store.upsertShop(COMPOSED, NOW);
  });

  it("is denied, exit 2, with the inner line and nothing the shop printed, when the shop fails after a denied call", async () => {
    const { token } = passWith([{ shop: "town/memory" }, { shop: "test/composed" }]);
    const line = denials.constraint("key", "prefix", "notes/");
    next = shopRun(2, line);
    const o = await gate(deps, call(token, ["composed", "pick", "--word", "a"]));
    expect([o.result, o.exit, o.error, o.detail, o.stdout, o.shopExit, o.shopStderr]).toEqual(["denied", 2, line, "inner", "", 2, "the shop's log\n"]);
    expect(respond(o, false)).toEqual({ stdout: "", stderr: `${line}\n`, exit: 2 });
    // Any nonzero exit, not only town's 2.
    next = shopRun(1, line);
    expect((await gate(deps, call(token, ["composed", "pick", "--word", "a"]))).result).toBe("denied");
  });

  it("is ok when the shop exits 0 after a denied call, and shop-error when it fails with no denial", async () => {
    const { token } = passWith([{ shop: "town/memory" }, { shop: "test/composed" }]);
    next = shopRun(0, denials.notAvailable("forget"));
    const caught = await gate(deps, call(token, ["composed", "pick", "--word", "a"]));
    expect([caught.result, caught.exit, caught.error, caught.detail, caught.stdout]).toEqual(["ok", 0, "", null, "what the shop printed\n"]);
    next = shopRun(3, null);
    const failed = await gate(deps, call(token, ["composed", "pick", "--word", "a"]));
    expect([failed.result, failed.exit, failed.error, failed.detail]).toEqual(["shop-error", 1, denials.shopFailed("test/composed", "pick", "the shop's log"), null]);
    // A timeout and an abort keep their own words, denial or not.
    next = { ...shopRun(1, denials.notAvailable("forget")), timedOut: true };
    expect((await gate(deps, call(token, ["composed", "pick", "--word", "a"]))).result).toBe("timeout");
  });

  it("bounds a tree at eight: a call eight deep runs, one nine deep is the town's failure with no process", async () => {
    const { pass } = passWith([{ shop: "town/memory" }]);
    const at = (depth: number): CallRequest => ({ token: null, argv: ["memory", "list"], stdin: null, json: false, caller: { passId: pass.id, manifest: COMPOSED, parent: "call_above", depth } });
    expect(MAX_DEPTH).toBe(8);
    expect((await gate(deps, at(MAX_DEPTH))).result).toBe("ok");
    expect(runs).toHaveLength(1);
    const deep = await gate(deps, at(MAX_DEPTH + 1));
    expect([deep.result, deep.exit, deep.error, deep.detail, deep.passId, deep.parent]).toEqual(["town-error", 1, denials.townFailed(), "depth", pass.id, "call_above"]);
    expect(runs).toHaveLength(1);
  });

  it("records every call in a tree through handleCall, each inner row with the agent's pass and grant at the dependency and its parent's id", async () => {
    const { token, pass } = passWith([{ shop: "town/memory", commands: ["recall", "list", "forget"] }, { shop: "test/composed" }]);
    const memoryGrant = store.listGrants(pass.id).find((g) => g.shop === "town/memory")!;
    const composedGrant = store.listGrants(pass.id).find((g) => g.shop === "test/composed")!;
    const treeRuntime: Runtime = async (_dir, manifest, command, _args, opts) => {
      runs.push({ shop: manifest.name, command, args: {}, user: opts.user, stdin: opts.stdin });
      if (!opts.town) return next;
      const signal = new AbortController().signal;
      const a = await opts.town.answer({ argv: ["memory", "recall", "--key", "k"], stdin: null, json: false }, signal);
      const b = await opts.town.answer({ argv: ["memory", "forget", "--key", "k"], stdin: null, json: false }, signal);
      expect([a.exit, b.exit, b.denial]).toEqual([0, 2, denials.notAvailable("forget")]);
      return { ...next, exit: b.exit, denied: b.denial };
    };
    const wire = await handleCall({ ...deps, runtime: treeRuntime }, call(token, ["composed", "pick", "--word", "a"]));
    expect(wire).toEqual({ stdout: "", stderr: `${denials.notAvailable("forget")}\n`, exit: 2 });
    const rows = store.calls();
    expect(rows).toHaveLength(3);
    const outer = rows.find((r) => r.parent === null)!;
    expect(outer).toMatchObject({ passId: pass.id, grantId: composedGrant.id, shop: "test/composed", command: "pick", result: "denied", exit: 2, shopExit: 2, detail: "inner" });
    expect(outer.callId).toMatch(/^call_[0-9a-f]{16}$/);
    const inner = rows.filter((r) => r.parent !== null);
    expect(inner.map((r) => [r.parent, r.passId, r.grantId, r.shop, r.command, r.result, r.exit, r.shopExit])).toEqual([
      [outer.callId, pass.id, memoryGrant.id, "town/memory", "recall", "ok", 0, 0],
      [outer.callId, pass.id, memoryGrant.id, "town/memory", "forget", "denied", 2, null],
    ]);
    expect(new Set(rows.map((r) => r.callId)).size).toBe(3);
    expect(store.callTree(outer.callId).map((r) => [r.command, r.depth])).toEqual([["pick", 0], ["recall", 1], ["forget", 1]]);
  });

  it("records a row for an inner call whose gate throws, and answers the shop with the town's failure line", async () => {
    const { token, pass } = passWith([{ shop: "town/memory" }, { shop: "test/composed" }]);
    let answered: unknown;
    const throwing: Runtime = async (_dir, manifest, _command, _args, opts) => {
      if (!opts.town) throw new Error("boom");
      answered = await opts.town.answer({ argv: ["memory", "list"], stdin: null, json: false }, new AbortController().signal);
      void manifest;
      return next;
    };
    expect((await handleCall({ ...deps, runtime: throwing }, call(token, ["composed", "pick", "--word", "a"]))).exit).toBe(0);
    expect(answered).toEqual({ stdout: "", stderr: `${denials.townFailed()}\n`, exit: 1, denial: null });
    const rows = store.calls();
    const outer = rows.find((r) => r.parent === null)!;
    expect(rows.map((r) => [r.parent === null ? "outer" : r.parent === outer.callId ? "inner" : "?", r.passId, r.result, r.detail])).toEqual([
      ["inner", pass.id, "town-error", "Error"],
      ["outer", pass.id, "ok", null],
    ]);
  });
});

describe("a caller, through the real runtime", () => {
  const FIX = path.resolve(import.meta.dirname, "fixtures");
  interface Relayed {
    exit: number;
    stdout: string;
    stderr: string;
  }
  let deepManifest: Manifest;

  beforeEach(async () => {
    const shops = () => store.listShops().map((s) => ({ name: s.name, commands: s.manifest.commands.map((c) => c.name) }));
    for (const dirName of ["echo-shop", "recipe-shop", "deep-shop"]) {
      const m = await loadShop(path.join(FIX, dirName), [], shops());
      store.upsertShop(m, NOW);
      cpSync(path.join(FIX, dirName), shopDir(store, m.name), { recursive: true });
      if (m.name === "test/deep") deepManifest = m;
    }
    store.addType({ name: "test-origin", origin: "http://127.0.0.1:9", header: "Authorization: Bearer {token}" }, NOW);
    store.upsertShop(await loadShop(path.join(FIX, "teller-shop"), ["test-origin"]), NOW);
    cpSync(path.join(FIX, "teller-shop"), shopDir(store, "test/teller"), { recursive: true });
  });

  /** A pass holding every command at echo, teller (bound), recipe, and deep. */
  function agent() {
    const name = `u${Math.random().toString(16).slice(2, 8)}`;
    store.addUser(name, NOW);
    const made = store.newPass(name, "the agent's pass", null, NOW);
    const c = store.addCredential({ userName: name, type: "test-origin", label: "", value: "never opened" }, Buffer.alloc(32, 2), NOW);
    for (const shop of ["test/echo", "test/recipe", "test/deep", "test/teller"]) {
      const m = store.getShop(shop)!.manifest;
      store.newGrant({ passId: made.pass.id, shop, commands: m.commands.map((x) => x.name), constraints: {}, expiresAt: null, ...(shop === "test/teller" ? { credentials: { "test-origin": c.id } } : {}) }, NOW);
    }
    return made;
  }

  const opened: string[] = [];
  const vault: Vault = { open: (id) => (opened.push(id), "never-this") };
  const real = (): GateDeps => ({ store, vault, now: () => NOW, timeoutMs: 10_000 });

  it("lets the recipe call echo at echo, and tells it echo sleep and test/teller get are not available whatever the agent holds", async () => {
    opened.length = 0;
    const { token } = agent();
    const relay = async (words: string) => {
      // --words=<words>, so a word that is --help alone is the recipe's to send, not the agent's help.
      const o = await gate(real(), call(token, ["recipe", "relay", `--words=${words}`]));
      return { o, inner: (o.stdout ? JSON.parse(o.stdout) : null) as Relayed };
    };

    const ok = await relay("echo echo --zeta z");
    expect([ok.o.exit, ok.o.result, ok.inner.exit, ok.inner.stderr]).toEqual([0, "ok", 0, ""]);
    expect((JSON.parse(ok.inner.stdout) as { argv: string[] }).argv).toEqual(["echo", "--zeta", "z", "--alpha", "7", "--mode", "slow", "--loud", "false"]);

    // The recipe exits as town did, 2, after each denial: the agent is told the inner line, exit 2, and nothing the recipe printed.
    const sleep = await relay("echo sleep");
    expect([sleep.o.result, sleep.o.exit, sleep.o.error, sleep.o.detail, sleep.o.shopExit, sleep.o.stdout]).toEqual(["denied", 2, denials.notAvailable("sleep"), "inner", 2, ""]);
    const teller = await relay("test/teller get --path /x");
    expect([teller.o.exit, teller.o.error]).toEqual([2, denials.notAvailable("test/teller get")]);
    const itself = await relay("recipe relay --words x");
    expect([itself.o.exit, itself.o.error]).toEqual([2, denials.notAvailable("recipe relay")]);
    expect(opened).toEqual([]);
    expect(existsSync(path.join(store.stateRoot, "test%2Fecho"))).toBe(true);
    expect(existsSync(path.join(stateDirOf("test/echo", store.passById(passOf(token))!.userId), "grandchild.pid"))).toBe(false);

    const help = await relay("--help");
    expect(help.inner.stdout).toMatch(/^test\/echo +Prints what the runtime gave it, for the runtime's tests\. \[echo\]\n/);
    expect(help.inner.stdout.split("\n").filter((l) => l.startsWith("test/"))).toHaveLength(1);
    const shopHelp = await relay("echo --help");
    expect(shopHelp.inner.stdout).toContain("town echo echo --zeta <string>");
    expect(shopHelp.inner.stdout).not.toContain("town echo sleep");
    expect(shopHelp.inner.stdout).toContain("this grant: the agent's pass; does not expire");
  }, 30_000);

  it("at depth two, cuts echo by the recipe's manifest, and nothing of the deep shop's widens it", async () => {
    const { token } = agent();
    const hop = async (args: string[]) => {
      const o = await gate(real(), call(token, ["deep", "hop", ...args]));
      const outer = (o.stdout ? JSON.parse(o.stdout) : null) as Relayed;
      return { o, outer, recipe: args.includes("--via") && outer?.stdout ? (JSON.parse(outer.stdout) as Relayed) : null };
    };

    const ok = await hop(["--via", "recipe", "--words", "echo echo --zeta z"]);
    expect([ok.o.exit, ok.outer.exit, ok.recipe!.exit]).toEqual([0, 0, 0]);
    expect((JSON.parse(ok.recipe!.stdout) as { argv: string[] }).argv.slice(0, 3)).toEqual(["echo", "--zeta", "z"]);

    // The deep shop declared only the recipe: echo is not its to call, and its failure after that denial is the agent's denial.
    const undeclared = await hop(["--words", "echo echo --zeta z"]);
    expect([undeclared.o.exit, undeclared.o.error, undeclared.o.detail]).toEqual([2, denials.notAvailable("echo echo"), "inner"]);

    // The deep shop now declares echo at echo and fail itself; at depth one it reaches fail.
    store.upsertShop({ ...deepManifest, depends: [...deepManifest.depends!, { shop: "test/echo", commands: ["echo", "fail"] }] }, NOW);
    const own = await hop(["--words", "echo fail"]);
    expect([own.o.result, own.outer.exit, own.outer.stderr]).toEqual(["shop-error", 1, `${denials.shopFailed("test/echo", "fail", "the fixture failed on purpose")}\n`]);
    // At depth two the recipe's call is cut by the recipe's manifest alone, and the line comes up two levels unchanged.
    const cut = await hop(["--via", "recipe", "--words", "echo fail"]);
    expect([cut.o.result, cut.o.exit, cut.o.error, cut.o.detail, cut.o.stdout]).toEqual(["denied", 2, denials.notAvailable("fail"), "inner", ""]);
    const help = await hop(["--via", "recipe", "--words", "echo --help"]);
    expect(help.recipe!.stdout).not.toContain("fail");

    // The agent's own grant decides: with echo narrowed to fail, the recipe's grant and the deep shop's are not live.
    const echoGrant = store.listGrants(passOf(token)).find((g) => g.shop === "test/echo")!;
    store.revokeGrant(echoGrant.id, NOW);
    store.newGrant({ passId: passOf(token), shop: "test/echo", commands: ["fail"], constraints: {}, expiresAt: null }, NOW);
    const gone = await hop(["--via", "recipe", "--words", "echo echo --zeta z"]);
    expect([gone.o.exit, gone.o.error]).toEqual([2, denials.notAvailable("deep hop")]);
  }, 30_000);

  function passOf(token: string): string {
    return store.passByTokenHash(hashToken(token))!.id;
  }
  function stateDirOf(shop: string, user: string): string {
    return stateDir(store.stateRoot, shop, user);
  }
});
