// ring: command
// Vault's journey 2, the operator connects a credential, steps 1 to 8 as
// typed, against a town this test starts and a fake origin on loopback
// added as a type, so nothing needs a token or the network. The shop is
// test/fixtures/teller-shop, whose need is that type; journey 1 steps 5
// and 6 are walked on it inside step 5. The server is started before the
// first credential exists, so the key it opens bindings with is one made
// after it started.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ROOT, MEMORY, agent, assertBuilt, cleanup, originProcess, serve, tmp, townd, type Agent, type OriginProcess, type Ran, type Town } from "./helpers/town.js";

const TELLER = path.join(ROOT, "test/fixtures/teller-shop");
const SECRET = "operator-test-not-a-token-5b2d9e";
const SECOND = "operator-test-second-value-81fa";

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
});

afterAll(async () => {
  for (const t of towns) await t.stop();
  await origin?.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

function oneLine(r: Ran): string {
  const lines = r.stderr.split("\n").filter(Boolean);
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

/** Every byte of every file under `dir`. */
function allBytes(dir: string): Buffer {
  const parts: Buffer[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else parts.push(readFileSync(full));
    }
  };
  walk(dir);
  return Buffer.concat(parts);
}

function rowOf(table: string, first: string): string {
  const row = table.split("\n").find((l) => l.startsWith(first));
  expect(row, `${first} in\n${table}`).toBeDefined();
  return row!;
}

it("walks journey 2 steps 1 to 8: a type, a credential, a shop tested on it, a grant bound to it, the audit, removal, and the copy", async () => {
  const root = tmp("operator");
  made.push(root);
  const data = path.join(root, "town");
  const town = await serve(data);
  towns.push(town);
  const admin = town.admin;
  const secrets = [SECRET, SECOND];
  const noSecret = (...rs: Ran[]) => {
    for (const r of rs) for (const s of secrets) expect(r.stdout + r.stderr, s).not.toContain(s);
  };

  // Step 1: the seeded type, one added and removed, and the fake origin added as a type.
  const types = admin("type", "ls");
  expect(types.exit).toBe(0);
  expect(rowOf(types.stdout, "github-token")).toMatch(/^github-token\s+token\s+held\s+-\s+https:\/\/api\.github\.com\s+Authorization: Bearer \{token\}\s+\d{4}-/);
  expect(admin("type", "add", "internal", "--origin", "https://api.example.internal", "--header", "Authorization: Bearer {token}")).toEqual({ exit: 0, stdout: "added internal\n", stderr: "" });
  expect(admin("type", "rm", "internal")).toEqual({ exit: 0, stdout: "removed internal\n", stderr: "" });
  expect(admin("type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}").exit).toBe(0);

  // Step 2: the secret on stdin, the id on stdout, the key made on first use with mode 600.
  expect(admin("user", "add", "dimitri").exit).toBe(0);
  expect(admin("user", "add", "ada").exit).toBe(0);
  expect(existsSync(path.join(data, "vault.key"))).toBe(false);
  const added = town.adminPiped(`${SECRET}\n`, "credential", "add", "--user", "dimitri", "--type", "test-origin", "--label", "dimitri's PAT");
  expect(added.exit, added.stderr).toBe(0);
  expect(added.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
  expect(added.stderr).toBe("");
  const c1 = added.stdout.trim();
  expect(statSync(path.join(data, "vault.key")).mode & 0o777).toBe(0o600);
  const typeRm = admin("type", "rm", "test-origin");
  expect(oneLine(typeRm)).toBe(`townd admin: type test-origin is held by a credential (${c1}); remove it with townd admin credential rm first`);

  // Step 3: credential ls with no value; the database holds none as bytes.
  const creds = admin("credential", "ls");
  expect(creds.exit).toBe(0);
  expect(creds.stdout.split("\n")[0]).toMatch(/^id\s+user\s+type\s+label\s+created\s+state\s+grants$/);
  expect(rowOf(creds.stdout, c1)).toMatch(/^credential_\S+\s+dimitri\s+test-origin\s+dimitri's PAT\s+\d{4}-\S+\s+active\s+-$/);
  const dbFiles = () => ["town.db", "town.db-wal"].map((f) => path.join(data, f)).filter((f) => existsSync(f));
  expect(dbFiles().map((f) => path.basename(f))).toContain("town.db-wal");
  for (const f of dbFiles()) expect(readFileSync(f).includes(Buffer.from(SECRET)), path.basename(f)).toBe(false);
  noSecret(added, creds, types);

  // Step 4: shop add --user runs the shop's tests through a teller on dimitri's credential.
  const noUser = admin("shop", "add", TELLER);
  expect([noUser.exit, oneLine(noUser)]).toEqual([1, "townd admin: shop add refused: test/teller needs test-origin; write --user <name> for whose credential its tests run on"]);
  const lacking = admin("shop", "add", TELLER, "--user", "ada");
  expect([lacking.exit, oneLine(lacking)]).toEqual([1, "townd admin: shop add refused: user ada holds no test-origin credential; add one with townd admin credential add --user ada --type test-origin"]);
  const unheld = path.join(root, "unheld-type-shop");
  cpSync(TELLER, unheld, { recursive: true });
  writeFileSync(path.join(unheld, "manifest.yaml"), readFileSync(path.join(unheld, "manifest.yaml"), "utf8").replace("- type: test-origin", "- type: test-origins"));
  const unheldAdd = admin("shop", "add", unheld, "--user", "dimitri");
  expect(unheldAdd.exit).toBe(1);
  expect(unheldAdd.stderr).toMatch(/^credentials\[0\]\.type: 'test-origins' is not a type this town holds; write one of \(github-token, test-origin\), or an origin and a header beside it to propose one, instead \(spec §8\)$/m);
  expect(origin.seen()).toEqual([]);
  const shopAdd = admin("shop", "add", TELLER, "--user", "dimitri");
  expect(shopAdd, shopAdd.stderr).toEqual({ exit: 0, stdout: "ok the origin answers\nadded test/teller 0.0.1\n", stderr: "" });
  expect(origin.seen().map((s) => [s.method, s.url, s.headers.authorization])).toEqual([["GET", "/hello", `Bearer ${SECRET}`]]);

  // Step 5: grant new binds dimitri's one credential; grant ls shows it by type and id.
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "issue triage");
  const passId = pass.stderr.trim();
  const first = admin("grant", "new", "--pass", passId, "--shop", "test/teller", "--constraint", "get.path prefix /repos/mine/", "--constraint", "post.path prefix /repos/mine/");
  expect(first.exit, first.stderr).toBe(0);
  const firstId = first.stdout.trim();
  expect(rowOf(admin("grant", "ls").stdout, firstId)).toMatch(new RegExp(`^${firstId}\\s+${passId}\\s+test/teller\\s+get,post\\s+.*\\s+test-origin=${c1}\\s+-\\s+live\\s+-$`));
  expect(rowOf(admin("credential", "ls").stdout, c1)).toMatch(new RegExp(`\\sactive\\s+${firstId}$`));

  const a: Agent = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  const help = a.town("--help");
  expect(help.exit).toBe(0);
  expect(help.stdout).toMatch(/^test\/teller\s+Sends one request through the town's window, for the vault's tests\. \[get, post\]$/m);
  const shopHelp = a.town("teller", "--help");
  for (const text of [help.stdout, shopHelp.stdout]) {
    for (const word of ["credential", "test-origin=", c1, "PAT", "token", origin.url]) expect(text, word).not.toContain(word);
  }
  expect(shopHelp.stdout).toContain("town teller post --path <string> [--body <string>]");
  expect(a.town("teller", "get", "--path", "/repos/mine/issues")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  expect(a.town("teller", "post", "--path", "/repos/mine/issues/3/comments", "--body", "Seen, thanks.")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  expect(origin.seen().slice(1).map((s) => [s.method, s.url, s.headers.authorization])).toEqual([
    ["GET", "/repos/mine/issues", `Bearer ${SECRET}`],
    ["POST", "/repos/mine/issues/3/comments", `Bearer ${SECRET}`],
  ]);

  // Journey 1 step 5, on the fixture: a value outside the constraint is exit 2 on one line, and nothing reaches the origin.
  const seenBefore = origin.seen().length;
  const outside = a.town("teller", "get", "--path", "/repos/someone-else/issues");
  expect([outside.exit, oneLine(outside)]).toEqual([2, "error: --path must start with '/repos/mine/' under this grant"]);
  expect(origin.seen().length).toBe(seenBefore);

  // Journey 1 step 6: the grant narrowed to the read; the write is gate's line, and help no longer shows it.
  expect(admin("grant", "revoke", firstId).exit).toBe(0);
  const narrowed = admin("grant", "new", "--pass", passId, "--shop", "test/teller", "--commands", "get", "--constraint", "get.path prefix /repos/mine/");
  expect(narrowed.exit, narrowed.stderr).toBe(0);
  const grantId = narrowed.stdout.trim();
  const write = a.town("teller", "post", "--path", "/repos/mine/issues/3/comments", "--body", "again");
  expect([write.exit, oneLine(write)]).toEqual([2, "error: command 'post' is not available to this grant"]);
  expect(a.town("teller", "--help").stdout).not.toContain("post");
  expect(a.town("--help").stdout).toMatch(/\[get\]$/m);
  expect(origin.seen().length).toBe(seenBefore);

  // Two credentials of the type: the verb asks for --credential, naming them; with none, it says what to add.
  const second = town.adminPiped(SECOND, "credential", "add", "--user", "dimitri", "--type", "test-origin", "--label", "second");
  expect(second.exit, second.stderr).toBe(0);
  const c2 = second.stdout.trim();
  const pass2 = admin("pass", "new", "--user", "dimitri", "--label", "second assistant");
  const pass2Id = pass2.stderr.trim();
  const ask = admin("grant", "new", "--pass", pass2Id, "--shop", "test/teller", "--commands", "get");
  expect([ask.exit, oneLine(ask)]).toEqual([1, `townd admin: grant refused: user dimitri holds 2 test-origin credentials (${c1}, ${c2}); pick one with --credential <id>`]);
  const picked = admin("grant", "new", "--pass", pass2Id, "--shop", "test/teller", "--commands", "get", "--credential", c2);
  expect(picked.exit, picked.stderr).toBe(0);
  const grant2Id = picked.stdout.trim();
  expect(rowOf(admin("grant", "ls", "--pass", pass2Id).stdout, grant2Id)).toContain(`test-origin=${c2}`);
  const pass3 = admin("pass", "new", "--user", "ada", "--label", "nothing to bind");
  const none = admin("grant", "new", "--pass", pass3.stderr.trim(), "--shop", "test/teller");
  expect([none.exit, oneLine(none)]).toEqual([1, "townd admin: grant refused: user ada holds no test-origin credential; add one with townd admin credential add --user ada --type test-origin"]);
  const foreign = admin("grant", "new", "--pass", pass3.stderr.trim(), "--shop", "test/teller", "--credential", c1);
  expect(oneLine(foreign)).toBe(`townd admin: grant refused: --credential ${c1} is not a credential of user ada; townd admin credential ls --user ada lists them`);
  expect(admin("shop", "add", MEMORY).exit).toBe(0);
  const needless = admin("grant", "new", "--pass", pass2Id, "--shop", "town/memory", "--credential", c2);
  expect(oneLine(needless)).toBe("townd admin: grant refused: town/memory has no credentials to meet, so --credential binds nothing; leave it out");
  const b: Agent = agent();
  made.push(b.dir, b.home);
  b.writeGrant(pass2.stdout);
  expect(b.town("teller", "get", "--path", "/second")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  expect(origin.seen().at(-1)!.headers.authorization).toBe(`Bearer ${SECOND}`);

  // Step 6: the audit's new column, the types served and each teller's requests; never a value, never a path.
  const audit = admin("audit", "--shop", "test/teller");
  expect(audit.exit).toBe(0);
  const lines = audit.stdout.trim().split("\n");
  expect(lines[0]).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+wall\s+detail$/);
  const cols = lines.slice(1).map((l) => l.split(/\s+/));
  expect(cols.map((c) => [c[3], c[5], c[10]])).toEqual([
    ["-", "ok", "-"], // town teller --help
    ["get", "ok", "test-origin:1"],
    ["post", "ok", "test-origin:1"],
    ["get", "denied", "-"], // outside the constraint
    ["post", "denied", "-"], // narrowed away
    ["-", "ok", "-"], // town teller --help, narrowed
    ["get", "ok", "test-origin:1"], // the second pass, on the second credential
  ]);
  for (const word of [SECRET, SECOND, "/repos/mine", "/second", "Seen, thanks.", origin.url]) expect(audit.stdout, word).not.toContain(word);

  // Step 7: credential rm names the grants it ends; the agent's next call is exit 2 and help drops the shop, with no restart.
  const rm = admin("credential", "rm", c1);
  expect(rm).toEqual({ exit: 0, stdout: `revoked ${c1}\n${grantId} at test/teller is no longer live\n`, stderr: "" });
  const dead = a.town("teller", "get", "--path", "/repos/mine/issues");
  expect([dead.exit, oneLine(dead)]).toEqual([2, "error: command 'teller get' is not available to this grant"]);
  expect(a.town("--help")).toEqual({ stdout: "This pass holds no grants.\n", stderr: "", exit: 0 });
  expect(rowOf(admin("grant", "ls").stdout, grantId)).toMatch(new RegExp(`test-origin=${c1}\\s+-\\s+not live: ${c1} removed\\s+\\S+$`));
  expect(rowOf(admin("credential", "ls").stdout, c1)).toMatch(/\srevoked\s+grant_/);
  expect(b.town("teller", "get", "--path", "/still")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  // The replacement grant is not blocked by the dead one.
  const rebound = admin("grant", "new", "--pass", passId, "--shop", "test/teller", "--commands", "get");
  expect(rebound.exit, rebound.stderr).toBe(0);
  expect(a.town("teller", "get", "--path", "/rebound").exit).toBe(0);
  expect(origin.seen().at(-1)!.headers.authorization).toBe(`Bearer ${SECOND}`);
  expect(admin("grant", "revoke", rebound.stdout.trim()).exit).toBe(0);

  // Step 8: stop, copy the directory, serve the copy: the same town, credentials included.
  await town.stop();
  const stopped = admin("credential", "ls");
  expect(stopped.exit).toBe(0); // every verb works with the server stopped
  const copy = path.join(root, "copy");
  cpSync(data, copy, { recursive: true });
  const second2 = await serve(copy);
  towns.push(second2);
  expect(townd(["admin", "--data", copy, "credential", "ls"], town.env).stdout).toBe(stopped.stdout);
  b.writeGrant(JSON.stringify({ ...JSON.parse(pass2.stdout), town: second2.url }));
  expect(b.town("teller", "get", "--path", "/from-the-copy")).toEqual({ stdout: "200\nhello from the origin", stderr: "", exit: 0 });
  expect(origin.seen().at(-1)).toMatchObject({ url: "/from-the-copy", headers: { authorization: `Bearer ${SECOND}` } });

  // A copy of town.db alone opens nothing: serve and admin both refuse on the missing key.
  const alone = path.join(root, "db-alone");
  mkdirSync(alone);
  for (const f of readdirSync(data).filter((f) => /^town\.db(-wal)?$/.test(f))) cpSync(path.join(data, f), path.join(alone, f));
  const refusedServe = townd(["serve", "--data", alone, "--port", "0"], town.env);
  const missing = `${path.join(alone, "vault.key")} is missing, and the credentials table has 2 rows sealed by it; restore the key file that came with this data directory`;
  expect([refusedServe.exit, oneLine(refusedServe)]).toEqual([1, `townd serve: ${missing}`]);
  const refusedAdmin = townd(["admin", "--data", alone, "credential", "ls"], town.env);
  expect([refusedAdmin.exit, oneLine(refusedAdmin)]).toEqual([1, `townd admin: ${missing}`]);
  const aloneBytes = allBytes(alone);
  expect(aloneBytes.includes(Buffer.from("test-origin"))).toBe(true); // the reading finds what is there
  for (const s of secrets) {
    expect(aloneBytes.includes(Buffer.from(s)), s).toBe(false);
    expect(allBytes(data).includes(Buffer.from(s)), s).toBe(false);
  }
  noSecret(stopped, rm, refusedServe, refusedAdmin);
}, 120_000);
