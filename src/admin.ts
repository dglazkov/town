// The admin: the operator's verbs, directly over the store, with the
// server running or not. `townd admin --data <dir> <verb>`, or with
// $TOWN_DATA when --data is absent. `shop test` reads a data directory
// only when given one, for the town's types and a user's credentials.
// A credential's value comes in on stdin and is never printed.

import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { checkGrantShape, parseConstraintLines, type Constraints } from "./constraints.js";
import { shopDir } from "./gate.js";
import { isoTime } from "./notices.js";
import { ManifestRefused, loadShop, testShop } from "./shoptest.js";
import type { RunCredential } from "./runtime.js";
import { StoreError, openStore, type Store } from "./store.js";
import { VaultError, ensureKey, requireKey } from "./vault.js";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Where `credential add` reads the secret; nothing when absent. */
  stdin?: AsyncIterable<Buffer | string> & { isTTY?: boolean };
}

/** The most `credential add` reads from stdin. */
export const SECRET_LIMIT_BYTES = 64 * 1024;

const USAGE = `usage: townd admin [--data <dir>] <verb>
  user add <name> | user ls
  pass new --user <name> --label <text> [--expires <duration>] | pass ls | pass revoke <id>
  grant new --pass <id> --shop <name> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--expires <duration>]
  grant ls [--pass <id>] | grant revoke <id>
  shop add <dir> | shop test <dir> [--user <name>] | shop ls | shop rm <name>
  type add <name> --origin <url> --header '<Name>: <value with {token}>' | type ls | type rm <name>
  credential add --user <name> --type <type> [--label <text>] (the secret on stdin) | credential ls [--user <name>] | credential rm <id>
  audit [--pass <id>] [--shop <name>] [--since <duration>]
durations: <n>d, <n>h, <n>m. --data defaults to $TOWN_DATA.`;

class UsageError extends Error {}

interface Parsed {
  words: string[];
  opts: Map<string, string[]>;
}

const VALUE_FLAGS = ["data", "user", "label", "expires", "pass", "shop", "commands", "constraint", "since", "town", "type", "origin", "header"];

function parse(argv: readonly string[]): Parsed {
  const words: string[] = [];
  const opts = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i]!;
    if (!w.startsWith("--")) {
      words.push(w);
      continue;
    }
    const eq = w.indexOf("=");
    const name = eq === -1 ? w.slice(2) : w.slice(2, eq);
    if (!VALUE_FLAGS.includes(name)) throw new UsageError(`--${name} is not an admin flag`);
    let value: string | undefined = eq === -1 ? argv[++i] : w.slice(eq + 1);
    if (value === undefined) throw new UsageError(`--${name} needs a value`);
    opts.set(name, [...(opts.get(name) ?? []), value]);
  }
  return { words, opts };
}

function one(p: Parsed, name: string, required: true): string;
function one(p: Parsed, name: string, required?: false): string | undefined;
function one(p: Parsed, name: string, required = false): string | undefined {
  const vs = p.opts.get(name);
  if (!vs) {
    if (required) throw new UsageError(`--${name} is required`);
    return undefined;
  }
  if (vs.length > 1) throw new UsageError(`--${name} is given more than once`);
  return vs[0];
}

/** `<n>d`, `<n>h`, or `<n>m` in milliseconds. */
export function parseDuration(text: string): number {
  const m = /^(\d+)([dhm])$/.exec(text);
  if (!m) throw new UsageError(`${text} is not a duration; write one like 30d, 12h, or 45m`);
  const unit = { d: 86_400_000, h: 3_600_000, m: 60_000 }[m[2] as "d" | "h" | "m"];
  return Number(m[1]) * unit;
}

