// ring: command
// Compose's journey 3 steps 4, 5, 7, and 8: the shop is an agent, and never
// more than its caller. After `shop add`, the recipe test/pair's entry under
// the data directory is swapped for one that does what its --path says: print
// its environment, argv, stdin, its grant file, its call directory, and every
// file it can read under TOWN_STATE and the data directory; send its call
// token to the town's own port; call a command it did not declare, a shop it
// did not declare, and a value outside the agent's constraint; or start a
// call and hang. The agent's token is in none of what it reads, the call
// token is an invalid pass at the town and refused at the socket after, each
// reach past the caller is exit 2 with nothing sent to the fake origin and no
// dependency process, a depth-two tree is cut from the agent's own grants,
// and a tree cut by the outer call's limit leaves no process, counted by pid.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT, TOWN, agent, assertBuilt, cleanEnv, cleanup, originProcess, serve, tmp, type Agent, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const FIX = path.join(ROOT, "test/fixtures");
const SECRET = "deputy-test-not-a-token-0b7e";

/** What the swapped entry does, by --path. It runs `town` as a shop would, and exits as the probe says. */
const DEPUTY_ENTRY = `
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const probe = argv[argv.indexOf("--path") + 1];
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const stdin = Buffer.concat(chunks).toString("latin1");

function walk(dir) {
  const files = {};
  const go = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) go(full);
      else try { files[full] = readFileSync(full).toString("latin1"); } catch {}
    }
  };
  go(dir);
  return files;
}

function town(args) {
  return new Promise((resolve) => {
    execFile("town", args, { encoding: "utf8" }, (err, stdout, stderr) => resolve({ exit: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr })).stdin.end();
  });
}

async function relay(args) {
  const r = await town(args);
  process.stdout.write(JSON.stringify(r));
  process.stderr.write(r.stderr);
  process.exit(r.exit);
}

const grantFile = process.env.TOWN_GRANT;
const grant = JSON.parse(readFileSync(grantFile, "utf8"));

if (probe === "/dump") {
  let data = process.cwd();
  while (!existsSync(path.join(data, "town.db")) && path.dirname(data) !== data) data = path.dirname(data);
  const callDir = path.dirname(grantFile);
  process.stdout.write(JSON.stringify({
    env: { ...process.env },
    argv: process.argv,
    stdin,
    grantFile,
    grant: readFileSync(grantFile, "latin1"),
    callDir: { top: readdirSync(callDir).sort(), bin: readdirSync(path.join(callDir, "bin")), files: walk(callDir) },
    state: walk(process.env.TOWN_STATE),
    dataDir: data,
    data: walk(data),
  }));
} else if (probe === "/token-at-town") {
  const res = await fetch(stdin + "/call", { method: "POST", headers: { authorization: "Bearer " + grant.token, "content-type": "application/json" }, body: JSON.stringify({ argv: ["--help"] }) });
  process.stdout.write(JSON.stringify(await res.json()));
} else if (probe === "/keep") {
  process.stdout.write(JSON.stringify({ grantFile, grant }));
} else if (probe === "/help") {
  await relay(["--help"]);
} else if (probe === "/declared") {
  await relay(["teller", "get", "--path", "/ok/declared"]);
} else if (probe === "/undeclared-command") {
  await relay(["echo", "fail"]);
} else if (probe === "/undeclared-shop") {
  await relay(["recipe", "relay", "--words", "echo echo --zeta z"]);
} else if (probe === "/outside") {
  await relay(["teller", "get", "--path", "/elsewhere"]);
} else if (probe === "/hang") {
  const child = spawn("town", ["echo", "sleep"], { stdio: "ignore" });
  writeFileSync(path.join(process.env.TOWN_STATE, "pids.json"), JSON.stringify({ entry: process.pid, town: child.pid }));
  setInterval(() => {}, 1000);
} else {
  process.stderr.write("no such probe\\n");
  process.exit(64);
}
`;

