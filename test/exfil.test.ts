// ring: command
// Vault's journey 3 step 5, turned around by wall's journey 2: the shop
// never holds the credential, and now it cannot read what would unseal it.
// A town served with no --wall, a credential type over a fake origin, a
// credential of dimitri's, and the prying fixture added as a shop with that
// need; the agent calls it with the town's own address, a port the test
// listens on (a second fake origin, so a request that got there is
// recorded), and the town's process id on stdin. The entry prints one line
// per probe. Walled: its own directory and its state read, its state
// written; vault.key and town.db EPERM, no file under the data directory
// read but its own, the home and /tmp refused; its teller's request
// arrives signed and the town, the port, and a public origin are refused
// at connect; the value is in nothing it printed, the audit, or the data
// directory; and the audit row says seatbelt. Then the same run under
// serve --wall none reads the key and the database:
// with no wall the entry runs as the operator's user, with the box's
// authority, and reads what the operator can.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ROOT, TOWN, agent, assertBuilt, cleanEnv, cleanup, originProcess, serve, tmp, type OriginProcess, type Town } from "./helpers/town.js";

const PRYING = path.join(ROOT, "test/fixtures/prying");
const SECRET = "exfil-test-not-a-token-3e9a71c4";

const made: string[] = [];
const towns: Town[] = [];
let origin: OriginProcess;
let listener: OriginProcess;
const said: Record<string, string> = {};

beforeAll(async () => {
  assertBuilt();
  origin = await originProcess();
  listener = await originProcess();
});

afterAll(async () => {
  for (const t of towns) await t.stop();
  await origin?.stop();
  await listener?.stop();
  cleanup(...made, ...towns.map((t) => t.env.HOME!));
});

interface Line {
  step: number;
  act: string;
  target: string;
  result: string;
  content?: string;
  bytes?: number;
  status?: number;
  body?: string;
  path?: string;
}

interface Pried {
  town: Town;
  data: string;
  shop: string;
  stdout: Buffer;
  stderr: Buffer;
  /** What the fake origin recorded during the agent's call. */
  seen: ReturnType<OriginProcess["seen"]>;
  lines: Line[];
  find(act: string, target: string): Line;
}

/** A town with the type, dimitri's credential, and the prying shop granted; the agent's call of it, stdin naming the town, the listener's port, and the town's pid. */
async function pry(label: string, wall: string[], extra: Record<string, unknown> = {}): Promise<Pried> {
  const root = tmp(`exfil-${label}`);
  made.push(root);
  const data = path.join(root, "town");
  const town = await serve(data, { flags: wall });
  towns.push(town);
  // The admin passes no --wall: the shop's own test at shop add runs walled by the box's, public probe and all, and only the agent's call runs within the town's.
  const admin = town.admin;
  expect(admin("type", "add", "test-origin", "--origin", origin.url, "--header", "Authorization: Bearer {token}").exit).toBe(0);
  expect(admin("user", "add", "dimitri").exit).toBe(0);
  const added = town.adminPiped(`${SECRET}\n`, "credential", "add", "--user", "dimitri", "--type", "test-origin");
  expect(added.exit, added.stderr).toBe(0);
  const shop = admin("shop", "add", PRYING, "--user", "dimitri");
  expect(shop.exit, shop.stdout + shop.stderr).toBe(0);
  const pass = admin("pass", "new", "--user", "dimitri", "--label", "prying");
  expect(admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "test/prying").exit).toBe(0);

  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);
  const port = new URL(listener.url).port;
  const seenBefore = origin.seen().length;
  const input = JSON.stringify({ town: town.url, port: Number(port), pid: town.pid, mark: `town-exfil-${label}-${process.pid}.txt`, ...extra });
  // As a.townPiped, through a shell pipe, with room for everything the entry prints.
  const r = spawnSync("/bin/sh", ["-c", 'printf %s "$TOWN_TEST_INPUT" | "$0" "$@"', process.execPath, TOWN, "prying", "pry"], {
    cwd: a.dir,
    env: { ...cleanEnv(a.home), TOWN_TEST_INPUT: input },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 512 * 1024 * 1024,
    timeout: 90_000,
  });
  expect(r.status, r.stderr.toString("utf8")).toBe(0);
  expect(r.stderr.toString("utf8")).toBe("");
  const lines = r.stdout.toString("utf8").trim().split("\n").map((l) => JSON.parse(l) as Line);
  const find = (act: string, target: string): Line => {
    const l = lines.find((x) => x.act === act && x.target === target);
    if (!l) throw new Error(`the entry printed no ${act} of ${target}`);
    return l;
  };
  return { town, data: realpathSync(data), shop: realpathSync(path.join(data, "shops", "test%2Fprying")), stdout: r.stdout, stderr: r.stderr, seen: origin.seen().slice(seenBefore), lines, find };
}

