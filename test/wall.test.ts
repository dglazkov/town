// ring: checkout
// The wall, wall phase 0: `src/wall.ts` in process. The Seatbelt profile's
// text for a given enclosure, every path made real; a path or a port that
// would break the text refused before any process; `openWall("seatbelt")`
// refused on a box whose `wallOnThisBox()` is null, made so through the
// environment name the test alone sets; and wall's journey 2 steps 1 to 5,
// line by line: the prying fixture, copied into a data directory as a
// shop, run through `run` under `openWall("seatbelt", { data })`, the
// enclosure the runtime's own, with a credential over a fake origin, a
// stand-in for the town's address and process id, and a port the test
// listens on, all handed to it on stdin. Each
// refusal is logged with its errno, and a step's lines are checked softly,
// so a failing step names every line that failed. The data directory
// lives in /private/var/tmp, which the profile does not otherwise hide, so
// its own deny is what keeps the key. On a box without Seatbelt the tests
// that run under it say so and skip.

import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run, stateDir, type RunResult } from "../src/runtime.js";
import { loadShop } from "../src/shoptest.js";
import { openStore, type Store } from "../src/store.js";
import { ensureKey } from "../src/vault.js";
import { NO_WALL_ENV, SANDBOX_EXEC, openWall, wallOnThisBox, type Enclosure } from "../src/wall.js";
import { fakeOrigin, type FakeOrigin } from "./helpers/origin.js";

const BOX = wallOnThisBox();
const SEATBELT = BOX === "seatbelt";
const NEEDS = SEATBELT ? "on this box's seatbelt" : `needs a box with Seatbelt (${SANDBOX_EXEC}); this box's wall is ${BOX ?? "none"}, so it skips`;
const PRYING = path.resolve(import.meta.dirname, "fixtures/prying");
const MEMORY = path.resolve(import.meta.dirname, "../shops/memory");
const SECRET = "wall-test-not-a-token-5b2e90d1";

describe("the profile", () => {
  const home = () => realpathSync(os.userInfo().homedir);

  it.skipIf(!SEATBELT)(`is the design's text for a given enclosure, every path real, one line per port, ancestor (of the path as given and as real), read, and write (${NEEDS})`, () => {
    const within: Enclosure = { reads: ["/tmp/town-wall-profile/shop"], writes: ["/tmp/town-wall-profile/state/x"], ports: [4100, 4101] };
    const walled = openWall("seatbelt", { data: "/tmp/town-wall-profile" }).enclose("/usr/bin/true", ["one", "two words"], within);
    expect(walled.file).toBe(SANDBOX_EXEC);
    expect(walled.args.slice(0, 1)).toEqual(["-p"]);
    expect(walled.args.slice(2)).toEqual(["/usr/bin/true", "one", "two words"]);
    expect(walled.args[1]).toBe(
      [
        "(version 1)",
        "(allow default)",
        "(deny network*)",
        '(allow network-outbound (remote ip "localhost:4100"))',
        '(allow network-outbound (remote ip "localhost:4101"))',
        "(deny signal)",
        "(allow signal (target same-sandbox))",
        "(deny file-write*)",
        '(allow file-write* (literal "/dev/null"))',
        "(deny file-read* file-write*",
        `  (subpath "${home()}") (subpath "/tmp") (subpath "/private/tmp")`,
        '  (subpath "/private/var/folders") (subpath "/Volumes")',
        '  (subpath "/private/tmp/town-wall-profile"))',
        '(allow file-read-metadata (literal "/private/tmp/town-wall-profile"))',
        '(allow file-read-metadata (literal "/private/tmp"))',
        '(allow file-read-metadata (literal "/private"))',
        '(allow file-read-metadata (literal "/"))',
        '(allow file-read-metadata (literal "/private/tmp/town-wall-profile/state"))',
        // The ancestors of each path as given, through the link /tmp, so its lookup by that name resolves within the wall.
        '(allow file-read-metadata (literal "/tmp/town-wall-profile"))',
        '(allow file-read-metadata (literal "/tmp"))',
        '(allow file-read-metadata (literal "/tmp/town-wall-profile/state"))',
        '(allow file-read* (subpath "/private/tmp/town-wall-profile/shop"))',
        '(allow file-read* file-write* (subpath "/private/tmp/town-wall-profile/state/x"))',
        "",
      ].join("\n"),
    );
    const noData = openWall("seatbelt", {}).enclose("/usr/bin/true", [], { reads: [], writes: [], ports: [] }).args[1]!;
    expect(noData).toBe(
      [
        "(version 1)",
        "(allow default)",
        "(deny network*)",
        "(deny signal)",
        "(allow signal (target same-sandbox))",
        "(deny file-write*)",
        '(allow file-write* (literal "/dev/null"))',
        "(deny file-read* file-write*",
        `  (subpath "${home()}") (subpath "/tmp") (subpath "/private/tmp")`,
        '  (subpath "/private/var/folders") (subpath "/Volumes"))',
        "",
      ].join("\n"),
    );
  });

  it.skipIf(!SEATBELT)(`refuses a path with a quote, a backslash, or a newline, and a port out of range, before any process; a relative path is made absolute (${NEEDS})`, () => {
    const wall = openWall("seatbelt", {});
    const at = (within: Partial<Enclosure>) => () => wall.enclose("/usr/bin/true", [], { reads: [], writes: [], ports: [], ...within });
    expect(at({ reads: ['/private/var/tmp/a"b'] })).toThrow(/holds a quote, a backslash, or a control character/);
    expect(at({ writes: ["/private/var/tmp/a\\b"] })).toThrow(/holds a quote/);
    expect(at({ reads: ["/private/var/tmp/a\nb"] })).toThrow(/holds a quote/);
    expect(at({ reads: ["relative/dir"] })).not.toThrow(); // made absolute from here, as path.resolve does
    for (const port of [0, -1, 65536, 1.5, Number.NaN]) expect(at({ ports: [port] }), String(port)).toThrow(/is not a port the wall can open/);
    expect(at({ ports: [1, 65535] })).not.toThrow();
    expect(() => openWall("seatbelt", { data: '/private/var/tmp/da"ta' })).toThrow(/holds a quote/);
  });
});

