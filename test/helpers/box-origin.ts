// ring: box
// The fake origin behind the box Worker's own `fetch`: miniflare's
// `outboundService`, a function in this process that every global `fetch`
// of the Worker under test reaches, the Window's forward included, since
// the pool at 0.22 ships no `fetchMock`. Nothing reaches the network. It
// records every request it is sent, method, URL, headers, and body, and
// answers as a stand-in for the two origins the seed shops need: GitHub's
// issues for octocat/Hello-World and a Docs document, each only for a
// request that carries a bearer, and `hello from the origin` at
// any path with `/pried` in it, on any host. A test reads the record at
// `http://origin.control/seen`, which answers the test and no shop, since a
// shop's fetch reaches nothing but its window or nothing at all; the
// record is filtered by what the test sent, since the box ring's files
// share this one origin.
//
// The same function is a fake authorization server at
// `https://oauth.example`, strict where a provider is: `/authorize`
// answers a person's browser with a redirect only for the registered
// client, `response_type=code`, a redirect URI, a state, and an S256
// challenge, and remembers the challenge with the code, or redirects with
// the `error` a test names in `refuse`, as a person refusing does;
// `/token` takes the registered client and secret, trades a code once, for
// the same redirect URI, only when the verifier hashes to the code's
// challenge, and trades a refresh token it issued for an access token. The
// tokens it issued are read at `http://origin.control/oauth`.

import { createHash, randomBytes } from "node:crypto";

export interface SeenRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export const CONTROL = "http://origin.control/seen";

/** The fake authorization server's address, its two doors, and the one client registered at it. */
export const OAUTH = {
  authorize: "https://oauth.example/authorize",
  token: "https://oauth.example/token",
  scopes: ["https://www.googleapis.com/auth/documents.readonly"],
  clientId: "box-ring-client.apps",
  clientSecret: "box-ring-client-secret-not-a-secret",
  issued: "http://origin.control/oauth",
} as const;
export const PRIED_ANSWER = "hello from the origin";

const seen: SeenRequest[] = [];

const codes = new Map<string, { challenge: string; redirect: string }>();
const refreshTokens = new Set<string>();
const issued: string[] = [];
const mint = (kind: string) => {
  const t = `fake-${kind}-${randomBytes(18).toString("hex")}`;
  issued.push(t);
  return t;
};

function oauth(method: string, url: URL, body: string): Response {
  if (method === "GET" && url.pathname === "/authorize") {
    const q = url.searchParams;
    const redirect = q.get("redirect_uri");
    const state = q.get("state");
    if (q.get("client_id") !== OAUTH.clientId || q.get("response_type") !== "code" || !redirect || !state || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
      return new Response("the fake refuses this authorization request\n", { status: 400 });
    }
    const back = new URL(redirect);
    const refuse = q.get("refuse");
    if (refuse) back.searchParams.set("error", refuse);
    else {
      const code = mint("code");
      codes.set(code, { challenge: q.get("code_challenge")!, redirect });
      back.searchParams.set("code", code);
    }
    back.searchParams.set("state", state);
    return new Response(null, { status: 302, headers: { location: back.toString() } });
  }
  if (method === "POST" && url.pathname === "/token") {
    const form = new URLSearchParams(body);
    const refused = (error: string, status = 400) => Response.json({ error }, { status });
    if (form.get("client_id") !== OAUTH.clientId || form.get("client_secret") !== OAUTH.clientSecret) return refused("invalid_client", 401);
    const tokens = (refresh: string | null) => Response.json({ access_token: mint("access"), expires_in: 3600, scope: OAUTH.scopes.join(" "), token_type: "Bearer", ...(refresh ? { refresh_token: refresh } : {}) });
    if (form.get("grant_type") === "authorization_code") {
      const held = codes.get(form.get("code") ?? "");
      if (!held) return refused("invalid_grant");
      codes.delete(form.get("code")!);
      const hashed = createHash("sha256").update(form.get("code_verifier") ?? "", "ascii").digest("base64url");
      if (held.redirect !== form.get("redirect_uri") || hashed !== held.challenge) return refused("invalid_grant");
      const refresh = mint("refresh");
      refreshTokens.add(refresh);
      return tokens(refresh);
    }
    if (form.get("grant_type") === "refresh_token") return refreshTokens.has(form.get("refresh_token") ?? "") ? tokens(null) : refused("invalid_grant");
    return refused("unsupported_grant_type");
  }
  return new Response("the fake authorization server has nothing here\n", { status: 404 });
}

const issue = (number: number, title: string) => ({
  number,
  title,
  state: "open",
  user: { login: "octocat" },
  body: `body of ${number}`,
  html_url: `https://github.com/octocat/Hello-World/issues/${number}`,
});

const DOCUMENT = {
  body: {
    content: [
      { paragraph: { elements: [{ textRun: { content: "The fixture\n" } }], paragraphStyle: { namedStyleType: "TITLE" } } },
      { paragraph: { elements: [{ textRun: { content: "The first line of the fixture.\n" } }] } },
    ],
  },
};

function github(method: string, url: URL): Response {
  if (method === "GET" && url.pathname === "/repos/octocat/Hello-World/issues") return Response.json([issue(3, "Three"), issue(2, "Two"), issue(1, "One")]);
  if (method === "GET" && url.pathname === "/repos/octocat/Hello-World/issues/1") return Response.json(issue(1, "One"));
  return Response.json({ message: "Not Found", documentation_url: "https://docs.github.com/rest" }, { status: 404 });
}

function docs(method: string, url: URL): Response {
  if (method === "GET" && url.pathname === "/v1/documents/fixture-doc") return Response.json(DOCUMENT);
  return Response.json({ error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } }, { status: 404 });
}

/** Miniflare's outbound service for the box Worker: the fake origin. */
export async function fakeOrigin(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.href === CONTROL) return Response.json(seen);
  if (url.href === OAUTH.issued) return Response.json(issued);
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  const body = await request.text();
  seen.push({ method: request.method, url: url.href, headers, body });
  if (url.host === "oauth.example") return oauth(request.method, url, body);
  if (url.pathname.includes("/pried")) return new Response(PRIED_ANSWER);
  const bearer = /^Bearer \S+$/.test(headers.authorization ?? "");
  if (url.host === "api.github.com") return bearer ? github(request.method, url) : Response.json({ message: "Requires authentication" }, { status: 401 });
  if (url.host === "docs.googleapis.com") return bearer ? docs(request.method, url) : Response.json({ error: { code: 401, status: "UNAUTHENTICATED" } }, { status: 401 });
  return new Response("the fake origin has nothing here\n", { status: 404 });
}
