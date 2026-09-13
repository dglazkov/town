// The gate: bearer to pass, argv to shop and command, command to grant,
// arguments to manifest, arguments to constraints, and only then the
// runtime. Every step before the sixth ends in an outcome with no process;
// the words come from denials.ts, help from help.ts, notices from
// notices.ts. The gate reads the store on every call and keeps nothing.
// A pass's grants are its live grants (store.ts), and the sixth step is
// the only place a grant's bindings are opened from the vault.
//
// A shop's own call comes from its clerk with a caller in place of a
// bearer, and its grants are computed, not read: the agent's live grants
// cut by the calling shop's manifest (`effective`). Steps 2 to 6 run over
// them unchanged, and a shop with dependencies is handed `answerFor`, this
// gate for the caller one deeper. A shop that fails after one of its calls
// was denied is the agent's denial, in the inner call's words; a tree
// deeper than eight is the town's failure.
//
// The town's own shop, a manifest whose runtime is `town`, is decided by
// steps 1 to 5 as any shop is; at the sixth there is no binding and no
// process, and the hall's answer (hall.ts) is the outcome.

import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { canonicalArgv, parseArgs } from "./args.js";
import type { ResultClass } from "./audit.js";
import { respond, type Answer } from "./clerk.js";
import { firstMiss, splitTarget } from "./constraints.js";
import { denials } from "./denials.js";
import { runHall } from "./hall.js";
import { helpForGrant, helpForGrants, typedName, usageFor } from "./help.js";
import { RESERVED_SHOP_WORDS, type Manifest } from "./manifest.js";
import { noticesFor, type Notice } from "./notices.js";
import { DEFAULT_TIMEOUT_MS, STDIN_LIMIT_BYTES, run, segment, type RunCredential } from "./runtime.js";
import { hashToken, type Grant, type Pass, type Store } from "./store.js";
import { VaultError } from "./vault.js";
import type { Wall } from "./wall.js";

export interface CallRequest {
  /** The bearer token; null when the request carried none. */
  token: string | null;
  argv: string[];
  stdin: string | null;
  json: boolean;
  /** Set for a shop's own call, from its clerk: who called, in place of the bearer. */
  caller?: Caller;
  /** The call's id, minted by whoever records it before the gate runs; one is minted here when absent. */
  callId?: string;
}

/**
 * Who makes a shop's call, and the calling shop's manifest. An agent's
 * call carries its pass by id, re-read on every call, and a state root
 * when the tree runs in scratch, as the hall's tests of a sent shop do:
 * handed to the runtime in place of the store's, and carried to every
 * call below. A shop test at the box carries no pass: the tree's grants,
 * the test's user, scratch state root, and the credentials it was given.
 * `parent` is the id of the call whose shop is calling, and `depth` how
 * many shops are above this call: 1 for a call an agent's shop makes.
 */
export type Caller = ({ passId: string; stateRoot?: string } | { test: TestTree }) & { manifest: Manifest; parent: string | null; depth: number };

/** The deepest a call may be: a shop calling a shop, eight shops down. Past it is the town's failure. */
export const MAX_DEPTH = 8;

/** A call's id as the audit keeps it: `call_` and eight random bytes as hex. */
export function newCallId(): string {
  return `call_${randomBytes(8).toString("hex")}`;
}

/** What a shop test hands the gate for its tree, in place of a pass. */
export interface TestTree {
  /** At every shop in the tree, the commands declared of it anywhere in the tree, no constraints. */
  grants: Grant[];
  user: string;
  stateRoot: string;
  /** The credentials the test was given, opened, one per type; each call is bound to its shop's needs among them. */
  credentials: RunCredential[];
}

/** The words a shop test's help gives as the grant's label. */
export const TEST_LABEL = "a shop test";

export type Runtime = typeof run;

/** Opens a credential's value for one call. The server's reads the store and the vault's key. */
export interface Vault {
  /** Throws a VaultError of KEY_MISSING when there is no key to open with. */
  open(credentialId: string): string;
}

/** The audit's words for a call that needed the vault's key and found none. */
export const KEY_MISSING = "the vault key is missing";

export interface GateDeps {
  store: Store;
  /**
   * Decides a shop's own call and keeps its audit row, as the server does
   * an agent's: the server's `handleCall` path. Absent, a shop's calls are
   * decided by the gate and recorded nowhere, as a shop test's are.
   */
  decide?: (deps: GateDeps, req: CallRequest, signal?: AbortSignal) => Promise<Outcome>;
  /** The runtime; the real one when omitted. Tests pass one that records whether it ran. */
  runtime?: Runtime;
  /** What encloses every shop process this gate starts, the runtime's own or one a test passes; required, and carried to a sent shop's tests. */
  wall: Wall;
  /** Where a grant's bindings are opened; a call that needs one with none here is the town's failure. */
  vault?: Vault;
  now?: () => number;
  timeoutMs?: number;
}

