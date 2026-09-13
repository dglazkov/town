// The gate: bearer to pass, argv to shop and command, command to grant,
// arguments to manifest, arguments to constraints, and only then the
// runtime. Every step before the sixth ends in an outcome with no process;
// the words come from denials.ts, help from help.ts, notices from
// notices.ts. The gate reads the store on every call and keeps nothing.
// A pass's grants are its live grants (store.ts), and the sixth step is
// the only place a grant's bindings are opened from the vault. An `oauth`
// binding's access token is refreshed there when it is within a minute of
// expiry, before any teller or process, and its row sealed again; a
// refresh the provider refuses revokes the credential and denies the call.
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
import { due, parseValue, refresh, refreshed, type OAuthValue } from "./oauth.js";
import type { Client, CredentialType } from "./credentials.js";
import { DEFAULT_TIMEOUT_MS, STDIN_LIMIT_BYTES, run, segment, type RunCredential } from "./runtime.js";
import { hashToken, type Grant, type Pass, type Store } from "./store.js";
import { VaultError } from "./vault.js";
import type { Wall, WallKind } from "./wall.js";

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
  /** An `oauth` type's registration, opened; a vault without it refreshes nothing. */
  client?(type: string): Client;
  /** An `oauth` credential's row sealed again with the value a refresh made. */
  reseal?(credentialId: string, value: OAuthValue): void;
}

/** The vault over a store and the key `key` finds, read when first needed: the server's, and the admin's for a shop's tests. */
export function storeVault(store: Store, key: () => Buffer | null): Vault {
  const k = () => {
    const found = key();
    if (!found) throw new VaultError(KEY_MISSING);
    return found;
  };
  return {
    open: (id) => store.openCredential(id, k()),
    client: (type) => store.openClient(type, k()),
    reseal: (id, value) => store.refreshCredential(id, value, k()),
  };
}

/** What `revoked_why` says of a credential whose refresh the provider refused. */
export const REFRESH_REFUSED = "refresh refused";

/** A refresh the token endpoint answered `invalid_grant`: the credential is revoked with why. */
export class RefreshRefused extends Error {
  constructor(readonly type: string) {
    super(`the ${type} refresh was refused`);
  }
}

/** Any other failure at the token endpoint: its status, or the word for no answer. The credential stands. */
export class RefreshFailed extends Error {
  constructor(readonly type: string, readonly status: number, readonly why: string) {
    super(`the ${type} refresh failed`);
  }
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
  /** The kind of wall the shop's process ran within, from the run's result; null when no process ran. */
  wall: WallKind | null;
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
    wall: null,
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
  let credentials: RunCredential[];
  let note: string | null = null;
  try {
    const opened = test ? { credentials: testBindings(test.credentials, manifest), refreshed: [] } : await openBindings(store, deps.vault, grant, manifest, now);
    credentials = opened.credentials;
    if (opened.refreshed.length) note = opened.refreshed.map((t) => `refreshed ${t}`).join(", ");
  } catch (err) {
    if (err instanceof RefreshRefused) {
      return { ...atArgs, error: denials.notAvailableSince(`${first} ${command}`, `its ${err.type} credential needs connecting again at the box`), exit: 2, result: "denied", detail: `${REFRESH_REFUSED} ${err.type}` };
    }
    if (err instanceof RefreshFailed) {
      return { ...atArgs, error: denials.shopFailed(manifest.name, command, ""), exit: 1, result: "shop-error", detail: `refresh ${err.type} failed: ${err.status || err.why}` };
    }
    throw err;
  }
  const noted = (detail: string | null) => [note, detail].filter((x) => x !== null).join("; ") || null;
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
  const ran: Outcome = { ...atArgs, stdout: r.stdout, shopExit: r.exit, shopStderr: r.stderr, credentials: r.credentials, wall: r.wall, detail: noted(null) };
  if (r.aborted) {
    return { ...ran, error: denials.townFailed(), exit: 1, result: "town-error", detail: noted("aborted") };
  }
  if (r.timedOut) {
    return { ...ran, error: denials.shopTimedOut(manifest.name, command, Math.round(timeoutMs / 1000)), exit: 1, result: "timeout" };
  }
  // A denial one level down is the agent's: the shop failed after a call of
  // its own was denied, so the agent is told that line, and nothing the shop
  // printed. A shop that caught the denial and exited 0 is ok.
  if (r.exit !== 0 && r.denied !== null) {
    return { ...ran, stdout: "", error: r.denied, exit: 2, result: "denied", detail: noted("inner") };
  }
  if (r.exit !== 0) {
    const tail = r.stderr.trimEnd().split("\n").slice(-STDERR_TAIL_LINES).join("\n");
    return { ...ran, error: denials.shopFailed(manifest.name, command, tail), exit: 1, result: "shop-error" };
  }
  return ran;
}

