// ring: box
// Box's journey 2 steps 1, 2, and 7, and its three criteria, as far as the
// isolate reaches: runIsolate called here in place of the object, in
// workerd, with the fake origin behind the Worker's own `fetch`. The
// prying shop as a worker shop with no needs reads its files under
// /bundle and its state, writes its state, is refused a write beside its
// entry, a child, and every fetch with the runtime's line, and sees
// exactly TOWN_STATE and TOWN_USER; no request of its reaches the origin.
// With a need for github-token it gains a window's URL, a request under
// it reaches the origin signed with the token, and the origin itself and
// any other address are 403 naming the call and never reach it. What the
// isolate was given is read twice, from the loader and from inside the
// shop, and holds strings alone; the token is in nothing the shop printed
// or kept. A window forwards by the teller's rule, and two users' states
// at one shop are two states. Then journey 2 step 8, the exfil test turned
// a second time, through the object: the prying shop published by an
// agent through the door, called with no need and then, its permit
// approved on a credential, with one, reads its files and its state, finds
// neither the store, nor the box's secrets, nor any binding, and sends
// four requests of which one arrives at the origin signed and three are
// refused; every row of it says `isolate`, and the token is in no row but
// the sealed one.

import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { windowRefusal } from "../src/window.js";
import type { BundleFile } from "../src/bundle.js";
import { ENTRY_MODULE, ENTRY_SOURCE, runIsolate, type IsolateResult } from "../src/isolate.js";
import { parseManifest } from "../src/manifest.js";
import { PRIED_ANSWER } from "./helpers/box-origin.js";
import { BOX_ENV, DOOR, LOADER, admin, call, expect0, inTown, originSeen, passFor, recordingLoader, rowsOf, shopFiles, tarOf, userName, windowFor } from "./helpers/box.js";

const PRYING = shopFiles("test/fixtures/prying-worker");
const PRYING_WITH_NEED = { ...PRYING, manifest: { ...PRYING.manifest, credentials: [{ type: "github-token" }] } };
const MEMORY = shopFiles("shops/memory");

/** The runtime's line for a fetch from an isolate loaded with no outbound. */
const NO_INTERNET = "This worker is not permitted to access the internet via global functions like fetch(). It must use capabilities (such as bindings in 'env') to talk to the outside world.";

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const TOKEN = `github_pat_${hex(20)}`;
const GITHUB = { type: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}", token: TOKEN };

