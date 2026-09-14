// ring: checkout
// A fake authorization server, and a fake docs origin behind it, each a
// node:http server on 127.0.0.1 at a free port. The authorization server
// is strict where a provider is: `/authorize` answers a person's browser
// with a redirect only for the registered client, `response_type=code`, a
// loopback redirect at `/` or the path it is told, a state, and an S256
// challenge, and remembers the
// challenge with the code; `/token` takes the registered client and
// secret, trades a code once, for the same redirect, only when the
// verifier hashes to the code's challenge, and trades a live refresh
// token for an access token, rotating the refresh token when told. It can
// be told to answer the next token requests `invalid_grant` or 500, the
// body quoting the token it was sent, as a provider's body may. The docs
// origin answers `/v1/documents/<id>` only for a live access token this
// server issued. Nothing reaches beyond loopback. Run directly, it starts
// both, prints `{ auth, docs }` as one JSON line, then one JSON line per
// event, tokens issued included so a test can search for them, and takes
// `POST /control` with the options to change:
//   node test/helpers/authserver.ts <client id> <client secret>

import { createHash, randomBytes } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface AuthEvent {
  /** `authorize`, `exchange`, `refresh`, `docs`, or `control`. */
  kind: string;
  ok: boolean;
  why?: string;
  status?: number;
  /** Tokens this event issued or was sent, for a test's search. */
  tokens?: string[];
  url?: string;
  authorization?: boolean;
}

export interface AuthControl {
  /** What the next token requests answer: tokens, `invalid_grant`, or a 500. */
  mode: "ok" | "invalid_grant" | "500";
  /** Whether a refresh issues a new refresh token and ends the old one. */
  rotate: boolean;
  /** Whether an exchange answers with a refresh token. */
  withRefreshToken: boolean;
  /** An `error` the authorize door redirects with in place of a code, as a person refusing does. */
  authorizeError: string | null;
  /** The access token's life, in seconds. */
  expiresIn: number;
  /** How long the token endpoint waits before it answers, in milliseconds. */
  tokenDelayMs: number;
  /** The path a loopback redirect must have: a laptop's listener's `/`, or a box's `/consent` when a test's town is one. */
  redirectPath: string;
}

export interface FakeAuth extends AuthControl {
  url: string;
  authorize: string;
  token: string;
  scopes: string[];
  events: AuthEvent[];
  /** Every access and refresh token issued, in order. */
  issued: { access: string[]; refresh: string[] };
  onEvent?: (e: AuthEvent) => void;
  /** Whether `token` is an access token this server issued that has not expired. */
  live(token: string): boolean;
  close(): Promise<void>;
}

export interface FakeDocs {
  url: string;
  close(): Promise<void>;
}

const b64sha = (s: string) => createHash("sha256").update(s, "ascii").digest("base64url");
const mint = (kind: string) => `fake-${kind}-${randomBytes(18).toString("hex")}`;

