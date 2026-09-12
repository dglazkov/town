#!/usr/bin/env node
// The walk's stage, set up and struck; the walk itself is the conductor's.
//
//   node scripts/walk.mjs                    a town, a pass, a grant, and an agent's directory
//   node scripts/walk.mjs --status <root>    the walk pass's grants and audit, and rows by result
//   node scripts/walk.mjs --teardown <root>  stops the town and removes the walk root
//
// The walk root, under the system's temporary directory, holds three
// siblings: data/ (the town's), agent/ (the agent's, with .town/grant),
// and shim/ (a `town` for the agent's PATH, and nothing else). Plain
// Node, no dependency; it runs the built binaries, so build first.

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const TOWN = path.join(REPO, "bin", "town.js");
const TOWND = path.join(REPO, "bin", "townd.js");
const MEMORY = path.join(REPO, "shops", "memory");
const SELF = path.join(REPO, "scripts", "walk.mjs");

const COMMANDS = "remember,recall,list";
const CONSTRAINTS = ["remember.key prefix notes/", "recall.key prefix notes/", "list.prefix prefix notes/"];

function die(why) {
  process.stderr.write(`walk: ${why}\n`);
  process.exit(1);
}

/** The environment the operator's commands run in: nothing of a grant or a data directory inherited. */
function operatorEnv() {
  const env = { ...process.env };
  delete env.TOWN_GRANT;
  delete env.TOWN_DATA;
  return env;
}

