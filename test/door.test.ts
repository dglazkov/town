// ring: box
// The door and the object, in workerd through the pool, the fake origin
// and the fake authorization server behind the Worker's own `fetch`. The
// door's routes, each answer carrying x-town-build, and 404 elsewhere; a
// body that is not a call refused as `parseCall` refuses it, with its row;
// the operator's bearer wrong or absent answered 401 with no verb run and
// no row. The operator's journey over the wire: `town --help` through
// /call from the hall, `shop add -` of a bundle running the shop's tests
// in isolates, a directory refused naming the pipe, a subprocess shop
// refused at `shop add` and at the hall's `publish`, and a worker shop
// published and called, its row saying `isolate`. town/watch calling
// town/github and town/memory through the clerk's host, the tree in the
// audit, and a call its grant does not cover denied one level down in
// compose's words. The top-level shop and the unparsed one exit 1 at every
// call with their lines in the audit, and a call past thirty seconds is
// ended. A consent over the wire: the URL, the landing, the wait answered;
// a state the object does not hold, a second landing, and the provider's
// `error` refused in consent's words; the timeout; and the refresh at a
// call when the clock var moves an hour.

import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { BODY_LIMIT_BYTES } from "../src/clerk.js";
import { BROWSER_CONNECTED, BROWSER_NOT_CONNECTED } from "../src/consent.js";
import { SUBPROCESS_REFUSAL } from "../src/wall.js";
import type { BundleFile } from "../src/bundle.js";
import { NO_MAIN } from "../src/main.js";
import { OAUTH } from "./helpers/box-origin.js";
import { BOX_ENV, DOOR, admin, call, expect0, inTown, passFor, rowsOf, shopFiles, tarOf, userName, waitConsent } from "./helpers/box.js";

const MEMORY = shopFiles("shops/memory");
const GITHUB = shopFiles("shops/github");
const WATCH = shopFiles("shops/watch", ["github-token"], [GITHUB, MEMORY]);
const WORKER = shopFiles("test/fixtures/worker-shop");
const ECHO = shopFiles("test/fixtures/echo-shop");

/** A shop's files with its manifest's text changed by `edit`. */
function edited(shop: { files: Map<string, BundleFile> }, edit: (manifest: string) => string): Map<string, BundleFile> {
  const files = new Map(shop.files);
  const m = files.get("manifest.yaml")!;
  files.set("manifest.yaml", { ...m, content: edit(m.content) });
  return files;
}

/** How many rows the object's audit, credentials, and consents hold. */
const counts = () =>
  inTown((town) => ({
    calls: town.store.calls().length,
    credentials: town.store.listCredentials().length,
    consents: town.store.sql.all("SELECT id, landing, outcome FROM consents ORDER BY id"),
    users: town.store.listUsers().length,
  }));

/** Memory, in the town once for the ring's tests that grant it. */
let memoryAdded: Promise<unknown> | null = null;
const withMemory = () => (memoryAdded ??= admin(["shop", "add", "-"], tarOf(MEMORY.files)).then(expect0));

it("answers GET / with town, 404 where it has no route, 401 at /admin and its wait without the operator's bearer, and x-town-build on every answer", async () => {
  const requests: Array<[string, string, number]> = [
    ["GET", "/", 200],
    ["PUT", "/", 404],
    ["GET", "/call", 404],
    ["GET", "/admin", 404],
    ["POST", "/admin", 401],
    ["GET", "/admin/consent/some-state", 401],
    ["GET", "/nothing/here", 404],
    ["GET", "/consent/some-state", 404],
    ["POST", "/call", 200],
  ];
  for (const [method, path, status] of requests) {
    const res = await SELF.fetch(`${DOOR}${path}`, { method, ...(method === "POST" ? { body: "{}" } : {}) });
    expect([method, path, res.status, res.headers.get("x-town-build")]).toEqual([method, path, status, BOX_ENV.TOWN_BUILD]);
    if (method === "GET" && path === "/") expect(await res.text()).toBe("town\n");
    else await res.body?.cancel();
  }
  expect(BOX_ENV.TOWN_BUILD).toBe("checkout");
});

