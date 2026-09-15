// The wagon: a town packed whole into one JSON document by `store export`,
// and unpacked into an empty town by `store import`. The packing reads
// every table the schema names in id order, opens each sealed value under
// the vault's key and seals it again under the wagon's, with the same id,
// reads each shop's files from the shelf, and every state file by the
// store's states seam; it writes nothing. The unpacking reads the wagon
// whole and checks it whole before a byte is written, in order: one JSON
// document whose `wagon` is 1; its `schema` this town's; the town empty;
// every sealed value opening under the wagon's key. Then files and state
// go onto the shelf and the state root, and every row in one transaction,
// each sealed value sealed again under this town's key. Ids are kept, so a
// grant file works at the new town with its address changed and nothing
// else. The wagon's key is the operator's, `--key <file>`, read by `main`
// where townd runs, made by export when the file is missing, and never
// printed; the wagon holds no secret in the clear.

import { closeSync, openSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { UsageError, noExtra, one, type Io, type Over, type Parsed } from "./admin.js";
import { clientSeal } from "./credentials.js";
import { HALL_NAME } from "./manifest.js";
import { SCHEMA_VERSION, SEEDED_TYPES } from "./schema.js";
import { StoreError, type Store } from "./store.js";
import { KEY_BYTES, VaultError, openCredential, readKeyFile, sealCredential } from "./vault.js";

/** The format's version: the `wagon` key's value. */
export const WAGON_FORMAT = 1;

type Row = Record<string, unknown>;
type Cell = string | number | null;

/** A shop's row with its files, the shelf's map in order. */
export type ShopEntry = Record<string, Cell> & { files: Array<{ path: string; content: string; mode: number }> };

/** A state file: text, or on a laptop bytes that are not UTF-8 as base64. */
export type StateEntry = { shop: string; user: string; path: string } & ({ content: string } | { base64: string });

export interface Wagon {
  wagon: number;
  schema: number;
  build: string;
  packed_at: number;
  from: string;
  audit: boolean;
  users: Array<Record<string, Cell>>;
  passes: Array<Record<string, Cell>>;
  grants: Array<Record<string, Cell>>;
  shops: ShopEntry[];
  types: Array<Record<string, Cell>>;
  credentials: Array<Record<string, Cell>>;
  permits: Array<Record<string, Cell>>;
  calls: Array<Record<string, Cell>>;
  state: StateEntry[];
}

/** Each of the wagon's lists of rows, its table, and the column it is read in order of; in the order rows are written, each after what it references. */
const TABLES = [
  { key: "users", table: "users", order: "id" },
  { key: "passes", table: "passes", order: "id" },
  { key: "grants", table: "grants", order: "id" },
  { key: "permits", table: "permits", order: "id" },
  { key: "types", table: "credential_types", order: "name" },
  { key: "credentials", table: "credentials", order: "id" },
  { key: "shops", table: "shops", order: "name" },
  { key: "calls", table: "calls", order: "id" },
] as const;

/** The sealed columns: each opened and sealed again, under the id it was sealed for. */
const SEALED: Record<string, { column: string; id: (row: Row) => string; name: (row: Row) => string }> = {
  credentials: { column: "sealed", id: (r) => String(r.id), name: (r) => `credential ${String(r.id)}` },
  credential_types: { column: "client", id: (r) => clientSeal(String(r.name)), name: (r) => `type ${String(r.name)}'s registration` },
};

/** A table's columns by name, and which hold blobs. */
function columns(store: Store, table: string): { names: string[]; blobs: Set<string> } {
  const info = store.sql.all<{ name: string; type: string }>(`PRAGMA table_info(${table})`);
  return { names: info.map((c) => String(c.name)), blobs: new Set(info.filter((c) => String(c.type).toUpperCase() === "BLOB").map((c) => String(c.name))) };
}

const isUtf8 = (b: Buffer) => Buffer.from(b.toString("utf8"), "utf8").equals(b);

/** The store packed under `wagonKey`: every row, each sealed value sealed again, every shop's files, and every state file; and how many calls `--no-audit` left behind. */
export function pack(store: Store, vaultKey: Buffer | null, wagonKey: Buffer, opts: { audit: boolean; now: number; build: string; from: string }): { wagon: Wagon; left: number } {
  const lists: Record<string, Array<Record<string, Cell>>> = {};
  let left = 0;
  for (const { key, table, order } of TABLES) {
    const where = table === "shops" ? " WHERE name != ?" : "";
    const rows = store.sql.all<Row>(`SELECT * FROM ${table}${where} ORDER BY ${order}`, ...(where ? [HALL_NAME] : []));
    if (table === "calls" && !opts.audit) {
      left = rows.length;
      lists[key] = [];
      continue;
    }
    const sealed = SEALED[table];
    lists[key] = rows.map((row) => {
      const out: Record<string, Cell> = {};
      for (const [name, v] of Object.entries(row)) out[name] = v instanceof Uint8Array ? Buffer.from(v).toString("base64") : typeof v === "bigint" ? Number(v) : (v as Cell);
      const held = sealed ? row[sealed.column] : null;
      if (sealed && held !== null && held !== undefined) {
        if (vaultKey === null) throw new StoreError(`${sealed.name(row)} is sealed, and this town has no vault key to open it`);
        out[sealed.column] = sealCredential(wagonKey, sealed.id(row), openCredential(vaultKey, sealed.id(row), held as Uint8Array)).toString("base64");
      }
      if (table === "shops") (out as ShopEntry).files = [...(store.shelf.read(String(row.name)) ?? new Map())].map(([p, f]) => ({ path: p, content: f.content, mode: f.mode }));
      return out;
    });
  }
  const state: StateEntry[] = store.states.readAll().map((f) => (isUtf8(f.content) ? { shop: f.shop, user: f.user, path: f.path, content: f.content.toString("utf8") } : { shop: f.shop, user: f.user, path: f.path, base64: f.content.toString("base64") }));
  const wagon: Wagon = {
    wagon: WAGON_FORMAT,
    schema: SCHEMA_VERSION,
    build: opts.build,
    packed_at: opts.now,
    from: opts.from,
    audit: opts.audit,
    users: lists.users!,
    passes: lists.passes!,
    grants: lists.grants!,
    shops: lists.shops as ShopEntry[],
    types: lists.types!,
    credentials: lists.credentials!,
    permits: lists.permits!,
    calls: lists.calls!,
    state,
  };
  return { wagon, left };
}

/** The counts line export and import print on stderr. */
export function countsLine(w: Wagon): string {
  const n = { users: w.users, passes: w.passes, grants: w.grants, shops: w.shops, types: w.types, credentials: w.credentials, permits: w.permits, calls: w.calls, "state files": w.state };
  return Object.entries(n).map(([k, v]) => `${k} ${v.length}`).join(", ");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the town holds that an empty town does not, as counted nouns; empty for an empty town. Users and shops first, and alone when either is held. */
export function holdings(store: Store): string[] {
  const count = (sql: string, ...params: string[]) => Number(store.sql.get<Row>(sql, ...params)!.n);
  const seeded = SEEDED_TYPES.map((t) => t.name);
  const users = count("SELECT COUNT(*) AS n FROM users");
  const shops = count("SELECT COUNT(*) AS n FROM shops WHERE name != ?", HALL_NAME);
  const headline = [users ? plural(users, "user", "users") : "", shops ? plural(shops, "shop", "shops") : ""].filter(Boolean);
  const rest = [
    plural(count("SELECT COUNT(*) AS n FROM passes"), "pass", "passes"),
    plural(count("SELECT COUNT(*) AS n FROM grants"), "grant", "grants"),
    plural(count(`SELECT COUNT(*) AS n FROM credential_types WHERE name NOT IN (${seeded.map(() => "?").join(", ")})`, ...seeded), "type", "types"),
    plural(count("SELECT COUNT(*) AS n FROM credentials"), "credential", "credentials"),
    plural(count("SELECT COUNT(*) AS n FROM permits"), "permit", "permits"),
    plural(count("SELECT COUNT(*) AS n FROM calls"), "call", "calls"),
    plural(store.states.readAll().length, "state file", "state files"),
  ].filter((s) => !s.startsWith("0 "));
  return headline.length ? headline : rest;
}

/** Nouns as a sentence's list: `a`, `a and b`, `a, b, and c`. */
const listed = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);

/** What a JSON value is, for a refusal that names what it found without repeating it. */
function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  return typeof v === "object" ? "an object" : `a ${typeof v}`;
}

