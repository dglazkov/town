// ring: checkout
// The store: its tables over node:sqlite, every query the gate and the
// admin use, tokens kept only as hashes, and nothing cached, so a second
// connection to the same file, as `townd admin` is to `townd serve`, is
// seen by the first on its next read. Vault's schema 2: credential types
// and sealed credentials, and a store gate made migrated in place.
// Compose's schema 3: every call's id and its parent's, a store vault made
// migrated in place, liveness gaining `lacks`, and the call tree. Hall's
// schema 4: the permits table, `shops.owner`, `grants.source`, a store
// compose made migrated in place, the hall's row written on every open,
// permits made, replaced, decided, and listed, and a user's name a namespace.
// Wall's schema 5: `calls.wall`, the kind a call's process ran within, and a
// store hall made, by the binaries at 4a8e89c, migrated in place with every
// row intact and the column null. Consent's schema 6: the type's kind,
// state, proposer, guidance, and registration, a credential's scopes and
// why it was revoked, and a shop's `tested_at`; a store wall made, by the
// binaries at e829844, migrated in place with every row intact, every type
// a held token type, and every shop tested at its `added_at`; and proposed
// types made, met, refused a credential, approved, and removed. The tests
// that do not read the file itself are test/helpers/store-suite.ts's, run
// here over the file driver and in test/object.test.ts over the object's.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadShop } from "../src/shoptest.js";
import { HALL } from "../src/hall.js";
import { hashToken } from "../src/passes.js";
import { openStore, type Store } from "../src/store.js";
import { ensureKey } from "../src/vault.js";
import { storeSuite } from "./helpers/store-suite.js";

let dir: string;
let store: Store;
const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");
const TELLER = path.resolve(import.meta.dirname, "fixtures/teller-shop");
/** The columns consent's migration gives every type an older store held: a held token type, no proposer, no guidance, no registration. */
const HELD_TOKEN = { kind: "token", state: "held", proposed_by: null, guidance: "", oauth: null, client: null };

storeSuite({
  around: (body) => body(),
  open() {
    dir = mkdtempSync(path.join(os.tmpdir(), "town-store-test-"));
    return openStore(dir);
  },
  reopen: () => openStore(dir),
  key: () => ensureKey(dir),
  memory: () => loadShop(MEMORY),
  teller: (types) => loadShop(TELLER, types),
  bytes: () => readdirSync(dir).map((f) => readFileSync(path.join(dir, f))),
  cleanup: () => rmSync(dir, { recursive: true, force: true }),
});

