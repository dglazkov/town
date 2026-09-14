// A consent: `townd admin credential connect`, the flow by which a person
// at the operator's terminal connects an `oauth` credential, the way an
// installed application does OAuth with no server of its own. A listener
// on 127.0.0.1 alone; the type's guidance under the shop's name, then the
// authorization URL on a line of its own, for the person to open, with a
// state of sixteen random bytes and an S256 challenge in it; the redirect
// answered only when its state matches, once, and every other request 404
// with an empty body; the code exchanged with the verifier; the tokens
// sealed as a new credential and its id printed. The browser is told one
// line naming nothing. A refusal at the provider, an answer with no
// refresh token, or the timeout ends it with exit 1 and nothing written.
// Whatever the end, the listener is closed and one audit row says it:
// pass none, shop none, `connected <type> for <user> in <n>s` or
// `consent refused <why>`. The secret, the tokens, the verifier, and the
// state stay in this process's memory and the sealed row. With `--replace
// <credential>`, checked before any listener, the new credential takes the
// old one's place under its grants and the old is revoked, in one write,
// each grant moved printed on stderr after the id.

import { timingSafeEqual } from "node:crypto";
import http, { type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ResultClass } from "./audit.js";
import { guidanceLine } from "./checklist.js";
import { connectableType, type Credential } from "./credentials.js";
import { argvHash, newCallId } from "./gate.js";
import { authorizeUrl, exchange, newState, pkce, word, type Tokens } from "./oauth.js";
import { StoreError, type Store } from "./store.js";

/** How long a consent waits for the redirect when no --timeout is given. */
export const CONSENT_TIMEOUT_MS = 5 * 60_000;

/** What the browser is told when the credential was connected, and when it was not. */
export const BROWSER_CONNECTED = "connected; you can close this tab\n";
export const BROWSER_NOT_CONNECTED = "not connected; the terminal says why\n";

export interface ConnectRequest {
  userName: string;
  type: string;
  /** The credential's label; the type's name when omitted. */
  label?: string;
  /** A credential of the user's at the type, which the new one replaces under every grant bound to it. */
  replace?: string;
  /** The listener's port; a free one when omitted or 0. */
  port?: number;
  timeoutMs?: number;
}

export interface ConnectIo {
  out: (s: string) => void;
  err: (s: string) => void;
  /** Called with the listener's address once it listens: a test's hook, and nothing the verb prints. */
  listening?: (redirect: string) => void;
}

/** A consent begun and not yet landed: what the landing needs to finish it. The state and the verifier are secrets of the flow's, kept in memory or sealed. */
export interface Consent {
  userName: string;
  /** The type's name. */
  type: string;
  label?: string;
  replace?: string;
  /** The redirect URI the authorization URL carried, which the exchange sends again. */
  redirect: string;
  state: string;
  verifier: string;
  /** When the URL was printed. */
  startedAt: number;
  timeoutMs: number;
  /** The consent's audit row's id. */
  callId: string;
}

/** How a consent ended: what the verb prints and exits, what the browser is told (null when no redirect came), and the row it wrote. */
export interface Landed {
  exit: number;
  stdout: string;
  stderr: string;
  browser: string | null;
}

/**
 * The flow's first half, both boxes': the type checked connectable, a
 * replacement checked, the registration opened, the state and verifier
 * made, and the lines the person reads, the guidance under the shop's
 * name, what to do, and the authorization URL on a line of its own, with
 * `redirect` as the URI the provider sends the browser back to. Refusals
 * are thrown as the admin's, before anything is written.
 */
