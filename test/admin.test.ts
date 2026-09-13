// ring: checkout
// The admin's two new nouns, in process over a data directory of the
// test's own (journey 2 steps 1 to 3, and journey 3 step 6): `type add|ls|rm`,
// `credential add|ls|rm` with the secret from a pipe and never printed,
// `shop test --user` and `shop add --user` running a shop's tests through
// a teller, and the binding at `grant new` as `grant ls` and
// `credential rm` show it. Hall phase 0: `permit ls`, `permit approve`
// making a grant with its source, narrowing, refusing wider, replacing a
// held grant, refusing an uncovered dependency or an unmet need with the
// permit still pending, and `permit deny`; the hall refused at `shop add`
// and `shop rm`; `source` in `grant ls` and `owner` in `shop ls`; and
// `user add` refusing a name that is not a namespace.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, type Io } from "../src/admin.js";
import { openStore, type Store } from "../src/store.js";
import { readKey } from "../src/vault.js";
import { openWall } from "../src/wall.js";
import { fakeOrigin, type FakeOrigin } from "./helpers/origin.js";

const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");
const TELLER = path.resolve(import.meta.dirname, "fixtures/teller-shop");
const SECRET = "ghp_not_a_real_token";

let data: string;

beforeEach(() => {
  data = mkdtempSync(path.join(os.tmpdir(), "town-admin-test-"));
});

afterEach(() => {
  rmSync(data, { recursive: true, force: true });
});

interface Ran {
  exit: number;
  stdout: string;
  stderr: string;
}

async function admin(args: string[], stdin?: Io["stdin"], withData = true): Promise<Ran> {
  let stdout = "";
  let stderr = "";
  const io: Io = { out: (s) => void (stdout += s), err: (s) => void (stderr += s), env: {}, ...(stdin ? { stdin } : {}) };
  const exit = await main(withData ? ["--data", data, ...args] : args, io, openWall("none"));
  return { exit, stdout, stderr };
}

/** A real pipe: the stdout of `printf` carrying `text`, as `printf '...' | townd admin ...` hands it over. */
function pipeOf(text: string): Readable {
  const child = spawn("/bin/sh", ["-c", 'printf %s "$SECRET_INPUT"'], { env: { SECRET_INPUT: text }, stdio: ["ignore", "pipe", "inherit"] });
  return child.stdout;
}

/** The value a credential opens to, read back through the store and the key. */
function opened(id: string): string {
  const store = openStore(data);
  try {
    return store.openCredential(id, readKey(data)!);
  } finally {
    store.close();
  }
}

async function addUser(name: string): Promise<void> {
  expect((await admin(["user", "add", name])).exit).toBe(0);
}

describe("type", () => {
  it("ls prints the seeded github-token with its origin and header", async () => {
    const r = await admin(["type", "ls"]);
    expect(r.exit, r.stderr).toBe(0);
    const [header, row, ...rest] = r.stdout.trimEnd().split("\n");
    expect(header).toMatch(/^name\s+origin\s+header\s+added$/);
    expect(row).toMatch(/^github-token\s+https:\/\/api\.github\.com\s+Authorization: Bearer \{token\}\s+\d{4}-/);
    expect(rest).toEqual([]);
  });

  it("add puts another in, and rm takes it out", async () => {
    const add = await admin(["type", "add", "internal", "--origin", "https://api.example.internal", "--header", "Authorization: Bearer {token}"]);
    expect(add).toEqual({ exit: 0, stdout: "added internal\n", stderr: "" });
    expect((await admin(["type", "ls"])).stdout).toMatch(/^internal\s+https:\/\/api\.example\.internal\s+Authorization: Bearer \{token\}/m);
    expect(await admin(["type", "rm", "internal"])).toEqual({ exit: 0, stdout: "removed internal\n", stderr: "" });
    expect((await admin(["type", "ls"])).stdout).not.toContain("internal");
  });

  it("add refuses a header with no {token} and a name already held", async () => {
    const noToken = await admin(["type", "add", "x", "--origin", "https://x.example", "--header", "Authorization: Bearer abc"]);
    expect(noToken.exit).toBe(1);
    expect(noToken.stderr).toMatch(/^townd admin: --header "Authorization: Bearer abc" is not a header; write '<Name>: <value>' with \{token\}/);
    const again = await admin(["type", "add", "github-token", "--origin", "https://x.example", "--header", "X: {token}"]);
    expect(again.exit).toBe(1);
    expect(again.stderr).toBe("townd admin: type github-token already exists; townd admin type ls lists them\n");
  });

  it("rm is refused while a credential of the type exists, and allowed once it is removed", async () => {
    await addUser("dimitri");
    const id = (await admin(["credential", "add", "--user", "dimitri", "--type", "github-token"], pipeOf(`${SECRET}\n`))).stdout.trim();
    const refused = await admin(["type", "rm", "github-token"]);
    expect(refused.exit).toBe(1);
    expect(refused.stderr).toBe(`townd admin: type github-token is held by a credential (${id}); remove it with townd admin credential rm first\n`);
    expect((await admin(["type", "ls"])).stdout).toContain("github-token");
    expect((await admin(["credential", "rm", id])).exit).toBe(0);
    expect((await admin(["type", "rm", "github-token"])).exit).toBe(0);
  });
});

