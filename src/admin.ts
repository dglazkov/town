// The admin: the operator's verbs, directly over the store, with the
// server running or not. `townd admin --data <dir> <verb>`, or with
// $TOWN_DATA when --data is absent. `shop test` reads a data directory
// only when given one, for the town's types and shops and a user's
// credentials; a shop with dependencies is refused without one.
// A credential's value comes in on stdin and is never printed. Every shop
// in the town has every dependency it declares: `shop add` and `shop rm`
// refuse what would break that, and `grant new` at a composed shop waits
// for the pass to hold its dependencies.

import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { checkGrantShape, parseConstraintLines, type Constraints } from "./constraints.js";
import { shopDir } from "./gate.js";
import { isoTime } from "./notices.js";
import { ManifestRefused, loadShop, testShop, townShops, treeOf } from "./shoptest.js";
import type { RunCredential } from "./runtime.js";
import type { Manifest } from "./manifest.js";
import { StoreError, openStore, type CallRow, type Grant, type GrantState, type Store, type User } from "./store.js";
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
  grant new --pass <id> --shop <name> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--expires <duration>] [--credential <id>]...
  grant ls [--pass <id>] | grant revoke <id>
  shop add <dir> [--user <name> [--credential <id>]...] | shop test <dir> [--user <name> [--credential <id>]...] | shop ls | shop rm <name>
  type add <name> --origin <url> --header '<Name>: <value with {token}>' | type ls | type rm <name>
  credential add --user <name> --type <type> [--label <text>] (the secret on stdin) | credential ls [--user <name>] | credential rm <id>
  audit [--pass <id>] [--shop <name>] [--since <duration>] | audit --call <id>
