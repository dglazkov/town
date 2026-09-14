// ring: command
// The walk's stage without the agent: scripts/walk.mjs makes a town, a
// grant, an agent's directory, and a shim holding `town` alone; the
// sentence it hands the conductor is README's and SKILL.md's; `--status`
// counts the audit by result and prints it as a tree by parent, a shop's
// calls under the call they served; `--teardown` leaves no process and no
// directory. `--shop github` and `--shop watch` refuse, before any town or
// directory exists, a missing or malformed repo and a stdin with no token;
// neither is run as far as `shop add`, which reaches GitHub. `--search` finds a
// planted value in a file named as the database's WAL, and none in a
// clean directory, and never prints it. `--shop hall` sets the hall's
// stage with no token, and `--status` counts the hall's rows by command
// and detail and the pass's grants by source. `--status` counts the rows
// by wall, and the stage names the wall the town's shops run within.
// `--shop hall --data` stages the hall's walk over a town made here with
// the fakes as processes of their own (town/gdocs held on google-oauth and
// connected, dimitri in it): refused for no value, no town, or a town
// serving it; dimitri reused, memory added, a grant at town/gdocs bound to
// the credential. Then a figma shop published and approved by the lines
// `permit show` prints, `--status` counting the publish, the approval and
// its test, and the rows by shop since the stage was set;
// `--search-sealed` naming each sealed secret and the file a planted token
// is in, and never a value; `--teardown` keeping the data directory.
// `--shop hall --town` stages the same walk over `wrangler dev` through
// `townd admin --town`, the fakes as processes of their own and the
// consent landing at the box: refused for no value, no URL, no town, a
// refused operator token, or two towns; dimitri reused, memory added as
// a tar, the grant file naming the box, the agent's project settings, and
// a grant at town/gdocs bound to the credential. Then a worker figma shop
// published and approved by `permit show`'s lines typed over the wire,
// `--status` counting `isolate` rows and the rest over the wire,
// `--search-sealed` refusing, and `--teardown` revoking the walk's pass
// alone.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { browse } from "./helpers/authserver.js";
import { ROOT, TOWND, agent, assertBuilt, authProcess, cleanEnv, cleanup, dev, freePort, originProcess, serve, tmp, type Dev, type Ran, type Town } from "./helpers/town.js";

const WALK = path.join(ROOT, "scripts/walk.mjs");
const tmpdir = tmp("walk-tmpdir");
const home = tmp("walk-home");
const env = cleanEnv(home, { TMPDIR: tmpdir });
let pid: number | undefined;

beforeAll(() => assertBuilt());

afterAll(() => {
  if (pid !== undefined && alive(pid)) process.kill(pid, "SIGKILL");
  cleanup(tmpdir, home);
});

function alive(p: number): boolean {
  try {
    process.kill(p, 0);
    return true;
  } catch {
    return false;
  }
}

