// ring: command
// Box's journey 1 steps 3 to 9 against `wrangler dev`: the box on a free
// port of this laptop, its secrets made for the run and passed as vars,
// no account, and the built `town` and `townd admin --town` typing the
// operator's journey. A user; a shop's directory refused naming the pipe,
// and the pipe typed as printed adding memory with its five tests run in
// isolates; github and watch over a fake GitHub on loopback, watch's own
// calls through the clerk's host recorded as a tree; a subprocess shop
// refused. A pass whose grant file names the box, `town --help`, memory
// remembered and recalled from two directories; the audit's `isolate`; a
// grant revoked and a pass revoked; the operator's token absent, wrong,
// and `--data` or `--wall` beside `--town` refused; and x-town-build on
// every answer. Slow, since it starts wrangler, and alone in its file.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, ROOT, agent, assertBuilt, cleanup, dev, tmp, type Agent, type Dev, type Ran } from "./helpers/town.js";

const GITHUB = path.join(ROOT, "shops/github");
const WATCH = path.join(ROOT, "shops/watch");
const ECHO = path.join(ROOT, "test/fixtures/echo-shop");
const SECRET = "github_pat_dev_test_not_a_token_91c3";

/** A fake GitHub: octocat/Hello-World's issues, each request logged as a JSON line after the address. */
const FAKE_GITHUB = `
import http from "node:http";
import { appendFileSync } from "node:fs";
const [log] = process.argv.slice(2);
const issues = [{ number: 2, title: "Two", state: "open" }, { number: 1, title: "One", state: "open" }];
const server = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    appendFileSync(log, JSON.stringify({ method: req.method, url: req.url, authorization: req.headers.authorization ?? null }) + "\\n");
    const u = new URL(req.url, "http://origin");
    const send = (status, json) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
    if (u.pathname === "/repos/octocat/Hello-World/issues") return send(200, issues);
    const one = /^\\/repos\\/octocat\\/Hello-World\\/issues\\/(\\d+)$/.exec(u.pathname);
    const issue = one && issues.find((i) => i.number === Number(one[1]));
    return issue ? send(200, { body: "", user: { login: "octocat" }, ...issue }) : send(404, { message: "Not Found" });
  });
});
server.listen(0, "127.0.0.1", () => appendFileSync(log, "http://127.0.0.1:" + server.address().port + "\\n"));
`;

let box: Dev;
let root: string;
let github: ChildProcess;
let githubUrl: string;
const made: string[] = [];

beforeAll(async () => {
  assertBuilt();
  root = tmp("dev");
  const log = path.join(root, "github.jsonl");
  writeFileSync(path.join(root, "github.mjs"), FAKE_GITHUB);
  writeFileSync(log, "");
  github = spawn(process.execPath, [path.join(root, "github.mjs"), log], { stdio: "ignore" });
  for (let i = 0; readFileSync(log, "utf8") === ""; i++) {
    if (i > 200) throw new Error("the fake GitHub did not start");
    await new Promise((r) => setTimeout(r, 25));
  }
  githubUrl = readFileSync(log, "utf8").split("\n")[0]!;
  box = await dev();
}, 120_000);

afterAll(async () => {
  await box?.stop();
  github?.kill("SIGTERM");
  cleanup(root, ...made);
});

const ok = (r: Ran) => (expect(r.exit, `${r.stdout}${r.stderr}${box.log().slice(-2000)}`).toBe(0), r);

/** The audit's rows as cells: shop, command, result, exit, call, parent, wall. */
function auditRows(stdout: string): Array<{ shop: string; command: string; result: string; call: string; parent: string; wall: string; detail: string }> {
  const [header, ...lines] = stdout.trim().split("\n");
  expect(header).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+wall\s+detail$/);
  return lines.map((l) => l.split(/\s+/)).map((c) => ({ shop: c[2]!, command: c[3]!, result: c[5]!, call: c[11]!, parent: c[12]!, wall: c[13]!, detail: c.slice(14).join(" ") }));
}

