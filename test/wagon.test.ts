// ring: command
// Wagon's journey 1 on two towns this test starts, save the GitHub call:
// the first furnished by `townd admin --data` with a user, a pass, memory
// and a copy of town/github whose one test sends nothing, a github-token
// credential of a value made here and never sent, grants at both, and
// `town memory remember` by the pass, so its state is bytes on disk, with
// a state file of bytes that are not UTF-8 written beside it by the test.
// `store export --key` makes the key with mode 600 and writes the wagon,
// holding no value and no token; `store import --key` unpacks it into a
// second data directory, which served with the same grant file at its own
// address recalls the line, shows the first's calls, and holds the
// credential live, sealed again under a key of its own. `--no-audit`
// leaves the calls behind and counts them; an import into the first town
// is refused and changes nothing; `--key` missing is refused; and
// `readsStdin` names `store import`. Over `--town`, with a fake fetch in
// this process: the wagon's key read at the laptop, made there on export,
// and posted as hex in the body's `key`, with neither `--key` nor its path
// in the posted `argv`; `--key` at another verb refused unposted; and a
// body past the door's limit refused before any fetch, naming its size,
// the limit, and `--no-audit`.

import { cpSync, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { main, readsStdin, type Io } from "../src/admin.js";
import { BODY_LIMIT_BYTES } from "../src/clerk.js";
import { segment } from "../src/runtime.js";
import { MEMORY, ROOT, agent, assertBuilt, cleanup, serve, tmp, townd, type Town } from "./helpers/town.js";

const VALUE = `github_pat_wagon_${randomBytes(12).toString("hex")}`;
const COUNTS = /^users 1, passes 1, grants 2, shops 2, types 1, credentials 1, permits 0, calls (\d+), state files 2$/;

const made: string[] = [];
const towns: Town[] = [];

beforeAll(() => assertBuilt());

afterAll(async () => {
  for (const t of towns) await t.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

afterEach(() => void vi.unstubAllGlobals());

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const lines = (s: string) => s.split("\n").filter(Boolean);
/** A table's rows by their cells, split on the two or more spaces between columns, so a column padded wider in one town than the other compares the same. */
const fields = (s: string) => lines(s).map((l) => l.split(/\s{2,}/));

it("names store import among the verbs whose stdin the wire reads, and store export not", () => {
  expect(readsStdin(["store", "import", "--key", "wagon.key"])).toBe(true);
  expect(readsStdin(["store", "export", "--key", "wagon.key", "--no-audit"])).toBe(false);
});

it("walks journey 1: a town exported with a key made, imported into a directory that did not exist, served, and its grant file working at the new address", async () => {
  const root = tmp("wagon");
  made.push(root);
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  const key = path.join(root, "wagon.key");
  const first = await serve(a);
  towns.push(first);
  const env = first.env;
  const ok = (r: { exit: number; stdout: string; stderr: string }) => {
    expect(r.exit, r.stderr).toBe(0);
    return r;
  };

  // The first town: a user, a pass, memory, github whose one test sends nothing, the credential, grants at both, and a call that keeps state.
  const userId = ok(first.admin("user", "add", "dimitri")).stdout.trim();
  const pass = ok(first.admin("pass", "new", "--user", "dimitri", "--label", "wagon"));
  const passId = pass.stderr.trim();
  const token = (JSON.parse(pass.stdout) as { token: string }).token;
  ok(first.admin("shop", "add", MEMORY));
  const github = path.join(root, "github");
  cpSync(path.join(ROOT, "shops/github"), github, { recursive: true });
  const manifest = readFileSync(path.join(github, "manifest.yaml"), "utf8");
  writeFileSync(path.join(github, "manifest.yaml"), `${manifest.slice(0, manifest.indexOf("tests:"))}tests:\n  - name: a malformed repo fails\n    run: list --repo not-a-repo\n    expect: { exit: 1 }\n`);
  ok(first.adminPiped(`${VALUE}\n`, "credential", "add", "--user", "dimitri", "--type", "github-token", "--label", "PAT"));
  ok(first.admin("shop", "add", github, "--user", "dimitri"));
  ok(first.admin("grant", "new", "--pass", passId, "--shop", "town/memory"));
  ok(first.admin("grant", "new", "--pass", passId, "--shop", "town/github", "--commands", "show"));
  const agentA = agent();
  made.push(agentA.dir, agentA.home);
  agentA.writeGrant(pass.stdout);
  expect(agentA.town("memory", "remember", "--key", "notes/wagon", "--value", "the wagon rolls")).toMatchObject({ exit: 0 });
  expect(agentA.town("memory", "recall", "--key", "notes/wagon").stdout).toBe("the wagon rolls\n");
  const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x80]);
  const stateDir = path.join(a, "state", segment("town/memory"), segment(userId));
  writeFileSync(path.join(stateDir, "raw.bin"), bytes);

  // Step 1: export makes the key, mode 600, says so, prints the counts, and writes nothing: the audit after is the audit before.
  const auditBefore = ok(first.admin("audit")).stdout;
  expect(existsSync(key)).toBe(false);
  const exported = townd(["admin", "--data", a, "store", "export", "--key", key], env);
  expect(exported.exit, exported.stderr).toBe(0);
  expect(statSync(key).mode & 0o777).toBe(0o600);
  expect(statSync(key).size).toBe(32);
  const [madeLine, counts, ...more] = lines(exported.stderr);
  expect(more).toEqual([]);
  expect(madeLine).toBe(`townd admin: made ${key}, the wagon's key, mode 600; it is the only copy, and without it this wagon's credentials do not open`);
  expect(counts).toMatch(COUNTS);
  const calls = Number(COUNTS.exec(counts!)![1]);
  expect(calls).toBeGreaterThanOrEqual(2);
  const wagonFile = path.join(root, "wagon.json");
  writeFileSync(wagonFile, exported.stdout);
  const wagon = JSON.parse(exported.stdout) as Record<string, unknown> & { state: Array<Record<string, string>> };
  expect([wagon.wagon, wagon.schema, wagon.build, wagon.from, wagon.audit]).toEqual([1, 7, "laptop", path.join(a, "town.db"), true]);
  expect(exported.stdout).not.toContain(VALUE);
  expect(exported.stdout).not.toContain(token);
  expect(wagon.state.map((f) => [f.path, f.content ?? `base64 ${f.base64}`])).toEqual([["notes/wagon", "the wagon rolls"], ["raw.bin", `base64 ${bytes.toString("base64")}`]].sort((x, y) => (x[0]! < y[0]! ? -1 : 1)));
  expect(ok(first.admin("audit")).stdout).toBe(auditBefore);

  // Step 2: import makes b, prints the same counts; b is served.
  expect(existsSync(b)).toBe(false);
  const imported = townd(["admin", "--data", b, "store", "import", "--key", key], env, exported.stdout);
  expect(imported.exit, imported.stderr).toBe(0);
  expect(lines(imported.stderr)).toEqual([counts]);
  const second = await serve(b);
  towns.push(second);

  // Step 3: the same grant file at the second address recalls the line; the audit is the first's; the credential is live; the bytes came back.
  const agentB = agent();
  made.push(agentB.dir, agentB.home);
  agentB.writeGrant(`${JSON.stringify({ ...JSON.parse(pass.stdout), town: second.url }, null, 2)}\n`);
  expect(agentB.town("memory", "recall", "--key", "notes/wagon")).toMatchObject({ exit: 0, stdout: "the wagon rolls\n" });
  const help = agentB.town("--help");
  expect(help.stdout).toMatch(/\bmemory\b/);
  expect(help.stdout).toMatch(/\bgithub\b/);
  const auditB = fields(ok(second.admin("audit")).stdout);
  expect(auditB.slice(0, 1 + calls)).toEqual(fields(auditBefore));
  expect(auditB).toHaveLength(1 + calls + 2);
  for (const verb of [["user", "ls"], ["pass", "ls"], ["grant", "ls"], ["type", "ls"], ["credential", "ls", "--user", "dimitri"], ["permit", "ls"]]) {
    const [x, y] = [first.admin(...verb).stdout, second.admin(...verb).stdout];
    // A pass's and a grant's last use moves with b's calls: every cell but the last.
    if (verb[0] === "pass" || verb[0] === "grant") expect(fields(y).map((r) => r.slice(0, -1)), verb.join(" ")).toEqual(fields(x).map((r) => r.slice(0, -1)));
    else expect(fields(y), verb.join(" ")).toEqual(fields(x));
  }
  expect(second.admin("credential", "ls", "--user", "dimitri").stdout).toMatch(/\bactive\b/);
  expect(readFileSync(path.join(b, "state", segment("town/memory"), segment(userId), "raw.bin")).equals(bytes)).toBe(true);

  // Step 4: b's key was made by the import, and the credential was sealed again under it.
  expect(readFileSync(path.join(b, "vault.key")).equals(readFileSync(path.join(a, "vault.key")))).toBe(false);

  // Step 5: the same import into a is refused, and a's database is unchanged.
  await first.stop();
  const shaBefore = sha(path.join(a, "town.db"));
  const intoA = townd(["admin", "--data", a, "store", "import", "--key", key], env, exported.stdout);
  expect([intoA.exit, intoA.stderr]).toEqual([1, "townd admin: this town holds 1 user and 2 shops; import writes into an empty town alone\n"]);
  expect(sha(path.join(a, "town.db"))).toBe(shaBefore);

  // Step 6: --key missing, a key file missing, and another key: refused, and c holds no user.
  const c = path.join(root, "c");
  const noKey = townd(["admin", "--data", c, "store", "import"], env, exported.stdout);
  expect(noKey.exit).toBe(1);
  expect(lines(noKey.stderr)[0]).toBe("townd admin: store import needs --key <file>, the wagon's key: the file the wagon was packed with");
  const missing = townd(["admin", "--data", c, "store", "import", "--key", path.join(root, "nothing.key")], env, exported.stdout);
  expect([missing.exit, missing.stderr]).toEqual([1, `townd admin: --key ${path.join(root, "nothing.key")} does not exist; store import opens a wagon under the key it was packed with, and makes none\n`]);
  expect(existsSync(c)).toBe(false);
  const other = path.join(root, "other.key");
  writeFileSync(other, randomBytes(32), { mode: 0o600 });
  const wrong = townd(["admin", "--data", c, "store", "import", "--key", other], env, exported.stdout);
  expect(wrong.exit).toBe(1);
  expect(wrong.stderr).toMatch(/^townd admin: credential credential_[0-9a-f]{16} does not open under --key; the key is not the one this wagon was packed with, or the wagon is changed; 1 of 1 sealed values does not open\n$/);
  expect(townd(["admin", "--data", c, "user", "ls"], env).stdout).toBe("id  name  created\n");
  const short = path.join(root, "short.key");
  writeFileSync(short, "abc");
  expect(townd(["admin", "--data", c, "store", "import", "--key", short], env, exported.stdout).stderr).toBe(`townd admin: ${short} is 3 bytes, not the 32 of a wagon's key; name the key file this wagon was packed with\n`);

  // Step 7: --no-audit leaves the calls behind and counts them.
  const noAudit = townd(["admin", "--data", a, "store", "export", "--key", key, "--no-audit"], env);
  expect(noAudit.exit, noAudit.stderr).toBe(0);
  const light = JSON.parse(noAudit.stdout) as { calls: unknown[]; audit: boolean };
  expect([light.calls, light.audit]).toEqual([[], false]);
  expect(lines(noAudit.stderr)).toEqual([counts!.replace(/calls \d+/, "calls 0") + `; calls left behind: ${calls}`]);
  mkdirSync(path.join(root, "d"));
  expect(townd(["admin", "--data", path.join(root, "d"), "store", "import", "--key", key], env, noAudit.stdout).exit).toBe(0);
  expect(lines(townd(["admin", "--data", path.join(root, "d"), "audit"], env).stdout)).toHaveLength(1);
}, 120_000);

/** `townd admin --town` run in this process against a fake fetch that records each body posted and answers `answer`. */
async function overTheWire(argv: string[], stdin: string | null, answer = { stdout: "", stderr: "", exit: 0 }) {
  const posted: Array<{ url: string; body: string }> = [];
  vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit) => {
    posted.push({ url: String(url), body: String(init.body) });
    return Response.json(answer);
  });
  let stdout = "";
  let stderr = "";
  const home = tmp("wagon-wire-home");
  made.push(home);
  const io: Io = {
    out: (x) => void (stdout += x),
    err: (x) => void (stderr += x),
    env: { TOWN_OPERATOR: "operator-token-for-the-test", HOME: home },
    ...(stdin === null ? {} : { stdin: { isTTY: false, async *[Symbol.asyncIterator]() { yield Buffer.from(stdin, "utf8"); } } }),
  };
  const exit = await main(["--town", "https://box.example", ...argv], io, () => ({ refused: "no wall is chosen over --town" }));
  return { exit, stdout, stderr, posted };
}