it("walled by the box's seatbelt with no flag: the entry reads its own directory and state and nothing that could unseal the credential, reaches its teller alone, and the audit says seatbelt", async () => {
  const p = await pry("walled", []);
  const { find, data, shop } = p;
  // The file it wrote under TOWN_STATE, which is data/state/<shop>/<user>.
  const state = p.lines.find((l) => l.act === "write" && path.basename(l.target) === "pried.txt")!.target;
  expect(realpathSync(path.dirname(state)).startsWith(path.join(data, "state", "test%2Fprying") + path.sep)).toBe(true);

  // Its own directory and its state, read; its state written.
  expect.soft(find("read", path.join(shop, "main.mjs")).content).toBe(readFileSync(path.join(PRYING, "main.mjs"), "latin1"));
  expect.soft(find("read", path.join(shop, "manifest.yaml")).result).toBe("ok");
  expect.soft(find("write", state).result).toBe("ok");
  expect.soft(find("read", state).content).toBe("written by the prying entry\n");
  expect.soft(find("write", path.join(shop, "beside-the-entry.txt")).result).toBe("EPERM");

  // The key and the database, by the paths it computed from its own: EPERM.
  expect(find("computed", "data").path).toBe(data);
  said.walled = `${find("read", path.join(data, "vault.key")).result} walled by ${/walled by (\S+)$/.exec(p.town.line)?.[1]}`;
  expect(find("read", path.join(data, "vault.key")).result, "vault.key, walled").toBe("EPERM");
  expect(find("read", path.join(data, "town.db")).result, "town.db, walled").toBe("EPERM");
  expect(find("read", path.join(data, "town.db-wal")).result, "town.db-wal, walled").toBe("EPERM");
  expect.soft(find("list", data).result).toBe("EPERM");
  expect.soft(find("list", path.join(data, "shops")).result).toBe("EPERM");
  // Walking up from its own directory, it lists nothing until the data directory's parent.
  const up = p.lines.filter((l) => l.act === "walk-up");
  expect.soft(up.slice(0, 2).map((l) => [l.target, l.result])).toEqual([[path.join(data, "shops"), "refused"], [data, "refused"]]);
  // No file under the data directory was read but the shop's own and its state's.
  const readUnder = p.lines.filter((l) => l.act === "read" && l.result === "ok" && l.target.startsWith(data + path.sep)).map((l) => l.target);
  expect(readUnder.length).toBeGreaterThan(0);
  for (const f of readUnder) expect.soft(f.startsWith(shop + path.sep) || realpathSync(f) === realpathSync(state), f).toBe(true);

  // The operator's home and /tmp, refused.
  const home = os.userInfo().homedir;
  expect.soft(find("list", home).result).toBe("EPERM");
  expect.soft(find("read", path.join(home, ".zshrc")).result).toBe("EPERM");
  expect.soft(find("list", "/tmp").result).toBe("EPERM");

  // Its teller's request arrived signed; the town, the test's port, and a public origin were refused at connect.
  expect(p.seen.map((s) => [s.method, s.url, s.headers.authorization])).toEqual([["GET", "/pried?by=entry", `Bearer ${SECRET}`]]);
  const teller = find("connect", "teller");
  expect([teller.result, teller.status, teller.body]).toEqual(["ok", 200, "hello from the origin"]);
  expect(find("connect", "town").result).toBe("EPERM");
  expect(find("connect", "port").result).toBe("EPERM");
  expect(listener.seen()).toEqual([]);
  expect(["EPERM", "ENOTFOUND"]).toContain(find("connect", "public").result);
  expect.soft(find("kill-0", "town").result).toBe("EPERM");

  // The value is in nothing it printed, the audit, or the data directory.
  const needle = Buffer.from(SECRET);
  expect(p.stdout.includes(needle), "the value in the entry's stdout").toBe(false);
  expect(p.stderr.includes(needle), "the value on stderr").toBe(false);
  const audit = p.town.admin("audit", "--shop", "test/prying");
  expect(audit.stdout + audit.stderr).not.toContain(SECRET);
  expect(allBytes(p.data).includes(needle), "the value in the data directory").toBe(false);
  // The row: ok, the shop's exit 0, one request served, no parent, walled by seatbelt; and serve said so.
  expect(p.town.line).toMatch(/, shops walled by seatbelt$/);
  expect(audit.stdout).toMatch(/\bpry\s+[0-9a-f]{64}\s+ok\s+0\s+0\s+\d+\s+-\s+test-origin:1\s+call_[0-9a-f]{16}\s+-\s+seatbelt\s+-$/m);
}, 120_000);

it("under --wall none, the same entry reads the key and the database: with no wall it runs with the box's authority, which the operator's user has", async () => {
  // The public origin is left out: with no wall nothing would stop a request leaving the box.
  const knocks = listener.seen().length;
  const p = await pry("unwalled", ["--wall", "none"], { public: false });
  const { find, data } = p;
  expect(p.town.line).toMatch(/, shops walled by none$/);
  const key = find("read", path.join(data, "vault.key"));
  said.unwalled = `${key.result} under --wall none`;
  expect(key.result, "vault.key, under --wall none").toBe("ok");
  expect(Buffer.from(key.content!, "latin1").equals(readFileSync(path.join(data, "vault.key")))).toBe(true);
  expect(find("read", path.join(data, "town.db")).result, "town.db, under --wall none").toBe("ok");
  expect(find("list", data).result).toBe("ok");
  expect(find("connect", "port").result).toBe("ok");
  expect(listener.seen().slice(knocks).map((s) => [s.method, s.url])).toEqual([["GET", "/"]]);
  expect(p.town.admin("audit", "--shop", "test/prying").stdout).toMatch(/\bpry\s+[0-9a-f]{64}\s+ok\s+0\s+0\s+\d+\s+-\s+test-origin:1\s+call_[0-9a-f]{16}\s+-\s+none\s+-$/m);
  console.log(`exfil: the prying entry's read of vault.key: ${said.walled ?? "not run walled"}; ${said.unwalled}, since an unwalled shop runs with the box's authority`);
}, 120_000);

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
