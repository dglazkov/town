// The prying entry: tries everything wall's journey 2 names and prints one
// JSON line per probe, { step, act, target, result, ... }, where result is
// "ok" or the error's code (EPERM, ENOENT, ENOTFOUND, TIMEOUT, ...). A
// file it can read is printed whole, as latin1, so nothing it reached is
// kept from the test. Its stdin is JSON: { town, port, pid, mark, public },
// each optional; a probe whose input is absent is not tried, `mark` names
// the file it tries to write outside its state, and `public: false` leaves
// out the request to a public origin, for a run with no wall to stop it. A write that succeeds
// outside its state is removed again at once.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const text = Buffer.concat(chunks).toString("utf8").trim();
const given = text ? JSON.parse(text) : {};

let step = 0;
const say = (line) => process.stdout.write(`${JSON.stringify({ step, ...line })}\n`);
const code = (e) => e.code ?? e.name ?? String(e);

function read(target) {
  try {
    const bytes = readFileSync(target);
    say({ act: "read", target, result: "ok", bytes: bytes.length, content: bytes.toString("latin1") });
  } catch (e) {
    say({ act: "read", target, result: code(e) });
  }
}

function list(target) {
  try {
    const names = readdirSync(target);
    say({ act: "list", target, result: "ok", names });
    return names;
  } catch (e) {
    say({ act: "list", target, result: code(e) });
    return null;
  }
}

/** Lists a directory and reads every file under it, recursively. */
function walk(dir) {
  const names = list(dir);
  for (const name of names ?? []) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch (e) {
      say({ act: "stat", target: full, result: code(e) });
      continue;
    }
    if (st.isDirectory()) walk(full);
    else read(full);
  }
}

function write(target, keep = false) {
  try {
    writeFileSync(target, "written by the prying entry\n", { flag: keep ? "w" : "wx" });
    if (!keep) unlinkSync(target);
    say({ act: "write", target, result: "ok" });
  } catch (e) {
    say({ act: "write", target, result: code(e) });
  }
}

function get(label, url) {
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    let settled = false;
    const done = (line) => {
      if (settled) return;
      settled = true;
      say({ act: "connect", target: label, url, ...line });
      resolve();
    };
    const req = client.get(url, { agent: false, timeout: 5000 }, (res) => {
      const body = [];
      res.on("data", (b) => body.push(b));
      res.on("end", () => done({ result: "ok", status: res.statusCode, body: Buffer.concat(body).toString("utf8") }));
    });
    req.on("timeout", () => {
      req.destroy();
      done({ result: "TIMEOUT" });
    });
    req.on("error", (e) => done({ result: code(e) }));
  });
}

const own = path.dirname(fileURLToPath(import.meta.url));
const state = process.env.TOWN_STATE;

// 1. Its own directory and its state, read; its state written; beside its entry, refused.
step = 1;
walk(own);
if (state) {
  write(path.join(state, "pried.txt"), true);
  walk(state);
}
write(path.join(own, "beside-the-entry.txt"));

// 2. The data directory, computed from its own path (data/shops/<shop>/), and everything in it.
step = 2;
const data = path.dirname(path.dirname(own));
say({ act: "computed", target: "data", result: "ok", path: data });
for (const f of ["vault.key", "town.db", "town.db-wal"]) read(path.join(data, f));
list(data);
list(path.join(data, "shops"));
list(path.join(data, "state"));
read(path.join(data, "shops", "town%2Fmemory", "manifest.yaml"));
list(path.join(data, "shops", "town%2Fmemory"));
list(path.join(data, "state", "town%2Fmemory"));
if (state) list(path.dirname(state));
for (let d = path.dirname(own); ; d = path.dirname(d)) {
  const names = list(d);
  say({ act: "walk-up", target: d, result: names ? "ok" : "refused" });
  if (d === path.dirname(d)) break;
}

// 3. The operator's home, the temporary directories, the box's own files, and writes anywhere else.
step = 3;
const home = os.userInfo().homedir;
list(home);
read(path.join(home, ".zshrc"));
list(path.join(home, ".ssh"));
list("/tmp");
list("/private/tmp");
let townTmp = null;
try {
  townTmp = execFileSync("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" }).trim();
} catch {
  // not a Mac: no per-user temporary directory to name
}
if (townTmp) {
  say({ act: "computed", target: "tmpdir", result: "ok", path: townTmp });
  list(townTmp);
}
read("/usr/bin/true");
read("/etc/hosts");
const mark = given.mark ?? `town-prying-${process.pid}.txt`;
write(path.join("/Users/Shared", mark));
write(path.join("/tmp", mark));
write(path.join(home, mark));
if (townTmp) write(path.join(townTmp, mark));

// 4. Its teller, then the town, a port the test listens on, and a public origin.
step = 4;
if (process.env.TOWN_CREDENTIAL_TEST_ORIGIN) await get("teller", `${process.env.TOWN_CREDENTIAL_TEST_ORIGIN}/pried?by=entry`);
if (given.town) await get("town", `${given.town}/`);
if (given.port) await get("port", `http://127.0.0.1:${given.port}/`);
if (given.public !== false) await get("public", "https://example.com/");

// 5. A signal to the town, and a child of its own started and ended.
step = 5;
if (given.pid) {
  try {
    process.kill(given.pid, 0);
    say({ act: "kill-0", target: "town", result: "ok" });
  } catch (e) {
    say({ act: "kill-0", target: "town", result: code(e) });
  }
}
await new Promise((resolve) => {
  const child = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
  child.on("error", (e) => {
    say({ act: "child", target: "/bin/sleep", result: code(e) });
    resolve();
  });
  child.on("spawn", () => {
    try {
      child.kill("SIGTERM");
    } catch (e) {
      say({ act: "child", target: "/bin/sleep", result: code(e) });
      resolve();
    }
  });
  child.on("exit", (exit, signal) => {
    say({ act: "child", target: "/bin/sleep", result: signal === "SIGTERM" ? "ok" : `exit ${exit} ${signal}`, signal });
    resolve();
  });
});