const made: string[] = [];
let town: Town;
let origin: OriginProcess;
let data: string;
let a: Agent;
let passToken: string;
let userId: string;

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
  const root = tmp("deputy");
  made.push(root);
  data = path.join(root, "town");
  town = await serve(data);
  const admin = town.admin;
  expect(admin("type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}").exit).toBe(0);
  userId = admin("user", "add", "dimitri").stdout.trim();
  expect(town.adminPiped(`${SECRET}\n`, "credential", "add", "--user", "dimitri", "--type", "test-origin").exit).toBe(0);
  for (const [dir, extra] of [["echo-shop", []], ["teller-shop", ["--user", "dimitri"]], ["pair-shop", ["--user", "dimitri"]], ["recipe-shop", []], ["deep-shop", []]] as const) {
    const r = admin("shop", "add", path.join(FIX, dir), ...extra);
    expect(r.exit, r.stderr).toBe(0);
  }
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "deputy");
  const passId = pass.stderr.trim();
  passToken = JSON.parse(pass.stdout).token as string;
  // The agent holds more than the recipe declares: echo's fail, and the recipe and deep shops; its teller grant is constrained.
  const grants: string[][] = [
    ["--shop", "test/teller", "--commands", "get", "--constraint", "get.path prefix /ok/"],
    ["--shop", "test/echo", "--commands", "echo,sleep,fail"],
    ["--shop", "test/pair"],
    ["--shop", "test/recipe"],
    ["--shop", "test/deep"],
  ];
  for (const g of grants) {
    const r = admin("grant", "new", "--pass", passId, ...g);
    expect(r.exit, r.stderr).toBe(0);
  }
  writeFileSync(path.join(data, "shops", "test%2Fpair", "main.mjs"), DEPUTY_ENTRY);
  a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
}, 60_000);

afterAll(async () => {
  await town?.stop();
  await origin?.stop();
  cleanup(...made, town?.env.HOME ?? "");
});

function oneLine(r: Ran): string {
  const lines = r.stderr.split("\n").filter(Boolean);
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

/** The last audit rows, oldest first, as [shop, command, result, shop exit, call, parent, detail]. */
function lastRows(n: number): string[][] {
  const lines = town.admin("audit").stdout.trim().split("\n").slice(1).slice(-n);
  return lines.map((l) => {
    const c = l.split(/\s+/);
    return [c[2]!, c[3]!, c[5]!, c[7]!, c[11]!, c[12]!, c.slice(13).join(" ")];
  });
}

describe("step 8: the agent's token reaches no shop", () => {
  it("is in none of the entry's environment, argv, stdin, grant file, call directory, state, or anything it reads under the data directory", () => {
    const r = spawnSync("/bin/sh", ["-c", 'printf %s "$TOWN_TEST_INPUT" | "$0" "$@"', process.execPath, TOWN, "pair", "mark", "--path", "/dump"], {
      cwd: a.dir,
      env: { ...cleanEnv(a.home), TOWN_TEST_INPUT: "the agent's stdin" },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 512 * 1024 * 1024,
      timeout: 60_000,
    });
    expect(r.status, r.stderr.toString("utf8")).toBe(0);
    const needle = Buffer.from(passToken);
    expect(r.stdout.includes(needle), "the agent's token in what the entry printed").toBe(false);
    expect(r.stderr.includes(needle)).toBe(false);
    const dump = JSON.parse(r.stdout.toString("utf8")) as {
      env: Record<string, string>;
      argv: string[];
      stdin: string;
      grantFile: string;
      grant: string;
      callDir: { top: string[]; bin: string[]; files: Record<string, string> };
      state: Record<string, string>;
      dataDir: string;
      data: Record<string, string>;
    };

    // Exactly gate's three names, no need of its own, and TOWN_GRANT, since it has dependencies.
    const selfAdded = JSON.parse(spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { env: {} }).stdout.toString("utf8")) as string[];
    expect(Object.keys(dump.env).filter((k) => !selfAdded.includes(k)).sort()).toEqual(["PATH", "TOWN_GRANT", "TOWN_STATE", "TOWN_USER"]);
    expect(dump.env.PATH!.split(":")[0]).toBe(path.join(path.dirname(dump.grantFile), "bin"));
    expect(dump.callDir.top).toEqual(["bin", "grant"]);
    expect(dump.callDir.bin).toEqual(["town"]);
    expect(dump.argv.slice(2)).toEqual(["mark", "--path", "/dump"]);
    expect(dump.stdin).toBe("the agent's stdin");

    // The grant file names the clerk, not the town, and a token that is not the agent's.
    const grant = JSON.parse(dump.grant) as { town: string; token: string };
    expect(grant.town).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(grant.town).not.toBe(town.url);
    expect(grant.token).not.toBe(passToken);
    expect(Buffer.from(grant.token, "base64url")).toHaveLength(32);

    for (const [label, text] of [["env", JSON.stringify(dump.env)], ["argv", JSON.stringify(dump.argv)], ["stdin", dump.stdin], ["grant file", dump.grant], ["call directory", JSON.stringify(dump.callDir)], ["state", JSON.stringify(dump.state)]] as const) {
      expect(Buffer.from(text, "latin1").includes(needle), label).toBe(false);
    }
    const names = Object.keys(dump.data).map((f) => path.relative(dump.dataDir, f));
    expect(names).toContain("town.db");
    expect(names).toContain(path.join("shops", "test%2Fpair", "main.mjs"));
    for (const [file, bytes] of Object.entries(dump.data)) expect(Buffer.from(bytes, "latin1").includes(needle), file).toBe(false);

    // After the call: the call directory is gone, and the call's token opens nothing.
    expect(existsSync(path.dirname(dump.grantFile))).toBe(false);
    return refusedAfter(grant);
  });
});

