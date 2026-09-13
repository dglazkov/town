// ring: command
// Consent's journey 4, typed, against a town this test starts: the token
// falls short. The fake origin runs as a process of its own told the one
// wide token, answering `comments` 403 for any other, and the fixture shop
// is test/fixtures/figma-shop at 0.1.0, whose guidance asks for one scope,
// then test/fixtures/figma-shop-0.2.0, asking for both, with a test of
// `comments`. A scripted agent in a directory with `.town/grant` and
// `town` on its PATH; the operator at the box typing `townd admin` lines
// through a shell with `townd` on its PATH, $TOWN_DATA set, and the token
// they made in $TOKEN. Steps 1 to 4, the operator typing only lines `permit
// show` printed, ending with `comments` answered; the criteria that no
// unrevoked grant reads a revoked credential and every grant that read the
// old one reads the new one otherwise unchanged, and that the words about
// where a secret is made are a shop's and name no host but the origin's;
// and step 5's refusals, each writing nothing. No network but loopback.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, ROOT, TOWN, TOWND, agent, assertBuilt, cleanEnv, cleanup, originProcess, serve, tmp, type Agent, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const NARROW = "figma-narrow-not-a-real-token";
const WIDE = "figma-wide-not-a-real-token";
const OLD_WORDS = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";
const NEW_WORDS = "Make a personal access token at Figma > Settings > Security, with file_content:read and file_comments:read, and paste it.";
const NOTES_WORDS = "Ask the design lead for a token made at Figma > Settings > Security.";
const INSTEAD = "or, to use a new secret instead:";

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;
let shim: string;

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess(["--wide", WIDE]);
  shim = tmp("replace-shim");
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

