// ring: checkout
// The github shop's shape (journey 1 steps 3 and 4), against a stand-in.
// Its manifest validates against the town's seeded type, and its entry
// runs through the real runtime with a github-token credential whose
// origin is a fake GitHub on loopback answering with a handful of the
// fields GitHub's REST docs show. What this proves is what the shop sends
// and what it prints from answers of that shape: the paths, the query,
// the headers, pull requests left out, stdin as a body, a 404 reported
// as its status and message alone, a malformed repo sending nothing. It
// does not prove GitHub answers so; `shop add shops/github --user <u>` on
// a real token and the walk prove that.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Manifest } from "../src/manifest.js";
import { MAIN_BIN, run, type RunResult } from "../src/runtime.js";
import { loadShop } from "../src/shoptest.js";
import { openWall } from "../src/wall.js";
import { fakeOrigin, type FakeOrigin } from "./helpers/origin.js";

const SHOP = path.resolve(import.meta.dirname, "../shops/github");
const TOKEN = `github_pat_${randomBytes(20).toString("hex")}`;
const REPO = "octo-org/hello.world_2";

let manifest: Manifest;
let stateRoot: string;
let origin: FakeOrigin;
/** What the stand-in answers, by method and path; a 404 in GitHub's shape otherwise. */
let routes: Record<string, (req: IncomingMessage, body: Buffer) => { status?: number; json: unknown }>;
/** The bodies the stand-in was sent, in order. */
let bodies: string[];

const issue = (number: number, title: string, pr = false) => ({
  number,
  title,
  state: "open",
  user: { login: "octocat" },
  body: `body of ${number}`,
  html_url: `https://github.com/${REPO}/issues/${number}`,
  ...(pr ? { pull_request: { url: `https://api.github.com/repos/${REPO}/pulls/${number}` } } : {}),
});

function answer(req: IncomingMessage, res: ServerResponse, body: Buffer): void {
  bodies.push(body.toString("utf8"));
  const route = routes[`${req.method} ${req.url}`];
  const { status = 200, json } = route ? route(req, body) : { status: 404, json: { message: "Not Found", documentation_url: "https://docs.github.com/rest" } };
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(json));
}

beforeAll(async () => {
  manifest = await loadShop(SHOP, ["github-token"]);
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "town-github-shop-test-"));
  origin = await fakeOrigin(answer);
});

afterAll(async () => {
  await origin.close();
  await rm(stateRoot, { recursive: true, force: true });
});

afterEach(() => {
  origin.seen.length = 0;
});

function call(command: string, args: Record<string, string | number>, stdin?: string): Promise<RunResult> {
  bodies = [];
  return run(SHOP, manifest, command, args, {
    user: "u1",
    stateRoot,
    wall: openWall("none"),
    ...(stdin === undefined ? {} : { stdin }),
    credentials: [{ type: "github-token", origin: origin.url, header: "Authorization: Bearer {token}", token: TOKEN }],
  });
}

function expectClean(r: RunResult): void {
  expect(r.stdout).not.toContain(TOKEN);
  expect(r.stderr).not.toContain(TOKEN);
}

it("validates against the town's seeded type, and names that type as its one need", () => {
  expect(manifest.name).toBe("town/github");
  expect(manifest.credentials).toEqual([{ type: "github-token" }]);
  expect(manifest.commands.map((c) => c.name)).toEqual(["list", "show", "reply"]);
});

