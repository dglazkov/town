// ring: checkout
// The teller (journey 3 steps 2 to 4): a loopback window for one call that
// forwards to the type's origin with the type's header set from the token.
// Against a fake origin on loopback: the header arrives, the shop's own
// Authorization is replaced, the nonce and Host are required, bodies
// stream both ways whole, the origin's status comes through, and after
// close the port refuses.

import { createHash, randomBytes } from "node:crypto";
import http, { type IncomingHttpHeaders } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openTeller, type Teller } from "../src/teller.js";
import { fakeOrigin, type Answer, type FakeOrigin } from "./helpers/origin.js";

const TOKEN = "tok_" + randomBytes(12).toString("hex");
const BEARER = "Authorization: Bearer {token}";

let origin: FakeOrigin;
const open: Teller[] = [];

async function teller(o: { origin?: string; header?: string } = {}): Promise<Teller> {
  const t = await openTeller({ origin: o.origin ?? origin.url, header: o.header ?? BEARER, token: TOKEN });
  open.push(t);
  return t;
}

async function withOrigin(answer?: Answer): Promise<void> {
  await origin.close();
  origin = await fakeOrigin(answer);
}

beforeEach(async () => {
  origin = await fakeOrigin();
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((t) => t.close()));
  await origin.close();
});

