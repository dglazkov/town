// ring: checkout
// src/oauth.ts against the fake authorization server in this process,
// test/helpers/authserver.ts, which checks what a provider checks: the
// authorization URL's parameters; PKCE, the verifier hashed against the
// challenge the fake kept with the code; the exchange, the refresh, and a
// rotated refresh token; `invalid_grant`, a 500, and nothing answering,
// each a refusal whose words are the body's `error` alone and never the
// body, which quotes what it was sent. And the pieces the gate and the
// consent build on: an endpoint's shape, when a token is due, and the
// value after a refresh.

import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REFRESH_MARGIN_MS, authorizeUrl, due, exchange, newState, parseEndpoint, parseValue, pkce, refresh, refreshed, type Tokens } from "../src/oauth.js";
import { fakeAuthServer, type FakeAuth } from "./helpers/authserver.js";

const CLIENT = { clientId: "fake-client.apps", clientSecret: "fake-client-secret-5d1c" };
const SCOPES = ["https://www.googleapis.com/auth/documents.readonly"];
const REDIRECT = "http://127.0.0.1:53682/";

let auth: FakeAuth;

beforeAll(async () => {
  auth = await fakeAuthServer({ ...CLIENT, scopes: SCOPES });
});
afterAll(async () => {
  await auth.close();
});
beforeEach(() => {
  Object.assign(auth, { mode: "ok", rotate: false, withRefreshToken: true, authorizeError: null, expiresIn: 3600, tokenDelayMs: 0 });
  auth.events.length = 0;
});

/** What a browser does with the URL: the fake's redirect, read for its code and state. */
async function consent(challenge: string, state = newState()): Promise<URL> {
  const res = await fetch(authorizeUrl({ authorize: auth.authorize, clientId: CLIENT.clientId, redirect: REDIRECT, scopes: SCOPES, state, challenge }), { redirect: "manual" });
  expect(res.status, await res.text()).toBe(302);
  return new URL(res.headers.get("location")!);
}

async function tokens(): Promise<Tokens> {
  const { verifier, challenge } = pkce();
  const code = (await consent(challenge)).searchParams.get("code")!;
  const t = await exchange({ token: auth.token, ...CLIENT, code, verifier, redirect: REDIRECT });
  expect(t.ok).toBe(true);
  return t as Tokens;
}

