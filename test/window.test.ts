// ring: checkout
// The window's rule (box's design, "The seams"), moved from the teller so
// the box's window follows it too: an origin and a header template parsed
// or refused; the type's header set from the token, never a value that
// could break a header; the path joined onto an origin's base path without
// doubling a slash, the query after it; and the headers the teller drops,
// Host, the shop's own Authorization, the hop-by-hop set, every name
// Connection lists, any proxy- header, and the type's own header name.
// test/teller.test.ts proves the listener follows this rule on the wire.

import { describe, expect, it } from "vitest";
import { HOP_BY_HOP, forwardHeaders, forwardPath, parseHeaderTemplate, parseOrigin, signedHeader } from "../src/window.js";

describe("an origin", () => {
  it("is an absolute http: or https: URL, perhaps with a base path", () => {
    expect(parseOrigin("https://api.github.com")?.href).toBe("https://api.github.com/");
    expect(parseOrigin("http://127.0.0.1:9/api/v3/")?.pathname).toBe("/api/v3/");
  });

  it("is refused with a query, a fragment, credentials, another scheme, or no scheme", () => {
    for (const bad of ["https://a.example/?q=1", "https://a.example/#x", "https://a.example?", "https://u:p@a.example", "ftp://a.example", "a.example", ""]) {
      expect(parseOrigin(bad), bad).toBeNull();
    }
  });
});

describe("a header template", () => {
  it("is '<Name>: <value with {token}>', and the token takes {token}'s place wherever it stands", () => {
    const t = parseHeaderTemplate("X-Api-Key: key={token}")!;
    expect(t).toEqual({ name: "X-Api-Key", value: "key={token}" });
    expect(signedHeader(t, "tok")).toEqual({ name: "X-Api-Key", value: "key=tok" });
    expect(signedHeader(parseHeaderTemplate("Authorization: Bearer {token}")!, "abc")).toEqual({ name: "Authorization", value: "Bearer abc" });
  });

  it("is refused without {token}, without a name, or across lines; and a token that would break the header is no header", () => {
    for (const bad of ["Authorization: Bearer", ": {token}", "Bad Name: {token}", "X: {token}\r\nY: z"]) expect(parseHeaderTemplate(bad), bad).toBeNull();
    expect(signedHeader({ name: "Authorization", value: "Bearer {token}" }, "a\r\nX-Evil: 1")).toBeNull();
  });
});

describe("the forward's path", () => {
  it("is the request's path and query after the window's prefix, onto the origin's path", () => {
    const origin = new URL("http://127.0.0.1:9");
    expect(forwardPath(origin, "/repos/octo/cat/issues?state=all&limit=3")).toBe("/repos/octo/cat/issues?state=all&limit=3");
    expect(forwardPath(origin, "")).toBe("/");
  });

  it("joins the path onto an origin's base path without doubling a slash", () => {
    const origin = new URL("http://127.0.0.1:9/api/v3/");
    expect(forwardPath(origin, "/repos/a")).toBe("/api/v3/repos/a");
    expect(forwardPath(origin, "?q=1")).toBe("/api/v3?q=1");
  });
});

describe("the forward's headers", () => {
  it("keep the shop's own, drop Host, and set nothing: the caller sets the type's header", () => {
    expect(forwardHeaders({ host: "127.0.0.1:5000", accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, [])).toEqual({ accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" });
  });

  it("drop an Authorization the shop sets, and with a type whose header is not Authorization, its own copy of the header", () => {
    expect(forwardHeaders({ authorization: "Bearer the-shop's-own" }, ["Authorization"])).toEqual({});
    expect(forwardHeaders({ authorization: "Bearer mine", "x-api-key": "mine too", accept: "*/*" }, ["X-Api-Key"])).toEqual({ accept: "*/*" });
  });

  it("drop the hop-by-hop headers, including any Connection names, and every proxy- header", () => {
    const hop = Object.fromEntries(HOP_BY_HOP.map((h) => [h, "1"]));
    expect(forwardHeaders({ ...hop, connection: "close, x-drop-me", "x-drop-me": "1", "proxy-authorization": "Basic abc", "x-kept": "yes" }, [])).toEqual({ "x-kept": "yes" });
    expect(HOP_BY_HOP).toEqual(["connection", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade"]);
  });

  it("name every header lower-cased, as a Fetch Headers or a Node message gives them", () => {
    expect(forwardHeaders({ "X-Kept": "yes", Host: "h", Connection: "X-Named", "X-Named": "1" }, [])).toEqual({ "x-kept": "yes" });
  });
});
