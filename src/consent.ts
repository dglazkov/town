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

type Ended =
  | { kind: "tokens"; tokens: Tokens; at: number; res: ServerResponse }
  | { kind: "refused"; why: string; words: string; result: ResultClass; res: ServerResponse | null };

/**
 * The consent for `req` at `now`, sealing with the key `key` gives once
 * there is something to seal; exit 0 with the credential's id on `out`,
 * or 1 with the refusal on `err`. A type that cannot be connected, a user
 * the town lacks, and a port that will not listen are thrown as the
 * admin's refusals, before any listener or row.
 */
export async function connect(store: Store, key: () => Buffer, req: ConnectRequest, io: ConnectIo, now: () => number = Date.now): Promise<number> {
  const t = connectableType(store, req.userName, req.type);
  if (req.replace !== undefined) store.checkReplace(req.replace, req.userName, t.name);
  const client = store.openClient(t.name, key());
  const timeoutMs = req.timeoutMs ?? CONSENT_TIMEOUT_MS;
  const { verifier, challenge } = pkce();
  const state = newState();
  let handle: (req: http.IncomingMessage, res: ServerResponse) => void = (_q, res) => notFound(res);
  const server = http.createServer((q, res) => handle(q, res));
  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => reject(new StoreError(`credential connect could not listen on 127.0.0.1:${req.port ?? 0}: ${err.code ?? err.message}; leave out --port for a free one`)));
    server.listen(req.port ?? 0, "127.0.0.1", () => resolve());
  });
  const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const started = now();
  const call = newCallId();
  try {
    const said = guidanceLine(t);
    if (said) io.err(`${said}\n`);
    io.err(`open this URL in a browser to connect ${t.name} for ${req.userName}; the redirect comes back to ${redirect} within ${spoken(timeoutMs)}:\n`);
    io.err(`${authorizeUrl({ authorize: t.oauth!.authorize, clientId: client.id, redirect, scopes: t.oauth!.scopes, state, challenge })}\n`);
    io.listening?.(redirect);

    const ended = await new Promise<Ended>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        resolve({ kind: "refused", why: "timeout", words: `no redirect came within ${spoken(timeoutMs)}`, result: "timeout", res: null });
      }, timeoutMs);
      handle = (q, res) => {
        const u = new URL(q.url ?? "/", redirect);
        if (settled || q.method !== "GET" || u.pathname !== "/" || !sameState(u.searchParams.get("state"), state)) return notFound(res);
        settled = true;
        clearTimeout(timer);
        const at = now();
        const error = u.searchParams.get("error");
        const code = u.searchParams.get("code");
        if (error !== null || !code) {
          const why = error !== null ? word(error) : "no code";
          return resolve({ kind: "refused", why, words: error !== null ? `${t.name} answered ${why} at consent` : `the redirect carried no code`, result: "denied", res });
        }
        void exchange({ token: t.oauth!.token, clientId: client.id, clientSecret: client.secret, code, verifier, redirect }).then((tokens) => {
          if (!tokens.ok) {
            return resolve({ kind: "refused", why: `token ${tokens.status || ""} ${tokens.error}`.replace(/\s+/g, " "), words: `${t.name}'s token endpoint answered ${tokens.status || "nothing"} ${tokens.error} for the code`, result: "town-error", res });
          }
          if (!tokens.refreshToken) {
            return resolve({
              kind: "refused",
              why: "no refresh token",
              words: `${t.name} answered with no refresh token, so the credential would stop working within the hour; at the provider, check the client is of the Desktop type and remove the town's access from the account, then connect again`,
              result: "denied",
              res,
            });
          }
          resolve({ kind: "tokens", tokens, at, res });
        });
      };
    });

    if (ended.kind === "refused") {
      if (ended.res) await answer(ended.res, BROWSER_NOT_CONNECTED);
      record(store, call, req, started, ended.result, `consent refused ${ended.why}`, now);
      io.err(`townd admin: credential connect refused: ${ended.words}; nothing was written\n`);
      return 1;
    }
    const { tokens } = ended;
    let c: Credential;
    let moved: Array<{ id: string; shop: string }> = [];
    try {
      const make = () => store.connectCredential(
        {
          userName: req.userName,
          type: t.name,
          label: req.label ?? t.name,
          value: { refresh_token: tokens.refreshToken!, access_token: tokens.accessToken, expires_at: ended.at + tokens.expiresIn * 1000, scope: tokens.scope ?? t.oauth!.scopes.join(" ") },
        },
        key(),
        ended.at,
      );
      if (req.replace === undefined) c = make();
      else ({ credential: c, moved } = store.replaceCredential(req.replace, make, ended.at));
    } catch (err) {
      await answer(ended.res, BROWSER_NOT_CONNECTED);
      throw err;
    }
    await answer(ended.res, BROWSER_CONNECTED);
    record(store, call, req, started, "ok", `connected ${t.name} for ${req.userName} in ${Math.round((ended.at - started) / 1000)}s`, now);
    io.out(`${c.id}\n`);
    for (const g of moved) io.err(`${g.id} at ${g.shop} now uses ${c.id}\n`);
    return 0;
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

/** The consent's one audit row: pass none, shop none, the verb's words hashed. */
function record(store: Store, callId: string, req: ConnectRequest, started: number, result: ResultClass, detail: string, now: () => number): void {
  store.recordCall({
    callId,
    parent: null,
    at: started,
    passId: null,
    grantId: null,
    shop: null,
    command: null,
    argvHash: argvHash(["credential", "connect", "--user", req.userName, "--type", req.type]),
    result,
    exit: result === "ok" ? 0 : 1,
    shopExit: null,
    latencyMs: now() - started,
    notices: [],
    stderr: null,
    detail,
    credentials: [],
    wall: null,
  });
}

function sameState(given: string | null, state: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
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
function spoken(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000}m` : `${Math.max(1, Math.round(ms / 1000))}s`;
}
