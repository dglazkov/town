// The admin: the operator's verbs, directly over the store, with the
// server running or not. `townd admin --data <dir> <verb>`, or with
// $TOWN_DATA when --data is absent. `shop test` reads no data directory.

import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { checkGrantShape, parseConstraintLines, type Constraints } from "./constraints.js";
import { shopDir } from "./gate.js";
import { isoTime } from "./notices.js";
import { ManifestRefused, loadShop, testShop } from "./shoptest.js";
import { StoreError, openStore, type Store } from "./store.js";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env: NodeJS.ProcessEnv;
  now?: () => number;
}

const USAGE = `usage: townd admin [--data <dir>] <verb>
  user add <name> | user ls
  pass new --user <name> --label <text> [--expires <duration>] | pass ls | pass revoke <id>
  grant new --pass <id> --shop <name> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--expires <duration>]
  grant ls [--pass <id>] | grant revoke <id>
  shop add <dir> | shop test <dir> | shop ls | shop rm <name>
  audit [--pass <id>] [--shop <name>] [--since <duration>]
durations: <n>d, <n>h, <n>m. --data defaults to $TOWN_DATA.`;

class UsageError extends Error {}

interface Parsed {
  words: string[];
  opts: Map<string, string[]>;
}

const VALUE_FLAGS = ["data", "user", "label", "expires", "pass", "shop", "commands", "constraint", "since", "town"];

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

  if (noun === "shop" && verb === "test") {
    if (args.length !== 1) return usage(io, "shop test takes one directory");
    return shopTest(args[0]!, io);
  }
  if (!noun) return usage(io, "no verb given");

  let data: string | undefined;
  try {
    data = one(p, "data") ?? io.env.TOWN_DATA;
  } catch (err) {
    return usage(io, (err as Error).message);
  }
  if (!data) return usage(io, "needs --data <dir>, or $TOWN_DATA");

  const store = openStore(data);
  try {
    return await dispatch(store, noun, verb, args, p, io, now());
  } catch (err) {
    if (err instanceof UsageError) return usage(io, err.message);
    if (err instanceof StoreError) {
      io.err(`townd admin: ${err.message}\n`);
      return 1;
    }
    throw err;
  } finally {
    store.close();
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

async function shopTest(dir: string, io: Io): Promise<number> {
  try {
    const results = await testShop(dir);
    for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
    return results.every((r) => r.ok) ? 0 : 1;
  } catch (err) {
    if (err instanceof ManifestRefused) {
      for (const line of err.refusals) io.err(`${line}\n`);
      return 1;
    }
    throw err;
  }
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
  try {
    await loadShop(src);
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
    const manifest = await loadShop(staging);
    const results = await testShop(staging);
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