describe("the authorization URL and PKCE", () => {
  it("carries a code asked for, the client, the loopback redirect, the scopes, the state, an S256 challenge, and offline consent, the endpoint's own query kept", () => {
    const u = new URL(authorizeUrl({ authorize: "https://accounts.example.test/o/auth?hl=en", clientId: "c1", redirect: REDIRECT, scopes: ["a", "b/c"], state: "st", challenge: "ch" }));
    expect(`${u.origin}${u.pathname}`).toBe("https://accounts.example.test/o/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      hl: "en",
      response_type: "code",
      client_id: "c1",
      redirect_uri: REDIRECT,
      scope: "a b/c",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
  });

  it("makes a verifier of 32 random bytes, its challenge the SHA-256 of it, and a state of 16 random bytes, each fresh", () => {
    const a = pkce();
    const b = pkce();
    expect(Buffer.from(a.verifier, "base64url")).toHaveLength(32);
    expect(a.challenge).toBe(createHash("sha256").update(a.verifier).digest("base64url"));
    expect(a.verifier).not.toBe(b.verifier);
    expect(Buffer.from(newState(), "base64url")).toHaveLength(16);
    expect(newState()).not.toBe(newState());
  });

  it("an endpoint is https:, or http: on a loopback host, with no userinfo or fragment", () => {
    for (const ok of ["https://oauth2.googleapis.com/token", "http://127.0.0.1:9/token", "http://localhost/x", "http://[::1]:80/t"]) expect(parseEndpoint(ok), ok).not.toBeNull();
    for (const no of ["http://oauth2.googleapis.com/token", "http://127.0.0.2/token", "ftp://127.0.0.1/", "https://u:p@example.com/", "https://example.com/#x", "token", 7]) expect(parseEndpoint(no), String(no)).toBeNull();
  });
});

describe("the exchange", () => {
  it("trades the code with the verifier the fake checks against the challenge, once, for the same redirect", async () => {
    const { verifier, challenge } = pkce();
    const back = await consent(challenge, "the-state");
    expect(back.searchParams.get("state")).toBe("the-state");
    const code = back.searchParams.get("code")!;

    const wrong = await exchange({ token: auth.token, ...CLIENT, code, verifier: pkce().verifier, redirect: REDIRECT });
    expect(wrong).toEqual({ ok: false, error: "invalid_grant", status: 400 });
    expect(auth.events.at(-1)).toMatchObject({ kind: "exchange", ok: false, why: "code_verifier" });

    const { verifier: v2, challenge: c2 } = pkce();
    const code2 = (await consent(c2)).searchParams.get("code")!;
    const elsewhere = await exchange({ token: auth.token, ...CLIENT, code: code2, verifier: v2, redirect: "http://127.0.0.1:1/" });
    expect(elsewhere).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(auth.events.at(-1)).toMatchObject({ why: "redirect_uri" });

    const { verifier: v3, challenge: c3 } = pkce();
    const code3 = (await consent(c3)).searchParams.get("code")!;
    const t = await exchange({ token: auth.token, ...CLIENT, code: code3, verifier: v3, redirect: REDIRECT });
    expect(t).toEqual({ ok: true, accessToken: auth.issued.access.at(-1), expiresIn: 3600, refreshToken: auth.issued.refresh.at(-1), scope: SCOPES.join(" ") });
    expect(await exchange({ token: auth.token, ...CLIENT, code: code3, verifier: v3, redirect: REDIRECT })).toMatchObject({ ok: false, error: "invalid_grant" });
    void verifier;
  });

  it("is refused for another client or secret", async () => {
    const { verifier, challenge } = pkce();
    const code = (await consent(challenge)).searchParams.get("code")!;
    expect(await exchange({ token: auth.token, clientId: CLIENT.clientId, clientSecret: "not-it", code, verifier, redirect: REDIRECT })).toEqual({ ok: false, error: "invalid_client", status: 401 });
  });

  it("answers with no refresh token when the provider sends none, for the consent to refuse", async () => {
    auth.withRefreshToken = false;
    const t = await tokens();
    expect(t.refreshToken).toBeUndefined();
  });
});

describe("the refresh", () => {
  it("trades a live refresh token for a new access token and keeps the refresh token when the provider does not rotate", async () => {
    const first = await tokens();
    const r = await refresh({ token: auth.token, ...CLIENT, refreshToken: first.refreshToken! });
    expect(r).toEqual({ ok: true, accessToken: auth.issued.access.at(-1), expiresIn: 3600, scope: SCOPES.join(" ") });
    expect((r as Tokens).accessToken).not.toBe(first.accessToken);
    expect(await refresh({ token: auth.token, ...CLIENT, refreshToken: first.refreshToken! })).toMatchObject({ ok: true });
  });

  it("returns a rotated refresh token, and the old one is refused after", async () => {
    const first = await tokens();
    auth.rotate = true;
    const r = (await refresh({ token: auth.token, ...CLIENT, refreshToken: first.refreshToken! })) as Tokens;
    expect(r.refreshToken).toBe(auth.issued.refresh.at(-1));
    expect(r.refreshToken).not.toBe(first.refreshToken);
    expect(await refresh({ token: auth.token, ...CLIENT, refreshToken: first.refreshToken! })).toEqual({ ok: false, error: "invalid_grant", status: 400 });
    expect(await refresh({ token: auth.token, ...CLIENT, refreshToken: r.refreshToken! })).toMatchObject({ ok: true });
  });

  it("is invalid_grant when the provider refuses, and a 500 is its status with the body's error word, and neither returns the body", async () => {
    const first = await tokens();
    auth.mode = "invalid_grant";
    const refused = await refresh({ token: auth.token, ...CLIENT, refreshToken: first.refreshToken! });
    expect(refused).toEqual({ ok: false, error: "invalid_grant", status: 400 });
    auth.mode = "500";
    const failed = await refresh({ token: auth.token, ...CLIENT, refreshToken: first.refreshToken! });
    expect(failed).toEqual({ ok: false, error: "backend_error", status: 500 });
    // The fake's bodies quoted the refresh token and the secret; the answers carry neither, nor any of the body's prose.
    for (const e of auth.events.filter((x) => x.kind === "refresh" && !x.ok)) expect(e.tokens).toContain(first.refreshToken);
    for (const text of [JSON.stringify(refused), JSON.stringify(failed)]) {
      for (const needle of [first.refreshToken!, CLIENT.clientSecret, "you sent", "refused"]) expect(text).not.toContain(needle);
    }
  });

  it("is unreachable, status 0, when nothing answers, and refuses an endpoint that is not https: or loopback without sending", async () => {
    const dead = await fakeAuthServer(CLIENT);
    const token = dead.token;
    await dead.close();
    expect(await refresh({ token, ...CLIENT, refreshToken: "r" })).toEqual({ ok: false, error: "unreachable", status: 0 });
    expect(await refresh({ token: "http://oauth2.example.test/token", ...CLIENT, refreshToken: "r" })).toEqual({ ok: false, error: "endpoint", status: 0 });
  });
});

describe("the value", () => {
  const NOW = Date.UTC(2026, 8, 13, 12);
  it("is due within the margin of a minute and past it, and not with more than a minute left", () => {
    expect(REFRESH_MARGIN_MS).toBe(60_000);
    expect(due(NOW + 60_001, NOW)).toBe(false);
    expect(due(NOW + 60_000, NOW)).toBe(true);
    expect(due(NOW - 1, NOW)).toBe(true);
  });

  it("after a refresh holds the new access token and expiry, the rotated refresh token when one came, and reads back as a value", () => {
    const v = { refresh_token: "r1", access_token: "a1", expires_at: NOW, scope: "s" };
    expect(refreshed(v, { ok: true, accessToken: "a2", expiresIn: 3599 }, NOW)).toEqual({ refresh_token: "r1", access_token: "a2", expires_at: NOW + 3_599_000, scope: "s" });
    expect(refreshed(v, { ok: true, accessToken: "a3", expiresIn: 10, refreshToken: "r2", scope: "t" }, NOW)).toEqual({ refresh_token: "r2", access_token: "a3", expires_at: NOW + 10_000, scope: "t" });
    expect(parseValue(JSON.stringify(v))).toEqual(v);
    expect(parseValue("a token pasted")).toBeNull();
    expect(parseValue(JSON.stringify({ ...v, expires_at: "soon" }))).toBeNull();
  });
});