it("refuses the operator's bearer wrong or absent with 401 and the pipe's words, running no verb and writing no row", async () => {
  const before = await counts();
  const name = userName();
  for (const token of ["not-the-operator's-token", null, `${BOX_ENV.TOWN_OPERATOR}x`, BOX_ENV.TOWN_OPERATOR.slice(0, -1)]) {
    const res = await SELF.fetch(`${DOOR}/admin`, { method: "POST", headers: token === null ? {} : { authorization: `Bearer ${token}` }, body: JSON.stringify({ argv: ["user", "add", name], stdin: null }) });
    expect([res.status, await res.json()]).toEqual([401, { error: "the operator token is refused" }]);
    expect((await waitConsent("any-state", token)).status).toBe(401);
  }
  expect(await counts()).toEqual(before);
  expect(await inTown((town) => town.store.userByName(name))).toBeNull();
  // The right bearer runs the verb.
  expect(expect0(await admin(["user", "add", name])).stdout).toMatch(/^user_[0-9a-f]{16}\n$/);
});

it("refuses a body that is not a call as parseCall does, one row each, and an unknown bearer as an invalid pass", async () => {
  const post = async (body: string, token: string | null = null) =>
    (await SELF.fetch(`${DOOR}/call`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body })).json() as Promise<{ stdout: string; stderr: string; exit: number }>;
  const before = (await counts()).calls;
  const bad = { stdout: "", stderr: "error: the town could not parse this call\n", exit: 1 };
  expect(await post("not json")).toEqual(bad);
  expect(await post(JSON.stringify({ argv: "memory" }))).toEqual(bad);
  expect(await post(JSON.stringify({ argv: ["memory"], stdin: 3 }))).toEqual(bad);
  expect(await post(JSON.stringify({ argv: [1] }))).toEqual(bad);
  const size = BODY_LIMIT_BYTES + 10;
  expect(await post("x".repeat(size))).toEqual({ stdout: "", stderr: `error: stdin is ${size} bytes, over the one megabyte limit\n`, exit: 1 });
  expect(await post(JSON.stringify({ argv: ["--help"] }), "not-a-pass")).toEqual({ stdout: "", stderr: "error: this pass is not valid: its token is unknown, revoked, or expired\n", exit: 3 });
  const rows = await inTown((town) => town.store.calls().slice(before));
  expect(rows.map((r) => [r.result, r.detail, r.passId])).toEqual([
    ["usage", "bad-request", null],
    ["usage", "bad-request", null],
    ["usage", "bad-request", null],
    ["usage", "bad-request", null],
    ["usage", "body-too-large", null],
    ["invalid-pass", "unknown", null],
  ]);
});