export async function main(argv: readonly string[], io: Io): Promise<number> {
  const now = io.now ?? Date.now;
  let p: Parsed;
  try {
    p = parse(argv);
  } catch (err) {
    io.err(`townd admin: ${(err as Error).message}\n${USAGE}\n`);
    return 1;
  }
  const [noun, verb, ...args] = p.words;
  if (!noun) return usage(io, "no verb given");

  let data: string | undefined;
  try {
    data = one(p, "data") ?? io.env.TOWN_DATA;
  } catch (err) {
    return usage(io, (err as Error).message);
  }

  if (noun === "shop" && verb === "test") {
    if (args.length !== 1) return usage(io, "shop test takes one directory");
    if (data === undefined) {
      if (p.opts.has("user")) return usage(io, "shop test --user needs --data <dir>, or $TOWN_DATA, where the user's credentials are");
      return shopTest(null, args[0]!, p, io);
    }
  }
  if (!data) return usage(io, "needs --data <dir>, or $TOWN_DATA");

  let store: Store | null = null;
  try {
    store = openStore(data);
    const key = requireKey(store.dataDir, store.sealedRows());
    if (noun === "shop" && verb === "test") return await shopTest({ store, key }, args[0]!, p, io);
    return await dispatch(store, noun, verb, args, p, io, now());
  } catch (err) {
    if (err instanceof UsageError) return usage(io, err.message);
    if (err instanceof StoreError || err instanceof VaultError) {
      io.err(`townd admin: ${err.message}\n`);
      return 1;
    }
    throw err;
  } finally {
    store?.close();
  }
}

function usage(io: Io, why: string): number {
  io.err(`townd admin: ${why}\n${USAGE}\n`);
  return 1;
}

function noExtra(args: readonly string[], n: number, what: string): void {
  if (args.length !== n) throw new UsageError(`${what} takes ${n === 0 ? "no words" : n === 1 ? "one word" : `${n} words`}, not ${args.length}`);
}

