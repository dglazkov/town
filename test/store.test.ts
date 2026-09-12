// ring: checkout
// The store: its tables over node:sqlite, every query the gate and the
// admin use, tokens kept only as hashes, and nothing cached, so a second
// connection to the same file, as `townd admin` is to `townd serve`, is
// seen by the first on its next read. Vault's schema 2: credential types
// and sealed credentials, and a store gate made migrated in place.
// Compose's schema 3: every call's id and its parent's, a store vault made
// migrated in place, liveness gaining `lacks`, and the call tree.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadShop } from "../src/shoptest.js";
import type { Manifest } from "../src/manifest.js";
import { StoreError, hashToken, openStore, type Store } from "../src/store.js";
import { ensureKey } from "../src/vault.js";

let dir: string;
let store: Store;
const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-store-test-"));
  store = openStore(dir);
  store.upsertShop(await loadShop(MEMORY), 1000);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function columns(s: Store, table: string): string[] {
  return (s.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

function passFor(user = "dimitri", now = 1000) {
  if (!store.userByName(user)) store.addUser(user, now);
  return store.newPass(user, "research assistant", null, now);
}

describe("the schema", () => {
  it("lives at <data>/town.db with gate's tables, vault's two, compose's two columns, and meta.schema 3", () => {
    const tables = (store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toEqual(["calls", "credential_types", "credentials", "grants", "meta", "passes", "shops", "users"]);
    expect(store.getMeta("schema")).toBe("3");
    expect(columns(store, "grants")).toContain("credentials");
    expect(columns(store, "calls")).toContain("credentials");
    expect(columns(store, "calls").slice(-2)).toEqual(["call_id", "parent"]);
    expect(readdirSync(dir)).toContain("town.db");
    expect((store.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
  });

  it("opens again over the same file with its rows", () => {
    store.addUser("dimitri");
    store.close();
    store = openStore(dir);
    expect(store.userByName("dimitri")?.name).toBe("dimitri");
  });
});

describe("users", () => {
  it("adds, finds, lists, and refuses a repeat", () => {
    const u = store.addUser("dimitri", 5);
    expect(u).toMatchObject({ name: "dimitri", createdAt: 5 });
    expect(u.id).toMatch(/^user_[0-9a-f]{16}$/);
    expect(store.listUsers()).toEqual([u]);
    expect(() => store.addUser("dimitri")).toThrow(StoreError);
  });
});

describe("passes", () => {
  it("returns a token once and stores only its hash", () => {
    const { pass, token } = passFor();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(pass.id).toMatch(/^pass_[0-9a-f]{16}$/);
    expect(pass.id).not.toContain(token);
    const row = store.db.prepare("SELECT * FROM passes WHERE id = ?").get(pass.id) as Record<string, unknown>;
    expect(row.token_hash).toBe(hashToken(token));
    expect(Object.values(row)).not.toContain(token);
    store.close();
    for (const f of readdirSync(dir)) expect(readFileSync(path.join(dir, f)).includes(Buffer.from(token))).toBe(false);
    store = openStore(dir);
  });

  it("resolves a pass by its token's hash, whatever its state", () => {
    const { pass, token } = passFor();
    expect(store.passByTokenHash(hashToken(token))).toEqual(pass);
    expect(store.passByTokenHash(hashToken("not a token"))).toBeNull();
    store.revokePass(pass.id, 2000);
    expect(store.passByTokenHash(hashToken(token))?.revokedAt).toBe(2000);
  });

  it("refuses a pass for a user who does not exist, or with no label", () => {
    expect(() => store.newPass("nobody", "x", null)).toThrow(/does not exist/);
    store.addUser("dimitri");
    expect(() => store.newPass("dimitri", " ", null)).toThrow(/--label/);
  });

  it("caches nothing: a revocation through another connection is seen on the next read", () => {
    const { pass, token } = passFor();
    expect(store.passByTokenHash(hashToken(token))?.revokedAt).toBeNull();
    const admin = openStore(dir);
    admin.revokePass(pass.id, 3000);
    admin.close();
    expect(store.passByTokenHash(hashToken(token))?.revokedAt).toBe(3000);
  });
});

describe("grants", () => {
  it("adds one grant per shop per pass, lists it, and finds it in force", () => {
    const { pass } = passFor();
    const g = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: { "recall.key": { prefix: "notes/" } }, expiresAt: 10_000 }, 1000);
    expect(g.id).toMatch(/^grant_[0-9a-f]{16}$/);
    expect(store.grantsForPass(pass.id, 1000)).toEqual([g]);
    expect(() => store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null }, 1000)).toThrow(/one grant per shop/);
    expect(store.listGrants(pass.id, 1000)).toEqual([{ ...g, lastUse: null, state: { kind: "live" } }]);
    expect(g.credentials).toEqual({});
  });

  it("leaves a revoked or expired grant out of those in force", () => {
    const { pass } = passFor();
    const g = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: 5000 }, 1000);
    expect(store.grantsForPass(pass.id, 4999)).toHaveLength(1);
    expect(store.grantsForPass(pass.id, 5000)).toHaveLength(0);
    const g2 = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null }, 6000);
    const other = openStore(dir);
    other.revokeGrant(g2.id, 7000);
    other.close();
    expect(store.grantsForPass(pass.id, 8000)).toEqual([]);
    expect(store.listGrants().map((x) => x.id)).toEqual([g.id, g2.id]);
  });

  it("refuses a grant at a shop the town lacks, or on a revoked pass", () => {
    const { pass } = passFor();
    expect(() => store.newGrant({ passId: pass.id, shop: "town/nothing", commands: [], constraints: {}, expiresAt: null })).toThrow(/not in this town/);
    store.revokePass(pass.id);
    expect(() => store.newGrant({ passId: pass.id, shop: "town/memory", commands: [], constraints: {}, expiresAt: null })).toThrow(/revoked/);
  });
});