function listen(server: http.Server): Promise<{ url: string; close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            for (const s of sockets) s.destroy();
          }),
      }),
    ),
  );
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (b: Buffer) => chunks.push(b));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function fakeAuthServer(opts: { clientId: string; clientSecret: string; scopes?: string[] }): Promise<FakeAuth> {
  const codes = new Map<string, { challenge: string; redirect: string; scope: string; used: boolean }>();
  const refreshTokens = new Map<string, { scope: string; live: boolean }>();
  const accessTokens = new Map<string, number>();
  const auth: FakeAuth = {
    url: "",
    authorize: "",
    token: "",
    scopes: opts.scopes ?? ["https://www.googleapis.com/auth/documents.readonly"],
    mode: "ok",
    rotate: false,
    withRefreshToken: true,
    authorizeError: null,
    expiresIn: 3600,
    tokenDelayMs: 0,
    redirectPath: "/",
    events: [],
    issued: { access: [], refresh: [] },
    live: (t) => (accessTokens.get(t) ?? 0) > Date.now(),
    close: async () => {},
  };
  const record = (e: AuthEvent) => {
    auth.events.push(e);
    auth.onEvent?.(e);
  };
  const issue = (scope: string, withRefresh: boolean) => {
    const access = mint("access");
    accessTokens.set(access, Date.now() + auth.expiresIn * 1000);
    auth.issued.access.push(access);
    const out: Record<string, unknown> = { access_token: access, expires_in: auth.expiresIn, token_type: "Bearer", scope };
    if (withRefresh) {
      const r = mint("refresh");
      refreshTokens.set(r, { scope, live: true });
      auth.issued.refresh.push(r);
      out.refresh_token = r;
    }
    return out;
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      const body = await readBody(req);
      if (req.method === "POST" && u.pathname === "/control") {
        Object.assign(auth, JSON.parse(body) as Partial<AuthControl>);
        record({ kind: "control", ok: true, why: body });
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && u.pathname === "/authorize") {
        const q = u.searchParams;
        const redirect = q.get("redirect_uri") ?? "";
        let redirectUrl: URL | null = null;
        try {
          redirectUrl = new URL(redirect);
        } catch {
          redirectUrl = null;
        }
        const why =
          q.get("response_type") !== "code" ? "response_type" :
          q.get("client_id") !== opts.clientId ? "client_id" :
          !redirectUrl || redirectUrl.protocol !== "http:" || redirectUrl.hostname !== "127.0.0.1" || redirectUrl.pathname !== auth.redirectPath ? "redirect_uri" :
          q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(q.get("code_challenge") ?? "") ? "code_challenge" :
          !q.get("state") ? "state" :
          q.get("scope") !== auth.scopes.join(" ") ? "scope" :
          q.get("access_type") !== "offline" ? "access_type" : null;
        if (why) {
          record({ kind: "authorize", ok: false, why });
          res.writeHead(400, { "content-type": "text/plain" });
          return res.end(`bad authorization request: ${why}\n`);
        }
        const to = new URL(redirect);
        if (auth.authorizeError) {
          to.searchParams.set("error", auth.authorizeError);
        } else {
          const code = mint("code");
          codes.set(code, { challenge: q.get("code_challenge")!, redirect, scope: q.get("scope")!, used: false });
          to.searchParams.set("code", code);
        }
        to.searchParams.set("state", q.get("state")!);
        record({ kind: "authorize", ok: true });
        res.writeHead(302, { location: to.toString() });
        return res.end();
      }
      if (req.method === "POST" && u.pathname === "/token") {
        if (auth.tokenDelayMs) await new Promise((r) => setTimeout(r, auth.tokenDelayMs));
        const f = new URLSearchParams(body);
        const grant = f.get("grant_type");
        const kind = grant === "refresh_token" ? "refresh" : "exchange";
        const sent = [f.get("refresh_token"), f.get("code"), f.get("client_secret")].filter((x): x is string => !!x);
        const refuse = (status: number, error: string, why: string) => {
          record({ kind, ok: false, why, status, tokens: sent });
          // A provider's body may quote what it was sent; the town must read `error` alone.
          return json(res, status, { error, error_description: `refused ${why}; you sent ${sent.join(" and ")}` });
        };
        if (req.headers["content-type"] !== "application/x-www-form-urlencoded") return refuse(400, "invalid_request", "content-type");
        if (f.get("client_id") !== opts.clientId || (f.get("client_secret") ?? "") !== opts.clientSecret) return refuse(401, "invalid_client", "client");
        if (auth.mode === "500") return refuse(500, "backend_error", "told to fail");
        if (auth.mode === "invalid_grant") return refuse(400, "invalid_grant", "told to refuse");
        if (grant === "authorization_code") {
          const c = codes.get(f.get("code") ?? "");
          if (!c || c.used) return refuse(400, "invalid_grant", "code");
          c.used = true;
          if (f.get("redirect_uri") !== c.redirect) return refuse(400, "invalid_grant", "redirect_uri");
          if (b64sha(f.get("code_verifier") ?? "") !== c.challenge) return refuse(400, "invalid_grant", "code_verifier");
          const out = issue(c.scope, auth.withRefreshToken);
          record({ kind, ok: true, tokens: [...sent, String(out.access_token), ...(out.refresh_token ? [String(out.refresh_token)] : [])] });
          return json(res, 200, out);
        }
        if (grant === "refresh_token") {
          const r = refreshTokens.get(f.get("refresh_token") ?? "");
          if (!r || !r.live) return refuse(400, "invalid_grant", "refresh_token");
          const out = issue(r.scope, auth.rotate);
          if (auth.rotate) r.live = false;
          record({ kind, ok: true, tokens: [...sent, String(out.access_token), ...(out.refresh_token ? [String(out.refresh_token)] : [])] });
          return json(res, 200, out);
        }
        return refuse(400, "unsupported_grant_type", "grant_type");
      }
      res.writeHead(404);
      res.end();
    })();
  });
  const { url, close } = await listen(server);
  Object.assign(auth, { url, authorize: `${url}/authorize`, token: `${url}/token`, close });
  return auth;
}

