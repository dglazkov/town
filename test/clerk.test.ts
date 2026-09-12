// ring: checkout
// The clerk (journey 3 step 5, at its own port): a loopback window for one
// call that answers `POST /call` with its own bearer as the town would,
// against a fake answer. Any other bearer, or none, is an invalid pass with
// exit 3 and `answer` never runs; `Host` is checked; `GET /` is `town`;
// calls are counted and the first denial kept and never sent; `close`
// aborts an answer in flight, and the port refuses after.

import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { openClerk, type Answer, type Clerk, type ClerkCall } from "../src/clerk.js";
import { denials } from "../src/denials.js";

const open: Clerk[] = [];
let seen: ClerkCall[];

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

async function clerk(answer?: Answer): Promise<Clerk> {
  seen = [];
  const c = await openClerk({
    answer:
      answer ??
      (async (call) => {
        seen.push(call);
        return { stdout: `answered ${call.argv.join(" ")}\n`, stderr: "", exit: 0, denial: null };
      }),
  });
  open.push(c);
  return c;
}

interface Got {
  status: number;
  body: string;
}

/** One request on a connection of its own; `host` overrides the Host header. */
function send(url: string, o: { method?: string; path?: string; auth?: string; host?: string; body?: string } = {}): Promise<Got> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        method: o.method ?? "POST",
        path: o.path ?? "/call",
        headers: { ...(o.host ? { host: o.host } : {}), ...(o.auth ? { authorization: o.auth } : {}), "content-type": "application/json" },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (b: Buffer) => chunks.push(b));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

const body = (argv: string[], extra: Record<string, unknown> = {}) => JSON.stringify({ argv, stdin: null, json: false, ...extra });

function refused(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { agent: false }, (res) => {
      res.resume();
      resolve(false);
    });
    req.on("error", (e: NodeJS.ErrnoException) => resolve(e.code === "ECONNREFUSED"));
  });
}

describe("the bearer", () => {
  it("is its own token: a call with it is answered with what answer gives, and counted", async () => {
    const c = await clerk();
    expect(c.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(c.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const r = await send(c.url, { auth: `Bearer ${c.token}`, body: body(["memory", "recall", "--key", "k"], { stdin: "piped" }) });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ stdout: "answered memory recall --key k\n", stderr: "", exit: 0 });
    expect(seen).toEqual([{ argv: ["memory", "recall", "--key", "k"], stdin: "piped", json: false }]);
    expect(c.calls).toBe(1);
  });

  it("answers any other bearer, or none, as an invalid pass with exit 3, plain or in the envelope, and never runs answer", async () => {
    const c = await clerk();
    const other = await clerk();
    const wrong = [undefined, "Bearer ", `Bearer ${other.token}`, `Bearer ${c.token}x`, `Bearer ${c.token.slice(1)}`, c.token, `bearer ${c.token}`, `Basic ${c.token}`];
    for (const auth of wrong) {
      const r = await send(c.url, { ...(auth === undefined ? {} : { auth }), body: body(["--help"]) });
      expect([auth, r.status, JSON.parse(r.body)]).toEqual([auth, 200, { stdout: "", stderr: `${denials.invalidPass()}\n`, exit: 3 }]);
      const j = await send(c.url, { ...(auth === undefined ? {} : { auth }), body: body(["--help"], { json: true }) });
      expect(JSON.parse(JSON.parse(j.body).stdout)).toEqual({ ok: false, output: "", notices: [], exit: 3, error: denials.invalidPass() });
    }
    expect(seen).toEqual([]);
    expect(c.calls).toBe(0);
  });

  it("reads a body that is not a call as the town does: exit 1, answer never run", async () => {
    const c = await clerk();
    const r = await send(c.url, { auth: `Bearer ${c.token}`, body: "{not json" });
    expect(JSON.parse(r.body)).toEqual({ stdout: "", stderr: `${denials.badCall()}\n`, exit: 1 });
    expect(seen).toEqual([]);
  });
});

describe("the listener", () => {
  it("checks Host, answers GET / with town, and anything else with 404", async () => {
    const c = await clerk();
    const auth = `Bearer ${c.token}`;
    expect(await send(c.url, { method: "GET", path: "/" })).toEqual({ status: 200, body: "town\n" });
    expect((await send(c.url, { auth, host: "localhost", body: body(["--help"]) })).status).toBe(404);
    expect((await send(c.url, { method: "GET", path: "/", host: `evil.example:${new URL(c.url).port}` })).status).toBe(404);
    expect((await send(c.url, { auth, path: "/call/more", body: body(["--help"]) })).status).toBe(404);
    expect((await send(c.url, { auth, method: "GET", path: "/call" })).status).toBe(404);
    expect(seen).toEqual([]);
  });

  it("keeps the first denial for its opener and never sends it", async () => {
    let n = 0;
    const c = await clerk(async () => {
      n++;
      return { stdout: "", stderr: n === 1 ? "" : `denied ${n}\n`, exit: n === 1 ? 0 : 2, denial: n === 1 ? null : `error: line ${n}` };
    });
    const auth = `Bearer ${c.token}`;
    const bodies = [];
    for (let i = 0; i < 3; i++) bodies.push((await send(c.url, { auth, body: body(["x"]) })).body);
    expect(bodies.map((b) => JSON.parse(b))).toEqual([
      { stdout: "", stderr: "", exit: 0 },
      { stdout: "", stderr: "denied 2\n", exit: 2 },
      { stdout: "", stderr: "denied 3\n", exit: 2 },
    ]);
    expect(bodies.join("")).not.toContain("error: line");
    expect([c.calls, c.denied]).toEqual([3, "error: line 2"]);
  });
});

describe("close", () => {
  it("aborts an answer in flight, resolves once it has settled, and refuses the next connection", async () => {
    let started!: () => void;
    const inFlight = new Promise<void>((r) => (started = r));
    let abortedWith: boolean | null = null;
    const c = await clerk(
      (_call, signal) =>
        new Promise((resolve) => {
          started();
          signal.addEventListener("abort", () => {
            abortedWith = signal.aborted;
            resolve({ stdout: "", stderr: "", exit: 1, denial: null });
          });
        }),
    );
    const pending = send(c.url, { auth: `Bearer ${c.token}`, body: body(["sleep"]) }).catch((e: Error) => e);
    await inFlight;
    expect(abortedWith).toBeNull();
    await c.close();
    expect(abortedWith).toBe(true);
    await pending;
    expect(await refused(`${c.url}/`)).toBe(true);
    await c.close(); // twice is once
  });
});