/** A path inside a shop or a state directory: relative, `/`-separated, no empty, `.`, or `..` segment. */
const insidePath = (p: unknown): p is string => typeof p === "string" && p !== "" && !p.includes("\0") && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");

/** Checks 1 and 2, and the wagon's shape against this town's columns: the wagon, or its refusal thrown. */
function readWagon(store: Store, text: string): Wagon {
  const not = (what: string) => new StoreError(`stdin is not a wagon: ${what}; pipe in what townd admin store export printed`);
  if (text.trim() === "") throw not("it is empty");
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw not("it is not JSON");
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) throw not(`it is JSON, ${kindOf(doc)}, and a wagon is an object`);
  const w = doc as Record<string, unknown>;
  if (!("wagon" in w)) throw not("it is a JSON object with no wagon key");
  if (w.wagon !== WAGON_FORMAT) throw not(`its wagon is ${typeof w.wagon === "number" ? w.wagon : kindOf(w.wagon)}, and this town reads wagon ${WAGON_FORMAT}`);
  if (typeof w.schema !== "number") throw not(`its schema is ${kindOf(w.schema)}, not a number`);
  if (w.schema > SCHEMA_VERSION) throw new StoreError(`this wagon is schema ${w.schema}, newer than this town's ${SCHEMA_VERSION}; run the town that made it`);
  if (w.schema < SCHEMA_VERSION) throw new StoreError(`this wagon is schema ${w.schema}; open its town with this town's code, which migrates it, and export again`);

  const whole = (what: string) => new StoreError(`stdin is not a whole wagon: ${what}; export it again`);
  if (typeof w.audit !== "boolean") throw whole(`its audit is ${kindOf(w.audit)}, not true or false`);
  for (const { key, table } of TABLES) {
    const rows = w[key];
    if (!Array.isArray(rows)) throw whole(`its ${key} is ${kindOf(rows)}, not a list of rows`);
    const { names } = columns(store, table);
    const expected = table === "shops" ? [...names, "files"] : names;
    rows.forEach((row: unknown, i) => {
      if (row === null || typeof row !== "object" || Array.isArray(row)) throw whole(`its ${key}[${i}] is ${kindOf(row)}, not a row`);
      const r = row as Record<string, unknown>;
      const extra = Object.keys(r).find((k) => !expected.includes(k));
      if (extra !== undefined) throw whole(`its ${key}[${i}] holds ${extra}, which is not a column of ${table}`);
      const missing = expected.find((k) => !(k in r));
      if (missing !== undefined) throw whole(`its ${key}[${i}] has no ${missing}`);
      const odd = names.find((k) => r[k] !== null && typeof r[k] !== "string" && typeof r[k] !== "number");
      if (odd !== undefined) throw whole(`its ${key}[${i}].${odd} is ${kindOf(r[odd])}, not a column's value`);
    });
  }
  if (!w.audit && (w.calls as unknown[]).length) throw whole("its audit is false and its calls are not empty");
  (w.shops as Row[]).forEach((s, i) => {
    if (s.name === HALL_NAME) throw whole(`its shops holds ${HALL_NAME}, which is every town's own and never carried`);
    const files = s.files;
    if (!Array.isArray(files) || !files.every((f) => f && typeof f === "object" && insidePath(f.path) && typeof f.content === "string" && typeof f.mode === "number")) {
      throw whole(`its shops[${i}].files is not a list of { path, content, mode } inside the shop`);
    }
  });
  if (!Array.isArray(w.state)) throw whole(`its state is ${kindOf(w.state)}, not a list of files`);
  (w.state as unknown[]).forEach((f, i) => {
    const s = (f ?? {}) as Record<string, unknown>;
    const body = typeof s.content === "string" ? !("base64" in s) : typeof s.base64 === "string" && !("content" in s);
    if (typeof s.shop !== "string" || typeof s.user !== "string" || !insidePath(s.path) || !body) throw whole(`its state[${i}] is not { shop, user, path, content } or { shop, user, path, base64 } inside its directory`);
  });
  return w as unknown as Wagon;
}