async function dispatch(store: Store, noun: string, verb: string | undefined, args: string[], p: Parsed, io: Io, now: number): Promise<number> {
  const key = `${noun} ${verb ?? ""}`.trim();
  switch (key) {
    case "user add": {
      noExtra(args, 1, "user add");
      const u = store.addUser(args[0]!, now);
      io.out(`${u.id}\n`);
      return 0;
    }
    case "user ls":
      noExtra(args, 0, "user ls");
      io.out(table(["id", "name", "created"], store.listUsers().map((u) => [u.id, u.name, isoTime(u.createdAt)])));
      return 0;

    case "pass new": {
      noExtra(args, 0, "pass new");
      const expires = one(p, "expires");
      const { pass, token } = store.newPass(one(p, "user", true), one(p, "label", true), expires ? now + parseDuration(expires) : null, now);
      const town = one(p, "town") ?? store.getMeta("address") ?? "http://127.0.0.1:7000";
      io.out(`${JSON.stringify({ town, token }, null, 2)}\n`);
      io.err(`${pass.id}\n`);
      return 0;
    }
    case "pass ls":
      noExtra(args, 0, "pass ls");
      io.out(
        table(
          ["id", "user", "label", "created", "expires", "state", "last use"],
          store.listPasses().map((x) => [x.id, x.userName, x.label, isoTime(x.createdAt), when(x.expiresAt), state(x, now), when(x.lastUse)]),
        ),
      );
      return 0;
    case "pass revoke": {
      noExtra(args, 1, "pass revoke");
      const x = store.revokePass(args[0]!, now);
      io.out(`revoked ${x.id}\n`);
      return 0;
    }

    case "grant new": {
      noExtra(args, 0, "grant new");
      const passId = one(p, "pass", true);
      const shopName = one(p, "shop", true);
      const shop = store.getShop(shopName);
      if (!shop) throw new StoreError(`shop ${shopName} is not in this town; townd admin shop ls lists them`);
      const manifest = shop.manifest;
      const commandsText = one(p, "commands");
      const commands = commandsText === undefined ? manifest.commands.map((c) => c.name) : commandsText.split(",").map((s) => s.trim()).filter(Boolean);
      const parsed = parseConstraintLines(manifest, p.opts.get("constraint") ?? []);
      const refusals = [...parsed.refusals, ...(parsed.refusals.length ? [] : checkGrantShape(manifest, { commands, constraints: parsed.constraints }))];
      if (refusals.length) {
        for (const r of refusals) io.err(`townd admin: grant refused: ${r}\n`);
        return 1;
      }
      const expires = one(p, "expires");
      const g = store.newGrant({ passId, shop: manifest.name, commands, constraints: parsed.constraints, expiresAt: expires ? now + parseDuration(expires) : null }, now);
      io.out(`${g.id}\n`);
      return 0;
    }
    case "grant ls": {
      noExtra(args, 0, "grant ls");
      const rows = store.listGrants(one(p, "pass")).map((g) => [
        g.id,
        g.passId,
        g.shop,
        g.commands.join(","),
        constraintText(g.constraints),
        when(g.expiresAt),
        state(g, now),
        when(g.lastUse),
      ]);
      io.out(table(["id", "pass", "shop", "commands", "constraints", "expires", "state", "last use"], rows));
      return 0;
    }
    case "grant revoke": {
      noExtra(args, 1, "grant revoke");
      const g = store.revokeGrant(args[0]!, now);
      io.out(`revoked ${g.id}\n`);
      return 0;
    }

    case "shop add":
      noExtra(args, 1, "shop add");
      return shopAdd(store, args[0]!, io, now);
    case "shop ls":
      noExtra(args, 0, "shop ls");
      io.out(
        table(
          ["name", "version", "commands", "added"],
          store.listShops().map((s) => [s.name, s.version, s.manifest.commands.map((c) => c.name).join(","), isoTime(s.addedAt)]),
        ),
      );
      return 0;
    case "shop rm": {
      noExtra(args, 1, "shop rm");
      const name = args[0]!;
      if (!store.removeShop(name)) throw new StoreError(`shop ${name} is not in this town; townd admin shop ls lists them`);
      await rm(shopDir(store, name), { recursive: true, force: true });
      io.out(`removed ${name}; its grants now reach nothing, and its state is kept under ${store.stateRoot}\n`);
      return 0;
    }

    case "type add": {
      noExtra(args, 1, "type add");
      const t = store.addType({ name: args[0]!, origin: one(p, "origin", true), header: one(p, "header", true) }, now);
      io.out(`added ${t.name}\n`);
      return 0;
    }
    case "type ls":
      noExtra(args, 0, "type ls");
      io.out(table(["name", "origin", "header", "added"], store.listTypes().map((t) => [t.name, t.origin, t.header, isoTime(t.addedAt)])));
      return 0;
    case "type rm": {
      noExtra(args, 1, "type rm");
      store.removeType(args[0]!);
      io.out(`removed ${args[0]!}\n`);
      return 0;
    }

    case "credential add": {
      noExtra(args, 0, "credential add");
      const userName = one(p, "user", true);
      const type = one(p, "type", true);
      const label = one(p, "label") ?? "";
      if (!store.userByName(userName)) throw new StoreError(`user ${userName} does not exist; add it with townd admin user add ${userName}`);
      if (!store.getType(type)) {
        throw new StoreError(`type ${type} is not a type this town holds; write one of (${store.listTypes().map((t) => t.name).join(", ")}), or add it with townd admin type add`);
      }
      const value = await readSecret(io);
      const c = store.addCredential({ userName, type, label, value }, ensureKey(store.dataDir), now);
      io.out(`${c.id}\n`);
      return 0;
    }
    case "credential ls": {
      noExtra(args, 0, "credential ls");
      const userName = one(p, "user");
      if (userName !== undefined && !store.userByName(userName)) throw new StoreError(`user ${userName} does not exist; townd admin user ls lists them`);
      io.out(
        table(
          ["id", "user", "type", "label", "created", "state", "grants"],
          store.listCredentials(userName).map((c) => [
            c.id,
            c.userName,
            c.type,
            c.label === "" ? "-" : c.label,
            isoTime(c.createdAt),
            c.revokedAt === null ? "active" : "revoked",
            c.grants.length ? c.grants.join(",") : "-",
          ]),
        ),
      );
      return 0;
    }
    case "credential rm": {
      noExtra(args, 1, "credential rm");
      const c = store.revokeCredential(args[0]!, now);
      io.out(`revoked ${c.id}\n`);
      return 0;
    }

    case "audit": {
      if (verb !== undefined) throw new UsageError(`audit takes flags, not ${verb}`);
      const since = one(p, "since");
      const passId = one(p, "pass");
      const shop = one(p, "shop");
      const rows = store.calls({
        ...(passId ? { passId } : {}),
        ...(shop ? { shop } : {}),
        ...(since ? { since: now - parseDuration(since) } : {}),
      });
      io.out(
        table(
          ["at", "pass", "shop", "command", "argv sha256", "result", "exit", "shop exit", "ms", "notices", "detail"],
          rows.map((c) => [
            isoTime(c.at),
            c.passId ?? "-",
            c.shop ?? "-",
            c.command ?? "-",
            c.argvHash,
            c.result,
            String(c.exit),
            c.shopExit === null ? "-" : String(c.shopExit),
            String(c.latencyMs),
            c.notices.length ? c.notices.join(",") : "-",
            c.detail ?? "-",
          ]),
        ),
      );
      return 0;
    }
  }
  throw new UsageError(`${key} is not a verb`);
}