/** What a browser does with an authorization URL at the fake: the redirect it is sent, not followed. */
export async function browse(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location");
  if (res.status !== 302 || !location) throw new Error(`the fake answered ${res.status}: ${await res.text()}`);
  return location;
}

/** A consent done at the fake without the town: the tokens it issued for a loopback redirect, with the verifier its challenge came from. */
export async function tokensFrom(auth: FakeAuth, client: { clientId: string; clientSecret: string }): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const verifier = randomBytes(32).toString("base64url");
  const redirect = "http://127.0.0.1:1/";
  const q = new URLSearchParams({ response_type: "code", client_id: client.clientId, redirect_uri: redirect, scope: auth.scopes.join(" "), state: "s", code_challenge: b64sha(verifier), code_challenge_method: "S256", access_type: "offline" });
  const code = new URL(await browse(`${auth.authorize}?${q}`)).searchParams.get("code")!;
  const res = await fetch(auth.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: client.clientId, client_secret: client.clientSecret, code_verifier: verifier }),
  });
  if (res.status !== 200) throw new Error(`the fake refused the exchange: ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string };
}

/** A document as the Docs API answers one, a handful of its fields: a title, a heading, and paragraphs of text runs. */
export const FIXTURE_DOCUMENT = {
  documentId: "fixture-doc",
  title: "The fixture",
  body: {
    content: [
      { sectionBreak: {} },
      { paragraph: { elements: [{ textRun: { content: "The fixture\n" } }], paragraphStyle: { namedStyleType: "TITLE" } } },
      { paragraph: { elements: [{ textRun: { content: "The first line of the fixture.\n" } }], paragraphStyle: { namedStyleType: "NORMAL_TEXT" } } },
      { paragraph: { elements: [{ textRun: { content: "A heading\n" } }], paragraphStyle: { namedStyleType: "HEADING_2" } } },
      { paragraph: { elements: [{ textRun: { content: "Some " } }, { textRun: { content: "bold" } }, { textRun: { content: " words.\n" } }], paragraphStyle: { namedStyleType: "NORMAL_TEXT" } } },
    ],
  },
};

/** The docs origin: a document by id for a live access token of `auth`'s; 401 without one, 404 for an id it lacks. */
export async function fakeDocs(auth: FakeAuth, documents: Record<string, unknown> = { "fixture-doc": FIXTURE_DOCUMENT }): Promise<FakeDocs> {
  const server = http.createServer((req, res) => {
    void (async () => {
      await readBody(req);
      const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
      const m = /^\/v1\/documents\/([^/?#]+)$/.exec(req.url ?? "");
      const signed = auth.live(bearer);
      const status = !signed ? 401 : !m ? 404 : documents[decodeURIComponent(m[1]!)] ? 200 : 404;
      auth.events.push({ kind: "docs", ok: status === 200, status, url: req.url ?? "", authorization: signed });
      auth.onEvent?.(auth.events.at(-1)!);
      if (status === 401) return json(res, 401, { error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } });
      if (status === 404) return json(res, 404, { error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } });
      return json(res, 200, documents[decodeURIComponent(m![1]!)]);
    })();
  });
  return listen(server);
}

if (import.meta.main) {
  const auth = await fakeAuthServer({ clientId: process.argv[2] ?? "fake-client", clientSecret: process.argv[3] ?? "fake-secret" });
  const docs = await fakeDocs(auth);
  auth.onEvent = (e) => process.stdout.write(`${JSON.stringify(e)}\n`);
  process.stdout.write(`${JSON.stringify({ auth: auth.url, docs: docs.url })}\n`);
}