/** A column's value as the table takes it: a blob from base64. */
const cellOf = (v: Cell, blob: boolean) => (blob && typeof v === "string" ? Buffer.from(v, "base64") : v);

/**
 * `text` unpacked into `store` under `wagonKey`, whole or not at all: every
 * check in order before a byte is written, then files and state, then the
 * rows in one transaction. The wagon, for its counts; a refusal thrown.
 */
export function unpack(store: Store, text: string, wagonKey: Buffer): Wagon {
  const wagon = readWagon(store, text);

  // 3. An empty town alone: no merge.
  const held = holdings(store);
  if (held.length > 0) throw new StoreError(`this town holds ${listed(held)}; import writes into an empty town alone`);

  // 4. Every sealed value opens under the wagon's key, before any is written.
  const opened = new Map<string, string>();
  const failed: string[] = [];
  let total = 0;
  for (const { key, table } of TABLES) {
    const sealed = SEALED[table];
    if (!sealed) continue;
    for (const row of wagon[key] as Row[]) {
      const value = row[sealed.column];
      if (value === null) continue;
      total++;
      try {
        opened.set(sealed.id(row), openCredential(wagonKey, sealed.id(row), Buffer.from(String(value), "base64")));
      } catch (err) {
        if (!(err instanceof VaultError)) throw err;
        failed.push(sealed.name(row));
      }
    }
  }
  if (failed.length) {
    throw new StoreError(`${failed[0]} does not open under --key; the key is not the one this wagon was packed with, or the wagon is changed; ${failed.length} of ${total} sealed values ${failed.length === 1 ? "does" : "do"} not open`);
  }

  // The writing: files and state first, then every row in one transaction.
  const vaultKey = total > 0 ? store.key.ensure() : null;
  try {
    for (const s of wagon.shops) store.shelf.put(String(s.name), new Map(s.files.map((f) => [f.path, { content: f.content, mode: f.mode }])));
    const states = new Map<string, { shop: string; user: string; files: Map<string, Buffer> }>();
    for (const f of wagon.state) {
      const at = JSON.stringify([f.shop, f.user]);
      if (!states.has(at)) states.set(at, { shop: f.shop, user: f.user, files: new Map() });
      states.get(at)!.files.set(f.path, "base64" in f ? Buffer.from(f.base64, "base64") : Buffer.from(f.content, "utf8"));
    }
    for (const s of states.values()) store.states.put(s.shop, s.user, s.files);
    store.inTransaction(() => {
      // The town's seeded types give way to the wagon's: an empty town holds no other.
      store.sql.run("DELETE FROM credential_types");
      for (const { key, table } of TABLES) {
        const { names, blobs } = columns(store, table);
        const sealed = SEALED[table];
        const insert = `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`;
        for (const row of wagon[key] as Array<Record<string, Cell>>) {
          const values = names.map((c) => (sealed?.column === c && row[c] !== null ? sealCredential(vaultKey!, sealed.id(row), opened.get(sealed.id(row))!) : cellOf(row[c]!, blobs.has(c))));
          store.sql.run(insert, ...values);
        }
      }
    });
  } catch (err) {
    const where = store.dataDir === null ? "delete this box, deploy it again, and import again" : `files may be left under ${path.join(store.dataDir, "shops")} and ${path.join(store.dataDir, "state")}: remove ${store.dataDir} and import again`;
    throw new StoreError(`store import failed while writing, and no row was written: ${(err as Error).message}; ${where}`);
  }
  return wagon;
}

