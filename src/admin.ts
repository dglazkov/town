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

import type { CallRow } from "./audit.js";
import { TAR_COMMAND, readBundle } from "./bundle.js";
import { checklist, todoBlock } from "./checklist.js";
import type { Consent } from "./consent.js";
import type { Runtime } from "./gate.js";
import { bindingText, checkGrant, checkPermit, constraintText, grantStateText, makePermitGrant, needsOf, permitTable } from "./grants.js";
import { table } from "./help.js";
import { HALL_NAME, type Manifest } from "./manifest.js";
import { isoTime } from "./notices.js";
import { dependentsOf, shopAdd, shopTest, testAtApproval, type Picked, type ShopSource } from "./publish.js";
import { readClient, secretVerb } from "./secrets.js";
import { decideAndRecord } from "./server.js";
import { StoreError, openStore, type Store } from "./store.js";
import { pipe, withoutFlag } from "./wire.js";
import { VaultError } from "./vault.js";
import type { Wall } from "./wall.js";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Where `credential add` reads the secret; nothing when absent. */
  stdin?: AsyncIterable<Buffer | string> & { isTTY?: boolean };
  /** On the box, where a consent lands in place of a listener: the redirect URI, and the consent held for the landing. */
  consent?: { redirect: string; hold(consent: Consent): void };
}

/**
 * The town the verbs run over when it is not a data directory: the box's
 * object, its store and its runtime, and its address, which the verbs that
 * would read a directory name in the pipe to type instead.
 */
export interface AdminTown {
  store: Store;
  runtime: Runtime;
  address: string;
}

/**
 * Resolves `--wall <kind>`, or the box's wall when absent, to a way to open
 * that wall once the data directory is known, or to a refusal's words:
 * townd's `chooseWall`, or a test's.
 */
export type WallChooser = (flag: string | undefined) => { open: (opts: { data?: string }) => Wall } | { refused: string };

const USAGE = `usage: townd admin [--data <dir>] [--wall <kind>] <verb> | townd admin --town <url> <verb>
  user add <name> | user ls
  pass new --user <name> --label <text> [--expires <duration>] | pass ls | pass revoke <id>
  grant new --pass <id> --shop <name> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--expires <duration>] [--credential <id>]...
  grant ls [--pass <id>] | grant revoke <id>
  permit ls [--pass <id>] | permit show <id> | permit approve <id> [--commands a,b] [--constraint '<command>.<arg> <kind> <value>']... [--credential <id>]... [--expires <duration>] | permit deny <id>
  shop add <dir>|- [--user <name> [--credential <id>]... [--client-id <id>]] | shop test <dir>|- [--user <name> [--credential <id>]...] | shop ls | shop rm <name>
  type add <name> --origin <url> --header '<Name>: <value with {token}>' [--guidance <text>] [--kind oauth --authorize <url> --token <url> --scopes a,b --client-id <id>] | type approve <name> [--client-id <id>] | type ls | type rm <name>
  credential add --user <name> --type <type> [--label <text>] [--replace <id>] | credential connect --user <name> --type <type> [--label <text>] [--replace <id>] [--port <n>] [--timeout <wait>] | credential ls [--user <name>] | credential rm <id>
  audit [--pass <id>] [--shop <name>] [--since <duration>] | audit --call <id>
a secret, and an oauth client's secret, is read on stdin. durations: <n>d, <n>h, <n>m; a wait, <n>m or <n>s. --data defaults to $TOWN_DATA. --wall is seatbelt or none, the box's wall when omitted.
--town posts the verb to a box with the operator's token, from $TOWN_OPERATOR or ~/.town/operator; a shop comes from stdin there, as - for its directory.`;

export class UsageError extends Error {}

export interface Parsed {
  words: string[];
  opts: Map<string, string[]>;
}

const VALUE_FLAGS = ["data", "wall", "user", "label", "expires", "pass", "shop", "commands", "constraint", "since", "town", "type", "origin", "header", "credential", "call", "guidance", "kind", "authorize", "token", "scopes", "client-id", "port", "timeout", "replace"];

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