/** The prying shop's report, one object per line. */
function report(r: IsolateResult): Array<Record<string, unknown>> {
  expect(r.stdout.endsWith("\n"), r.stdout).toBe(true);
  return r.stdout.trimEnd().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Step 1's first lines: /bundle listed, and each of its files read whole, the town's entry among them. */
const ownFiles = () => [
  { step: 1, act: "list", target: "/bundle", result: "ok", names: [ENTRY_MODULE, "main.mjs", "manifest.yaml"] },
  { step: 1, act: "read", target: `/bundle/${ENTRY_MODULE}`, result: "ok", content: ENTRY_SOURCE },
  { step: 1, act: "read", target: "/bundle/main.mjs", result: "ok", content: PRYING.files.get("main.mjs")!.content },
  { step: 1, act: "read", target: "/bundle/manifest.yaml", result: "ok", content: PRYING.files.get("manifest.yaml")!.content },
];

/** Step 1's state lines, for a state holding `notes/old` before the call. */
const stateLines = () => [
  { step: 1, act: "write", target: "/tmp/state/pried.txt", result: "ok" },
  { step: 1, act: "list", target: "/tmp/state", result: "ok", names: ["notes", "pried.txt"] },
  { step: 1, act: "list", target: "/tmp/state/notes", result: "ok", names: ["old"] },
  { step: 1, act: "read", target: "/tmp/state/notes/old", result: "ok", content: "kept from before" },
  { step: 1, act: "read", target: "/tmp/state/pried.txt", result: "ok", content: "written by the prying entry\n" },
];

const refusedLines = () => [
  { step: 1, act: "write", target: "/bundle/beside-the-entry.txt", result: "EPERM" },
  { step: 1, act: "spawn", target: "/bin/sh", result: "ERR_METHOD_NOT_IMPLEMENTED", message: "The child_process.spawnSync method is not implemented" },
];

const BEFORE = () => new Map([["notes/old", "kept from before"]]);
const AFTER = { "notes/old": "kept from before", "pried.txt": "written by the prying entry\n" };

it("walks journey 2 step 1: the prying shop with no needs reads its files and its state, is refused the rest with the runtime's lines, sees exactly TOWN_STATE and TOWN_USER, and no request of its leaves the isolate", async () => {
  const mark = hex(8);
  const loader = recordingLoader();
  const r = await runIsolate(PRYING.files, PRYING.manifest, "pry", {}, { user: "usr_dimitri", state: BEFORE(), loader, outbound: null, stdin: JSON.stringify({ mark, origin: "https://api.github.com" }) });

  // Nothing it sent arrived anywhere: the origin behind the Worker's fetch saw no request of this call's.
  const left = (await originSeen()).filter((s) => s.url.includes(mark));
  expect(left, "a request left the isolate").toEqual([]);

  expect([r.exit, r.stderr, r.wall, r.timedOut, r.credentials]).toEqual([0, "", "isolate", false, []]);
  expect(report(r)).toEqual([
    ...ownFiles(),
    ...stateLines(),
    ...refusedLines(),
    { step: 1, act: "env", target: "process.env", result: "ok", env: { TOWN_STATE: "/tmp/state", TOWN_USER: "usr_dimitri" } },
    { step: 1, act: "env", target: "cloudflare:workers", result: "ok", kinds: { TOWN_USER: "string" } },
    { step: 2, act: "fetch", target: "origin", url: `https://api.github.com/pried?by=${mark}`, result: "Error", message: NO_INTERNET },
    { step: 2, act: "fetch", target: "public", url: `https://example.com/pried?by=${mark}`, result: "Error", message: NO_INTERNET },
  ]);
  expect(Object.fromEntries(r.state)).toEqual(AFTER);
  // No outbound for a shop with no need: the isolate was loaded with none.
  expect(loader.given.map((c) => ({ outbound: c.globalOutbound, env: c.env }))).toEqual([{ outbound: null, env: { TOWN_USER: "usr_dimitri" } }]);
});

it("walks journey 2 step 2: with a need for github-token the prying shop gains a window, a request under it reaches the origin signed, and the origin itself and any other address are 403 naming the call and never reach it", async () => {
  const mark = hex(8);
  const loader = recordingLoader();
  const { needs, outbound, requests } = windowFor("call_pry_2", [GITHUB]);
  const window = `http://window/${needs[0]!.nonce}`;
  const r = await runIsolate(PRYING_WITH_NEED.files, PRYING_WITH_NEED.manifest, "pry", {}, {
    user: "usr_dimitri",
    state: BEFORE(),
    loader,
    outbound,
    credentials: needs,
    requests,
    stdin: JSON.stringify({ mark, origin: "https://api.github.com" }),
  });

  // One request arrived, the window's, with the type's header set from the token; the two past it never did.
  const arrived = (await originSeen()).filter((s) => s.url.includes(mark));
  expect(arrived.map((s) => [s.method, s.url, s.headers.authorization, s.body])).toEqual([["GET", `https://api.github.com/pried?by=${mark}`, `Bearer ${TOKEN}`, ""]]);

  expect([r.exit, r.stderr, r.wall, r.credentials]).toEqual([0, "", "isolate", [{ type: "github-token", requests: 1 }]]);
  expect(report(r)).toEqual([
    ...ownFiles(),
    ...stateLines(),
    ...refusedLines(),
    { step: 1, act: "env", target: "process.env", result: "ok", env: { TOWN_CREDENTIAL_GITHUB_TOKEN: window, TOWN_STATE: "/tmp/state", TOWN_USER: "usr_dimitri" } },
    { step: 1, act: "env", target: "cloudflare:workers", result: "ok", kinds: { TOWN_CREDENTIAL_GITHUB_TOKEN: "string", TOWN_USER: "string" } },
    { step: 2, act: "fetch", target: "TOWN_CREDENTIAL_GITHUB_TOKEN", url: `${window}/pried?by=${mark}`, result: "ok", status: 200, body: PRIED_ANSWER },
    { step: 2, act: "fetch", target: "origin", url: `https://api.github.com/pried?by=${mark}`, result: "ok", status: 403, body: windowRefusal("call_pry_2", "GET", new URL("https://api.github.com")) },
    { step: 2, act: "fetch", target: "public", url: `https://example.com/pried?by=${mark}`, result: "ok", status: 403, body: windowRefusal("call_pry_2", "GET", new URL("https://example.com")) },
  ]);
  expect(windowRefusal("call_pry_2", "GET", new URL("https://example.com/x"))).toBe("refused: GET https://example.com is not a window of call call_pry_2\n");
  expect(Object.fromEntries(r.state)).toEqual(AFTER);
  expect(loader.given.map((c) => c.globalOutbound)).toEqual([outbound]);

  // The token reached the window's props and the origin's header, and none of the isolate's env, its stdout, its stderr, or its state.
  const kept = [JSON.stringify(loader.given[0]!.env), r.stdout, r.stderr, JSON.stringify([...r.state])];
  expect(kept.filter((text) => text.includes(TOKEN))).toEqual([]);
  expect(needs[0]!.token).toBe(TOKEN);
});

it("the isolate's env holds strings alone: every value the entry was given, read from the loader and from inside the shop, is a string, and there is no binding, stub, or function", async () => {
  const loader = recordingLoader();
  const { needs, outbound, requests } = windowFor("call_env", [GITHUB]);
  const r = await runIsolate(PRYING_WITH_NEED.files, PRYING_WITH_NEED.manifest, "pry", {}, { user: "usr_1", state: new Map(), loader, outbound, credentials: needs, requests, stdin: "{}" });
  expect(r.exit, r.stderr).toBe(0);
  const given = loader.given[0]!.env as Record<string, unknown>;
  const kinds = (report(r).find((l) => l.target === "cloudflare:workers")!.kinds ?? {}) as Record<string, string>;
  expect(Object.entries(given).filter(([, v]) => typeof v !== "string").map(([k, v]) => [k, typeof v]), "a value the loader was given for the isolate's env is not a string").toEqual([]);
  expect(Object.entries(kinds).filter(([, kind]) => kind !== "string"), "a value the shop found in its env is not a string").toEqual([]);
  expect(Object.keys(given).sort()).toEqual(["TOWN_CREDENTIAL_GITHUB_TOKEN", "TOWN_USER"]);
  expect(kinds).toEqual({ TOWN_CREDENTIAL_GITHUB_TOKEN: "string", TOWN_USER: "string" });
});

it("forwards a window request by the teller's rule: the origin's base path, the path and query after it, the type's header in place of the shop's, a proxy header not passed on, the body as sent; and refuses a nonce not the call's", async () => {
  const mark = hex(8);
  const { manifest } = parseManifest(
    "name: test/sender\nversion: 0.0.1\nsummary: Sends one request through its window and one past it.\nruntime: worker\nentry: ./main.mjs\ncredentials:\n  - type: github-token\ncommands:\n  - name: send\n    summary: Send them.\n    effect: write\n    output: text\ntests:\n  - name: sends\n    run: send\n    expect: { exit: 0 }\n",
    ["github-token"],
  );
  const files = new Map<string, BundleFile>([
    [
      "main.mjs",
      {
        mode: 0o600,
        content: `export default async function main() {
  const base = process.env.TOWN_CREDENTIAL_GITHUB_TOKEN;
  const sent = await fetch(base + "/pried/deeper?q=1&by=${mark}", { method: "POST", headers: { authorization: "Bearer the-shops-own", "x-shop": "kept", "proxy-authorization": "Basic eA==", "content-type": "text/plain" }, body: "a body" });
  process.stdout.write(sent.status + " " + (await sent.text()) + "\\n");
  const other = await fetch("http://window/" + "0".repeat(32) + "/pried?by=${mark}");
  process.stdout.write(other.status + " " + (await other.text()));
}
`,
      },
    ],
  ]);
  const { needs, outbound, requests } = windowFor("call_forward", [{ ...GITHUB, origin: "https://origin.example/base/" }]);
  const r = await runIsolate(files, manifest!, "send", {}, { user: "usr_1", state: new Map(), loader: LOADER, outbound, credentials: needs, requests });
  expect(r.exit, r.stderr).toBe(0);
  expect(r.stdout).toBe(`200 ${PRIED_ANSWER}\n403 ${windowRefusal("call_forward", "GET", new URL("http://window/"))}`);
  const arrived = (await originSeen()).filter((s) => s.url.includes(mark));
  expect(arrived).toHaveLength(1);
  const [s] = arrived;
  expect([s!.method, s!.url, s!.body]).toEqual(["POST", `https://origin.example/base/pried/deeper?q=1&by=${mark}`, "a body"]);
  expect(s!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  expect(s!.headers["x-shop"]).toBe("kept");
  expect(s!.headers).not.toHaveProperty("proxy-authorization");
  expect(r.credentials).toEqual([{ type: "github-token", requests: 1 }]);
});

it("walks journey 2 step 7: two users' states at one shop are two states, and a key of ../escape is refused by the shop as on a laptop", async () => {
  const call = (user: string, state: Map<string, string>, command: string, args: Record<string, string>, stdin = "") =>
    runIsolate(MEMORY.files, MEMORY.manifest, command, args, { user, state, loader: LOADER, outbound: null, stdin });
  const alice = await call("usr_alice", new Map(), "remember", { key: "notes/secret", value: "alice's" });
  expect([alice.exit, Object.fromEntries(alice.state)]).toEqual([0, { "notes/secret": "alice's" }]);

  const dimitri = new Map([["notes/mine", "dimitri's"]]);
  const recall = await call("usr_dimitri", dimitri, "recall", { key: "notes/secret" });
  expect([recall.exit, recall.stdout, recall.stderr]).toEqual([1, "", "no value under that key\n"]);
  expect((await call("usr_dimitri", dimitri, "list", {})).stdout).toBe("notes/mine\n");
  expect((await call("usr_alice", alice.state, "recall", { key: "notes/secret" })).stdout).toBe("alice's\n");

  const escape = await call("usr_dimitri", dimitri, "remember", { key: "../escape", value: "x" });
  expect([escape.exit, escape.stderr, Object.fromEntries(escape.state)]).toEqual([1, "the key is outside the state\n", { "notes/mine": "dimitri's" }]);
});

it("hands a window to a shop with a need and to no other: a need without one, or a window for a shop with none, is refused before any isolate is loaded", async () => {
  const loader = recordingLoader();
  const { needs, outbound, requests } = windowFor("call_refused", [GITHUB]);
  await expect(runIsolate(PRYING.files, PRYING.manifest, "pry", {}, { user: "u", state: new Map(), loader, outbound, stdin: "{}" })).rejects.toThrow("test/prying meets no need and runIsolate was given a window");
  await expect(runIsolate(PRYING_WITH_NEED.files, PRYING_WITH_NEED.manifest, "pry", {}, { user: "u", state: new Map(), loader, outbound: null, credentials: needs, requests })).rejects.toThrow(
    "test/prying meets a need and runIsolate was given no window to reach it through",
  );
  expect(loader.given).toEqual([]);
});

it("the Worker's own door answers town at GET /, 404 where it has no route, and 401 at /admin without the operator's bearer", async () => {
  const home = await SELF.fetch("https://town.example/");
  expect([home.status, await home.text()]).toEqual([200, "town\n"]);
  for (const [method, url, status] of [["POST", "https://town.example/", 404], ["GET", "https://town.example/call", 404], ["POST", "https://town.example/admin", 401]] as const) {
    const res = await SELF.fetch(url, { method });
    expect([method, url, res.status]).toEqual([method, url, status]);
    await res.body?.cancel();
  }
});

it("walks journey 2 step 8 through the object: the prying shop an agent published reads its files and state, finds no store, secret, or binding, sends four requests of which one arrives signed and three are refused, and every row says isolate", async () => {
  const user = userName();
  const { token, passId } = await passFor(user);
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/hall"]));
  const secret = `github_pat_pry_${hex(16)}`;
  expect0(await admin(["credential", "add", "--user", user, "--type", "github-token", "--label", "pried"], `${secret}\n`));
  const credential = (await inTown((town) => town.store.listCredentials(user)))[0]!.id;

  const named = (name: string, need: boolean) => {
    const files = new Map(PRYING.files);
    const manifest = files.get("manifest.yaml")!;
    files.set("manifest.yaml", { ...manifest, content: manifest.content.replace("name: test/prying", `name: ${user}/${name}`).replace("runtime: worker", need ? "runtime: worker\ncredentials:\n  - type: github-token" : "runtime: worker") });
    return files;
  };

  // Step 1's halves: published by the agent, called, its row isolate, and nothing it sent left the box.
  const bare = named("prying", false);
  expect((await call(token, ["hall", "publish"], tarOf(bare))).stdout).toContain(`published ${user}/prying`);
  const mark = hex(8);
  const first = await call(token, ["prying", "pry"], JSON.stringify({ mark, origin: "https://api.github.com", town: DOOR }));
  expect([first.exit, first.stderr]).toEqual([0, ""]);
  const lines = first.stdout.trimEnd().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  expect(lines.filter((l) => l.act === "env")).toEqual([
    { step: 1, act: "env", target: "process.env", result: "ok", env: { TOWN_STATE: "/tmp/state", TOWN_USER: expect.stringMatching(/^user_[0-9a-f]{16}$/) } },
    { step: 1, act: "env", target: "cloudflare:workers", result: "ok", kinds: { TOWN_USER: "string" } },
  ]);
  expect(lines.filter((l) => l.act === "fetch").map((l) => [l.target, l.result, l.message])).toEqual([
    ["origin", "Error", NO_INTERNET],
    ["town", "Error", NO_INTERNET],
    ["public", "Error", NO_INTERNET],
  ]);
  expect((await originSeen()).filter((s) => s.url.includes(mark))).toEqual([]);

  // Step 2's halves and step 8: a need, a permit in place of a grant, approved on the credential, whose tests run then.
  const needy = named("prying-need", true);
  const published = await call(token, ["hall", "publish"], tarOf(needy));
  const permit = /requested (prm_[0-9a-f]{16})/.exec(published.stdout)?.[1];
  expect(permit, published.stdout).toBeDefined();
  const approved = await admin(["permit", "approve", permit!, "--credential", credential]);
  expect([approved.exit, approved.stderr]).toEqual([0, ""]);
  expect(approved.stdout).toMatch(/^ok it reports\ngrant_[0-9a-f]{16}\n$/);

  const mark2 = hex(8);
  const second = await call(token, ["prying-need", "pry"], JSON.stringify({ mark: mark2, origin: "https://api.github.com", town: DOOR }));
  expect([second.exit, second.stderr]).toEqual([0, ""]);
  const pried = second.stdout.trimEnd().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  // Its files and its state: /bundle holds the entry and its own files, and the state is its own.
  expect(pried.find((l) => l.act === "list" && l.target === "/bundle")).toEqual({ step: 1, act: "list", target: "/bundle", result: "ok", names: [ENTRY_MODULE, "main.mjs", "manifest.yaml"] });
  expect(pried.filter((l) => l.act === "write").map((l) => [l.target, l.result])).toEqual([["/tmp/state/pried.txt", "ok"], ["/bundle/beside-the-entry.txt", "EPERM"]]);
  // No store, no secret, no binding: the environment is three strings, and nothing it read holds the box's secrets or the token.
  const env = pried.find((l) => l.target === "process.env")!.env as Record<string, string>;
  expect(Object.keys(env)).toEqual(["TOWN_CREDENTIAL_GITHUB_TOKEN", "TOWN_STATE", "TOWN_USER"]);
  expect(env.TOWN_CREDENTIAL_GITHUB_TOKEN).toMatch(/^http:\/\/window\/[0-9a-f]{32}$/);
  expect(pried.find((l) => l.target === "cloudflare:workers")!.kinds).toEqual({ TOWN_CREDENTIAL_GITHUB_TOKEN: "string", TOWN_USER: "string" });
  for (const held of [secret, BOX_ENV.TOWN_OPERATOR, BOX_ENV.TOWN_VAULT_KEY]) expect(second.stdout).not.toContain(held);
  // Four requests: the window's arrives signed; the origin, the town, and a public address are refused and never arrive.
  const fetched = pried.filter((l) => l.act === "fetch");
  expect(fetched.map((l) => [l.target, l.status])).toEqual([
    ["TOWN_CREDENTIAL_GITHUB_TOKEN", 200],
    ["origin", 403],
    ["town", 403],
    ["public", 403],
  ]);
  const arrived = (await originSeen()).filter((s) => s.url.includes(mark2));
  expect(arrived.map((s) => [s.url, s.headers.authorization])).toEqual([[`https://api.github.com/pried?by=${mark2}`, `Bearer ${secret}`]]);

  // Every row that ran says isolate; the call's counts one request; the token is in no row but the sealed one.
  const rows = (await rowsOf(passId)).filter((r) => r.shop?.startsWith(`${user}/`));
  expect(rows.map((r) => [r.shop, r.command, r.result, r.wall, r.credentials])).toEqual([
    [`${user}/prying`, "pry", "ok", "isolate", []],
    [`${user}/prying-need`, "pry", "ok", "isolate", [{ type: "github-token", requests: 1 }]],
  ]);
  const approval = await inTown((town) => town.store.calls().filter((c) => c.detail?.startsWith(`approval ${permit}`) || c.parent !== null && c.shop === `${user}/prying-need`));
  expect(approval.map((c) => [c.detail, c.wall])).toEqual([["test it reports", "isolate"], [`approval ${permit} tests 1/1`, null]]);
  const kept = await inTown((town) => JSON.stringify([town.store.calls(), town.store.sql.all("SELECT * FROM shop_state"), town.store.sql.all("SELECT * FROM shop_files"), town.store.sql.all("SELECT id, user_id, type, label FROM credentials")]));
  expect(kept).not.toContain(secret);
});