describe("list", () => {
  it("GETs the repo's issues with the state and a page size, signed by the town and by nothing of the shop's, and prints #<number> <title> less pull requests", async () => {
    routes = {
      [`GET /repos/octo-org/hello.world_2/issues?state=open&per_page=100&page=1`]: () => ({
        json: [issue(9, "Nine"), issue(8, "A pull request", true), issue(7, "Seven\nwith a newline")],
      }),
    };
    const r = await call("list", { repo: REPO });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toBe("#9 Nine\n#7 Seven with a newline\n");
    expect(r.stderr).toBe("");
    expect(r.credentials).toEqual([{ type: "github-token", requests: 1 }]);
    expect(origin.seen).toHaveLength(1);
    const { method, headers } = origin.seen[0]!;
    expect(method).toBe("GET");
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.accept).toBe("application/vnd.github+json");
    expect(headers["x-github-api-version"]).toBe("2022-11-28");
    expect(headers["user-agent"]).toBe("town-github");
    expectClean(r);
  });

  it("follows pages until the limit, and stops at five pages of pull requests with nothing printed", async () => {
    const page = (n: number, from: number, prs: number) => Array.from({ length: n }, (_, i) => issue(from - i, `Issue ${from - i}`, i < prs));
    routes = {
      "GET /repos/octo-org/hello.world_2/issues?state=all&per_page=100&page=1": () => ({ json: page(100, 1000, 10) }),
      "GET /repos/octo-org/hello.world_2/issues?state=all&per_page=100&page=2": () => ({ json: page(30, 900, 0) }),
    };
    const r = await call("list", { repo: REPO, state: "all", limit: 95 });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout.trimEnd().split("\n")).toHaveLength(95);
    expect(r.stdout).toMatch(/^#990 Issue 990\n/);
    expect(origin.seen.map((s) => s.url)).toEqual([
      "/repos/octo-org/hello.world_2/issues?state=all&per_page=100&page=1",
      "/repos/octo-org/hello.world_2/issues?state=all&per_page=100&page=2",
    ]);

    origin.seen.length = 0;
    routes = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((p) => [`GET /repos/octo-org/hello.world_2/issues?state=closed&per_page=100&page=${p}`, () => ({ json: page(100, 100 * p, 100) })]),
    );
    const prs = await call("list", { repo: REPO, state: "closed" });
    expect(prs).toMatchObject({ exit: 0, stdout: "", stderr: "" });
    expect(origin.seen).toHaveLength(5);
  });

  it("prints nothing and exits 0 for a repo with no issues", async () => {
    routes = { "GET /repos/octo-org/hello.world_2/issues?state=open&per_page=100&page=1": () => ({ json: [] }) };
    expect(await call("list", { repo: REPO })).toMatchObject({ exit: 0, stdout: "", stderr: "" });
  });
});