it("walks journey 1 steps 3 to 5 over the wire: shop add - runs memory's five tests in isolates, a directory and a subprocess shop are refused, the grant file names the box, and town --help and memory answer through /call", async () => {
  const dir = await admin(["shop", "add", "shops/memory"]);
  expect([dir.exit, dir.stdout, dir.stderr]).toEqual([1, "", "townd admin: shop add refused: over --town a shop comes from stdin: tar --format ustar -cf - -C shops/memory . | townd admin --town https://town.example shop add -\n"]);
  const added = await admin(["shop", "add", "-"], tarOf(MEMORY.files));
  expect([added.exit, added.stderr, added.stdout]).toEqual([0, "", `${MEMORY.manifest.tests.map((t) => `ok ${t.name}\n`).join("")}added town/memory 0.1.0\n`]);
  expect(MEMORY.manifest.tests).toHaveLength(5);
  expect((await admin(["shop", "ls"])).stdout).toMatch(/^town\/memory\s+0\.1\.0\s+-\s+remember,recall,list,forget\s/m);

  const echo = edited(ECHO, (m) => m);
  const sub = await admin(["shop", "add", "-"], tarOf(echo));
  expect([sub.exit, sub.stdout, sub.stderr]).toEqual([1, "", `townd admin: shop add refused: ${SUBPROCESS_REFUSAL}\n`]);
  expect((await admin(["shop", "ls"])).stdout).not.toContain("test/echo");

  for (const flags of [["--wall", "none"], ["--data", "/tmp/town"]]) {
    const r = await admin([...flags, "shop", "ls"]);
    expect(r.exit, flags.join(" ")).toBe(1);
  }
  expect((await admin(["--wall", "none", "shop", "ls"])).stderr).toBe("townd admin: --wall is not the operator's to choose on the box; every shop runs in an isolate\n");

  const user = userName();
  const { token, passId, town } = await passFor(user);
  expect(town).toBe(DOOR);
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list"]));
  const help = await call(token, ["--help"]);
  expect([help.exit, help.build]).toEqual([0, "checkout"]);
  expect(help.stdout).toMatch(/^town\/memory\s.*\[remember, recall, list\]$/m);
  expect((await call(token, ["memory", "--help"])).stdout).toContain("research assistant");
  expect(await call(token, ["memory", "remember", "--key", "t/a", "--value", "hello"])).toMatchObject({ exit: 0, stdout: "", stderr: "" });
  expect(await call(token, ["memory", "recall", "--key", "t/a"])).toMatchObject({ exit: 0, stdout: "hello\n" });
  const rows = await rowsOf(passId);
  expect(rows.map((r) => [r.shop, r.command, r.result, r.wall])).toEqual([
    [null, null, "ok", null],
    ["town/memory", null, "ok", null],
    ["town/memory", "remember", "ok", "isolate"],
    ["town/memory", "recall", "ok", "isolate"],
  ]);
  const audit = (await admin(["audit", "--pass", passId])).stdout;
  expect(audit).toMatch(/\stown\/memory\s+remember\s.*\sisolate\s+-\n/);
});

it("answers town --help from the hall through /call, publishes a worker shop an agent sent, refuses a subprocess shop at publish, and the published shop's row says isolate", async () => {
  const user = userName();
  const { token, passId } = await passFor(user);
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/hall"]));
  const help = await call(token, ["--help"]);
  expect(help.stdout).toMatch(/^town\/hall\s/m);

  const worker = edited(WORKER, (m) => m.replace(/^name: test\/worker$/m, `name: ${user}/worker`));
  const published = await call(token, ["hall", "publish"], tarOf(worker));
  expect(published.exit, published.stdout + published.stderr).toBe(0);
  expect(published.stdout).toContain(`published ${user}/worker`);
  const returns = await call(token, ["worker", "returns", "--code", "0"]);
  expect([returns.exit, returns.stdout]).toEqual([0, "returning 0\n"]);

  const echo = edited(ECHO, (m) => m.replace(/^name: test\/echo$/m, `name: ${user}/echo`));
  const refused = await call(token, ["hall", "publish"], tarOf(echo));
  expect([refused.exit, refused.stdout]).toEqual([1, `${SUBPROCESS_REFUSAL}\n`]);
  expect(await inTown((town) => town.store.getShop(`${user}/echo`))).toBeNull();

  const rows = await rowsOf(passId);
  expect(rows.filter((r) => r.shop === `${user}/worker`).map((r) => [r.command, r.result, r.wall])).toEqual([["returns", "ok", "isolate"]]);
  expect(rows.filter((r) => r.shop === "town/hall").map((r) => [r.command, r.result, r.detail])).toEqual([
    ["publish", "ok", `published ${user}/worker 0.0.1`],
    ["publish", "usage", "refused §7"],
  ]);
});

