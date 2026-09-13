// The town: node:http on a loopback port over one data directory. `GET /`
// answers `town`; `POST /call` takes a bearer and { argv, stdin, json },
// runs the gate, writes one audit row whatever happened, and answers
// { stdout, stderr, exit }. In json mode stdout is the envelope and
// stderr is empty. Each call's id is minted before the gate runs, and a
// shop's own calls, answered at its clerk, are decided and recorded by the
// same path with their parent's id. Every shop's process runs within the
// wall of the kind the server is given, hiding its data directory: a kind
// it must be given, so nothing is served unwalled by omission.

import { existsSync, realpathSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { BODY_LIMIT_BYTES, parseCall, respond, type WireResponse } from "./clerk.js";
import { denials } from "./denials.js";
import { KEY_MISSING, argvHash, gate, newCallId, type CallRequest, type GateDeps, type Outcome, type Vault } from "./gate.js";
import { hashToken, openStore, type Store } from "./store.js";
import { VaultError, readKey, requireKey } from "./vault.js";
import { openWall, type Wall, type WallKind } from "./wall.js";

// The wire is the clerk's too, so it lives in clerk.ts; the server's names for it stay.
export { BODY_LIMIT_BYTES, respond, type WireResponse };

/** One call: the gate, one audit row, the response. */
export async function handleCall(deps: GateDeps, req: CallRequest): Promise<WireResponse> {
  return respond(await decideAndRecord(deps, req), req.json);
}

/**
 * The gate for one call, agent's or shop's, and its one audit row: the id
 * minted first, the row written whatever happened, a throw the town's
 * failure. Never throws. The gate it runs decides a shop's calls by this
 * same path, so every call in a tree has its row.
 */
export async function decideAndRecord(deps: GateDeps, req: CallRequest, signal?: AbortSignal): Promise<Outcome> {
  const started = performance.now();
  const at = (deps.now ?? Date.now)();
  const call: CallRequest = { ...req, callId: req.callId ?? newCallId() };
  const recorded: GateDeps = deps.decide ? deps : { ...deps, decide: decideAndRecord };
  let outcome: Outcome;
  try {
    outcome = await gate(recorded, call, signal);
  } catch (err) {
    // A VaultError's words are the gate's own and name no credential, path, or value: the operator's detail.
    outcome = failed(deps.store, call, denials.townFailed(), "town-error", err instanceof VaultError ? err.message : (err as Error).name);
  }
  deps.store.recordCall({
    callId: outcome.callId,
    parent: outcome.parent,
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
    wall: outcome.wall,
  });
  return outcome;
}

/** An outcome for a call the gate did not decide: the town's failure or an unreadable request. */
function failed(store: Store, req: CallRequest, error: string, result: "town-error" | "usage", detail: string): Outcome {
  const caller = req.caller;
  const pass = caller && "passId" in caller ? store.passById(caller.passId) : req.token ? store.passByTokenHash(hashToken(req.token)) : null;
  return {
    callId: req.callId ?? newCallId(),
    parent: caller?.parent ?? null,
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
    wall: null,
  };
}

export interface ServerOptions {
  dataDir: string;
  /** What encloses every shop's process; required, `none` included, and resolved by the caller before any listen. */
  wall: WallKind;
  port?: number;
  runtime?: GateDeps["runtime"];
  timeoutMs?: number;
}

export interface TownServer {
  url: string;
  /** The kind of wall every shop's process runs within. */
  wall: WallKind;
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
  let wall: Wall;
  try {
    wall = openWall(opts.wall, { data: store.dataDir });
  } catch (err) {
    store.close();
    throw err;
  }
  const deps: GateDeps = { store, vault, wall, decide: decideAndRecord, ...(opts.runtime ? { runtime: opts.runtime } : {}), ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) };

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
            callId: o.callId,
            parent: null,
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
            wall: null,
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
    wall: wall.kind,
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