/**
 * For each need of the manifest, the grant's binding opened: the type's
 * origin and header and the credential's secret (secretOf), for the
 * runtime alone, and the types refreshed on the way. A live grant has a
 * binding for every need, so a missing one here, a missing vault, or a
 * credential that does not open is the town's failure, thrown as a
 * VaultError whose words name no credential, no path, and no value.
 */
async function openBindings(store: Store, vault: Vault | undefined, grant: Grant, manifest: Manifest, now: number): Promise<{ credentials: RunCredential[]; refreshed: string[] }> {
  const out: RunCredential[] = [];
  const fresh: string[] = [];
  for (const { type } of manifest.credentials ?? []) {
    const id = grant.credentials[type];
    const t = store.getType(type);
    if (id === undefined || !t) throw new VaultError("a binding was not there to open");
    if (!vault) throw new VaultError(KEY_MISSING);
    const secret = await secretOf(store, vault, t, id, now);
    if (secret.refreshed) fresh.push(type);
    out.push({ type, origin: t.origin, header: t.header, token: secret.token });
  }
  return { credentials: out, refreshed: fresh };
}

/**
 * A credential's secret for one use at `now`: a `token` credential's value;
 * an `oauth` credential's access token when it has more than a minute
 * left, and otherwise a new one, traded for the refresh token at the
 * type's token endpoint with the registration, the row sealed again with
 * it, and a rotated refresh token kept. `invalid_grant` revokes the
 * credential, `refresh refused`, and throws RefreshRefused, unless the row
 * was refreshed by another call meanwhile; any other failure throws
 * RefreshFailed and leaves it. A vault that cannot open is a VaultError.
 */
export async function secretOf(store: Store, vault: Vault, t: CredentialType, id: string, now: number): Promise<{ token: string; refreshed: boolean }> {
  const opened = openSealed(vault, id);
  if (t.kind !== "oauth") return { token: opened, refreshed: false };
  const value = parseValue(opened);
  if (!value || !t.oauth) throw new VaultError("an oauth credential did not open as one");
  if (!due(value.expires_at, now)) return { token: value.access_token, refreshed: false };
  if (!vault.client || !vault.reseal) throw new VaultError("a registration was not there to refresh with");
  let client: Client;
  try {
    client = vault.client(t.name);
  } catch (err) {
    throw new VaultError(err instanceof VaultError && err.message === KEY_MISSING ? KEY_MISSING : "a registration did not open under the vault key");
  }
  const answer = await refresh({ token: t.oauth.token, clientId: client.id, clientSecret: client.secret, refreshToken: value.refresh_token });
  if (!answer.ok) {
    if (answer.error !== "invalid_grant") throw new RefreshFailed(t.name, answer.status, answer.error);
    // A call beside this one may have refreshed first and rotated the token this one sent.
    const latest = parseValue(openSealed(vault, id));
    if (latest && latest.refresh_token !== value.refresh_token && !due(latest.expires_at, now)) return { token: latest.access_token, refreshed: false };
    store.revokeCredential(id, now, REFRESH_REFUSED);
    throw new RefreshRefused(t.name);
  }
  const next = refreshed(value, answer, now);
  vault.reseal(id, next);
  return { token: next.access_token, refreshed: true };
}

function openSealed(vault: Vault, id: string): string {
  try {
    return vault.open(id);
  } catch (err) {
    throw new VaultError(err instanceof VaultError && err.message === KEY_MISSING ? KEY_MISSING : "a credential did not open under the vault key");
  }
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