durations: <n>d, <n>h, <n>m. --data defaults to $TOWN_DATA.`;

class UsageError extends Error {}

interface Parsed {
  words: string[];
  opts: Map<string, string[]>;
}

const VALUE_FLAGS = ["data", "user", "label", "expires", "pass", "shop", "commands", "constraint", "since", "town", "type", "origin", "header", "credential", "call"];

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
    return await dispatch(store, key, noun, verb, args, p, io, now());
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

async function dispatch(store: Store, vaultKey: Buffer | null, noun: string, verb: string | undefined, args: string[], p: Parsed, io: Io, now: number): Promise<number> {
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
      const pass = store.passById(passId);
      if (!pass) throw new StoreError(`pass ${passId} does not exist; townd admin pass ls lists them`);
      const uncovered = uncoveredDependency(store, passId, manifest, now);
      if (uncovered) {
        io.err(`townd admin: grant refused: ${uncovered}\n`);
        return 1;
      }
      const bound = bindNeeds(store, store.userByName(pass.userName)!, manifest.name, needsOf(manifest), p.opts.get("credential") ?? []);
      if (typeof bound === "string") {
        io.err(`townd admin: grant refused: ${bound}\n`);
        return 1;
      }
      const expires = one(p, "expires");
      const g = store.newGrant(
        { passId, shop: manifest.name, commands, constraints: parsed.constraints, expiresAt: expires ? now + parseDuration(expires) : null, credentials: bound },
        now,
      );
      io.out(`${g.id}\n`);
      return 0;
    }
    case "grant ls": {
      noExtra(args, 0, "grant ls");
      const rows = store.listGrants(one(p, "pass"), now).map((g) => [
        g.id,
        g.passId,
        g.shop,
        g.commands.join(","),
        constraintText(g.constraints),
        bindingText(g.credentials),
        when(g.expiresAt),
        grantStateText(store, g, g.state, now),
        when(g.lastUse),
      ]);
      io.out(table(["id", "pass", "shop", "commands", "constraints", "credentials", "expires", "state", "last use"], rows));
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
      return shopAdd(store, vaultKey, args[0]!, p, io, now);
    case "shop ls":
      noExtra(args, 0, "shop ls");
      io.out(
        table(
          ["name", "version", "commands", "depends", "added"],
          store.listShops().map((s) => [s.name, s.version, s.manifest.commands.map((c) => c.name).join(","), dependsText(s.manifest), isoTime(s.addedAt)]),
        ),
      );
      return 0;
    case "shop rm": {
      noExtra(args, 1, "shop rm");
      const name = args[0]!;
      const dependents = dependentsOf(store, name);
      if (dependents.length) {
        io.err(`townd admin: shop rm refused: ${dependents.map((d) => d.name).join(", ")} ${dependents.length === 1 ? "depends" : "depend"} on ${name}; remove ${dependents.length === 1 ? "it" : "them"} first, or add ${dependents.length === 1 ? "it" : "them"} again without ${name}\n`);
        return 1;
      }
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
      const held = store.credentialById(args[0]!);
      const liveBefore = held ? store.liveOf(held.grants, now) : [];
      const c = store.revokeCredential(args[0]!, now);
      io.out(`revoked ${c.id}\n`);
      const stillLive = store.liveOf(liveBefore, now);
      for (const id of liveBefore.filter((g) => !stillLive.includes(g))) {
        io.out(`${id} at ${store.grantById(id)!.shop} is no longer live\n`);
      }
      return 0;
    }

    case "audit": {
      if (verb !== undefined) throw new UsageError(`audit takes flags, not ${verb}`);
      const since = one(p, "since");
      const passId = one(p, "pass");
      const shop = one(p, "shop");
      const callId = one(p, "call");
      if (callId !== undefined) {
        if (since !== undefined || passId !== undefined || shop !== undefined) throw new UsageError("audit --call takes no other flag; it prints one call and every call made in its service");
        const tree = store.callTree(callId);
        if (tree.length === 0) throw new StoreError(`call ${callId} is not in the audit; townd admin audit lists the calls with their ids`);
        // The tree: the call column first, indented two spaces a level.
        const at = AUDIT_HEADER.indexOf("call");
        const without = <T,>(xs: T[]) => xs.filter((_, i) => i !== at);
        io.out(table(["call", ...without(AUDIT_HEADER)], tree.map((c) => [`${"  ".repeat(c.depth)}${c.callId}`, ...without(auditRow(c))])));
        return 0;
      }
      const rows = store.calls({
        ...(passId ? { passId } : {}),
        ...(shop ? { shop } : {}),
        ...(since ? { since: now - parseDuration(since) } : {}),
      });
      io.out(table(AUDIT_HEADER, rows.map(auditRow)));
      return 0;
    }
  }
  throw new UsageError(`${key} is not a verb`);
}

const AUDIT_HEADER = ["at", "pass", "shop", "command", "argv sha256", "result", "exit", "shop exit", "ms", "notices", "credentials", "call", "parent", "detail"];

/** One audit row's cells, in AUDIT_HEADER's order. */
function auditRow(c: CallRow): string[] {
  return [
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
    c.credentials.length ? c.credentials.map((x) => `${x.type}:${x.requests}`).join(",") : "-",
    c.callId,
    c.parent ?? "-",
    c.detail ?? "-",
  ];
}

/** A manifest's dependencies as `<shop>[a,b]`, space-separated; `-` when none. */
function dependsText(m: Manifest): string {
  const parts = (m.depends ?? []).map((d) => `${d.shop}[${d.commands.join(",")}]`);
  return parts.length ? parts.join(" ") : "-";
}

/** The shops in the town, other than `name`, that declare a dependency on it. */
function dependentsOf(store: Store, name: string): Array<{ name: string; commands: string[] }> {
  return store
    .listShops()
    .filter((s) => s.name !== name)
    .flatMap((s) => (s.manifest.depends ?? []).filter((d) => d.shop === name).map((d) => ({ name: s.name, commands: d.commands })));
}

/**
 * Why a grant at `manifest`'s shop may not be made for the pass yet: the
 * first dependency the pass holds no live grant at covering its declared
 * commands, in the words that say which and the verb that fixes it; null
 * when every one is covered.
 */
function uncoveredDependency(store: Store, passId: string, manifest: Manifest, now: number): string | null {
  const live = store.grantsForPass(passId, now);
  for (const dep of manifest.depends ?? []) {
    const held = live.filter((g) => g.shop === dep.shop);
    if (held.some((g) => dep.commands.every((c) => g.commands.includes(c)))) continue;
    if (held.length === 0) {
      return `pass ${passId} holds no grant at ${dep.shop} covering ${dep.commands.join(", ")}; grant one with townd admin grant new --pass ${passId} --shop ${dep.shop} --commands ${dep.commands.join(",")} first`;
    }
    const g = held[0]!;
    const missing = dep.commands.filter((c) => !g.commands.includes(c));
    return `pass ${passId}'s grant ${g.id} at ${dep.shop} lacks ${missing.join(", ")}, which ${manifest.name} calls; revoke it and grant one that has ${missing.length === 1 ? "it" : "them"}`;
  }
  return null;
}

/**
 * Why adding `manifest` would break the rule that every shop in the town
 * has every dependency it declares: a loop through the town's shops back
 * to it, or a command a dependent declares of it that it no longer has.
 * Null when neither.
 */
