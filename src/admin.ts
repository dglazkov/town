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
// Before any verb, `main` resolves the wall through the chooser it is
// given, `--wall <kind>` or the box's, and a refusal ends it there; `shop
// test` and `shop add` run the shop's tests within that wall, hiding the
// data directory when there is one. A type a shop proposed is held by
// no credential until `type approve`; `permit show` prints the checklist
// from a pending permit to its grant, and `permit approve` at a shop with
// needs checks in its order, runs the shop's tests on the credentials
// chosen when they have not run on its code, and on a refusal prints the
// checklist that remains. The type and credential verbs are src/secrets.ts.

import { rm } from "node:fs/promises";
import type { CallRow } from "./audit.js";
import { shopDir } from "./gate.js";
import { checklist, todoBlock } from "./checklist.js";
import { bindingText, checkGrant, checkPermit, constraintText, grantStateText, makePermitGrant, needsOf, permitTable } from "./grants.js";
import { table } from "./help.js";
import { HALL_NAME, type Manifest } from "./manifest.js";
import { isoTime } from "./notices.js";
import { dependentsOf, shopAdd, shopTest, testAtApproval, type Picked } from "./publish.js";
import { secretVerb } from "./secrets.js";
import { decideAndRecord } from "./server.js";
import { StoreError, openStore, type Store } from "./store.js";
import { VaultError, requireKey } from "./vault.js";
import type { Wall } from "./wall.js";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Where `credential add` reads the secret; nothing when absent. */
  stdin?: AsyncIterable<Buffer | string> & { isTTY?: boolean };
}

/**
 * Resolves `--wall <kind>`, or the box's wall when absent, to a way to open
 * that wall once the data directory is known, or to a refusal's words:
 * townd's `chooseWall`, or a test's.
 */
export type WallChooser = (flag: string | undefined) => { open: (opts: { data?: string }) => Wall } | { refused: string };

const USAGE = `usage: townd admin [--data <dir>] [--wall <kind>] <verb>
  user add <name> | user ls
  pass new --user <name> --label <text> [--expires <duration>] | pass ls | pass revoke <id>
  grant new --pass <id> --shop <name> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--expires <duration>] [--credential <id>]...
  grant ls [--pass <id>] | grant revoke <id>
  permit ls [--pass <id>] | permit show <id> | permit approve <id> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--credential <id>]... [--expires <duration>] | permit deny <id>
  shop add <dir> [--user <name> [--credential <id>]...] | shop test <dir> [--user <name> [--credential <id>]...] | shop ls | shop rm <name>
  type add <name> --origin <url> --header '<Name>: <value with {token}>' [--guidance <text>] | type approve <name> | type ls | type rm <name>
  credential add --user <name> --type <type> [--label <text>] (the secret on stdin) | credential ls [--user <name>] | credential rm <id>
  audit [--pass <id>] [--shop <name>] [--since <duration>] | audit --call <id>
durations: <n>d, <n>h, <n>m. --data defaults to $TOWN_DATA. --wall is seatbelt or none, the box's wall when omitted.`;

export class UsageError extends Error {}

export interface Parsed {
  words: string[];
  opts: Map<string, string[]>;
}

const VALUE_FLAGS = ["data", "wall", "user", "label", "expires", "pass", "shop", "commands", "constraint", "since", "town", "type", "origin", "header", "credential", "call", "guidance"];

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

