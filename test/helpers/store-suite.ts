// ring: checkout
// The store's own tests, over whichever sql seam a harness opens: the
// file driver in this process (test/store.test.ts) and the object's driver
// in workerd (test/object.test.ts), so the two drivers are proved by one
// suite. Users, passes, grants, shops, calls, liveness with dependencies,
// the call tree, credential types and credentials, a grant's liveness, the
// hall's row, a named parameter refused, and permits, each test against a
// store made new for it holding town/memory. A harness says how a test
// runs where its store can be opened, how the same store is opened again
// as another connection, the vault's key, the two manifests the tests add,
// and every byte the store holds, for a search. `describe`, `it`, and
// `beforeEach` here are vitest's, with each test's hooks run inside its
// body, since the object's storage is reached only inside the object.
// This file is imported by one ring of each kind and runs in both.

import { describe as vDescribe, expect, it as vIt } from "vitest";
import { HALL } from "../../src/hall.js";
import { parseManifest, type Manifest } from "../../src/manifest.js";
import { hashToken } from "../../src/passes.js";
import { StoreError, type Store } from "../../src/store.js";

export interface StoreHarness {
  /** Runs one test's body where a store can be opened. */
  around(body: () => Promise<void>): Promise<void>;
  /** A store made new for the test. */
  open(): Store;
  /** The same store opened again: a second connection, or the object opened again. */
  reopen(): Store;
  /** The vault's key the test's store seals under. */
  key(): Buffer;
  /** shops/memory's manifest. */
  memory(): Promise<Manifest>;
  /** test/fixtures/teller-shop's manifest, validated against `types`. */
  teller(types: string[]): Promise<Manifest>;
  /** Every byte the store holds, in pieces, for a search. */
  bytes(): Buffer[];
  /** Removes what the test made. */
  cleanup(): void;
}