describe("credential", () => {
  it("add reads the secret from a pipe, trims the one trailing newline, prints the id alone, and makes vault.key mode 600", async () => {
    await addUser("dimitri");
    const r = await admin(["credential", "add", "--user", "dimitri", "--type", "github-token", "--label", "dimitri's PAT"], pipeOf(`${SECRET}\n`));
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
    expect(r.stderr).toBe("");
    expect(opened(r.stdout.trim())).toBe(SECRET);
    expect(statSync(path.join(data, "vault.key")).mode & 0o777).toBe(0o600);
  });

  it("add trims one \\n or one \\r\\n and no more, and keeps the rest of stdin whole", async () => {
    await addUser("dimitri");
    const cases: Array<[string, string]> = [
      [`${SECRET}\r\n`, SECRET],
      [`${SECRET}\n\n`, `${SECRET}\n`],
      [SECRET, SECRET],
      [` spaced value \n`, " spaced value "],
      [`line one\nline two\n`, "line one\nline two"],
    ];
    for (const [input, want] of cases) {
      const r = await admin(["credential", "add", "--user", "dimitri", "--type", "github-token"], Readable.from([Buffer.from(input)]));
      expect(r.exit, r.stderr).toBe(0);
      expect(opened(r.stdout.trim()), JSON.stringify(input)).toBe(want);
    }
  });

  it("add refuses an empty stdin, a user or type the town lacks, and never makes a key for a refusal", async () => {
    await addUser("dimitri");
    const empty = await admin(["credential", "add", "--user", "dimitri", "--type", "github-token"], pipeOf("\n"));
    expect(empty.exit).toBe(1);
    expect(empty.stderr).toMatch(/^townd admin: credential add read nothing on stdin/);
    const none = await admin(["credential", "add", "--user", "dimitri", "--type", "github-token"]);
    expect(none.exit).toBe(1);
    const nobody = await admin(["credential", "add", "--user", "nobody", "--type", "github-token"], pipeOf(SECRET));
    expect(nobody.stderr).toBe("townd admin: user nobody does not exist; add it with townd admin user add nobody\n");
    const badType = await admin(["credential", "add", "--user", "dimitri", "--type", "github-tokens"], pipeOf(SECRET));
    expect(badType.stderr).toBe("townd admin: type github-tokens is not a type this town holds; write one of (github-token), or add it with townd admin type add\n");
    expect(readKey(data)).toBeNull();
    for (const r of [empty, none, nobody, badType]) expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  it("add takes no value as an argument", async () => {
    await addUser("dimitri");
    const r = await admin(["credential", "add", "--user", "dimitri", "--type", "github-token", "--value", SECRET]);
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/^townd admin: --value is not an admin flag/);
    expect(r.stderr).not.toContain(SECRET);
  });

  it("ls prints the id, user, type, label, created, state, and grants, and no value", async () => {
    await addUser("dimitri");
    await addUser("ada");
    const a = (await admin(["credential", "add", "--user", "dimitri", "--type", "github-token", "--label", "dimitri's PAT"], pipeOf(`${SECRET}\n`))).stdout.trim();
    const b = (await admin(["credential", "add", "--user", "ada", "--type", "github-token"], pipeOf("ada_secret_value"))).stdout.trim();
    const ls = await admin(["credential", "ls"]);
    expect(ls.exit, ls.stderr).toBe(0);
    const lines = ls.stdout.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^id\s+user\s+type\s+label\s+created\s+state\s+grants$/);
    expect(lines[1]).toMatch(new RegExp(`^${a}\\s+dimitri\\s+github-token\\s+dimitri's PAT\\s+\\d{4}-\\S+\\s+active\\s+-$`));
    expect(lines[2]).toMatch(new RegExp(`^${b}\\s+ada\\s+github-token\\s+-\\s+\\d{4}-\\S+\\s+active\\s+-$`));
    expect(ls.stdout).not.toContain(SECRET);
    expect(ls.stdout).not.toContain("ada_secret_value");
    expect((await admin(["credential", "ls", "--user", "ada"])).stdout.trimEnd().split("\n").slice(1).map((l) => l.split(/\s+/)[0])).toEqual([b]);

    expect(await admin(["credential", "rm", a])).toEqual({ exit: 0, stdout: `revoked ${a}\n`, stderr: "" });
    expect((await admin(["credential", "ls"])).stdout).toMatch(new RegExp(`^${a}\\s.*\\srevoked\\s+-$`, "m"));
  });

  it("a data directory with credentials and no vault.key is refused by every verb, in one line", async () => {
    await addUser("dimitri");
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "github-token"], pipeOf(SECRET))).exit).toBe(0);
    unlinkSync(path.join(data, "vault.key"));
    for (const verb of [["user", "ls"], ["credential", "ls"], ["type", "ls"], ["shop", "test", MEMORY]]) {
      const r = await admin(verb);
      expect(r.exit, verb.join(" ")).toBe(1);
      expect(r.stderr).toBe(`townd admin: ${path.join(data, "vault.key")} is missing, and the credentials table has 1 row sealed by it; restore the key file that came with this data directory\n`);
    }
  });
});