/**
 * Whether the verb `argv` names reads stdin, run as far as its read: a
 * shop given as `-` to `shop test` or `shop add`; the secret of
 * `credential add`; and the client secret `--client-id` comes with, at
 * `type add --kind oauth`, `type approve`, and `shop add` from a directory
 * (`shop add -` with one is refused unread). A refusal before the read
 * reads nothing whatever this says. The wire reads and sends stdin for
 * these alone, so a verb that takes none returns with stdin an open pipe;
 * test/stdin.test.ts runs every verb to hold the two together.
 */
export function readsStdin(argv: readonly string[]): boolean {
  let p: Parsed;
  try {
    p = parse(argv);
  } catch {
    return false;
  }
  const [noun, verb, first] = p.words;
  const client = p.opts.has("client-id");
  switch (`${noun ?? ""} ${verb ?? ""}`) {
    case "shop test":
      return first === "-";
    case "shop add":
      return first === "-" ? !client : client;
    case "credential add":
      return true;
    case "type add":
      return client && p.opts.get("kind")?.at(-1) === "oauth";
    case "type approve":
      return client;
  }
  return false;
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

/** `--user`, read when a shop's tests need it, the `--credential` ids, and `--client-id` with the secret on stdin for a type `shop add` holds. */
function picked(p: Parsed, io: Io): Picked {
  return { user: () => one(p, "user"), credentials: p.opts.get("credential") ?? [], client: { id: one(p, "client-id"), read: (id) => readClient(io, id, "shop add") } };
}

/** `<n>d`, `<n>h`, or `<n>m` in milliseconds. */
export function parseDuration(text: string): number {
  const m = /^(\d+)([dhm])$/.exec(text);
  if (!m) throw new UsageError(`${text} is not a duration; write one like 30d, 12h, or 45m`);
  const unit = { d: 86_400_000, h: 3_600_000, m: 60_000 }[m[2] as "d" | "h" | "m"];
  return Number(m[1]) * unit;
}

export async function main(argv: readonly string[], io: Io, chooseWall: WallChooser, town?: AdminTown): Promise<number> {
  const now = io.now ?? Date.now;
  let p: Parsed;
  try {
    p = parse(argv);
  } catch (err) {
    io.err(`townd admin: ${(err as Error).message}\n${USAGE}\n`);
    return 1;
  }
  if (town) return inTown(town, argv, p, io, chooseWall, now);
  if (p.opts.has("town")) {
    if (p.opts.has("data")) return usage(io, "--data and --town name two towns; write one or the other");
    if (p.opts.has("wall")) {
      io.err("townd admin: --wall is not the operator's to choose over --town; the box runs every shop in an isolate\n");
      return 1;
    }
    try {
      return await pipe(one(p, "town", true), withoutFlag(argv, "town"), io);
    } catch (err) {
      return refusal(err, io);
    }
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
      const source = await sourceOf(args[0]!, io);
      if (typeof source === "number") return source;
      return shopTest(null, source, picked(p, io), io, open({}));
    }
  }
  if (!data) return usage(io, "needs --data <dir>, or $TOWN_DATA");

  let store: Store | null = null;
  try {
    store = openStore(data);
    let wall: Wall;
    try {
      wall = open(store.dataDir === null ? {} : { data: store.dataDir });
    } catch (err) {
      io.err(`townd admin: ${(err as Error).message}\n`);
      return 1;
    }
    const key = store.key.require(store.sealedRows());
    if (noun === "shop" && verb === "test") {
      const source = await sourceOf(args[0]!, io);
      if (typeof source === "number") return source;
      return await shopTest({ store, key }, source, picked(p, io), io, wall);
    }
    return await dispatch({ store, key, wall, now: now() }, noun, verb, args, p, io);
  } catch (err) {
    return refusal(err, io);
  } finally {
    store?.close();
  }
}

/** A thrown refusal printed as the admin prints it, the exit 1; anything else thrown on. */
function refusal(err: unknown, io: Io): number {
  if (err instanceof UsageError) return usage(io, err.message);
  if (err instanceof StoreError || err instanceof VaultError) {
    io.err(`townd admin: ${err.message}\n`);
    return 1;
  }
  throw err;
}

