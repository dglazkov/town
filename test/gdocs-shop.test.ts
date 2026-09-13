// ring: checkout
// The gdocs shop's shape, as github-shop.test.ts proves github's, against
// stand-ins. Its manifest validates, proposing google-oauth with Google's
// endpoints and the one scope, and its guidance naming no host; its entry
// runs through the real runtime with a google-oauth credential whose
// origin is a fake docs origin on loopback that answers only for a live
// access token the fake authorization server issued, with a document of
// the Docs API's shape. What this proves is what the shop sends and what
// it prints from answers of that shape: the path, no Authorization of its
// own, paragraphs as lines, headings as # in markdown, a 404 as its status
// alone, a malformed id sending nothing; and its one test, run through the
// town's tests on that credential, reaching the fake signed. Like github's
// "a missing repo fails", that test also passes with no origin at all
// (the teller's 502 is exit 1), so here the fake's record is what shows it
// was signed. It does not prove Google answers so; the by-hand proof does.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Manifest } from "../src/manifest.js";
import { MAIN_BIN, run, type RunResult } from "../src/runtime.js";
import { loadShop, testShop } from "../src/shoptest.js";
import { openWall } from "../src/wall.js";
import { FIXTURE_DOCUMENT, fakeAuthServer, fakeDocs, tokensFrom, type FakeAuth, type FakeDocs } from "./helpers/authserver.js";

const SHOP = path.resolve(import.meta.dirname, "../shops/gdocs");
const CLIENT = { clientId: "gdocs-client.apps", clientSecret: "gdocs-client-secret-0b2d" };

let manifest: Manifest;
let stateRoot: string;
let auth: FakeAuth;
let docs: FakeDocs;
let access: string;

beforeAll(async () => {
  manifest = await loadShop(SHOP, ["github-token"]);
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "town-gdocs-shop-test-"));
  auth = await fakeAuthServer(CLIENT);
  docs = await fakeDocs(auth, {
    "fixture-doc": FIXTURE_DOCUMENT,
    "a-table": { body: { content: [{ table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ textRun: { content: "cell one\n" } }] } }] }, { content: [{ paragraph: { elements: [{ textRun: { content: "cell two\n" } }] } }] }] }] } }] } },
  });
  access = (await tokensFrom(auth, CLIENT)).access_token;
});

afterAll(async () => {
  await docs.close();
  await auth.close();
  await rm(stateRoot, { recursive: true, force: true });
});

beforeEach(() => {
  auth.events.length = 0;
});

const credential = (token = access) => [{ type: "google-oauth", origin: docs.url, header: "Authorization: Bearer {token}", token }];

function read(args: Record<string, string>, token?: string): Promise<RunResult> {
  return run(SHOP, manifest, "read", args, { user: "u1", stateRoot, wall: openWall("none"), credentials: credential(token) });
}

const docsSeen = () => auth.events.filter((e) => e.kind === "docs").map((e) => [e.url, e.status, e.authorization]);

it("validates, proposing google-oauth with Google's endpoints and one scope, and its one test is a missing document", () => {
  expect(manifest.name).toBe("town/gdocs");
  expect(manifest.credentials).toEqual([
    {
      type: "google-oauth",
      origin: "https://docs.googleapis.com",
      header: "Authorization: Bearer {token}",
      oauth: { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/documents.readonly"] },
      guidance: "In the Google Cloud console, enable the Google Docs API and make\nan OAuth client of the Desktop type; give the town its client id\nand secret, then connect, which opens Google's consent page.\n",
    },
  ]);
  expect(manifest.commands.map((c) => [c.name, (c.args ?? []).map((a) => a.name)])).toEqual([["read", ["doc-id", "format"]]]);
  expect(manifest.tests).toEqual([{ name: "a missing document fails", run: "read --doc-id no-such-document", expect: { exit: 1 } }]);
});

describe("read", () => {
  it("GETs /v1/documents/<id> through the window, signed by the town, and prints one paragraph a line", async () => {
    const r = await read({ "doc-id": "fixture-doc", format: "text" });
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toBe("The fixture\nThe first line of the fixture.\nA heading\nSome bold words.\n");
    expect(r.stderr).toBe("");
    expect(r.credentials).toEqual([{ type: "google-oauth", requests: 1 }]);
    expect(docsSeen()).toEqual([["/v1/documents/fixture-doc", 200, true]]);
    expect(r.stdout + r.stderr).not.toContain(access);
  });

  it("marks headings with # in markdown, and walks a table's cells", async () => {
    expect((await read({ "doc-id": "fixture-doc", format: "markdown" })).stdout).toBe("# The fixture\nThe first line of the fixture.\n## A heading\nSome bold words.\n");
    expect((await read({ "doc-id": "a-table", format: "text" })).stdout).toBe("cell one\ncell two\n");
  });

  it("is exit 1 with the status alone for a missing document or a token the origin refuses, and nothing on stdout", async () => {
    expect(await read({ "doc-id": "no-such-document", format: "text" })).toMatchObject({ exit: 1, stdout: "", stderr: "gdocs answered 404\n" });
    expect(await read({ "doc-id": "fixture-doc", format: "text" }, "not-a-token-the-fake-issued")).toMatchObject({ exit: 1, stdout: "", stderr: "gdocs answered 401\n" });
    expect(docsSeen()).toEqual([["/v1/documents/no-such-document", 404, true], ["/v1/documents/fixture-doc", 401, false]]);
  });

  it("sends nothing for an id that is not one", async () => {
    for (const id of ["../x", "a/b", "a?b", "a b", "%2e%2e", ""]) {
      const r = await read({ "doc-id": id, format: "text" });
      expect([id, r.exit, r.stdout, r.stderr]).toEqual([id, 1, "", "the document id is not one\n"]);
    }
    expect(docsSeen()).toEqual([]);
  });
});

it("sets no Authorization of its own: run directly against the fake, the request arrives unsigned and is refused", async () => {
  const r = await new Promise<{ exit: number; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [MAIN_BIN, path.join(SHOP, "main.mjs"), "read", "--doc-id", "fixture-doc", "--format", "text"], {
      cwd: SHOP,
      env: { PATH: process.env.PATH ?? "", TOWN_STATE: stateRoot, TOWN_USER: "u1", TOWN_CREDENTIAL_GOOGLE_OAUTH: docs.url },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    child.on("close", (code) => resolve({ exit: code ?? -1, stderr }));
  });
  expect(r).toEqual({ exit: 1, stderr: "gdocs answered 401\n" });
  expect(docsSeen()).toEqual([["/v1/documents/fixture-doc", 401, false]]);
});

it("its one test passes through the town's tests on the credential, and the fake saw the request signed", async () => {
  const results = await testShop(SHOP, { types: ["github-token"], wall: openWall("none"), credentials: credential() });
  expect(results).toEqual([{ name: "a missing document fails", ok: true }]);
  expect(docsSeen()).toEqual([["/v1/documents/no-such-document", 404, true]]);
});
