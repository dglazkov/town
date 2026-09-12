// ring: checkout
// A fake origin: a node:http server on 127.0.0.1 at a free port that
// records every request it is sent (method, url, headers, body length and
// hash) and answers as the test says, 200 "hello from the origin" by
// default. The vault's tests add it as a credential type so nothing needs
// a real token or the network. Run directly, it prints its URL and records
// to stdout until killed:
//   node test/helpers/origin.ts

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
  const o = await fakeOrigin();
  o.onRequest = (s) => process.stdout.write(`${JSON.stringify(s)}\n`);
  process.stdout.write(`${o.url}\n`);
}