export function beginConsent(store: Store, key: () => Buffer, req: ConnectRequest, redirect: string, now: number): { consent: Consent; lines: string[] } {
  const t = connectableType(store, req.userName, req.type);
  if (req.replace !== undefined) store.checkReplace(req.replace, req.userName, t.name);
  const client = store.openClient(t.name, key());
  const timeoutMs = req.timeoutMs ?? CONSENT_TIMEOUT_MS;
  const { verifier, challenge } = pkce();
  const state = newState();
  const lines: string[] = [];
  const said = guidanceLine(t);
  if (said) lines.push(said);
  lines.push(`open this URL in a browser to connect ${t.name} for ${req.userName}; the redirect comes back to ${redirect} within ${spoken(timeoutMs)}:`);
  lines.push(authorizeUrl({ authorize: t.oauth!.authorize, clientId: client.id, redirect, scopes: t.oauth!.scopes, state, challenge }));
  const consent: Consent = {
    userName: req.userName,
    type: t.name,
    ...(req.label === undefined ? {} : { label: req.label }),
    ...(req.replace === undefined ? {} : { replace: req.replace }),
    redirect,
    state,
    verifier,
    startedAt: now,
    timeoutMs,
    callId: newCallId(),
  };
  return { consent, lines };
}

/** Whether `given` is the consent's state, compared in constant time. */
export function sameState(given: string | null, state: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The flow's second half, for a redirect whose state the caller matched:
 * the provider's `error`, a missing code, the exchange refused, or an
 * answer with no refresh token ends it refused, one row and nothing else
 * written; otherwise the tokens sealed as a new credential, or in the
 * replaced one's place, one row, the id on stdout and each grant moved on
 * stderr. A failure writing the credential is thrown, no row written, and
 * the browser is told it did not connect by the caller.
 */
export async function landConsent(store: Store, key: () => Buffer, consent: Consent, query: URLSearchParams, at: number, now: () => number = Date.now): Promise<Landed> {
  const t = store.getType(consent.type);
  if (!t?.oauth) return refusedLanding(store, consent, { why: "type gone", words: `${consent.type} is no longer an oauth type this town holds`, result: "town-error" }, true, now);
  const error = query.get("error");
  const code = query.get("code");
  if (error !== null || !code) {
    const why = error !== null ? word(error) : "no code";
    return refusedLanding(store, consent, { why, words: error !== null ? `${t.name} answered ${why} at consent` : `the redirect carried no code`, result: "denied" }, true, now);
  }
  const client = store.openClient(t.name, key());
  const tokens = await exchange({ token: t.oauth.token, clientId: client.id, clientSecret: client.secret, code, verifier: consent.verifier, redirect: consent.redirect });
  if (!tokens.ok) {
    return refusedLanding(store, consent, { why: `token ${tokens.status || ""} ${tokens.error}`.replace(/\s+/g, " "), words: `${t.name}'s token endpoint answered ${tokens.status || "nothing"} ${tokens.error} for the code`, result: "town-error" }, true, now);
  }
  if (!tokens.refreshToken) {
    return refusedLanding(
      store,
      consent,
      {
        why: "no refresh token",
        words: `${t.name} answered with no refresh token, so the credential would stop working within the hour; at the provider, check the client is of the Desktop type and remove the town's access from the account, then connect again`,
        result: "denied",
      },
      true,
      now,
    );
  }
  const make = () =>
    store.connectCredential(
      {
        userName: consent.userName,
        type: t.name,
        label: consent.label ?? t.name,
        value: { refresh_token: tokens.refreshToken!, access_token: tokens.accessToken, expires_at: at + tokens.expiresIn * 1000, scope: tokens.scope ?? t.oauth!.scopes.join(" ") },
      },
      key(),
      at,
    );
  let c: Credential;
  let moved: Array<{ id: string; shop: string }> = [];
  if (consent.replace === undefined) c = make();
  else ({ credential: c, moved } = store.replaceCredential(consent.replace, make, at));
  record(store, consent, "ok", `connected ${t.name} for ${consent.userName} in ${Math.round((at - consent.startedAt) / 1000)}s`, now);
  return { exit: 0, stdout: `${c.id}\n`, stderr: moved.map((g) => `${g.id} at ${g.shop} now uses ${c.id}\n`).join(""), browser: BROWSER_CONNECTED };
}

/** A consent no redirect came to within its wait: one row, and the verb's refusal. */
export function timedOut(store: Store, consent: Consent, now: () => number = Date.now): Landed {
  return refusedLanding(store, consent, { why: "timeout", words: `no redirect came within ${spoken(consent.timeoutMs)}`, result: "timeout" }, false, now);
}

function refusedLanding(store: Store, consent: Consent, r: { why: string; words: string; result: ResultClass }, redirected: boolean, now: () => number): Landed {
  record(store, consent, r.result, `consent refused ${r.why}`, now);
  return { exit: 1, stdout: "", stderr: `townd admin: credential connect refused: ${r.words}; nothing was written\n`, browser: redirected ? BROWSER_NOT_CONNECTED : null };
}

/**
 * The consent for `req` at `now`, on a laptop: the flow over a listener on
 * 127.0.0.1, sealing with the key `key` gives once there is something to
 * seal; exit 0 with the credential's id on `out`, or 1 with the refusal on
 * `err`. A type that cannot be connected, a user the town lacks, and a
 * port that will not listen are thrown as the admin's refusals, before any
 * listener or row.
 */
export async function connect(store: Store, key: () => Buffer, req: ConnectRequest, io: ConnectIo, now: () => number = Date.now): Promise<number> {
  // The checks before any listener, the flow's own, run again below once the redirect's address is known.
  const t = connectableType(store, req.userName, req.type);
  if (req.replace !== undefined) store.checkReplace(req.replace, req.userName, t.name);
  store.openClient(t.name, key());
  let handle: (req: http.IncomingMessage, res: ServerResponse) => void = (_q, res) => notFound(res);
  const server = http.createServer((q, res) => handle(q, res));
  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => reject(new StoreError(`credential connect could not listen on 127.0.0.1:${req.port ?? 0}: ${err.code ?? err.message}; leave out --port for a free one`)));
    server.listen(req.port ?? 0, "127.0.0.1", () => resolve());
  });
  const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    const { consent, lines } = beginConsent(store, key, req, redirect, now());
    for (const line of lines) io.err(`${line}\n`);
    io.listening?.(redirect);

    const ended = await new Promise<{ query: URLSearchParams; at: number; res: ServerResponse } | null>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        resolve(null);
      }, consent.timeoutMs);
      handle = (q, res) => {
        const u = new URL(q.url ?? "/", redirect);
        if (settled || q.method !== "GET" || u.pathname !== "/" || !sameState(u.searchParams.get("state"), consent.state)) return notFound(res);
        settled = true;
        clearTimeout(timer);
        resolve({ query: u.searchParams, at: now(), res });
      };
    });

    const landed = ended === null ? timedOut(store, consent, now) : await landing(store, key, consent, ended, now);
    if (ended !== null && landed.browser !== null) await answer(ended.res, landed.browser);
    if (landed.stdout) io.out(landed.stdout);
    if (landed.stderr) io.err(landed.stderr);
    return landed.exit;
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