it("walks journey 1 steps 3 to 9 through the built town and townd admin --town against wrangler dev", async () => {
  // How long wrangler dev took, for the phase's findings.
  process.stdout.write(`wrangler dev answered GET / in ${box.startedInMs} ms\n`);

  // Step 3: a user, as at a laptop; a directory refused naming the pipe; the pipe typed as printed.
  expect(ok(box.admin(["user", "add", "dimitri"])).stdout).toMatch(/^user_[0-9a-f]{16}\n$/);
  const dir = box.admin(["shop", "add", "shops/memory"]);
  expect([dir.exit, dir.stdout, dir.stderr]).toEqual([1, "", `townd admin: shop add refused: over --town a shop comes from stdin: tar --format ustar -cf - -C shops/memory . | townd admin --town ${box.url} shop add -\n`]);
  expect(ok(box.adminTar(MEMORY, ["shop", "add", "-"])).stdout).toBe("ok roundtrip\nok forget removes\nok list under a prefix\nok recall of a missing key fails\nok a key outside the state is refused\nadded town/memory 0.1.0\n");
  // github-token pointed at the fake GitHub, dimitri's credential, and github and watch added on it.
  ok(box.admin(["type", "rm", "github-token"]));
  ok(box.admin(["type", "add", "github-token", "--origin", githubUrl, "--header", "Authorization: Bearer {token}"]));
  ok(box.admin(["credential", "add", "--user", "dimitri", "--type", "github-token", "--label", "dev"], `${SECRET}\n`));
  expect(ok(box.adminTar(GITHUB, ["shop", "add", "-", "--user", "dimitri"])).stdout).toBe("ok list prints numbered lines\nok show prints a title\nok a missing repo fails\nadded town/github 0.1.0\n");
  expect(ok(box.adminTar(WATCH, ["shop", "add", "-", "--user", "dimitri"])).stdout).toBe("ok a look, then what changed\nok no look yet fails\nadded town/watch 0.1.0\n");
  expect(ok(box.admin(["shop", "ls"])).stdout).toMatch(/^town\/watch\s+0\.1\.0\s+-\s+mark,changes\s+town\/github\[list\] town\/memory\[remember,recall\]\s/m);

  // Step 4: a subprocess shop is refused, and nothing is added.
  const sub = box.adminTar(ECHO, ["shop", "add", "-"]);
  expect([sub.exit, sub.stdout, sub.stderr]).toEqual([1, "", "townd admin: shop add refused: runtime: subprocess runs on a laptop; this box runs a shop in an isolate: write runtime: worker (spec §7)\n"]);
  expect(ok(box.admin(["shop", "ls"])).stdout).not.toContain("test/echo");

  // Step 5: the grant file names the box; help, remember, and recall from two directories.
  const pass = ok(box.admin(["pass", "new", "--user", "dimitri", "--label", "research assistant"]));
  expect(JSON.parse(pass.stdout).town).toBe(box.url);
  const passId = pass.stderr.trim();
  const memoryGrant = ok(box.admin(["grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list"])).stdout.trim();
  ok(box.admin(["grant", "new", "--pass", passId, "--shop", "town/github", "--commands", "list"]));
  ok(box.admin(["grant", "new", "--pass", passId, "--shop", "town/watch", "--commands", "mark,changes"]));
  const a: Agent = agent();
  const b: Agent = agent();
  made.push(a.dir, a.home, b.dir, b.home);
  a.writeGrant(pass.stdout);
  b.writeGrant(pass.stdout);
  const help = ok(a.town("--help"));
  expect(help.stdout).toMatch(/^town\/memory\s.*\[remember, recall, list\]$/m);
  expect(ok(a.town("memory", "--help")).stdout).toContain("research assistant");
  expect(a.town("memory", "remember", "--key", "t/a", "--value", "hello")).toEqual({ exit: 0, stdout: "", stderr: "" });
  expect(a.town("memory", "recall", "--key", "t/a")).toEqual({ exit: 0, stdout: "hello\n", stderr: "" });
  expect(b.town("memory", "recall", "--key", "t/a")).toEqual({ exit: 0, stdout: "hello\n", stderr: "" });

  // Watch's own calls through the clerk's host, recorded under its call.
  expect(a.town("watch", "mark", "--repo", "octocat/Hello-World")).toEqual({ exit: 0, stdout: "remembered 2 open issues\n", stderr: "" });
  expect(a.town("watch", "changes", "--repo", "octocat/Hello-World")).toEqual({ exit: 0, stdout: "opened: none\nclosed: none\n", stderr: "" });

  // Step 6: the audit says isolate for every call that ran, and - for the hall's and the denied.
  const denied = a.town("github", "show", "--repo", "octocat/Hello-World", "--number", "1");
  expect(denied.exit).toBe(2);
  const rows = auditRows(ok(box.admin(["audit", "--pass", passId])).stdout);
  expect(rows.map((r) => [r.shop, r.command, r.result, r.wall])).toEqual([
    ["-", "-", "ok", "-"],
    ["town/memory", "-", "ok", "-"],
    ["town/memory", "remember", "ok", "isolate"],
    ["town/memory", "recall", "ok", "isolate"],
    ["town/memory", "recall", "ok", "isolate"],
    ["town/watch", "mark", "ok", "isolate"],
    ["town/github", "list", "ok", "isolate"],
    ["town/memory", "remember", "ok", "isolate"],
    ["town/watch", "changes", "ok", "isolate"],
    ["town/memory", "recall", "ok", "isolate"],
    ["town/github", "list", "ok", "isolate"],
    ["town/github", "show", "denied", "-"],
  ]);
  const mark = rows.find((r) => r.command === "mark")!;
  const tree = ok(box.admin(["audit", "--call", mark.call])).stdout.trim().split("\n").slice(1);
  expect(tree.map((l) => l.trim().split(/\s+/)[3])).toEqual(["town/watch", "town/github", "town/memory"]);
  expect(tree.slice(1).every((l) => l.startsWith("  call_"))).toBe(true);

  // Step 7: a grant revoked is gate's words and leaves help; a pass revoked makes the grant file paper.
  ok(box.admin(["grant", "revoke", memoryGrant]));
  expect(a.town("memory", "recall", "--key", "t/a")).toEqual({ exit: 2, stdout: "", stderr: "error: command 'memory recall' is not available to this grant\n" });
  expect(ok(a.town("--help")).stdout).not.toMatch(/^town\/memory\s/m);
  ok(box.admin(["pass", "revoke", passId]));
  expect(a.town("--help")).toEqual({ exit: 3, stdout: "", stderr: "error: this pass is not valid: its token is unknown, revoked, or expired\n" });

  // Step 8: no token, a wrong token, --data, and --wall, each refused, and the box wrote no row.
  const before = ok(box.admin(["audit"])).stdout;
  const empty = tmp("no-operator");
  made.push(empty);
  expect(box.admin(["user", "add", "ada"], undefined, { HOME: empty })).toEqual({ exit: 1, stdout: "", stderr: "townd admin: --town needs the operator's token, and neither $TOWN_OPERATOR nor ~/.town/operator holds one\n" });
  expect(box.admin(["user", "add", "ada"], undefined, { TOWN_OPERATOR: "not-the-operator-token" })).toEqual({ exit: 1, stdout: "", stderr: "townd admin: the operator token is refused\n" });
  const data = box.admin(["--data", root, "user", "ls"]);
  expect([data.exit, data.stderr.split("\n")[0]]).toEqual([1, "townd admin: --data and --town name two towns; write one or the other"]);
  expect(box.admin(["--wall", "none", "user", "ls"])).toEqual({ exit: 1, stdout: "", stderr: "townd admin: --wall is not the operator's to choose over --town; the box runs every shop in an isolate\n" });
  expect(ok(box.admin(["audit"])).stdout).toBe(before);
  expect(ok(box.admin(["user", "ls"])).stdout).not.toContain("ada");

  // Step 9: every answer carries the build the box was started with.
  expect(box.build).toMatch(/^[0-9a-f]{40}$/);
  for (const [method, route, status] of [["GET", "/", 200], ["POST", "/call", 200], ["POST", "/admin", 401], ["GET", "/nothing", 404]] as const) {
    const res = await fetch(`${box.url}${route}`, { method, ...(method === "POST" ? { body: "{}" } : {}) });
    expect([route, res.status, res.headers.get("x-town-build")]).toEqual([route, status, box.build]);
    await res.body?.cancel();
  }

  // The agent's credential is in nothing the operator or the agent was printed.
  expect(JSON.stringify(rows)).not.toContain(SECRET);
}, 240_000);