describe("show", () => {
  it("GETs the issue and prints its title, state, author, and body as plain lines", async () => {
    routes = { "GET /repos/octo-org/hello.world_2/issues/3": () => ({ json: { ...issue(3, "Three"), body: "First line.\n\nSecond." } }) };
    const r = await call("show", { repo: REPO, number: 3 });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toBe("#3 Three\nstate: open\nauthor: octocat\n\nFirst line.\n\nSecond.\n");
    expect(origin.seen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expectClean(r);
  });
});

describe("reply", () => {
  const comment = () => ({ status: 201, json: { id: 1, body: "x", html_url: `https://github.com/${REPO}/issues/3#issuecomment-1` } });

  it("POSTs --body as JSON to the issue's comments and prints the comment's html_url", async () => {
    routes = { "POST /repos/octo-org/hello.world_2/issues/3/comments": comment };
    const r = await call("reply", { repo: REPO, number: 3, body: "Seen, thanks." });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toBe(`https://github.com/${REPO}/issues/3#issuecomment-1\n`);
    expect(origin.seen[0]!.method).toBe("POST");
    expect(origin.seen[0]!.headers["content-type"]).toBe("application/json");
    expect(origin.seen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(bodies[0]!)).toEqual({ body: "Seen, thanks." });
    expectClean(r);
  });

  it("reads the body from stdin when --body is omitted, and refuses an empty one with nothing sent", async () => {
    routes = { "POST /repos/octo-org/hello.world_2/issues/3/comments": comment };
    const r = await call("reply", { repo: REPO, number: 3 }, "A long body\nfrom stdin.\n");
    expect(r.exit, r.stderr).toBe(0);
    expect(JSON.parse(bodies[0]!)).toEqual({ body: "A long body\nfrom stdin.\n" });

    origin.seen.length = 0;
    const empty = await call("reply", { repo: REPO, number: 3 }, " \n");
    expect(empty.exit).toBe(1);
    expect(empty.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(origin.seen).toHaveLength(0);
  });
});

describe("failures", () => {
  it("a 404 is exit 1 with the status and GitHub's message on stderr and nothing else", async () => {
    routes = {};
    const r = await call("list", { repo: "octocat/no-such-repo-here" });
    expect(r).toMatchObject({ exit: 1, stdout: "", stderr: "github answered 404: Not Found\n" });
    const shown = await call("reply", { repo: REPO, number: 77, body: "a body that must not be echoed" });
    expect(shown).toMatchObject({ exit: 1, stdout: "", stderr: "github answered 404: Not Found\n" });
  });

  it("a 403 whose message quotes something is still one line of status and message, and never the URL", async () => {
    routes = { "GET /repos/octo-org/hello.world_2/issues/5": () => ({ status: 403, json: { message: "Resource not accessible\nby personal access token" } }) };
    const r = await call("show", { repo: REPO, number: 5 });
    expect(r).toMatchObject({ exit: 1, stdout: "", stderr: "github answered 403: Resource not accessible by personal access token\n" });
    expect(r.stderr).not.toContain("127.0.0.1");
  });

  it("a repo that is not exactly owner/name sends nothing, whatever a prefix or regex grant would have let through", async () => {
    routes = {};
    for (const repo of ["owner/../../user", "owner/..", "./name", "owner", "a/b/c", "a b/c", "owner/name?x=1", "owner/name#x", "%2e%2e/x", "owner/", "/name", ""]) {
      const r = await call("list", { repo });
      expect(r.exit, repo).toBe(1);
      expect(r.stdout, repo).toBe("");
      expect(r.stderr, repo).toBe("the repo is not owner/name\n");
      expect(r.credentials, repo).toEqual([{ type: "github-token", requests: 0 }]);
    }
    expect(origin.seen).toHaveLength(0);
  });

  it("a number below one sends nothing", async () => {
    const r = await call("show", { repo: REPO, number: 0 });
    expect(r.exit).toBe(1);
    expect(origin.seen).toHaveLength(0);
  });
});

describe("the shop's own side of the window", () => {
  /** The entry run directly through its launcher, outside the town, its window pointed at `base`: what the shop sends before the town signs it. */
  function direct(base: string, ...argv: string[]): Promise<{ exit: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [MAIN_BIN, path.join(SHOP, "main.mjs"), ...argv], {
        cwd: SHOP,
        env: { PATH: process.env.PATH ?? "", TOWN_STATE: stateRoot, TOWN_USER: "u1", TOWN_CREDENTIAL_GITHUB_TOKEN: base },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
      child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
      child.on("close", (code) => resolve({ exit: code ?? -1, stdout, stderr }));
    });
  }

  it("sets no Authorization of its own: the teller would replace one, so this is the only place to see it", async () => {
    routes = {
      "GET /repos/octo-org/hello.world_2/issues?state=open&per_page=100&page=1": () => ({ json: [issue(1, "One")] }),
      "GET /repos/octo-org/hello.world_2/issues/1": () => ({ json: issue(1, "One") }),
      "POST /repos/octo-org/hello.world_2/issues/1/comments": () => ({ status: 201, json: { html_url: "https://github.com/x" } }),
    };
    bodies = [];
    for (const argv of [
      ["list", "--repo", REPO, "--state", "open", "--limit", "20"],
      ["show", "--repo", REPO, "--number", "1"],
      ["reply", "--repo", REPO, "--number", "1", "--body", "hi"],
    ]) {
      const r = await direct(origin.url, ...argv);
      expect(r.exit, r.stderr).toBe(0);
    }
    expect(origin.seen).toHaveLength(3);
    for (const s of origin.seen) {
      expect(s.headers, s.url).not.toHaveProperty("authorization");
      expect(Object.keys(s.headers).filter((h) => /auth|token|cookie/i.test(h)), s.url).toEqual([]);
    }
  });

  it("a window that cannot be reached is exit 1 with one line naming no URL", async () => {
    const dead = await fakeOrigin();
    const url = `${dead.url}/${randomBytes(16).toString("hex")}`;
    await dead.close();
    const r = await direct(url, "list", "--repo", REPO, "--state", "open", "--limit", "20");
    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("the town's window for github could not be reached\n");
  });
});