export function one(p: Parsed, name: string, required: true): string;
export function one(p: Parsed, name: string, required?: false): string | undefined;
export function one(p: Parsed, name: string, required = false): string | undefined {
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

export async function main(argv: readonly string[], io: Io, chooseWall: WallChooser): Promise<number> {
  const now = io.now ?? Date.now;
  let p: Parsed;
  try {
    p = parse(argv);
  } catch (err) {
    io.err(`townd admin: ${(err as Error).message}\n${USAGE}\n`);
    return 1;
  }

  // The wall first: no verb runs on a box refused one.
  let chosen: ReturnType<WallChooser>;
  let data: string | undefined;
  try {
    chosen = chooseWall(one(p, "wall"));
    data = one(p, "data") ?? io.env.TOWN_DATA;
  } catch (err) {
    return usage(io, (err as Error).message);
  }
  if ("refused" in chosen) {
    io.err(`townd admin: ${chosen.refused}\n`);
    return 1;
  }
  const { open } = chosen;

  const [noun, verb, ...args] = p.words;
  if (!noun) return usage(io, "no verb given");

  if (noun === "shop" && verb === "test") {
    if (args.length !== 1) return usage(io, "shop test takes one directory");
    if (data === undefined) {
      if (p.opts.has("user")) return usage(io, "shop test --user needs --data <dir>, or $TOWN_DATA, where the user's credentials are");
      return shopTest(null, args[0]!, picked(p), io, open({}));
    }
  }
  if (!data) return usage(io, "needs --data <dir>, or $TOWN_DATA");

  let store: Store | null = null;
  try {
    store = openStore(data);
    let wall: Wall;
    try {
      wall = open({ data: store.dataDir });
    } catch (err) {
      io.err(`townd admin: ${(err as Error).message}\n`);
      return 1;
    }
    const key = requireKey(store.dataDir, store.sealedRows());
    if (noun === "shop" && verb === "test") return await shopTest({ store, key }, args[0]!, picked(p), io, wall);
    return await dispatch(store, key, noun, verb, args, p, io, now(), wall);
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

export function noExtra(args: readonly string[], n: number, what: string): void {
  if (args.length !== n) throw new UsageError(`${what} takes ${n === 0 ? "no words" : n === 1 ? "one word" : `${n} words`}, not ${args.length}`);
}

async function dispatch(store: Store, vaultKey: Buffer | null, noun: string, verb: string | undefined, args: string[], p: Parsed, io: Io, now: number, wall: Wall): Promise<number> {
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
      return shopAdd(store, vaultKey, args[0]!, picked(p), io, now, wall);
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
    case "permit show": {
      noExtra(args, 1, "permit show");
      const permit = store.permitById(args[0]!);
      if (!permit) throw new StoreError(`permit ${args[0]!} does not exist; townd admin permit ls lists them`);
      io.out(permitTable(store, [permit], true) + checklist(store, permit));
      return 0;
    }
    case "permit approve": {
      noExtra(args, 1, "permit approve");
      const id = args[0]!;
      const expires = one(p, "expires");
      const req = { commands: one(p, "commands"), constraints: p.opts.get("constraint") ?? [], credentials: p.opts.get("credential") ?? [], expiresAt: expires ? now + parseDuration(expires) : null };
      const permit = store.pendingPermit(id);
      const shop = store.getShop(permit.shop);
      const needy = shop !== null && needsOf(shop.manifest).length > 0;
      // A refusal leaves the permit pending and, at a shop with needs, prints what remains to do.
      const refused = (lines: readonly string[]) => {
        for (const r of lines) io.err(`townd admin: permit approve refused: ${r}\n`);
        io.err(`townd admin: ${id} is still pending\n`);
        if (needy) io.err(todoBlock(store, permit, true));
        return 1;
      };
      const checked = checkPermit(store, id, req, now);
      if (Array.isArray(checked)) return refused(checked);
      if (needy && shop.testedAt === null) {
        const ran = await testAtApproval(store, vaultKey, { permit: id, shop: permit.shop, userName: permit.userName, bound: checked.credentials, picked: req.credentials }, decideAndRecord, io, now, wall);
        if (ran.passed < ran.of) return refused([`tests ${ran.of - ran.passed}/${ran.of} failed; the shop needs work, and the permit waits`]);
      }
      const made = makePermitGrant(store, id, checked, req.expiresAt, now);
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

    case "type add":
    case "type approve":
    case "type ls":
    case "type rm":
    case "credential add":
    case "credential ls":
    case "credential rm":
      return secretVerb(store, key, args, p, io, now);

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

const AUDIT_HEADER = ["at", "pass", "shop", "command", "argv sha256", "result", "exit", "shop exit", "ms", "notices", "credentials", "call", "parent", "wall", "detail"];

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
    c.wall ?? "-",
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
