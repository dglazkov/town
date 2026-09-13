// ring: command
// The watch shop over the real shops/github and shops/memory, in a town this
// test starts, with the seeded github-token type swapped for one whose
// origin is a fake GitHub on loopback: a process of this test's own that
// answers the issues paths from a file the test rewrites, so an issue can
// be closed between two calls. What this proves is the walk's stage and
// journey 1 steps 1 to 6 on real shops: `shop add shops/watch --user`
// printing one ok line per test, with the no-look test sending nothing to
// GitHub; no look yet exit 1 naming no key and no repo; a mark, its three
// audit rows, and the lines reaching memory; an issue closed at the origin
// printed under `closed:`, and one opened under `opened:`; a repository the
// grant does not name denied at github and told as github's line with
// nothing sent; and memory narrowed under it. It does not prove GitHub
// answers so; `shop add` on a real token and the walk prove that.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, ROOT, agent, assertBuilt, cleanup, serve, tmp, type Agent, type Ran, type Town } from "./helpers/town.js";

const GITHUB = path.join(ROOT, "shops/github");
const WATCH = path.join(ROOT, "shops/watch");
const SECRET = "github_pat_watch_test_not_a_token_5d2a";
const REPO = "mine/repo";

/** A fake GitHub: the issues list and one issue, from the state file, per request; each request logged as a JSON line after the URL. */
const FAKE_GITHUB = `
import http from "node:http";
import { appendFileSync, readFileSync } from "node:fs";
const [stateFile, log] = process.argv.slice(2);
const server = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    appendFileSync(log, JSON.stringify({ method: req.method, url: req.url, authorization: req.headers.authorization ?? null }) + "\\n");
    const repos = JSON.parse(readFileSync(stateFile, "utf8"));
    const u = new URL(req.url, "http://origin");
    const send = (status, json) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(json)); };
    const list = /^\\/repos\\/([^/]+)\\/([^/]+)\\/issues$/.exec(u.pathname);
    const one = /^\\/repos\\/([^/]+)\\/([^/]+)\\/issues\\/(\\d+)$/.exec(u.pathname);
    const m = list ?? one;
    const issues = m && req.method === "GET" ? repos[decodeURIComponent(m[1]) + "/" + decodeURIComponent(m[2])] : undefined;
    if (!issues) return send(404, { message: "Not Found" });
    if (list) {
      const state = u.searchParams.get("state") ?? "open";
      const per = Number(u.searchParams.get("per_page") ?? "30");
      const page = Number(u.searchParams.get("page") ?? "1");
      return send(200, issues.filter((i) => state === "all" || i.state === state).slice((page - 1) * per, page * per));
    }
    const issue = issues.find((i) => i.number === Number(one[3]));
    return issue ? send(200, { body: "", user: { login: "octocat" }, ...issue }) : send(404, { message: "Not Found" });
  });
});
server.listen(0, "127.0.0.1", () => appendFileSync(log, "http://127.0.0.1:" + server.address().port + "\\n"));
`;

interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
  pull_request?: object;
}

let root: string;
let stateFile: string;
let log: string;
let originChild: ChildProcess;
let originUrl: string;
const towns: Town[] = [];
const made: string[] = [];

const logLines = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
const seen = () => logLines().slice(1).map((l) => JSON.parse(l) as { method: string; url: string; authorization: string | null });

function setIssues(repos: Record<string, Issue[]>): void {
  writeFileSync(stateFile, JSON.stringify(repos));
}

beforeAll(async () => {
  assertBuilt();
  root = tmp("watch-shop");
  stateFile = path.join(root, "issues.json");
  log = path.join(root, "seen.jsonl");
  writeFileSync(path.join(root, "github.mjs"), FAKE_GITHUB);
  writeFileSync(log, "");
  setIssues({});
  originChild = spawn(process.execPath, [path.join(root, "github.mjs"), stateFile, log], { stdio: "ignore" });
  for (let i = 0; logLines().length === 0; i++) {
    if (i > 200 || originChild.exitCode !== null) throw new Error("the fake GitHub did not start");
    await new Promise((r) => setTimeout(r, 25));
  }
  originUrl = logLines()[0]!;
});

