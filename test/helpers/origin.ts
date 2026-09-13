// ring: checkout
// A fake origin: a node:http server on 127.0.0.1 at a free port that
// records every request it is sent (method, url, headers, body length and
// hash) and answers as the test says, 200 "hello from the origin" by
// default. The vault's tests add it as a credential type so nothing needs
// a real token or the network. `scopedAnswer` answers as a provider whose
// tokens carry scopes: a path ending in `/comments` is 403 unless the
// request carries the one wide token. Run directly, it prints its URL and
// records to stdout until killed, answering so when given `--wide <token>`:
//   node test/helpers/origin.ts [--wide <token>]

import { createHash } from "node:crypto";
import http, { type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  bodyLength: number;
  bodySha256: string;
}

/** Answers one request; the body has been read whole. Leave `res` open to hold a request in flight. */
export type Answer = (req: IncomingMessage, res: ServerResponse, body: Buffer) => void;

export interface FakeOrigin {
  /** `http://127.0.0.1:<port>` */
  url: string;
  seen: Seen[];
  /** Called with each request as it is recorded, before it is answered. */
  onRequest?: (s: Seen) => void;
  close(): Promise<void>;
}

export const DEFAULT_ANSWER = "hello from the origin";

/** What the origin says to a narrow token at `comments`, as Figma says it, naming the scope it lacks. */
export const NARROW_ANSWER = '{"status":403,"err":"Invalid scope(s). This endpoint requires the file_comments:read scope"}';

/**
 * A provider whose tokens carry scopes: a request to a path ending in
 * `/comments` is answered 403 NARROW_ANSWER unless a header's value is the
 * `wide` token, alone or after a scheme like `Bearer`; everything else is
 * the default answer.
 */
export function scopedAnswer(wide: string): Answer {
  return (req, res) => {
    const carries = Object.values(req.headers).some((v) => typeof v === "string" && v.split(" ").at(-1) === wide);
    if (/\/comments(\?|$)/.test(req.url ?? "") && !carries) {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(NARROW_ANSWER);
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(DEFAULT_ANSWER);
  };
}

export async function fakeOrigin(answer?: Answer): Promise<FakeOrigin> {
  const sockets = new Set<Socket>();
  const origin: FakeOrigin = { url: "", seen: [], close: async () => {} };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (b: Buffer) => chunks.push(b));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const s: Seen = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        bodyLength: body.length,
        bodySha256: createHash("sha256").update(body).digest("hex"),
      };
      origin.seen.push(s);
      origin.onRequest?.(s);
      if (answer) return answer(req, res, body);
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(DEFAULT_ANSWER);
    });
  });
  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  origin.close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      for (const s of sockets) s.destroy();
    });
  return origin;
}

if (import.meta.main) {
  const at = process.argv.indexOf("--wide");
  const o = await fakeOrigin(at === -1 ? undefined : scopedAnswer(process.argv[at + 1]!));
  o.onRequest = (s) => process.stdout.write(`${JSON.stringify(s)}\n`);
  process.stdout.write(`${o.url}\n`);
}
