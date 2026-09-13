// ring: box
// The isolate (box's journey 2 steps 4 and 5, as far as the isolate
// reaches), in workerd through the pool's loader: runIsolate called here
// in place of the object. The seed shops memory, github, and gdocs run
// every test of their manifests, github and gdocs through a window to the
// fake origin behind the Worker's own `fetch`; watch's tests call the
// clerk, which is box phase 2's. The state goes in as rows and comes out
// as rows; a call that would leave it over eight megabytes fails with the
// cap's line and hands the state back as it was. A worker shop's four
// exits print as on a laptop (test/main.test.ts), an entry that does its
// work at the top level is exit 1 with spec §7's line at every call, and
// an entry that does not parse is exit 1 with the runtime's line. The
// race ends a call at its limit or its abort. The module table is Node's
// rule, and the isolate's compatibility date is the Worker's.

import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { requestsUnder } from "../src/box.js";
import type { BundleFile } from "../src/bundle.js";
import { NO_MAIN } from "../src/main.js";
import { parseManifest } from "../src/manifest.js";
import { COMPATIBILITY_DATE, ENTRY_MODULE, STATE_CAP_BYTES, moduleTable, runIsolate, stateCapLine, type IsolateOptions } from "../src/isolate.js";
import { SPEC } from "../src/spec.js";
import { WRANGLER, originSeen, shopFiles, testShopInIsolates, windowFor, type Shop } from "./helpers/box.js";

/** The pool's loader, bound as wrangler.jsonc and vitest.box.config.ts bind it. */
const LOADER = (env as unknown as { LOADER: WorkerLoader }).LOADER;
const MEMORY = shopFiles("shops/memory");
const WORKER = shopFiles("test/fixtures/worker-shop");
const MAINLESS = shopFiles("test/fixtures/mainless-shop");

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

const bare = (user = "usr_1"): IsolateOptions => ({ user, state: new Map(), loader: LOADER, outbound: null });

/** A shop of one file, `main.mjs`, whose manifest has one command, `run`. */
function oneFile(source: string): Shop {
  const { manifest, refusals } = parseManifest(
    "name: test/one\nversion: 0.0.1\nsummary: One file, for the isolate's tests.\nruntime: worker\nentry: ./main.mjs\ncommands:\n  - name: run\n    summary: Run it.\n    effect: read\n    output: text\ntests:\n  - name: runs\n    run: run\n    expect: { exit: 0 }\n",
  );
  if (!manifest) throw new Error(refusals.join("\n"));
  return { manifest, files: new Map([["main.mjs", { content: source, mode: 0o600 }]]) };
}

