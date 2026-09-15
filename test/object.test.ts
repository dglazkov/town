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
// was, and a shop whose runtime is not `worker` refused. And the wagon over
// the door, the box's own object: a wagon packed in an object of its own,
// as a laptop's store packs it, refused with `key` in the body when it
// holds a `runtime: subprocess` shop, a state file as base64, or a file or
// a state file past the row limit, each named and nothing written, and
// the first two named so again over the town once it holds one; `--key`
// in the words and a key that is not hex refused; then unpacked, a call by
// a pass from the wagon answered from its state; `store export` through
// the door printing the wagon with the address as `from` and the build as
// `build`; and the key's bytes in no row of the object.

import { randomBytes } from "node:crypto";
import { SELF, env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import type { Town } from "../src/box.js";
import { KEY_MISSING, storeVault } from "../src/gate.js";
import { HALL } from "../src/hall.js";
import { parseManifest } from "../src/manifest.js";
import { filesShelf } from "../src/publish.js";
import type { RunOptions } from "../src/runtime.js";
import { BOX_STATE_ROOT, KEY_SECRET, TOWN_OBJECT, objectSql, objectStore, readState, secretKey } from "../src/rows.js";
import { VaultError } from "../src/vault.js";
import { ISOLATE_WALL, ROW_LIMIT_BYTES, SUBPROCESS_REFUSAL, rowLimitLine } from "../src/wall.js";
import { pack, type Wagon } from "../src/wagon.js";
import { DOOR, call, shopFiles } from "./helpers/box.js";
import { storeSuite } from "./helpers/store-suite.js";

const BOX = env as unknown as { TOWN: DurableObjectNamespace<Town>; TOWN_VAULT_KEY: string; TOWN_BUILD: string };
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
  // The teller as a worker shop: the box's store holds no other, and the wagon's unpacking on the box refuses any other.
  teller: async (types) => ({ ...shopFiles("test/fixtures/teller-shop", types).manifest, runtime: "worker" }),
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

/** A verb posted to the door's /admin as the pipe posts it, the wagon's key as hex in the body when given. */
async function adminWithKey(argv: string[], stdin: string | null, key: string | null | unknown): Promise<{ status: number; stdout: string; stderr: string; exit: number }> {
  const res = await SELF.fetch(`${DOOR}/admin`, { method: "POST", headers: { authorization: `Bearer ${(env as unknown as { TOWN_OPERATOR: string }).TOWN_OPERATOR}` }, body: JSON.stringify({ argv, stdin, ...(key === null ? {} : { key }) }) });
  const body = (await res.json()) as { stdout: string; stderr: string; exit: number };
  return { status: res.status, stdout: body.stdout, stderr: body.stderr, exit: body.exit };
}

it("unpacks a wagon through the door with key in the body, after refusing a subprocess shop, a base64 state file, and files past the row limit, each named with nothing written; and exports it back with the address as from", async () => {
  const wagonKey = randomBytes(32);
  const hexKey = wagonKey.toString("hex");
  const ECHO = shopFiles("test/fixtures/echo-shop");

  // A wagon packed as a laptop's store packs one: a user, a pass, memory with its files and a grant, a credential, and state; a second with the echo shop beside it.
  const packed = (withEcho: boolean) =>
    runInDurableObject(fresh(), (_town, state) => {
      const store = objectStore(state.storage, KEY);
      store.addUser("dimitri", 1000);
      const { pass, token } = store.newPass("dimitri", "wagon", null, 1001);
      store.upsertShop(MEMORY.manifest, 1002);
      store.shelf.put("town/memory", MEMORY.files);
      store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null }, 1003);
      store.addCredential({ userName: "dimitri", type: "github-token", label: "PAT", value: "github_pat_wagon_door_not_a_token" }, store.key.ensure(), 1004);
      store.states.put("town/memory", pass.userId, new Map([["notes/wagon", Buffer.from("the wagon rolls")]]));
      if (withEcho) {
        store.upsertShop(ECHO.manifest, 1005);
        store.shelf.put("test/echo", ECHO.files);
      }
      return { text: JSON.stringify(pack(store, store.key.require(1), wagonKey, { audit: true, now: 2000, build: "laptop", from: "/tmp/a/town.db" }).wagon, null, 2), token };
    });
  const { text, token } = await packed(false);
  const wagon = JSON.parse(text) as Wagon;
  const empty = () => runInDurableObject(BOX.TOWN.getByName(TOWN_OBJECT), (town) => [town.store.listUsers().length, town.store.listShops().length, town.store.states.readAll().length, town.store.sql.all("SELECT * FROM shop_files").length]);
  expect(await empty()).toEqual([0, 1, 0, 0]);
  const refusedWith = async (w: string, why: string) => {
    const r = await adminWithKey(["store", "import"], w, hexKey);
    expect([r.exit, r.stdout, r.stderr]).toEqual([1, "", `townd admin: this box does not take this wagon: ${why}; nothing was written\n`]);
    expect(await empty()).toEqual([0, 1, 0, 0]);
  };

  // The box's rules, each named: the subprocess shop, the base64 state file, a shop's file and a state file past the row limit.
  const echoWagon = (await packed(true)).text;
  await refusedWith(echoWagon, `shop test/echo is refused: ${SUBPROCESS_REFUSAL}`);
  const user = String(wagon.users[0]!.id);
  await refusedWith(JSON.stringify({ ...wagon, state: [...wagon.state, { shop: "town/memory", user, path: "raw.bin", base64: "//4AgA==" }] }), `state file raw.bin of shop town/memory for user ${user} is bytes that are not UTF-8, carried as base64, and this box keeps state as rows of text`);
  const big = "x".repeat(ROW_LIMIT_BYTES);
  const withBigFile = { ...wagon, shops: wagon.shops.map((s) => ({ ...s, files: [...s.files, { path: "big.txt", content: big, mode: 0o600 }] })) };
  await refusedWith(JSON.stringify(withBigFile), `file big.txt of shop town/memory is ${ROW_LIMIT_BYTES + "big.txt".length} bytes, over the box's two megabyte limit on one file`);
  await refusedWith(JSON.stringify({ ...wagon, state: [...wagon.state, { shop: "town/memory", user, path: "notes/big", content: big }] }), `state file notes/big of shop town/memory for user ${user} is ${ROW_LIMIT_BYTES + "notes/big".length} bytes, over the box's two megabyte limit on one file`);

  // The key never in the words the box sees, and never anything but hex in the body.
  const inWords = await adminWithKey(["store", "import", "--key", "/tmp/wagon.key"], text, null);
  expect([inWords.exit, inWords.stderr.split("\n")[0]]).toEqual([1, `townd admin: --key is read where townd runs, never on the box; the pipe reads the file and sends the key: townd admin --town ${DOOR} store export --key <file>`]);
  for (const bad of ["abc", 42, hexKey.slice(1)]) expect((await adminWithKey(["store", "import"], text, bad)).status).toBe(400);
  const noKey = await adminWithKey(["store", "import"], text, null);
  expect([noKey.exit, noKey.stderr.split("\n")[0]]).toEqual([1, "townd admin: store import needs --key <file>, read where townd runs"]);
  expect(await empty()).toEqual([0, 1, 0, 0]);

  // Unpacked: the counts, and a call by the wagon's pass answered from its state in the object's rows.
  const imported = await adminWithKey(["store", "import"], text, hexKey);
  expect([imported.exit, imported.stdout, imported.stderr]).toEqual([0, "", "users 1, passes 1, grants 1, shops 1, types 1, credentials 1, permits 0, calls 0, state files 1\n"]);
  expect(await call(token, ["memory", "recall", "--key", "notes/wagon"])).toMatchObject({ exit: 0, stdout: "the wagon rolls\n" });
  const again = await adminWithKey(["store", "import"], text, hexKey);
  expect([again.exit, again.stderr]).toEqual([1, "townd admin: this town holds 1 user and 1 shop; import writes into an empty town alone\n"]);

  // Over the town now held, the box's rules still come first: the subprocess shop and the base64 state file are named, not the town's holdings, and the store is unchanged by either.
  const everyRow = () => runInDurableObject(BOX.TOWN.getByName(TOWN_OBJECT), (_town, state) => everyByte(state.storage).map((b) => b.toString("base64")));
  const held = await everyRow();
  const overHeld = async (w: string, why: string) => {
    const r = await adminWithKey(["store", "import"], w, hexKey);
    expect([r.exit, r.stdout, r.stderr]).toEqual([1, "", `townd admin: this box does not take this wagon: ${why}; nothing was written\n`]);
    expect(r.stderr).not.toContain("this town holds");
    expect(await everyRow()).toEqual(held);
  };
  await overHeld(echoWagon, `shop test/echo is refused: ${SUBPROCESS_REFUSAL}`);
  expect(SUBPROCESS_REFUSAL).toContain("runtime: worker");
  await overHeld(JSON.stringify({ ...wagon, state: [...wagon.state, { shop: "town/memory", user, path: "raw.bin", base64: "//4AgA==" }] }), `state file raw.bin of shop town/memory for user ${user} is bytes that are not UTF-8, carried as base64, and this box keeps state as rows of text`);

  // Exported back through the door: the wagon as stdout, from the address, the build the deploy's; the credential opens under the key.
  const exported = await adminWithKey(["store", "export"], null, hexKey);
  expect(exported.exit, exported.stderr).toBe(0);
  expect(exported.stderr).toMatch(/^users 1, passes 1, grants 1, shops 1, types 1, credentials 1, permits 0, calls 1, state files 1\n$/);
  const back = JSON.parse(exported.stdout) as Wagon;
  expect([back.from, back.build, back.users, back.state]).toEqual([DOOR, BOX.TOWN_BUILD, wagon.users, wagon.state]);
  expect(exported.stdout).not.toContain("github_pat_wagon_door_not_a_token");

  // The wagon's key is in no row of the object, as hex or as bytes.
  await runInDurableObject(BOX.TOWN.getByName(TOWN_OBJECT), (_town, state) => {
    for (const b of everyByte(state.storage)) {
      expect(b.includes(Buffer.from(hexKey))).toBe(false);
      expect(b.includes(wagonKey)).toBe(false);
    }
  });
});