function walk(...args: string[]): Ran {
  const r = spawnSync(process.execPath, [WALK, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

/** The walk script with `input` piped to it through a shell pipe, as `walk.mjs … < <token file>` gives it. */
function walkPiped(input: string, ...args: string[]): Ran {
  const r = spawnSync("/bin/sh", ["-c", 'printf %s "$WALK_TEST_INPUT" | "$0" "$@"', process.execPath, WALK, ...args], {
    env: { ...env, WALK_TEST_INPUT: input },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

const roots = () => readdirSync(tmpdir).filter((e) => e.startsWith("town-walk-"));

it("sets the stage, reports the audit, and strikes it", () => {
  const up = walk();
  expect(up.exit, up.stderr).toBe(0);
  const root = /^walk ready: (.+)$/m.exec(up.stdout)![1]!;
  expect(path.dirname(root)).toBe(tmpdir);
  const w = JSON.parse(readFileSync(path.join(root, "walk.json"), "utf8"));
  pid = w.pid as number;
  expect(alive(pid)).toBe(true);

  // The sentence is README's blockquote, and SKILL.md is that sentence and nothing else.
  expect(w.sentence).toBe("There is a `town` command, and `town --help` says what it can do.");
  expect(readFileSync(path.join(ROOT, "SKILL.md"), "utf8")).toBe(`${w.sentence}\n`);
  expect(up.stdout).toContain(w.sentence);
  expect(up.stdout).toContain(`export PATH="${w.shim}:$PATH"`);
  expect(up.stdout).toContain(`export TOWN_DATA=${w.data}`);
  expect(up.stdout).toMatch(/^the town: {4}http:\/\/127\.0\.0\.1:\d+ \(pid \d+\), pass pass_[0-9a-f]+, shops walled by seatbelt$/m);
  expect(w.wall).toBe("seatbelt");

  // The agent's side: data outside the agent's directory, `town` alone in the shim.
  expect(readdirSync(w.shim)).toEqual(["town"]);
  expect(path.relative(w.agent, w.data).startsWith("..")).toBe(true);
  const agentEnv = { ...env, PATH: `${w.shim}:/usr/bin:/bin` };
  const town = (...args: string[]) => spawnSync("town", args, { cwd: w.agent, env: agentEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  expect(spawnSync("/bin/sh", ["-c", "command -v townd"], { env: agentEnv }).status).not.toBe(0);
  const help = town("--help");
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toMatch(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/m);
  expect(town("memory", "remember", "--key", "notes/walk", "--value", "set").status).toBe(0);
  expect(town("memory", "recall", "--key", "notes/walk").stdout).toBe("set\n");
  expect(town("memory", "forget", "--key", "notes/walk").status).toBe(2);

  const status = walk("--status", root);
  expect(status.exit, status.stderr).toBe(0);
  expect(status.stdout).toMatch(/^rows: 4; ok 3, denied 1$/m);
  // The town the walk starts passes no --wall, so on a Mac every call whose process ran is walled; the denied one ran none.
  expect(status.stdout).toMatch(/^rows by wall: seatbelt 2, - 2$/m);
  expect(status.stdout).toMatch(/^credentials: none served$/m);
  expect(status.stdout).toMatch(/^rows for town\/memory with no credential served: 3; ok 2, denied 1$/m);

  expect(walk("--teardown", tmpdir).exit).toBe(1);
  const down = walk("--teardown", root);
  expect(down.exit, down.stderr).toBe(0);
  expect(alive(pid)).toBe(false);
  expect(existsSync(root)).toBe(false);
}, 60_000);

it.each(["github", "watch"])("refuses --shop %s with no repo, a malformed repo, or no token on stdin, one line each and no walk root left", (shop) => {
  const before = roots();
  const refused = [
    walk("--shop", shop),
    walk("--shop", shop, "--repo", "owner/../../user"),
    walk("--shop", shop, "--repo", "just-a-name"),
    walk("--shop", shop, "--repo", "octo/hello"),
    walkPiped("", "--shop", shop, "--repo", "octo/hello"),
    walkPiped("\n", "--shop", shop, "--repo", "octo/hello"),
    walkPiped("tok_never_used", "--shop", `${shop}x`, "--repo", "octo/hello"),
    walkPiped("tok_never_used", "--shop", shop, "--repo", "octo/hello", "--commands", "mark"),
  ];
  for (const r of refused) {
    expect(r.exit, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/^walk: [^\n]+\n$/);
  }
  expect(refused[0]!.stderr).toBe(`walk: --shop ${shop} needs --repo <owner/name>, the repository the token is scoped to\n`);
  expect(refused[1]!.stderr).not.toContain("user");
  expect(refused[3]!.stderr).toContain("stdin");
  expect(refused[6]!.stderr).toBe(`walk: --shop ${shop}x is not a walk's shop; write --shop github, --shop watch, or --shop hall, or nothing for the memory walk\n`);
  for (const r of refused) expect(r.stderr).not.toContain("tok_never_used");
  expect(roots()).toEqual(before);
}, 60_000);

it("--shop hall sets the stage with no token, and --status counts the hall's rows by command and detail and the grants by source", () => {
  expect(walk("--shop", "hall", "--repo", "octo/hello")).toMatchObject({ exit: 1, stdout: "", stderr: "walk: --shop hall takes no other flag but --data <dir>; it needs no repository and no token\n" });
  const up = walk("--shop", "hall");
  expect(up.exit, up.stderr).toBe(0);
  const root = /^walk ready: (.+)$/m.exec(up.stdout)![1]!;
  const w = JSON.parse(readFileSync(path.join(root, "walk.json"), "utf8"));
  pid = w.pid as number;
  try {
    expect(w.shop).toBe("town/hall");
    expect(Object.keys(w.grants).sort()).toEqual(["town/hall", "town/memory"]);
    expect(up.stdout).toContain(`admin permit ls --pass ${w.passId}`);
    expect(up.stdout).toMatch(/^the grants:  grant_[0-9a-f]{16} town\/hall search,show,spec,validate,test,publish,request,requests; no constraints; expires 1d$/m);
    expect(readdirSync(w.shim)).toEqual(["town"]);

    // The agent's side, scripted: help, a refused validate, a publish, and a request.
    const agentEnv = { ...env, PATH: `${w.shim}:/usr/bin:/bin` };
    const sh = (line: string) => spawnSync("/bin/sh", ["-c", line], { cwd: w.agent, env: agentEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
    const help = sh("town --help");
    expect(help.stdout).toMatch(/^town\/hall\s.*\[search, show, spec, validate, test, publish, request, requests\]$/m);
    expect(help.stdout).toMatch(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/m);
    const manifest = "name: dimitri/hello\nversion: 0.1.0\nsummary: Says a word.\nruntime: subprocess\nentry: ./main.mjs\ncommands:\n  - name: hi\n    summary: Print a greeting.\n    effect: read\n    output: text\ntests:\n  - name: it greets\n    run: hi\n    expect: { contains: hello }\n";
    mkdirSync(path.join(w.agent, "hello"));
    writeFileSync(path.join(w.agent, "hello", "main.mjs"), "process.stdout.write('hello\\n');\n");
    writeFileSync(path.join(w.agent, "hello", "manifest.yaml"), manifest.replace("dimitri/hello", "walker/hello"));
    expect(sh("tar --format ustar -cf - -C hello . | town hall validate").stdout).toBe("name: walker/hello is not under your namespace; write dimitri/hello instead (spec §2)\n");
    writeFileSync(path.join(w.agent, "hello", "manifest.yaml"), manifest);
    expect(sh("tar --format ustar -cf - -C hello . | town hall validate").status).toBe(0);
    expect(sh("tar --format ustar -cf - -C hello . | town hall publish").stdout).toBe("ok it greets\npublished dimitri/hello 0.1.0; town hello --help says what it does\n");
    expect(sh("town hall request --shop town/memory --commands forget").status).toBe(0);

    const status = walk("--status", root);
    expect(status.exit, status.stderr).toBe(0);
    const counts = status.stdout.split("hall rows by command: ")[1]!.split("since the walk began")[0]!.trimEnd().split("\n");
    expect(counts).toEqual([
      "4",
      "  validate 2: refused 1, valid 1; sections refused: §2 1",
      "  publish 1: published 1",
      "  request 1: requested 1",
      "grants by source: operator 2, publish 1",
    ]);
    expect(status.stdout).toMatch(/^rows by shop:\n {2}no shop: help 1; no credential served; under the walk's pass\n {2}town\/hall: usage 1, ok 3; no credential served; under the walk's pass\n/m);
    expect(status.stdout).toMatch(/^published, requesting a permit: 0\napprovals of the walk's permits: 0\nconsents: 0\nrefreshes: 0\n$/m);
    expect(walk("--teardown", root).exit).toBe(0);
    expect(existsSync(root)).toBe(false);
  } finally {
    if (alive(pid)) process.kill(pid, "SIGKILL");
  }
}, 60_000);

it("--status prints the audit as a tree: a shop's calls indented under the call they served, and how many there were", async () => {
  const root = mkdtempSync(path.join(tmpdir, "town-walk-"));
  const data = path.join(root, "data");
  let town: Town | undefined;
  const a = agent();
  try {
    town = await serve(data);
    for (const dir of ["test/fixtures/echo-shop", "test/fixtures/recipe-shop"]) expect(town.admin("shop", "add", path.join(ROOT, dir)).exit).toBe(0);
    expect(town.admin("user", "add", "walker").exit).toBe(0);
    const pass = town.admin("pass", "new", "--user", "walker", "--label", "walk");
    const passId = pass.stderr.trim();
    expect(town.admin("grant", "new", "--pass", passId, "--shop", "test/echo", "--commands", "echo").exit).toBe(0);
    expect(town.admin("grant", "new", "--pass", passId, "--shop", "test/recipe", "--commands", "relay").exit).toBe(0);
    a.writeGrant(pass.stdout);
    expect(a.town("recipe", "relay", "--words", "echo echo --zeta z").exit).toBe(0);
    expect(a.town("recipe", "relay", "--words", "echo sleep").exit).toBe(2);
    expect(a.town("echo", "echo", "--zeta", "z").exit).toBe(0);
    writeFileSync(path.join(root, "walk.json"), JSON.stringify({ root, data, pid: 2 ** 22 + 7, passId, shop: "test/recipe" }));

    const status = walk("--status", root);
    expect(status.exit, status.stderr).toBe(0);
    const section = status.stdout.split(`audit of ${passId}, as a tree by parent:\n`)[1]!.split("\n\n")[0]!;
    const lines = section.split("\n");
    expect(lines[0]).toMatch(/^call\s+at\s+pass\s+shop\s+command\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+detail$/);
    expect(lines.slice(1, -1).map((l) => /^( *)call_[0-9a-f]{16}\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l)!.slice(1))).toEqual([
      ["", passId, "test/recipe", "relay", "ok"],
      ["  ", passId, "test/echo", "echo", "ok"],
      ["", passId, "test/recipe", "relay", "denied"],
      ["  ", passId, "test/echo", "sleep", "denied"],
      ["", passId, "test/echo", "echo", "ok"],
    ]);
    expect(lines.at(-1)).toBe("rows made in a shop's service: 2, under 2 calls");
    expect(status.stdout).toMatch(/^rows: 5; ok 3, denied 2$/m);
  } finally {
    await town?.stop();
    cleanup(root, a.dir, a.home, ...(town ? [town.env.HOME!] : []));
  }
}, 60_000);

it("--search finds the value in a file named as the WAL and prints the file, never the value; a clean directory finds none", () => {
  const VALUE = "github_pat_planted_for_the_search_test_0123456789";
  const dirty = mkdtempSync(path.join(tmpdir, "search-dirty-"));
  mkdirSync(path.join(dirty, "data"));
  writeFileSync(path.join(dirty, "data", "town.db"), "nothing here");
  writeFileSync(path.join(dirty, "data", "town.db-wal"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(VALUE), Buffer.from([0]), Buffer.from(VALUE)]));
  const transcript = path.join(mkdtempSync(path.join(tmpdir, "transcript-")), "session.jsonl");
  writeFileSync(transcript, '{"said":"nothing secret"}\n');

  const found = walkPiped(`${VALUE}\n`, "--search", dirty, transcript);
  expect(found.exit, found.stderr).toBe(1);
  expect(found.stdout).toBe(`2 ${path.join(dirty, "data", "town.db-wal")}\nfound in 1 files\n`);
  expect(found.stdout + found.stderr).not.toContain(VALUE);

  const clean = mkdtempSync(path.join(tmpdir, "search-clean-"));
  writeFileSync(path.join(clean, "town.db-wal"), "nothing here either");
  const none = walkPiped(VALUE, "--search", clean, transcript);
  expect(none.exit, none.stderr).toBe(0);
  expect(none.stdout).toBe("found in 0 files\n");

  expect(walkPiped(VALUE, "--search", clean, path.join(clean, "no-such-transcript")).exit).toBe(2);
  expect(walk("--search", clean).exit).toBe(2);
  cleanup(dirty, clean, path.dirname(transcript));
}, 60_000);

it("--shop hall --data stages the hall's walk over a town it is given, --status reads the publish and the approval, --search-sealed names every sealed secret, and --teardown keeps the data", async () => {
  const CLIENT_ID = "walk-client.apps.example";
  const CLIENT_SECRET = "walk-client-secret-not-a-real-one-2b9e";
  const TOKEN = "figma-walk-not-a-real-token-8d41";
  const origin = await originProcess();
  const fakes = await authProcess(CLIENT_ID, CLIENT_SECRET);
  const scratch = tmp("walk-given");
  const data = path.join(scratch, "town");
  const boxShim = path.join(scratch, "box");
  mkdirSync(boxShim);
  writeFileSync(path.join(boxShim, "townd"), `#!/bin/sh\nexec '${process.execPath}' '${TOWND}' "$@"\n`, { mode: 0o755 });
  const boxEnv = { ...cleanEnv(home), TOWN_DATA: data, TOKEN, CLIENT_ID, CLIENT_SECRET, PATH: `${boxShim}:${process.env.PATH}` };
  const atBox = (line: string): Ran => {
    const r = spawnSync("/bin/sh", ["-c", line], { cwd: scratch, env: boxEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
    return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
  };
  let served: Town | undefined;
  let root: string | undefined;
  try {
    // The town the walk is given: dimitri, and town/gdocs over the fakes, held on google-oauth and connected.
    expect(atBox("townd admin user add dimitri").exit).toBe(0);
    const gdocs = path.join(scratch, "gdocs");
    mkdirSync(gdocs);
    const manifest = readFileSync(path.join(ROOT, "shops/gdocs/manifest.yaml"), "utf8")
      .replace("https://docs.googleapis.com", fakes.docs)
      .replace("https://accounts.google.com/o/oauth2/v2/auth", `${fakes.auth}/authorize`)
      .replace("https://oauth2.googleapis.com/token", `${fakes.auth}/token`);
    writeFileSync(path.join(gdocs, "manifest.yaml"), manifest);
    writeFileSync(path.join(gdocs, "main.mjs"), readFileSync(path.join(ROOT, "shops/gdocs/main.mjs"), "utf8"));
    expect(atBox(`printf '%s\\n' "$CLIENT_SECRET" | townd admin shop add ${gdocs} --user dimitri --client-id "$CLIENT_ID"`).exit).toBe(1);
    const connect = spawn("/bin/sh", ["-c", "townd admin credential connect --user dimitri --type google-oauth"], { cwd: scratch, env: boxEnv, stdio: ["ignore", "pipe", "pipe"] });
    let said = "";
    let err = "";
    let consent: Promise<unknown> | null = null;
    connect.stdout.on("data", (b: Buffer) => (said += b.toString("utf8")));
    connect.stderr.on("data", (b: Buffer) => {
      err += b.toString("utf8");
      const url = /^(http:\/\/127\.0\.0\.1:\d+\/authorize\?\S+)\n/m.exec(err)?.[1];
      if (url && !consent) consent = browse(url).then((location) => fetch(location));
    });
    expect(await new Promise<number>((resolve) => connect.on("close", (code) => resolve(code ?? -1))), err).toBe(0);
    await consent;
    const oauthCredential = said.trim();
    expect(atBox(`townd admin shop add ${gdocs} --user dimitri`).exit).toBe(0);

    // Refused, one line each, and no walk root left: no value, no town in the directory, a town serving it.
    const before = roots();
    expect(walk("--shop", "hall", "--data")).toMatchObject({ exit: 1, stdout: "", stderr: "walk: --data needs a value, an existing town's data directory\n" });
    expect(walk("--shop", "hall", "--data", gdocs)).toMatchObject({ exit: 1, stdout: "", stderr: `walk: --data ${gdocs} holds no town.db, so it is not a town's data directory; nothing was touched\n` });
    served = await serve(data);
    const refused = walk("--shop", "hall", "--data", data);
    expect(refused).toMatchObject({ exit: 1, stdout: "" });
    expect(refused.stderr).toBe(`walk: a town is serving ${data} already (pid ${served.pid}); stop it, then stage again; nothing was touched\n`);
    await served.stop();
    served = undefined;
    expect(roots()).toEqual(before);

    // The stage: dimitri kept, memory added, and a grant at town/gdocs bound to the connected credential.
    const up = walk("--shop", "hall", "--data", data);
    expect(up.exit, up.stderr).toBe(0);
    root = /^walk ready: (.+)$/m.exec(up.stdout)![1]!;
    const w = JSON.parse(readFileSync(path.join(root, "walk.json"), "utf8"));
    pid = w.pid as number;
    expect([w.data, w.dataGiven, Object.keys(w.grants).sort()]).toEqual([data, true, ["town/gdocs", "town/hall", "town/memory"]]);
    expect(up.stdout).toContain(`the data:    ${data}, given, and kept at teardown; kept user dimitri; added shop town/memory\n`);
    expect(up.stdout).toMatch(new RegExp(`^ {13}${w.grants["town/gdocs"]} town/gdocs read; no constraints; bound to ${oauthCredential}, dimitri's google-oauth$`, "m"));
    expect(path.relative(w.agent, data).startsWith("..")).toBe(true);

    // The agent's side, scripted: the document read, a figma shop published; the box types what permit show prints.
    const agentEnv = { ...env, PATH: `${w.shim}:/usr/bin:/bin` };
    const sh = (line: string) => spawnSync("/bin/sh", ["-c", line], { cwd: w.agent, env: agentEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
    expect(sh("town gdocs read --doc-id fixture-doc").stdout).toBe("The fixture\nThe first line of the fixture.\nA heading\nSome bold words.\n");
    mkdirSync(path.join(w.agent, "figma"));
    writeFileSync(path.join(w.agent, "figma", "manifest.yaml"), readFileSync(path.join(ROOT, "test/fixtures/figma-shop/manifest.yaml"), "utf8").replace("http://127.0.0.1:9", origin.url));
    writeFileSync(path.join(w.agent, "figma", "main.mjs"), readFileSync(path.join(ROOT, "test/fixtures/figma-shop/main.mjs"), "utf8"));
    const permit = /requested (prm_[0-9a-f]{16})/.exec(sh("tar --format ustar -cf - -C figma . | town hall publish").stdout)![1]!;
    const shown = atBox(`townd admin permit show ${permit}`).stdout;
    for (const line of shown.slice(shown.indexOf("to do:\n") + "to do:\n".length).trimEnd().split("\n").map((l) => l.slice(8))) expect(atBox(line).exit, line).toBe(0);
    expect(sh("town figma file --key abc").stdout).toBe("200\nhello from the origin");

    const status = walk("--status", root);
    expect(status.exit, status.stderr).toBe(0);
    expect(status.stdout).toMatch(new RegExp(`^grants by source: operator 3, permit ${permit} 1$`, "m"));
    const since = status.stdout.slice(status.stdout.indexOf("\nsince the walk began: ") + 1).trimEnd().split("\n");
    expect(since).toEqual([
      expect.stringMatching(/^since the walk began: 5 rows, after the [1-9]\d* the town held before it$/),
      "rows by shop:",
      "  town/gdocs: ok 1; credentials google-oauth 1 requests; under the walk's pass",
      "  town/hall: ok 1; no credential served; under the walk's pass",
      "  dimitri/figma: ok 3; credentials figma 2 requests; under no pass, the walk's pass",
      "published, requesting a permit: 1",
      `  published dimitri/figma 0.1.0; requested ${permit}`,
      "approvals of the walk's permits: 1",
      expect.stringMatching(new RegExp(`^ {2}approval ${permit} tests 1/1, dimitri/figma, ok \\(call_[0-9a-f]{16}\\)$`)),
      "    dimitri/figma file ok figma:1: test a file answers",
      "    tests under it: 1, 1 ok",
      "consents: 0",
      "refreshes: 0",
    ]);

    // Every sealed secret by name; the token planted in a transcript is found there alone, and no value is printed.
    const transcript = path.join(scratch, "transcript.jsonl");
    writeFileSync(transcript, `{"said":"${TOKEN}"}\n`);
    const figmaCredential = /^(credential_[0-9a-f]{16}) figma token: /m.exec(walk("--search-sealed", root).stdout)?.[1];
    const found = walk("--search-sealed", root, transcript);
    expect(found.exit, found.stderr).toBe(1);
    expect(found.stdout.split("\n").slice(2)).toEqual([
      `${oauthCredential} google-oauth refresh_token: 0 files`,
      `${oauthCredential} google-oauth access_token: 0 files`,
      `${figmaCredential} figma token: 1 files`,
      `  ${transcript}`,
      "type google-oauth client_secret: 0 files",
      "4 sealed secrets; 1 found in a file",
      "",
    ]);
    expect(found.stdout).toContain("a hit in town.db or its WAL is the plaintext bytes");
    const clean = walk("--search-sealed", root);
    expect([clean.exit, clean.stdout.trimEnd().split("\n").at(-1)]).toEqual([0, "4 sealed secrets; 0 found in a file"]);
    for (const secret of [...fakes.secrets(), CLIENT_SECRET, TOKEN]) expect(found.stdout + found.stderr + clean.stdout + clean.stderr + status.stdout + up.stdout, secret).not.toContain(secret);

    // The teardown: the town stopped and the walk root gone; the data directory kept, its key and shops as they were.
    const key = readFileSync(path.join(data, "vault.key"));
    const shops = readdirSync(path.join(data, "shops")).sort();
    const down = walk("--teardown", root);
    expect(down.exit, down.stderr).toBe(0);
    expect(down.stdout).toContain(`kept ${data}, the data directory given\n`);
    expect(alive(pid)).toBe(false);
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(path.join(data, "vault.key"))).toEqual(key);
    expect(readdirSync(path.join(data, "shops")).sort()).toEqual(shops);
    expect(existsSync(path.join(data, "town.db"))).toBe(true);
    root = undefined;
  } finally {
    await served?.stop();
    if (pid !== undefined && alive(pid)) process.kill(pid, "SIGKILL");
    if (root) cleanup(root);
    await origin.stop();
    await fakes.stop();
    cleanup(scratch);
  }
}, 180_000);

it("--shop hall --town stages the hall's walk over a box through townd admin --town, --status reads it over the wire with isolate counted, --search-sealed refuses, and --teardown revokes the pass and keeps the box", async () => {
  const CLIENT_ID = "walk-town-client.apps.example";
  const CLIENT_SECRET = "walk-town-client-secret-not-a-real-one-7c1d";
  const TOKEN = "figma-walk-town-not-a-real-token-3e90";
  const origin = await originProcess();
  const fakes = await authProcess(CLIENT_ID, CLIENT_SECRET);
  let box: Dev | undefined;
  const scratch = tmp("walk-town");
  let root: string | undefined;
  try {
    box = await dev();
    const url = box.url;
    // The operator's side: a home holding ~/.town/operator, a `townd` on PATH, and nothing of a data directory.
    const opEnv = { ...env, HOME: box.home };
    const walkOver = (e: NodeJS.ProcessEnv, ...args: string[]): Ran => {
      const r = spawnSync(process.execPath, [WALK, ...args], { env: e, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
      return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
    };
    const boxShim = path.join(scratch, "box");
    mkdirSync(boxShim);
    writeFileSync(path.join(boxShim, "townd"), `#!/bin/sh\nexec '${process.execPath}' '${TOWND}' "$@"\n`, { mode: 0o755 });
    const shEnv: NodeJS.ProcessEnv = { ...cleanEnv(box.home), TOKEN, CLIENT_ID, CLIENT_SECRET, COPYFILE_DISABLE: "1", PATH: `${boxShim}:${process.env.PATH}` };
    delete shEnv.TOWN_OPERATOR;
    const atBox = (line: string): Ran => {
      const r = spawnSync("/bin/sh", ["-c", line], { cwd: scratch, env: shEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
      return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
    };
    const ok = (r: Ran) => (expect(r.exit, `${r.stdout}${r.stderr}`).toBe(0), r);

    // The box the walk is given: dimitri, google-oauth held over the fakes and connected at the box's landing, and town/gdocs on it.
    ok(box.admin(["user", "add", "dimitri"]));
    await fakes.control({ redirectPath: "/consent" });
    const scopes = "https://www.googleapis.com/auth/documents.readonly";
    ok(atBox(`printf '%s\\n' "$CLIENT_SECRET" | townd admin --town ${url} type add google-oauth --kind oauth --origin ${fakes.docs} --header 'Authorization: Bearer {token}' --authorize ${fakes.auth}/authorize --token ${fakes.auth}/token --scopes ${scopes} --client-id "$CLIENT_ID"`));
    const connect = spawn("/bin/sh", ["-c", `townd admin --town ${url} credential connect --user dimitri --type google-oauth`], { cwd: scratch, env: shEnv, stdio: ["ignore", "pipe", "pipe"] });
    let said = "";
    let err = "";
    let consent: Promise<unknown> | null = null;
    connect.stdout.on("data", (b: Buffer) => (said += b.toString("utf8")));
    connect.stderr.on("data", (b: Buffer) => {
      err += b.toString("utf8");
      const at = /^(http:\/\/127\.0\.0\.1:\d+\/authorize\?\S+)\n/m.exec(err)?.[1];
      if (at && !consent) consent = browse(at).then((location) => fetch(location));
    });
    expect(await new Promise<number>((resolve) => connect.on("close", (code) => resolve(code ?? -1))), err).toBe(0);
    await consent;
    const oauthCredential = said.trim();
    expect(oauthCredential).toMatch(/^credential_[0-9a-f]{16}$/);
    const gdocs = path.join(scratch, "gdocs");
    mkdirSync(gdocs);
    const manifest = readFileSync(path.join(ROOT, "shops/gdocs/manifest.yaml"), "utf8")
      .replace("https://docs.googleapis.com", fakes.docs)
      .replace("https://accounts.google.com/o/oauth2/v2/auth", `${fakes.auth}/authorize`)
      .replace("https://oauth2.googleapis.com/token", `${fakes.auth}/token`);
    writeFileSync(path.join(gdocs, "manifest.yaml"), manifest);
    writeFileSync(path.join(gdocs, "main.mjs"), readFileSync(path.join(ROOT, "shops/gdocs/main.mjs"), "utf8"));
    ok(box.adminTar(gdocs, ["shop", "add", "-", "--user", "dimitri"]));

    // Refused, one line each, and no walk root left: no value, not a URL, no town answering, the operator's token refused, two towns.
    const before = roots();
    const quiet = await freePort();
    expect(walkOver(opEnv, "--shop", "hall", "--town")).toMatchObject({ exit: 1, stdout: "", stderr: "walk: --town needs a value, a deployed box's URL\n" });
    expect(walkOver(opEnv, "--shop", "hall", "--town", "ftp://town.example")).toMatchObject({ exit: 1, stdout: "", stderr: "walk: --town ftp://town.example is not a box's address; write its URL, like https://town.example.workers.dev; nothing was made\n" });
    expect(walkOver(opEnv, "--shop", "hall", "--town", `http://127.0.0.1:${quiet}`)).toMatchObject({ exit: 1, stdout: "", stderr: `walk: no town answers at http://127.0.0.1:${quiet}; nothing was made\n` });
    expect(walkOver({ ...opEnv, TOWN_OPERATOR: "not-the-operator-token" }, "--shop", "hall", "--town", url)).toMatchObject({ exit: 1, stdout: "", stderr: `walk: townd admin --town ${url} user ls exited 1: townd admin: the operator token is refused; nothing was made\n` });
    expect(walkOver(opEnv, "--shop", "hall", "--data", scratch, "--town", url)).toMatchObject({ exit: 1, stdout: "", stderr: "walk: --data and --town name two towns; write one or the other\n" });
    expect(roots()).toEqual(before);
    const passesBefore = ok(box.admin(["pass", "ls"])).stdout;

    // The stage: dimitri kept, memory added as a tar, a grant at town/gdocs bound to the connected credential, and the grant file naming the box.
    const up = walkOver(opEnv, "--shop", "hall", "--town", `${url}/`);
    expect(up.exit, up.stderr).toBe(0);
    root = /^walk ready: (.+)$/m.exec(up.stdout)![1]!;
    const w = JSON.parse(readFileSync(path.join(root, "walk.json"), "utf8"));
    expect([w.town, w.data, w.pid, w.wall, Object.keys(w.grants).sort()]).toEqual([url, undefined, undefined, "isolate", ["town/gdocs", "town/hall", "town/memory"]]);
    expect(readdirSync(root).sort()).toEqual(["agent", "shim", "walk.json"]);
    expect(JSON.parse(readFileSync(w.grantFile, "utf8")).town).toBe(url);
    expect(up.stdout).toContain(`the town:    ${url}, a box over the wire, pass ${w.passId}, shops run in an isolate\n`);
    expect(up.stdout).toContain(`the box:     ${url}, kept at teardown but for the walk's pass; kept user dimitri; added shop town/memory\n`);
    expect(up.stdout).toMatch(new RegExp(`^ {13}${w.grants["town/gdocs"]} town/gdocs read; no constraints; bound to ${oauthCredential}, dimitri's google-oauth$`, "m"));
    expect(up.stdout).toContain(`\n  claude --tools Bash --setting-sources project\n`);
    expect(up.stdout).toContain(`admin --town ${url} permit ls --pass ${w.passId}\n`);
    expect(up.stdout).not.toContain("TOWN_DATA");
    expect(up.stdout).not.toContain("--search-sealed");
    expect(JSON.parse(readFileSync(path.join(w.agent, ".claude", "settings.json"), "utf8"))).toEqual({
      permissions: { allow: ["Bash(town:*)", "Bash(tar:*)", "Bash(mkdir:*)", "Bash(cat:*)", "Bash(ls:*)", "Bash(printf:*)", "Bash(echo:*)", "Bash(chmod:*)"], defaultMode: "acceptEdits" },
    });
    expect(readdirSync(w.shim)).toEqual(["town"]);
    expect(ok(box.admin(["shop", "ls"])).stdout).toMatch(/^town\/memory\s/m);

    // The agent's side, scripted: the document read through an isolate, a worker figma shop published; the box types what permit show prints, over the wire.
    const agentEnv = { ...env, PATH: `${w.shim}:/usr/bin:/bin` };
    const sh = (line: string) => spawnSync("/bin/sh", ["-c", line], { cwd: w.agent, env: { ...agentEnv, COPYFILE_DISABLE: "1" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
    expect(sh("town gdocs read --doc-id fixture-doc").stdout).toBe("The fixture\nThe first line of the fixture.\nA heading\nSome bold words.\n");
    mkdirSync(path.join(w.agent, "figma"));
    writeFileSync(path.join(w.agent, "figma", "manifest.yaml"), readFileSync(path.join(ROOT, "test/fixtures/figma-shop/manifest.yaml"), "utf8").replace("http://127.0.0.1:9", origin.url).replace("runtime: subprocess", "runtime: worker"));
    writeFileSync(
      path.join(w.agent, "figma", "main.mjs"),
      'export default async function main() {\n  const [, , key] = process.argv.slice(2);\n  const answer = await fetch(`${process.env.TOWN_CREDENTIAL_FIGMA}/v1/files/${encodeURIComponent(key ?? "")}`);\n  process.stdout.write(`${answer.status}\\n${await answer.text()}`);\n  return answer.ok ? 0 : 1;\n}\n',
    );
    const published = sh("tar --format ustar -cf - -C figma . | town hall publish");
    const permit = /requested (prm_[0-9a-f]{16})/.exec(published.stdout)?.[1];
    expect(permit, `${published.stdout}${published.stderr}`).toBeDefined();
    const shown = ok(atBox(`townd admin --town ${url} permit show ${permit}`)).stdout;
    for (const line of shown.slice(shown.indexOf("to do:\n") + "to do:\n".length).trimEnd().split("\n").map((l) => l.slice(8).replace("townd admin ", `townd admin --town ${url} `))) ok(atBox(line));
    expect(sh("town figma file --key abc").stdout).toBe("200\nhello from the origin");

    const status = walkOver(opEnv, "--status", root);
    expect(status.exit, status.stderr).toBe(0);
    expect(status.stdout).toContain(`the town: ${url}, a box over the wire, answering\n`);
    expect(status.stdout).toMatch(/^rows by wall: isolate 2, - 1$/m);
    expect(status.stdout).toMatch(/^rows by wall since the walk began, under any pass: isolate 3, - 2$/m);
    expect(status.stdout).toMatch(new RegExp(`^grants by source: operator 3, permit ${permit} 1$`, "m"));
    const since = status.stdout.slice(status.stdout.indexOf("\nsince the walk began: ") + 1).trimEnd().split("\n");
    expect(since).toEqual([
      expect.stringMatching(/^since the walk began: 5 rows, after the [1-9]\d* the town held before it$/),
      "rows by shop:",
      "  town/gdocs: ok 1; credentials google-oauth 1 requests; under the walk's pass",
      "  town/hall: ok 1; no credential served; under the walk's pass",
      "  dimitri/figma: ok 3; credentials figma 2 requests; under no pass, the walk's pass",
      "published, requesting a permit: 1",
      `  published dimitri/figma 0.1.0; requested ${permit}`,
      "approvals of the walk's permits: 1",
      expect.stringMatching(new RegExp(`^ {2}approval ${permit} tests 1/1, dimitri/figma, ok \\(call_[0-9a-f]{16}\\)$`)),
      "    dimitri/figma file ok figma:1: test a file answers",
      "    tests under it: 1, 1 ok",
      "consents: 0",
      "refreshes: 0",
    ]);

    // --search-sealed cannot open a box's rows, and says so; --search reads the files, the grant file holding the pass's token.
    const sealed = walkOver(opEnv, "--search-sealed", root);
    expect([sealed.exit, sealed.stdout]).toEqual([2, ""]);
    expect(sealed.stderr).toBe(`walk: --search-sealed opens the town's sealed rows with its vault key, and ${url} is a box whose key is a platform secret this laptop never holds, so nothing was searched; search for a value you hold with --search ${root} [<path>...] < <file holding it>\n`);
    const passToken = JSON.parse(readFileSync(w.grantFile, "utf8")).token as string;
    const found = walkPiped(passToken, "--search", root);
    expect([found.exit, found.stdout]).toEqual([1, `1 ${w.grantFile}\nfound in 1 files\n`]);
    const operator = walkPiped(box.operator, "--search", root);
    expect([operator.exit, operator.stdout]).toEqual([0, "found in 0 files\n"]);
    for (const secret of [...fakes.secrets(), CLIENT_SECRET, TOKEN, box.operator]) expect(up.stdout + status.stdout + sealed.stderr, secret).not.toContain(secret);

    // The teardown: the walk's pass revoked on the box and the root gone; the box keeps its users, shops, credentials, and other passes.
    const shops = ok(box.admin(["shop", "ls"])).stdout;
    writeFileSync(path.join(scratch, "grant"), readFileSync(w.grantFile));
    const down = walkOver(opEnv, "--teardown", root);
    expect(down.exit, down.stderr).toBe(0);
    expect(down.stdout).toBe(`revoked ${w.passId} at ${url}; the box and everything else on it are kept\nremoved ${root}\n`);
    expect(existsSync(root)).toBe(false);
    root = undefined;
    const after = agent();
    after.writeGrant(readFileSync(path.join(scratch, "grant"), "utf8"));
    expect(after.town("--help")).toEqual({ exit: 3, stdout: "", stderr: "error: this pass is not valid: its token is unknown, revoked, or expired\n" });
    cleanup(after.dir, after.home);
    expect(ok(box.admin(["pass", "ls"])).stdout).toMatch(new RegExp(`^${w.passId}\\s.*\\srevoked\\s`, "m"));
    for (const line of passesBefore.trim().split("\n").slice(1)) expect(ok(box.admin(["pass", "ls"])).stdout).toContain(line.split(/\s+/)[0]);
    expect(ok(box.admin(["shop", "ls"])).stdout).toBe(shops);
    expect(ok(box.admin(["credential", "ls", "--user", "dimitri"])).stdout).toMatch(new RegExp(`^${oauthCredential}\\s.*\\sactive\\s`, "m"));
  } finally {
    if (root) cleanup(root);
    await box?.stop();
    await origin.stop();
    await fakes.stop();
    cleanup(scratch);
  }
}, 300_000);
