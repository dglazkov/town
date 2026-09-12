// The teller: the vault's window for one call. A listener on 127.0.0.1
// at a free port whose URL carries a random segment; a request under that
// segment is forwarded to the type's origin with the type's header set
// from the token, and the origin's answer comes back, both bodies
// streamed. It holds the token in this closure and nowhere else, writes
// nothing to any log, and after `close` its port refuses.

import { randomBytes, timingSafeEqual } from "node:crypto";
import http, { type ClientRequest, type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http";
import https from "node:https";
import type { AddressInfo, Socket } from "node:net";

export interface TellerOptions {
  /** An absolute http: or https: URL, perhaps with a base path; no query or fragment. */
  origin: string;
  /** `<Name>: <value>` with `{token}` where the token goes. */
  header: string;
  token: string;
}

export interface Teller {
  /** `http://127.0.0.1:<port>/<nonce>`; lives until `close`. */
  readonly url: string;
  /** How many requests were forwarded to the origin. */
  readonly requests: number;
  /** Stops the listener, destroys every open socket and in-flight upstream request, and resolves once closed. */
  close(): Promise<void>;
}

const HOP_BY_HOP = ["connection", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade"];

/** `<Name>: <value with {token}>` as a name and a value; null when it is not that shape. */
export function parseHeaderTemplate(header: string): { name: string; value: string } | null {
  const m = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*\S)[ \t]*$/.exec(header);
  if (!m || !m[2]!.includes("{token}") || /[\r\n]/.test(header)) return null;
  return { name: m[1]!, value: m[2]! };
}

/** The origin as a URL, or null when it is not an absolute http: or https: URL without query or fragment. */
export function parseOrigin(origin: string): URL | null {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.search !== "" || u.hash !== "" || origin.includes("?") || origin.includes("#")) return null;
  if (u.username !== "" || u.password !== "") return null;
  return u;
}

export async function openTeller(opts: TellerOptions): Promise<Teller> {
  const origin = parseOrigin(opts.origin);
  if (!origin) throw new Error("the type's origin is not an absolute http: or https: URL");
  const template = parseHeaderTemplate(opts.header);
  if (!template) throw new Error("the type's header is not '<Name>: <value with {token}>'");
  const headerName = template.name.toLowerCase();
  const headerValue = template.value.split("{token}").join(opts.token);
  if (/[\r\n]/.test(headerValue)) throw new Error("the credential's value cannot ride in a header");
  const basePath = origin.pathname.replace(/\/+$/, "");
  const client = origin.protocol === "https:" ? https : http;
  const hostname = origin.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = origin.port === "" ? undefined : Number(origin.port);

  const nonce = randomBytes(16).toString("hex");
  const prefix = Buffer.from(`/${nonce}`);
  let requests = 0;
  let closed = false;
  const sockets = new Set<Socket>();
  const upstreams = new Set<ClientRequest>();

  const empty = (res: ServerResponse, status: number) => {
    if (res.headersSent) return void res.destroy();
    res.writeHead(status, { "content-length": "0" });
    res.end();
  };

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const listening = (server.address() as AddressInfo | null)?.port;
    if (closed || req.headers.host !== `127.0.0.1:${listening}`) return empty(res, 404);
    const target = req.url ?? "";
    const head = Buffer.from(target.slice(0, prefix.length));
    const after = target.charAt(prefix.length);
    if (head.length !== prefix.length || !timingSafeEqual(head, prefix) || !(after === "" || after === "/" || after === "?")) {
      return empty(res, 404);
    }

    const rest = target.slice(prefix.length);
    const q = rest.indexOf("?");
    const restPath = q === -1 ? rest : rest.slice(0, q);
    const query = q === -1 ? "" : rest.slice(q);
    const joined = `${basePath}${restPath}` || "/";

    const headers = forwardHeaders(req.headers, [headerName]);
    headers[template.name] = headerValue;

    let upstream: ClientRequest;
    try {
      upstream = client.request({ protocol: origin.protocol, hostname, port, method: req.method, path: `${joined}${query}`, headers });
    } catch {
      return empty(res, 502);
    }
    requests++;
    upstreams.add(upstream);
    upstream.on("close", () => upstreams.delete(upstream));
    upstream.on("response", (answer: IncomingMessage) => {
      res.writeHead(answer.statusCode ?? 502, answer.statusMessage ?? "", forwardHeaders(answer.headers, []));
      answer.pipe(res);
      answer.on("error", () => res.destroy());
      answer.on("aborted", () => res.destroy());
    });
    // The origin could not be reached, or the answer broke off: the shop
    // sees a 502 or a cut connection, and nothing is written anywhere.
    upstream.on("error", () => empty(res, 502));
    req.on("error", () => upstream.destroy());
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
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
  const { port: listenPort } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${listenPort}/${nonce}`;

  let closing: Promise<void> | null = null;
  return {
    url,
    get requests() {
      return requests;
    },
    close() {
      closing ??= new Promise<void>((resolve) => {
        closed = true;
        server.close(() => resolve());
        for (const u of upstreams) u.destroy();
        for (const s of sockets) s.destroy();
      });
      return closing;
    },
  };
}

/**
 * A message's headers less `Host`, `Authorization`, the hop-by-hop set,
 * every header `Connection` names, and `also`; names lower-cased.
 */
function forwardHeaders(from: IncomingHttpHeaders, also: string[]): OutgoingHttpHeaders {
  const named = String(from.connection ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const drop = new Set(["host", "authorization", ...HOP_BY_HOP, ...named, ...also]);
  const out: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(from)) {
    if (value === undefined || drop.has(name) || name.startsWith("proxy-")) continue;
    out[name] = value;
  }
  return out;
}
