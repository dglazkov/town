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
// `user add` refusing a name that is not a namespace. Consent phase 0: a
// shop published by an agent's pass proposing the figma type over a fake
// origin; `type ls` with kind, state, and proposer; `type approve`
// printing the guidance; `credential add` refused at a proposed type and
// printing the guidance before it reads stdin at a held one; `permit show`
// in each state with its done marks and the one-line case; `permit
// approve` in its order, each refusal leaving the permit pending and
// printing what remains, the tests run on the binding at step 3 and
// recorded under the approval, a failure leaving it pending, the grant
// made with its source and binding; `type rm` of a proposed type; `shop
// add` holding a type in one step; and the checklist typed as printed.
// Consent phase 1, the oauth kind, against the fake authorization server
// and fake docs origin in this process: `type add --kind oauth` and `type
// approve --client-id` with the secret on stdin, refused by kind and state;
// `credential add` refused at an oauth type naming `connect`, and `connect`
// at a token type naming `add`; `permit show`'s oauth lines and `permit
// approve` naming `connect`; `credential connect` printing the guidance
// before the URL, and `credential ls` with scopes, no value, and `revoked
// (refresh refused)`; and `shop add --user --client-id` holding an oauth
// type in one step, refused naming `connect`, then adding the shop.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, type Io } from "../src/admin.js";
import { splitWords } from "../src/args.js";
import { gate, storeVault } from "../src/gate.js";
import { parseValue } from "../src/oauth.js";
import { openStore, type Store } from "../src/store.js";
import { readKey } from "../src/vault.js";
import { openWall } from "../src/wall.js";
import { browse, fakeAuthServer, fakeDocs, type FakeAuth, type FakeDocs } from "./helpers/authserver.js";
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
  const exit = await main(withData ? ["--data", data, ...args] : args, io, () => ({ open: (opts) => openWall("none", opts) }));
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
    expect(header).toMatch(/^name\s+kind\s+state\s+proposer\s+origin\s+header\s+added\s+oauth$/);
    expect(row).toMatch(/^github-token\s+token\s+held\s+-\s+https:\/\/api\.github\.com\s+Authorization: Bearer \{token\}\s+\d{4}-\S+\s+-$/);
    expect(rest).toEqual([]);
  });

  it("add puts another in, and rm takes it out", async () => {
    const add = await admin(["type", "add", "internal", "--origin", "https://api.example.internal", "--header", "Authorization: Bearer {token}"]);
    expect(add).toEqual({ exit: 0, stdout: "added internal\n", stderr: "" });
    expect((await admin(["type", "ls"])).stdout).toMatch(/^internal\s+token\s+held\s+-\s+https:\/\/api\.example\.internal\s+Authorization: Bearer \{token\}/m);
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
    expect(lines[0]).toMatch(/^id\s+user\s+type\s+label\s+created\s+state\s+scopes\s+grants$/);
    expect(lines[1]).toMatch(new RegExp(`^${a}\\s+dimitri\\s+github-token\\s+dimitri's PAT\\s+\\d{4}-\\S+\\s+active\\s+-\\s+-$`));
    expect(lines[2]).toMatch(new RegExp(`^${b}\\s+ada\\s+github-token\\s+-\\s+\\d{4}-\\S+\\s+active\\s+-\\s+-$`));
    expect(ls.stdout).not.toContain(SECRET);
    expect(ls.stdout).not.toContain("ada_secret_value");
    expect((await admin(["credential", "ls", "--user", "ada"])).stdout.trimEnd().split("\n").slice(1).map((l) => l.split(/\s+/)[0])).toEqual([b]);

    expect(await admin(["credential", "rm", a])).toEqual({ exit: 0, stdout: `revoked ${a}\n`, stderr: "" });
    expect((await admin(["credential", "ls"])).stdout).toMatch(new RegExp(`^${a}\\s.*\\srevoked\\s+-\\s+-$`, "m"));
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
    expect(lacking.stderr).toBe("townd admin: shop test refused: user dimitri holds no test-origin credential; add one with townd admin credential add --user dimitri --type test-origin\n");
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
    expect(t).toEqual({ exit: 1, stdout: "", stderr: "credentials[0].type: 'test-origin' is not a type this town holds; write one of (github-token), or an origin and a header beside it to propose one, instead (spec §8)\n" });
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
    expect(r.stderr).toBe(`townd admin: permit approve refused: user dimitri holds no test-origin credential; add one with townd admin credential add --user dimitri --type test-origin\ntownd admin: ${id} is still pending\nto do:\n        printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type test-origin --label test-origin\n        townd admin permit approve ${id}\n`);
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

describe("consent: a type proposed with the shop", () => {
  const FIGMA_DIR = path.resolve(import.meta.dirname, "fixtures/figma-shop");
  const GUIDANCE = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";
  const TOKEN = "figma-not-a-real-token";
  let origin: FakeOrigin;
  let failing: boolean;

  beforeEach(async () => {
    failing = false;
    origin = await fakeOrigin((_req, res) => {
      res.writeHead(failing ? 500 : 200, { "content-type": "text/plain" });
      res.end(failing ? "the origin is down" : "hello from the origin");
    });
  });

  afterEach(async () => {
    await origin.close();
  });

  function withStore<T>(fn: (store: Store) => T): T {
    const store = openStore(data);
    try {
      return fn(store);
    } finally {
      store.close();
    }
  }

  const manifestText = () => readFileSync(path.join(FIGMA_DIR, "manifest.yaml"), "utf8").replace("http://127.0.0.1:9", origin.url);

  /** The figma shop published through the hall by dimitri's agent, as `tar … | town hall publish` sends it: the pass, and the permit its publish asked for. */
  async function published(): Promise<{ pass: string; permit: string }> {
    const root = mkdtempSync(path.join(os.tmpdir(), "town-admin-figma-"));
    try {
      writeFileSync(path.join(root, "manifest.yaml"), manifestText());
      cpSync(path.join(FIGMA_DIR, "main.mjs"), path.join(root, "main.mjs"));
      const tar = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", root, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
      const store = openStore(data);
      try {
        if (!store.userByName("dimitri")) store.addUser("dimitri");
        const { pass, token } = store.newPass("dimitri", "the agent", null);
        store.newGrant({ passId: pass.id, shop: "town/hall", commands: ["publish"], constraints: {}, expiresAt: null });
        const o = await gate({ store, wall: openWall("none") }, { token, argv: ["hall", "publish"], stdin: tar.stdout.toString("utf8"), json: false });
        const permit = /requested (prm_[0-9a-f]{16}),/.exec(o.stdout)?.[1];
        expect(permit, o.stdout).toBeDefined();
        return { pass: pass.id, permit: permit! };
      } finally {
        store.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const todo = (out: string) => out.slice(out.indexOf("to do:"));
  const TYPE = "        townd admin type approve figma";
  const CRED = `        printf '%s\\n' "$TOKEN" | townd admin credential add --user dimitri --type figma --label figma`;
  const APPROVE = (id: string) => `        townd admin permit approve ${id}  # runs dimitri/figma's 1 test on it first`;
  const done = (line: string) => `  done${line.slice(6)}`;

  it("shows the proposed type in type ls, refuses a credential at it, and type approve prints what it approves, the shop's guidance under its name", async () => {
    await published();
    const ls = (await admin(["type", "ls"])).stdout.split("\n");
    expect(ls[0]).toMatch(/^name\s+kind\s+state\s+proposer\s+origin\s+header\s+added\s+oauth$/);
    expect(ls[1]).toMatch(new RegExp(`^figma\\s+token\\s+proposed\\s+dimitri/figma\\s+${origin.url.replace(/[.]/g, "\\.")}\\s+X-Figma-Token: \\{token\\}\\s+\\d{4}-`));
    expect(ls[2]).toMatch(/^github-token\s+token\s+held\s+-\s+https:\/\/api\.github\.com\s/);

    const refused = await admin(["credential", "add", "--user", "dimitri", "--type", "figma"], pipeOf(TOKEN));
    expect(refused).toEqual({ exit: 1, stdout: "", stderr: "townd admin: type figma is proposed by dimitri/figma and not yet the town's; townd admin type approve figma makes it so\n" });
    expect(readKey(data)).toBeNull();

    const approved = await admin(["type", "approve", "figma"]);
    expect(approved).toEqual({
      exit: 0,
      stdout: `figma: a token type, sent to ${origin.url} in X-Figma-Token: {token}\ndimitri/figma says: ${GUIDANCE}\napproved figma, proposed by dimitri/figma; it is the town's\n`,
      stderr: "",
    });
    expect((await admin(["type", "ls"])).stdout).toMatch(/^figma\s+token\s+held\s+dimitri\/figma\s/m);
    expect((await admin(["type", "approve", "figma"])).stderr).toBe("townd admin: type figma is already the town's; townd admin type ls lists them\n");
    expect((await admin(["type", "approve", "sketch"])).stderr).toBe("townd admin: type sketch is not in this town; townd admin type ls lists them\n");
  });

  it("credential add at a held type with guidance prints it on stderr before it reads stdin, and the id alone on stdout", async () => {
    await published();
    expect((await admin(["type", "approve", "figma"])).exit).toBe(0);
    let stdout = "";
    let stderr = "";
    let seenBeforeRead: string | null = null;
    const stdin = (async function* () {
      seenBeforeRead = stderr;
      yield Buffer.from(`${TOKEN}\n`);
    })();
    const io: Io = { out: (x) => void (stdout += x), err: (x) => void (stderr += x), env: {}, stdin };
    const exit = await main(["--data", data, "credential", "add", "--user", "dimitri", "--type", "figma", "--label", "dimitri's figma token"], io, () => ({ open: (opts) => openWall("none", opts) }));
    expect(exit, stderr).toBe(0);
    expect(seenBeforeRead).toBe(`dimitri/figma says: ${GUIDANCE}\n`);
    expect(stderr).toBe(`dimitri/figma says: ${GUIDANCE}\n`);
    expect(stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
    expect(opened(stdout.trim())).toBe(TOKEN);
    // A type with no guidance prints nothing before the prompt; the operator's --guidance is attributed to the operator.
    expect(await admin(["type", "add", "internal", "--origin", "https://api.example.internal", "--header", "X-Key: {token}", "--guidance", "Ask the platform team for a key."])).toEqual({ exit: 0, stdout: "added internal\n", stderr: "" });
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "internal"], pipeOf("internal-not-a-key"))).stderr).toBe("the operator says: Ask the platform team for a key.\n");
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "github-token"], pipeOf(SECRET))).stderr).toBe("");
  });

  it("permit show prints the checklist in each state with its done marks, and a permit with nothing left but approval is one line", async () => {
    const { pass, permit } = await published();
    const first = await admin(["permit", "show", permit]);
    expect(first.exit, first.stderr).toBe(0);
    const lines = first.stdout.split("\n");
    expect(lines[0]).toMatch(/^id\s+pass\s+user\s+shop\s+commands\s+constraints\s+why\s+asked\s+state\s+needs$/);
    expect(lines[1]).toMatch(new RegExp(`^${permit}\\s+${pass}\\s+dimitri\\s+dimitri/figma\\s+file,comments\\s+-\\s+published dimitri/figma 0\\.1\\.0\\s+\\S+\\s+pending\\s+figma: proposed \\(${origin.url.replace(/[.]/g, "\\.")}\\), none connected$`));
    expect(lines.slice(2)).toEqual([
      "dimitri/figma: Reads Figma documents and what people said on them, for consent's tests.",
      "needs:",
      `  figma: proposed, token, sent to ${origin.url} in X-Figma-Token: {token}`,
      `    dimitri/figma says: ${GUIDANCE}`,
      "    none connected",
      "to do:",
      TYPE,
      CRED,
      APPROVE(permit),
      "",
    ]);
    expect((await admin(["type", "approve", "figma"])).exit).toBe(0);
    expect(todo((await admin(["permit", "show", permit])).stdout)).toBe(`to do:\n${done(TYPE)}\n${CRED}\n${APPROVE(permit)}\n`);
    const cred = (await admin(["credential", "add", "--user", "dimitri", "--type", "figma"], pipeOf(TOKEN))).stdout.trim();
    const two = (await admin(["permit", "show", permit])).stdout;
    expect(two).toContain(`  figma: held, token, sent to ${origin.url} in X-Figma-Token: {token}\n`);
    expect(two).toContain(`    dimitri's: ${cred}\n`);
    expect(two).toMatch(new RegExp(`\\s+pending\\s+figma: ${cred}\\n`));
    expect(todo(two)).toBe(`to do:\n${done(TYPE)}\n${done(CRED)}\n${APPROVE(permit)}\n`);
    expect((await admin(["permit", "approve", permit])).exit).toBe(0);
    expect(todo((await admin(["permit", "show", permit])).stdout)).toBe("to do: nothing; it was approved\n");

    // One line: a shop with no needs, and a shop whose need is the operator's type the user already holds, whose tests ran when it was added.
    expect((await admin(["shop", "add", MEMORY])).exit).toBe(0);
    const memory = withStore((s) => s.newPermit({ passId: pass, shop: "town/memory", commands: ["recall"], constraints: {}, why: "" }).id);
    const shown = (await admin(["permit", "show", memory])).stdout;
    expect(shown).toContain("town/memory: Short notes, kept by key.\nneeds: none\n");
    expect(todo(shown)).toBe(`to do:\n        townd admin permit approve ${memory}\n`);
    expect((await admin(["type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}"])).exit).toBe(0);
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "test-origin"], pipeOf(SECRET))).exit).toBe(0);
    expect((await admin(["shop", "add", TELLER, "--user", "dimitri"])).exit).toBe(0);
    const teller = withStore((s) => s.newPermit({ passId: pass, shop: "test/teller", commands: ["get"], constraints: {}, why: "" }).id);
    expect(todo((await admin(["permit", "show", teller])).stdout)).toBe(`to do:\n        townd admin permit approve ${teller}\n`);
    expect((await admin(["permit", "show", "prm_nothing"])).stderr).toBe("townd admin: permit prm_nothing does not exist; townd admin permit ls lists them\n");
  });

  it("permit approve checks in order, each refusal leaving the permit pending and printing what remains, and a failing test waits", async () => {
    const { pass, permit } = await published();
    const pending = () => withStore((s) => s.permitById(permit)!.decision === null && s.listGrants(pass).every((g) => g.shop !== "dimitri/figma"));
    const refusedWith = (line: string, remaining: string[]) => `townd admin: permit approve refused: ${line}\ntownd admin: ${permit} is still pending\nto do:\n${remaining.map((l) => `${l}\n`).join("")}`;

    // 1. The type still proposed: first, whatever else is missing.
    const typedFirst = await admin(["permit", "approve", permit]);
    expect(typedFirst).toEqual({ exit: 1, stdout: "", stderr: refusedWith("figma is proposed and not yet the town's; townd admin type approve figma first", [TYPE, CRED, APPROVE(permit)]) });
    expect(pending()).toBe(true);

    // 2. No credential of the user's: vault's line, and the two lines that remain.
    expect((await admin(["type", "approve", "figma"])).exit).toBe(0);
    const noCredential = await admin(["permit", "approve", permit]);
    expect(noCredential).toEqual({ exit: 1, stdout: "", stderr: refusedWith("user dimitri holds no figma credential; add one with townd admin credential add --user dimitri --type figma", [CRED, APPROVE(permit)]) });
    expect(pending()).toBe(true);
    expect(origin.seen).toEqual([]);

    // 3. The tests, on the binding, through a teller: a failure waits, the shop untested, the run recorded under its approval's row.
    expect((await admin(["credential", "add", "--user", "dimitri", "--type", "figma"], pipeOf(TOKEN))).exit).toBe(0);
    failing = true;
    const failed = await admin(["permit", "approve", permit]);
    expect(failed.exit).toBe(1);
    expect(failed.stdout).toBe('not ok a file answers: expected stdout to contain "200", got "500\\nthe origin is down"\n');
    expect(failed.stderr).toBe(refusedWith("tests 1/1 failed; the shop needs work, and the permit waits", [APPROVE(permit)]));
    expect(pending()).toBe(true);
    expect(withStore((s) => s.getShop("dimitri/figma")!.testedAt)).toBeNull();
    const [approval] = withStore((s) => s.calls({ shop: "dimitri/figma" }).filter((c) => c.parent === null));
    expect(withStore((s) => s.callTree(approval!.callId)).map((c) => [c.depth, c.command, c.result, c.shopExit, c.detail])).toEqual([
      [0, null, "shop-error", null, `approval ${permit} tests 0/1`],
      [1, "file", "shop-error", 1, "test a file answers"],
    ]);
    for (const r of [typedFirst, noCredential, failed]) expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });

  it("permit approve runs the shop's tests on the binding, each run a row under the approval's, then makes the grant with its source and binding", async () => {
    const { pass, permit } = await published();
    expect((await admin(["type", "approve", "figma"])).exit).toBe(0);
    const cred = (await admin(["credential", "add", "--user", "dimitri", "--type", "figma"], pipeOf(TOKEN))).stdout.trim();
    const passed = await admin(["permit", "approve", permit]);

    // The approval's rows: one for the approval, pass none, and under it the test's call, on the figma binding, through one teller request.
    const approvals = withStore((s) => s.calls({ shop: "dimitri/figma" }).filter((c) => c.parent === null));
    expect(approvals.map((c) => [c.passId, c.command, c.result, c.exit, c.detail])).toEqual([[null, null, "ok", 0, `approval ${permit} tests 1/1`]]);
    const tree = withStore((s) => s.callTree(approvals[0]!.callId));
    expect(tree.map((c) => [c.depth, c.passId, c.grantId, c.shop, c.command, c.result, c.shopExit, c.credentials, c.wall, c.detail])).toEqual([
      [0, null, null, "dimitri/figma", null, "ok", null, [], null, `approval ${permit} tests 1/1`],
      [1, null, "shop-test:dimitri/figma", "dimitri/figma", "file", "ok", 0, [{ type: "figma", requests: 1 }], "none", "test a file answers"],
    ]);
    expect(origin.seen.map((x) => [x.method, x.url, x.headers["x-figma-token"]])).toEqual([["GET", "/v1/files/fixture", TOKEN]]);
    const audit = await admin(["audit", "--call", approvals[0]!.callId]);
    expect(audit.stdout.trimEnd().split("\n").slice(1).map((l) => /^( *)call_/.exec(l)![1]!.length)).toEqual([0, 2]);

    // The grant: every command, the binding, source permit <id>, and the permit approved as it; tested_at set.
    expect(passed.exit, passed.stderr).toBe(0);
    expect(passed.stdout).toMatch(/^ok a file answers\ngrant_[0-9a-f]{16}\n$/);
    expect(passed.stderr).toBe("");
    const grant = passed.stdout.trim().split("\n").at(-1)!;
    expect(withStore((s) => s.grantById(grant))).toMatchObject({ passId: pass, shop: "dimitri/figma", commands: ["file", "comments"], constraints: {}, credentials: { figma: cred }, source: `permit ${permit}` });
    expect((await admin(["grant", "ls"])).stdout).toMatch(new RegExp(`^${grant}\\s+${pass}\\s+dimitri/figma\\s+file,comments\\s+permit ${permit}\\s+-\\s+figma=${cred}\\s+-\\s+live\\s+-$`, "m"));
    expect((await admin(["permit", "ls"])).stdout).toMatch(new RegExp(`^${permit}\\s.*\\sapproved as ${grant}\\s+figma: ${cred}$`, "m"));
    expect(withStore((s) => s.getShop("dimitri/figma")!.testedAt)).not.toBeNull();
    expect(passed.stdout + passed.stderr).not.toContain(TOKEN);
    expect((await admin(["permit", "approve", permit])).stderr).toMatch(/was approved at/);
  });

  it("type rm of a proposed type is refused while a shop names it and removes it after; of the held type, refused while a credential holds it", async () => {
    await published();
    expect((await admin(["type", "rm", "figma"])).stderr).toBe("townd admin: type figma is proposed and named by a shop (dimitri/figma); remove it with townd admin shop rm first\n");
    expect((await admin(["shop", "rm", "dimitri/figma"])).exit).toBe(0);
    expect(await admin(["type", "rm", "figma"])).toEqual({ exit: 0, stdout: "removed figma\n", stderr: "" });
    await published();
    expect((await admin(["type", "approve", "figma"])).exit).toBe(0);
    const cred = (await admin(["credential", "add", "--user", "dimitri", "--type", "figma"], pipeOf(TOKEN))).stdout.trim();
    expect((await admin(["type", "rm", "figma"])).stderr).toBe(`townd admin: type figma is held by a credential (${cred}); remove it with townd admin credential rm first\n`);
  });

  it("shop add of a manifest defining a type the town lacks holds it in one step, is refused with the type held while the user has no credential of it, and the same add after credential add adds the shop", async () => {
    await addUser("dimitri");
    const dir = mkdtempSync(path.join(os.tmpdir(), "town-admin-figma-add-"));
    try {
      writeFileSync(path.join(dir, "manifest.yaml"), manifestText());
      cpSync(path.join(FIGMA_DIR, "main.mjs"), path.join(dir, "main.mjs"));
      const shops = (await admin(["shop", "ls"])).stdout;
      const first = await admin(["shop", "add", dir, "--user", "dimitri"]);
      expect(first).toEqual({
        exit: 1,
        stdout: `held figma, as dimitri/figma defines it: a token type sent to ${origin.url} in X-Figma-Token: {token}\ndimitri/figma says: ${GUIDANCE}\n`,
        stderr: "townd admin: shop add refused: user dimitri holds no figma credential; figma stays held, as dimitri/figma defines it, so add one with townd admin credential add --user dimitri --type figma, then shop add again\n",
      });
      expect((await admin(["type", "ls"])).stdout).toMatch(new RegExp(`^figma\\s+token\\s+held\\s+dimitri/figma\\s+${origin.url.replace(/[.]/g, "\\.")}\\s+X-Figma-Token: \\{token\\}\\s`, "m"));
      expect(withStore((s) => s.getType("figma"))).toMatchObject({ state: "held", proposedBy: "dimitri/figma", guidance: GUIDANCE });
      expect((await admin(["shop", "ls"])).stdout).toBe(shops);
      expect(origin.seen).toEqual([]);
      // The same add again, still with no credential: the same refusal, and nothing held twice.
      const again = await admin(["shop", "add", dir, "--user", "dimitri"]);
      expect(again).toEqual({ exit: 1, stdout: "", stderr: first.stderr });

      expect((await admin(["credential", "add", "--user", "dimitri", "--type", "figma"], pipeOf(TOKEN))).exit).toBe(0);
      const added = await admin(["shop", "add", dir, "--user", "dimitri"]);
      expect(added).toEqual({ exit: 0, stdout: "ok a file answers\nadded dimitri/figma 0.1.0\n", stderr: "" });
      expect(withStore((s) => s.getShop("dimitri/figma"))).toMatchObject({ owner: null });
      expect(withStore((s) => s.listTypes().filter((t) => t.name === "figma"))).toMatchObject([{ state: "held", proposedBy: "dimitri/figma" }]);
      expect(origin.seen.map((x) => x.headers["x-figma-token"])).toEqual([TOKEN]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the checklist is enough: the commands permit show prints, typed as printed in order and nothing else, end with the grant", async () => {
    const { pass, permit } = await published();
    const shown = (await admin(["permit", "show", permit])).stdout;
    const lines = shown.slice(shown.indexOf("to do:\n") + "to do:\n".length).trimEnd().split("\n").map((l) => l.replace(/^  (done  |      )/, ""));
    const typed: string[] = [];
    for (const line of lines) {
      // As a shell reads the line: a comment is not a word, and `printf '%s\n' "$TOKEN" |` is the token on stdin.
      const piped = /^printf '%s\\n' "\$TOKEN" \| (.*)$/.exec(line);
      const command = (piped ? piped[1]! : line).replace(/\s+#.*$/, "");
      const split = splitWords(command);
      if (!split.ok) throw new Error(split.error);
      const [binary, verb, ...words] = split.words;
      expect([binary, verb], line).toEqual(["townd", "admin"]);
      const r = await admin(words, piped ? pipeOf(`${TOKEN}\n`) : undefined);
      typed.push(`${line} -> exit ${r.exit} ${r.stderr}`);
    }
    const grants = withStore((s) => s.grantsForPass(pass).filter((g) => g.shop === "dimitri/figma"));
    expect(grants.map((g) => [g.source, Object.keys(g.credentials)]), typed.join("\n")).toEqual([[`permit ${permit}`, ["figma"]]]);
  });
});

describe("consent phase 1: the oauth kind at the box", () => {
  const GDOCS_DIR = path.resolve(import.meta.dirname, "../shops/gdocs");
  const CLIENT = { clientId: "admin-client.apps", clientSecret: "admin-client-secret-77c1" };
  const GUIDANCE = "In the Google Cloud console, enable the Google Docs API and make an OAuth client of the Desktop type; give the town its client id and secret, then connect, which opens Google's consent page.";
  let auth: FakeAuth;
  let docs: FakeDocs;

  beforeEach(async () => {
    auth = await fakeAuthServer(CLIENT);
    docs = await fakeDocs(auth);
  });
  afterEach(async () => {
    await docs.close();
    await auth.close();
  });

  function withStore<T>(fn: (store: Store) => T): T {
    const store = openStore(data);
    try {
      return fn(store);
    } finally {
      store.close();
    }
  }

  /** shops/gdocs's manifest with its addresses written over by the fakes', named `name`. */
  const gdocsManifest = (name = "town/gdocs") =>
    readFileSync(path.join(GDOCS_DIR, "manifest.yaml"), "utf8")
      .replace("name: town/gdocs", `name: ${name}`)
      .replace("https://docs.googleapis.com", docs.url)
      .replace("https://accounts.google.com/o/oauth2/v2/auth", auth.authorize)
      .replace("https://oauth2.googleapis.com/token", auth.token);

  /** The copy of shops/gdocs over the fakes, in a directory of its own. */
  function gdocsCopy(name = "town/gdocs"): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "town-admin-gdocs-"));
    writeFileSync(path.join(dir, "manifest.yaml"), gdocsManifest(name));
    cpSync(path.join(GDOCS_DIR, "main.mjs"), path.join(dir, "main.mjs"));
    return dir;
  }

  /** dimitri/gdocs published through the hall by dimitri's agent: the pass and the permit it asked for. */
  async function published(): Promise<{ pass: string; permit: string; token: string }> {
    const root = gdocsCopy("dimitri/gdocs");
    try {
      const tar = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", root, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
      return await withStoreAsync(async (store) => {
        if (!store.userByName("dimitri")) store.addUser("dimitri");
        const { pass, token } = store.newPass("dimitri", "the agent", null);
        store.newGrant({ passId: pass.id, shop: "town/hall", commands: ["publish"], constraints: {}, expiresAt: null });
        const o = await gate({ store, wall: openWall("none") }, { token, argv: ["hall", "publish"], stdin: tar.stdout.toString("utf8"), json: false });
        const permit = /requested (prm_[0-9a-f]{16}),/.exec(o.stdout)?.[1];
        expect(permit, o.stdout).toBeDefined();
        return { pass: pass.id, permit: permit!, token };
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  async function withStoreAsync<T>(fn: (store: Store) => Promise<T>): Promise<T> {
    const store = openStore(data);
    try {
      return await fn(store);
    } finally {
      store.close();
    }
  }

  /** `credential connect` through the admin, the test the browser: once the URL is printed, the fake's redirect is delivered to the listener. */
  async function connectAtBox(args: string[] = []): Promise<Ran & { browser: string }> {
    let stdout = "";
    let stderr = "";
    let browsing: Promise<string> = Promise.resolve("");
    const io: Io = {
      out: (x) => void (stdout += x),
      err: (x) => {
        stderr += x;
        if (/^https?:\/\//.test(x)) browsing = browse(x.trim()).then((location) => fetch(location)).then((res) => res.text());
      },
      env: {},
    };
    const exit = await main(["--data", data, "credential", "connect", "--user", "dimitri", "--type", "google-oauth", ...args], io, () => ({ open: (opts) => openWall("none", opts) }));
    return { exit, stdout, stderr, browser: await browsing };
  }

  const TYPE_APPROVE = `        printf '%s\\n' "$CLIENT_SECRET" | townd admin type approve google-oauth --client-id "$CLIENT_ID"`;
  const CONNECT = "        townd admin credential connect --user dimitri --type google-oauth --label google-oauth";

  it("type add --kind oauth takes the endpoints, the scopes, and the registration, the secret on stdin and sealed; the refusals by kind", async () => {
    const base = ["type", "add", "google-oauth", "--origin", docs.url, "--header", "Authorization: Bearer {token}"];
    const oauth = ["--kind", "oauth", "--authorize", auth.authorize, "--token", auth.token, "--scopes", auth.scopes.join(",")];
    expect((await admin([...base, ...oauth], pipeOf(`${CLIENT.clientSecret}\n`))).stderr).toMatch(/^townd admin: --client-id is required\n/);
    expect((await admin([...base, "--authorize", auth.authorize])).stderr).toMatch(/^townd admin: --authorize is an oauth type's; write --kind oauth with it, or leave it out\n/);
    expect((await admin([...base, "--kind", "sso"])).stderr).toMatch(/^townd admin: --kind sso is not a kind; write token or oauth\n/);
    const http = [...base, "--kind", "oauth", "--authorize", "http://accounts.example.test/auth", "--token", auth.token, "--scopes", "s", "--client-id", CLIENT.clientId];
    expect((await admin(http, pipeOf(CLIENT.clientSecret))).stderr).toBe('townd admin: --authorize "http://accounts.example.test/auth" is not an endpoint; write the provider\'s https: URL, like https://accounts.google.com/o/oauth2/v2/auth\n');

    const added = await admin([...base, ...oauth, "--client-id", CLIENT.clientId, "--guidance", "Register a Desktop client in the Google Cloud console."], pipeOf(`${CLIENT.clientSecret}\n`));
    expect(added).toEqual({ exit: 0, stdout: "added google-oauth\n", stderr: "" });
    const ls = (await admin(["type", "ls"])).stdout;
    expect(ls).toMatch(new RegExp(`^google-oauth\\s+oauth\\s+held\\s+-\\s+${docs.url.replace(/[.]/g, "\\.")}\\s+Authorization: Bearer \\{token\\}\\s+\\d{4}-\\S+\\s+${auth.authorize.replace(/[.]/g, "\\.")} ${auth.token.replace(/[.]/g, "\\.")} ${auth.scopes[0]!.replace(/[./]/g, "\\$&")}$`, "m"));
    expect(ls).not.toContain(CLIENT.clientSecret);
    expect(withStore((s) => s.openClient("google-oauth", readKey(data)!))).toEqual({ id: CLIENT.clientId, secret: CLIENT.clientSecret });
    for (const f of ["town.db", "town.db-wal"].filter((x) => existsSync(path.join(data, x)))) expect(readFileSync(path.join(data, f)).includes(Buffer.from(CLIENT.clientSecret)), f).toBe(false);
    // A public client's secret is empty.
    expect((await admin(["type", "add", "public-oauth", "--origin", docs.url, "--header", "Authorization: Bearer {token}", ...oauth, "--client-id", "public.apps"], pipeOf(""))).exit).toBe(0);
    expect(withStore((s) => s.openClient("public-oauth", readKey(data)!))).toEqual({ id: "public.apps", secret: "" });

    // credential add at it names connect; connect at a token type names add.
    await addUser("dimitri");
    expect(await admin(["credential", "add", "--user", "dimitri", "--type", "google-oauth"], pipeOf("pasted"))).toEqual({
      exit: 1,
      stdout: "",
      stderr: "townd admin: type google-oauth is an oauth type, connected in a browser and never pasted; townd admin credential connect --user dimitri --type google-oauth connects one\n",
    });
    expect((await admin(["credential", "connect", "--user", "dimitri", "--type", "github-token"])).stderr).toBe(
      "townd admin: type github-token is a token type, pasted and never connected; townd admin credential add --user dimitri --type github-token adds one, the secret on stdin\n",
    );
  });

  it("type approve of a proposed oauth type is refused without --client-id, then prints what it approves and seals the registration; a token type takes none", async () => {
    await published();
    const ls = (await admin(["type", "ls"])).stdout;
    expect(ls).toMatch(new RegExp(`^google-oauth\\s+oauth\\s+proposed\\s+dimitri/gdocs\\s+${docs.url.replace(/[.]/g, "\\.")}\\s`, "m"));
    expect(withStore((s) => s.getType("google-oauth"))).toMatchObject({ kind: "oauth", state: "proposed", hasClient: false, oauth: { authorize: auth.authorize, token: auth.token, scopes: auth.scopes } });
    expect((await admin(["credential", "connect", "--user", "dimitri", "--type", "google-oauth"])).stderr).toBe("townd admin: type google-oauth is proposed by dimitri/gdocs and not yet the town's; townd admin type approve google-oauth makes it so\n");

    expect(await admin(["type", "approve", "google-oauth"])).toEqual({ exit: 1, stdout: "", stderr: "townd admin: type google-oauth is an oauth type and needs its registration; write --client-id <id>, with the client secret on stdin\n" });
    expect(withStore((s) => s.getType("google-oauth")!.state)).toBe("proposed");
    const approved = await admin(["type", "approve", "google-oauth", "--client-id", CLIENT.clientId], pipeOf(`${CLIENT.clientSecret}\n`));
    expect(approved).toEqual({
      exit: 0,
      stdout: [
        `google-oauth: an oauth type, sent to ${docs.url} in Authorization: Bearer {token}`,
        `google-oauth: consent at ${auth.authorize}, tokens from ${auth.token}, scopes ${auth.scopes.join(", ")}`,
        `dimitri/gdocs says: ${GUIDANCE}`,
        `approved google-oauth, proposed by dimitri/gdocs; it is the town's, with client ${CLIENT.clientId} and its secret sealed`,
        "",
      ].join("\n"),
      stderr: "",
    });
    expect(withStore((s) => s.getType("google-oauth"))).toMatchObject({ state: "held", hasClient: true });
    expect(withStore((s) => s.openClient("google-oauth", readKey(data)!))).toEqual({ id: CLIENT.clientId, secret: CLIENT.clientSecret });
    expect(approved.stdout).not.toContain(CLIENT.clientSecret);

    expect((await admin(["type", "add", "internal", "--origin", "https://api.example.internal", "--header", "X-Key: {token}"])).exit).toBe(0);
    withStore((s) => s.proposeType({ name: "figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}" }, "dimitri/figma", false));
    expect((await admin(["type", "approve", "figma", "--client-id", "x"], pipeOf("y"))).stderr).toBe("townd admin: type figma is a token type and takes no registration; leave out --client-id\n");
  });

  it("permit show's checklist for an oauth need approves with the registration from the shell's names and connects; permit approve without a credential names connect", async () => {
    const { permit } = await published();
    const APPROVE = `        townd admin permit approve ${permit}  # runs dimitri/gdocs's 1 test on it first`;
    const shown = (await admin(["permit", "show", permit])).stdout;
    expect(shown).toContain(`needs:\n  google-oauth: proposed, oauth, sent to ${docs.url} in Authorization: Bearer {token}\n    consent at ${auth.authorize}, scopes ${auth.scopes[0]}\n    dimitri/gdocs says: ${GUIDANCE}\n    none connected\n`);
    expect(shown.slice(shown.indexOf("to do:"))).toBe(`to do:\n${TYPE_APPROVE}\n${CONNECT}\n${APPROVE}\n`);
    expect((await admin(["type", "approve", "google-oauth", "--client-id", CLIENT.clientId], pipeOf(CLIENT.clientSecret))).exit).toBe(0);
    const refused = await admin(["permit", "approve", permit]);
    expect(refused).toEqual({
      exit: 1,
      stdout: "",
      stderr: `townd admin: permit approve refused: user dimitri holds no google-oauth credential; connect one with townd admin credential connect --user dimitri --type google-oauth\ntownd admin: ${permit} is still pending\nto do:\n${CONNECT}\n${APPROVE}\n`,
    });
  });

  it("credential connect prints the shop's guidance before the URL and the id on stdout; credential ls shows its scopes and no value, and says why when a refresh was refused", async () => {
    const { permit, token } = await published();
    expect((await admin(["type", "approve", "google-oauth", "--client-id", CLIENT.clientId], pipeOf(CLIENT.clientSecret))).exit).toBe(0);
    const c = await connectAtBox();
    expect(c.exit, c.stderr).toBe(0);
    expect(c.browser).toBe("connected; you can close this tab\n");
    const lines = c.stderr.trimEnd().split("\n");
    expect(lines[0]).toBe(`dimitri/gdocs says: ${GUIDANCE}`);
    expect(lines[1]).toMatch(/^open this URL in a browser to connect google-oauth for dimitri; the redirect comes back to http:\/\/127\.0\.0\.1:\d+\/ within 5m:$/);
    expect(lines[2]!.startsWith(`${auth.authorize}?`)).toBe(true);
    expect(c.stdout).toMatch(/^credential_[0-9a-f]{16}\n$/);
    const id = c.stdout.trim();
    const ls = (await admin(["credential", "ls"])).stdout;
    expect(ls).toMatch(new RegExp(`^${id}\\s+dimitri\\s+google-oauth\\s+google-oauth\\s+\\d{4}-\\S+\\s+active\\s+${auth.scopes[0]!.replace(/[./]/g, "\\$&")}\\s+-$`, "m"));
    for (const secret of [...auth.issued.access, ...auth.issued.refresh, CLIENT.clientSecret]) expect(ls + c.stdout + c.stderr).not.toContain(secret);
    expect((await admin(["audit"])).stdout).toMatch(/^\S+\s+-\s+-\s+-\s+[0-9a-f]{64}\s+ok\s+0\s+-\s+\d+\s+-\s+-\s+call_[0-9a-f]{16}\s+-\s+-\s+connected google-oauth for dimitri in \d+s$/m);

    // The permit's test runs through the teller on the access token; the grant is made.
    const approved = await admin(["permit", "approve", permit]);
    expect(approved.exit, approved.stderr).toBe(0);
    expect(approved.stdout).toMatch(/^ok a missing document fails\ngrant_[0-9a-f]{16}\n$/);
    expect(auth.events.filter((e) => e.kind === "docs").map((e) => [e.url, e.status, e.authorization])).toEqual([["/v1/documents/no-such-document", 404, true]]);

    // A refresh the provider refuses, at the gate an hour on: revoked, and ls says why.
    auth.mode = "invalid_grant";
    const expires = withStore((s) => parseValue(s.openCredential(id, readKey(data)!))!.expires_at);
    const denied = await withStoreAsync((store) => gate({ store, wall: openWall("none"), vault: storeVault(store, () => readKey(data)), now: () => expires }, { token, argv: ["dimitri/gdocs", "read", "--doc-id", "fixture-doc"], stdin: null, json: false }));
    expect([denied.exit, denied.error]).toEqual([2, "error: command 'dimitri/gdocs read' is not available to this grant: its google-oauth credential needs connecting again at the box"]);
    expect((await admin(["credential", "ls"])).stdout).toMatch(new RegExp(`^${id}\\s.*\\srevoked \\(refresh refused\\)\\s+\\S+\\s+grant_[0-9a-f]{16}$`, "m"));
  });

  it("shop add --user --client-id holds an oauth type in one step, is refused naming credential connect with the type held, and after a consent adds the shop on its test", async () => {
    await addUser("dimitri");
    const dir = gdocsCopy();
    try {
      const shops = (await admin(["shop", "ls"])).stdout;
      expect((await admin(["shop", "add", dir, "--user", "dimitri"])).stderr).toBe(
        "townd admin: shop add refused: town/gdocs defines google-oauth, an oauth type this town lacks, and holding it takes its registration; write --client-id <id>, with the client secret on stdin\n",
      );
      expect(withStore((s) => s.getType("google-oauth"))).toBeNull();
      const first = await admin(["shop", "add", dir, "--user", "dimitri", "--client-id", CLIENT.clientId], pipeOf(`${CLIENT.clientSecret}\n`));
      expect(first).toEqual({
        exit: 1,
        stdout: [
          `held google-oauth, as town/gdocs defines it: an oauth type sent to ${docs.url} in Authorization: Bearer {token}`,
          `google-oauth: consent at ${auth.authorize}, tokens from ${auth.token}, scopes ${auth.scopes[0]}, with client ${CLIENT.clientId} and its secret sealed`,
          `town/gdocs says: ${GUIDANCE}`,
          "",
        ].join("\n"),
        stderr: "townd admin: shop add refused: user dimitri holds no google-oauth credential; google-oauth stays held, as town/gdocs defines it, so connect one with townd admin credential connect --user dimitri --type google-oauth, then shop add again\n",
      });
      expect(withStore((s) => s.getType("google-oauth"))).toMatchObject({ kind: "oauth", state: "held", proposedBy: "town/gdocs", hasClient: true });
      expect((await admin(["shop", "ls"])).stdout).toBe(shops);
      // Held now, the same add with --client-id registers nothing; without it, it is refused for the credential again.
      expect((await admin(["shop", "add", dir, "--user", "dimitri", "--client-id", "again"], pipeOf("x"))).stderr).toBe("townd admin: shop add refused: town/gdocs defines no oauth type this town lacks, so --client-id registers nothing; leave it out\n");

      const c = await connectAtBox();
      expect(c.exit, c.stderr).toBe(0);
      const added = await admin(["shop", "add", dir, "--user", "dimitri"]);
      expect(added).toEqual({ exit: 0, stdout: "ok a missing document fails\nadded town/gdocs 0.1.0\n", stderr: "" });
      expect(auth.events.filter((e) => e.kind === "docs").map((e) => [e.url, e.status, e.authorization])).toEqual([["/v1/documents/no-such-document", 404, true]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
