// ring: box
// The object's seams, in workerd through the pool: the store's own tests
// (test/helpers/store-suite.ts) over the object's SQL driver, each in an
// object made for it, so the file driver and the object's are proved by
// one suite, the wagon's packing and unpacking among them; the driver's transaction whole or not at all, its changes,
// and a named parameter refused; the shelf as `shop_files` rows, put whole,
// read, and removed; the key from the TOWN_VAULT_KEY secret and the
// refusal without it in vault's words and the secret's name; a store made
// by the object holding its rows when the object is evicted and opened
// again; and the object's runtime, the state read from rows and written
// back, a shop test's scratch state removed with its rows, a file past the
// platform's two megabytes a row failing the call with the state as it
// was, and a shop whose runtime is not `worker` refused.

import { randomBytes } from "node:crypto";
import { env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import type { Town } from "../src/box.js";
import { KEY_MISSING, storeVault } from "../src/gate.js";
import { HALL } from "../src/hall.js";
import { parseManifest } from "../src/manifest.js";
import { filesShelf } from "../src/publish.js";
import type { RunOptions } from "../src/runtime.js";
import { BOX_STATE_ROOT, KEY_SECRET, ROW_LIMIT_BYTES, objectSql, objectStore, readState, rowLimitLine, secretKey } from "../src/rows.js";
import { VaultError } from "../src/vault.js";
import { ISOLATE_WALL, SUBPROCESS_REFUSAL } from "../src/wall.js";
import { shopFiles } from "./helpers/box.js";
import { storeSuite } from "./helpers/store-suite.js";

const BOX = env as unknown as { TOWN: DurableObjectNamespace<Town>; TOWN_VAULT_KEY: string };
const KEY = BOX.TOWN_VAULT_KEY;
const MEMORY = shopFiles("shops/memory");

/** An object of its own, apart from the box's `town`. */
const fresh = () => BOX.TOWN.get(BOX.TOWN.idFromName(`object-test-${crypto.randomUUID()}`));

/** Every value in every table of the object's own SQLite, as bytes, for a search. */
function everyByte(storage: DurableObjectStorage): Buffer[] {
  const sql = objectSql(storage);
  const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
  return tables.flatMap(({ name }) =>
    sql.all<Record<string, unknown>>(`SELECT * FROM "${name}"`).flatMap((row) => Object.values(row).map((v) => (v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v))))),
  );
}

let storage: DurableObjectStorage;
let key = KEY;
storeSuite({
  around: (body) =>
    runInDurableObject(fresh(), async (_town, state) => {
      storage = state.storage;
      key = KEY;
      await body();
    }),
  open: () => objectStore(storage, key),
  reopen: () => objectStore(storage, key),
  // The object's tables dropped and made again, under a key of its own: a store made new, where one object is all a test reaches.
  renew() {
    const sql = objectSql(storage);
    const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").map((t) => t.name);
    // The object's SQLite keeps foreign keys on: a table referenced is dropped after what references it.
    for (const name of ["grants", "permits", "credentials", "passes", ...tables]) if (tables.includes(name)) sql.exec(`DROP TABLE IF EXISTS "${name}"`);
    key = randomBytes(32).toString("hex");
    return objectStore(storage, key);
  },
  key: () => Buffer.from(key, "hex"),
  memory: async () => MEMORY.manifest,
  teller: async (types) => shopFiles("test/fixtures/teller-shop", types).manifest,
  bytes: () => everyByte(storage),
  cleanup: () => {},
});

it("runs a transaction whole or not at all, counts a write's changes by rowsWritten, and refuses a named parameter, over ctx.storage.sql", () =>
  runInDurableObject(fresh(), (_town, state) => {
    const store = objectStore(state.storage, KEY);
    expect(() =>
      store.inTransaction(() => {
        store.addUser("dimitri", 1);
        store.addUser("ada", 2);
        throw new Error("the second write failed");
      }),
    ).toThrow("the second write failed");
    expect(store.listUsers()).toEqual([]);
    store.inTransaction(() => store.addUser("dimitri", 1));
    expect(store.sql.run("UPDATE users SET created_at = 3 WHERE name = ?", "dimitri")).toEqual({ changes: 1 });
    expect(store.sql.run("UPDATE users SET created_at = 3 WHERE name = ?", "nobody")).toEqual({ changes: 0 });
    expect(() => store.sql.get("SELECT * FROM users WHERE name = :name", "dimitri")).toThrow(/names a parameter, :name; write \?/);
    expect(store.getMeta("schema")).toBe("7");
    expect(store.dataDir).toBeNull();
  }));