function admin(data, ...args) {
  const r = spawnSync(process.execPath, [TOWND, "admin", "--data", data, ...args], { env: operatorEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", exit: r.status ?? -1 };
}

function mustAdmin(data, ...args) {
  const r = admin(data, ...args);
  if (r.exit !== 0) throw new Error(`townd admin ${args.join(" ")} exited ${r.exit}:\n${r.stderr}${r.stdout}`);
  return r;
}

/** Refuses when dist/ is missing or any src/*.ts is newer than its dist/*.js. */
function assertBuilt() {
  const src = path.join(REPO, "src");
  for (const e of readdirSync(src)) {
    if (!e.endsWith(".ts")) continue;
    const js = path.join(REPO, "dist", e.replace(/\.ts$/, ".js"));
    if (!existsSync(js)) die(`dist/${path.basename(js)} is missing; run pnpm build`);
    if (statSync(path.join(src, e)).mtimeMs > statSync(js).mtimeMs) die(`dist is older than src/${e}; run pnpm build`);
  }
}

/** The sentence, read from README.md's blockquote under "## The agent", so the two cannot drift. */
function sentence() {
  const readme = readFileSync(path.join(REPO, "README.md"), "utf8");
  const section = readme.split(/^## The agent$/m)[1];
  const line = section?.split("\n").find((l) => l.startsWith("> "));
  if (!line) die("README.md has no blockquote under ## The agent to read the sentence from");
  return line.slice(2).trim();
}

/** The `.town/grant` in `dir` or above it, the given path and the real one, or null. */
function grantAbove(dir) {
  for (const start of new Set([path.resolve(dir), realOf(dir)])) {
    let d = start;
    for (;;) {
      const candidate = path.join(d, ".town", "grant");
      if (existsSync(candidate)) return candidate;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  return null;
}

/** `dir` with links resolved in its parent, which exists. */
function realOf(dir) {
  return path.join(realpathSync(path.dirname(path.resolve(dir))), path.basename(dir));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function commandOf(pid) {
  const r = spawnSync("/bin/ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitGone(pid, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await pause(50)) if (!alive(pid)) return true;
  return !alive(pid);
}

/** `townd serve --data <data> --port 0`, detached, its output in <root>/townd.log; resolves with its pid and address. */
async function startTown(root, data) {
  const log = path.join(root, "townd.log");
  const fd = openSync(log, "a");
  const child = spawn(process.execPath, [TOWND, "serve", "--data", data, "--port", "0"], { env: operatorEnv(), detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  let exited = null;
  child.on("exit", (code, signal) => (exited = code ?? signal));
  child.unref();
  for (const end = Date.now() + 15_000; Date.now() < end; await pause(50)) {
    const m = /town listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(readFileSync(log, "utf8"));
    if (m) return { pid: child.pid, address: m[1] };
    if (exited !== null) throw new Error(`townd serve exited ${exited}:\n${readFileSync(log, "utf8")}`);
  }
  process.kill(child.pid, "SIGTERM");
  throw new Error(`townd serve printed no address in 15s:\n${readFileSync(log, "utf8")}`);
}

async function setUp() {
  assertBuilt();
  const said = sentence();
  const root = mkdtempSync(path.join(os.tmpdir(), "town-walk-"));
  const data = path.join(root, "data");
  const agent = path.join(root, "agent");
  const shim = path.join(root, "shim");
  let town = null;
  try {
    const above = grantAbove(data);
    if (above) throw new Error(`${above} makes ${data} an agent's directory; set TMPDIR to a directory with no .town/grant in it or above it`);
    mkdirSync(data);
    mkdirSync(path.join(agent, ".town"), { recursive: true });
    mkdirSync(shim);
    writeFileSync(path.join(shim, "town"), `#!/bin/sh\nexec '${process.execPath}' '${TOWN}' "$@"\n`);
    chmodSync(path.join(shim, "town"), 0o755);

    town = await startTown(root, data);
    mustAdmin(data, "shop", "add", MEMORY);
    mustAdmin(data, "user", "add", "walker");
    const pass = mustAdmin(data, "pass", "new", "--user", "walker", "--label", "walk");
    const passId = pass.stderr.trim();
    const grantFile = path.join(agent, ".town", "grant");
    writeFileSync(grantFile, pass.stdout, { mode: 0o600 });
    const grant = mustAdmin(data, "grant", "new", "--pass", passId, "--shop", "town/memory", "--commands", COMMANDS, ...CONSTRAINTS.flatMap((c) => ["--constraint", c]), "--expires", "30d");
    const grantId = grant.stdout.trim();
    if (grantAbove(data)) throw new Error(`the data directory ${data} is under a grant file; the walk root is laid out wrong`);

    const walk = { root, data, agent, shim, grantFile, address: town.address, pid: town.pid, passId, grantId, sentence: said };
    writeFileSync(path.join(root, "walk.json"), `${JSON.stringify(walk, null, 2)}\n`);

    process.stdout.write(
      [
        `walk ready: ${root}`,
        ``,
        `the town:    ${town.address} (pid ${town.pid}), pass ${passId}, grant ${grantId}`,
        `the grant:   town/memory ${COMMANDS}; ${CONSTRAINTS.join("; ")}; expires 30d`,
        ``,
        `start the agent in:`,
        `  cd ${agent}`,
        `  export PATH="${shim}:$PATH"`,
        ``,
        `the sentence:`,
        `  ${said}`,
        ``,
        `for admin commands:`,
        `  export TOWN_DATA=${data}`,
        `  node ${TOWND} admin grant ls --pass ${passId}`,
        ``,
        `status:      node ${SELF} --status ${root}`,
        `teardown:    node ${SELF} --teardown ${root}`,
        ``,
      ].join("\n"),
    );
  } catch (err) {
    if (town && alive(town.pid)) {
      process.kill(town.pid, "SIGTERM");
      await waitGone(town.pid, 5000);
    }
    rmSync(root, { recursive: true, force: true });
    die(err.message);
  }
}

function readWalk(root) {
  if (!root) die("name the walk root: --status <root> or --teardown <root>");
  const file = path.join(path.resolve(root), "walk.json");
  if (!existsSync(file)) die(`${root} has no walk.json; it is not a walk root, and nothing was touched`);
  const walk = JSON.parse(readFileSync(file, "utf8"));
  if (path.resolve(walk.root) !== path.resolve(root)) die(`${file} names a different root, ${walk.root}; nothing was touched`);
  return walk;
}

/** The column under `name` in a table townd admin printed, by the header's offsets. */
function column(table, name) {
  const [header, ...rows] = table.split("\n").filter((l) => l !== "");
  const start = header.indexOf(name);
  const next = header.slice(start + name.length).search(/\S/);
  const end = next === -1 ? undefined : start + name.length + next;
  return rows.map((r) => r.slice(start, end).trim());
}

function status(root) {
  const walk = readWalk(root);
  const up = alive(walk.pid) && commandOf(walk.pid).includes(walk.data);
  process.stdout.write(`walk ${walk.root}\nthe town: ${walk.address}, pid ${walk.pid} ${up ? "running" : "not running"}\n\n`);
  const grants = admin(walk.data, "grant", "ls", "--pass", walk.passId);
  const audit = admin(walk.data, "audit", "--pass", walk.passId);
  if (grants.exit !== 0 || audit.exit !== 0) die(`townd admin failed:\n${grants.stderr}${audit.stderr}`);
  process.stdout.write(`grants of ${walk.passId}:\n${grants.stdout}\naudit of ${walk.passId}:\n${audit.stdout}\n`);
  const counts = new Map([["ok", 0], ["denied", 0]]);
  for (const r of column(audit.stdout, "result")) counts.set(r, (counts.get(r) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  process.stdout.write(`rows: ${total}; ${[...counts].map(([k, v]) => `${k} ${v}`).join(", ")}\n`);
}

async function teardown(root) {
  const walk = readWalk(root);
  if (alive(walk.pid)) {
    const cmd = commandOf(walk.pid);
    if (!cmd.includes("serve") || !cmd.includes(walk.data)) die(`pid ${walk.pid} is not this walk's town (${cmd}); stop the town yourself, then tear down again`);
    process.kill(walk.pid, "SIGTERM");
    if (!(await waitGone(walk.pid, 5000))) {
      process.kill(walk.pid, "SIGKILL");
      if (!(await waitGone(walk.pid, 2000))) die(`pid ${walk.pid} did not stop; ${walk.root} is kept`);
    }
    process.stdout.write(`stopped the town, pid ${walk.pid}\n`);
  } else {
    process.stdout.write(`the town, pid ${walk.pid}, was not running\n`);
  }
  rmSync(walk.root, { recursive: true, force: true });
  if (existsSync(walk.root)) die(`${walk.root} is still there`);
  process.stdout.write(`removed ${walk.root}\n`);
}

const [flag, root, ...extra] = process.argv.slice(2);
if (extra.length) die(`too many words: ${extra.join(" ")}`);
if (flag === undefined) await setUp();
else if (flag === "--status") status(root);
else if (flag === "--teardown") await teardown(root);
else die(`${flag} is not a walk flag; write nothing, --status <root>, or --teardown <root>`);
