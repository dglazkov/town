// ring: checkout
// src/consent.ts, the flow of `townd admin credential connect`, in this
// process against the fake authorization server, the test delivering the
// redirect as a browser would: the URL's parameters, the guidance before
// it, the fake's redirect to the listener, the exchange with the verifier,
// the credential sealed with its scopes and its id printed, the browser
// told one line naming nothing, and one audit row. A redirect with the
// wrong state, a second one, and any other path are 404 with an empty
// body; the provider's `error`, an answer with no refresh token, and the
// timeout each end it with exit 1 and nothing written; and after every
// end the listener is closed and its port refuses. Refusals before any
// listener: a token type, a proposed type, a user the town lacks.

import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_CONNECTED, BROWSER_NOT_CONNECTED, CONSENT_TIMEOUT_MS, connect, type ConnectRequest } from "../src/consent.js";
import { parseValue } from "../src/oauth.js";
import { openStore, type Store } from "../src/store.js";
import { ensureKey } from "../src/vault.js";
import { browse, fakeAuthServer, type FakeAuth } from "./helpers/authserver.js";

const CLIENT = { clientId: "connect-client.apps", clientSecret: "connect-client-secret-4e7f" };
const GUIDANCE = "In the Google Cloud console, enable the Google Docs API and make an OAuth client of the Desktop type; give the town its client id and secret, then connect, which opens Google's consent page.";

let auth: FakeAuth;
let dir: string;
let store: Store;
let key: Buffer;

beforeAll(async () => {
  auth = await fakeAuthServer(CLIENT);
});
afterAll(async () => {
  await auth.close();
});

beforeEach(() => {
  Object.assign(auth, { mode: "ok", rotate: false, withRefreshToken: true, authorizeError: null, expiresIn: 3600, tokenDelayMs: 0 });
  auth.events.length = 0;
  dir = mkdtempSync(path.join(os.tmpdir(), "town-connect-test-"));
  store = openStore(dir);
  key = ensureKey(dir);
  store.addUser("dimitri");
  store.proposeType(
    { name: "google-oauth", origin: "http://127.0.0.1:9", header: "Authorization: Bearer {token}", guidance: GUIDANCE, oauth: { authorize: auth.authorize, token: auth.token, scopes: auth.scopes } },
    "dimitri/gdocs",
    false,
  );
  store.approveType("google-oauth", { client: { id: CLIENT.clientId, secret: CLIENT.clientSecret }, key });
});