describe("shop test --user", () => {
  let origin: FakeOrigin;

  beforeEach(async () => {
    origin = await fakeOrigin();
    expect((await admin(["type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}"])).exit).toBe(0);
    await addUser("dimitri");
  });

  afterEach(async () => {
    await origin.close();
  });

  it("runs the shop's tests through a teller on the user's credential, against the type's origin", async () => {
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "test-origin"], pipeOf(`${SECRET}\n`))).exit).toBe(0);
    const r = await admin(["shop", "test", TELLER, "--user", "dimitri"]);
    expect(r).toEqual({ exit: 0, stdout: "ok the origin answers\n", stderr: "" });
    expect(origin.seen.map((s) => [s.url, s.headers.authorization])).toEqual([["/hello", `Bearer ${SECRET}`]]);
  });

  it("is refused without --user, for a user holding no credential of the type, or holding two", async () => {
    const noUser = await admin(["shop", "test", TELLER]);
    expect(noUser).toEqual({ exit: 1, stdout: "", stderr: "townd admin: shop test refused: test/teller needs test-origin; write --user <name> for whose credential its tests run on\n" });
    const lacking = await admin(["shop", "test", TELLER, "--user", "dimitri"]);
    expect(lacking.stderr).toBe("townd admin: shop test refused: user dimitri holds no test-origin credential; add one with townd admin credential add\n");
    const a = (await admin(["credential", "add", "--user", "dimitri", "--type", "test-origin"], pipeOf("one"))).stdout.trim();
    const b = (await admin(["credential", "add", "--user", "dimitri", "--type", "test-origin"], pipeOf("two"))).stdout.trim();
    const two = await admin(["shop", "test", TELLER, "--user", "dimitri"]);
    expect(two.exit).toBe(1);
    expect(two.stderr).toBe(`townd admin: shop test refused: user dimitri holds 2 test-origin credentials (${a}, ${b}); pick one with --credential <id>\n`);
    expect(origin.seen).toEqual([]);
    const picked = await admin(["shop", "test", TELLER, "--user", "dimitri", "--credential", b]);
    expect(picked, picked.stderr).toEqual({ exit: 0, stdout: "ok the origin answers\n", stderr: "" });
    expect(origin.seen.map((s) => s.headers.authorization)).toEqual(["Bearer two"]);
  });

  it("is refused for a shop with no needs given --user, as gate took none", async () => {
    const r = await admin(["shop", "test", MEMORY, "--user", "dimitri"]);
    expect(r).toEqual({ exit: 1, stdout: "", stderr: "townd admin: shop test refused: town/memory has no credentials to meet; leave out --user\n" });
  });

  it("with no data directory, refuses a shop with a need naming --data, and --user asking for one", async () => {
    const r = await admin(["shop", "test", TELLER], undefined, false);
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/^credentials\[0\]\.type: 'test-origin' cannot be checked with no data directory at hand; write .*--data <dir>.* instead \(spec §8\)\n$/);
    const u = await admin(["shop", "test", TELLER, "--user", "dimitri"], undefined, false);
    expect(u.exit).toBe(1);
    expect(u.stderr).toMatch(/^townd admin: shop test --user needs --data <dir>/);
    expect(origin.seen).toEqual([]);
  });

  it("refuses a manifest naming a type the town does not hold, naming the ones it does", async () => {
    const r = await admin(["type", "rm", "test-origin"]);
    expect(r.exit).toBe(0);
    const t = await admin(["shop", "test", TELLER, "--user", "dimitri"]);
    expect(t).toEqual({ exit: 1, stdout: "", stderr: "credentials[0].type: 'test-origin' is not a type this town holds; write one of (github-token) instead (spec §8)\n" });
  });

  it("shop add that gives a shop with grants a need names the grants that stop being live, and grant ls says why", async () => {
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "test-origin"], pipeOf(SECRET))).exit).toBe(0);
    expect((await admin(["shop", "add", MEMORY])).exit).toBe(0);
    const pass = (await admin(["pass", "new", "--user", "dimitri", "--label", "notes"])).stderr.trim();
    const grant = (await admin(["grant", "new", "--pass", pass, "--shop", "town/memory", "--commands", "recall"])).stdout.trim();
    expect((await admin(["grant", "ls"])).stdout).toMatch(new RegExp(`^${grant}\\s.*\\s-\\s+-\\s+live\\s+-$`, "m"));
    const needy = mkdtempSync(path.join(os.tmpdir(), "town-admin-needy-"));
    try {
      cpSync(MEMORY, needy, { recursive: true });
      const text = readFileSync(path.join(needy, "manifest.yaml"), "utf8");
      writeFileSync(path.join(needy, "manifest.yaml"), text.replace("\ncommands:\n", "\ncredentials:\n  - type: test-origin\ncommands:\n"));
      const r = await admin(["shop", "add", needy, "--user", "dimitri"]);
      expect(r.exit, r.stderr).toBe(0);
      expect(r.stdout).toMatch(new RegExp(
        `added town/memory \\S+\n${grant} at town/memory is no longer live: it binds no credential for a need the shop gained\na grant made again with townd admin grant new binds a credential for each need\n$`,
      ));
      expect((await admin(["grant", "ls"])).stdout).toMatch(new RegExp(`^${grant}\\s.*\\snot live: no test-origin bound\\s+-$`, "m"));
      // The dead grant does not block the one that binds.
      const again = await admin(["grant", "new", "--pass", pass, "--shop", "town/memory", "--commands", "recall"]);
      expect(again.exit, again.stderr).toBe(0);
      expect((await admin(["grant", "ls", "--pass", pass])).stdout).toMatch(/test-origin=credential_[0-9a-f]{16}\s+-\s+live\s+-$/m);
      // Adding it again, with the need it already has, names nothing.
      const same = await admin(["shop", "add", needy, "--user", "dimitri"]);
      expect(same.stdout).toMatch(/added town\/memory \S+\n$/);
    } finally {
      rmSync(needy, { recursive: true, force: true });
    }
  });

  it("shop add of a shop with needs is refused without --user, and with it runs the tests through a teller and adds the shop", async () => {
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "test-origin"], pipeOf(SECRET))).exit).toBe(0);
    const r = await admin(["shop", "add", TELLER]);
    expect(r).toEqual({ exit: 1, stdout: "", stderr: "townd admin: shop add refused: test/teller needs test-origin; write --user <name> for whose credential its tests run on\n" });
    expect(origin.seen).toEqual([]);
    expect((await admin(["shop", "ls"])).stdout).not.toContain("test/teller");
    const added = await admin(["shop", "add", TELLER, "--user", "dimitri"]);
    expect(added, added.stderr).toEqual({ exit: 0, stdout: "ok the origin answers\nadded test/teller 0.0.1\n", stderr: "" });
    expect(origin.seen.map((s) => [s.url, s.headers.authorization])).toEqual([["/hello", `Bearer ${SECRET}`]]);
    expect((await admin(["shop", "add", MEMORY, "--user", "dimitri"])).stderr).toBe("townd admin: shop add refused: town/memory has no credentials to meet; leave out --user\n");
  });
});