describe("shops", () => {
  it("upserts latest only, lists, and removes", async () => {
    const m = await loadShop(MEMORY);
    store.upsertShop({ ...m, version: "0.2.0" }, 2000);
    expect(store.listShops()).toHaveLength(1);
    expect(store.getShop("town/memory")).toMatchObject({ version: "0.2.0", addedAt: 2000 });
    expect(store.getShop("town/memory")?.manifest.commands.map((c) => c.name)).toEqual(["remember", "recall", "list", "forget"]);
    expect(store.removeShop("town/memory")).toBe(true);
    expect(store.getShop("town/memory")).toBeNull();
  });
});

describe("calls", () => {
  it("records rows, filters them, returns them newest last, and gives last use", () => {
    const { pass } = passFor();
    const g = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null }, 1000);
    let n = 0;
    const row = (at: number, extra = {}) => ({
      callId: `call_${String(++n).padStart(16, "0")}`, parent: null, at, passId: pass.id, grantId: g.id, shop: "town/memory", command: "recall", argvHash: "h".repeat(64),
      result: "ok" as const, exit: 0, shopExit: 0, latencyMs: 3.4, notices: [], stderr: "", detail: null, credentials: [{ type: "github-token", requests: 2 }], ...extra,
    });
    store.recordCall(row(3000));
    store.recordCall(row(2000, { result: "denied", exit: 2, shopExit: null, stderr: null, notices: ["grant-expires"], credentials: [] }));
    store.recordCall({ ...row(4000), passId: null, grantId: null, shop: null, command: null, result: "invalid-pass", exit: 3, shopExit: null });
    const all = store.calls();
    expect(all.map((c) => c.at)).toEqual([2000, 3000, 4000]);
    expect(all[0]).toMatchObject({ callId: "call_0000000000000002", parent: null, result: "denied", shopExit: null, notices: ["grant-expires"], latencyMs: 3, credentials: [] });
    expect(all[1]!.credentials).toEqual([{ type: "github-token", requests: 2 }]);
    expect(store.calls({ passId: pass.id })).toHaveLength(2);
    expect(store.calls({ shop: "town/memory", since: 2500 })).toHaveLength(1);
    expect(store.listPasses()[0]!.lastUse).toBe(3000);
    expect(store.listGrants()[0]!.lastUse).toBe(3000);
  });
});