it("reads the wagon's key at the laptop over --town, makes it there on export, and posts it as hex in the body's key, with neither --key nor its path in the posted argv", async () => {
  const root = tmp("wagon-wire");
  made.push(root);
  const keyFile = path.join(root, "wagon.key");
  const exported = await overTheWire(["store", "export", "--key", keyFile, "--no-audit"], null, { stdout: "{}\n", stderr: "users 0\n", exit: 0 });
  expect([exported.exit, exported.stdout]).toEqual([0, "{}\n"]);
  expect(exported.stderr).toBe(`townd admin: made ${keyFile}, the wagon's key, mode 600; it is the only copy, and without it this wagon's credentials do not open\nusers 0\n`);
  expect(statSync(keyFile).mode & 0o777).toBe(0o600);
  const hex = readFileSync(keyFile).toString("hex");
  expect(exported.posted).toHaveLength(1);
  expect(exported.posted[0]!.url).toBe("https://box.example/admin");
  expect(JSON.parse(exported.posted[0]!.body)).toEqual({ argv: ["store", "export", "--no-audit"], stdin: null, key: hex });

  // Import, the flag written with =: the wagon on stdin, the key in the body, and the words bare.
  const imported = await overTheWire(["store", "import", `--key=${keyFile}`], "{ \"wagon\": 1 }\n");
  expect(imported.exit).toBe(0);
  const body = JSON.parse(imported.posted[0]!.body) as { argv: string[]; stdin: string; key: string };
  expect(body).toEqual({ argv: ["store", "import"], stdin: "{ \"wagon\": 1 }\n", key: hex });
  // The guard: the posted argv holds neither --key nor the key's path, in any spelling, and the key's bytes appear only as `key`.
  for (const sent of [exported, imported].map((r) => JSON.parse(r.posted[0]!.body) as { argv: string[]; key: string })) {
    const words = JSON.stringify(sent.argv);
    expect(words).not.toContain("--key");
    expect(words).not.toContain(keyFile);
    expect(words).not.toContain(hex);
  }

  // A key file missing on import, and --key at any other verb: refused at the laptop, nothing posted.
  const missing = await overTheWire(["store", "import", "--key", path.join(root, "nothing.key")], "{}");
  expect([missing.exit, missing.posted]).toEqual([1, []]);
  const elsewhere = await overTheWire(["user", "ls", "--key", keyFile], null);
  expect([elsewhere.exit, elsewhere.stderr.split("\n")[0], elsewhere.posted]).toEqual([1, "townd admin: --key is store export's and store import's: the wagon's key", []]);
});