export function storeSuite(h: StoreHarness): void {
  let store: Store;
  const hooks: Array<Array<() => unknown>> = [[]];
  const describe = (name: string, fn: () => void) =>
    vDescribe(name, () => {
      hooks.push([]);
      fn();
      hooks.pop();
    });
  const beforeEach = (fn: () => unknown) => void hooks.at(-1)!.push(fn);
  const it = (name: string, fn: () => unknown) => {
    const chain = hooks.flat();
    vIt(name, () =>
      h.around(async () => {
        store = h.open();
        try {
          store.upsertShop(await h.memory(), 1000);
          for (const hook of chain) await hook();
          await fn();
        } finally {
          try {
            store.close();
          } finally {
            h.cleanup();
          }
        }
      }),
    );
  };

  function passFor(user = "dimitri", now = 1000) {
    if (!store.userByName(user)) store.addUser(user, now);
    return store.newPass(user, "research assistant", null, now);
  }

  describe("users", () => {
    it("adds, finds, lists, and refuses a repeat", () => {
      const u = store.addUser("dimitri", 5);
      expect(u).toMatchObject({ name: "dimitri", createdAt: 5 });
      expect(u.id).toMatch(/^user_[0-9a-f]{16}$/);
      expect(store.listUsers()).toEqual([u]);
      expect(() => store.addUser("dimitri")).toThrow(StoreError);
    });

    it("refuses a name that is not a namespace, since a user's name is the first part of the shops its agents publish", () => {
      for (const name of ["Dimitri_G", "dimitri.g", "9lives", "-x", "Dimitri"]) {
        expect(() => store.addUser(name), name).toThrow(`user name ${JSON.stringify(name)} is not a namespace; write lowercase letters, digits, and "-", starting with a letter`);
      }
      expect(() => store.addUser("town")).toThrow("user name town is the operator's namespace; write another name");
      expect(store.addUser("dimitri-g").name).toBe("dimitri-g");
      expect(store.listUsers().map((u) => u.name)).toEqual(["dimitri-g"]);
    });
  });

  describe("passes", () => {
    it("returns a token once and stores only its hash", () => {
      const { pass, token } = passFor();
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(pass.id).toMatch(/^pass_[0-9a-f]{16}$/);
      expect(pass.id).not.toContain(token);
      const row = store.sql.get("SELECT * FROM passes WHERE id = ?", pass.id) as Record<string, unknown>;
      expect(row.token_hash).toBe(hashToken(token));
      expect(Object.values(row)).not.toContain(token);
      store.close();
      for (const bytes of h.bytes()) expect(bytes.includes(Buffer.from(token))).toBe(false);
      store = h.reopen();
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
      const admin = h.reopen();
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
      const other = h.reopen();
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
      const m = await h.memory();
      store.upsertShop({ ...m, version: "0.2.0" }, 2000);
      expect(store.listShops().map((s) => s.name)).toEqual(["town/hall", "town/memory"]);
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
        result: "ok" as const, exit: 0, shopExit: 0, latencyMs: 3.4, notices: [], stderr: "", detail: null, credentials: [{ type: "github-token", requests: 2 }], wall: "seatbelt" as const, ...extra,
      });
      store.recordCall(row(3000));
      store.recordCall(row(2000, { result: "denied", exit: 2, shopExit: null, stderr: null, notices: ["grant-expires"], credentials: [], wall: null }));
      store.recordCall({ ...row(4000), passId: null, grantId: null, shop: null, command: null, result: "invalid-pass", exit: 3, shopExit: null, wall: null });
      const all = store.calls();
      expect(all.map((c) => c.at)).toEqual([2000, 3000, 4000]);
      expect(all[0]).toMatchObject({ callId: "call_0000000000000002", parent: null, result: "denied", shopExit: null, notices: ["grant-expires"], latencyMs: 3, credentials: [] });
      expect(all[1]!.credentials).toEqual([{ type: "github-token", requests: 2 }]);
      expect(all.map((c) => c.wall)).toEqual([null, "seatbelt", null]);
      expect(store.calls({ passId: pass.id })).toHaveLength(2);
      expect(store.calls({ shop: "town/memory", since: 2500 })).toHaveLength(1);
      expect(store.listPasses()[0]!.lastUse).toBe(3000);
      expect(store.listGrants()[0]!.lastUse).toBe(3000);
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
      store.sql.run("UPDATE grants SET expires_at = 1700 WHERE shop = 'town/memory' AND revoked_at IS NULL");
      expect(store.grantState(watch.id, 1699)).toEqual({ kind: "live" });
      expect(store.grantState(watch.id, 1700)).toEqual(notGranted);
      // A dependency not live by a need unmet: the composed grant lacks it too.
      store.upsertShop({ ...(await h.memory()), credentials: [{ type: "github-token" }] }, 1800);
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
      const other = h.reopen();
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
      store.recordCall({ callId, parent, at, passId: "pass_1", grantId: null, shop: "test/x", command, argvHash: "h", result: "ok", exit: 0, shopExit: 0, latencyMs: 1, notices: [], stderr: null, detail: null, credentials: [], wall: "none" });

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

    it("are proposed by a shop's manifest, met by the same definition, held by no credential, approved, and removed while no shop names them", async () => {
      const figma = { name: "figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", guidance: "Make a personal access token at Figma > Settings > Security.\n" };
      const made = store.proposeType(figma, "dimitri/figma", false, 50);
      expect(made).toEqual({ ...figma, guidance: "Make a personal access token at Figma > Settings > Security.", addedAt: 50, kind: "token", state: "proposed", proposedBy: "dimitri/figma", oauth: null, hasClient: false });
      // A second proposal of the name is met by the first: nothing is written, the first proposer's guidance stays.
      expect(store.proposeType({ ...figma, guidance: "Another shop's words." }, "ada/figma", false, 60)).toBeNull();
      expect(store.getType("figma")).toEqual(made);
      expect(store.listTypes().map((t) => [t.name, t.kind, t.state, t.proposedBy])).toEqual([["figma", "token", "proposed", "dimitri/figma"], ["github-token", "token", "held", null]]);
      // The validator reads it: the same definition is met, a different one refused, as for a held type.
      const memory = await h.memory();
      const withNeed = (need: string) => `name: dimitri/figma\nversion: 0.1.0\nsummary: Reads Figma.\nruntime: subprocess\nentry: ./main.mjs\ncredentials:\n  - ${need}\ncommands:\n  - { name: read, summary: Read., effect: read, output: text }\ntests:\n  - { name: reads, run: read, expect: { exit: 0 } }\n`;
      expect(parseManifest(withNeed('{ type: figma, origin: "https://api.figma.com", header: "X-Figma-Token: {token}" }'), store.listTypes()).refusals).toEqual([]);
      expect(parseManifest(withNeed("{ type: figma }"), store.listTypes()).refusals).toEqual([]);
      expect(parseManifest(withNeed('{ type: figma, origin: "https://api.figma.com/v2", header: "X-Figma-Token: {token}" }'), store.listTypes()).refusals).toEqual([
        "credentials[0]: figma is a type this town holds, at https://api.figma.com in X-Figma-Token; leave the definition out, or write that (spec §8)",
      ]);

      // Held by no credential until approved.
      store.addUser("dimitri", 70);
      expect(() => store.addCredential({ userName: "dimitri", type: "figma", label: "", value: "figma-not-a-token" }, h.key())).toThrow(
        new StoreError("type figma is proposed by dimitri/figma and not yet the town's; townd admin type approve figma makes it so"),
      );
      expect(store.sealedRows()).toBe(0);

      // Removed while no shop names it; refused while one does.
      const shop = parseManifest(withNeed("{ type: figma }"), store.listTypes()).manifest!;
      store.upsertShop(shop, 80, null, null);
      expect(() => store.removeType("figma")).toThrow(new StoreError("type figma is proposed and named by a shop (dimitri/figma); remove it with townd admin shop rm first"));
      expect(store.getShop("dimitri/figma")?.testedAt).toBeNull();
      store.markTested("dimitri/figma", 90);
      expect(store.getShop("dimitri/figma")?.testedAt).toBe(90);
      store.upsertShop(shop, 95, null, null);
      expect(store.getShop("dimitri/figma")?.testedAt).toBeNull();
      store.removeShop("dimitri/figma");
      store.removeType("figma");
      expect(store.getType("figma")).toBeNull();
      expect(memory.name).toBe("town/memory");

      // Approved: held, its definition the proposal's; approved once; then a credential of it, and removal refused as vault's.
      store.proposeType(figma, "dimitri/figma", false, 100);
      expect(store.approveType("figma")).toMatchObject({ state: "held", proposedBy: "dimitri/figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", addedAt: 100 });
      expect(() => store.approveType("figma")).toThrow("type figma is already the town's; townd admin type ls lists them");
      expect(() => store.approveType("nothing")).toThrow("type nothing is not in this town; townd admin type ls lists them");
      const c = store.addCredential({ userName: "dimitri", type: "figma", label: "", value: "figma-not-a-token" }, h.key());
      expect(() => store.removeType("figma")).toThrow(`type figma is held by a credential (${c.id}); remove it with townd admin credential rm first`);

      // The operator's shop add holds a type it defines in one step, and the operator's own type carries the operator's guidance.
      expect(store.proposeType({ ...figma, name: "sketch", origin: "https://api.sketch.com" }, "dimitri/sketch", true, 110)).toMatchObject({ state: "held", proposedBy: "dimitri/sketch" });
      expect(store.addType({ name: "internal", origin: "https://api.example.internal", header: "X-Key: {token}", guidance: "  Ask the team for a key.\n" }, 120)).toMatchObject({ state: "held", proposedBy: null, guidance: "Ask the team for a key." });
    });

    it("stay removed: github-token removed is not seeded again on the next open", () => {
      store.removeType("github-token");
      store.close();
      store = h.reopen();
      expect(store.listTypes()).toEqual([]);
    });
  });

  describe("credentials", () => {
    const VALUE = "ghp_not_a_real_token_store_test";

    it("list the id, user, type, label, creation, state, and bound grants, and never the value", () => {
      store.addUser("dimitri");
      store.addUser("ada");
      const key = h.key();
      const a = store.addCredential({ userName: "dimitri", type: "github-token", label: "PAT", value: VALUE }, key, 100);
      const b = store.addCredential({ userName: "ada", type: "github-token", label: "", value: "another" }, key, 200);
      expect(a.id).toMatch(/^credential_[0-9a-f]{16}$/);
      expect(store.listCredentials()).toEqual([
        { id: a.id, userId: a.userId, userName: "dimitri", type: "github-token", label: "PAT", createdAt: 100, revokedAt: null, revokedWhy: null, scopes: [], grants: [] },
        { id: b.id, userId: b.userId, userName: "ada", type: "github-token", label: "", createdAt: 200, revokedAt: null, revokedWhy: null, scopes: [], grants: [] },
      ]);
      expect(store.listCredentials("ada").map((c) => c.id)).toEqual([b.id]);
      expect(JSON.stringify(store.listCredentials())).not.toContain(VALUE);
    });

    it("are revoked by marking the row, which leaves them out of a user's live credentials and frees the type", () => {
      const user = store.addUser("dimitri");
      store.addType({ name: "internal", origin: "https://api.example.internal", header: "Authorization: Bearer {token}" });
      const c = store.addCredential({ userName: "dimitri", type: "internal", label: "", value: VALUE }, h.key(), 100);
      expect(store.liveCredentials(user.id, "internal").map((x) => x.id)).toEqual([c.id]);
      expect(() => store.removeType("internal")).toThrow(new RegExp(`type internal is held by a credential \\(${c.id}\\)`));
      expect(store.revokeCredential(c.id, 300).revokedAt).toBe(300);
      expect(store.liveCredentials(user.id, "internal")).toEqual([]);
      expect(store.sealedRows()).toBe(1);
      store.removeType("internal");
    });

    it("are refused for a user or a type the town lacks", () => {
      const key = h.key();
      expect(() => store.addCredential({ userName: "nobody", type: "github-token", label: "", value: VALUE }, key)).toThrow(/user nobody does not exist/);
      store.addUser("dimitri");
      expect(() => store.addCredential({ userName: "dimitri", type: "github-tokens", label: "", value: VALUE }, key)).toThrow(/write one of \(github-token\)/);
    });
  });

  describe("a grant's liveness", () => {
      let key: Buffer;

    beforeEach(async () => {
      key = h.key();
      store.addType({ name: "test-origin", origin: "http://127.0.0.1:9", header: "Authorization: Bearer {token}" }, 1000);
      store.upsertShop(await h.teller(["github-token", "test-origin"]), 1000);
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
      const admin = h.reopen();
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
      const teller = await h.teller(["test-origin"]);
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
      const memory = await h.memory();
      store.upsertShop({ ...memory, credentials: [{ type: "test-origin" }] }, 1500);
      expect(store.grantState(g.id, 2000)).toEqual({ kind: "unmet", type: "test-origin" });
      expect(store.grantsForPass(pass.id, 2000)).toEqual([]);
    });
  });

  describe("the hall's row", () => {
    it("is in a store made new, this town's manifest with no owner, and a second open leaves one row as it was", () => {
      expect(store.getShop("town/hall")).toMatchObject({ name: "town/hall", version: HALL.version, manifest: HALL, owner: null, ownerName: null });
      const before = store.getShop("town/hall")!;
      store.close();
      store = h.reopen();
      expect(store.listShops().filter((x) => x.name === "town/hall")).toEqual([before]);
      expect((store.sql.get("SELECT COUNT(*) AS n FROM shops WHERE name = 'town/hall'") as { n: number }).n).toBe(1);
    });

    it("is written again on open when it was removed or is not this town's", () => {
      store.removeShop("town/hall");
      store.upsertShop({ ...HALL, name: "town/hall", version: "0.0.9" }, 5);
      store.close();
      store = h.reopen();
      expect(store.getShop("town/hall")?.manifest).toEqual(HALL);
      store.removeShop("town/hall");
      store.close();
      store = h.reopen();
      expect(store.getShop("town/hall")?.manifest).toEqual(HALL);
    });
  });

  describe("the sql seam, as the store uses it", () => {
    it("refuses a query that names a parameter, so every query the store makes is positional", () => {
      store.addUser("dimitri", 1000);
      expect(() => store.sql.get("SELECT * FROM users WHERE name = :name", "dimitri")).toThrow(/names a parameter, :name; write \?/);
      expect(store.sql.get("SELECT name FROM users WHERE name = ?", "dimitri")).toEqual({ name: "dimitri" });
    });
  });

  describe("permits", () => {
    function permit(passId: string, extra: Partial<{ shop: string; commands: string[]; why: string }> = {}, now = 1000) {
      return store.newPermit({ passId, shop: "town/memory", commands: ["forget"], constraints: { "forget.key": { prefix: "notes/" } }, why: "to clear finished items", ...extra }, now);
    }

    it("are made pending, found by id, and listed by pass, oldest first", () => {
      const { pass } = passFor();
      const other = passFor("ada").pass;
      const p = permit(pass.id);
      expect(p).toEqual({
        id: expect.stringMatching(/^prm_[0-9a-f]{16}$/), passId: pass.id, userName: "dimitri", shop: "town/memory", commands: ["forget"],
        constraints: { "forget.key": { prefix: "notes/" } }, why: "to clear finished items", createdAt: 1000, decidedAt: null, decision: null, grantId: null,
      });
      expect(store.permitById(p.id)).toEqual(p);
      const q = permit(other.id, {}, 900);
      const r = permit(pass.id, { shop: "town/hall", commands: ["request"], why: "" }, 1100);
      expect(store.listPermits(pass.id).map((x) => x.id)).toEqual([p.id, r.id]);
      expect(store.listPermits().map((x) => x.id)).toEqual([q.id, p.id, r.id]);
      expect(store.permitById("prm_nothing")).toBeNull();
    });

    it("replace a pending one of the pass at the shop, and only that one", () => {
      const { pass } = passFor();
      const other = passFor("ada").pass;
      const first = permit(pass.id);
      const theirs = permit(other.id);
      const second = permit(pass.id, { commands: ["forget", "list"] }, 2000);
      expect(store.listPermits().map((x) => [x.id, x.passId, x.commands])).toEqual([[theirs.id, other.id, ["forget"]], [second.id, pass.id, ["forget", "list"]]]);
      expect(store.permitById(first.id)).toBeNull();
      // A decided permit is not replaced: it is the record of a decision.
      store.decidePermit(second.id, "denied", null, 2500);
      const third = permit(pass.id, {}, 3000);
      expect(store.listPermits(pass.id).map((x) => [x.id, x.decision])).toEqual([[second.id, "denied"], [third.id, null]]);
    });

    it("are decided once, approved naming the grant or denied, and a decided or missing permit is refused", () => {
      const { pass } = passFor();
      const p = permit(pass.id);
      const g = store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["forget"], constraints: {}, expiresAt: null, source: `permit ${p.id}` }, 1500);
      expect(store.decidePermit(p.id, "approved", g.id, 1500)).toMatchObject({ decision: "approved", decidedAt: 1500, grantId: g.id });
      expect(store.grantById(g.id)?.source).toBe(`permit ${p.id}`);
      expect(() => store.decidePermit(p.id, "denied", null, 1600)).toThrow(`permit ${p.id} was approved at 1970-01-01T00:00:01Z; a decided permit is not decided again`);
      const d = permit(pass.id, {}, 1700);
      expect(store.decidePermit(d.id, "denied", null, 1800)).toMatchObject({ decision: "denied", decidedAt: 1800, grantId: null });
      expect(() => store.decidePermit(d.id, "approved", g.id, 1900)).toThrow(/was denied at/);
      expect(() => store.decidePermit("prm_nothing", "denied", null)).toThrow("permit prm_nothing does not exist; townd admin permit ls lists them");
      expect(() => permit("pass_nothing")).toThrow(/does not exist/);
      expect(() => permit(pass.id, { shop: "town/nothing" })).toThrow(/is not in this town/);
    });

    it("leave a grant's source null for the operator's grant new", () => {
      const { pass } = passFor();
      expect(store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null }, 1000).source).toBeNull();
    });
  });
}