describe("a store gate made", () => {
  it("opens with its users, passes, grants, shops, and audit intact, and gains the new tables and columns", async () => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(path.join(os.tmpdir(), "town-store-gate-"));
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    const gate = new DatabaseSync(path.join(dir, "town.db"));
    gate.exec("PRAGMA journal_mode = WAL;");
    gate.exec(readFileSync(path.resolve(import.meta.dirname, "fixtures/gate-store.sql"), "utf8"));
    const memory = await loadShop(MEMORY);
    gate.prepare("INSERT INTO users (id, name, created_at) VALUES ('user_1', 'dimitri', 10)").run();
    gate.prepare("INSERT INTO passes (id, user_id, label, token_hash, created_at) VALUES ('pass_1', 'user_1', 'assistant', ?, 20)").run(hashToken("the pass token"));
    gate.prepare(`INSERT INTO grants (id, pass_id, shop, commands, constraints, created_at) VALUES ('grant_1', 'pass_1', 'town/memory', '["recall"]', '{"recall.key":{"prefix":"notes/"}}', 30)`).run();
    gate.prepare("INSERT INTO shops (name, version, manifest, added_at) VALUES ('town/memory', ?, ?, 5)").run(memory.version, JSON.stringify(memory));
    gate.prepare(`INSERT INTO calls (at, pass_id, grant_id, shop, command, argv_hash, result, exit, shop_exit, latency_ms, notices, stderr, detail)
      VALUES (40, 'pass_1', 'grant_1', 'town/memory', 'recall', 'h', 'ok', 0, 0, 3, '[]', '', NULL)`).run();
    gate.prepare("INSERT INTO meta (key, value) VALUES ('address', 'http://127.0.0.1:7000')").run();
    gate.close();

    store = openStore(dir);
    expect(store.listUsers()).toEqual([{ id: "user_1", name: "dimitri", createdAt: 10 }]);
    expect(store.passByTokenHash(hashToken("the pass token"))).toMatchObject({ id: "pass_1", userName: "dimitri", label: "assistant" });
    expect(store.grantsForPass("pass_1", 50)).toMatchObject([{ id: "grant_1", commands: ["recall"], constraints: { "recall.key": { prefix: "notes/" } } }]);
    expect(store.getShop("town/memory")?.manifest).toEqual(memory);
    expect(store.calls()).toMatchObject([{ at: 40, passId: "pass_1", result: "ok", command: "recall" }]);
    expect(store.getMeta("address")).toBe("http://127.0.0.1:7000");

    expect(store.getMeta("schema")).toBe("3");
    expect(store.listTypes().map((t) => [t.name, t.origin, t.header])).toEqual([["github-token", "https://api.github.com", "Authorization: Bearer {token}"]]);
    expect(columns(store, "credentials")).toEqual(["id", "user_id", "type", "label", "sealed", "created_at", "revoked_at"]);
    expect(store.db.prepare("SELECT credentials FROM grants WHERE id = 'grant_1'").get()).toEqual({ credentials: "{}" });
    expect(store.db.prepare("SELECT credentials FROM calls").get()).toEqual({ credentials: "[]" });
    expect(store.calls()).toMatchObject([{ callId: expect.stringMatching(/^call_[0-9a-f]{16}$/), parent: null }]);

    store.close();
    store = openStore(dir);
    expect(store.getMeta("schema")).toBe("3");
    expect(store.listUsers()).toHaveLength(1);
  });

  it("refuses a store a newer town made", () => {
    store.setMeta("schema", "4");
    store.close();
    expect(() => openStore(dir)).toThrow(/is schema 4, newer than this town's 3/);
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    const db = new DatabaseSync(path.join(dir, "town.db"));
    db.prepare("UPDATE meta SET value = '3' WHERE key = 'schema'").run();
    db.close();
    store = openStore(dir);
  });
});

