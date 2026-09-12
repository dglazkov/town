// The clerk: the town's window for a shop's own calls, for one call. A
// listener on 127.0.0.1 at a free port that answers `POST /call` with a
// bearer made for this call alone, as the town answers the agent: it reads
// { argv, stdin, json } as the server does and writes back what `answer`
// gives. Any other bearer, or none, is an invalid pass. It knows nothing
// of grants; after `close` its port refuses and every answer in flight is
// aborted. The wire both windows write lives here, and the server takes
// it from here.

import { randomBytes, timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { denials } from "./denials.js";
import type { CallRequest, Outcome } from "./gate.js";
import { renderNotices } from "./notices.js";

export interface WireResponse {
  stdout: string;
  stderr: string;
  exit: number;
}

/** The largest request body read; a call's stdin is refused past one megabyte by the gate, and JSON escaping can grow it. */
export const BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/** The response the agent's binary prints: plain, or the `--json` envelope. */
export function respond(o: Pick<Outcome, "stdout" | "error" | "exit" | "notices">, json: boolean): WireResponse {
  if (json) {
    const envelope: Record<string, unknown> = { ok: o.exit === 0, output: o.stdout, notices: o.notices, exit: o.exit };
    if (o.exit !== 0) envelope.error = o.error;
    return { stdout: `${JSON.stringify(envelope)}\n`, stderr: "", exit: o.exit };
  }
  const error = o.error === "" ? "" : o.error.endsWith("\n") ? o.error : `${o.error}\n`;
  return { stdout: o.stdout, stderr: renderNotices(o.notices) + error, exit: o.exit };
}

/** A request body as a call, or null when it is not `{ argv: string[], stdin?: string | null, json?: bool }`. */
export function parseCall(token: string | null, body: string): CallRequest | null {
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

/** What a shop's call carries to the town, less the bearer. */
export interface ClerkCall {
  argv: string[];
  stdin: string | null;
  json: boolean;
}

/** What the town answers a shop's call: the wire, and the gate's line when it denied, which the clerk keeps and never sends. */
export interface ClerkAnswer extends WireResponse {
  denial: string | null;
}

/** The town's answer to one call; `signal` is aborted when the clerk closes. */
export type Answer = (call: ClerkCall, signal: AbortSignal) => Promise<ClerkAnswer>;

export interface Clerk {
  /** `http://127.0.0.1:<port>`; lives until `close`. */
  readonly url: string;
  /** Thirty-two random bytes, base64url, good here alone. */
  readonly token: string;
  /** How many calls `answer` answered. */
  readonly calls: number;
  /** The first denial among the answers, or null. */
  readonly denied: string | null;
  /** Stops the listener, aborts every answer in flight, and resolves once they have settled and the port refuses. */
  close(): Promise<void>;
}

export async function openClerk(opts: { answer: Answer }): Promise<Clerk> {
  const token = randomBytes(32).toString("base64url");
  const expected = Buffer.from(`Bearer ${token}`);
  let calls = 0;
  let denied: string | null = null;
  let closed = false;
  const sockets = new Set<Socket>();
  const inFlight = new Map<AbortController, Promise<unknown>>();

  const send = (res: ServerResponse, status: number, type: string, body: string) => {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
    res.end(body);
  };
  const wire = (res: ServerResponse, w: WireResponse) => send(res, 200, "application/json", JSON.stringify({ stdout: w.stdout, stderr: w.stderr, exit: w.exit }));

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const listening = (server.address() as AddressInfo | null)?.port;
    if (closed || req.headers.host !== `127.0.0.1:${listening}`) return send(res, 404, "text/plain; charset=utf-8", "not found\n");
    if (req.method === "GET" && req.url === "/") return send(res, 200, "text/plain; charset=utf-8", "town\n");
    if (req.method !== "POST" || req.url !== "/call") return send(res, 404, "text/plain; charset=utf-8", "not found\n");

    const auth = Buffer.from(req.headers.authorization ?? "");
    const bearerOk = auth.length === expected.length && timingSafeEqual(auth, expected);
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (b: Buffer) => {
      size += b.length;
      if (size > BODY_LIMIT_BYTES) over = true;
      else chunks.push(b);
    });
    req.on("end", () => {
      const quiet = { stdout: "", notices: [] };
      if (over) return wire(res, respond({ ...quiet, error: denials.stdinTooLarge(size), exit: 1 }, false));
      const call = parseCall(null, Buffer.concat(chunks).toString("utf8"));
      if (!call) return wire(res, respond({ ...quiet, error: denials.badCall(), exit: 1 }, false));
      if (!bearerOk || closed) return wire(res, respond({ ...quiet, error: denials.invalidPass(), exit: 3 }, call.json));

      const controller = new AbortController();
      const done = opts
        .answer({ argv: call.argv, stdin: call.stdin, json: call.json }, controller.signal)
        .then((a) => {
          calls++;
          if (a.denial !== null && denied === null) denied = a.denial;
          wire(res, a);
        })
        .catch(() => wire(res, respond({ ...quiet, error: denials.townFailed(), exit: 1 }, call.json)))
        .finally(() => inFlight.delete(controller));
      inFlight.set(controller, done);
    });
  });

  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  let closing: Promise<void> | null = null;
  return {
    url,
    token,
    get calls() {
      return calls;
    },
    get denied() {
      return denied;
    },
    close() {
      closing ??= (async () => {
        closed = true;
        const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
        const pending = [...inFlight.values()];
        for (const c of inFlight.keys()) c.abort();
        await Promise.allSettled(pending);
        for (const s of sockets) s.destroy();
        await stopped;
      })();
      return closing;
    },
  };
}