export interface Outcome {
  /** The call's id; its audit row's. */
  callId: string;
  /** The id of the call whose shop made this one; null for an agent's own. */
  parent: string | null;
  /** What goes to the agent's stdout. */
  stdout: string;
  /** The error text for the agent's stderr, without notices; empty when none. */
  error: string;
  exit: number;
  result: ResultClass;
  notices: Notice[];
  passId: string | null;
  grantId: string | null;
  shop: string | null;
  command: string | null;
  argvHash: string;
  /** Set only when the shop ran. */
  shopExit: number | null;
  shopStderr: string | null;
  detail: string | null;
  /** Per need, how many requests its teller forwarded; empty when the shop did not run. */
  credentials: Array<{ type: string; requests: number }>;
}

/** SHA-256 of an argv, as the audit keeps it. */
export function argvHash(argv: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(argv), "utf8").digest("hex");
}

/** The directory a shop's code is copied to under the data directory. */
export function shopDir(store: Store, shop: string): string {
  return path.join(store.shopsDir, segment(shop));
}

const STDERR_TAIL_LINES = 10;

/**
 * The agent's grants at the shops `manifest` depends on: for each
 * dependency, the grant at that shop with its commands cut to the declared
 * ones, and its constraints on those commands kept, its bindings its own.
 * A shop not declared, a command not declared, and a dependency with no
 * grant here are absent. Pure.
 */
export function effective(agentGrants: readonly Grant[], manifest: Manifest): Grant[] {
  const out: Grant[] = [];
  for (const g of agentGrants) {
    const dep = (manifest.depends ?? []).find((d) => d.shop === g.shop);
    if (!dep) continue;
    const commands = g.commands.filter((c) => dep.commands.includes(c));
    if (commands.length === 0) continue;
    const constraints = Object.fromEntries(Object.entries(g.constraints).filter(([target]) => commands.includes(splitTarget(target)[0])));
    out.push({ ...g, commands, constraints });
  }
  return out;
}

/**
 * The town's answer to the calls of a shop run for `caller`: this gate,
 * through `deps.decide` when the town records its calls, with the answer's
 * wire as the server writes it and the gate's line when it denied. A
 * failure on the town's side is the town's failure line.
 */
export function answerFor(deps: GateDeps, caller: Caller): Answer {
  return async (call, signal) => {
    let o: Outcome;
    try {
      o = await (deps.decide ?? gate)(deps, { token: null, argv: call.argv, stdin: call.stdin, json: call.json, caller }, signal);
    } catch {
      return { ...respond({ stdout: "", error: denials.townFailed(), exit: 1, notices: [] }, call.json), denial: null };
    }
    return { ...respond(o, call.json), denial: o.result === "denied" ? o.error : null };
  };
}