it("keeps a shop's files as rows of shop_files: put whole, read with their modes, and removed; the box's shelf keeps no directory", () =>
  runInDurableObject(fresh(), (_town, state) => {
    const store = objectStore(state.storage, KEY);
    const shelf = store.shelf;
    expect(shelf.read("town/memory")).toBeNull();
    shelf.put("town/memory", new Map([["main.mjs", { content: "export default async function main() {}\n", mode: 0o700 }], ["lib/words.txt", { content: "words", mode: 0o600 }]]));
    expect(store.sql.all("SELECT shop, path, content, mode FROM shop_files ORDER BY path")).toEqual([
      { shop: "town/memory", path: "lib/words.txt", content: "words", mode: 0o600 },
      { shop: "town/memory", path: "main.mjs", content: "export default async function main() {}\n", mode: 0o700 },
    ]);
    expect(shelf.read("town/memory")).toEqual(new Map([["lib/words.txt", { content: "words", mode: 0o600 }], ["main.mjs", { content: "export default async function main() {}\n", mode: 0o700 }]]));
    shelf.put("town/memory", new Map([["main.mjs", { content: "again", mode: 0o600 }]]));
    expect(shelf.read("town/memory")).toEqual(new Map([["main.mjs", { content: "again", mode: 0o600 }]]));
    shelf.put("dimitri/other", new Map([["a", { content: "b", mode: 0o600 }]]));
    shelf.remove("town/memory");
    expect(shelf.read("town/memory")).toBeNull();
    expect(shelf.read("dimitri/other")?.size).toBe(1);
    expect(shelf.dir).toBeUndefined();
  }));

it("takes the vault's key from the TOWN_VAULT_KEY secret, and without it refuses to seal or open in vault's words naming the secret", () =>
  runInDurableObject(fresh(), (_town, state) => {
    expect(secretKey(KEY).read()).toEqual(Buffer.from(KEY, "hex"));
    expect(() => secretKey("abcd").read()).toThrow(new VaultError(`${KEY_SECRET} is not 32 bytes as hex; set the secret the deploy made`));
    const none = secretKey(undefined);
    expect(none.read()).toBeNull();
    expect(none.require(0)).toBeNull();
    expect(() => none.ensure()).toThrow(new VaultError(`${KEY_MISSING}: this box's TOWN_VAULT_KEY secret is not set, and the town never makes one; the deploy does`));

    const keyed = objectStore(state.storage, KEY);
    keyed.addUser("dimitri", 1);
    const c = keyed.addCredential({ userName: "dimitri", type: "github-token", label: "", value: "github_pat_object_test_not_a_token" }, keyed.key.ensure(), 2);
    expect(everyByte(state.storage).some((b) => b.includes(Buffer.from("github_pat_object_test_not_a_token")))).toBe(false);
    expect(keyed.openCredential(c.id, keyed.key.ensure())).toBe("github_pat_object_test_not_a_token");

    const keyless = objectStore(state.storage, undefined);
    expect(() => keyless.key.require(keyless.sealedRows())).toThrow(
      new VaultError(`${KEY_MISSING}: this box's TOWN_VAULT_KEY secret is not set, and the credentials table has 1 row sealed by it; set the secret they were sealed with`),
    );
    expect(() => keyless.addCredential({ userName: "dimitri", type: "github-token", label: "", value: "x" }, keyless.key.ensure())).toThrow(VaultError);
    expect(() => storeVault(keyless, () => keyless.key.read()).open(c.id)).toThrow(new VaultError(KEY_MISSING));
  }));