function when(ms: number | null): string {
  return ms === null ? "-" : isoTime(ms);
}

function state(x: { revokedAt: number | null; expiresAt: number | null }, now: number): string {
  if (x.revokedAt !== null) return "revoked";
  if (x.expiresAt !== null && x.expiresAt <= now) return "expired";
  return "active";
}

function constraintText(c: Constraints): string {
  const parts: string[] = [];
  for (const [target, rules] of Object.entries(c)) {
    for (const [kind, rule] of Object.entries(rules)) parts.push(`${target} ${kind} ${Array.isArray(rule) ? rule.join(",") : String(rule)}`);
  }
  return parts.length ? parts.join("; ") : "-";
}

function table(header: string[], rows: string[][]): string {
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map((r) => (r[i] ?? "").length)));
  return all.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i]!))).join("  ").trimEnd()).join("\n") + "\n";
}

/**
 * The whole of stdin, less one trailing newline ("\n" or "\r\n"). Never
 * an argument and never the environment: a secret there would be in a
 * shell's history or a process list.
 */
async function readSecret(io: Io): Promise<string> {
  if (!io.stdin) throw new StoreError("credential add reads the secret on stdin, and there is none; pipe the secret in");
  if (io.stdin.isTTY) io.err("townd admin: reading the secret from stdin until end of input (Ctrl-D)\n");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of io.stdin) {
    const b = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    size += b.length;
    if (size > SECRET_LIMIT_BYTES) throw new StoreError(`credential add read more than ${SECRET_LIMIT_BYTES} bytes on stdin, more than a credential; pipe the secret alone`);
    chunks.push(b);
  }
  let value = Buffer.concat(chunks).toString("utf8");
  if (value.endsWith("\r\n")) value = value.slice(0, -2);
  else if (value.endsWith("\n")) value = value.slice(0, -1);
  if (value === "") throw new StoreError("credential add read nothing on stdin; pipe the secret in, since it is never an argument");
  return value;
}

/**
 * `shop test <dir> [--user <name>]`: the shop's tests, one line each. With
 * no data directory, a manifest with needs is refused naming --data. With
 * one, needs are checked against the town's types, and each is met by the
 * user's one live credential of the type, opened for the run and handed
 * to the runtime, which opens a teller per need.
 */
async function shopTest(town: { store: Store; key: Buffer | null } | null, dir: string, p: Parsed, io: Io): Promise<number> {
  const refuse = (line: string) => {
    io.err(`townd admin: shop test refused: ${line}\n`);
    return 1;
  };
  try {
    if (!town) return report(await testShop(dir), io);
    const { store, key } = town;
    const types = store.listTypes();
    const manifest = await loadShop(dir, types.map((t) => t.name));
    const met = meetNeeds(store, key, manifest.name, (manifest.credentials ?? []).map((n) => n.type), one(p, "user"));
    if (typeof met === "string") return refuse(met);
    return report(await testShop(dir, { types: types.map((t) => t.name), credentials: met }), io);
  } catch (err) {
    if (err instanceof ManifestRefused) {
      for (const line of err.refusals) io.err(`${line}\n`);
      return 1;
    }
    throw err;
  }
}

function report(results: Array<{ name: string; ok: boolean; why?: string }>, io: Io): number {
  for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
  return results.every((r) => r.ok) ? 0 : 1;
}