/** A line the operator types at the box, as printed, with the token they made in $TOKEN. */
function atBox(town: Town, line: string, token: string): Ran {
  const env = { ...town.env, TOWN_DATA: town.dataDir, TOKEN: token, PATH: `${path.join(shim, "box")}:${process.env.PATH}` };
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

/** The `to do:` lines of `permit show`, each with whether it is marked done, the mark taken off. */
function todoLines(shown: string): Array<{ done: boolean; line: string }> {
  const at = shown.indexOf("to do:\n");
  expect(at, shown).toBeGreaterThan(0);
  return shown.slice(at + "to do:\n".length).trimEnd().split("\n").map((l) => ({ done: l.startsWith("  done  "), line: l.slice(8) }));
}

/** A fixture shop written into the agent's directory under `dir`, its origin the fake's, its manifest changed by `edit`. */
function writeShop(a: Agent, fixture: string, dir: string, edit: (m: string) => string = (m) => m): void {
  mkdirSync(path.join(a.dir, dir), { recursive: true });
  writeFileSync(path.join(a.dir, dir, "manifest.yaml"), edit(readFileSync(path.join(ROOT, "test/fixtures", fixture, "manifest.yaml"), "utf8").replace("http://127.0.0.1:9", origin.url)));
  writeFileSync(path.join(a.dir, dir, "main.mjs"), readFileSync(path.join(ROOT, "test/fixtures", fixture, "main.mjs"), "utf8"));
}

const publish = (a: Agent, dir: string) => typed(a, `tar --format ustar -cf - -C ${dir} . | town hall publish`);
const grantRows = (data: string) => db(data, "SELECT id, pass_id, shop, commands, constraints, expires_at, source, credentials, revoked_at FROM grants ORDER BY id");

it("walks consent's journey 4 steps 1 to 5: comments refused on a narrow token, the guidance fixed by the shop's republish, a request, and the lines permit show printed, typed as printed, replacing the credential under its grants until comments answers", async () => {
  const root = tmp("replace-journey");
  made.push(root);
  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "dimitri").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "dimitri", "--label", "the agent");
  expect(town.admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "town/hall").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  const said: Ran[] = [];
  const say = (r: Ran) => (said.push(r), r);
  const box: Ran[] = [];
  const operator = (line: string, token: string) => {
    const r = atBox(town, line, token);
    box.push(r);
    return r;
  };

  // Journey 2 after step 4: dimitri/figma 0.1.0 published, its checklist typed as printed with the narrow token, the grant made.
  writeShop(a, "figma-shop", "figma");
  const first = say(publish(a, "figma"));
  const firstPermit = /requested (prm_[0-9a-f]{16}),/.exec(first.stdout)![1]!;
  for (const { line } of todoLines(operator(`townd admin permit show ${firstPermit}`, NARROW).stdout)) expect(operator(line, NARROW).exit, line).toBe(0);
  const credA = String(db(data, "SELECT id FROM credentials WHERE type = 'figma'")[0]!.id);
  const personGrant = String(db(data, `SELECT grant_id FROM permits WHERE id = '${firstPermit}'`)[0]!.grant_id);

  // Step 1: comments is exit 1 with the provider's 403 in the shop's words, the audit says shop-error; file answers.
  const refused = say(typed(a, "town figma comments --key abc"));
  expect(refused.exit).toBe(1);
  expect(refused.stdout).toBe('403\n{"status":403,"err":"Invalid scope(s). This endpoint requires the file_comments:read scope"}');
  expect(refused.stderr).toBe("error: dimitri/figma comments failed\n");
  expect(db(data, "SELECT result, detail FROM calls WHERE shop = 'dimitri/figma' AND command = 'comments' AND parent IS NULL")).toEqual([{ result: "shop-error", detail: null }]);
  expect(say(typed(a, "town figma file --key abc"))).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });

  // Step 2: the republish with both scopes: the type's words are the shop's 0.2.0's, the person's grant stands, and the line says how to ask.
  writeShop(a, "figma-shop-0.2.0", "figma2");
  const second = say(publish(a, "figma2"));
  expect(second).toEqual({
    stdout: `tests wait: dimitri/figma needs figma, which no grant of yours binds; they run when a person approves your permit\nthis pass's grant ${personGrant} at dimitri/figma was made by a person, so it stands as it is, and this publish asked for none; if the shop needs a new secret, town hall request --shop dimitri/figma asks a person\npublished dimitri/figma 0.2.0; figma's guidance is now dimitri/figma 0.2.0's; town figma --help says what it does\n`,
    stderr: "",
    exit: 0,
  });
  // credential add's prompt prints the new words, before a stdin with nothing on it is refused and nothing written.
  expect(operator("townd admin credential add --user dimitri --type figma < /dev/null", "")).toEqual({
    stdout: "",
    stderr: `dimitri/figma says: ${NEW_WORDS}\ntownd admin: credential add read nothing on stdin; pipe the secret in, since it is never an argument\n`,
    exit: 1,
  });
  // Another shop beside the same definition with words of its own leaves the type's, and its permit shows its own.
  writeShop(a, "figma-shop-0.2.0", "notes", (m) => m.replace("name: dimitri/figma", "name: dimitri/figma-notes").replace(NEW_WORDS, NOTES_WORDS));
  const notes = say(publish(a, "notes"));
  expect(notes.stdout).not.toContain("guidance");
  const notesPermit = /requested (prm_[0-9a-f]{16}),/.exec(notes.stdout)![1]!;
  expect(db(data, "SELECT guidance FROM credential_types WHERE name = 'figma'")).toEqual([{ guidance: NEW_WORDS }]);
  expect(operator(`townd admin permit show ${notesPermit}`, "").stdout).toContain(`    dimitri/figma-notes says: ${NOTES_WORDS}\n    dimitri's: ${credA}\n`);
  expect(operator(`townd admin permit deny ${notesPermit}`, "").exit).toBe(0);

  // Step 3: the agent asks; permit show prints the need held and the new words, then its `to do:` lines (their shape is checked once they have been typed).
  const asked = say(typed(a, "town hall request --shop dimitri/figma --why 'comments need file_comments:read'"));
  const permit = /^requested (prm_[0-9a-f]{16});/.exec(asked.stdout)![1]!;
  const shown = operator(`townd admin permit show ${permit}`, "");
  expect(shown.stdout).toContain(`needs:\n  figma: held, token, sent to ${origin.url} in X-Figma-Token: {token}\n    dimitri/figma says: ${NEW_WORDS}\n    dimitri's: ${credA}\nto do:\n`);
  const todo = todoLines(shown.stdout);

  // Step 4: the person made a token with both scopes; the operator types the lines not done, as printed, the heading being no command.
  const grantsBefore = grantRows(data);
  const typedLog: string[] = [];
  let credB = "";
  for (const { line } of todo.filter((t) => !t.done && t.line !== INSTEAD)) {
    const r = operator(line, WIDE);
    typedLog.push(`${line}\n  -> exit ${r.exit}\n${r.stdout}${r.stderr}`);
    if (!line.includes("--replace ")) continue;
    // The replacement: the new id, and the grant moved; the grant already reads the new secret, so comments answers before the approval.
    expect(r.exit, r.stderr).toBe(0);
    credB = r.stdout.trim();
    expect(credB).toMatch(/^credential_[0-9a-f]{16}$/);
    expect(r.stderr).toBe(`dimitri/figma says: ${NEW_WORDS}\n${personGrant} at dimitri/figma now uses ${credB}\n`);
    expect(grantRows(data), "the grants read").toEqual(grantsBefore.map((g) => (g.revoked_at === null && JSON.parse(String(g.credentials)).figma === credA ? { ...g, credentials: JSON.stringify({ figma: credB }) } : g)));
    expect(typed(a, "town figma comments --key abc"), "comments after the replacement").toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
    expect(operator("townd admin credential ls", "").stdout).toMatch(new RegExp(`^${credA}\\s+dimitri\\s+figma\\s+figma\\s+\\S+\\s+revoked \\(replaced by ${credB}\\)\\s`, "m"));
  }
  const answered = say(typed(a, "town figma comments --key abc"));
  expect(answered, typedLog.join("\n")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  // What permit show printed under `to do:`, which the lines typed were read from: the replacement above the approval, never done.
  expect(todo).toEqual([
    { done: true, line: "townd admin type approve figma" },
    { done: true, line: `printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type figma --label figma` },
    { done: false, line: INSTEAD },
    { done: false, line: `printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type figma --label figma --replace ${credA}` },
    { done: false, line: `townd admin permit approve ${permit}  # runs dimitri/figma's 2 tests on it first` },
  ]);

  // The approval ran the shop's two tests on the new secret and made the grant from the permit, replacing the moved one.
  const approval = box.at(-1)!;
  expect(approval.stdout).toMatch(new RegExp(`^ok a file answers\\nok comments answer\\nrevoked ${personGrant} at dimitri/figma, which ${permit} replaces\\ngrant_[0-9a-f]{16}\\n$`));
  const grant = approval.stdout.trim().split("\n").at(-1)!;
  expect(db(data, `SELECT source, credentials FROM grants WHERE id = '${grant}'`)).toEqual([{ source: `permit ${permit}`, credentials: JSON.stringify({ figma: credB }) }]);
  const approvalTests = origin.seen().filter((s) => s.url.startsWith("/v1/files/fixture"));
  expect(approvalTests.slice(-2).map((s) => [s.url, s.headers["x-figma-token"]])).toEqual([["/v1/files/fixture", WIDE], ["/v1/files/fixture/comments", WIDE]]);
  expect(origin.seen().at(-1)).toMatchObject({ url: "/v1/files/abc/comments", headers: { "x-figma-token": WIDE } });

  // The criteria: no unrevoked grant reads a revoked credential.
  expect(db(data, "SELECT g.id FROM grants g, json_each(g.credentials) j JOIN credentials c ON c.id = j.value WHERE g.revoked_at IS NULL AND c.revoked_at IS NOT NULL")).toEqual([]);
  // Every word the agent or the operator was told about where a secret is made is a shop's, and names no host but the origin's.
  for (const r of [...said, ...box]) {
    for (const line of (r.stdout + r.stderr).split("\n").filter((l) => l.includes("Settings > Security"))) {
      expect(line.trim(), line).toMatch(/^dimitri\/figma(-notes)? says: /);
      for (const url of line.match(/[a-z]+:\/\/[^\s]+/g) ?? []) expect(url.startsWith(origin.url), line).toBe(true);
    }
  }
  // Nothing the agent was told names a credential or holds a token.
  for (const r of said) for (const word of [credA, credB, NARROW, WIDE]) expect(r.stdout + r.stderr, word).not.toContain(word);

  // Step 5: --replace of a revoked credential, of another type's, of another user's: refused naming which, nothing written.
  expect(town.admin("user", "add", "ada").exit).toBe(0);
  expect(operator(`printf '%s\\n' "$TOKEN" | townd admin credential add --user ada --type figma`, "ada-not-a-token").exit).toBe(0);
  expect(operator(`printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type github-token`, "ghp-not-a-token").exit).toBe(0);
  const adas = String(db(data, "SELECT c.id FROM credentials c JOIN users u ON u.id = c.user_id WHERE u.name = 'ada'")[0]!.id);
  const github = String(db(data, "SELECT id FROM credentials WHERE type = 'github-token'")[0]!.id);
  const written = () => [db(data, "SELECT * FROM credentials ORDER BY id").map((c) => ({ ...c, sealed: null })), grantRows(data), db(data, "SELECT COUNT(*) AS n FROM calls")];
  const before = written();
  for (const [id, line] of [
    [credA, `--replace ${credA}: credential ${credA} is revoked (replaced by ${credB}), so nothing reads it to replace; leave out --replace`],
    [github, `--replace ${github}: credential ${github} is of type github-token, not figma; a credential is replaced by one of its own type`],
    [adas, `--replace ${adas}: credential ${adas} is user ada's, not dimitri's; a credential is replaced by one of its own user's`],
  ]) {
    expect(operator(`printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type figma --label figma --replace ${id}`, WIDE), id).toEqual({ stdout: "", stderr: `townd admin: ${line}\n`, exit: 1 });
    expect(written(), id).toEqual(before);
  }
}, 240_000);