it("refuses a body past the door's limit before any fetch, naming its size, the limit, and --no-audit", async () => {
  const root = tmp("wagon-limit");
  made.push(root);
  const keyFile = path.join(root, "wagon.key");
  writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const wagon = `{"wagon":1,"calls":"${"x".repeat(BODY_LIMIT_BYTES)}"}`;
  const size = Buffer.byteLength(JSON.stringify({ argv: ["store", "import"], stdin: wagon, key: readFileSync(keyFile).toString("hex") }), "utf8");
  expect(size).toBeGreaterThan(BODY_LIMIT_BYTES);
  const r = await overTheWire(["store", "import", "--key", keyFile], wagon);
  expect([r.exit, r.stdout, r.stderr, r.posted]).toEqual([1, "", `townd admin: this verb's body is ${size} bytes, over the wire's limit of ${BODY_LIMIT_BYTES}; nothing was posted. A wagon's bulk is its audit: export it with --no-audit to leave the calls behind\n`, []]);
  // Just under the limit, it is posted.
  const fits = await overTheWire(["store", "import", "--key", keyFile], wagon.replace("x".repeat(size - BODY_LIMIT_BYTES), ""));
  expect([fits.exit, fits.posted.length]).toEqual([0, 1]);
  expect(Buffer.byteLength(fits.posted[0]!.body, "utf8")).toBe(BODY_LIMIT_BYTES);
});
