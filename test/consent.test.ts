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
// environment is printed once, an address and no token. No token and no
// network but loopback.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, ROOT, TOWN, TOWND, agent, assertBuilt, cleanEnv, cleanup, originProcess, serve, tmp, type Agent, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;
let shim: string;

const FIGMA = path.join(ROOT, "test/fixtures/figma-shop");
const TOKEN = "figma-consent-not-a-real-token";
const GUIDANCE = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
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
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

/** A line the agent types in its directory, with `town` on its PATH. */
function typed(a: Agent, line: string): Ran {
  const env = { ...cleanEnv(a.home), PATH: `${path.join(shim, "agent")}:${process.env.PATH}` };
  const r = spawnSync("/bin/sh", ["-c", line], { cwd: a.dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

/** A line the operator types at the box, as printed: `townd` on the PATH, the data directory in $TOWN_DATA, the token in $TOKEN. */
function atBox(town: Town, line: string): Ran {
  const env = { ...town.env, TOWN_DATA: town.dataDir, TOKEN, PATH: `${path.join(shim, "box")}:${process.env.PATH}` };
  const r = spawnSync("/bin/sh", ["-c", line], { cwd: os.tmpdir(), env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

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
  expect(todoLines(atBox(town, `townd admin permit show ${permit}`).stdout).map((t) => t.done)).toEqual([true, true, false]);
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