/**
 * The verbs in the box's object, over its store: no --data, no --town, and
 * no --wall, since the box is the one town and runs every shop in an
 * isolate; a verb that would read a directory reads a bundle on stdin as
 * `-`, and a directory is refused naming the pipe to type.
 */
async function inTown(town: AdminTown, argv: readonly string[], p: Parsed, io: Io, chooseWall: WallChooser, now: () => number): Promise<number> {
  for (const flag of ["data", "town"]) if (p.opts.has(flag)) return usage(io, `--${flag} is not a flag the box reads; the box is the town`);
  const chosen = chooseWall(one(p, "wall"));
  if ("refused" in chosen) {
    io.err(`townd admin: ${chosen.refused}\n`);
    return 1;
  }
  const [noun, verb, ...args] = p.words;
  if (!noun) return usage(io, "no verb given");
  const { store, runtime } = town;
  try {
    const wall = chosen.open({});
    const key = store.key.require(store.sealedRows());
    if (noun === "shop" && (verb === "test" || verb === "add")) {
      if (args.length !== 1) return usage(io, `shop ${verb} takes one directory, as -`);
      if (args[0] !== "-") {
        io.err(`townd admin: shop ${verb} refused: over --town a shop comes from stdin: ${TAR_COMMAND.replace("<dir>", args[0]!)} | townd admin --town ${town.address} ${argv.map((w) => (w === args[0] ? "-" : w)).join(" ")}\n`);
        return 1;
      }
      if (verb === "test") {
        const source = await sourceOf("-", io);
        if (typeof source === "number") return source;
        return await shopTest({ store, key }, source, picked(p, io), io, wall, runtime);
      }
    }
    return await dispatch({ store, key, wall, now: now(), runtime }, noun, verb, args, p, io);
  } catch (err) {
    return refusal(err, io);
  }
}

/** A verb's shop: the directory named, or with `-` the bundle on stdin, a ustar tar of its files; a bundle refused is printed and exit 1. */
async function sourceOf(word: string, io: Io): Promise<ShopSource | number> {
  if (word !== "-") return word;
  if (!io.stdin || io.stdin.isTTY) {
    io.err(`townd admin: - reads a shop on stdin, and there is none; pipe one in: ${TAR_COMMAND} | townd admin ... -\n`);
    return 1;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of io.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  const bundle = readBundle(Buffer.concat(chunks).toString("utf8"));
  if ("refusal" in bundle) {
    io.err(`townd admin: ${bundle.refusal}\n`);
    return 1;
  }
  return { files: bundle.files };
}

function usage(io: Io, why: string): number {
  io.err(`townd admin: ${why}\n${USAGE}\n`);
  return 1;
}

export function noExtra(args: readonly string[], n: number, what: string): void {
  if (args.length !== n) throw new UsageError(`${what} takes ${n === 0 ? "no words" : n === 1 ? "one word" : `${n} words`}, not ${args.length}`);
}

/** What a verb runs over: the store, its key when there is one, the wall, the time, and on the box the runtime a shop's tests run in. */
interface Over {
  store: Store;
  key: Buffer | null;
  wall: Wall;
  now: number;
  runtime?: Runtime;
}

async function dispatch(over: Over, noun: string, verb: string | undefined, args: string[], p: Parsed, io: Io): Promise<number> {
  const { store, key: vaultKey, wall, now, runtime } = over;
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
      const town = store.getMeta("address") ?? "http://127.0.0.1:7000";
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

    case "shop add": {
      noExtra(args, 1, "shop add");
      if (args[0] === "-" && p.opts.has("client-id")) throw new UsageError("shop add - reads the shop on stdin, and --client-id its client secret; hold the type first with townd admin type add, then add the shop");
      const source = await sourceOf(args[0]!, io);
      if (typeof source === "number") return source;
      return shopAdd(store, vaultKey, source, picked(p, io), io, now, wall, runtime);
    }
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
      store.shelf.remove(name);
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
        const ran = await testAtApproval(store, vaultKey, { permit: id, shop: permit.shop, userName: permit.userName, bound: checked.credentials, picked: req.credentials }, decideAndRecord, io, now, wall, runtime);
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
    case "credential connect":
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
