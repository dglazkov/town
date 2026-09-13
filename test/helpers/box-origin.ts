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

export interface SeenRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export const CONTROL = "http://origin.control/seen";
export const PRIED_ANSWER = "hello from the origin";

const seen: SeenRequest[] = [];

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
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  seen.push({ method: request.method, url: url.href, headers, body: await request.text() });
  if (url.pathname.includes("/pried")) return new Response(PRIED_ANSWER);
  const bearer = /^Bearer \S+$/.test(headers.authorization ?? "");
  if (url.host === "api.github.com") return bearer ? github(request.method, url) : Response.json({ message: "Requires authentication" }, { status: 401 });
  if (url.host === "docs.googleapis.com") return bearer ? docs(request.method, url) : Response.json({ error: { code: 401, status: "UNAUTHENTICATED" } }, { status: 401 });
  return new Response("the fake origin has nothing here\n", { status: 404 });
}
