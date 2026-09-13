// The oauth kind: an authorization server's two doors, as a desktop app
// uses them. `authorizeUrl` builds the URL a person opens, with PKCE's
// challenge and a state; `exchange` trades the code the redirect brought
// for tokens, and `refresh` trades a refresh token for an access token,
// each one POST of a form to the type's token endpoint. An answer is read
// for its fields alone: a refusal's body is read for its `error` and
// nothing else, since a body can quote a token. It knows nothing of the
// store; the gate, the admin, and src/consent.ts write what it returns.

import { createHash, randomBytes } from "node:crypto";

/** How long before an access token's expiry it is refreshed: within a minute, or past it. */
export const REFRESH_MARGIN_MS = 60_000;

/** How long a request to the token endpoint may take before it is a failure. */
export const TOKEN_TIMEOUT_MS = 15_000;

/** An `oauth` credential's sealed value, as JSON: what the provider gave, and when the access token ends. */
export interface OAuthValue {
  refresh_token: string;
  access_token: string;
  /** Milliseconds since the epoch. */
  expires_at: number;
  /** The granted scopes, space-separated, as the provider wrote them. */
  scope: string;
}

/** An answer with tokens: the access token and its life, and the refresh token and scope when the provider sent them. */
export interface Tokens {
  ok: true;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
}

/**
 * A refusal or a failure: the answer's status and its body's `error` when
 * that is a plain word, `malformed` for a 2xx that is not an answer, or
 * status 0 and `unreachable` when nothing answered.
 */
export interface TokenError {
  ok: false;
  error: string;
  status: number;
}

/** An endpoint as a type may hold one: an https: URL, or http: on a loopback host, as RFC 8252 allows; null otherwise. */
export function parseEndpoint(text: unknown): URL | null {
  if (typeof text !== "string") return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.username !== "" || u.password !== "" || u.hash !== "") return null;
  if (u.protocol === "https:") return u;
  return u.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname) ? u : null;
}

/** A PKCE verifier of 32 random bytes and its S256 challenge, both base64url. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier, "ascii").digest("base64url") };
}

/** A consent's state: sixteen random bytes, base64url. */
export function newState(): string {
  return randomBytes(16).toString("base64url");
}

/** The URL a person opens to consent: a code asked for, with the challenge, the state, the scopes, and the loopback redirect, offline so a refresh token comes back. */
export function authorizeUrl(o: { authorize: string; clientId: string; redirect: string; scopes: readonly string[]; state: string; challenge: string }): string {
  const u = new URL(o.authorize);
  const params: Array<[string, string]> = [
    ["response_type", "code"],
    ["client_id", o.clientId],
    ["redirect_uri", o.redirect],
    ["scope", o.scopes.join(" ")],
    ["state", o.state],
    ["code_challenge", o.challenge],
    ["code_challenge_method", "S256"],
    ["access_type", "offline"],
    ["prompt", "consent"],
  ];
  for (const [k, v] of params) u.searchParams.set(k, v);
  return u.toString();
}

/** The code the redirect brought, traded for tokens with the verifier. */
export function exchange(o: { token: string; clientId: string; clientSecret: string; code: string; verifier: string; redirect: string }): Promise<Tokens | TokenError> {
  return post(o.token, { grant_type: "authorization_code", code: o.code, redirect_uri: o.redirect, client_id: o.clientId, client_secret: o.clientSecret, code_verifier: o.verifier });
}

/** A refresh token traded for an access token, and a new refresh token when the provider rotates it. */
export function refresh(o: { token: string; clientId: string; clientSecret: string; refreshToken: string }): Promise<Tokens | TokenError> {
  return post(o.token, { grant_type: "refresh_token", refresh_token: o.refreshToken, client_id: o.clientId, client_secret: o.clientSecret });
}

/** Whether an access token ending at `expiresAt` is to be refreshed at `now`: when it is not more than the margin away. */
export function due(expiresAt: number, now: number): boolean {
  return expiresAt - now <= REFRESH_MARGIN_MS;
}

/** The value after a refresh answered at `now`: the new access token and expiry, the rotated refresh token when one came, the scope when one came. */
export function refreshed(value: OAuthValue, t: Tokens, now: number): OAuthValue {
  return {
    refresh_token: t.refreshToken ?? value.refresh_token,
    access_token: t.accessToken,
    expires_at: now + t.expiresIn * 1000,
    scope: t.scope ?? value.scope,
  };
}

/** A sealed value opened, read as an `oauth` credential's; null when it is not one. */
export function parseValue(text: string): OAuthValue | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.refresh_token !== "string" || typeof o.access_token !== "string" || typeof o.expires_at !== "number" || typeof o.scope !== "string") return null;
  return { refresh_token: o.refresh_token, access_token: o.access_token, expires_at: o.expires_at, scope: o.scope };
}

/** A word safe to print from a provider: letters, digits, and `_.-`, or `unknown`. */
export function word(v: unknown): string {
  return typeof v === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : "unknown";
}

async function post(endpoint: string, form: Record<string, string>): Promise<Tokens | TokenError> {
  if (!parseEndpoint(endpoint)) return { ok: false, error: "endpoint", status: 0 };
  const body = new URLSearchParams(Object.entries(form).filter(([k, v]) => !(k === "client_secret" && v === "")));
  let res: Response;
  let text: string;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      redirect: "manual", // a redirect would carry the form elsewhere
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    text = await res.text();
  } catch {
    return { ok: false, error: "unreachable", status: 0 };
  }
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (res.status < 200 || res.status > 299) return { ok: false, error: json && json.error !== undefined ? word(json.error) : "unknown", status: res.status };
  const expiresIn = typeof json?.expires_in === "number" ? json.expires_in : typeof json?.expires_in === "string" ? Number(json.expires_in) : NaN;
  if (!json || typeof json.access_token !== "string" || json.access_token === "" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { ok: false, error: "malformed", status: res.status };
  }
  return {
    ok: true,
    accessToken: json.access_token,
    expiresIn,
    ...(typeof json.refresh_token === "string" && json.refresh_token !== "" ? { refreshToken: json.refresh_token } : {}),
    ...(typeof json.scope === "string" ? { scope: json.scope } : {}),
  };
}
