// The gate: bearer to pass, argv to shop and command, command to grant,
// arguments to manifest, arguments to constraints, and only then the
// runtime. Every step before the sixth ends in an outcome with no process;
// the words come from denials.ts, help from help.ts, notices from
// notices.ts. The gate reads the store on every call and keeps nothing.

import { createHash } from "node:crypto";
import path from "node:path";
import { canonicalArgv, parseArgs } from "./args.js";
import { firstMiss } from "./constraints.js";
import { denials } from "./denials.js";
import { helpForGrant, helpForPass, typedName, usageFor } from "./help.js";
import { RESERVED_SHOP_WORDS, type Manifest } from "./manifest.js";
import { noticesFor, type Notice } from "./notices.js";
import { DEFAULT_TIMEOUT_MS, STDIN_LIMIT_BYTES, run, segment } from "./runtime.js";
import { hashToken, type Grant, type Pass, type ResultClass, type Store } from "./store.js";

export interface CallRequest {
  /** The bearer token; null when the request carried none. */
  token: string | null;
  argv: string[];
  stdin: string | null;
  json: boolean;
}

export type Runtime = typeof run;

export interface GateDeps {
  store: Store;
  /** The runtime; the real one when omitted. Tests pass one that records whether it ran. */
  runtime?: Runtime;
  now?: () => number;
  timeoutMs?: number;
}

export interface Outcome {
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

/** Decides one call, in the design's six steps. Never throws for anything the agent sent. */
export async function gate(deps: GateDeps, req: CallRequest): Promise<Outcome> {
  const { store } = deps;
  const now = (deps.now ?? Date.now)();
  const argv = req.argv;
  const base: Outcome = {
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
  };

  // 1. The bearer to a pass.
  const pass = req.token ? store.passByTokenHash(hashToken(req.token)) : null;
  const invalid = !req.token ? "no-token" : !pass ? "unknown" : pass.revokedAt !== null ? "revoked" : pass.expiresAt !== null && pass.expiresAt <= now ? "expired" : null;
  if (invalid || !pass) {
    return { ...base, passId: pass?.id ?? null, error: denials.invalidPass(), exit: 3, result: "invalid-pass", detail: invalid };
  }
  const withPass: Outcome = { ...base, passId: pass.id, notices: noticesFor(now, pass, []) };

  // 2. The argv to a shop and a command.
  const first = argv[0];
  if (first === undefined || first === "--help") {
    const grants = store.grantsForPass(pass.id, now);
    return { ...withPass, notices: noticesFor(now, pass, grants), stdout: helpForPass(store, pass, now), detail: "help" };
  }
  if (RESERVED_SHOP_WORDS.includes(first)) {
    return { ...withPass, error: denials.noSuchCommand(first), exit: 1, result: "usage", detail: "reserved-word" };
  }
  const resolved = resolveShop(store, pass, first, now);
  if (!resolved) {
    const second = argv[1];
    const subject = second !== undefined && !second.startsWith("-") ? `${first} ${second}` : first;
    return { ...withPass, error: denials.notAvailable(subject), exit: 2, result: "denied", detail: "no-grant" };
  }
  const { grant, manifest } = resolved;
  const atShop: Outcome = { ...withPass, grantId: grant.id, shop: manifest.name, notices: noticesFor(now, pass, [grant]) };
  const allowed = (name: string) => grant.commands.includes(name) && manifest.commands.some((c) => c.name === name);

  // 3. The command to the grant.
  const rest = argv.slice(1);
  const command = rest[0] !== undefined && !rest[0].startsWith("-") ? rest[0] : null;
  if (command !== null && !allowed(command)) {
    const known = manifest.commands.some((c) => c.name === command) ? command : null;
    return { ...atShop, command: known, error: denials.notAvailable(command), exit: 2, result: "denied", detail: "command" };
  }
  if (rest.includes("--help")) {
    return { ...atShop, command, stdout: helpForGrant(manifest, { ...grant, label: pass.label }, first), detail: "help" };
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

  // 6. The runtime. Only now does a process exist.
  const runtime = deps.runtime ?? run;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const r = await runtime(shopDir(store, manifest.name), manifest, command, parsed.values, {
    user: pass.userId,
    stateRoot: store.stateRoot,
    stdin: req.stdin,
    timeoutMs,
  });
  const ran: Outcome = { ...atArgs, stdout: r.stdout, shopExit: r.exit, shopStderr: r.stderr };
  if (r.timedOut) {
    return { ...ran, error: denials.shopTimedOut(manifest.name, command, Math.round(timeoutMs / 1000)), exit: 1, result: "timeout" };
  }
  if (r.exit !== 0) {
    const tail = r.stderr.trimEnd().split("\n").slice(-STDERR_TAIL_LINES).join("\n");
    return { ...ran, error: denials.shopFailed(manifest.name, command, tail), exit: 1, result: "shop-error" };
  }
  return ran;
}

/**
 * The grant of `pass` a typed shop name reaches, by full name, or by
 * last segment when no other grant of the pass shares it, with the
 * shop's manifest; null when there is none. A shop that does not exist
 * and a shop the pass holds no grant for are the same null.
 */
function resolveShop(store: Store, pass: Pass, typed: string, now: number): { grant: Grant; manifest: Manifest } | null {
  const held: Array<{ grant: Grant; manifest: Manifest }> = [];
  for (const grant of store.grantsForPass(pass.id, now)) {
    const shop = store.getShop(grant.shop);
    if (shop) held.push({ grant, manifest: shop.manifest });
  }
  const names = held.map((h) => h.manifest.name);
  return held.find((h) => h.manifest.name === typed || (!typed.includes("/") && typedName(h.manifest.name, names) === typed)) ?? null;
}
