// ring: command
// Journey 2, the operator's box, steps 1 to 7 as one walk against a
// town on a free port with a data directory made and deleted here; the
// agent's calls of journey 1 inside step 5; and journey 4 step 5, the
// same shop added to a second town and working there unchanged.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MEMORY, agent, assertBuilt, cleanup, cleanEnv, serve, tmp, townd, type Agent, type Ran, type Town } from "./helpers/town.js";

const made: string[] = [];
const towns: Town[] = [];

beforeAll(() => assertBuilt());

afterAll(async () => {
  for (const t of towns) await t.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

function track<T extends string>(p: T): T {
  made.push(p);
  return p;
}

function oneLine(r: Ran): string {
  const lines = r.stderr.split("\n").filter((l) => l !== "");
  expect(lines, r.stderr).toHaveLength(1);
  return lines[0]!;
}

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

it("walks the operator's box, journey 2 steps 1 to 7", async () => {
  const root = track(tmp("box"));
  const data = path.join(root, "town");

  // Step 1: serve refuses a data directory under an agent's directory, and starts outside one.
  const agentsDir = path.join(root, "someone-agent");
  mkdirSync(path.join(agentsDir, ".town"), { recursive: true });
  writeFileSync(path.join(agentsDir, ".town", "grant"), "{}");
  const refused = townd(["serve", "--data", path.join(agentsDir, "deep", "data"), "--port", "0"], cleanEnv(root));
  expect(refused.exit).toBe(1);
  expect(refused.stderr).toContain(path.join(agentsDir, ".town", "grant"));
  expect(existsSync(path.join(agentsDir, "deep"))).toBe(false);

  const town = await serve(data);
  towns.push(town);
  expect(town.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(await (await fetch(`${town.url}/`)).text()).toBe("town\n");

  // Step 2: shop add validates, runs the shop's tests, copies the directory.
  const broken = track(tmp("broken-shop"));
  cpSync(MEMORY, broken, { recursive: true });
  writeFileSync(path.join(broken, "manifest.yaml"), readFileSync(path.join(broken, "manifest.yaml"), "utf8").replace("effect: destructive", "effect: delete"));
  const badManifest = town.admin("shop", "add", broken);
  expect(badManifest.exit).toBe(1);
  expect(badManifest.stderr).toMatch(/^commands\[3\]\.effect: is not an effect; write one of read, write, destructive instead \(spec §3\)$/m);

  const failing = track(tmp("failing-shop"));
  cpSync(MEMORY, failing, { recursive: true });
  writeFileSync(path.join(failing, "manifest.yaml"), readFileSync(path.join(failing, "manifest.yaml"), "utf8").replace("expect: { contains: hello }", "expect: { contains: goodbye }"));
  const badTests = town.admin("shop", "add", failing);
  expect(badTests.exit).toBe(1);
  expect(badTests.stderr).toContain("'roundtrip' failed");
  expect(town.admin("shop", "ls").stdout).not.toContain("town/memory");

  const added = town.admin("shop", "add", MEMORY);
  expect(added.exit, added.stderr).toBe(0);
  expect(added.stdout).toMatch(/^ok roundtrip$/m);
  expect(added.stdout).toMatch(/^added town\/memory 0\.1\.0$/m);
  expect(readFileSync(path.join(data, "shops", "town%2Fmemory", "manifest.yaml"), "utf8")).toBe(readFileSync(path.join(MEMORY, "manifest.yaml"), "utf8"));

  // Step 3: a user, a pass; the grant file on stdout, the id on stderr. From here the shell names the data directory once.
  const opEnv = { ...town.env, TOWN_DATA: data };
  const admin = (...args: string[]) => townd(["admin", ...args], opEnv);
  expect(admin("user", "add", "dimitri").exit).toBe(0);
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "research assistant");
  expect(pass.exit, pass.stderr).toBe(0);
  const grantFile = JSON.parse(pass.stdout) as { town: string; token: string };
  expect(Object.keys(grantFile).sort()).toEqual(["token", "town"]);
  expect(grantFile.town).toBe(town.url);
  expect(Buffer.from(grantFile.token, "base64url").length).toBeGreaterThanOrEqual(32);
  const passId = pass.stderr.trim();
  expect(passId).toMatch(/^pass_[0-9a-f]+$/);
  expect(admin("pass", "ls").stdout).not.toContain(grantFile.token);

  // Step 4: the grant, and grant ls with its last use.
  const grant = admin(
    "grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list",
    "--constraint", "remember.key prefix notes/", "--constraint", "recall.key prefix notes/", "--expires", "30d",
  );
  expect(grant.exit, grant.stderr).toBe(0);
  const grantId = grant.stdout.trim();
  expect(grantId).toMatch(/^grant_[0-9a-f]+$/);
  const before = admin("grant", "ls").stdout.split("\n").find((l) => l.startsWith(grantId))!;
  expect(before).toContain("remember,recall,list");
  expect(before).toMatch(/\s-\s+\S+\s+live\s+-$/);

  // Step 5: the agent of journey 1 works.
  const a: Agent = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  const help = a.town("--help");
  expect(help.exit, help.stderr).toBe(0);
  const shopLines = help.stdout.split("\n").filter((l) => /^\S+\/\S+\s/.test(l));
  expect(shopLines).toEqual([expect.stringMatching(/^town\/memory\s+Short notes, kept by key\. \[remember, recall, list\]$/)]);
  for (const secret of [grantFile.token, town.url, "127.0.0.1", "dimitri", passId]) expect(help.stdout).not.toContain(secret);
  expect(help.stdout).not.toContain("forget");

  const shopHelp = a.town("memory", "--help");
  expect(shopHelp.exit).toBe(0);
  expect(shopHelp.stdout).toContain("research assistant");
  expect(shopHelp.stdout).toContain("keys under `notes/` only");
  expect(shopHelp.stdout).not.toContain("forget");

  const remember = a.town("memory", "remember", "--key", "notes/lunch", "--value", "tacos, Thursday");
  expect(remember).toEqual({ stdout: "", stderr: "", exit: 0 });
  expect(a.town("memory", "recall", "--key", "notes/lunch")).toEqual({ stdout: "tacos, Thursday\n", stderr: "", exit: 0 });
  const forget = a.town("memory", "forget", "--key", "notes/lunch");
  expect(forget.exit).toBe(2);
  expect(oneLine(forget)).toBe("error: command 'forget' is not available to this grant");
  const json = a.town("memory", "recall", "--key", "notes/lunch", "--json");
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout)).toEqual({ ok: true, output: "tacos, Thursday\n", notices: [], exit: 0 });

  // Stdin through a shell pipe reaches the shop.
  expect(a.townPiped("soup, Friday", "memory", "remember", "--key", "notes/dinner").exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "notes/dinner").stdout).toBe("soup, Friday\n");

  // The operator's words are unknown to the agent's command.
  for (const word of ["serve", "admin", "spec"]) {
    const r = a.town(word);
    expect(r.exit, word).toBe(1);
    expect(oneLine(r)).toBe(`error: town has no command '${word}'`);
  }

  const audit = admin("audit", "--pass", passId);
  expect(audit.exit).toBe(0);
  const rows = audit.stdout.trim().split("\n");
  expect(rows[0]).toMatch(/^at\s+pass\s+shop\s+command\s+argv sha256\s+result\s+exit\s+shop exit\s+ms\s+notices\s+credentials\s+call\s+parent\s+detail$/);
  const body = rows.slice(1);
  expect(body.map((r) => r.split(/\s+/)[5])).toEqual(["ok", "ok", "ok", "ok", "denied", "ok", "ok", "ok", "usage", "usage", "usage"]);
  expect(body[4]).toMatch(/town\/memory\s+forget\s+[0-9a-f]{64}\s+denied\s+2\s+-/);
  const at = body.map((r) => r.split(/\s+/)[0]!);
  expect([...at].sort()).toEqual(at);
  for (const secret of ["tacos", "notes/lunch", "soup"]) expect(audit.stdout).not.toContain(secret);
  const stored = allBytes(data);
  expect(stored.includes(Buffer.from(grantFile.token))).toBe(false);
  expect(stored.includes(Buffer.from("tacos, Thursday"))).toBe(true); // the shop's state is here; the audit is not
  const lastUse = admin("grant", "ls").stdout.split("\n").find((l) => l.startsWith(grantId))!;
  expect(lastUse).toMatch(/live\s+\d{4}-\d\d-\d\dT[\d:]+Z$/);

  // A second pass for the same user, to find the town whole in step 7.
  const pass2 = admin("pass", "new", "--user", "dimitri", "--label", "second");
  const pass2Id = pass2.stderr.trim();
  expect(admin("grant", "new", "--pass", pass2Id, "--shop", "town/memory", "--commands", "recall").exit).toBe(0);
  const b: Agent = agent();
  made.push(b.dir, b.home);
  b.writeGrant(pass2.stdout);

  // Step 6: revocation is seen by the next call, no restart.
  expect(admin("grant", "revoke", grantId).exit).toBe(0);
  const afterGrant = a.town("memory", "recall", "--key", "notes/lunch");
  expect(afterGrant.exit).toBe(2);
  expect(oneLine(afterGrant)).toBe("error: command 'memory recall' is not available to this grant");
  const helpAfter = a.town("--help");
  expect(helpAfter.exit).toBe(0);
  expect(helpAfter.stdout).not.toContain("memory");

  expect(admin("pass", "revoke", passId).exit).toBe(0);
  for (const call of [["--help"], ["memory", "recall", "--key", "notes/lunch"], ["anything", "at", "all"]]) {
    const r = a.town(...call);
    expect(r.exit, call.join(" ")).toBe(3);
    expect(oneLine(r)).toBe("error: this pass is not valid: its token is unknown, revoked, or expired");
  }
  expect(b.town("memory", "recall", "--key", "notes/lunch").stdout).toBe("tacos, Thursday\n");

  // Step 7: stop, copy, serve the copy: the same town.
  const grantsBefore = admin("grant", "ls").stdout;
  await town.stop();
  expect(admin("pass", "ls").exit).toBe(0); // the admin works with the server stopped
  const copy = path.join(root, "copy");
  cpSync(data, copy, { recursive: true });
  const second = await serve(copy);
  towns.push(second);
  expect(townd(["admin", "--data", copy, "grant", "ls"], opEnv).stdout).toBe(grantsBefore);
  b.writeGrant(JSON.stringify({ ...JSON.parse(pass2.stdout), town: second.url }));
  expect(b.town("memory", "recall", "--key", "notes/lunch")).toEqual({ stdout: "tacos, Thursday\n", stderr: "", exit: 0 });
  a.writeGrant(JSON.stringify({ ...grantFile, town: second.url }));
  expect(a.town("--help").exit).toBe(3);

  // Step 1's claim, at the end: the data directory holds the database, the shops' code, and the shops' state.
  expect(readdirSync(data).filter((f) => !/^town\.db(-wal|-shm)?$/.test(f)).sort()).toEqual(["shops", "state"]);
}, 120_000);