describe("the hall at the box", () => {
  it("is in a new store's shop ls with this town's version and owner -, and the columns are there", async () => {
    const ls = await admin(["shop", "ls"]);
    expect(ls.exit, ls.stderr).toBe(0);
    const [header, ...rows] = ls.stdout.trimEnd().split("\n");
    expect(header).toMatch(/^name\s+version\s+owner\s+commands\s+depends\s+added$/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^town\/hall\s+0\.1\.0\s+-\s+search,show,spec,validate,test,publish,request,requests\s+-\s+\d{4}-/);
    expect((await admin(["grant", "ls"])).stdout).toMatch(/^id\s+pass\s+shop\s+commands\s+source\s+constraints\s+credentials\s+expires\s+state\s+last use\n$/);
  });

  it("refuses shop rm town/hall as the town's own, and shop add of a manifest named town/hall or saying runtime: town", async () => {
    const rm = await admin(["shop", "rm", "town/hall"]);
    expect(rm).toEqual({ exit: 1, stdout: "", stderr: "townd admin: shop rm refused: town/hall is the town's own shop, in every town from its first open; revoke the grants at it instead\n" });
    const named = mkdtempSync(path.join(os.tmpdir(), "town-admin-hall-"));
    try {
      cpSync(MEMORY, named, { recursive: true });
      const text = readFileSync(path.join(named, "manifest.yaml"), "utf8");
      writeFileSync(path.join(named, "manifest.yaml"), text.replace("name: town/memory", "name: town/hall"));
      const byName = await admin(["shop", "add", named]);
      expect(byName).toEqual({ exit: 1, stdout: "", stderr: "townd admin: shop add refused: town/hall is the town's own shop, in every town from its first open; name the shop under another namespace\n" });
      writeFileSync(path.join(named, "manifest.yaml"), text.replace("runtime: subprocess", "runtime: town"));
      const byRuntime = await admin(["shop", "add", named]);
      expect(byRuntime.exit).toBe(1);
      expect(byRuntime.stderr).toBe("runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)\ntownd admin: shop add refused: the manifest has a mistake, above\n");
    } finally {
      rmSync(named, { recursive: true, force: true });
    }
    expect((await admin(["shop", "ls"])).stdout.trimEnd().split("\n").slice(1).map((l) => l.split(/\s+/)[0])).toEqual(["town/hall"]);
  });

  it("refuses user add of a name that is not a namespace", async () => {
    expect(await admin(["user", "add", "Dimitri_G"])).toEqual({
      exit: 1,
      stdout: "",
      stderr: 'townd admin: user name "Dimitri_G" is not a namespace; write lowercase letters, digits, and "-", starting with a letter, since it is the first part of the name of every shop the user\'s agents publish\n',
    });
  });

  it("grants the hall as any shop, at four commands", async () => {
    await addUser("dimitri");
    const pass = (await admin(["pass", "new", "--user", "dimitri", "--label", "agent"])).stderr.trim();
    const g = await admin(["grant", "new", "--pass", pass, "--shop", "town/hall", "--commands", "spec,validate,test,publish"]);
    expect(g.exit, g.stderr).toBe(0);
    expect((await admin(["grant", "ls"])).stdout).toMatch(new RegExp(`^${g.stdout.trim()}\\s+${pass}\\s+town/hall\\s+spec,validate,test,publish\\s+-\\s+-\\s+-\\s+-\\s+live\\s+-$`, "m"));
  });
});

