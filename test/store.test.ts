// ring: checkout
// The store: its tables over node:sqlite, every query the gate and the
// admin use, tokens kept only as hashes, and nothing cached, so a second
// connection to the same file, as `townd admin` is to `townd serve`, is
// seen by the first on its next read.

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadShop } from "../src/shoptest.js";
import { StoreError, hashToken, openStore, type Store } from "../src/store.js";

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

function passFor(user = "dimitri", now = 1000) {
  if (!store.userByName(user)) store.addUser(user, now);
  return store.newPass(user, "research assistant", null, now);
}

describe("the schema", () => {
  it("lives at <data>/town.db with the five tables and a meta row", () => {
    const tables = (store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toEqual(["calls", "grants", "meta", "passes", "shops", "users"]);
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
    expect(store.listGrants(pass.id)).toEqual([{ ...g, lastUse: null }]);
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
    const row = (at: number, extra = {}) => ({
      at, passId: pass.id, grantId: g.id, shop: "town/memory", command: "recall", argvHash: "h".repeat(64),
      result: "ok" as const, exit: 0, shopExit: 0, latencyMs: 3.4, notices: [], stderr: "", detail: null, ...extra,
    });
    store.recordCall(row(3000));
    store.recordCall(row(2000, { result: "denied", exit: 2, shopExit: null, stderr: null, notices: ["grant-expires"] }));
    store.recordCall({ ...row(4000), passId: null, grantId: null, shop: null, command: null, result: "invalid-pass", exit: 3, shopExit: null });
    const all = store.calls();
    expect(all.map((c) => c.at)).toEqual([2000, 3000, 4000]);
    expect(all[0]).toMatchObject({ result: "denied", shopExit: null, notices: ["grant-expires"], latencyMs: 3 });
    expect(store.calls({ passId: pass.id })).toHaveLength(2);
    expect(store.calls({ shop: "town/memory", since: 2500 })).toHaveLength(1);
    expect(store.listPasses()[0]!.lastUse).toBe(3000);
    expect(store.listGrants()[0]!.lastUse).toBe(3000);
  });
});