/** The credentials that meet `needs` on `userName`'s behalf, opened; or the line refusing. */
function meetNeeds(store: Store, key: Buffer | null, shop: string, needs: string[], userName: string | undefined): RunCredential[] | string {
  if (needs.length === 0) {
    return userName === undefined ? [] : `${shop} has no credentials to meet; leave out --user`;
  }
  if (userName === undefined) {
    return `${shop} needs ${needs.join(", ")}; write --user <name> for whose credential${needs.length === 1 ? "" : "s"} its tests run on`;
  }
  const user = store.userByName(userName);
  if (!user) return `user ${userName} does not exist; townd admin user ls lists them`;
  const out: RunCredential[] = [];
  for (const type of needs) {
    const held = store.liveCredentials(user.id, type);
    if (held.length === 0) return `user ${userName} holds no ${type} credential; add one with townd admin credential add`;
    if (held.length > 1) {
      return `user ${userName} holds ${held.length} ${type} credentials (${held.map((c) => c.id).join(", ")}); choosing one with --credential comes with grants in vault phase 1, so remove all but one with townd admin credential rm`;
    }
    const t = store.getType(type)!;
    if (!key) throw new VaultError(`the vault's key is missing and credential ${held[0]!.id} is sealed by it`);
    out.push({ type, origin: t.origin, header: t.header, token: store.openCredential(held[0]!.id, key) });
  }
  return out;
}

/**
 * Anything in a shop directory that is not a plain file or a directory:
 * a symbolic link could reach outside the shop once copied, so it is
 * refused, and so is a socket or a pipe. Paths relative to `root`.
 */
export async function strangeEntries(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const st = await lstat(full);
      if (st.isDirectory()) await walk(full);
      else if (!st.isFile()) out.push(path.relative(root, full));
    }
  };
  await walk(root);
  return out;
}

/**
 * `shop add <dir>`: refuse links, validate the manifest, copy the
 * directory to a staging place under the data directory, run the shop's
 * tests against the copy (the code that will run), then put the copy in
 * place and upsert the row. Latest only: a second add replaces the first.
 */
async function shopAdd(store: Store, dir: string, io: Io, now: number): Promise<number> {
  const src = path.resolve(dir);
  const refuse = (line: string) => {
    io.err(`townd admin: shop add refused: ${line}\n`);
    return 1;
  };
  const st = await lstat(src).catch(() => null);
  if (!st?.isDirectory()) return refuse(`${dir} is not a directory; write the path of a shop's directory`);
  const strange = await strangeEntries(src);
  if (strange.length) {
    return refuse(`${strange.map((s) => path.join(dir, s)).join(", ")} ${strange.length === 1 ? "is" : "are"} not a plain file; a shop is copied whole into the town, so put the file itself there instead of a link`);
  }
  const types = store.listTypes().map((t) => t.name);
  try {
    const manifest = await loadShop(src, types);
    const needs = (manifest.credentials ?? []).map((n) => n.type);
    if (needs.length) {
      return refuse(`${manifest.name} needs ${needs.join(", ")}, and adding a shop with needs runs its tests on a user's credentials with --user, which comes with vault phase 1`);
    }
  } catch (err) {
    if (err instanceof ManifestRefused) {
      for (const line of err.refusals) io.err(`${line}\n`);
      return refuse(`the manifest has ${err.refusals.length === 1 ? "a mistake" : `${err.refusals.length} mistakes`}, above`);
    }
    throw err;
  }

  await mkdir(store.shopsDir, { recursive: true });
  const staging = path.join(store.shopsDir, `.staging-${randomBytes(6).toString("hex")}`);
  try {
    await cp(src, staging, {
      recursive: true,
      verbatimSymlinks: true,
      filter: async (from) => {
        const s = await lstat(from);
        if (!s.isDirectory() && !s.isFile()) throw new StoreError(`${from} became something other than a plain file while it was copied`);
        return true;
      },
    });
    const late = await strangeEntries(staging);
    if (late.length) return refuse(`${late.join(", ")} is not a plain file in the copy`);
    const manifest = await loadShop(staging, types);
    if (manifest.credentials?.length) return refuse(`${manifest.name} gained needs while it was copied`);
    const results = await testShop(staging, { types });
    for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
    const failing = results.filter((r) => !r.ok);
    if (failing.length) {
      return refuse(`${manifest.name}'s test${failing.length === 1 ? "" : "s"} ${failing.map((r) => `'${r.name}'`).join(", ")} failed; fix the shop and add it again`);
    }
    const final = shopDir(store, manifest.name);
    const old = `${staging}-old`;
    const had = await lstat(final).then(() => true, () => false);
    if (had) await rename(final, old);
    await rename(staging, final);
    store.upsertShop(manifest, now);
    if (had) await rm(old, { recursive: true, force: true });
    io.out(`added ${manifest.name} ${manifest.version}\n`);
    return 0;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