afterAll(async () => {
  for (const t of towns) await t.stop();
  if (originChild && originChild.exitCode === null) {
    await new Promise<void>((resolve) => {
      originChild.once("exit", () => resolve());
      originChild.kill("SIGTERM");
    });
  }
  cleanup(root, ...made, ...towns.map((t) => t.env.HOME!));
});

function oneLine(r: Ran): string {
  const lines = r.stderr.split("\n").filter(Boolean);
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

interface Row {
  pass: string;
  shop: string;
  command: string;
  result: string;
  exit: string;
  credentials: string;
  call: string;
  parent: string;
  wall: string;
  detail: string;
}

function auditRows(stdout: string): Row[] {
  const [header, ...lines] = stdout.trim().split("\n");
  expect(header).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+wall\s+detail$/);
  return lines
    .map((l) => l.split(/\s+/))
    .map((c) => ({ pass: c[1]!, shop: c[2]!, command: c[3]!, result: c[5]!, exit: c[6]!, credentials: c[10]!, call: c[11]!, parent: c[12]!, wall: c[13]!, detail: c.slice(14).join(" ") }))
    .filter((r) => r.command !== "-");
}

/** Every file under `dir`, links not followed. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    const st = statSync(p);
    return st.isDirectory() ? filesUnder(p) : st.isFile() ? [p] : [];
  });
}

it("is added on the github-token, and walks journey 1 steps 1 to 6 over the real github and memory shops", async () => {
  const hello: Issue[] = [
    { number: 3, title: "Third", state: "open" },
    { number: 2, title: "A pull request", state: "open", pull_request: {} },
    { number: 1, title: "First", state: "closed" },
  ];
  const mine: Issue[] = [
    { number: 12, title: "Twelve stays open", state: "open" },
    { number: 11, title: "Eleven, to be closed", state: "open" },
    { number: 10, title: "A pull request", state: "open", pull_request: {} },
    { number: 9, title: "Nine, closed long ago", state: "closed" },
  ];
  setIssues({ "octocat/Hello-World": hello, [REPO]: mine });

  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  const admin = town.admin;
  const ok = (r: Ran) => (expect(r.exit, r.stderr).toBe(0), r);

  // The stage: memory; github-token pointed at the fake; the credential; github and watch added on it.
  ok(admin("shop", "add", MEMORY));
  ok(admin("type", "rm", "github-token"));
  ok(admin("type", "add", "github-token", "--origin", originUrl, "--header", "Authorization: Bearer {token}"));
  ok(admin("user", "add", "dimitri"));
  ok(town.adminPiped(`${SECRET}\n`, "credential", "add", "--user", "dimitri", "--type", "github-token", "--label", "watch test"));
  expect(ok(admin("shop", "add", GITHUB, "--user", "dimitri")).stdout).toBe("ok list prints numbered lines\nok show prints a title\nok a missing repo fails\nadded town/github 0.1.0\n");
  const noUser = admin("shop", "add", WATCH);
  expect([noUser.exit, oneLine(noUser)]).toEqual([1, "townd admin: shop add refused: town/watch needs github-token; write --user <name> for whose credential its tests run on"]);
  const before = seen().length;
  expect(admin("shop", "add", WATCH, "--user", "dimitri")).toEqual({ exit: 0, stdout: "ok a look, then what changed\nok no look yet fails\nadded town/watch 0.1.0\n", stderr: "" });
  // Its tests asked GitHub twice, both in the first test; the no-look test failed for want of a look, asking nothing.
  expect(seen().slice(before)).toEqual([
    { method: "GET", url: "/repos/octocat/Hello-World/issues?state=open&per_page=100&page=1", authorization: `Bearer ${SECRET}` },
    { method: "GET", url: "/repos/octocat/Hello-World/issues?state=open&per_page=100&page=1", authorization: `Bearer ${SECRET}` },
  ]);
  expect(admin("shop", "ls").stdout).toMatch(/^town\/watch\s+0\.1\.0\s+-\s+mark,changes\s+town\/github\[list\] town\/memory\[remember,recall\]\s/m);

  // Journey 1's grants: github at list and show on the one repo, memory at three, watch at both, unconstrained.
  const pass = ok(admin("pass", "new", "--user", "dimitri", "--label", "issue watcher"));
  const passId = pass.stderr.trim();
  const githubGrant = ok(admin("grant", "new", "--pass", passId, "--shop", "town/github", "--commands", "list,show", "--constraint", `list.repo equals ${REPO}`, "--constraint", `show.repo equals ${REPO}`)).stdout.trim();
  let memoryGrant = ok(admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list")).stdout.trim();
  const watchGrant = ok(admin("grant", "new", "--pass", passId, "--shop", "town/watch", "--commands", "mark,changes")).stdout.trim();
  const a: Agent = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  // Step 1: three shops with their commands, nothing of which depends on which.
  const help = ok(a.town("--help"));
  expect(help.stdout).toMatch(/^town\/github\s.*\[list, show\]$/m);
  expect(help.stdout).toMatch(/^town\/memory\s.*\[remember, recall, list\]$/m);
  expect(help.stdout).toMatch(/^town\/watch\s+A repository's issues, compared with the last time you looked\. \[mark, changes\]$/m);
  expect(help.stdout.toLowerCase()).not.toContain("depend");

  // Step 2: watch's help is the manifest for the grant; the guidance's prose is the only word of where the look is kept.
  const watchHelp = ok(a.town("watch", "--help"));
  expect(watchHelp.stdout).toContain("  town watch mark --repo <string>");
  expect(watchHelp.stdout).toContain("  town watch changes --repo <string>");
  expect(watchHelp.stdout).toContain("constraints: none");
  for (const word of ["github", "depend", "town/memory", "list", "recall", githubGrant, memoryGrant]) expect(watchHelp.stdout.toLowerCase(), word).not.toContain(word.toLowerCase());

  // No look yet: exit 1, watch's own line naming no key and no repo, and nothing asked of GitHub.
  const asked = seen().length;
  const none = a.town("watch", "changes", "--repo", REPO);
  expect([none.exit, none.stdout, none.stderr]).toEqual([1, "", "error: town/watch changes failed\nthere is no last look at this repository to compare with; remember its issues first\n"]);
  expect(seen().length).toBe(asked);

  // Step 3: a mark, and three rows, the inner two under it with the agent's pass.
  expect(a.town("watch", "mark", "--repo", REPO)).toEqual({ exit: 0, stdout: "remembered 2 open issues\n", stderr: "" });
  expect(seen().slice(asked)).toEqual([{ method: "GET", url: "/repos/mine/repo/issues?state=open&per_page=100&page=1", authorization: `Bearer ${SECRET}` }]);
  const rows = auditRows(admin("audit", "--pass", passId).stdout);
  const mark = rows.filter((r) => r.shop === "town/watch" && r.command === "mark").at(-1)!;
  expect(mark).toMatchObject({ pass: passId, result: "ok", exit: "0", parent: "-" });
  expect(rows.filter((r) => r.parent === mark.call).map((r) => [r.pass, r.shop, r.command, r.result, r.credentials])).toEqual([
    [passId, "town/github", "list", "ok", "github-token:1"],
    [passId, "town/memory", "remember", "ok", "-"],
  ]);
  // The value reached the agent's own memory, under the key the guidance names.
  expect(a.town("memory", "recall", "--key", "watch/mine/repo")).toEqual({ exit: 0, stdout: "#12 Twelve stays open\n#11 Eleven, to be closed\n", stderr: "" });

  // Step 4: an issue closed at the origin is under closed:, and opened: is none.
  setIssues({ "octocat/Hello-World": hello, [REPO]: mine.map((i) => (i.number === 11 ? { ...i, state: "closed" } : i)) });
  expect(a.town("watch", "changes", "--repo", REPO)).toEqual({ exit: 0, stdout: "opened: none\nclosed:\n#11 Eleven, to be closed\n", stderr: "" });
  const changes = auditRows(admin("audit", "--pass", passId).stdout).filter((r) => r.shop === "town/watch").at(-1)!;
  expect(auditRows(admin("audit", "--pass", passId).stdout).filter((r) => r.parent === changes.call).map((r) => [r.shop, r.command, r.result])).toEqual([
    ["town/memory", "recall", "ok"],
    ["town/github", "list", "ok"],
  ]);
  // And the other way: marked again, an issue opened is under opened:, and closed: is none.
  expect(a.town("watch", "mark", "--repo", REPO).stdout).toBe("remembered 1 open issue\n");
  setIssues({ "octocat/Hello-World": hello, [REPO]: [{ number: 13, title: "Thirteen, new", state: "open" }, ...mine.map((i) => (i.number === 11 ? { ...i, state: "closed" as const } : i))] });
  expect(a.town("watch", "changes", "--repo", REPO)).toEqual({ exit: 0, stdout: "opened:\n#13 Thirteen, new\nclosed: none\n", stderr: "" });

  // Step 5: a repository the grant does not name is github's line, exit 2, empty stdout, and nothing sent.
  const sent = seen().length;
  const outside = a.town("watch", "mark", "--repo", "someone-else/repo");
  expect([outside.exit, outside.stdout, outside.stderr]).toEqual([2, "", `error: --repo must be '${REPO}' under this grant\n`]);
  expect(a.town("github", "list", "--repo", "someone-else/repo").stderr).toBe(outside.stderr);
  expect(seen().length).toBe(sent);
  const denied = auditRows(admin("audit", "--pass", passId).stdout).filter((r) => r.result === "denied");
  expect(denied.map((r) => [r.shop, r.command, r.exit, r.detail])).toEqual([
    ["town/watch", "mark", "2", "inner"],
    ["town/github", "list", "2", "constraint list.repo equals"],
    ["town/github", "list", "2", "constraint list.repo equals"],
  ]);
  expect(denied[1]!.parent).toBe(denied[0]!.call);
  expect(denied[2]!.parent).toBe("-");

  // Step 6: memory narrowed to recall under it: watch leaves help and is not available; github and memory answer; widened, it is back.
  ok(admin("grant", "revoke", memoryGrant));
  const narrow = ok(admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "recall")).stdout.trim();
  expect(admin("grant", "ls", "--pass", passId).stdout).toMatch(new RegExp(`^${watchGrant}\\s.*not live: town/memory lacks remember\\s`, "m"));
  expect(a.town("--help").stdout).not.toContain("town/watch");
  const hidden = a.town("watch", "mark", "--repo", REPO);
  expect([hidden.exit, oneLine(hidden)]).toEqual([2, "error: command 'watch mark' is not available to this grant"]);
  expect(a.town("github", "list", "--repo", REPO).exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "watch/mine/repo").exit).toBe(0);
  ok(admin("grant", "revoke", narrow));
  memoryGrant = ok(admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list")).stdout.trim();
  expect(a.town("--help").stdout).toMatch(/^town\/watch\s/m);
  expect(a.town("watch", "changes", "--repo", REPO).exit).toBe(0);

  // The agent's credential is in no file of the town's, database and WAL included.
  for (const file of filesUnder(data)) expect(readFileSync(file).includes(SECRET), file).toBe(false);
}, 180_000);