it("runs every test of town/memory, town/github, and town/gdocs through runIsolate, the two with needs through a window to the fake origin behind the Worker's fetch, signed", async () => {
  const memory = await testShopInIsolates(MEMORY);
  expect(memory).toEqual(MEMORY.manifest.tests.map((t) => ({ name: t.name, ok: true })));
  expect(memory).toHaveLength(5);

  const githubToken = `github_pat_${hex(20)}`;
  const github = shopFiles("shops/github");
  const githubResults = await testShopInIsolates(github, { credentials: [{ type: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}", token: githubToken }] });
  expect(githubResults).toEqual(github.manifest.tests.map((t) => ({ name: t.name, ok: true })));
  expect(githubResults).toHaveLength(3);

  const googleToken = `ya29.${hex(24)}`;
  const gdocs = shopFiles("shops/gdocs");
  const gdocsResults = await testShopInIsolates(gdocs, { credentials: [{ type: "google-oauth", origin: "https://docs.googleapis.com", header: "Authorization: Bearer {token}", token: googleToken }] });
  expect(gdocsResults).toEqual([{ name: "a missing document fails", ok: true }]);

  // What reached the origin, by the tokens this test signed with: every request of the two shops' tests, each with its type's header.
  const seen = await originSeen();
  const signed = (token: string) => seen.filter((s) => s.headers.authorization === `Bearer ${token}`).map((s) => `${s.method} ${s.url}`);
  expect(signed(githubToken)).toEqual([
    "GET https://api.github.com/repos/octocat/Hello-World/issues?state=all&per_page=100&page=1",
    "GET https://api.github.com/repos/octocat/Hello-World/issues/1",
    "GET https://api.github.com/repos/octocat/no-such-repo-here/issues?state=open&per_page=100&page=1",
  ]);
  expect(signed(googleToken)).toEqual(["GET https://docs.googleapis.com/v1/documents/no-such-document"]);
  expect(seen.filter((s) => JSON.stringify(s.headers).includes("github_pat_") && !s.headers.authorization?.startsWith("Bearer "))).toEqual([]);
});

it("prints github's list and gdocs's document from the origin's answers through the window, as on a laptop", async () => {
  const token = `github_pat_${hex(20)}`;
  const github = shopFiles("shops/github");
  const w = windowFor("call_list", [{ type: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}", token }]);
  const list = await runIsolate(github.files, github.manifest, "list", { repo: "octocat/Hello-World", state: "all", limit: 2 }, { ...bare(), outbound: w.outbound, credentials: w.needs, requests: requestsUnder });
  expect([list.exit, list.stdout, list.stderr, list.credentials]).toEqual([0, "#3 Three\n#2 Two\n", "", [{ type: "github-token", requests: 1 }]]);
  expect(list.stdout + list.stderr).not.toContain(token);

  const gdocs = shopFiles("shops/gdocs");
  const g = windowFor("call_read", [{ type: "google-oauth", origin: "https://docs.googleapis.com", header: "Authorization: Bearer {token}", token }]);
  const read = await runIsolate(gdocs.files, gdocs.manifest, "read", { "doc-id": "fixture-doc", format: "markdown" }, { ...bare(), outbound: g.outbound, credentials: g.needs, requests: requestsUnder });
  expect([read.exit, read.stdout, read.stderr]).toEqual([0, "# The fixture\nThe first line of the fixture.\n", ""]);
  const none = await runIsolate(github.files, github.manifest, "list", { repo: "octocat/Hello-World", state: "open", limit: 20 }, bare());
  expect([none.exit, none.stderr]).toEqual([1, "the town gave no window for a github-token\n"]);
});

it("takes the state in as rows and hands it back as rows: what the shop wrote, removed, and left, stdin included", async () => {
  const state = new Map([["u/c", "y"]]);
  const a = await runIsolate(MEMORY.files, MEMORY.manifest, "remember", { key: "t/a", value: "hello" }, { ...bare(), state });
  expect([a.exit, a.stderr, Object.fromEntries(a.state)]).toEqual([0, "", { "t/a": "hello", "u/c": "y" }]);
  expect(Object.fromEntries(state), "the rows handed in are not changed in place").toEqual({ "u/c": "y" });
  const b = await runIsolate(MEMORY.files, MEMORY.manifest, "remember", { key: "t/b/deep" }, { ...bare(), state: a.state, stdin: "from stdin\nsecond line" });
  expect(Object.fromEntries(b.state)).toEqual({ "t/a": "hello", "t/b/deep": "from stdin\nsecond line", "u/c": "y" });
  expect((await runIsolate(MEMORY.files, MEMORY.manifest, "recall", { key: "t/b/deep" }, { ...bare(), state: b.state })).stdout).toBe("from stdin\nsecond line\n");
  expect((await runIsolate(MEMORY.files, MEMORY.manifest, "list", { prefix: "t/" }, { ...bare(), state: b.state })).stdout).toBe("t/a\nt/b/deep\n");
  const c = await runIsolate(MEMORY.files, MEMORY.manifest, "forget", { key: "t/a" }, { ...bare(), state: b.state });
  expect([c.exit, Object.fromEntries(c.state)]).toEqual([0, { "t/b/deep": "from stdin\nsecond line", "u/c": "y" }]);
});

it("walks journey 2 step 4: a remember that would leave the state over eight megabytes fails with the cap's line, the state stays as it was, and a key written before still answers", async () => {
  const before = new Map<string, string>([["notes/kept", "written before"]]);
  for (let i = 0; i < 8; i++) before.set(`bulk/${i}`, "x".repeat(1_000_000));
  const big = "y".repeat(500_000);
  const over = await runIsolate(MEMORY.files, MEMORY.manifest, "remember", { key: "big" }, { ...bare(), state: before, stdin: big });
  const bytes = 8_000_000 + 500_000 + "notes/kept".length + "written before".length + "big".length + [...before.keys()].filter((k) => k.startsWith("bulk/")).join("").length;
  expect(bytes).toBeGreaterThan(STATE_CAP_BYTES);
  expect([over.exit, over.stdout, over.stderr]).toEqual([1, "", `${stateCapLine(bytes)}\n`]);
  expect(over.stderr).toBe(`town: the state would be ${bytes} bytes after this call, over the eight megabyte cap; it is kept as it was before the call\n`);
  expect(over.state.has("big")).toBe(false);
  expect(over.state).toEqual(before);

  const recall = await runIsolate(MEMORY.files, MEMORY.manifest, "recall", { key: "notes/kept" }, { ...bare(), state: over.state });
  expect([recall.exit, recall.stdout]).toEqual([0, "written before\n"]);
  // Under the cap, the same write is kept.
  const under = await runIsolate(MEMORY.files, MEMORY.manifest, "remember", { key: "small" }, { ...bare(), state: before, stdin: "fits" });
  expect([under.exit, under.state.get("small")]).toEqual([0, "fits"]);
});

it("ends a worker shop's main each of the four ways a laptop does, printing the same lines, and gives it the contract a process gets", async () => {
  const returns = await runIsolate(WORKER.files, WORKER.manifest, "returns", { code: 3 }, bare());
  expect([returns.exit, returns.stdout, returns.stderr, returns.wall]).toEqual([3, "returning 3\n", "", "isolate"]);
  const zero = await runIsolate(WORKER.files, WORKER.manifest, "returns", { code: 0 }, bare());
  expect([zero.exit, zero.stdout]).toEqual([0, "returning 0\n"]);
  const throws = await runIsolate(WORKER.files, WORKER.manifest, "throws", {}, bare());
  expect([throws.exit, throws.stdout, throws.stderr]).toEqual([1, "about to throw\n", "Error: the fixture threw on purpose\n"]);
  const exits = await runIsolate(WORKER.files, WORKER.manifest, "exits", {}, bare());
  expect([exits.exit, exits.stdout, exits.stderr]).toEqual([2, "", "exiting 2\n"]);
  const mainless = await runIsolate(MAINLESS.files, MAINLESS.manifest, "run", {}, bare());
  expect([mainless.exit, mainless.stdout, mainless.stderr]).toEqual([1, "", `${NO_MAIN}\n`]);

  const echo = await runIsolate(WORKER.files, WORKER.manifest, "echo", {}, { ...bare(), stdin: "sent on stdin" });
  expect(echo.exit, echo.stderr).toBe(0);
  expect(JSON.parse(echo.stdout)).toEqual({ argv: ["echo"], argv1: "/bundle/main.mjs", env: ["TOWN_STATE", "TOWN_USER"], stdin: "sent on stdin" });
});

it("walks journey 2 step 5: an entry that does its work at the top level is exit 1 with spec §7's line at every call, and one that does not parse is exit 1 with the runtime's line", async () => {
  // town/memory's program before box phase 0, its work at the top level and an await at column one.
  const topLevel = oneFile(`import { readFile } from "node:fs/promises";
process.stdout.write("top level ran;");
const value = await readFile(process.env.TOWN_STATE + "/key", "utf8").catch(() => "none");
process.stdout.write(value + "\\n");
`);
  for (const state of [new Map(), new Map([["key", "a value"]])]) {
    const r = await runIsolate(topLevel.files, topLevel.manifest, "run", {}, { ...bare(), state });
    expect([r.exit, r.stderr]).toEqual([1, `${NO_MAIN}\n`]);
    expect(r.state).toEqual(state);
  }
  expect(SPEC.split("## 7. ")[1]!.split("## 8. ")[0]!.replace(/\s+/g, " ")).toContain(NO_MAIN);

  const unparsed = oneFile("export default async function main() {\n  process.stdout.write('never');\n");
  const r = await runIsolate(unparsed.files, unparsed.manifest, "run", {}, { ...bare(), state: new Map([["kept", "yes"]]) });
  expect([r.exit, r.stdout, r.wall]).toEqual([1, "", "isolate"]);
  expect(r.stderr).toMatch(/^Uncaught SyntaxError: .+\n$/);
  expect(r.stderr.trimEnd().split("\n")).toHaveLength(1);
  expect(Object.fromEntries(r.state)).toEqual({ kept: "yes" });
});

it("races a call against its limit and its abort, ends it when either wins, and hands the state back as it was", async () => {
  const slow = oneFile(`import { writeFile } from "node:fs/promises";
export default async function main() {
  await writeFile(process.env.TOWN_STATE + "/started", "yes");
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  process.stdout.write("finished\\n");
}
`);
  const state = new Map([["kept", "yes"]]);
  const started = Date.now();
  const timedOut = await runIsolate(slow.files, slow.manifest, "run", {}, { ...bare(), state, timeoutMs: 200 });
  expect([timedOut.exit, timedOut.timedOut, timedOut.aborted, timedOut.stdout, Object.fromEntries(timedOut.state)]).toEqual([1, true, false, "", { kept: "yes" }]);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  const aborted = await runIsolate(slow.files, slow.manifest, "run", {}, { ...bare(), state, signal: controller.signal });
  expect([aborted.exit, aborted.timedOut, aborted.aborted, Object.fromEntries(aborted.state)]).toEqual([1, false, true, { kept: "yes" }]);
  expect(Date.now() - started).toBeLessThan(5_000);

  const already = await runIsolate(slow.files, slow.manifest, "run", {}, { ...bare(), signal: AbortSignal.abort() });
  expect([already.exit, already.aborted, already.wall]).toEqual([1, true, null]);
});

it("loads a shop's files by Node's rule: its entry and what it reaches as js, cjs, or json, every other file as bytes, all readable under /bundle", async () => {
  const file = (content: string): BundleFile => ({ content, mode: 0o600 });
  const files = new Map<string, BundleFile>([
    ["main.mjs", file(`import util from "./lib/util.js";\nimport data from "./data.json";\nimport { readFileSync } from "node:fs";\nexport default async function main() {\n  const esm = await import("./esm/plain.js");\n  process.stdout.write([util.twice(2), data.name, esm.said, readFileSync("/bundle/notes.txt", "utf8"), readFileSync("/bundle/unreached.js", "utf8")].join(" "));\n}\n`)],
    ["lib/package.json", file(`{ "type": "commonjs" }`)],
    ["lib/util.js", file(`module.exports = { twice: (n) => n * 2 };\n`)],
    ["data.json", file(`{ "name": "data" }`)],
    ["esm/plain.js", file(`export const said = "esm";\n`)],
    ["notes.txt", file("a note")],
    ["unreached.js", file("this is { not code")],
  ]);
  const table = moduleTable("main.mjs", files);
  expect(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, Object.keys(v)[0]]))).toEqual({
    [ENTRY_MODULE]: "js",
    "main.mjs": "js",
    "lib/package.json": "data",
    "lib/util.js": "cjs",
    "data.json": "json",
    "esm/plain.js": "js",
    "notes.txt": "data",
    "unreached.js": "data",
  });
  const shop = oneFile("");
  const r = await runIsolate(files, shop.manifest, "run", {}, bare());
  expect([r.exit, r.stderr, r.stdout]).toEqual([0, "", "4 data esm a note this is { not code"]);
});

it("loads each isolate with the Worker's own compatibility date", () => {
  expect(WRANGLER).toContain(`"compatibility_date": "${COMPATIBILITY_DATE}"`);
});