/**
 * The wagon's key for `store export` or `store import`, read from `--key
 * <file>` where townd runs; undefined for any other verb. Export makes a
 * missing file, thirty-two random bytes with mode 600, and says so on
 * stderr; import refuses one. A file of the wrong size is refused as
 * `readKey` refuses a vault key's.
 */
export function wagonKeyOf(p: Parsed, io: Io): Buffer | undefined {
  const [noun, verb] = p.words;
  const file = one(p, "key");
  if (noun !== "store" || (verb !== "export" && verb !== "import")) {
    if (file !== undefined) throw new UsageError("--key is store export's and store import's: the wagon's key");
    return undefined;
  }
  if (file === undefined) throw new UsageError(`store ${verb} needs --key <file>, the wagon's key: ${verb === "export" ? "a file export makes when it is missing, or the key of an earlier wagon" : "the file the wagon was packed with"}`);
  const at = path.resolve(file);
  const key = readKeyFile(at, "a wagon's key", verb === "export" ? "name a path with no file, and export makes the key there" : "name the key file this wagon was packed with");
  if (key !== null) return key;
  if (verb === "import") throw new VaultError(`--key ${file} does not exist; store import opens a wagon under the key it was packed with, and makes none`);
  const made = randomBytes(KEY_BYTES);
  const fd = openSync(at, "wx", 0o600);
  try {
    writeSync(fd, made);
  } finally {
    closeSync(fd);
  }
  io.err(`townd admin: made ${file}, the wagon's key, mode 600; it is the only copy, and without it this wagon's credentials do not open\n`);
  return made;
}

/** `store export` and `store import`, over the store the verb runs over, with the wagon's key `main` read into `over`. */
export async function wagonVerb(over: Over, key: string, args: string[], p: Parsed, io: Io): Promise<number> {
  noExtra(args, 0, key);
  const { store, now } = over;
  if (key === "store export") {
    if (!over.wagonKey) throw new UsageError("store export needs --key <file>, read where townd runs");
    const audit = !p.opts.has("no-audit");
    const from = store.dataDir === null ? (store.getMeta("address") ?? "the box") : path.join(store.dataDir, "town.db");
    const { wagon, left } = pack(store, over.key, over.wagonKey, { audit, now, build: store.dataDir === null ? "box" : "laptop", from });
    io.out(`${JSON.stringify(wagon, null, 2)}\n`);
    io.err(`${countsLine(wagon)}${audit ? "" : `; calls left behind: ${left}`}\n`);
    return 0;
  }
  if (p.opts.has("no-audit")) throw new UsageError("--no-audit is store export's; an import writes what the wagon holds");
  if (!io.stdin || io.stdin.isTTY) throw new StoreError("store import reads a wagon on stdin, and there is none; pipe one in: townd admin store import --key <file> < wagon.json");
  const chunks: Buffer[] = [];
  for await (const chunk of io.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  if (!over.wagonKey) throw new UsageError("store import needs --key <file>, read where townd runs");
  io.err(`${countsLine(unpack(store, Buffer.concat(chunks).toString("utf8"), over.wagonKey))}\n`);
  return 0;
}
