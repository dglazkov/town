// The teller: the vault's window for one call. A listener on 127.0.0.1
// at a free port whose URL carries a random segment; a request under that
// segment is forwarded to the type's origin with the type's header set
// from the token, and the origin's answer comes back, both bodies
// streamed. It holds the token in this closure and nowhere else, writes
// nothing to any log, and after `close` its port refuses. The rule it
// forwards by, the origin and header parsed, the path joined, the header
// set, and the hop's headers dropped, is src/window.ts's.

import { randomBytes, timingSafeEqual } from "node:crypto";
import http, { type ClientRequest, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http";
import https from "node:https";
import type { AddressInfo, Socket } from "node:net";
import { forwardHeaders, forwardPath, parseHeaderTemplate, parseOrigin, signedHeader } from "./window.js";

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

export async function openTeller(opts: TellerOptions): Promise<Teller> {
  const origin = parseOrigin(opts.origin);
  if (!origin) throw new Error("the type's origin is not an absolute http: or https: URL");
  const template = parseHeaderTemplate(opts.header);
  if (!template) throw new Error("the type's header is not '<Name>: <value with {token}>'");
  const signed = signedHeader(template, opts.token);
  if (!signed) throw new Error("the credential's value cannot ride in a header");
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

    const headers: OutgoingHttpHeaders = forwardHeaders(req.headers, [signed.name]);
    headers[signed.name] = signed.value;

    let upstream: ClientRequest;
    try {
      upstream = client.request({ protocol: origin.protocol, hostname, port, method: req.method, path: forwardPath(origin, target.slice(prefix.length)), headers });
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