describe("a store vault made", () => {
  const FIXTURE = readFileSync(path.resolve(import.meta.dirname, "fixtures/vault-store.sql"), "utf8");
  const KEY = Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(FIXTURE)![1]!, "hex");

  it("opens with its users, passes, grants, shops, types, credentials, and audit intact, and gains the call's two columns", () => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(path.join(os.tmpdir(), "town-store-vault-"));
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    const vault = new DatabaseSync(path.join(dir, "town.db"));
    vault.exec(FIXTURE);
    const before = {
      calls: vault.prepare("SELECT * FROM calls ORDER BY id").all(),
      sealed: vault.prepare("SELECT sealed FROM credentials").get(),
    };
    vault.close();
    expect(before.calls).toHaveLength(3);

    store = openStore(dir);
    expect(store.getMeta("schema")).toBe("3");
    expect(store.listUsers().map((u) => u.name)).toEqual(["dimitri"]);
    const [pass] = store.listPasses();
    expect(pass).toMatchObject({ id: "pass_a648d98fa018fc7c", userName: "dimitri", label: "research assistant", revokedAt: null });
    expect(store.listGrants()).toMatchObject([{ id: "grant_030cbc25002da6c4", shop: "town/memory", commands: ["remember", "recall"], constraints: { "remember.key": { prefix: "notes/" } }, state: { kind: "live" } }]);
    expect(store.grantsForPass(pass!.id).map((g) => g.id)).toEqual(["grant_030cbc25002da6c4"]);
    expect(store.getShop("town/memory")?.manifest.commands.map((c) => c.name)).toEqual(["remember", "recall", "list", "forget"]);
    expect(store.listTypes().map((t) => t.name)).toEqual(["github-token"]);
    expect(store.listCredentials()).toMatchObject([{ id: "credential_8022cf4f70caccdb", userName: "dimitri", type: "github-token", label: "dimitri's PAT", revokedAt: null }]);
    expect(store.openCredential("credential_8022cf4f70caccdb", KEY)).toBe("vault-fixture-not-a-token");

    const calls = store.calls();
    expect(calls.map((c) => [c.command, c.result, c.exit, c.shopExit, c.detail])).toEqual([
      ["remember", "ok", 0, 0, null],
      ["recall", "ok", 0, 0, null],
      ["forget", "denied", 2, null, "command"],
    ]);
    for (const c of calls) expect([c.callId, c.parent]).toEqual([expect.stringMatching(/^call_[0-9a-f]{16}$/), null]);
    expect(new Set(calls.map((c) => c.callId)).size).toBe(3);
    const cols = columns(store, "calls");
    expect(cols).toEqual(["id", "at", "pass_id", "grant_id", "shop", "command", "argv_hash", "result", "exit", "shop_exit", "latency_ms", "notices", "stderr", "detail", "credentials", "call_id", "parent"]);
    // Every other column of every old row is as vault left it.
    const after = store.db.prepare("SELECT * FROM calls ORDER BY id").all() as Array<Record<string, unknown>>;
    expect(after.map(({ call_id: _c, parent: _p, ...rest }) => rest)).toEqual(before.calls.map((r) => ({ ...r })));
    expect(store.db.prepare("SELECT sealed FROM credentials").get()).toEqual(before.sealed);
    expect(store.callTree(calls[2]!.callId).map((c) => c.command)).toEqual(["forget"]);

    // The migration runs once: the ids stay, and a removed seeded type is not seeded again.
    store.db.prepare("DELETE FROM credential_types WHERE name = 'github-token'").run();
    store.close();
    store = openStore(dir);
    expect(store.calls().map((c) => c.callId)).toEqual(calls.map((c) => c.callId));
    expect(store.getMeta("schema")).toBe("3");
    expect(store.listTypes()).toEqual([]);
  });
});