it("walks journey 2 step 5 through the object: an entry that works at the top level is exit 1 at every call with spec §7's line in the audit, and one that does not parse with the runtime's", async () => {
  const one = (name: string, source: string): Map<string, BundleFile> =>
    new Map([
      ["manifest.yaml", { content: `name: test/${name}\nversion: 0.0.1\nsummary: One file.\nruntime: worker\nentry: ./main.mjs\ncommands:\n  - name: run\n    summary: Run it.\n    effect: read\n    output: text\ntests:\n  - name: fails\n    run: run\n    expect: { exit: 1 }\n`, mode: 0o600 }],
      ["main.mjs", { content: source, mode: 0o600 }],
    ]);
  expect0(await admin(["shop", "add", "-"], tarOf(one("top", `process.stdout.write("top level\\n");\nawait Promise.resolve();\n`))));
  expect0(await admin(["shop", "add", "-"], tarOf(one("unparsed", "export default async function main() {\n"))));
  const { token, passId } = await passFor(userName());
  for (const shop of ["top", "unparsed"]) expect0(await admin(["grant", "new", "--pass", passId, "--shop", `test/${shop}`]));
  for (let i = 0; i < 2; i++) {
    expect(await call(token, ["top", "run"])).toMatchObject({ exit: 1, stdout: "top level\n", stderr: `error: test/top run failed\n${NO_MAIN}\n` });
    const unparsed = await call(token, ["unparsed", "run"]);
    expect([unparsed.exit, unparsed.stdout]).toEqual([1, ""]);
    expect(unparsed.stderr).toMatch(/^error: test\/unparsed run failed\nUncaught SyntaxError: .+\n$/);
  }
  const rows = await rowsOf(passId);
  expect(rows.filter((r) => r.shop !== null).map((r) => [r.shop, r.result, r.shopExit, r.wall])).toEqual([
    ["test/top", "shop-error", 1, "isolate"],
    ["test/unparsed", "shop-error", 1, "isolate"],
    ["test/top", "shop-error", 1, "isolate"],
    ["test/unparsed", "shop-error", 1, "isolate"],
  ]);
  expect(rows.find((r) => r.shop === "test/top")!.stderr).toBe(`${NO_MAIN}\n`);
  expect(rows.find((r) => r.shop === "test/unparsed")!.stderr).toMatch(/^Uncaught SyntaxError: /);
});

it("walks journey 2 step 3: town/watch posts its calls through the clerk's host, each decided as the agent cut by watch's manifest and recorded under watch's call, and a call its grant does not cover is denied one level down in compose's words", async () => {
  await withMemory();
  const user = userName();
  const secret = `github_pat_door_${crypto.randomUUID().replace(/-/g, "")}`;
  expect0(await admin(["user", "add", user]));
  expect0(await admin(["credential", "add", "--user", user, "--type", "github-token", "--label", "door"], `${secret}\n`));
  expect(expect0(await admin(["shop", "add", "-", "--user", user], tarOf(GITHUB.files))).stdout).toBe("ok list prints numbered lines\nok show prints a title\nok a missing repo fails\nadded town/github 0.1.0\n");
  const watch = await admin(["shop", "add", "-", "--user", user], tarOf(WATCH.files));
  expect([watch.exit, watch.stderr, watch.stdout]).toEqual([0, "", "ok a look, then what changed\nok no look yet fails\nadded town/watch 0.1.0\n"]);
  // A watch whose manifest calls memory at recall alone, and whose code remembers as watch's does.
  const narrow = edited(WATCH, (m) => m.replace("name: town/watch", "name: test/watch-narrow").replace("commands: [remember, recall]", "commands: [recall]").replace(/tests:\n[\s\S]*$/, "tests:\n  - name: no look yet fails\n    run: changes --repo octocat/Hello-World\n    expect: { exit: 1 }\n"));
  expect(expect0(await admin(["shop", "add", "-", "--user", user], tarOf(narrow))).stdout).toBe("ok no look yet fails\nadded test/watch-narrow 0.1.0\n");

  const made = expect0(await admin(["pass", "new", "--user", user, "--label", "issue watcher"]));
  const { token } = JSON.parse(made.stdout) as { token: string };
  const passId = made.stderr.trim();
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/github", "--commands", "list,show", "--constraint", "list.repo equals octocat/Hello-World"]));
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list"]));
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/watch", "--commands", "mark,changes"]));
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "test/watch-narrow", "--commands", "mark,changes"]));

  expect(await call(token, ["watch", "mark", "--repo", "octocat/Hello-World"])).toMatchObject({ exit: 0, stdout: "remembered 3 open issues\n", stderr: "" });
  expect(await call(token, ["memory", "recall", "--key", "watch/octocat/Hello-World"])).toMatchObject({ exit: 0, stdout: "#3 Three\n#2 Two\n#1 One\n" });
  expect(await call(token, ["watch", "changes", "--repo", "octocat/Hello-World"])).toMatchObject({ exit: 0, stdout: "opened: none\nclosed: none\n" });

  const rows = await rowsOf(passId);
  const mark = rows.find((r) => r.shop === "town/watch" && r.command === "mark")!;
  expect(rows.filter((r) => r.parent === mark.callId).map((r) => [r.passId, r.shop, r.command, r.result, r.credentials, r.wall])).toEqual([
    [passId, "town/github", "list", "ok", [{ type: "github-token", requests: 1 }], "isolate"],
    [passId, "town/memory", "remember", "ok", [], "isolate"],
  ]);
  const tree = expect0(await admin(["audit", "--call", mark.callId])).stdout.trim().split("\n");
  expect(tree.slice(1).map((l) => l.split(/\s+/).filter(Boolean).slice(0, 4))).toEqual([
    [mark.callId, expect.any(String), passId, "town/watch"],
    [expect.stringMatching(/^call_/), expect.any(String), passId, "town/github"],
    [expect.stringMatching(/^call_/), expect.any(String), passId, "town/memory"],
  ]);
  expect(tree[2]).toMatch(/^ {2}call_/);

  // The agent's constraint, met one level down: github's line, exit 2, and nothing of watch's.
  const outside = await call(token, ["watch", "mark", "--repo", "octocat/Spoon-Knife"]);
  expect([outside.exit, outside.stdout, outside.stderr]).toEqual([2, "", "error: --repo must be 'octocat/Hello-World' under this grant\n"]);
  // Watch's own manifest, met one level down: memory at remember is the agent's, and not the narrow watch's.
  const cut = await call(token, ["watch-narrow", "mark", "--repo", "octocat/Hello-World"]);
  expect([cut.exit, cut.stdout, cut.stderr]).toEqual([2, "", "error: command 'remember' is not available to this grant\n"]);
  const denied = (await rowsOf(passId)).filter((r) => r.result === "denied");
  expect(denied.map((r) => [r.shop, r.command, r.detail, r.parent === null])).toEqual([
    ["town/watch", "mark", "inner", true],
    ["town/github", "list", "constraint list.repo equals", false],
    ["test/watch-narrow", "mark", "inner", true],
    ["town/memory", "remember", "command", false],
  ]);
  // The token is in no row but the sealed one.
  const everything = await inTown((town) => JSON.stringify([town.store.calls(), town.store.sql.all("SELECT * FROM shop_state"), town.store.sql.all("SELECT shop, path FROM shop_files")]));
  expect(everything).not.toContain(secret);
});