describe("permit", () => {
  let pass: string;

  /** A store over the test's data directory for `fn`, closed after: the agent's side, as the hall writes it. */
  function withStore<T>(fn: (store: Store) => T): T {
    const store = openStore(data);
    try {
      return fn(store);
    } finally {
      store.close();
    }
  }

  const request = (shop: string, commands: string[], constraints: Record<string, Record<string, unknown>> = {}, why = "to clear finished items") =>
    withStore((s) => s.newPermit({ passId: pass, shop, commands, constraints: constraints as never, why }, Date.now()).id);

  const rowOf = (out: string, id: string) => out.split("\n").find((l) => l.startsWith(id)) ?? "";

  beforeEach(async () => {
    expect((await admin(["shop", "add", MEMORY])).exit).toBe(0);
    await addUser("dimitri");
    pass = (await admin(["pass", "new", "--user", "dimitri", "--label", "agent"])).stderr.trim();
  });

  it("ls shows a header and no rows, then each permit with its pass, user, shop, commands, constraints, why, asked, and pending", async () => {
    const empty = await admin(["permit", "ls"]);
    expect(empty).toEqual({ exit: 0, stdout: "id  pass  user  shop  commands  constraints  why  asked  state\n", stderr: "" });
    const id = request("town/memory", ["remember", "recall"], { "remember.key": { prefix: "notes/" } });
    const ls = await admin(["permit", "ls"]);
    expect(rowOf(ls.stdout, id)).toMatch(new RegExp(`^${id}\\s+${pass}\\s+dimitri\\s+town/memory\\s+remember,recall\\s+remember\\.key prefix notes/\\s+to clear finished items\\s+\\d{4}-\\S+\\s+pending$`));
    expect((await admin(["permit", "ls", "--pass", "pass_other"])).stdout.trimEnd().split("\n")).toHaveLength(1);
  });

  it("approve makes the grant as asked, with source permit <id>, and the permit approved as it", async () => {
    const id = request("town/memory", ["remember", "recall"], { "remember.key": { prefix: "notes/" } });
    const r = await admin(["permit", "approve", id]);
    expect(r.exit, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^grant_[0-9a-f]{16}\n$/);
    const grant = r.stdout.trim();
    expect(rowOf((await admin(["grant", "ls"])).stdout, grant)).toMatch(new RegExp(`^${grant}\\s+${pass}\\s+town/memory\\s+remember,recall\\s+permit ${id}\\s+remember\\.key prefix notes/\\s+-\\s+-\\s+live\\s+-$`));
    expect(rowOf((await admin(["permit", "ls"])).stdout, id)).toMatch(new RegExp(`\\sapproved as ${grant}$`));
    // A decided permit is not decided again.
    const again = await admin(["permit", "deny", id]);
    expect(again.exit).toBe(1);
    expect(again.stderr).toMatch(new RegExp(`^townd admin: permit ${id} was approved at \\S+; a decided permit is not decided again, so the agent asks again\\n$`));
    expect((await admin(["permit", "approve", id])).stderr).toMatch(/was approved at/);
  });

  it("approve narrows to the commands given, keeps the permit's constraints on them, adds the operator's, and refuses wider with the permit pending", async () => {
    const id = request("town/memory", ["remember", "recall"], { "remember.key": { prefix: "notes/" }, "recall.key": { prefix: "notes/" } });
    const wider = await admin(["permit", "approve", id, "--commands", "forget"]);
    expect(wider).toEqual({
      exit: 1,
      stdout: "",
      stderr: `townd admin: permit approve refused: --commands: forget is wider than ${id} asked; write some of remember,recall, or leave it out for all it asked\ntownd admin: ${id} is still pending\n`,
    });
    expect((await admin(["permit", "approve", id, "--commands", "recall,forget"])).exit).toBe(1);
    expect(rowOf((await admin(["permit", "ls"])).stdout, id)).toMatch(/\spending$/);
    expect(withStore((s) => s.listGrants(pass))).toEqual([]);
    const r = await admin(["permit", "approve", id, "--commands", "recall", "--constraint", "recall.key regex notes/[a-z]+", "--expires", "30d"]);
    expect(r.exit, r.stderr).toBe(0);
    const grant = withStore((s) => s.grantById(r.stdout.trim()))!;
    expect(grant).toMatchObject({ commands: ["recall"], constraints: { "recall.key": { prefix: "notes/", regex: "notes/[a-z]+" } }, source: `permit ${id}` });
    expect(grant.expiresAt).not.toBeNull();
    expect(rowOf((await admin(["permit", "ls"])).stdout, id)).toMatch(new RegExp(`\\sapproved as ${grant.id} with recall$`));
  });

  it("approve revokes the pass's live grant at the shop and names it", async () => {
    const held = (await admin(["grant", "new", "--pass", pass, "--shop", "town/memory", "--commands", "recall"])).stdout.trim();
    const id = request("town/memory", ["recall", "forget"]);
    const r = await admin(["permit", "approve", id]);
    expect(r.exit, r.stderr).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines[0]).toBe(`revoked ${held} at town/memory, which ${id} replaces`);
    expect(lines[1]).toMatch(/^grant_[0-9a-f]{16}$/);
    expect(withStore((s) => s.grantsForPass(pass).map((g) => [g.id, g.commands, g.source]))).toEqual([[lines[1], ["recall", "forget"], `permit ${id}`]]);
    expect(rowOf((await admin(["grant", "ls"])).stdout, held)).toMatch(/\srevoked\s+-$/);
  });

  it("approve at a composed shop whose dependencies the pass does not hold is refused in grant new's words, and the permit stays pending", async () => {
    withStore((s) => s.upsertShop({ ...s.getShop("town/memory")!.manifest, name: "test/composed", depends: [{ shop: "town/memory", commands: ["remember", "recall"] }] }));
    const id = request("test/composed", ["recall"]);
    const r = await admin(["permit", "approve", id]);
    expect(r).toEqual({
      exit: 1,
      stdout: "",
      stderr: `townd admin: permit approve refused: pass ${pass} holds no grant at town/memory covering remember, recall; grant one with townd admin grant new --pass ${pass} --shop town/memory --commands remember,recall first\ntownd admin: ${id} is still pending\n`,
    });
    expect(rowOf((await admin(["permit", "ls"])).stdout, id)).toMatch(/\spending$/);
    expect((await admin(["grant", "new", "--pass", pass, "--shop", "town/memory", "--commands", "remember,recall"])).exit).toBe(0);
    expect((await admin(["permit", "approve", id])).exit).toBe(0);
  });

  it("approve at a shop with a need the user has no credential for is refused, and the permit stays pending", async () => {
    expect((await admin(["type", "add", "test-origin", "--origin", "https://api.example.internal", "--header", "Authorization: Bearer {token}"])).exit).toBe(0);
    withStore((s) => s.upsertShop({ ...s.getShop("town/memory")!.manifest, name: "test/needy", credentials: [{ type: "test-origin" }] }));
    const id = request("test/needy", ["recall"]);
    const r = await admin(["permit", "approve", id]);
    expect(r.stderr).toBe(`townd admin: permit approve refused: user dimitri holds no test-origin credential; add one with townd admin credential add\ntownd admin: ${id} is still pending\n`);
    expect(withStore((s) => s.permitById(id)?.decision)).toBeNull();
  });

  it("deny records the decision and makes no grant; a missing permit is refused", async () => {
    const id = request("town/memory", ["forget"]);
    expect(await admin(["permit", "deny", id])).toEqual({ exit: 0, stdout: `denied ${id}\n`, stderr: "" });
    expect(rowOf((await admin(["permit", "ls"])).stdout, id)).toMatch(/\sdenied$/);
    expect(withStore((s) => s.listGrants(pass))).toEqual([]);
    expect(await admin(["permit", "deny", "prm_nothing"])).toEqual({ exit: 1, stdout: "", stderr: "townd admin: permit prm_nothing does not exist; townd admin permit ls lists them\n" });
  });
});