/** Decides one call, in the design's six steps. Never throws for anything the agent sent. `signal` ends the call's process when it aborts. */
export async function gate(deps: GateDeps, req: CallRequest, signal?: AbortSignal): Promise<Outcome> {
  const { store } = deps;
  const now = (deps.now ?? Date.now)();
  const argv = req.argv;
  const base: Outcome = {
    callId: req.callId ?? newCallId(),
    parent: req.caller?.parent ?? null,
    stdout: "",
    error: "",
    exit: 0,
    result: "ok",
    notices: [],
    passId: null,
    grantId: null,
    shop: null,
    command: null,
    argvHash: argvHash(argv),
    shopExit: null,
    shopStderr: null,
    detail: null,
    credentials: [],
  };

  // 1. The bearer, or the caller, to a pass and its grants. A shop test's
  // caller has no pass and brings its tree's grants.
  const caller = req.caller;
  const test = caller && "test" in caller ? caller.test : null;
  let pass: Pass | null = null;
  let grants: Grant[];
  if (test) {
    grants = effective(test.grants, caller!.manifest);
  } else {
    const byId = caller && "passId" in caller;
    pass = byId ? store.passById(caller.passId) : req.token ? store.passByTokenHash(hashToken(req.token)) : null;
    const invalid = !byId && !req.token ? "no-token" : !pass ? "unknown" : pass.revokedAt !== null ? "revoked" : pass.expiresAt !== null && pass.expiresAt <= now ? "expired" : null;
    if (invalid || !pass) {
      return { ...base, passId: pass?.id ?? null, error: denials.invalidPass(), exit: 3, result: "invalid-pass", detail: invalid };
    }
    const live = store.grantsForPass(pass.id, now);
    grants = caller ? effective(live, caller.manifest) : live;
  }
  // A seatbelt: no loop can be added, so a tree this deep is the town's fault.
  if (caller && caller.depth > MAX_DEPTH) {
    return { ...base, passId: pass?.id ?? null, error: denials.townFailed(), exit: 1, result: "town-error", detail: "depth" };
  }
  const notices = (touched: readonly Grant[]) => (pass ? noticesFor(now, pass, touched) : []);
  const withPass: Outcome = { ...base, passId: pass?.id ?? null, notices: notices([]) };

  // 2. The argv to a shop and a command.
  const first = argv[0];
  if (first === undefined || first === "--help") {
    return { ...withPass, notices: notices(grants), stdout: helpForGrants(store, grants), detail: "help" };
  }
  if (RESERVED_SHOP_WORDS.includes(first)) {
    return { ...withPass, error: denials.noSuchCommand(first), exit: 1, result: "usage", detail: "reserved-word" };
  }
  const resolved = resolveShop(store, grants, first);
  if (!resolved) {
    const second = argv[1];
    const subject = second !== undefined && !second.startsWith("-") ? `${first} ${second}` : first;
    return { ...withPass, error: denials.notAvailable(subject), exit: 2, result: "denied", detail: "no-grant" };
  }
  const { grant, manifest } = resolved;
  const atShop: Outcome = { ...withPass, grantId: grant.id, shop: manifest.name, notices: notices([grant]) };
  const allowed = (name: string) => grant.commands.includes(name) && manifest.commands.some((c) => c.name === name);

  // 3. The command to the grant.
  const rest = argv.slice(1);
  const command = rest[0] !== undefined && !rest[0].startsWith("-") ? rest[0] : null;
  if (command !== null && !allowed(command)) {
    const known = manifest.commands.some((c) => c.name === command) ? command : null;
    return { ...atShop, command: known, error: denials.notAvailable(command), exit: 2, result: "denied", detail: "command" };
  }
  if (rest.includes("--help")) {
    return { ...atShop, command, stdout: helpForGrant(manifest, { ...grant, label: pass?.label ?? TEST_LABEL }, first), detail: "help" };
  }
  if (command === null) {
    return { ...atShop, error: denials.usage(["no command given"], usageFor(manifest, grant, first, null)), exit: 1, result: "usage", detail: "no-command" };
  }
  const atCommand: Outcome = { ...atShop, command };

  // 4. The arguments to the manifest.
  const parsed = parseArgs(manifest, command, rest.slice(1));
  if (!parsed.ok) {
    const problems = parsed.refusals.map((r) => r.message);
    return {
      ...atCommand,
      error: denials.usage(problems, usageFor(manifest, grant, first, command)),
      exit: 1,
      result: "usage",
      detail: parsed.refusals.map((r) => r.kind).join(","),
    };
  }
  const stdinBytes = req.stdin === null ? 0 : Buffer.byteLength(req.stdin, "utf8");
  if (stdinBytes > STDIN_LIMIT_BYTES) {
    return { ...atCommand, error: denials.stdinTooLarge(stdinBytes), exit: 1, result: "usage", detail: "stdin-too-large" };
  }
  const canonical = canonicalArgv(manifest, command, parsed.values);
  const atArgs: Outcome = { ...atCommand, argvHash: argvHash(canonical) };

  // 5. The arguments to the constraints.
  const miss = firstMiss(grant.constraints, command, parsed.values);
  if (miss) {
    return { ...atArgs, error: denials.constraint(miss.arg, miss.kind, miss.rule), exit: 2, result: "denied", detail: `constraint ${command}.${miss.arg} ${miss.kind}` };
  }

  // 6, for the town's own shop: no binding, no process, the hall's outcome
  // taken whole. It answers an agent's pass alone; a shop's call or a shop
  // test's tree cannot reach it, since no manifest may depend on it.
  if (manifest.runtime === "town") {
    if (caller || !pass) return { ...atArgs, error: denials.townFailed(), exit: 1, result: "town-error", detail: "hall-caller" };
    const hall = await runHall({ ...deps, now: () => now }, { pass, grant, command, values: parsed.values, stdin: req.stdin, callId: base.callId });
    return { ...atArgs, ...hall };
  }

  // 6. The bindings, then the runtime. Only now is a credential opened,
  // and only now does a process exist. A shop with dependencies is given
  // this gate to answer its calls, for the caller one deeper.
  const credentials = test ? testBindings(test.credentials, manifest) : openBindings(store, deps.vault, grant, manifest);
  const runtime = deps.runtime ?? run;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const below = { manifest, parent: base.callId, depth: (caller?.depth ?? 0) + 1 };
  const scratch = caller && "passId" in caller ? caller.stateRoot : undefined;
  const deeper: Caller = test ? { test, ...below } : { passId: pass!.id, ...(scratch === undefined ? {} : { stateRoot: scratch }), ...below };
  const r = await runtime(shopDir(store, manifest.name), manifest, command, parsed.values, {
    user: test ? test.user : pass!.userId,
    stateRoot: test ? test.stateRoot : (scratch ?? store.stateRoot),
    stdin: req.stdin,
    timeoutMs,
    wall: deps.wall,
    ...(credentials.length ? { credentials } : {}),
    ...((manifest.depends ?? []).length ? { town: { answer: answerFor(deps, deeper) } } : {}),
    ...(signal ? { signal } : {}),
  });
  const ran: Outcome = { ...atArgs, stdout: r.stdout, shopExit: r.exit, shopStderr: r.stderr, credentials: r.credentials };
  if (r.aborted) {
    return { ...ran, error: denials.townFailed(), exit: 1, result: "town-error", detail: "aborted" };
  }
  if (r.timedOut) {
    return { ...ran, error: denials.shopTimedOut(manifest.name, command, Math.round(timeoutMs / 1000)), exit: 1, result: "timeout" };
  }
  // A denial one level down is the agent's: the shop failed after a call of
  // its own was denied, so the agent is told that line, and nothing the shop
  // printed. A shop that caught the denial and exited 0 is ok.
  if (r.exit !== 0 && r.denied !== null) {
    return { ...ran, stdout: "", error: r.denied, exit: 2, result: "denied", detail: "inner" };
  }
  if (r.exit !== 0) {
    const tail = r.stderr.trimEnd().split("\n").slice(-STDERR_TAIL_LINES).join("\n");
    return { ...ran, error: denials.shopFailed(manifest.name, command, tail), exit: 1, result: "shop-error" };
  }
  return ran;
}