describe("liveness with dependencies", () => {
  const composed = (name: string, depends: Array<{ shop: string; commands: string[] }>): Manifest => ({
    ...(store.getShop("town/memory")!.manifest),
    name,
    depends,
  });

  beforeEach(() => {
    store.upsertShop(composed("test/watch", [{ shop: "town/memory", commands: ["remember", "recall"] }]), 1000);
  });

  function grant(passId: string, shop: string, commands: string[], now = 1000) {
    return store.newGrant({ passId, shop, commands, constraints: {}, expiresAt: null }, now);
  }

  it("is live while the pass holds a live grant at each dependency covering the declared commands", () => {
    const { pass } = passFor();
    const memory = grant(pass.id, "town/memory", ["remember", "recall", "list"]);
    const watch = grant(pass.id, "test/watch", ["recall"]);
    expect(store.grantState(watch.id, 2000)).toEqual({ kind: "live" });
    expect(store.grantsForPass(pass.id, 2000).map((g) => g.id)).toEqual([watch.id, memory.id]);
    expect(store.liveGrantsAt("test/watch", 2000).map((g) => g.id)).toEqual([watch.id]);
  });

  it("lacks every declared command at a dependency the pass holds no live grant at: none made, revoked, expired, or unmet", async () => {
    const { pass } = passFor();
    const watch = grant(pass.id, "test/watch", ["recall"]);
    const notGranted = { kind: "lacks", shop: "town/memory", commands: ["remember", "recall"] };
    expect(store.grantState(watch.id, 2000)).toEqual(notGranted);
    const revoked = grant(pass.id, "town/memory", ["remember", "recall"]);
    expect(store.grantState(watch.id, 2000)).toEqual({ kind: "live" });
    store.revokeGrant(revoked.id, 1500);
    expect(store.grantState(watch.id, 2000)).toEqual(notGranted);
    grant(pass.id, "town/memory", ["remember", "recall"], 1600);
    store.db.prepare("UPDATE grants SET expires_at = 1700 WHERE shop = 'town/memory' AND revoked_at IS NULL").run();
    expect(store.grantState(watch.id, 1699)).toEqual({ kind: "live" });
    expect(store.grantState(watch.id, 1700)).toEqual(notGranted);
    // A dependency not live by a need unmet: the composed grant lacks it too.
    store.upsertShop({ ...(await loadShop(MEMORY)), credentials: [{ type: "github-token" }] }, 1800);
    grant(pass.id, "town/memory", ["remember", "recall"], 1800);
    expect(store.grantState(watch.id, 1900)).toEqual(notGranted);
    expect(store.grantsForPass(pass.id, 1900)).toEqual([]);
  });

  it("lacks the commands missing at a live grant that does not cover them, and is live again when one does, with nothing restarted", () => {
    const { pass } = passFor();
    const narrow = grant(pass.id, "town/memory", ["recall", "list"], 1000);
    const watch = grant(pass.id, "test/watch", ["recall"], 1001);
    expect(store.grantState(watch.id, 2000)).toEqual({ kind: "lacks", shop: "town/memory", commands: ["remember"] });
    expect(store.listGrants(pass.id, 2000).map((g) => [g.shop, g.state])).toEqual([
      ["town/memory", { kind: "live" }],
      ["test/watch", { kind: "lacks", shop: "town/memory", commands: ["remember"] }],
    ]);
    expect(store.grantsForPass(pass.id, 2000).map((g) => g.shop)).toEqual(["town/memory"]);
    const other = openStore(dir);
    other.revokeGrant(narrow.id, 2100);
    other.newGrant({ passId: pass.id, shop: "town/memory", commands: ["remember", "recall"], constraints: {}, expiresAt: null }, 2100);
    other.close();
    expect(store.grantState(watch.id, 2200)).toEqual({ kind: "live" });
  });

  it("walks a dependency's own dependencies, puts the query's reasons first, and names the first dependency not covered", () => {
    store.upsertShop(composed("test/deep", [{ shop: "test/watch", commands: ["list"] }, { shop: "town/memory", commands: ["forget"] }]), 1000);
    const { pass } = passFor();
    const deep = grant(pass.id, "test/deep", ["recall"]);
    const watch = grant(pass.id, "test/watch", ["list"]);
    expect(store.grantState(deep.id, 2000)).toEqual({ kind: "lacks", shop: "test/watch", commands: ["list"] });
    const memory = grant(pass.id, "town/memory", ["remember", "recall"]);
    expect(store.grantState(watch.id, 2000)).toEqual({ kind: "live" });
    expect(store.grantState(deep.id, 2000)).toEqual({ kind: "lacks", shop: "town/memory", commands: ["forget"] });
    store.revokeGrant(memory.id, 2000);
    grant(pass.id, "town/memory", ["remember", "recall", "forget"], 2000);
    expect(store.grantState(deep.id, 3000)).toEqual({ kind: "live" });
    store.revokeGrant(deep.id, 3000);
    expect(store.grantState(deep.id, 4000)).toEqual({ kind: "revoked" });
  });

  it("reads another pass's grants for nothing, and a loop made behind shop add's back is not live and does not hang", () => {
    const { pass } = passFor("dimitri");
    const { pass: theirs } = passFor("ada");
    grant(theirs.id, "town/memory", ["remember", "recall"]);
    const watch = grant(pass.id, "test/watch", ["recall"]);
    expect(store.grantState(watch.id, 2000)).toMatchObject({ kind: "lacks" });
    const memory = store.getShop("town/memory")!.manifest;
    store.upsertShop({ ...memory, depends: [{ shop: "test/watch", commands: ["recall"] }] }, 1000);
    grant(pass.id, "town/memory", ["remember", "recall"]);
    expect(store.listGrants(pass.id, 2000).map((g) => g.state.kind)).toEqual(["lacks", "lacks"]);
    expect(store.grantsForPass(pass.id, 2000)).toEqual([]);
  });
});