interface Got {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** One request with a connection of its own; `host` overrides the Host header. */
function send(url: string, o: { method?: string; headers?: Record<string, string>; host?: string; body?: Buffer | Buffer[] } = {}): Promise<Got> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        method: o.method ?? "GET",
        path: `${u.pathname}${u.search}`,
        headers: { ...(o.host ? { host: o.host } : {}), ...o.headers },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (b: Buffer) => chunks.push(b));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    const parts = o.body === undefined ? [] : Array.isArray(o.body) ? o.body : [o.body];
    for (const p of parts) req.write(p);
    req.end();
  });
}

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("forwarding", () => {
  it("sends the method, path, query, and headers to the origin with the type's header set from the token", async () => {
    const t = await teller();
    const r = await send(`${t.url}/repos/octo/cat/issues?state=all&limit=3`, { method: "DELETE", headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe("hello from the origin");
    expect(origin.seen).toHaveLength(1);
    const seen = origin.seen[0]!;
    expect(seen.method).toBe("DELETE");
    expect(seen.url).toBe("/repos/octo/cat/issues?state=all&limit=3");
    expect(seen.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(seen.headers.accept).toBe("application/vnd.github+json");
    expect(seen.headers["x-github-api-version"]).toBe("2022-11-28");
    expect(seen.headers.host).toBe(new URL(origin.url).host);
  });

  it("replaces an Authorization the shop sets with the type's", async () => {
    const t = await teller();
    await send(`${t.url}/x`, { headers: { authorization: "Bearer the-shop's-own" } });
    expect(origin.seen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(origin.seen[0]!.headers)).not.toContain("the-shop's-own");
  });

  it("with a type whose header is not Authorization, drops the shop's Authorization and its own copy of the header", async () => {
    const t = await teller({ header: "X-Api-Key: key={token}" });
    await send(`${t.url}/x`, { headers: { authorization: "Bearer mine", "x-api-key": "mine too" } });
    const h = origin.seen[0]!.headers;
    expect(h["x-api-key"]).toBe(`key=${TOKEN}`);
    expect(h).not.toHaveProperty("authorization");
  });

  it("drops Host and the hop-by-hop headers, including any Connection names", async () => {
    const t = await teller();
    await send(`${t.url}/x`, { headers: { connection: "close, x-drop-me", "x-drop-me": "1", "proxy-authorization": "Basic abc", "x-kept": "yes" } });
    const h = origin.seen[0]!.headers;
    expect(h).not.toHaveProperty("x-drop-me");
    expect(h).not.toHaveProperty("proxy-authorization");
    expect(h["x-kept"]).toBe("yes");
  });

  it("joins the path onto an origin's base path without doubling a slash", async () => {
    const t = await teller({ origin: `${origin.url}/api/v3/` });
    await send(`${t.url}/repos/a`);
    await send(`${t.url}?q=1`);
    expect(origin.seen.map((s) => s.url)).toEqual(["/api/v3/repos/a", "/api/v3?q=1"]);
  });

  it("streams a megabyte both ways whole", async () => {
    const back = randomBytes(1024 * 1024);
    await withOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      for (let i = 0; i < back.length; i += 64 * 1024) res.write(back.subarray(i, i + 64 * 1024));
      res.end();
    });
    const t = await teller();
    const sent = randomBytes(1024 * 1024);
    const chunks = Array.from({ length: 16 }, (_, i) => sent.subarray(i * 64 * 1024, (i + 1) * 64 * 1024));
    const r = await send(`${t.url}/upload`, { method: "POST", body: chunks });
    expect(r.status).toBe(200);
    expect(origin.seen[0]!.bodyLength).toBe(sent.length);
    expect(origin.seen[0]!.bodySha256).toBe(sha(sent));
    expect(r.body.length).toBe(back.length);
    expect(sha(r.body)).toBe(sha(back));
  });

  it("passes the origin's status, headers, and body through", async () => {
    await withOrigin((_req, res) => {
      res.writeHead(503, { "retry-after": "7", "content-type": "text/plain" });
      res.end("try later");
    });
    const t = await teller();
    const r = await send(`${t.url}/x`);
    expect(r.status).toBe(503);
    expect(r.headers["retry-after"]).toBe("7");
    expect(r.body.toString()).toBe("try later");
  });

  it("answers 502 with an empty body when the origin cannot be reached", async () => {
    const url = origin.url;
    await origin.close();
    const t = await teller({ origin: url });
    const r = await send(`${t.url}/x`);
    expect(r.status).toBe(502);
    expect(r.body).toHaveLength(0);
  });
});

describe("the window", () => {
  it("is on 127.0.0.1 with sixteen random bytes as its first segment", async () => {
    const t = await teller();
    expect(t.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/);
  });

  it("answers 404 with an empty body, and forwards nothing, to a request without the nonce", async () => {
    const t = await teller();
    const u = new URL(t.url);
    const nonce = u.pathname.slice(1);
    const base = `http://127.0.0.1:${u.port}`;
    for (const p of ["/", "/x", `/${"0".repeat(32)}/x`, `/${nonce}x/y`, `/${nonce.slice(0, 31)}`, `/x/${nonce}/y`]) {
      const r = await send(`${base}${p}`);
      expect(r.status, p).toBe(404);
      expect(r.body, p).toHaveLength(0);
    }
    expect(origin.seen).toEqual([]);
    expect(t.requests).toBe(0);
  });

  it("answers 404, and forwards nothing, to a request whose Host is not the listener", async () => {
    const t = await teller();
    const port = new URL(t.url).port;
    for (const host of ["api.github.com", `localhost:${port}`, "127.0.0.1", `127.0.0.1:${Number(port) + 1}`, `evil.example:${port}`]) {
      const r = await send(`${t.url}/x`, { host });
      expect(r.status, host).toBe(404);
      expect(r.body, host).toHaveLength(0);
    }
    expect(origin.seen).toEqual([]);
  });

  it("counts the requests it forwarded, and not the ones it refused", async () => {
    const t = await teller();
    await send(`${t.url}/a`);
    await send(`${t.url}/b`, { method: "POST", body: Buffer.from("x") });
    await send(`${t.url.replace(/\/[0-9a-f]+$/, "")}/nope`);
    await send(`${t.url}/c`, { host: "elsewhere" });
    await send(`${t.url}/d`);
    expect(t.requests).toBe(3);
    expect(origin.seen).toHaveLength(3);
  });

  it("is never shared: two tellers of one type and token have two URLs", async () => {
    const a = await teller();
    const b = await teller();
    expect(a.url).not.toBe(b.url);
    expect(new URL(a.url).port).not.toBe(new URL(b.url).port);
    expect(new URL(a.url).pathname).not.toBe(new URL(b.url).pathname);
    await send(`${a.url}/x`);
    expect([a.requests, b.requests]).toEqual([1, 0]);
  });
});

describe("close", () => {
  it("refuses the next connection at the socket", async () => {
    const t = await teller();
    expect((await send(`${t.url}/x`)).status).toBe(200);
    await t.close();
    const err = await send(`${t.url}/x`).then(() => null, (e: NodeJS.ErrnoException) => e);
    expect(err?.code).toBe("ECONNREFUSED");
    expect(origin.seen).toHaveLength(1);
  });

  it("aborts a request in flight, on both sides", async () => {
    let originSawClose!: () => void;
    const originClosed = new Promise<void>((r) => (originSawClose = r));
    await withOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first part ");
      res.on("close", () => originSawClose());
    });
    const t = await teller();
    const u = new URL(t.url);
    const outcome = await new Promise<string>((resolve) => {
      const req = http.request({ hostname: u.hostname, port: u.port, path: `${u.pathname}/slow`, agent: false }, (res) => {
        res.once("data", () => void t.close());
        res.on("end", () => resolve("ended"));
        res.on("aborted", () => resolve("aborted"));
        res.on("error", () => resolve("aborted"));
      });
      req.on("error", () => resolve("aborted"));
      req.end();
    });
    expect(outcome).toBe("aborted");
    await originClosed;
  });
});