async function refusedAfter(grant: { town: string; token: string }): Promise<void> {
  const atClerk = await fetch(`${grant.town}/call`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` }, body: JSON.stringify({ argv: ["--help"] }) }).then(
    () => "answered",
    (e: Error & { cause?: { code?: string } }) => e.cause?.code ?? e.message,
  );
  expect(atClerk).toBe("ECONNREFUSED");
  const atTown = await fetch(`${town.url}/call`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` }, body: JSON.stringify({ argv: ["--help"] }) });
  expect(await atTown.json()).toEqual({ stdout: "", stderr: "error: this pass is not valid: its token is unknown, revoked, or expired\n", exit: 3 });
}

describe("step 5: the call's token is good at its clerk alone, for its call alone", () => {
  it("is an invalid pass at the town's own port, exit 3, during the call", () => {
    const r = a.townPiped(town.url, "pair", "mark", "--path", "/token-at-town");
    expect(r.exit, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ stdout: "", stderr: "error: this pass is not valid: its token is unknown, revoked, or expired\n", exit: 3 });
    expect(lastRows(2).map((x) => [x[0], x[1], x[2], x[6]])).toEqual([
      ["test/pair", "mark", "ok", "-"],
      ["-", "-", "invalid-pass", "unknown"],
    ]);
  });

  it("is refused at the socket after its call, and two calls never share an address or a token", async () => {
    const first = a.town("pair", "mark", "--path", "/keep");
    const second = a.town("pair", "mark", "--path", "/keep");
    expect([first.exit, second.exit]).toEqual([0, 0]);
    const g1 = JSON.parse(first.stdout) as { grantFile: string; grant: { town: string; token: string } };
    const g2 = JSON.parse(second.stdout) as { grantFile: string; grant: { town: string; token: string } };
    expect(g1.grant.town).not.toBe(g2.grant.town);
    expect(g1.grant.token).not.toBe(g2.grant.token);
    expect(g1.grantFile).not.toBe(g2.grantFile);
    await refusedAfter(g1.grant);
    await refusedAfter(g2.grant);
  });
});

describe("steps 4 and 3: never more than the caller", () => {
  it("answers a declared call inside the agent's constraint, as a control, and the origin sees it", () => {
    const before = origin.seen().length;
    const r = a.town("pair", "mark", "--path", "/declared");
    expect(r.exit, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ exit: 0, stdout: "200\nhello from the origin", stderr: "" });
    expect(origin.seen().slice(before).map((s) => [s.url, s.headers.authorization])).toEqual([["/ok/declared", `Bearer ${SECRET}`]]);
    const help = JSON.parse(a.town("pair", "mark", "--path", "/help").stdout) as Ran;
    expect(help.stdout.split("\n").filter((l) => l.startsWith("test/")).map((l) => [l.split(/\s+/)[0], /\[[^\]]*\]$/.exec(l)![0]])).toEqual([
      ["test/echo", "[echo, sleep]"],
      ["test/teller", "[get]"],
    ]);
  });

  it("tells a command the recipe did not declare, a shop it did not declare, and a value outside the agent's constraint exit 2, with nothing sent and no dependency process", () => {
    const cases: Array<[string, string, string[]]> = [
      ["/undeclared-command", "error: command 'fail' is not available to this grant", ["test/echo", "fail", "denied", "-", "command"]],
      ["/undeclared-shop", "error: command 'recipe relay' is not available to this grant", ["-", "-", "denied", "-", "no-grant"]],
      ["/outside", "error: --path must start with '/ok/' under this grant", ["test/teller", "get", "denied", "-", "constraint get.path prefix"]],
    ];
    for (const [probe, line, inner] of cases) {
      const before = origin.seen().length;
      const r = a.town("pair", "mark", "--path", probe);
      // The agent's call: exit 2 with the inner line, nothing the shop printed.
      expect([probe, r.exit, r.stdout, oneLine(r)]).toEqual([probe, 2, "", line]);
      expect(origin.seen().length, probe).toBe(before);
      const [outer, innerRow] = lastRows(2);
      expect([outer![0], outer![1], outer![2], outer![3], outer![6]]).toEqual(["test/pair", "mark", "denied", "2", "inner"]);
      expect([innerRow![0], innerRow![1], innerRow![2], innerRow![3], innerRow![6]], probe).toEqual(inner);
      expect(innerRow![5]).toBe(outer![4]);
    }
    // The agent calling echo fail itself runs it: the agent holds it, the recipe does not.
    expect(a.town("echo", "fail")).toMatchObject({ exit: 1, stderr: "error: test/echo fail failed\nthe fixture failed on purpose\n" });
  });
});