describe("the call tree", () => {
  const record = (callId: string, parent: string | null, at: number, command: string) =>
    store.recordCall({ callId, parent, at, passId: "pass_1", grantId: null, shop: "test/x", command, argvHash: "h", result: "ok", exit: 0, shopExit: 0, latencyMs: 1, notices: [], stderr: null, detail: null, credentials: [] });

  it("is one call and every call made in its service, each call's children after it, oldest first, with depth", () => {
    record("call_root", null, 100, "root");
    record("call_b", "call_root", 120, "b");
    record("call_a", "call_root", 110, "a");
    record("call_a1", "call_a", 111, "a1");
    record("call_b1", "call_b", 121, "b1");
    record("call_b1x", "call_b1", 122, "b1x");
    record("call_other", null, 105, "other");
    record("call_otherchild", "call_other", 106, "otherchild");
    expect(store.callTree("call_root").map((c) => [c.command, c.depth, c.parent])).toEqual([
      ["root", 0, null],
      ["a", 1, "call_root"],
      ["a1", 2, "call_a"],
      ["b", 1, "call_root"],
      ["b1", 2, "call_b"],
      ["b1x", 3, "call_b1"],
    ]);
    expect(store.callTree("call_b1").map((c) => [c.command, c.depth])).toEqual([["b1", 0], ["b1x", 1]]);
    expect(store.callTree("call_nope")).toEqual([]);
  });

  it("refuses two rows with one call id", () => {
    record("call_same", null, 1, "x");
    expect(() => record("call_same", null, 2, "y")).toThrow(/UNIQUE/);
  });
});

describe("credential types", () => {
  it("are seeded with github-token, and added, listed, and removed by the operator", () => {
    expect(store.getType("github-token")).toMatchObject({ origin: "https://api.github.com", header: "Authorization: Bearer {token}" });
    store.addType({ name: "internal", origin: "https://api.example.internal", header: "Authorization: Bearer {token}" }, 5);
    expect(store.listTypes().map((t) => t.name)).toEqual(["github-token", "internal"]);
    expect(() => store.addType({ name: "internal", origin: "https://x.example", header: "X-Key: {token}" })).toThrow(/already exists/);
    store.removeType("internal");
    expect(store.getType("internal")).toBeNull();
  });

  it("refuses a name, an origin, or a header of the wrong shape", () => {
    const ok = { name: "ok-type", origin: "https://api.example", header: "X-Key: {token}" };
    for (const name of ["Upper", "1abc", "a_b", "", "a/b"]) expect(() => store.addType({ ...ok, name }), name).toThrow(/is not a name/);
    for (const origin of ["api.example", "ftp://api.example", "https://api.example/?q=1", "https://api.example/#x", "/relative"]) {
      expect(() => store.addType({ ...ok, origin }), origin).toThrow(/is not an origin/);
    }
    for (const header of ["X-Key {token}", "X-Key: no placeholder", ": {token}", "X Key: {token}"]) {
      expect(() => store.addType({ ...ok, header }), header).toThrow(/is not a header/);
    }
    expect(store.addType({ ...ok, origin: "http://127.0.0.1:9/base" }).origin).toBe("http://127.0.0.1:9/base");
  });

  it("stay removed: github-token removed is not seeded again on the next open", () => {
    store.removeType("github-token");
    store.close();
    store = openStore(dir);
    expect(store.listTypes()).toEqual([]);
  });
});