it("opens a store the object made again with its rows, once the object is evicted: users, the shelf, the state, and one hall row, its migrations run once", async () => {
  const stub = fresh();
  await runInDurableObject(stub, (town) => {
    const store = town.store;
    store.addUser("dimitri", 5);
    store.upsertShop(MEMORY.manifest, 6);
    store.shelf.put("town/memory", MEMORY.files);
    store.sql.run("INSERT INTO shop_state (root, shop, user, path, content) VALUES (?, ?, ?, ?, ?)", BOX_STATE_ROOT, "town/memory", "user_1", "notes/a", "kept");
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, (town) => {
    const store = town.store;
    expect(store.getMeta("schema")).toBe("7");
    expect(store.userByName("dimitri")).toMatchObject({ name: "dimitri", createdAt: 5 });
    expect(store.listShops().map((s) => [s.name, s.addedAt])).toEqual([["town/hall", expect.any(Number)], ["town/memory", 6]]);
    expect(store.getShop("town/hall")?.manifest).toEqual(HALL);
    expect(store.sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM shops WHERE name = 'town/hall'")!.n).toBe(1);
    expect(store.shelf.read("town/memory")).toEqual(MEMORY.files);
    expect(readState(store.sql, BOX_STATE_ROOT, "town/memory", "user_1")).toEqual(new Map([["notes/a", "kept"]]));
  });
});

/** A shop of one file whose `run` does what `body` says. */
function oneFile(body: string, runtime = "worker") {
  const { manifest, refusals } = parseManifest(
    `name: test/one\nversion: 0.0.1\nsummary: One file, for the object's tests.\nruntime: ${runtime}\nentry: ./main.mjs\ncommands:\n  - name: run\n    summary: Run it.\n    effect: write\n    output: text\ntests:\n  - name: runs\n    run: run\n    expect: { exit: 0 }\n`,
  );
  if (!manifest) throw new Error(refusals.join("\n"));
  return { manifest, files: new Map([["main.mjs", { content: `import { writeFileSync } from "node:fs";\nexport default async function main() {\n${body}\n}\n`, mode: 0o600 }]]) };
}

const opts = (user: string, stateRoot = BOX_STATE_ROOT, stdin = ""): RunOptions => ({ user, stateRoot, stdin, wall: ISOLATE_WALL });

it("runs a worker shop with its state from the object's rows and back, apart by root and user, and a scratch root's rows go with it", () =>
  runInDurableObject(fresh(), async (town) => {
    const shelf = filesShelf(MEMORY.files);
    const remember = await town.runtime(shelf, MEMORY.manifest, "remember", { key: "t/a" }, opts("usr_1", BOX_STATE_ROOT, "hello"));
    expect([remember.exit, remember.stderr, remember.wall]).toEqual([0, "", "isolate"]);
    expect(town.store.sql.all("SELECT root, shop, user, path, content FROM shop_state")).toEqual([{ root: "state", shop: "town/memory", user: "usr_1", path: "t/a", content: "hello" }]);
    expect((await town.runtime(shelf, MEMORY.manifest, "recall", { key: "t/a" }, opts("usr_1"))).stdout).toBe("hello\n");
    expect((await town.runtime(shelf, MEMORY.manifest, "recall", { key: "t/a" }, opts("usr_2"))).exit).toBe(1);
    const forget = await town.runtime(shelf, MEMORY.manifest, "forget", { key: "t/a" }, opts("usr_1"));
    expect(forget.exit).toBe(0);
    expect(town.store.sql.all("SELECT * FROM shop_state")).toEqual([]);

    const scratch = await town.store.scratch();
    expect(scratch.root).toMatch(/^scratch-[0-9a-f]{16}$/);
    await town.runtime(shelf, MEMORY.manifest, "remember", { key: "t/b" }, opts("shop-test", scratch.root, "in scratch"));
    expect(readState(town.store.sql, scratch.root, "town/memory", "shop-test")).toEqual(new Map([["t/b", "in scratch"]]));
    expect(readState(town.store.sql, BOX_STATE_ROOT, "town/memory", "shop-test")).toEqual(new Map());
    await scratch.remove();
    expect(town.store.sql.all("SELECT * FROM shop_state")).toEqual([]);
  }));

it("fails a call that would leave one file of the state past the platform's two megabytes a row, with the limit's line, and keeps the state as it was", () =>
  runInDurableObject(fresh(), async (town) => {
    town.store.sql.run("INSERT INTO shop_state (root, shop, user, path, content) VALUES (?, ?, ?, ?, ?)", BOX_STATE_ROOT, "test/one", "usr_1", "big", "before");
    const over = oneFile(`  writeFileSync(process.env.TOWN_STATE + "/big", "x".repeat(${ROW_LIMIT_BYTES}));\n  writeFileSync(process.env.TOWN_STATE + "/small", "also not kept");\n  process.stdout.write("wrote\\n");`);
    const r = await town.runtime(filesShelf(over.files), over.manifest, "run", {}, opts("usr_1"));
    const bytes = ROW_LIMIT_BYTES + "big".length;
    expect([r.exit, r.stdout, r.stderr]).toEqual([1, "wrote\n", `${rowLimitLine(bytes)}\n`]);
    expect(r.stderr).toBe(`town: a file of the state would be ${bytes} bytes after this call, over the box's two megabyte limit on one file; it is kept as it was before the call\n`);
    expect(readState(town.store.sql, BOX_STATE_ROOT, "test/one", "usr_1")).toEqual(new Map([["big", "before"]]));

    const under = oneFile(`  writeFileSync(process.env.TOWN_STATE + "/big", "x".repeat(${ROW_LIMIT_BYTES - "big".length}));`);
    const fits = await town.runtime(filesShelf(under.files), under.manifest, "run", {}, opts("usr_1"));
    expect([fits.exit, fits.stderr]).toEqual([0, ""]);
    expect(readState(town.store.sql, BOX_STATE_ROOT, "test/one", "usr_1").get("big")).toHaveLength(ROW_LIMIT_BYTES - 3);
  }));

it("refuses a shop whose runtime is not worker, before any isolate, in the words that name the runtime to write", () =>
  runInDurableObject(fresh(), async (town) => {
    const sub = oneFile("", "subprocess");
    expect(town.runtime.refuses?.(sub.manifest)).toBe(SUBPROCESS_REFUSAL);
    expect(SUBPROCESS_REFUSAL).toBe("runtime: subprocess runs on a laptop; this box runs a shop in an isolate: write runtime: worker (spec §7)");
    expect(town.runtime.refuses?.(MEMORY.manifest)).toBeNull();
    const r = await town.runtime(filesShelf(sub.files), sub.manifest, "run", {}, opts("usr_1"));
    expect([r.exit, r.stderr, r.wall]).toEqual([1, `${SUBPROCESS_REFUSAL}\n`, null]);
  }));