it("adds the same shop to a second town, where it works unchanged (journey 4 step 5)", async () => {
  const data = track(tmp("second-town"));
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "someone").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "someone", "--label", "elsewhere");
  expect(town.admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "town/memory").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  expect(a.town("memory", "remember", "--key", "x/y", "--value", "here too").exit).toBe(0);
  expect(a.town("memory", "list").stdout).toBe("x/y\n");
  expect(a.town("memory", "forget", "--key", "x/y").exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "x/y").exit).toBe(1);
}, 60_000);

it("keeps no argument in the audit, even from a shop that failed (journey 1's first criterion)", async () => {
  const data = track(tmp("no-arguments"));
  const town = await serve(data);
  towns.push(town);
  expect(town.admin("shop", "add", MEMORY).exit).toBe(0);
  expect(town.admin("user", "add", "someone").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "someone", "--label", "careful");
  const passId = pass.stderr.trim();
  expect(town.admin("grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", "remember,recall,list", "--constraint", "recall.key prefix notes/").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  const distinctive = ["notes/zebra-4417", "quagga-value-9203", "secret/okapi-5581", "gnu-stray-7730", "tapir-escape-3319"];
  const failedRecall = a.town("memory", "recall", "--key", "notes/zebra-4417");
  expect(failedRecall).toEqual({ stdout: "", stderr: "error: town/memory recall failed\nno value under that key\n", exit: 1 });
  expect(a.town("memory", "remember", "--key", "notes/a", "--value", "quagga-value-9203").exit).toBe(0);
  expect(a.town("memory", "recall", "--key", "secret/okapi-5581").exit).toBe(2);
  expect(a.town("memory", "list", "gnu-stray-7730").exit).toBe(1);
  expect(a.town("memory", "remember", "--key", "../tapir-escape-3319", "--value", "x")).toMatchObject({ exit: 1, stderr: "error: town/memory remember failed\nthe key is outside the state\n" });
  expect(a.town("memory", "forget", "--key", "notes/zebra-4417").exit).toBe(2);

  const audit = town.admin("audit", "--pass", passId);
  expect(audit.exit).toBe(0);
  const rows = audit.stdout.trim().split("\n").slice(1);
  expect(rows.map((r) => r.split(/\s+/)[5])).toEqual(["shop-error", "ok", "denied", "usage", "shop-error", "denied"]);
  const files = ["town.db", "town.db-wal"].map((f) => path.join(data, f)).filter((f) => existsSync(f));
  expect(files.map((f) => path.basename(f))).toContain("town.db-wal");
  const stored = Buffer.concat(files.map((f) => readFileSync(f)));
  expect(stored.includes(Buffer.from("town/memory"))).toBe(true); // the reading can find what is there
  for (const word of distinctive) {
    expect(stored.includes(Buffer.from(word)), `${word} in town.db`).toBe(false);
    expect(audit.stdout, `${word} in the audit`).not.toContain(word);
  }
}, 60_000);
