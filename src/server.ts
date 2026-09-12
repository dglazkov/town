// The town: node:http on a loopback port over one data directory. `GET /`
// answers `town`; `POST /call` takes a bearer and { argv, stdin, json },
// runs the gate, writes one audit row whatever happened, and answers
// { stdout, stderr, exit }. In json mode stdout is the envelope and
// stderr is empty.

import { existsSync, realpathSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { denials } from "./denials.js";
import { KEY_MISSING, argvHash, gate, type CallRequest, type GateDeps, type Outcome, type Vault } from "./gate.js";
import { renderNotices } from "./notices.js";
import { hashToken, openStore, type Store } from "./store.js";
import { VaultError, readKey, requireKey } from "./vault.js";

export interface WireResponse {
  stdout: string;
  stderr: string;
  exit: number;
}

/** The largest request body read; a call's stdin is refused past one megabyte by the gate, and JSON escaping can grow it. */
export const BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/** The response the agent's binary prints: plain, or the `--json` envelope. */
export function respond(o: Outcome, json: boolean): WireResponse {
  if (json) {
    const envelope: Record<string, unknown> = { ok: o.exit === 0, output: o.stdout, notices: o.notices, exit: o.exit };
    if (o.exit !== 0) envelope.error = o.error;
    return { stdout: `${JSON.stringify(envelope)}\n`, stderr: "", exit: o.exit };
  }
  const error = o.error === "" ? "" : o.error.endsWith("\n") ? o.error : `${o.error}\n`;
  return { stdout: o.stdout, stderr: renderNotices(o.notices) + error, exit: o.exit };
}

/** One call: the gate, one audit row, the response. */
export async function handleCall(deps: GateDeps, req: CallRequest): Promise<WireResponse> {
  const started = performance.now();
  const at = (deps.now ?? Date.now)();
  let outcome: Outcome;
  try {
    outcome = await gate(deps, req);
  } catch (err) {
    // A VaultError's words are the gate's own and name no credential, path, or value: the operator's detail.
    outcome = failed(deps.store, req, denials.townFailed(), "town-error", err instanceof VaultError ? err.message : (err as Error).name);
  }
  deps.store.recordCall({
    at,
    passId: outcome.passId,
    grantId: outcome.grantId,
    shop: outcome.shop,
    command: outcome.command,
    argvHash: outcome.argvHash,
    result: outcome.result,
    exit: outcome.exit,
    shopExit: outcome.shopExit,
    latencyMs: performance.now() - started,
    notices: outcome.notices.map((n) => n.kind),
    stderr: outcome.shopStderr,
    detail: outcome.detail,
    credentials: outcome.credentials,
  });
  return respond(outcome, req.json);
}

/** An outcome for a call the gate did not decide: the town's failure or an unreadable request. */
function failed(store: Store, req: CallRequest, error: string, result: "town-error" | "usage", detail: string): Outcome {
  const pass = req.token ? store.passByTokenHash(hashToken(req.token)) : null;
  return {
    stdout: "",
    error,
    exit: 1,
    result,
    notices: [],
    passId: pass?.id ?? null,
    grantId: null,
    shop: null,
    command: null,
    argvHash: argvHash(req.argv),
    shopExit: null,
    shopStderr: null,
    detail,
    credentials: [],
  };
}

export interface ServerOptions {
  dataDir: string;
  port?: number;
  runtime?: GateDeps["runtime"];
  timeoutMs?: number;
}

export interface TownServer {
  url: string;
  store: Store;
  close(): Promise<void>;
}

/** Starts a town on 127.0.0.1; `port: 0` picks a free one. */
export async function startServer(opts: ServerOptions): Promise<TownServer> {
  const store = openStore(opts.dataDir);
  // The vault's key is read at start when it is there; a store with sealed
  // rows and no key is refused here. When there is none yet, the operator
  // may make it after the town is up, so it is read on the first call that
  // opens a binding, and kept.
  let key: Buffer | null;
  try {
    key = requireKey(store.dataDir, store.sealedRows());
  } catch (err) {
    store.close();
    throw err;
  }
  const vault: Vault = {
    open(credentialId) {
      key ??= readKey(store.dataDir);
      if (!key) throw new VaultError(KEY_MISSING);
      return store.openCredential(credentialId, key);
    },
  };
  const deps: GateDeps = { store, vault, ...(opts.runtime ? { runtime: opts.runtime } : {}), ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) };

  const server = http.createServer((req, res) => {
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
      res.end(body);
    };
    if (req.method === "GET" && req.url === "/") return send(200, "text/plain; charset=utf-8", "town\n");
    if (req.method !== "POST" || req.url !== "/call") return send(404, "text/plain; charset=utf-8", "not found\n");

    const auth = req.headers.authorization ?? "";
    const token = /^Bearer (\S+)$/.exec(auth)?.[1] ?? null;
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (b: Buffer) => {
      size += b.length;
      if (size > BODY_LIMIT_BYTES) over = true;
      else chunks.push(b);
    });
    req.on("end", () => {
      void (async () => {
        let call: CallRequest | null = null;
        if (!over) call = parseCall(token, Buffer.concat(chunks).toString("utf8"));
        let wire: WireResponse;
        if (call) {
          wire = await handleCall(deps, call);
        } else {
          const blank: CallRequest = { token, argv: [], stdin: null, json: false };
          const o = failed(store, blank, over ? denials.stdinTooLarge(size) : denials.badCall(), "usage", over ? "body-too-large" : "bad-request");
          store.recordCall({
            at: Date.now(),
            passId: o.passId,
            grantId: null,
            shop: null,
            command: null,
            argvHash: o.argvHash,
            result: o.result,
            exit: o.exit,
            shopExit: null,
            latencyMs: 0,
            notices: [],
            stderr: null,
            detail: o.detail,
            credentials: [],
          });
          wire = respond(o, false);
        }
        send(200, "application/json", JSON.stringify(wire));
      })().catch((err: Error) => {
        send(500, "application/json", JSON.stringify({ stdout: "", stderr: `${denials.townFailed()}\n`, exit: 1, why: err.message }));
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 7000, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  store.setMeta("address", url);

  return {
    url,
    store,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}

function parseCall(token: string | null, body: string): CallRequest | null {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.argv) || !o.argv.every((a) => typeof a === "string")) return null;
  if (o.stdin !== undefined && o.stdin !== null && typeof o.stdin !== "string") return null;
  return { token, argv: o.argv as string[], stdin: (o.stdin as string | null | undefined) ?? null, json: o.json === true };
}

/**
 * The `.town/grant` in `dir` or any directory above it, or null. A
 * directory with one is an agent's, and the town's data directory must
 * not be under one: an agent working there could read or widen its own
 * grant. Both the path as given and the path with links resolved are
 * walked.
 */
export function agentGrantAbove(dir: string): string | null {
  const starts = [path.resolve(dir)];
  const real = nearestRealPath(path.resolve(dir));
  if (real !== starts[0]) starts.push(real);
  for (const start of starts) {
    let d = start;
    for (;;) {
      const candidate = path.join(d, ".town", "grant");
      if (existsSync(candidate)) return candidate;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  return null;
}

function nearestRealPath(p: string): string {
  const tail: string[] = [];
  let d = p;
  for (;;) {
    try {
      return path.join(realpathSync(d), ...tail);
    } catch {
      const up = path.dirname(d);
      if (up === d) return p;
      tail.unshift(path.basename(d));
      d = up;
    }
  }
}
