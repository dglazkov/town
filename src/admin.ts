// The admin: the operator's verbs, directly over the store, with the
// server running or not. `townd admin --data <dir> <verb>`, or with
// $TOWN_DATA when --data is absent. `shop test` reads a data directory
// only when given one, for the town's types and shops and a user's
// credentials; a shop with dependencies is refused without one.
// A credential's value comes in on stdin and is never printed. Every shop
// in the town has every dependency it declares: `shop add` and `shop rm`
// refuse what would break that, and `grant new` at a composed shop waits
// for the pass to hold its dependencies. `shop test` and `shop add` are
// src/publish.ts; `grant new`'s checks are src/grants.ts, and `permit
// approve` makes an agent's proposed grant through them. The hall is the
// town's own shop: `shop rm` refuses it, as `shop add` refuses its name.

import { rm } from "node:fs/promises";
import type { CallRow } from "./audit.js";
import { shopDir } from "./gate.js";
import { approvePermit, bindingText, checkGrant, constraintText, grantStateText, permitTable } from "./grants.js";
import { table } from "./help.js";
import { HALL_NAME, type Manifest } from "./manifest.js";
import { isoTime } from "./notices.js";
import { dependentsOf, shopAdd, shopTest, type Picked } from "./publish.js";
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
  grant new --pass <id> --shop <name> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--expires <duration>] [--credential <id>]...
  grant ls [--pass <id>] | grant revoke <id>
  permit ls [--pass <id>] | permit approve <id> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--credential <id>]... [--expires <duration>] | permit deny <id>
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

/** `--user`, read when a shop's tests need it, and the `--credential` ids. */
function picked(p: Parsed): Picked {
  return { user: () => one(p, "user"), credentials: p.opts.get("credential") ?? [] };
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
      return shopTest(null, args[0]!, picked(p), io);
    }
  }
  if (!data) return usage(io, "needs --data <dir>, or $TOWN_DATA");

  let store: Store | null = null;
  try {
    store = openStore(data);
    const key = requireKey(store.dataDir, store.sealedRows());
    if (noun === "shop" && verb === "test") return await shopTest({ store, key }, args[0]!, picked(p), io);
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
      const checked = checkGrant(
        store,
        { passId: one(p, "pass", true), shop: one(p, "shop", true), commands: one(p, "commands"), constraints: p.opts.get("constraint") ?? [], credentials: p.opts.get("credential") ?? [] },
        now,
      );
      if (Array.isArray(checked)) {
        for (const r of checked) io.err(`townd admin: grant refused: ${r}\n`);
        return 1;
      }
      const expires = one(p, "expires");
      const g = store.newGrant({ ...checked, expiresAt: expires ? now + parseDuration(expires) : null }, now);
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
        g.source ?? "-",
        constraintText(g.constraints),
        bindingText(g.credentials),
        when(g.expiresAt),
        grantStateText(store, g, g.state, now),
        when(g.lastUse),
      ]);
      io.out(table(["id", "pass", "shop", "commands", "source", "constraints", "credentials", "expires", "state", "last use"], rows));
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
      return shopAdd(store, vaultKey, args[0]!, picked(p), io, now);
    case "shop ls":
      noExtra(args, 0, "shop ls");
      io.out(
        table(
          ["name", "version", "owner", "commands", "depends", "added"],
          store.listShops().map((s) => [s.name, s.version, s.ownerName ?? "-", s.manifest.commands.map((c) => c.name).join(","), dependsText(s.manifest), isoTime(s.addedAt)]),
        ),
      );
      return 0;
    case "shop rm": {
      noExtra(args, 1, "shop rm");
      const name = args[0]!;
      if (name === HALL_NAME) {
        io.err(`townd admin: shop rm refused: ${HALL_NAME} is the town's own shop, in every town from its first open; revoke the grants at it instead\n`);
        return 1;
      }
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

    case "permit ls":
      noExtra(args, 0, "permit ls");
      io.out(permitTable(store, store.listPermits(one(p, "pass")), true));
      return 0;
    case "permit approve": {
      noExtra(args, 1, "permit approve");
      const expires = one(p, "expires");
      const made = approvePermit(
        store,
        args[0]!,
        { commands: one(p, "commands"), constraints: p.opts.get("constraint") ?? [], credentials: p.opts.get("credential") ?? [], expiresAt: expires ? now + parseDuration(expires) : null },
        now,
      );
      if (Array.isArray(made)) {
        for (const r of made) io.err(`townd admin: permit approve refused: ${r}\n`);
        io.err(`townd admin: ${args[0]!} is still pending\n`);
        return 1;
      }
      if (made.revoked) io.out(`revoked ${made.revoked.id} at ${made.revoked.shop}, which ${args[0]!} replaces\n`);
      io.out(`${made.grant.id}\n`);
      return 0;
    }
    case "permit deny": {
      noExtra(args, 1, "permit deny");
      const permit = store.decidePermit(args[0]!, "denied", null, now);
      io.out(`denied ${permit.id}\n`);
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

function when(ms: number | null): string {
  return ms === null ? "-" : isoTime(ms);
}

function state(x: { revokedAt: number | null; expiresAt: number | null }, now: number): string {
  if (x.revokedAt !== null) return "revoked";
  if (x.expiresAt !== null && x.expiresAt <= now) return "expired";
  return "active";
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
