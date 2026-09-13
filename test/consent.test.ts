// ring: command
// Consent phase 0, typed, against towns this test starts, with the fake
// origin as a process of its own and the fixture shop in
// test/fixtures/figma-shop, whose manifest proposes the figma type over the
// origin's address: a scripted agent in a directory with `.town/grant`
// and `town` on its PATH, and the operator at the box typing `townd admin`
// lines through a shell with `townd` on its PATH and $TOWN_DATA set.
// Consent's journey 1 steps 1 to 6 and its criteria on a token type; its
// journey 2 steps 1 to 4 and 8; and the criterion that the checklist is
// enough: a permit made, the lines `permit show` prints typed as printed,
// in order and nothing else, the grant made at the end. The entry's
// environment is printed once, an address and no token. Consent phase 1,
// the oauth kind, with the fake authorization server and fake docs origin
// as a process of their own and shops/gdocs copied with its addresses
// written over: journey 2 step 7, `shop add` holding google-oauth, refused
// naming `connect`, and adding the shop after a consent, its read
// answered; journey 2 steps 5, 6, and 9 and journey 3 steps 1 to 6, an
// oauth type proposed by the agent's shop, approved with a registration,
// connected with the redirect delivered by the test's own request, the
// checklist typed as printed, a refresh when the served town's clock is
// moved an hour, a 500, `invalid_grant`, and the prying entry published on
// the oauth type and run walled, its output and the data directory
// searched for every token and the client secret. No token and no network
// but loopback.

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { browse } from "./helpers/authserver.js";
import { MEMORY, ROOT, TOWN, TOWND, agent, assertBuilt, authProcess, cleanEnv, cleanup, originProcess, serve, tmp, type Agent, type AuthProcess, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;
let fakes: AuthProcess;
let shim: string;

const FIGMA = path.join(ROOT, "test/fixtures/figma-shop");
const TOKEN = "figma-consent-not-a-real-token";
const GUIDANCE = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";
const CLIENT_ID = "ring-client.apps.example";
const CLIENT_SECRET = "ring-client-secret-not-a-real-one-61d0";
const GDOCS = path.join(ROOT, "shops/gdocs");
const GDOCS_GUIDANCE = "In the Google Cloud console, enable the Google Docs API and make an OAuth client of the Desktop type; give the town its client id and secret, then connect, which opens Google's consent page.";
const SCOPE = "https://www.googleapis.com/auth/documents.readonly";

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
  fakes = await authProcess(CLIENT_ID, CLIENT_SECRET);
  // `town` for the agent and `townd` for the operator, each on its own side's PATH alone.
  shim = tmp("consent-shim");
  made.push(shim);
  mkdirSync(path.join(shim, "agent"));
  mkdirSync(path.join(shim, "box"));
  writeFileSync(path.join(shim, "agent", "town"), `#!/bin/sh\nexec '${process.execPath}' '${TOWN}' "$@"\n`);
  writeFileSync(path.join(shim, "box", "townd"), `#!/bin/sh\nexec '${process.execPath}' '${TOWND}' "$@"\n`);
  chmodSync(path.join(shim, "agent", "town"), 0o755);
  chmodSync(path.join(shim, "box", "townd"), 0o755);
});