function breaksDependents(store: Store, manifest: Manifest): string | null {
  const name = manifest.name;
  const byName = new Map(store.listShops().map((s) => [s.name, s.manifest]));
  byName.set(name, manifest);
  const walk = (at: string, trail: string[]): string[] | null => {
    for (const d of byName.get(at)?.depends ?? []) {
      if (d.shop === name) return [...trail, name];
      if (trail.includes(d.shop)) continue;
      const found = walk(d.shop, [...trail, d.shop]);
      if (found) return found;
    }
    return null;
  };
  const loop = walk(name, [name]);
  if (loop) {
    return `${name} would close a loop, ${loop.join(" -> ")}; a shop cannot depend on a shop that depends on it, so take ${loop[1]} out of its depends`;
  }
  const commands = manifest.commands.map((c) => c.name);
  const dropped = dependentsOf(store, name).map((d) => ({ ...d, missing: d.commands.filter((c) => !commands.includes(c)) })).filter((d) => d.missing.length);
  if (dropped.length) {
    const said = dropped.map((d) => `${d.name} calls ${d.missing.join(", ")}`).join("; ");
    return `${name} would not have every command its dependents declare of it: ${said}; keep ${dropped.length === 1 && dropped[0]!.missing.length === 1 ? "it" : "them"} in ${name}, or add ${dropped.map((d) => d.name).join(", ")} again without ${dropped.length === 1 && dropped[0]!.missing.length === 1 ? "it" : "them"} first`;
  }
  return null;
}

function when(ms: number | null): string {
  return ms === null ? "-" : isoTime(ms);
}

function state(x: { revokedAt: number | null; expiresAt: number | null }, now: number): string {
  if (x.revokedAt !== null) return "revoked";
  if (x.expiresAt !== null && x.expiresAt <= now) return "expired";
  return "active";
}

/** A grant's state in `grant ls`: live, revoked, expired, or not live and why. */
function grantStateText(store: Store, g: Grant, st: GrantState, now: number): string {
  if (st.kind === "lacks") {
    const held = store.grantsForPass(g.passId, now).some((x) => x.shop === st.shop);
    return held ? `not live: ${st.shop} lacks ${st.commands.join(", ")}` : `not live: ${st.shop} not granted`;
  }
  if (st.kind !== "unmet") return st.kind;
  const id = g.credentials[st.type];
  if (id === undefined) return `not live: no ${st.type} bound`;
  return store.credentialById(id)?.revokedAt != null ? `not live: ${id} removed` : `not live: ${st.type} unmet`;
}

/** A grant's bindings as `<type>=<id>`, comma-separated; `-` when none. */
function bindingText(b: Record<string, string>): string {
  const parts = Object.entries(b).map(([type, id]) => `${type}=${id}`);
  return parts.length ? parts.join(",") : "-";
}

function needsOf(manifest: { credentials?: Array<{ type: string }> }): string[] {
  return (manifest.credentials ?? []).map((n) => n.type);
}

/**
 * For each need, the credential of `user` that meets it: the one given
 * with --credential, or the user's one unrevoked credential of the type.
 * Returns the binding, `{ "<type>": "<credential id>" }`, or the line
 * refusing: none of the type, several and none picked, or a picked
 * credential that is not the user's, is removed, or meets no need.
 */