it("walks journey 2 step 6 through the object: a call past thirty seconds of wall clock is ended and says so, as on a laptop", async () => {
  const slow = new Map<string, BundleFile>([
    ["manifest.yaml", { content: "name: test/slow\nversion: 0.0.1\nsummary: Sleeps.\nruntime: worker\nentry: ./main.mjs\ncommands:\n  - name: sleep\n    summary: Sleep.\n    effect: read\n    args:\n      - { name: ms, type: int, required: true }\n    output: text\ntests:\n  - name: wakes\n    run: sleep --ms 1\n    expect: { exit: 0 }\n", mode: 0o600 }],
    ["main.mjs", { content: "export default async function main() {\n  await new Promise((r) => setTimeout(r, Number(process.argv[4])));\n}\n", mode: 0o600 }],
  ]);
  expect0(await admin(["shop", "add", "-"], tarOf(slow)));
  const { token, passId } = await passFor(userName());
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "test/slow"]));
  const started = Date.now();
  const r = await call(token, ["slow", "sleep", "--ms", "40000"]);
  expect([r.exit, r.stdout, r.stderr]).toEqual([1, "", "error: test/slow sleep ran out of time after 30 seconds and was stopped\n"]);
  expect(Date.now() - started).toBeLessThan(38_000);
  expect((await rowsOf(passId)).at(-1)).toMatchObject({ result: "timeout", wall: "isolate" });
}, 60_000);

/** The authorization URL a consent printed, the last line of its stderr. */
const urlOf = (r: { stderr: string }) => new URL(r.stderr.trimEnd().split("\n").at(-1)!);