/**
 * For each need of the manifest, the grant's binding opened: the type's
 * origin and header and the credential's value, for the runtime alone. A
 * live grant has a binding for every need, so a missing one here, a
 * missing vault, or a credential that does not open is the town's
 * failure, thrown as a VaultError whose words name no credential, no
 * path, and no value.
 */
function openBindings(store: Store, vault: Vault | undefined, grant: Grant, manifest: Manifest): RunCredential[] {
  const out: RunCredential[] = [];
  for (const { type } of manifest.credentials ?? []) {
    const id = grant.credentials[type];
    const t = store.getType(type);
    if (id === undefined || !t) throw new VaultError("a binding was not there to open");
    if (!vault) throw new VaultError(KEY_MISSING);
    let token: string;
    try {
      token = vault.open(id);
    } catch (err) {
      throw new VaultError(err instanceof VaultError && err.message === KEY_MISSING ? KEY_MISSING : "a credential did not open under the vault key");
    }
    out.push({ type, origin: t.origin, header: t.header, token });
  }
  return out;
}

/** For each need of the manifest, the test's credential of its type; one missing is the town's failure. */
function testBindings(given: readonly RunCredential[], manifest: Manifest): RunCredential[] {
  return (manifest.credentials ?? []).map(({ type }) => {
    const c = given.find((x) => x.type === type);
    if (!c) throw new VaultError("a binding was not there to open");
    return c;
  });
}

/**
 * The grant among `grants` a typed shop name reaches, by full name, or by
 * last segment when no other of them shares it, with the shop's manifest;
 * null when there is none. A shop that does not exist and a shop held by
 * no grant are the same null.
 */
function resolveShop(store: Store, grants: readonly Grant[], typed: string): { grant: Grant; manifest: Manifest } | null {
  const held: Array<{ grant: Grant; manifest: Manifest }> = [];
  for (const grant of grants) {
    const shop = store.getShop(grant.shop);
    if (shop) held.push({ grant, manifest: shop.manifest });
  }
  const names = held.map((h) => h.manifest.name);
  return held.find((h) => h.manifest.name === typed || (!typed.includes("/") && typedName(h.manifest.name, names) === typed)) ?? null;
}