afterEach(() => {
  vi.restoreAllMocks();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

interface Connected {
  exit: number;
  out: string;
  err: string;
  redirect: string;
  url: URL;
}

/**
 * The verb, with `browser` given the authorization URL and the listener's
 * address once it listens, as the person opening the URL. Returns what the
 * verb printed and its exit.
 */
async function connecting(browser: (url: URL, redirect: string) => Promise<void>, req: Partial<ConnectRequest> = {}): Promise<Connected> {
  let out = "";
  let err = "";
  let acted: Promise<void> = Promise.resolve();
  let redirect = "";
  let url: URL | null = null;
  const exit = await connect(store, () => key, { userName: "dimitri", type: "google-oauth", ...req }, {
    out: (s) => void (out += s),
    err: (s) => void (err += s),
    listening: (r) => {
      redirect = r;
      url = new URL(err.trimEnd().split("\n").at(-1)!);
      acted = browser(url, r);
    },
  });
  await acted;
  return { exit, out, err, redirect, url: url! };
}

/** The browser: the fake's redirect for the URL, then that redirect delivered to the listener; the listener's answer. */
async function consent(url: URL): Promise<{ status: number; body: string }> {
  const back = await fetch(await browse(url.toString()));
  return { status: back.status, body: await back.text() };
}

async function refuses(redirect: string): Promise<boolean> {
  return fetch(redirect).then(
    () => false,
    () => true,
  );
}

it("prints the guidance under the shop's name, then the URL; the redirect is exchanged with the verifier, the credential sealed with its scopes, the id printed, the browser told one line, and one row", async () => {
  let answered: { status: number; body: string } | null = null;
  const started = Date.now();
  const r = await connecting(async (url) => {
    answered = await consent(url);
  }, { label: "dimitri's docs" });
  expect(r.exit, r.err).toBe(0);
  expect(answered).toEqual({ status: 200, body: BROWSER_CONNECTED });
  expect(BROWSER_CONNECTED).toBe("connected; you can close this tab\n");

  // What the person reads: the shop's words, what to do, and the URL on a line of its own.
  const lines = r.err.trimEnd().split("\n");
  expect(lines).toHaveLength(3);
  expect(lines[0]).toBe(`dimitri/gdocs says: ${GUIDANCE}`);
  expect(lines[1]).toBe(`open this URL in a browser to connect google-oauth for dimitri; the redirect comes back to ${r.redirect} within 5m:`);
  expect(r.redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  const q = Object.fromEntries(r.url.searchParams);
  expect(`${r.url.origin}${r.url.pathname}`).toBe(auth.authorize);
  expect(q).toMatchObject({ response_type: "code", client_id: CLIENT.clientId, redirect_uri: r.redirect, scope: auth.scopes.join(" "), code_challenge_method: "S256", access_type: "offline", prompt: "consent" });
  expect(Buffer.from(q.state!, "base64url")).toHaveLength(16);
  expect(q.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(auth.events.map((e) => [e.kind, e.ok])).toEqual([["authorize", true], ["exchange", true]]);

  // The credential: its id alone on stdout, its scopes the granted ones, its value the tokens the fake issued, sealed.
  expect(r.out).toMatch(/^credential_[0-9a-f]{16}\n$/);
  const id = r.out.trim();
  expect(store.credentialById(id)).toMatchObject({ userName: "dimitri", type: "google-oauth", label: "dimitri's docs", scopes: auth.scopes, revokedAt: null });
  const value = parseValue(store.openCredential(id, key))!;
  expect(value).toMatchObject({ refresh_token: auth.issued.refresh.at(-1), access_token: auth.issued.access.at(-1), scope: auth.scopes.join(" ") });
  expect(value.expires_at).toBeGreaterThanOrEqual(started + 3_600_000);

  // One row: no pass, no shop, the seconds from the URL to the redirect.
  const rows = store.calls();
  expect(rows.map((c) => [c.passId, c.shop, c.command, c.result, c.exit, c.detail])).toEqual([[null, null, null, "ok", 0, "connected google-oauth for dimitri in 0s"]]);

  // Nothing printed or kept in the audit holds a token, the code, or the secret; the port refuses now.
  for (const text of [r.out, r.err, JSON.stringify(rows)]) {
    for (const secret of [...auth.issued.access, ...auth.issued.refresh, CLIENT.clientSecret]) expect(text).not.toContain(secret);
  }
  expect(await refuses(r.redirect)).toBe(true);
});

it("answers a wrong state, another path, another method, and a second redirect 404 with an empty body, and connects on the right one", async () => {
  auth.tokenDelayMs = 300;
  const seen: Array<[string, number, string]> = [];
  const r = await connecting(async (url, redirect) => {
    const location = await browse(url.toString());
    const wrong = new URL(location);
    wrong.searchParams.set("state", "not-the-state");
    for (const [label, target, init] of [
      ["a wrong state", wrong.toString(), {}],
      ["no state", `${redirect}?code=abc`, {}],
      ["another path", `${redirect}favicon.ico`, {}],
      ["the right redirect under another path", location.replace(redirect, `${redirect}callback`), {}],
      ["a POST", location, { method: "POST" }],
    ] as Array<[string, string, RequestInit]>) {
      const res = await fetch(target, init);
      seen.push([label, res.status, await res.text()]);
    }
    const first = fetch(location);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await fetch(location);
    seen.push(["a second redirect, while the first is exchanged", second.status, await second.text()]);
    const one = await first;
    seen.push(["the redirect", one.status, await one.text()]);
  });
  expect(r.exit, r.err).toBe(0);
  expect(seen).toEqual([
    ["a wrong state", 404, ""],
    ["no state", 404, ""],
    ["another path", 404, ""],
    ["the right redirect under another path", 404, ""],
    ["a POST", 404, ""],
    ["a second redirect, while the first is exchanged", 404, ""],
    ["the redirect", 200, BROWSER_CONNECTED],
  ]);
  expect(auth.events.filter((e) => e.kind === "exchange").map((e) => e.ok)).toEqual([true]);
  expect(store.listCredentials("dimitri")).toHaveLength(1);
});

it("prints the provider's error and exits 1 with nothing written when the person refuses, and the browser is told it did not connect", async () => {
  auth.authorizeError = "access_denied";
  let answered: { status: number; body: string } | null = null;
  const r = await connecting(async (url) => {
    answered = await consent(url);
  });
  expect(r.exit).toBe(1);
  expect(answered).toEqual({ status: 200, body: BROWSER_NOT_CONNECTED });
  expect(r.err.trimEnd().split("\n").at(-1)).toBe("townd admin: credential connect refused: google-oauth answered access_denied at consent; nothing was written");
  expect(r.out).toBe("");
  expect(store.listCredentials()).toEqual([]);
  expect(auth.events.filter((e) => e.kind === "exchange")).toEqual([]);
  expect(store.calls().map((c) => [c.passId, c.shop, c.result, c.exit, c.detail])).toEqual([[null, null, "denied", 1, "consent refused access_denied"]]);
  expect(await refuses(r.redirect)).toBe(true);
});

it("refuses an answer with no refresh token, saying what to check at the provider, and writes nothing", async () => {
  auth.withRefreshToken = false;
  const r = await connecting(async (url) => void (await consent(url)));
  expect(r.exit).toBe(1);
  expect(r.err.trimEnd().split("\n").at(-1)).toBe(
    "townd admin: credential connect refused: google-oauth answered with no refresh token, so the credential would stop working within the hour; at the provider, check the client is of the Desktop type and remove the town's access from the account, then connect again; nothing was written",
  );
  expect(store.listCredentials()).toEqual([]);
  expect(store.calls().map((c) => c.detail)).toEqual(["consent refused no refresh token"]);
  for (const secret of auth.issued.access) expect(r.err).not.toContain(secret);
  expect(await refuses(r.redirect)).toBe(true);
});

it("ends at the timeout, five minutes when omitted, with exit 1 and nothing written, the listener closed", async () => {
  expect(CONSENT_TIMEOUT_MS).toBe(300_000);
  const r = await connecting(async () => {}, { timeoutMs: 300 });
  expect(r.exit).toBe(1);
  expect(r.err.trimEnd().split("\n").at(-1)).toBe("townd admin: credential connect refused: no redirect came within 1s; nothing was written");
  expect(store.listCredentials()).toEqual([]);
  expect(store.calls().map((c) => [c.result, c.detail])).toEqual([["timeout", "consent refused timeout"]]);
  expect(await refuses(r.redirect)).toBe(true);
});

it("listens on 127.0.0.1 alone, at --port when given", async () => {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  let v6: string = "not tried";
  const r = await connecting(async (url, redirect) => {
    v6 = await fetch(redirect.replace("127.0.0.1", "[::1]")).then((res) => `answered ${res.status}`, () => "refused");
    await consent(url);
  }, { port });
  expect(r.exit, r.err).toBe(0);
  expect(r.redirect).toBe(`http://127.0.0.1:${port}/`);
  expect(v6).toBe("refused");
});

describe("refusals before any listener", () => {
  let listens: number;
  beforeEach(() => {
    listens = 0;
    const listen = http.Server.prototype.listen;
    vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (this: http.Server, ...args: unknown[]) {
      listens++;
      return (listen as (...a: unknown[]) => http.Server).apply(this, args);
    });
  });

  it("refuses a token type naming credential add, a proposed type naming type approve, and a user the town lacks, with nothing listening and no row", async () => {
    store.proposeType({ name: "figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}" }, "dimitri/figma", false);
    store.proposeType({ name: "other-oauth", origin: "https://api.example.test", header: "Authorization: Bearer {token}", oauth: { authorize: auth.authorize, token: auth.token, scopes: ["s"] } }, "dimitri/other", false);
    const io = { out: () => {}, err: () => {} };
    await expect(connect(store, () => key, { userName: "dimitri", type: "github-token" }, io)).rejects.toThrow(
      "type github-token is a token type, pasted and never connected; townd admin credential add --user dimitri --type github-token adds one, the secret on stdin",
    );
    await expect(connect(store, () => key, { userName: "dimitri", type: "figma" }, io)).rejects.toThrow("type figma is proposed by dimitri/figma and not yet the town's; townd admin type approve figma makes it so");
    await expect(connect(store, () => key, { userName: "dimitri", type: "other-oauth" }, io)).rejects.toThrow("type other-oauth is proposed by dimitri/other and not yet the town's; townd admin type approve other-oauth makes it so");
    await expect(connect(store, () => key, { userName: "ada", type: "google-oauth" }, io)).rejects.toThrow("user ada does not exist; add it with townd admin user add ada");
    await expect(connect(store, () => key, { userName: "dimitri", type: "nothing" }, io)).rejects.toThrow(/^type nothing is not a type this town holds/);
    expect(listens).toBe(0);
    expect(store.calls()).toEqual([]);
  });
});