describe("the box's wall", () => {
  it("is refused as seatbelt where wallOnThisBox() is null, through the environment name the test sets; none is still given", () => {
    const before = process.env[NO_WALL_ENV];
    process.env[NO_WALL_ENV] = "1";
    try {
      expect(wallOnThisBox()).toBeNull();
      expect(() => openWall("seatbelt", {})).toThrow(/this box has no seatbelt wall/);
      const none = openWall("none", {});
      expect(none.kind).toBe("none");
      expect(none.enclose("/usr/bin/true", ["a"], { reads: ["/x"], writes: [], ports: [1] })).toEqual({ file: "/usr/bin/true", args: ["a"] });
    } finally {
      if (before === undefined) delete process.env[NO_WALL_ENV];
      else process.env[NO_WALL_ENV] = before;
    }
    expect(wallOnThisBox()).toBe(process.platform === "darwin" && existsSync(SANDBOX_EXEC) ? "seatbelt" : null);
  });
});

interface Line {
  step: number;
  act: string;
  target: string;
  result: string;
  content?: string;
  status?: number;
  body?: string;
  path?: string;
}

describe.skipIf(!SEATBELT)(`journey 2, steps 1 to 5: a shop within its walls (${NEEDS})`, () => {
  let root: string;
  let data: string;
  let store: Store;
  let origin: FakeOrigin;
  let ran: RunResult;
  let town: http.Server;
  let townUrl: string;
  const townSeen: string[] = [];
  let listener: net.Server;
  let listenerPort: number;
  let knocks = 0;
  let lines: Line[];
  let stdout: string;
  let stderr: string;
  let shop: string;
  let state: string;
  const MARK = `town-prying-${randomBytes(6).toString("hex")}.txt`;
  const mark = () => MARK;

  beforeAll(async () => {
    // The data directory where the profile hides nothing else: /private/var/tmp.
    root = mkdtempSync(path.join(existsSync("/private/var/tmp") ? "/private/var/tmp" : os.tmpdir(), "town-wall-"));
    data = path.join(root, "town");
    store = openStore(data);
    ensureKey(data);
    writeFileSync(path.join(data, "town.db-wal"), existsSync(path.join(data, "town.db-wal")) ? readFileSync(path.join(data, "town.db-wal")) : "a write-ahead log\n");
    shop = path.join(store.shopsDir, "test%2Fprying");
    cpSync(PRYING, shop, { recursive: true });
    cpSync(MEMORY, path.join(store.shopsDir, "town%2Fmemory"), { recursive: true });
    mkdirSync(stateDir(store.stateRoot, "town/memory", "u1"), { recursive: true });
    writeFileSync(path.join(stateDir(store.stateRoot, "town/memory", "u1"), "notes"), "another shop's state\n");
    mkdirSync(stateDir(store.stateRoot, "test/prying", "someone-else"), { recursive: true });
    writeFileSync(path.join(stateDir(store.stateRoot, "test/prying", "someone-else"), "notes"), "another user's state\n");
    state = stateDir(store.stateRoot, "test/prying", "u1");
    mkdirSync(state, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(state, "kept.txt"), "kept from an earlier call\n");

    origin = await fakeOrigin();
    town = http.createServer((req, res) => {
      townSeen.push(`${req.method} ${req.url}`);
      res.end("town\n");
    });
    await new Promise<void>((r) => town.listen(0, "127.0.0.1", r));
    townUrl = `http://127.0.0.1:${(town.address() as net.AddressInfo).port}`;
    listener = net.createServer((s) => {
      knocks++;
      s.destroy();
    });
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    listenerPort = (listener.address() as net.AddressInfo).port;

    const manifest = await loadShop(shop, ["test-origin"]);
    ran = await run(shop, manifest, "pry", {}, {
      user: "u1",
      stateRoot: store.stateRoot,
      wall: openWall("seatbelt", { data }),
      credentials: [{ type: "test-origin", origin: origin.url, header: "Authorization: Bearer {token}", token: SECRET }],
      stdin: JSON.stringify({ town: townUrl, port: listenerPort, pid: process.pid, mark: MARK }),
      timeoutMs: 60_000,
    });
    ({ stdout, stderr } = ran);
    lines = stdout.trim().split("\n").map((l) => JSON.parse(l) as Line);
    for (const l of lines) {
      if (l.result !== "ok" && l.act !== "walk-up") console.log(`wall: step ${l.step} ${l.act} ${l.target}: ${l.result}`);
    }
  }, 90_000);

  afterAll(async () => {
    // Should a write outside the state ever get through, it does not stay on the box.
    for (const dir of ["/Users/Shared", "/tmp", os.userInfo().homedir, os.tmpdir()]) rmSync(path.join(dir, mark()), { force: true });
    store?.close();
    await origin?.close();
    await new Promise((r) => town?.close(r));
    await new Promise((r) => listener?.close(r));
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const real = (p: string) => realpathSync(p);
  const find = (act: string, target: string): Line => {
    const l = lines.find((x) => x.act === act && x.target === target);
    if (!l) throw new Error(`the entry printed no ${act} of ${target}`);
    return l;
  };
  const result = (act: string, target: string) => find(act, target).result;

  it("ran through run under the box's seatbelt, exit 0, with the state where stateDir puts it", () => {
    expect([ran.wall, ran.exit, ran.timedOut], ran.stderr).toEqual(["seatbelt", 0, false]);
    expect(ran.credentials).toEqual([{ type: "test-origin", requests: 1 }]);
    expect(find("list", state).result).toBe("ok");
  });

  it("1. reads its own directory and its state, writes its state, and is refused a write beside its entry", () => {
    expect.soft(stderr).toBe("");
    expect.soft(result("list", real(shop))).toBe("ok");
    expect.soft(find("read", path.join(real(shop), "main.mjs")).content).toBe(readFileSync(path.join(PRYING, "main.mjs"), "latin1"));
    expect.soft(result("read", path.join(real(shop), "manifest.yaml"))).toBe("ok");
    expect.soft(result("write", path.join(state, "pried.txt"))).toBe("ok");
    expect.soft(readFileSync(path.join(state, "pried.txt"), "utf8")).toBe("written by the prying entry\n");
    expect.soft(find("read", path.join(state, "kept.txt")).content).toBe("kept from an earlier call\n");
    expect.soft(result("write", path.join(real(shop), "beside-the-entry.txt"))).toBe("EPERM");
    expect.soft(existsSync(path.join(shop, "beside-the-entry.txt"))).toBe(false);
  });

  it("2. is refused the key, the database, the data directory, shops/, and every other shop's directory and state; nothing it can list walking up until the data directory's parent", () => {
    const d = real(data);
    expect.soft(find("computed", "data").path).toBe(d);
    for (const f of ["vault.key", "town.db", "town.db-wal"]) expect.soft([f, result("read", path.join(d, f))]).toEqual([f, "EPERM"]);
    for (const dir of [d, path.join(d, "shops"), path.join(d, "state"), path.join(d, "shops", "town%2Fmemory"), path.join(d, "state", "town%2Fmemory"), path.dirname(state)]) {
      expect.soft([dir, result("list", dir)]).toEqual([dir, "EPERM"]);
    }
    expect.soft(result("read", path.join(d, "shops", "town%2Fmemory", "manifest.yaml"))).toBe("EPERM");
    const up = lines.filter((l) => l.act === "walk-up");
    expect.soft(up[0]!.target).toBe(path.join(d, "shops"));
    const toData = up.slice(0, up.findIndex((l) => l.target === d) + 1);
    expect.soft(toData.map((l) => [l.target, l.result])).toEqual([
      [path.join(d, "shops"), "refused"],
      [d, "refused"],
    ]);
    console.log(`wall: step 2 walk-up above the data directory: ${up.slice(toData.length).map((l) => `${l.target} ${l.result}`).join(", ")}`);
    // No file under the data directory was read but the shop's own and its state's.
    for (const l of lines.filter((x) => x.act === "read" && x.result === "ok" && x.target.startsWith(d + path.sep))) {
      expect.soft(l.target.startsWith(real(shop) + path.sep) || l.target.startsWith(real(state) + path.sep) || l.target.startsWith(state + path.sep), l.target).toBe(true);
    }
    expect.soft(stdout).not.toContain("another shop's state");
    expect.soft(stdout).not.toContain("another user's state");
  });

  it("3. is refused the home, ~/.ssh, /tmp, and the town's temporary directory; reads /usr/bin/true and /etc/hosts; is refused a write anywhere but its state, /Users/Shared included", () => {
    const home = os.userInfo().homedir;
    expect.soft(result("list", home)).toBe("EPERM");
    expect.soft(result("read", path.join(home, ".zshrc"))).toBe("EPERM");
    expect.soft(result("list", path.join(home, ".ssh"))).toBe("EPERM");
    expect.soft(result("list", "/tmp")).toBe("EPERM");
    expect.soft(result("list", "/private/tmp")).toBe("EPERM");
    const tmp = find("computed", "tmpdir").path!;
    expect.soft(real(tmp)).toBe(real(os.tmpdir()));
    expect.soft(result("list", tmp)).toBe("EPERM");
    expect.soft(result("read", "/usr/bin/true")).toBe("ok");
    expect.soft(result("read", "/etc/hosts")).toBe("ok");
    for (const dir of ["/Users/Shared", "/tmp", home, tmp]) {
      const target = path.join(dir, mark());
      expect.soft([target, result("write", target)]).toEqual([target, "EPERM"]);
      expect.soft(existsSync(target), target).toBe(false);
    }
  });

  it("4. reaches the origin through its teller, signed by the town, and is refused at connect by the town's address, another port, and a public origin", () => {
    const via = find("connect", "teller");
    expect.soft([via.result, via.status, via.body]).toEqual(["ok", 200, "hello from the origin"]);
    expect.soft(origin.seen.map((s) => [s.method, s.url, s.headers.authorization])).toEqual([["GET", "/pried?by=entry", `Bearer ${SECRET}`]]);
    expect.soft(result("connect", "town")).toBe("EPERM");
    expect.soft(townSeen).toEqual([]);
    expect.soft(result("connect", "port")).toBe("EPERM");
    expect.soft(knocks).toBe(0);
    expect.soft(["EPERM", "ENOTFOUND"]).toContain(result("connect", "public"));
  });

  it("5. is refused kill -0 of the town's process, and starts and ends a child of its own", () => {
    expect.soft(result("kill-0", "town")).toBe("EPERM");
    expect.soft(result("child", "/bin/sleep")).toBe("ok");
  });

  it("prints nothing holding the credential's value, and read no file that could unseal it", () => {
    expect.soft(stdout).not.toContain(SECRET);
    expect.soft(stderr).not.toContain(SECRET);
    expect.soft(lines.some((l) => l.act === "read" && l.result === "ok" && /vault\.key|town\.db/.test(l.target))).toBe(false);
  });
});