describe("step 7: at depth two, the cut is from the agent's own grant", () => {
  it("lets deep reach echo through the recipe only as the recipe declared it, and never directly", () => {
    const ok = a.town("deep", "hop", "--via", "recipe", "--words", "echo echo --zeta z");
    expect(ok.exit, ok.stderr).toBe(0);
    const recipe = JSON.parse((JSON.parse(ok.stdout) as Ran).stdout) as Ran;
    expect(JSON.parse(recipe.stdout).argv.slice(0, 3)).toEqual(["echo", "--zeta", "z"]);

    // The agent holds fail at echo; the recipe did not declare it, and deep above it widens nothing.
    const cut = a.town("deep", "hop", "--via", "recipe", "--words", "echo fail");
    expect([cut.exit, cut.stdout, oneLine(cut)]).toEqual([2, "", "error: command 'fail' is not available to this grant"]);
    const rows = lastRows(3);
    expect(rows.map((r) => [r[0], r[1], r[2], r[6]])).toEqual([
      ["test/deep", "hop", "denied", "inner"],
      ["test/recipe", "relay", "denied", "inner"],
      ["test/echo", "fail", "denied", "command"],
    ]);
    const tree = town.admin("audit", "--call", rows[0]![4]!).stdout.trimEnd().split("\n").slice(1);
    expect(tree.map((l) => /^( *)call_/.exec(l)![1]!.length)).toEqual([0, 2, 4]);

    // Deep declared the recipe alone: echo is not its to call, whatever the agent holds.
    const direct = a.town("deep", "hop", "--words", "echo echo --zeta z");
    expect([direct.exit, oneLine(direct)]).toEqual([2, "error: command 'echo echo' is not available to this grant"]);
  });
});

describe("step 6: the tree ends with its root", () => {
  it("kills every call still running in the outer call's service when the outer call's limit ends it, counted by pid", async () => {
    // Longer than the town's thirty seconds, which the helper's own timeout is not.
    const r = spawnSync(process.execPath, [TOWN, "pair", "mark", "--path", "/hang"], { cwd: a.dir, env: cleanEnv(a.home), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 });
    expect([r.status, r.stderr]).toEqual([1, "error: test/pair mark ran out of time after 30 seconds and was stopped\n"]);
    const pids = JSON.parse(readFileSync(path.join(data, "state", "test%2Fpair", userId, "pids.json"), "utf8")) as { entry: number; town: number };
    const grandchild = Number(readFileSync(path.join(data, "state", "test%2Fecho", userId, "grandchild.pid"), "utf8"));
    const all = { entry: pids.entry, town: pids.town, "echo's grandchild": grandchild };
    for (const [label, pid] of Object.entries(all)) expect(pid, label).toBeGreaterThan(1);
    const living = () =>
      Object.entries(all)
        .filter(([, pid]) => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        })
        .map(([label]) => label);
    const alive = async () => {
      for (let i = 0; i < 50 && living().length; i++) await new Promise((res) => setTimeout(res, 20));
      return living();
    };
    expect(await alive()).toEqual([]);
    const [outer, inner] = lastRows(2);
    expect([outer![0], outer![2], inner![0], inner![1], inner![2], inner![6]]).toEqual(["test/pair", "timeout", "test/echo", "sleep", "town-error", "aborted"]);
    expect(inner![5]).toBe(outer![4]);
  }, 120_000);
});