describe("over a file", () => {
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
    return (s.sql.all(`PRAGMA table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
  }

  describe("the schema", () => {
    it("lives at <data>/town.db with gate's tables, vault's two, compose's two columns, hall's table and two columns, wall's column, consent's columns, and meta.schema 7", () => {
      const tables = (store.sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as Array<{ name: string }>).map((t) => t.name);
      expect(tables).toEqual(["calls", "credential_types", "credentials", "grants", "meta", "passes", "permits", "shops", "users"]);
      expect(store.getMeta("schema")).toBe("7");
      expect(columns(store, "permits")).toEqual(["id", "pass_id", "shop", "commands", "constraints", "why", "created_at", "decided_at", "decision", "grant_id"]);
      expect(columns(store, "shops").slice(-2)).toEqual(["owner", "tested_at"]);
      expect(columns(store, "credential_types")).toEqual(["name", "origin", "header", "added_at", "kind", "state", "proposed_by", "guidance", "oauth", "client"]);
      expect(columns(store, "credentials").slice(-2)).toEqual(["scopes", "revoked_why"]);
      expect(columns(store, "grants").at(-1)).toBe("source");
      expect(columns(store, "grants")).toContain("credentials");
      expect(columns(store, "calls")).toContain("credentials");
      expect(columns(store, "calls").slice(-3)).toEqual(["call_id", "parent", "wall"]);
      expect(readdirSync(dir)).toContain("town.db");
      expect((store.sql.get("PRAGMA journal_mode") as { journal_mode: string }).journal_mode).toBe("wal");
    });

    it("opens again over the same file with its rows", () => {
      store.addUser("dimitri");
      store.close();
      store = openStore(dir);
      expect(store.userByName("dimitri")?.name).toBe("dimitri");
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

      expect(store.getMeta("schema")).toBe("7");
      expect(store.listTypes().map((t) => [t.name, t.origin, t.header])).toEqual([["github-token", "https://api.github.com", "Authorization: Bearer {token}"]]);
      expect(columns(store, "credentials")).toEqual(["id", "user_id", "type", "label", "sealed", "created_at", "revoked_at", "scopes", "revoked_why"]);
      expect(store.sql.get("SELECT credentials FROM grants WHERE id = 'grant_1'")).toEqual({ credentials: "{}" });
      expect(store.sql.get("SELECT credentials FROM calls")).toEqual({ credentials: "[]" });
      expect(store.calls()).toMatchObject([{ callId: expect.stringMatching(/^call_[0-9a-f]{16}$/), parent: null }]);

      store.close();
      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(store.listUsers()).toHaveLength(1);
    });

    it("refuses a store a newer town made", () => {
      store.setMeta("schema", "8");
      store.close();
      expect(() => openStore(dir)).toThrow(/is schema 8, newer than this town's 7/);
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(path.join(dir, "town.db"));
      db.prepare("UPDATE meta SET value = '7' WHERE key = 'schema'").run();
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
      expect(store.getMeta("schema")).toBe("7");
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
      expect(cols).toEqual(["id", "at", "pass_id", "grant_id", "shop", "command", "argv_hash", "result", "exit", "shop_exit", "latency_ms", "notices", "stderr", "detail", "credentials", "call_id", "parent", "wall"]);
      // Every other column of every old row is as vault left it.
      const after = store.sql.all("SELECT * FROM calls ORDER BY id") as Array<Record<string, unknown>>;
      expect(after.map(({ call_id: _c, parent: _p, wall, ...rest }) => [rest, wall])).toEqual(before.calls.map((r) => [{ ...r }, null]));
      expect(store.sql.get("SELECT sealed FROM credentials")).toEqual(before.sealed);
      expect(store.callTree(calls[2]!.callId).map((c) => c.command)).toEqual(["forget"]);

      // The migration runs once: the ids stay, and a removed seeded type is not seeded again.
      store.sql.run("DELETE FROM credential_types WHERE name = 'github-token'");
      store.close();
      store = openStore(dir);
      expect(store.calls().map((c) => c.callId)).toEqual(calls.map((c) => c.callId));
      expect(store.getMeta("schema")).toBe("7");
      expect(store.listTypes()).toEqual([]);
    });
  });

  describe("credentials, over a file", () => {
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
      store.sql.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      store.close();
      for (const f of files.filter((x) => existsSync(x))) expect(readFileSync(f).includes(needle), `${path.basename(f)} after close`).toBe(false);
      store = openStore(dir);
    });
  });

  describe("a store compose made", () => {
    const FIXTURE = readFileSync(path.resolve(import.meta.dirname, "fixtures/compose-store.sql"), "utf8");
    const KEY = Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(FIXTURE)![1]!, "hex");
    const TABLES = ["users", "passes", "grants", "shops", "calls", "meta", "credential_types", "credentials"];

    it("opens with every row of every table intact, and gains the permits table, shops.owner, grants.source, and the hall's row", () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(path.join(os.tmpdir(), "town-store-compose-"));
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const compose = new DatabaseSync(path.join(dir, "town.db"));
      compose.exec(FIXTURE);
      const before = Object.fromEntries(TABLES.map((t) => [t, compose.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
      compose.close();
      expect(before.meta).toEqual([{ key: "schema", value: "3" }]);
      expect(before.calls).toHaveLength(4);

      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(columns(store, "permits")).toEqual(["id", "pass_id", "shop", "commands", "constraints", "why", "created_at", "decided_at", "decision", "grant_id"]);
      expect(store.listPermits()).toEqual([]);
      // Every old row is as compose left it, with the new columns null: an operator's shop and an operator's grant.
      for (const t of TABLES) {
        const after = store.sql.all(`SELECT * FROM ${t} ORDER BY rowid`) as Array<Record<string, unknown>>;
        const old = after.filter((r) => !(t === "shops" && r.name === "town/hall") && !(t === "meta" && r.key !== "schema"));
        const want = (before[t] as Array<Record<string, unknown>>).map((r) =>
          t === "shops"
            ? { ...r, owner: null, tested_at: r.added_at }
            : t === "grants"
              ? { ...r, source: null }
              : t === "meta"
                ? { ...r, value: "7" }
                : t === "calls"
                  ? { ...r, wall: null }
                  : t === "credential_types"
                    ? { ...r, ...HELD_TOKEN }
                    : t === "credentials"
                      ? { ...r, scopes: null, revoked_why: null }
                      : { ...r },
        );
        expect(old, t).toEqual(want);
      }
      expect(store.listShops().map((x) => [x.name, x.owner])).toEqual([["town/hall", null], ["town/memory", null]]);
      expect(store.getShop("town/hall")?.manifest).toEqual(HALL);
      expect(store.listGrants().map((g) => [g.id, g.source, g.state.kind])).toEqual([["grant_1034b03fbec81982", null, "live"]]);
      expect(store.openCredential("credential_5827672da5fc655b", KEY)).toBe("compose-fixture-not-a-token");
      expect(store.callTree("call_00000000000000a2").map((c) => c.command)).toEqual(["run", "recall"]);

      // A second open migrates nothing and leaves one hall row.
      store.close();
      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(store.listShops().map((x) => x.name)).toEqual(["town/hall", "town/memory"]);
    });

    it("keeps a user made before the namespace rule", () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(path.join(os.tmpdir(), "town-store-compose-"));
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const compose = new DatabaseSync(path.join(dir, "town.db"));
      compose.exec(FIXTURE);
      compose.prepare("INSERT INTO users (id, name, created_at) VALUES ('user_old', 'Dimitri_G', 7)").run();
      compose.close();
      store = openStore(dir);
      expect(store.userByName("Dimitri_G")).toEqual({ id: "user_old", name: "Dimitri_G", createdAt: 7 });
    });
  });

  describe("a store hall made", () => {
    const FIXTURE = readFileSync(path.resolve(import.meta.dirname, "fixtures/hall-store.sql"), "utf8");
    const KEY = Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(FIXTURE)![1]!, "hex");
    const TABLES = ["users", "passes", "grants", "shops", "calls", "meta", "credential_types", "credentials", "permits"];

    it("opens with every row of every table intact, and gains calls.wall, null on every row, as for a call that ran no process", () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(path.join(os.tmpdir(), "town-store-hall-"));
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const hall = new DatabaseSync(path.join(dir, "town.db"));
      hall.exec(FIXTURE);
      const before = Object.fromEntries(TABLES.map((t) => [t, hall.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
      hall.close();
      expect(before.meta).toContainEqual({ key: "schema", value: "4" });
      expect(before.calls).toHaveLength(9);
      expect(before.permits).toHaveLength(1);
      expect(Object.keys(before.calls![0]!)).not.toContain("wall");

      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(columns(store, "calls").at(-1)).toBe("wall");
      for (const t of TABLES) {
        // The hall's row is this town's hall, written again on open; consent's columns are on every old row as its migration writes them.
        const after = (store.sql.all(`SELECT * FROM ${t} ORDER BY rowid`) as Array<Record<string, unknown>>).filter((r) => !(t === "shops" && r.name === "town/hall"));
        const want = (before[t] as Array<Record<string, unknown>>)
          .filter((r) => !(t === "shops" && r.name === "town/hall"))
          .map((r) =>
            t === "calls"
              ? { ...r, wall: null }
              : t === "meta" && r.key === "schema"
                ? { ...r, value: "7" }
                : t === "shops"
                  ? { ...r, tested_at: r.added_at }
                  : t === "credential_types"
                    ? { ...r, ...HELD_TOKEN }
                    : t === "credentials"
                      ? { ...r, scopes: null, revoked_why: null }
                      : { ...r },
          );
        expect(after, t).toEqual(want);
      }
      const calls = store.calls();
      expect(calls.map((c) => [c.shop, c.command, c.result, c.wall])).toEqual([
        ["town/memory", "remember", "ok", null],
        ["town/memory", "recall", "ok", null],
        ["town/memory", "forget", "denied", null],
        ["town/memory", "remember", "ok", null],
        ["town/memory", "list", "ok", null],
        ["town/hall", "publish", "ok", null],
        ["dimitri/todo", "add", "ok", null],
        ["town/memory", "remember", "ok", null],
        ["town/hall", "request", "ok", null],
      ]);
      expect(store.callTree("call_870c75345727b30e").map((c) => [c.depth, c.command, c.wall])).toEqual([[0, "publish", null], [1, "remember", null], [1, "list", null]]);
      expect(store.listShops().map((x) => [x.name, x.ownerName])).toEqual([["dimitri/todo", "dimitri"], ["town/hall", null], ["town/memory", null]]);
      expect(store.listGrants().map((g) => [g.shop, g.source, g.state.kind])).toEqual([["town/hall", null, "live"], ["town/memory", null, "live"], ["dimitri/todo", "publish", "live"]]);
      expect(store.listPermits().map((x) => [x.id, x.commands, x.decision])).toEqual([["prm_629de8040307537d", ["forget"], null]]);
      expect(store.openCredential("credential_1328a2ab850bca9b", KEY)).toBe("hall-fixture-not-a-token");

      // A second open migrates nothing.
      store.close();
      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(store.calls()).toEqual(calls);
    });
  });

  describe("a store wall made", () => {
    // Made by the binaries at e829844, whose src is wall's 1aac7d9: townd serve, townd admin, and town, walled by seatbelt, then sqlite3 .dump.
    const FIXTURE = readFileSync(path.resolve(import.meta.dirname, "fixtures/wall-store.sql"), "utf8");
    const KEY = Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(FIXTURE)![1]!, "hex");
    const TABLES = ["users", "passes", "grants", "shops", "calls", "meta", "credential_types", "credentials", "permits"];

    it("opens with every row of every table intact, every type a held token type, and every shop tested at its added_at", () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(path.join(os.tmpdir(), "town-store-wall-"));
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const wall = new DatabaseSync(path.join(dir, "town.db"));
      wall.exec(FIXTURE);
      const before = Object.fromEntries(TABLES.map((t) => [t, wall.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
      wall.close();
      expect(before.meta).toContainEqual({ key: "schema", value: "5" });
      expect(before.calls).toHaveLength(9);
      expect(before.calls!.map((c) => c.wall)).toContain("seatbelt");
      expect(before.permits).toHaveLength(1);
      expect(Object.keys(before.shops![0]!)).not.toContain("tested_at");

      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      for (const t of TABLES) {
        // The hall's row is this town's hall, written again on open.
        const after = (store.sql.all(`SELECT * FROM ${t} ORDER BY rowid`) as Array<Record<string, unknown>>).filter((r) => !(t === "shops" && r.name === "town/hall"));
        const want = (before[t] as Array<Record<string, unknown>>)
          .filter((r) => !(t === "shops" && r.name === "town/hall"))
          .map((r) =>
            t === "meta" && r.key === "schema"
              ? { ...r, value: "7" }
              : t === "shops"
                ? { ...r, tested_at: r.added_at }
                : t === "credential_types"
                  ? { ...r, ...HELD_TOKEN }
                  : t === "credentials"
                    ? { ...r, scopes: null, revoked_why: null }
                    : { ...r },
          );
        expect(after, t).toEqual(want);
      }
      expect(store.listTypes().map((t) => [t.name, t.kind, t.state, t.proposedBy, t.guidance])).toEqual([["github-token", "token", "held", null, ""]]);
      expect(store.listShops().map((x) => [x.name, x.ownerName, x.testedAt === x.addedAt])).toEqual([["dimitri/todo", "dimitri", true], ["town/hall", null, true], ["town/memory", null, true]]);
      expect(store.listGrants().map((g) => [g.shop, g.source, g.state.kind])).toEqual([["town/hall", null, "live"], ["town/memory", null, "live"], ["dimitri/todo", "publish", "live"]]);
      expect(store.listPermits().map((x) => [x.commands, x.decision])).toEqual([[["remember", "recall", "list", "forget"], null]]);
      expect(store.openCredential(store.listCredentials()[0]!.id, KEY)).toBe("wall-fixture-not-a-token");
      const calls = store.calls();
      expect(calls.map((c) => [c.shop, c.command, c.result])).toEqual([
        ["town/memory", "remember", "ok"],
        ["town/memory", "recall", "ok"],
        ["town/memory", "forget", "denied"],
        ["town/memory", "remember", "ok"],
        ["town/memory", "list", "ok"],
        ["town/hall", "publish", "ok"],
        ["dimitri/todo", "add", "ok"],
        ["town/memory", "remember", "ok"],
        ["town/hall", "request", "ok"],
      ]);

      // A second open migrates nothing.
      store.close();
      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(store.calls()).toEqual(calls);
      expect(store.listShops().map((x) => x.testedAt)).toEqual(store.listShops().map((x) => x.addedAt));
    });
  });

  describe("a store consent made", () => {
    // Made by the binaries at 51883e9, whose src is consent's with src/store.ts split along its nouns: townd admin, townd serve, and town, walled by seatbelt, then sqlite3 .dump.
    const FIXTURE = readFileSync(path.resolve(import.meta.dirname, "fixtures/consent-store.sql"), "utf8");
    const KEY = Buffer.from(/^-- vault\.key: ([0-9a-f]{64})$/m.exec(FIXTURE)![1]!, "hex");
    const TABLES = ["users", "passes", "grants", "shops", "calls", "meta", "credential_types", "credentials", "permits"];

    it("opens under box with every row of every table intact and its schema at 7, the wall column's words as they were", () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(path.join(os.tmpdir(), "town-store-consent-"));
      const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
      const consent = new DatabaseSync(path.join(dir, "town.db"));
      consent.exec(FIXTURE);
      const before = Object.fromEntries(TABLES.map((t) => [t, consent.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
      consent.close();
      expect(before.meta).toContainEqual({ key: "schema", value: "6" });
      expect(before.calls).toHaveLength(5);
      expect(before.credential_types!.map((t) => [t.name, t.kind, t.state])).toEqual([["github-token", "token", "held"], ["docs-oauth", "oauth", "held"], ["figma", "token", "proposed"]]);
      expect(before.permits).toHaveLength(2);

      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      for (const t of TABLES) {
        // The hall's row is this town's hall, written again on open; nothing else moves but the schema's number.
        const after = (store.sql.all(`SELECT * FROM ${t} ORDER BY rowid`) as Array<Record<string, unknown>>).filter((r) => !(t === "shops" && r.name === "town/hall"));
        const want = (before[t] as Array<Record<string, unknown>>)
          .filter((r) => !(t === "shops" && r.name === "town/hall"))
          .map((r) => (t === "meta" && r.key === "schema" ? { ...r, value: "7" } : { ...r }));
        expect(after, t).toEqual(want);
      }
      const calls = store.calls();
      expect(calls.map((c) => [c.shop, c.command, c.result, c.wall])).toEqual([
        ["town/memory", "remember", "ok", "seatbelt"],
        ["town/memory", "recall", "ok", "seatbelt"],
        ["town/memory", "forget", "denied", null],
        ["town/hall", "publish", "ok", null],
        ["town/hall", "request", "ok", null],
      ]);
      expect(store.listShops().map((x) => [x.name, x.ownerName, x.testedAt === null])).toEqual([["dimitri/figma", "dimitri", true], ["town/hall", null, false], ["town/memory", null, false]]);
      expect(store.listGrants().map((g) => [g.shop, g.state.kind])).toEqual([["town/hall", "live"], ["town/memory", "live"]]);
      expect(store.listPermits().map((x) => [x.shop, x.commands, x.decision])).toEqual([["dimitri/figma", ["file", "comments"], null], ["town/memory", ["forget"], null]]);
      const [old, live] = store.listCredentials();
      expect([old!.revokedWhy, live!.revokedAt]).toEqual([`replaced by ${live!.id}`, null]);
      expect(store.openCredential(live!.id, KEY)).toBe("consent-fixture-replacement");
      expect(store.openClient("docs-oauth", KEY)).toEqual({ id: "consent-fixture.apps", secret: "consent-fixture-client-secret" });

      // A second open migrates nothing.
      store.close();
      store = openStore(dir);
      expect(store.getMeta("schema")).toBe("7");
      expect(store.calls()).toEqual(calls);
    });
  });

  describe("the sql seam, over a file", () => {
    it("is the only place node:sqlite is loaded: src/schema.ts loads none itself", () => {
      const src = path.resolve(import.meta.dirname, "../src");
      const loading = readdirSync(src).filter((f) => f.endsWith(".ts") && /"node:sqlite"/.test(readFileSync(path.join(src, f), "utf8")));
      expect(loading).toEqual(["sql.ts"]);
    });
  });
});