afterAll(async () => {
  for (const t of towns) await t.stop();
  await origin?.stop();
  await fakes?.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

/** A line the agent types in its directory, with `town` on its PATH. */
function typed(a: Agent, line: string): Ran {
  const env = { ...cleanEnv(a.home), PATH: `${path.join(shim, "agent")}:${process.env.PATH}` };
  const r = spawnSync("/bin/sh", ["-c", line], { cwd: a.dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

/** The operator's shell at the box: `townd` on the PATH, the data directory in $TOWN_DATA, the token in $TOKEN, the registration in $CLIENT_ID and $CLIENT_SECRET. */
const boxEnv = (town: Town) => ({ ...town.env, TOWN_DATA: town.dataDir, TOKEN, CLIENT_ID, CLIENT_SECRET, PATH: `${path.join(shim, "box")}:${process.env.PATH}` });

/** A line the operator types at the box, as printed. */
function atBox(town: Town, line: string): Ran {
  const r = spawnSync("/bin/sh", ["-c", line], { cwd: os.tmpdir(), env: boxEnv(town), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

/**
 * A line typed at the box that waits for a browser, as `credential
 * connect` does: run as atBox runs it, but not synchronously, and once it
 * prints the authorization URL, `browser` is handed the URL and the
 * listener's address. What it printed, and its exit.
 */
async function atBoxWaiting(town: Town, line: string, browser: (url: string, redirect: string) => Promise<void>): Promise<Ran> {
  const child = spawn("/bin/sh", ["-c", line], { cwd: os.tmpdir(), env: boxEnv(town), stdio: ["ignore", "pipe", "pipe"] });
  const killer = setTimeout(() => child.kill("SIGKILL"), 60_000);
  let stdout = "";
  let stderr = "";
  let acting: Promise<void> | null = null;
  child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
  child.stderr.on("data", (b: Buffer) => {
    stderr += b.toString("utf8");
    const url = /^(http:\/\/127\.0\.0\.1:\d+\/authorize\?\S+)\n/m.exec(stderr)?.[1];
    const redirect = /the redirect comes back to (http:\/\/127\.0\.0\.1:\d+\/)/.exec(stderr)?.[1];
    if (url && redirect && !acting) acting = browser(url, redirect);
  });
  const exit = await new Promise<number>((resolve) => child.on("close", (code) => resolve(code ?? -1)));
  clearTimeout(killer);
  await acting;
  return { stdout, stderr, exit };
}

/** A browser at the fake: its redirect for the URL delivered to the listener; the listener's answer. */
async function consentIn(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(await browse(url));
  return { status: res.status, body: await res.text() };
}

/** shops/gdocs with its addresses written over by the fakes', named `name`, written to `dir`. */
function writeGdocs(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  const manifest = readFileSync(path.join(GDOCS, "manifest.yaml"), "utf8")
    .replace("name: town/gdocs", `name: ${name}`)
    .replace("https://docs.googleapis.com", fakes.docs)
    .replace("https://accounts.google.com/o/oauth2/v2/auth", `${fakes.auth}/authorize`)
    .replace("https://oauth2.googleapis.com/token", `${fakes.auth}/token`);
  writeFileSync(path.join(dir, "manifest.yaml"), manifest);
  writeFileSync(path.join(dir, "main.mjs"), readFileSync(path.join(GDOCS, "main.mjs"), "utf8"));
}

/** Every file's bytes under `dir`, for a search. */
function bytesUnder(dir: string): Array<[string, Buffer]> {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = path.join(e.parentPath, e.name);
      return [path.relative(dir, full), readFileSync(full)] as [string, Buffer];
    });
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Rows of a query over the town's database, read as a separate process reads the file. */
function db(data: string, sql: string): Array<Record<string, unknown>> {
  const script = `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1]); db.exec("PRAGMA busy_timeout = 5000");
    process.stdout.write(JSON.stringify(db.prepare(process.argv[2]).all()));`;
  const r = spawnSync(process.execPath, ["--no-warnings", "-e", script, path.join(data, "town.db"), sql], { encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as Array<Record<string, unknown>>;
}

/** The criterion: every grant at a shop with needs, whatever its state, a person made, by grant new or by a permit. */
function expectNoGrantAtNeedsNoPersonMade(data: string, step: string): void {
  for (const g of db(data, "SELECT g.id, g.source, g.shop FROM grants g JOIN shops s ON s.name = g.shop WHERE json_array_length(json_extract(s.manifest, '$.credentials')) > 0")) {
    expect(g.source === null || /^permit prm_[0-9a-f]{16}$/.test(String(g.source)), `${step}: ${g.id} at ${g.shop} source ${g.source}`).toBe(true);
  }
}

function rowOf(table: string, first: string): string {
  const row = table.split("\n").find((l) => l.startsWith(first));
  expect(row, `${first} in\n${table}`).toBeDefined();
  return row!;
}

/** The `to do:` lines of `permit show`, without their done marks, each with whether it is marked. */
function todoLines(shown: string): Array<{ done: boolean; line: string }> {
  const at = shown.indexOf("to do:\n");
  expect(at, shown).toBeGreaterThan(0);
  return shown.slice(at + "to do:\n".length).trimEnd().split("\n").map((l) => ({ done: l.startsWith("  done  "), line: l.slice(8) }));
}

/** A town with memory, dimitri, and a pass holding the hall whole and memory at remember, recall, and list; the agent's directory with its grant and the figma shop over the fake origin. */
async function consentTown(root: string): Promise<{ town: Town; data: string; a: Agent; passId: string; token: string }> {
  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "dimitri", "--label", "the agent");
  const passId = pass.stderr.trim();
  expect(town.admin("grant", "new", "--pass", passId, "--shop", "town/hall").exit).toBe(0);
  expect(town.admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  writeFigma(a, "figma", (m) => m);
  return { town, data, a, passId, token: JSON.parse(pass.stdout).token as string };
}

/** The fixture shop written into the agent's directory, its origin the fake origin's, the manifest changed by `edit`. */
function writeFigma(a: Agent, dir: string, edit: (manifest: string) => string): void {
  mkdirSync(path.join(a.dir, dir), { recursive: true });
  writeFileSync(path.join(a.dir, dir, "manifest.yaml"), edit(readFileSync(path.join(FIGMA, "manifest.yaml"), "utf8").replace("http://127.0.0.1:9", origin.url)));
  writeFileSync(path.join(a.dir, dir, "main.mjs"), readFileSync(path.join(FIGMA, "main.mjs"), "utf8"));
}

const send = (a: Agent, dir: string, command: string) => typed(a, `tar --format ustar -cf - -C ${dir} . | town hall ${command}`);
const WAIT = "tests wait: dimitri/figma needs figma, which no grant of yours binds; they run when a person approves your permit\n";

it("walks consent's journey 1 steps 1 to 6 and journey 2 steps 1 to 4: a type proposed with the shop, the permit that waits, and the operator's checklist to the grant", async () => {
  const root = tmp("consent-journey");
  made.push(root);
  const { town, data, a, passId, token } = await consentTown(root);
  const said: Ran[] = [];
  const say = (r: Ran) => (said.push(r), r);
  const url = origin.url;

  // Journey 1 step 1: §8 says a need may define its type, with guidance, matching a held one, and never a registration.
  const spec = say(typed(a, "town hall spec")).stdout;
  const eight = spec.split("## 8. ")[1]!.split("## 9. ")[0]!;
  for (const word of ["origin", "header", "guidance", "oauth", "exactly as the town", "a proposal", "a registration is the operator's"]) expect(eight, word).toContain(word);

  // Step 2: validate says ok; guidance naming another host, a held type moved, and a registration are refused.
  expect(say(send(a, "figma", "validate"))).toEqual({ stdout: "ok dimitri/figma 0.1.0: file, comments\n", stderr: "", exit: 0 });
  writeFigma(a, "elsewhere", (m) => m.replace("and paste it.", "and paste it at https://paste.example.com/figma."));
  expect(say(send(a, "elsewhere", "validate"))).toEqual({ stdout: "credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)\n", stderr: "", exit: 1 });
  writeFigma(a, "bare", (m) => m.replace("and paste it.", "and paste it at paste.example.com."));
  expect(say(send(a, "bare", "validate")).stdout).toBe("credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)\n");
  writeFigma(a, "moved", (m) => m.replace("type: figma", "type: github-token").replace(`origin: ${url}`, "origin: https://api.figma.com"));
  expect(say(send(a, "moved", "validate")).stdout).toBe("credentials[0]: github-token is a type this town holds, at https://api.github.com in Authorization; leave the definition out, or write that (spec §8)\n");
  writeFigma(a, "registered", (m) => m.replace("    guidance:", "    oauth: { authorize: https://www.figma.com/oauth, token: https://api.figma.com/v1/oauth/token, scopes: [file_read], client_id: abc }\n    guidance:"));
  expect(say(send(a, "registered", "validate")).stdout).toMatch(/^credentials\[0\]\.oauth\.client_id: is a registration, which is the operator's and never a manifest's; .* \(spec §8\)\n$/);

  // Step 3: test waits, exit 0, and nothing in the town changed.
  // The grants as rows: `grant ls` also says when each was last used, which the hall's own call changes.
  const town_ = () => [...["shop ls", "type ls", "permit ls", "credential ls"].map((v) => town.admin(...v.split(" ")).stdout), db(data, "SELECT * FROM grants ORDER BY id")];
  const before = town_();
  expect(say(send(a, "figma", "test"))).toEqual({ stdout: WAIT, stderr: "", exit: 0 });
  expect(town_()).toEqual(before);
  expectNoGrantAtNeedsNoPersonMade(data, "test");

  // Step 4: publish waits and asks; help does not list the shop; requests and show say the need and the shop's guidance.
  const published = say(send(a, "figma", "publish"));
  const first = /requested (prm_[0-9a-f]{16}),/.exec(published.stdout)?.[1];
  expect(published).toEqual({ stdout: `${WAIT}published dimitri/figma 0.1.0; it needs figma, so a person decides at the box: requested ${first}, and town --help shows the answer\n`, stderr: "", exit: 0 });
  expect(say(typed(a, "town --help")).stdout).not.toContain("dimitri/figma");
  const requests = say(typed(a, "town hall requests")).stdout;
  expect(rowOf(requests, first!)).toMatch(new RegExp(`\\spending\\s+figma: proposed \\(${url.replace(/[.]/g, "\\.")}\\), none connected$`));
  expect(requests.endsWith(`\ndimitri/figma says: ${GUIDANCE}\n`)).toBe(true);
  const shown = say(typed(a, "town hall show --shop dimitri/figma")).stdout;
  expect(shown).toMatch(/^dimitri\/figma: Reads Figma documents/);
  expect(shown).toContain("  town dimitri/figma file --key <string>\n");
  expect(shown.endsWith(`needs figma (none connected)\ndimitri/figma says: ${GUIDANCE}\n`)).toBe(true);
  expect(db(data, "SELECT detail FROM calls WHERE shop = 'town/hall' AND command = 'publish'")).toEqual([{ detail: `published dimitri/figma 0.1.0; requested ${first}` }]);
  expectNoGrantAtNeedsNoPersonMade(data, "publish");

  // Step 5: the origin moved is refused naming what the town holds; a new command replaces the shop and the permit, now at three.
  writeFigma(a, "v2", (m) => m.replace(`origin: ${url}`, `origin: ${url}/v2`));
  expect(say(send(a, "v2", "publish"))).toEqual({ stdout: `credentials[0]: figma is a type this town holds, at ${url} in X-Figma-Token; leave the definition out, or write that (spec §8)\n`, stderr: "", exit: 1 });
  writeFigma(a, "figma", (m) => m.replace("tests:", "  - name: environment\n    summary: Print the environment the shop was given.\n    effect: read\n    output: json\ntests:"));
  const again = say(send(a, "figma", "publish"));
  expect(again.exit, again.stdout).toBe(0);
  const permit = /requested (prm_[0-9a-f]{16}),/.exec(again.stdout)![1]!;
  expect(permit).not.toBe(first);

  // Journey 2 step 1: type ls shows the proposal; credential add at it is refused.
  const types = town.admin("type", "ls").stdout;
  expect(rowOf(types, "github-token")).toMatch(/^github-token\s+token\s+held\s+-\s+https:\/\/api\.github\.com\s+Authorization: Bearer \{token\}\s/);
  expect(rowOf(types, "figma")).toMatch(new RegExp(`^figma\\s+token\\s+proposed\\s+dimitri/figma\\s+${url.replace(/[.]/g, "\\.")}\\s+X-Figma-Token: \\{token\\}\\s`));
  expect(atBox(town, `printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type figma`)).toEqual({
    stdout: "",
    stderr: "townd admin: type figma is proposed by dimitri/figma and not yet the town's; townd admin type approve figma makes it so\n",
    exit: 1,
  });

  // Step 2: permit ls with needs; permit show the checklist, none done; permit approve typed first refused with the same three lines.
  expect(rowOf(atBox(town, "townd admin permit ls").stdout, permit)).toMatch(new RegExp(`^${permit}\\s+${passId}\\s+dimitri\\s+dimitri/figma\\s+file,comments,environment\\s+-\\s+published dimitri/figma 0\\.1\\.0\\s+\\S+\\s+pending\\s+figma: proposed \\(${url.replace(/[.]/g, "\\.")}\\), none connected$`));
  const checklist = atBox(town, `townd admin permit show ${permit}`);
  expect(checklist.exit, checklist.stderr).toBe(0);
  expect(checklist.stdout).toContain(`dimitri/figma: Reads Figma documents and what people said on them, for consent's tests.\nneeds:\n  figma: proposed, token, sent to ${url} in X-Figma-Token: {token}\n    dimitri/figma says: ${GUIDANCE}\n    none connected\n`);
  const todo = todoLines(checklist.stdout);
  expect(todo).toEqual([
    { done: false, line: "townd admin type approve figma" },
    { done: false, line: `printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type figma --label figma` },
    { done: false, line: `townd admin permit approve ${permit}  # runs dimitri/figma's 1 test on it first` },
  ]);
  const typedFirst = atBox(town, todo[2]!.line);
  expect(typedFirst.exit).toBe(1);
  expect(typedFirst.stderr).toBe(`townd admin: permit approve refused: figma is proposed and not yet the town's; townd admin type approve figma first\ntownd admin: ${permit} is still pending\nto do:\n${todo.map((t) => `        ${t.line}\n`).join("")}`);
  expect(origin.seen()).toEqual([]);

  // Step 3: the first line as printed approves the type, printing what it is; the checklist marks it; approve is refused with vault's line and the two that remain.
  expect(atBox(town, todo[0]!.line)).toEqual({ stdout: `figma: a token type, sent to ${url} in X-Figma-Token: {token}\ndimitri/figma says: ${GUIDANCE}\napproved figma, proposed by dimitri/figma; it is the town's\n`, stderr: "", exit: 0 });
  expect(todoLines(atBox(town, `townd admin permit show ${permit}`).stdout).map((t) => t.done)).toEqual([true, false, false]);
  const noCredential = atBox(town, todo[2]!.line);
  expect(noCredential.stderr).toBe(`townd admin: permit approve refused: user dimitri holds no figma credential; add one with townd admin credential add --user dimitri --type figma\ntownd admin: ${permit} is still pending\nto do:\n        ${todo[1]!.line}\n        ${todo[2]!.line}\n`);

  // Step 4: the second line as printed: the guidance on stderr before the token is read, the id on stdout; approve runs the tests through a teller, then makes the grant.
  const added = atBox(town, todo[1]!.line);
  expect(added.exit, added.stderr).toBe(0);
  expect(added.stderr).toBe(`dimitri/figma says: ${GUIDANCE}\n`);
  expect(added.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
  const cred = added.stdout.trim();
  expect(todoLines(atBox(town, `townd admin permit show ${permit}`).stdout).map((t) => t.done)).toEqual([true, true, false, false, false]);
  const approved = atBox(town, todo[2]!.line);
  expect(approved.exit, approved.stderr).toBe(0);
  expect(approved.stdout).toMatch(/^ok a file answers\ngrant_[0-9a-f]{16}\n$/);
  const grant = approved.stdout.trim().split("\n").at(-1)!;
  expect(rowOf(atBox(town, "townd admin grant ls").stdout, grant)).toMatch(new RegExp(`^${grant}\\s+${passId}\\s+dimitri/figma\\s+file,comments,environment\\s+permit ${permit}\\s+-\\s+figma=${cred}\\s+-\\s+live\\s`));
  expect(origin.seen().map((s) => [s.method, s.url, s.headers["x-figma-token"]])).toEqual([["GET", "/v1/files/fixture", TOKEN]]);
  const approval = db(data, `SELECT call_id FROM calls WHERE parent IS NULL AND detail = 'approval ${permit} tests 1/1'`);
  expect(approval).toHaveLength(1);
  const tree = atBox(town, `townd admin audit --call ${approval[0]!.call_id}`);
  expect(tree.stdout.trimEnd().split("\n").slice(1).map((l) => /^( *)(call_[0-9a-f]{16})\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l)!.slice(1))).toEqual([
    ["", approval[0]!.call_id, "-", "dimitri/figma", "-"],
    ["  ", expect.stringMatching(/^call_/), "-", "dimitri/figma", "file"],
  ]);
  expect(db(data, "SELECT wall, credentials FROM calls WHERE parent = ?".replace("?", `'${approval[0]!.call_id}'`))).toEqual([{ wall: "seatbelt", credentials: '[{"type":"figma","requests":1}]' }]);
  expectNoGrantAtNeedsNoPersonMade(data, "approve");

  // Journey 1 step 6: help lists the shop; requests says approved; a call reaches the origin signed; the entry sees an address and no token.
  expect(say(typed(a, "town --help")).stdout).toMatch(/^dimitri\/figma\s+Reads Figma documents and what people said on them, for consent's tests\. \[file, comments, environment\]$/m);
  expect(rowOf(say(typed(a, "town hall requests")).stdout, permit)).toMatch(new RegExp(`\\sapproved as ${grant}\\s+figma: connected$`));
  expect(say(typed(a, "town figma file --key abc123"))).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  expect(origin.seen().at(-1)).toMatchObject({ method: "GET", url: "/v1/files/abc123", headers: { "x-figma-token": TOKEN } });
  // The shop's own output, not the town's words: its state directory is in it by the contract, so it is not among what the criteria read.
  const environment = typed(a, "town figma environment");
  expect(environment.exit, environment.stderr).toBe(0);
  const env = JSON.parse(environment.stdout) as Record<string, string>;
  process.stdout.write(`the figma shop's environment, printed once: names ${Object.keys(env).join(", ")}; TOWN_CREDENTIAL_FIGMA=${env.TOWN_CREDENTIAL_FIGMA}\n`);
  expect(env.TOWN_CREDENTIAL_FIGMA).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\S*$/);
  expect(env.TOWN_CREDENTIAL_FIGMA!.startsWith(url)).toBe(false);
  expect(environment.stdout).not.toContain(TOKEN);

  // The criteria: nothing the agent was told names a credential's id, the data directory, or a path on the box, nor the token; every word about where a secret is made is the shop's.
  for (const r of said) {
    for (const word of [TOKEN, token, cred, data, root, a.dir, os.homedir()]) expect(r.stdout + r.stderr, word).not.toContain(word);
    for (const line of (r.stdout + r.stderr).split("\n").filter((l) => l.includes("Settings > Security"))) expect(line.startsWith("dimitri/figma says: ") || line.includes("guidance: ")).toBe(true);
  }
  expectNoGrantAtNeedsNoPersonMade(data, "the end");
}, 240_000);

it("walks consent's journey 2 step 8: a held type is not removed under a credential, credential rm names the grant it ends, and a proposed type no shop names is removed", async () => {
  const root = tmp("consent-removal");
  made.push(root);
  const { town, data, a } = await consentTown(root);
  const published = send(a, "figma", "publish");
  const permit = /requested (prm_[0-9a-f]{16}),/.exec(published.stdout)![1]!;
  const todo = todoLines(atBox(town, `townd admin permit show ${permit}`).stdout);
  for (const t of todo) expect(atBox(town, t.line).exit, t.line).toBe(0);
  const grant = db(data, `SELECT grant_id FROM permits WHERE id = '${permit}'`)[0]!.grant_id as string;
  const cred = db(data, "SELECT id FROM credentials WHERE type = 'figma'")[0]!.id as string;

  expect(atBox(town, "townd admin type rm figma")).toEqual({ stdout: "", stderr: `townd admin: type figma is held by a credential (${cred}); remove it with townd admin credential rm first\n`, exit: 1 });
  expect(atBox(town, `townd admin credential rm ${cred}`)).toEqual({ stdout: `revoked ${cred}\n${grant} at dimitri/figma is no longer live\n`, stderr: "", exit: 0 });
  expect(typed(a, "town --help").stdout).not.toContain("dimitri/figma");

  writeFigma(a, "sketch", (m) => m.replace("name: dimitri/figma", "name: dimitri/sketch").replace("type: figma", "type: sketch").replace("X-Figma-Token", "X-Sketch-Token"));
  writeFileSync(path.join(a.dir, "sketch", "main.mjs"), readFileSync(path.join(a.dir, "sketch", "main.mjs"), "utf8").replace("TOWN_CREDENTIAL_FIGMA", "TOWN_CREDENTIAL_SKETCH"));
  expect(send(a, "sketch", "publish").exit).toBe(0);
  expect(atBox(town, "townd admin type rm sketch").stderr).toBe("townd admin: type sketch is proposed and named by a shop (dimitri/sketch); remove it with townd admin shop rm first\n");
  expect(atBox(town, "townd admin shop rm dimitri/sketch").exit).toBe(0);
  expect(atBox(town, "townd admin type rm sketch")).toEqual({ stdout: "removed sketch\n", stderr: "", exit: 0 });
  expect(atBox(town, "townd admin type ls").stdout).not.toMatch(/^sketch\s/m);
  expectNoGrantAtNeedsNoPersonMade(data, "removal");
}, 120_000);

it("the checklist is enough: given a permit, the lines permit show printed, typed as printed in order and nothing else, end with the grant", async () => {
  const root = tmp("consent-checklist");
  made.push(root);
  const { town, data, a, passId } = await consentTown(root);
  const published = send(a, "figma", "publish");
  const permit = /requested (prm_[0-9a-f]{16}),/.exec(published.stdout)?.[1];
  expect(permit, published.stdout + published.stderr).toBeDefined();

  // The operator reads permit show once, and types what it printed under `to do:`, as printed, and nothing else.
  const lines = todoLines(atBox(town, `townd admin permit show ${permit}`).stdout);
  const typedLines: string[] = [];
  for (const { line } of lines) {
    const r = atBox(town, line);
    typedLines.push(`${line}\n  -> exit ${r.exit}: ${r.stdout}${r.stderr}`);
  }
  const grants = db(data, `SELECT source, credentials, revoked_at FROM grants WHERE shop = 'dimitri/figma' AND pass_id = '${passId}'`);
  expect(grants, typedLines.join("\n")).toEqual([{ source: `permit ${permit}`, credentials: expect.stringMatching(/^\{"figma":"credential_[0-9a-f]{16}"\}$/), revoked_at: null }]);
  expect(typed(a, "town --help").stdout).toMatch(/^dimitri\/figma\s/m);
  expect(typed(a, "town figma file --key checklist")).toMatchObject({ exit: 0, stdout: "200\nhello from the origin" });
}, 120_000);

it("walks consent's journey 2 step 7: shop add of gdocs over the fakes holds google-oauth with the registration, is refused naming connect, and after a consent adds the shop, whose read a grant answers", async () => {
  const root = tmp("consent-gdocs-add");
  made.push(root);
  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  await fakes.control({ mode: "ok", rotate: false, withRefreshToken: true, authorizeError: null, expiresIn: 3600, tokenDelayMs: 0 });
  const eventsBefore = fakes.events().length;
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const dir = path.join(root, "gdocs");
  writeGdocs(dir, "town/gdocs");
  const said: Ran[] = [];
  const box = (line: string) => {
    const r = atBox(town, line);
    said.push(r);
    return r;
  };

  // The first add: the type held as the manifest defines it, with the registration; refused for the credential, naming connect.
  const first = box(`printf '%s\\n' "$CLIENT_SECRET" | townd admin shop add ${dir} --user dimitri --client-id "$CLIENT_ID"`);
  expect(first).toEqual({
    exit: 1,
    stdout: `held google-oauth, as town/gdocs defines it: an oauth type sent to ${fakes.docs} in Authorization: Bearer {token}\ngoogle-oauth: consent at ${fakes.auth}/authorize, tokens from ${fakes.auth}/token, scopes ${SCOPE}, with client ${CLIENT_ID} and its secret sealed\ntown/gdocs says: ${GDOCS_GUIDANCE}\n`,
    stderr: "townd admin: shop add refused: user dimitri holds no google-oauth credential; google-oauth stays held, as town/gdocs defines it, so connect one with townd admin credential connect --user dimitri --type google-oauth, then shop add again\n",
  });
  expect(rowOf(box("townd admin type ls").stdout, "google-oauth")).toMatch(new RegExp(`^google-oauth\\s+oauth\\s+held\\s+town/gdocs\\s+${esc(fakes.docs)}\\s`));
  expect(box("townd admin shop ls").stdout).not.toContain("town/gdocs");

  // The consent, the redirect delivered by the test.
  let browser: { status: number; body: string } | null = null;
  const connected = await atBoxWaiting(town, "townd admin credential connect --user dimitri --type google-oauth", async (url) => {
    browser = await consentIn(url);
  });
  said.push(connected);
  expect(connected.exit, connected.stderr).toBe(0);
  expect(browser).toEqual({ status: 200, body: "connected; you can close this tab\n" });
  expect(connected.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
  const cred = connected.stdout.trim();

  // The same add: the one test through a teller on the access token, against the fake docs origin, signed; the shop added.
  expect(box(`townd admin shop add ${dir} --user dimitri`)).toEqual({ exit: 0, stdout: "ok a missing document fails\nadded town/gdocs 0.1.0\n", stderr: "" });
  expect(fakes.events().slice(eventsBefore).filter((e) => e.kind === "docs").map((e) => [e.url, e.status, e.authorization])).toEqual([["/v1/documents/no-such-document", 404, true]]);

  // A pass and a grant; the read prints the document's text; credential ls shows the scopes and no value.
  const pass = town.admin("pass", "new", "--user", "dimitri", "--label", "the reader");
  expect(town.admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "town/gdocs").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  const read = typed(a, "town gdocs read --doc-id fixture-doc");
  expect(read).toEqual({ stdout: "The fixture\nThe first line of the fixture.\nA heading\nSome bold words.\n", stderr: "", exit: 0 });
  const ls = box("townd admin credential ls");
  expect(rowOf(ls.stdout, cred)).toMatch(new RegExp(`^${cred}\\s+dimitri\\s+google-oauth\\s+google-oauth\\s+\\S+\\s+active\\s+${esc(SCOPE)}\\s+grant_[0-9a-f]{16}$`));

  // No token, code, or secret in anything printed or in the data directory.
  const secrets = [...fakes.secrets(), CLIENT_SECRET];
  expect(secrets.filter((x) => /^fake-(access|refresh|code)-/.test(x))).toHaveLength(3);
  for (const r of [...said, read]) for (const secret of secrets) expect(r.stdout + r.stderr, secret).not.toContain(secret);
  for (const [file, bytes] of bytesUnder(data)) for (const secret of secrets) expect(bytes.includes(Buffer.from(secret)), `${file} holds ${secret}`).toBe(false);
}, 180_000);

it("walks consent's journey 2 steps 5, 6, and 9 and journey 3 steps 1 to 6: an oauth type the agent proposed, approved and connected as the checklist prints, refreshed when the town's clock moves an hour, a 500 and invalid_grant at refresh, and the prying entry on the oauth type", async () => {
  const root = tmp("consent-oauth");
  made.push(root);
  const { data, a, token } = await consentTown(root);
  let town = towns.at(-1)!;
  await fakes.control({ mode: "ok", rotate: false, withRefreshToken: true, authorizeError: null, expiresIn: 3600, tokenDelayMs: 0 });
  const eventsBefore = fakes.events().length;
  const events = () => fakes.events().slice(eventsBefore);
  const refreshes = () => events().filter((e) => e.kind === "refresh").map((e) => (e.ok ? "ok" : `${e.status}`));
  const said: Ran[] = [];
  const say = (r: Ran) => (said.push(r), r);
  const box = (line: string) => say(atBox(town, line));
  /** The town served again over the same data directory, its clock moved `offset` milliseconds, and the agent's grant file pointed at it. */
  const moveClock = async (offset: number) => {
    await town.stop();
    town = await serve(data, { env: { TOWN_TEST_CLOCK_OFFSET_MS: String(offset) } });
    towns.push(town);
    a.writeGrant(JSON.stringify({ town: town.url, token }));
  };

  // Journey 2 step 5: the agent publishes a shop proposing google-oauth; type ls shows it with its endpoints and scopes.
  writeGdocs(path.join(a.dir, "gdocs"), "dimitri/gdocs");
  const published = say(send(a, "gdocs", "publish"));
  const permit = /requested (prm_[0-9a-f]{16}),/.exec(published.stdout)?.[1];
  expect(permit, published.stdout + published.stderr).toBeDefined();
  expect(rowOf(box("townd admin type ls").stdout, "google-oauth")).toMatch(new RegExp(`^google-oauth\\s+oauth\\s+proposed\\s+dimitri/gdocs\\s+${esc(fakes.docs)}\\s+Authorization: Bearer \\{token\\}\\s+\\S+\\s+${esc(fakes.auth)}/authorize ${esc(fakes.auth)}/token ${esc(SCOPE)}$`));
  expect(box("townd admin type approve google-oauth")).toEqual({ exit: 1, stdout: "", stderr: "townd admin: type google-oauth is an oauth type and needs its registration; write --client-id <id>, with the client secret on stdin\n" });

  // The checklist: the registration from the shell's names, the consent, the approval; typed as printed.
  const todo = todoLines(box(`townd admin permit show ${permit}`).stdout);
  expect(todo).toEqual([
    { done: false, line: `printf '%s\\n' "$CLIENT_SECRET" | townd admin type approve google-oauth --client-id "$CLIENT_ID"` },
    { done: false, line: "townd admin credential connect --user dimitri --type google-oauth --label google-oauth" },
    { done: false, line: `townd admin permit approve ${permit}  # runs dimitri/gdocs's 1 test on it first` },
  ]);
  const approvedType = box(todo[0]!.line);
  expect(approvedType.exit, approvedType.stderr).toBe(0);
  expect(approvedType.stdout.trimEnd().split("\n").at(-1)).toBe(`approved google-oauth, proposed by dimitri/gdocs; it is the town's, with client ${CLIENT_ID} and its secret sealed`);
  expect(box(`printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type google-oauth`)).toEqual({
    exit: 1,
    stdout: "",
    stderr: "townd admin: type google-oauth is an oauth type, connected in a browser and never pasted; townd admin credential connect --user dimitri --type google-oauth connects one\n",
  });

  // Journey 2 step 6, refused at the provider: the provider's error, exit 1, nothing written. Left alone: exit 1 the same.
  await fakes.control({ authorizeError: "access_denied" });
  let refusedBrowser: { status: number; body: string } | null = null;
  const refused = say(await atBoxWaiting(town, todo[1]!.line, async (url) => void (refusedBrowser = await consentIn(url))));
  expect([refused.exit, refused.stdout, refused.stderr.trimEnd().split("\n").at(-1)]).toEqual([1, "", "townd admin: credential connect refused: google-oauth answered access_denied at consent; nothing was written"]);
  expect(refusedBrowser).toEqual({ status: 200, body: "not connected; the terminal says why\n" });
  await fakes.control({ authorizeError: null });
  let aloneAt = "";
  const alone = say(await atBoxWaiting(town, `${todo[1]!.line} --timeout 2s`, async (_url, redirect) => void (aloneAt = redirect)));
  expect([alone.exit, alone.stdout, alone.stderr.trimEnd().split("\n").at(-1)]).toEqual([1, "", "townd admin: credential connect refused: no redirect came within 2s; nothing was written"]);
  expect(await fetch(aloneAt).then(() => "answered", () => "refused")).toBe("refused");
  expect(box("townd admin credential ls").stdout).not.toContain("google-oauth");

  // Journey 2 step 6 and journey 3 steps 5 and 6: the guidance, then one URL; only the right state is answered; the browser's line; the id; the port refuses after.
  const checked: Array<[string, unknown]> = [];
  let redirectAt = "";
  const connected = say(
    await atBoxWaiting(town, todo[1]!.line, async (url, redirect) => {
      redirectAt = redirect;
      const u = new URL(url);
      checked.push(["params", [u.searchParams.get("response_type"), u.searchParams.get("code_challenge_method"), u.searchParams.get("scope"), u.searchParams.get("redirect_uri"), Buffer.from(u.searchParams.get("state")!, "base64url").length]]);
      const location = await browse(url);
      const wrong = new URL(location);
      wrong.searchParams.set("state", "a-state-of-someone-else");
      for (const [label, target] of [["wrong state", wrong.toString()], ["another path", location.replace(redirect, `${redirect}elsewhere`)]] as const) {
        const res = await fetch(target);
        checked.push([label, [res.status, await res.text()]]);
      }
      const res = await fetch(location);
      checked.push(["redirect", [res.status, await res.text()]]);
    }),
  );
  expect(connected.exit, connected.stderr).toBe(0);
  expect(checked).toEqual([
    ["params", ["code", "S256", SCOPE, redirectAt, 16]],
    ["wrong state", [404, ""]],
    ["another path", [404, ""]],
    ["redirect", [200, "connected; you can close this tab\n"]],
  ]);
  const printed = connected.stderr.trimEnd().split("\n");
  expect(printed[0]).toBe(`dimitri/gdocs says: ${GDOCS_GUIDANCE}`);
  expect(printed[1]).toBe(`open this URL in a browser to connect google-oauth for dimitri; the redirect comes back to ${redirectAt} within 5m:`);
  expect(printed).toHaveLength(3);
  expect(connected.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
  const cred = connected.stdout.trim();
  expect(await fetch(redirectAt).then(() => "answered", () => "refused")).toBe("refused");
  expect(rowOf(box("townd admin credential ls").stdout, cred)).toMatch(new RegExp(`\\sgoogle-oauth\\s+google-oauth\\s+\\S+\\s+active\\s+${esc(SCOPE)}\\s+-$`));

  // The approval, as printed: the test through a teller on the access token, the grant made.
  const approved = box(todo[2]!.line);
  expect(approved.exit, approved.stderr).toBe(0);
  expect(approved.stdout).toMatch(/^ok a missing document fails\ngrant_[0-9a-f]{16}\n$/);

  // Journey 3 step 2: with the hour ahead, a call refreshes nothing.
  const TEXT = "The fixture\nThe first line of the fixture.\nA heading\nSome bold words.\n";
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc"))).toEqual({ stdout: TEXT, stderr: "", exit: 0 });
  expect(refreshes()).toEqual([]);

  // Journey 3 step 3: the prying entry published on the oauth type, approved, and run walled; nothing it printed holds a token or the secret.
  const pryDir = path.join(a.dir, "prying");
  mkdirSync(pryDir);
  writeFileSync(path.join(pryDir, "manifest.yaml"), readFileSync(path.join(ROOT, "test/fixtures/prying/manifest.yaml"), "utf8").replace("name: test/prying", "name: dimitri/prying").replace("type: test-origin", "type: google-oauth"));
  // Its copy asks a public origin only when told to, so nothing it runs here leaves loopback, its tests included.
  writeFileSync(path.join(pryDir, "main.mjs"), readFileSync(path.join(ROOT, "test/fixtures/prying/main.mjs"), "utf8").replace("given.public !== false", "given.public === true"));
  const pryPermit = /requested (prm_[0-9a-f]{16}),/.exec(say(send(a, "prying", "publish")).stdout)![1]!;
  const pryTodo = todoLines(box(`townd admin permit show ${pryPermit}`).stdout);
  expect(pryTodo.map((t) => [t.done, t.line])).toEqual([
    [true, todo[0]!.line],
    [true, todo[1]!.line],
    [false, "or, to use a new secret instead:"],
    [false, `${todo[1]!.line} --replace ${cred}`],
    [false, `townd admin permit approve ${pryPermit}  # runs dimitri/prying's 1 test on it first`],
  ]);
  expect(box(pryTodo[4]!.line).exit).toBe(0);
  const pried = typed(a, `printf '%s' '{"public": false}' | town prying pry`);
  expect(pried.exit, pried.stderr).toBe(0);
  const probes = pried.stdout.trim().split("\n").map((l) => JSON.parse(l) as { act: string; target: string; result: string });
  expect(probes.find((p) => p.act === "read" && p.target.endsWith("vault.key"))!.result).toBe("EPERM");
  expect(probes.find((p) => p.act === "read" && p.target.endsWith("town.db"))!.result).toBe("EPERM");
  const beforeRefresh = [...fakes.secrets(), CLIENT_SECRET];
  const issuedHere = [...new Set(events().flatMap((e) => e.tokens ?? []))];
  expect([issuedHere.filter((x) => x.startsWith("fake-access-")).length, issuedHere.filter((x) => x.startsWith("fake-refresh-")).length]).toEqual([1, 1]);
  for (const secret of beforeRefresh) expect(pried.stdout + pried.stderr, `the prying entry printed ${secret}`).not.toContain(secret);
  console.log(`consent: the prying entry, walled on google-oauth, printed ${probes.length} probes and none of ${beforeRefresh.length} tokens and secrets`);

  // Journey 2 step 9 and journey 3 step 2: the town's clock an hour on; the call refreshes first, rotating, and says so; the next does not.
  await fakes.control({ rotate: true });
  await moveClock(3_660_000);
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc"))).toEqual({ stdout: TEXT, stderr: "", exit: 0 });
  expect(refreshes()).toEqual(["ok"]);
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc")).exit).toBe(0);
  expect(refreshes()).toEqual(["ok"]);
  const audit = box("townd admin audit --shop dimitri/gdocs").stdout.trimEnd().split("\n");
  expect(audit.at(-2)).toMatch(/\sread\s+[0-9a-f]{64}\s+ok\s+0\s+0\s+\d+\s+-\s+google-oauth:1\s+call_[0-9a-f]{16}\s+-\s+seatbelt\s+refreshed google-oauth$/);
  expect(audit.at(-1)).toMatch(/\sread\s+[0-9a-f]{64}\s+ok\s+0\s+0\s+\d+\s+-\s+google-oauth:1\s+call_[0-9a-f]{16}\s+-\s+seatbelt\s+-$/);
  expect(box("townd admin audit").stdout).toMatch(/^\S+\s+-\s+-\s+-\s+[0-9a-f]{64}\s+ok\s+0\s+-\s+\d+\s+-\s+-\s+call_[0-9a-f]{16}\s+-\s+-\s+connected google-oauth for dimitri in \d+s$/m);

  // Journey 3 step 4, a 500: the call's shop-error with the status, the credential standing; the next call tries again, on the rotated token.
  await fakes.control({ mode: "500" });
  await moveClock(2 * 3_600_000 + 120_000);
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc"))).toEqual({ stdout: "", stderr: "error: dimitri/gdocs read failed\n", exit: 1 });
  expect(box("townd admin audit --shop dimitri/gdocs").stdout.trimEnd().split("\n").at(-1)).toMatch(/\sread\s+[0-9a-f]{64}\s+shop-error\s+1\s+-\s+\d+\s+-\s+-\s+call_[0-9a-f]{16}\s+-\s+-\s+refresh google-oauth failed: 500$/);
  expect(rowOf(box("townd admin credential ls").stdout, cred)).toMatch(/\sactive\s/);
  await fakes.control({ mode: "ok" });
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc"))).toEqual({ stdout: TEXT, stderr: "", exit: 0 });
  expect(refreshes()).toEqual(["ok", "500", "ok"]);

  // Journey 3 step 4, invalid_grant: denied in the design's words, the credential revoked with why, and help without the shop.
  await fakes.control({ mode: "invalid_grant" });
  await moveClock(3 * 3_600_000 + 240_000);
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc"))).toEqual({ stdout: "", stderr: "error: command 'gdocs read' is not available to this grant: its google-oauth credential needs connecting again at the box\n", exit: 2 });
  expect(say(typed(a, "town --help")).stdout).not.toMatch(/dimitri\/(gdocs|prying)/);
  expect(rowOf(box("townd admin credential ls").stdout, cred)).toMatch(/\srevoked \(refresh refused\)\s/);
  expect(say(typed(a, "town gdocs read --doc-id fixture-doc")).stderr).toBe("error: command 'gdocs read' is not available to this grant\n");
  expect(refreshes()).toEqual(["ok", "500", "ok", "400"]);

  // Journey 3 step 1 and the criteria: no token, code, or secret in anything printed, the audit, or the data directory, town.db and its WAL included.
  const secrets = [...fakes.secrets(), CLIENT_SECRET];
  expect(secrets.filter((x) => x.startsWith("fake-access-")).length).toBeGreaterThanOrEqual(4);
  const auditAll = box("townd admin audit");
  for (const r of [...said, auditAll]) for (const secret of secrets) expect(r.stdout + r.stderr, secret).not.toContain(secret);
  const files = bytesUnder(data);
  expect(files.map(([f]) => f)).toEqual(expect.arrayContaining(["town.db", "town.db-wal"]));
  for (const [file, bytes] of files) for (const secret of secrets) expect(bytes.includes(Buffer.from(secret)), `${file} holds ${secret}`).toBe(false);
  console.log(`consent: searched ${files.length} files under the data directory, town.db and town.db-wal among them, for ${secrets.length} tokens, codes, and the client secret: none found`);
}, 300_000);