/** The person at the browser: the fake's redirect for the URL, with `refuse` when they refuse; the landing's address. */
async function consentAt(url: URL, refuse?: string): Promise<string> {
  const asked = new URL(url);
  if (refuse) asked.searchParams.set("refuse", refuse);
  const res = await fetch(asked, { redirect: "manual" });
  expect(res.status, await res.clone().text()).toBe(302);
  return res.headers.get("location")!;
}

async function land(location: string): Promise<{ status: number; body: string }> {
  const res = await SELF.fetch(location);
  return { status: res.status, body: await res.text() };
}

it("walks journey 4 steps 1, 2, and 4 in the box: an oauth type held over the wire, a consent whose redirect lands at the town and whose wait prints the credential, a second landing and a state the object does not hold refused in consent's words writing nothing, the provider's error and the timeout ending it, and the refresh at a call an hour on", async () => {
  await withMemory();
  const added = await admin(["type", "add", "google-oauth", "--kind", "oauth", "--origin", "https://docs.googleapis.com", "--header", "Authorization: Bearer {token}", "--authorize", OAUTH.authorize, "--token", OAUTH.token, "--scopes", OAUTH.scopes.join(","), "--client-id", OAUTH.clientId], `${OAUTH.clientSecret}\n`);
  expect([added.exit, added.stdout, added.stderr]).toEqual([0, "added google-oauth\n", ""]);
  expect((await admin(["type", "ls"])).stdout).toMatch(/^google-oauth\s+oauth\s+held\s/m);
  const user = userName();
  expect0(await admin(["user", "add", user]));

  // Step 2: the URL, its redirect the town's own landing, and a wait.
  const started = await admin(["credential", "connect", "--user", user, "--type", "google-oauth", "--label", "docs"]);
  expect([started.exit, started.stdout]).toEqual([0, ""]);
  expect(started.stderr.split("\n")[0]).toBe(`open this URL in a browser to connect google-oauth for ${user}; the redirect comes back to ${DOOR}/consent within 5m:`);
  const url = urlOf(started);
  expect(url.searchParams.get("redirect_uri")).toBe(`${DOOR}/consent`);
  expect(started.wait).toBe(url.searchParams.get("state"));
  const location = await consentAt(url);
  expect(new URL(location).pathname).toBe("/consent");

  // Step 4: a state the object does not hold, with a code the fake issued, is refused in consent's words, and nothing is written.
  const before = await counts();
  const wrong = new URL(location);
  wrong.searchParams.set("state", "a-state-the-object-does-not-hold");
  const unknown = [await land(wrong.toString()), await land(`${DOOR}/consent/a-state-the-object-does-not-hold${wrong.search}`)];
  expect(await counts(), "a landing with a state the object does not hold wrote a row").toEqual(before);
  expect(unknown).toEqual([{ status: 404, body: BROWSER_NOT_CONNECTED }, { status: 404, body: BROWSER_NOT_CONNECTED }]);

  // The redirect lands: the browser is told, the wait prints the id, and one row says so.
  expect(await land(location)).toEqual({ status: 200, body: BROWSER_CONNECTED });
  const waited = await waitConsent(started.wait!);
  expect([waited.exit, waited.stderr, waited.wait]).toEqual([0, "", undefined]);
  expect(waited.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
  const credential = waited.stdout.trim();
  expect((await admin(["credential", "ls", "--user", user])).stdout).toMatch(new RegExp(`^${credential}\\s+${user}\\s+google-oauth\\s+docs\\s+\\S+\\s+active\\s+${OAUTH.scopes[0]!.replace(/[.]/g, "\\.")}\\s+-$`, "m"));
  // A second landing is refused as done, and the wait is gone.
  const after = await counts();
  expect(await land(location)).toEqual({ status: 404, body: BROWSER_NOT_CONNECTED });
  expect(await counts()).toEqual(after);
  expect((await waitConsent(started.wait!)).exit).toBe(1);
  const consentRows = await inTown((town) => town.store.calls().filter((c) => c.passId === null && c.detail?.includes(`for ${user}`)));
  expect(consentRows.map((c) => [c.passId, c.shop, c.result, c.detail])).toEqual([[null, null, "ok", `connected google-oauth for ${user} in 0s`]]);

  // Refused at the provider: the browser told, the wait's exit 1 in the flow's words, no credential, and the row a laptop writes.
  const refusing = await admin(["credential", "connect", "--user", user, "--type", "google-oauth"]);
  expect(await land(await consentAt(urlOf(refusing), "access_denied"))).toEqual({ status: 200, body: BROWSER_NOT_CONNECTED });
  expect(await waitConsent(refusing.wait!)).toMatchObject({ exit: 1, stdout: "", stderr: "townd admin: credential connect refused: google-oauth answered access_denied at consent; nothing was written\n" });
  // Left alone past its wait: exit 1 the same, and the landing after it refused.
  const alone = await admin(["credential", "connect", "--user", user, "--type", "google-oauth", "--timeout", "1s"]);
  const late = await consentAt(urlOf(alone));
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  expect(await waitConsent(alone.wait!)).toMatchObject({ exit: 1, stdout: "", stderr: "townd admin: credential connect refused: no redirect came within 1s; nothing was written\n" });
  expect(await land(late)).toEqual({ status: 404, body: BROWSER_NOT_CONNECTED });
  expect((await inTown((town) => town.store.listCredentials(user))).map((c) => c.id)).toEqual([credential]);
  expect((await inTown((town) => town.store.calls().filter((c) => c.passId === null && c.detail?.includes("consent refused")))).map((c) => [c.result, c.detail]).slice(-2)).toEqual([
    ["denied", "consent refused access_denied"],
    ["timeout", "consent refused timeout"],
  ]);

  // Step 3's half the ring can walk: gdocs added on the credential, read under a grant, and refreshed when the clock var moves an hour.
  const GDOCS = shopFiles("shops/gdocs");
  const gdocs = edited(GDOCS, (m) => m.replace(/credentials:\n[\s\S]*?\ncommands:/, "credentials:\n  - type: google-oauth\ncommands:"));
  expect(expect0(await admin(["shop", "add", "-", "--user", user], tarOf(gdocs))).stdout).toBe("ok a missing document fails\nadded town/gdocs 0.1.0\n");
  const made = expect0(await admin(["pass", "new", "--user", user, "--label", "reader"]));
  const token = (JSON.parse(made.stdout) as { token: string }).token;
  const passId = made.stderr.trim();
  expect0(await admin(["grant", "new", "--pass", passId, "--shop", "town/gdocs"]));
  expect(await call(token, ["gdocs", "read", "--doc-id", "fixture-doc"])).toMatchObject({ exit: 0, stdout: "The fixture\nThe first line of the fixture.\n" });
  expect((await rowsOf(passId)).at(-1)!.detail).toBeNull();
  await inTown((town) => void ((town as unknown as { env: Record<string, string> }).env.TOWN_TEST_CLOCK_OFFSET_MS = String(3_600_000)));
  try {
    expect(await call(token, ["gdocs", "read", "--doc-id", "fixture-doc"])).toMatchObject({ exit: 0, stdout: "The fixture\nThe first line of the fixture.\n" });
  } finally {
    await inTown((town) => void ((town as unknown as { env: Record<string, string> }).env.TOWN_TEST_CLOCK_OFFSET_MS = "0"));
  }
  expect((await rowsOf(passId)).at(-1)).toMatchObject({ shop: "town/gdocs", result: "ok", detail: "refreshed google-oauth", wall: "isolate" });

  // The registration's secret and the tokens are in no answer the wire returned and no row but the sealed ones.
  const issued = (await (await fetch(OAUTH.issued)).json()) as string[];
  const shown = JSON.stringify([started, waited, refusing, alone, await admin(["credential", "ls"]), await admin(["type", "ls"]), await admin(["audit"])]);
  const kept = await inTown((town) => JSON.stringify([town.store.calls(), town.store.sql.all("SELECT * FROM shop_state"), town.store.sql.all("SELECT id, landing, outcome FROM consents")]));
  for (const secret of [OAUTH.clientSecret, ...issued.filter((t) => !t.startsWith("fake-code-"))]) {
    expect(shown).not.toContain(secret);
    expect(kept).not.toContain(secret);
  }
}, 60_000);