describe("credentials", () => {
  const VALUE = "ghp_not_a_real_token_store_test";

  it("are sealed: the value added is in neither town.db nor its WAL, searched as bytes", () => {
    store.addUser("dimitri");
    const key = ensureKey(dir);
    const c = store.addCredential({ userName: "dimitri", type: "github-token", label: "dimitri's PAT", value: VALUE }, key, 100);
    expect(store.openCredential(c.id, key)).toBe(VALUE);
    const needle = Buffer.from(VALUE);
    const files = ["town.db", "town.db-wal"].map((f) => path.join(dir, f));
    expect(existsSync(files[1]!)).toBe(true);
    for (const f of files) expect(readFileSync(f).includes(needle), `${path.basename(f)} before a checkpoint`).toBe(false);
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    store.close();
    for (const f of files.filter((x) => existsSync(x))) expect(readFileSync(f).includes(needle), `${path.basename(f)} after close`).toBe(false);
    store = openStore(dir);
  });

  it("list the id, user, type, label, creation, state, and bound grants, and never the value", () => {
    store.addUser("dimitri");
    store.addUser("ada");
    const key = ensureKey(dir);
    const a = store.addCredential({ userName: "dimitri", type: "github-token", label: "PAT", value: VALUE }, key, 100);
    const b = store.addCredential({ userName: "ada", type: "github-token", label: "", value: "another" }, key, 200);
    expect(a.id).toMatch(/^credential_[0-9a-f]{16}$/);
    expect(store.listCredentials()).toEqual([
      { id: a.id, userId: a.userId, userName: "dimitri", type: "github-token", label: "PAT", createdAt: 100, revokedAt: null, grants: [] },
      { id: b.id, userId: b.userId, userName: "ada", type: "github-token", label: "", createdAt: 200, revokedAt: null, grants: [] },
    ]);
    expect(store.listCredentials("ada").map((c) => c.id)).toEqual([b.id]);
    expect(JSON.stringify(store.listCredentials())).not.toContain(VALUE);
  });

  it("are revoked by marking the row, which leaves them out of a user's live credentials and frees the type", () => {
    const user = store.addUser("dimitri");
    store.addType({ name: "internal", origin: "https://api.example.internal", header: "Authorization: Bearer {token}" });
    const c = store.addCredential({ userName: "dimitri", type: "internal", label: "", value: VALUE }, ensureKey(dir), 100);
    expect(store.liveCredentials(user.id, "internal").map((x) => x.id)).toEqual([c.id]);
    expect(() => store.removeType("internal")).toThrow(new RegExp(`type internal is held by a credential \\(${c.id}\\)`));
    expect(store.revokeCredential(c.id, 300).revokedAt).toBe(300);
    expect(store.liveCredentials(user.id, "internal")).toEqual([]);
    expect(store.sealedRows()).toBe(1);
    store.removeType("internal");
  });

  it("are refused for a user or a type the town lacks", () => {
    const key = ensureKey(dir);
    expect(() => store.addCredential({ userName: "nobody", type: "github-token", label: "", value: VALUE }, key)).toThrow(/user nobody does not exist/);
    store.addUser("dimitri");
    expect(() => store.addCredential({ userName: "dimitri", type: "github-tokens", label: "", value: VALUE }, key)).toThrow(/write one of \(github-token\)/);
  });
});