function bindNeeds(store: Store, user: User, shop: string, needs: string[], picked: readonly string[]): Record<string, string> | string {
  if (needs.length === 0 && picked.length) return `${shop} has no credentials to meet, so --credential binds nothing; leave it out`;
  const chosen = new Map<string, string>();
  for (const id of picked) {
    const c = store.credentialById(id);
    if (!c || c.userId !== user.id) return `--credential ${id} is not a credential of user ${user.name}; townd admin credential ls --user ${user.name} lists them`;
    if (c.revokedAt !== null) return `--credential ${id} is removed; townd admin credential ls --user ${user.name} lists the ones that are not`;
    if (!needs.includes(c.type)) return `--credential ${id} is a ${c.type} credential, and ${shop} needs ${needs.join(", ")}`;
    if (chosen.has(c.type)) return `--credential names two ${c.type} credentials (${chosen.get(c.type)}, ${id}); give one per need`;
    chosen.set(c.type, id);
  }
  const out: Record<string, string> = {};
  for (const type of needs) {
    const pick = chosen.get(type);
    if (pick !== undefined) {
      out[type] = pick;
      continue;
    }
    const held = store.liveCredentials(user.id, type);
    if (held.length === 0) return `user ${user.name} holds no ${type} credential; add one with townd admin credential add`;
    if (held.length > 1) return `user ${user.name} holds ${held.length} ${type} credentials (${held.map((c) => c.id).join(", ")}); pick one with --credential <id>`;
    out[type] = held[0]!.id;
  }
  return out;
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
 * no data directory, a manifest with needs or dependencies is refused
 * naming --data. With one, needs are checked against the town's types and
 * dependencies against its shops, and each need of the tree, the shop's
 * and its dependencies', is met by the user's one live credential of the
 * type, opened for the run and handed to the runtime, which opens a teller
 * per need. The tree runs over the dependencies' code in the town.
 */
async function shopTest(town: { store: Store; key: Buffer | null } | null, dir: string, p: Parsed, io: Io): Promise<number> {
  const refuse = (line: string) => {
    io.err(`townd admin: shop test refused: ${line}\n`);
    return 1;
  };
  try {
    if (!town) return report(await testShop(dir), io);
    const { store, key } = town;
    const types = store.listTypes().map((t) => t.name);
    const shops = townShops(store);
    const manifest = await loadShop(dir, types, shops);
    const met = meetNeeds(store, key, manifest.name, treeOf(manifest, store).needs, one(p, "user"), p.opts.get("credential") ?? []);
    if (typeof met === "string") return refuse(met);
    return report(await testShop(dir, { types, shops, store, credentials: met }), io);
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

/** The credentials that meet `needs` on `userName`'s behalf (bindNeeds), opened; or the line refusing. */
function meetNeeds(store: Store, key: Buffer | null, shop: string, needs: string[], userName: string | undefined, picked: readonly string[]): RunCredential[] | string {
  if (needs.length === 0) {
    if (userName !== undefined) return `${shop} has no credentials to meet; leave out --user`;
    return picked.length ? `${shop} has no credentials to meet, so --credential binds nothing; leave it out` : [];
  }
  if (userName === undefined) {
    return `${shop} needs ${needs.join(", ")}; write --user <name> for whose credential${needs.length === 1 ? "" : "s"} its tests run on`;
  }
  const user = store.userByName(userName);
  if (!user) return `user ${userName} does not exist; townd admin user ls lists them`;
  const bound = bindNeeds(store, user, shop, needs, picked);
  if (typeof bound === "string") return bound;
  const out: RunCredential[] = [];
  for (const type of needs) {
    const t = store.getType(type)!;
    if (!key) throw new VaultError(`the vault's key is missing and credential ${bound[type]!} is sealed by it`);
    out.push({ type, origin: t.origin, header: t.header, token: store.openCredential(bound[type]!, key) });
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
 * `shop add <dir> [--user <name>]`: refuse links, validate the manifest,
 * meet its needs with the user's credentials as `shop test` does, copy the
 * directory to a staging place under the data directory, run the shop's
 * tests against the copy (the code that will run), then put the copy in
 * place and upsert the row. Latest only: a second add replaces the first,
 * and when it adds a need, the grants that stop being live are named.
 */
async function shopAdd(store: Store, key: Buffer | null, dir: string, p: Parsed, io: Io, now: number): Promise<number> {
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
  const shops = townShops(store);
  let needs: string[];
  let credentials: RunCredential[];
  try {
    const manifest = await loadShop(src, types, shops);
    const broken = breaksDependents(store, manifest);
    if (broken) return refuse(broken);
    needs = treeOf(manifest, store).needs;
    const met = meetNeeds(store, key, manifest.name, needs, one(p, "user"), p.opts.get("credential") ?? []);
    if (typeof met === "string") return refuse(met);
    credentials = met;
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
    const manifest = await loadShop(staging, types, shops);
    if (treeOf(manifest, store).needs.join(",") !== needs.join(",")) return refuse(`${manifest.name} changed its needs while it was copied`);
    const brokenInCopy = breaksDependents(store, manifest);
    if (brokenInCopy) return refuse(brokenInCopy);
    const results = await testShop(staging, { types, shops, store, ...(credentials.length ? { credentials } : {}) });
    for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
    const failing = results.filter((r) => !r.ok);
    if (failing.length) {
      return refuse(`${manifest.name}'s test${failing.length === 1 ? "" : "s"} ${failing.map((r) => `'${r.name}'`).join(", ")} failed; fix the shop and add it again`);
    }
    const final = shopDir(store, manifest.name);
    const old = `${staging}-old`;
    const had = await lstat(final).then(() => true, () => false);
    const liveBefore = store.liveGrantsAt(manifest.name, now).map((g) => g.id);
    if (had) await rename(final, old);
    await rename(staging, final);
    store.upsertShop(manifest, now);
    if (had) await rm(old, { recursive: true, force: true });
    io.out(`added ${manifest.name} ${manifest.version}\n`);
    const stillLive = store.liveOf(liveBefore, now);
    const stopped = liveBefore.filter((id) => !stillLive.includes(id));
    if (stopped.length) {
      const states = stopped.map((id) => ({ id, state: store.grantState(id, now)! }));
      for (const { id, state } of states) {
        const why = state.kind === "lacks" ? `${grantStateText(store, store.grantById(id)!, state, now).replace(/^not live: /, "")}, a dependency the shop gained` : "it binds no credential for a need the shop gained";
        io.out(`${id} at ${manifest.name} is no longer live: ${why}\n`);
      }
      if (states.some((x) => x.state.kind === "unmet")) io.out(`a grant made again with townd admin grant new binds a credential for each need\n`);
    }
    return 0;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