/** The landing on a laptop's listener: a failure writing the credential tells the browser it did not connect, then is thrown. */
async function landing(store: Store, key: () => Buffer, consent: Consent, ended: { query: URLSearchParams; at: number; res: ServerResponse }, now: () => number): Promise<Landed> {
  try {
    return await landConsent(store, key, consent, ended.query, ended.at, now);
  } catch (err) {
    await answer(ended.res, BROWSER_NOT_CONNECTED);
    throw err;
  }
}

/** The consent's one audit row: pass none, shop none, the verb's words hashed. */
function record(store: Store, consent: Consent, result: ResultClass, detail: string, now: () => number): void {
  store.recordCall({
    callId: consent.callId,
    parent: null,
    at: consent.startedAt,
    passId: null,
    grantId: null,
    shop: null,
    command: null,
    argvHash: argvHash(["credential", "connect", "--user", consent.userName, "--type", consent.type]),
    result,
    exit: result === "ok" ? 0 : 1,
    shopExit: null,
    latencyMs: now() - consent.startedAt,
    notices: [],
    stderr: null,
    detail,
    credentials: [],
    wall: null,
  });
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "content-length": 0 });
  res.end();
}

function answer(res: ServerResponse, text: string): Promise<void> {
  return new Promise((resolve) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(text), connection: "close" });
    res.end(text, () => resolve());
  });
}

/** A wait as a person reads it: `5m`, `90s`. */
export function spoken(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000}m` : `${Math.max(1, Math.round(ms / 1000))}s`;
}