describe("a grant's liveness", () => {
  const TELLER = path.resolve(import.meta.dirname, "fixtures/teller-shop");
  let key: Buffer;

  beforeEach(async () => {
    key = ensureKey(dir);
    store.addType({ name: "test-origin", origin: "http://127.0.0.1:9", header: "Authorization: Bearer {token}" }, 1000);
    store.upsertShop(await loadShop(TELLER, ["github-token", "test-origin"]), 1000);
  });

  function bound(user = "dimitri") {
    const { pass } = passFor(user);
    const c = store.addCredential({ userName: user, type: "test-origin", label: "", value: "a value" }, key, 1000);
    const g = store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null, credentials: { "test-origin": c.id } }, 1000);
    return { pass, c, g };
  }

  it("is live when every need has a binding to an unrevoked credential, and the binding is stored and listed", () => {
    const { pass, c, g } = bound();
    expect(g.credentials).toEqual({ "test-origin": c.id });
    expect(store.grantsForPass(pass.id, 2000)).toEqual([g]);
    expect(store.grantState(g.id, 2000)).toEqual({ kind: "live" });
    expect(store.credentialById(c.id)!.grants).toEqual([g.id]);
    expect(store.listGrants(pass.id, 2000)).toEqual([{ ...g, lastUse: null, state: { kind: "live" } }]);
  });

  it("ends when the bound credential is revoked, seen through another connection, and the grant row is not touched", () => {
    const { pass, c, g } = bound();
    const admin = openStore(dir);
    admin.revokeCredential(c.id, 3000);
    admin.close();
    expect(store.grantsForPass(pass.id, 4000)).toEqual([]);
    expect(store.grantState(g.id, 4000)).toEqual({ kind: "unmet", type: "test-origin" });
    expect(store.grantById(g.id)!.revokedAt).toBeNull();
    expect(store.liveOf([g.id], 4000)).toEqual([]);
    expect(store.liveGrantsAt("test/teller", 4000)).toEqual([]);
  });

  it("is not live for a need with no binding, a binding to another user's credential, or one of another type", () => {
    const { pass } = passFor();
    const none = store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null }, 1000);
    expect(store.grantState(none.id, 2000)).toEqual({ kind: "unmet", type: "test-origin" });
    store.revokeGrant(none.id, 1500);
    store.addUser("ada", 1000);
    const theirs = store.addCredential({ userName: "ada", type: "test-origin", label: "", value: "hers" }, key, 1000);
    const foreign = store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null, credentials: { "test-origin": theirs.id } }, 1000);
    expect(store.grantState(foreign.id, 2000)).toEqual({ kind: "unmet", type: "test-origin" });
    store.revokeGrant(foreign.id, 1500);
    const gh = store.addCredential({ userName: "dimitri", type: "github-token", label: "", value: "gh" }, key, 1000);
    const wrongType = store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null, credentials: { "test-origin": gh.id } }, 1000);
    expect(store.grantState(wrongType.id, 2000)).toEqual({ kind: "unmet", type: "test-origin" });
    expect(store.grantsForPass(pass.id, 2000)).toEqual([]);
  });

  it("puts revoked and expired before a need unmet, and ignores a binding whose type the manifest no longer names", async () => {
    const { pass, c, g } = bound();
    store.revokeCredential(c.id, 1500);
    store.revokeGrant(g.id, 1600);
    expect(store.grantState(g.id, 2000)).toEqual({ kind: "revoked" });
    const later = store.addCredential({ userName: "dimitri", type: "test-origin", label: "", value: "again" }, key, 1700);
    const soon = store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: 5000, credentials: { "test-origin": later.id } }, 1700);
    expect(store.grantState(soon.id, 5000)).toEqual({ kind: "expired" });
    store.revokeCredential(later.id, 1800);
    expect(store.grantState(soon.id, 4000)).toEqual({ kind: "unmet", type: "test-origin" });
    // The shop drops its need: the dead binding is not read, and the grant is live again.
    const teller = await loadShop(TELLER, ["test-origin"]);
    const { credentials: _dropped, ...noNeeds } = teller;
    store.upsertShop(noNeeds, 1900);
    expect(store.grantState(soon.id, 4000)).toEqual({ kind: "live" });
    expect(store.grantsForPass(pass.id, 4000).map((x) => x.id)).toEqual([soon.id]);
  });

  it("lets a grant dead by its credential be replaced: one grant per shop counts live grants only", () => {
    const { pass, c, g } = bound();
    expect(() => store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null, credentials: { "test-origin": c.id } }, 1000)).toThrow(/already holds grant/);
    store.revokeCredential(c.id, 1500);
    const next = store.addCredential({ userName: "dimitri", type: "test-origin", label: "", value: "new" }, key, 1600);
    const replaced = store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null, credentials: { "test-origin": next.id } }, 1600);
    expect(store.grantsForPass(pass.id, 2000).map((x) => x.id)).toEqual([replaced.id]);
    expect(store.listGrants(pass.id, 2000).map((x) => [x.id, x.state.kind])).toEqual([[g.id, "unmet"], [replaced.id, "live"]]);
  });

  it("gives a shop gaining a need the same answer: its grants stop being live", async () => {
    const { pass } = passFor();
    const g = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null }, 1000);
    expect(store.liveGrantsAt("town/memory", 2000).map((x) => x.id)).toEqual([g.id]);
    const memory = await loadShop(MEMORY);
    store.upsertShop({ ...memory, credentials: [{ type: "test-origin" }] }, 1500);
    expect(store.grantState(g.id, 2000)).toEqual({ kind: "unmet", type: "test-origin" });
    expect(store.grantsForPass(pass.id, 2000)).toEqual([]);
  });
});
