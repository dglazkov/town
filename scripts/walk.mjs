#!/usr/bin/env node
// The walk's stage, set up and struck; the walk itself is the conductor's.
//
//   node scripts/walk.mjs                    a town, the memory shop, a pass, a grant, and an agent's directory
//   node scripts/walk.mjs --shop github --repo <owner/name> < <token file>
//                                            the same for the github shop, on the token read from stdin
//   node scripts/walk.mjs --shop watch --repo <owner/name> < <token file>
//                                            github, memory, and watch over them, three grants, on the token read from stdin
//   node scripts/walk.mjs --shop hall        the memory shop, a pass with the hall whole and memory at three commands; no token
//   node scripts/walk.mjs --shop hall --data <dir>
//                                            the same over an existing data directory, served as it is: memory added only
//                                            when missing, dimitri reused, and a grant at town/gdocs read when the town holds
//                                            it and dimitri a live google-oauth credential; the directory is never removed
//   node scripts/walk.mjs --status <root>    the walk pass's grants, its audit as a tree by parent, rows by result and by wall, credentials served,
//                                            and the hall's rows by command and detail with the grants' sources; since the
//                                            walk began, publishes that asked a permit, approvals with their tests, consents,
//                                            and refreshes
//   node scripts/walk.mjs --search <root> [<path>...] < <token file>
//                                            files under the root and the paths holding the token's bytes
//   node scripts/walk.mjs --search-sealed <root> [<path>...]
//                                            every secret the town holds sealed, opened with its key in this process, and
//                                            the files under the root, the paths, and the data directory holding its bytes,
//                                            named and never printed
//   node scripts/walk.mjs --teardown <root>  stops the town and removes the walk root, never a data directory given
//
// The token is read from stdin, a pipe or a file and never a terminal,
// and goes nowhere but the stdin of `townd admin credential add`: not
// argv, not any child's environment, not walk.json, not stdout. A sealed
// secret `--search-sealed` opens stays in its process's memory.
//
// The walk root, under the system's temporary directory, holds three
// siblings: data/ (the town's, unless --data names one elsewhere), agent/
// (the agent's, with .town/grant), and shim/ (a `town` for the agent's
// PATH, and nothing else). Plain Node, no dependency; it runs the built
// binaries, and `--data` and `--search-sealed` import dist/store.js and
// dist/vault.js, so build first.

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const TOWN = path.join(REPO, "bin", "town.js");
const TOWND = path.join(REPO, "bin", "townd.js");
const MEMORY = path.join(REPO, "shops", "memory");
const SELF = path.join(REPO, "scripts", "walk.mjs");

const GITHUB = path.join(REPO, "shops", "github");
const WATCH = path.join(REPO, "shops", "watch");
/** `owner/name`, each part of GitHub's characters and neither `.` nor `..`: what shops/github/main.mjs accepts. */
const REPO_SHAPE = /^(?![.]{1,2}\/)[A-Za-z0-9_.-]+\/(?![.]{1,2}$)[A-Za-z0-9_.-]+$/;

/**
 * What the stage holds: the shops added, in order, the ones whose tests
 * run on the walker's credential marked `user`; the grants made, in order,
 * a composed shop's after its dependencies'; the shop the walk is of; and
 * the narrowing printed for the conductor, a grant at one shop replaced by
 * a narrower one. The memory shop under notes/; the github shop on one
 * repository; or watch over github on that repository and memory.
 */
function memoryPlan() {
  return {
    shops: [{ dir: MEMORY }],
    grants: [{ shop: "town/memory", commands: "remember,recall,list", constraints: ["remember.key prefix notes/", "recall.key prefix notes/", "list.prefix prefix notes/"] }],
    shop: "town/memory",
    expires: "30d",
  };
}

const onRepo = (repo, commands) => commands.split(",").map((c) => `${c}.repo equals ${repo}`);

function githubPlan(repo, token) {
  return {
    shops: [{ dir: GITHUB, user: true }],
    grants: [{ shop: "town/github", commands: "list,show,reply", constraints: onRepo(repo, "list,show,reply") }],
    shop: "town/github",
    repo,
    token,
    narrowed: { shop: "town/github", commands: "list,show", constraints: onRepo(repo, "list,show") },
    expires: "1d",
  };
}

/** Journey 1's pass: github at list and show on the one repository, memory at three commands, watch at both, unconstrained. */
function watchPlan(repo, token) {
  return {
    shops: [{ dir: GITHUB, user: true }, { dir: MEMORY }, { dir: WATCH, user: true }],
    grants: [
      { shop: "town/github", commands: "list,show", constraints: onRepo(repo, "list,show") },
      { shop: "town/memory", commands: "remember,recall,list", constraints: [] },
      { shop: "town/watch", commands: "mark,changes", constraints: [] },
    ],
    shop: "town/watch",
    repo,
    token,
    narrowed: { shop: "town/memory", commands: "recall", constraints: [] },
    expires: "1d",
  };
}

/** The hall's walk, journey 1's pass: dimitri's, the hall with every command and memory at remember, recall, and list, unconstrained. */
function hallPlan() {
  return {
    user: "dimitri",
    shops: [{ dir: MEMORY, name: "town/memory" }],
    grants: [
      { shop: "town/hall", commands: "search,show,spec,validate,test,publish,request,requests", constraints: [] },
      { shop: "town/memory", commands: "remember,recall,list", constraints: [] },
    ],
    shop: "town/hall",
    permits: true,
    // Over a given data directory: a grant at this shop, bound to the user's live credential of this type, when the town holds both.
    reader: { shop: "town/gdocs", commands: "read", type: "google-oauth" },
    expires: "1d",
  };
}

const PLANS = { github: githubPlan, watch: watchPlan };

function die(why, code = 1) {
  process.stderr.write(`walk: ${why}\n`);
  process.exit(code);
}

/** The environment the operator's commands run in: nothing of a grant or a data directory inherited. */
function operatorEnv() {
  const env = { ...process.env };
  delete env.TOWN_GRANT;
  delete env.TOWN_DATA;
  return env;
}

/** `townd admin --data <data> ...args`; `secret`, when given, is its stdin and nothing else of it. */
function adminWith(secret, data, ...args) {
  const stdin = secret === undefined ? "ignore" : "pipe";
  const r = spawnSync(process.execPath, [TOWND, "admin", "--data", data, ...args], { env: operatorEnv(), encoding: "utf8", stdio: [stdin, "pipe", "pipe"], timeout: 120_000, ...(secret === undefined ? {} : { input: secret }) });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", exit: r.status ?? -1 };
}

const admin = (data, ...args) => adminWith(undefined, data, ...args);

function mustAdmin(data, ...args) {
  return mustAdminWith(undefined, data, ...args);
}

function mustAdminWith(secret, data, ...args) {
  const r = adminWith(secret, data, ...args);
  if (r.exit !== 0) throw new Error(`townd admin ${args.join(" ")} exited ${r.exit}:\n${r.stderr}${r.stdout}`);
  return r;
}

/**
 * The token: the whole of stdin, less one trailing newline, as `townd admin
 * credential add` reads it. A terminal is refused, since what is typed
 * there is echoed; so is nothing.
 */
async function readToken(what, code = 1) {
  if (process.stdin.isTTY) die(`${what} reads the token on stdin, and stdin is a terminal; redirect it from a file or pipe it in`, code);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const value = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  if (value === "") die(`${what} read nothing on stdin; redirect the token from a file or pipe it in`, code);
  return value;
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
    const m = /town listening on (http:\/\/127\.0\.0\.1:\d+), shops walled by (\S+)\n/.exec(readFileSync(log, "utf8"));
    if (m) return { pid: child.pid, address: m[1], wall: m[2] };
    if (exited !== null) throw new Error(`townd serve exited ${exited}:\n${readFileSync(log, "utf8")}`);
  }
  process.kill(child.pid, "SIGTERM");
  throw new Error(`townd serve printed no address in 15s:\n${readFileSync(log, "utf8")}`);
}

/** Every `townd … serve` on this box, by pid and command line. */
function servingTowns() {
  const r = spawnSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  return (r.stdout ?? "")
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(.*)$/.exec(l))
    .filter((m) => m && /townd(\.js)?\s+serve(\s|$)/.test(m[2]))
    .map((m) => ({ pid: Number(m[1]), command: m[2] }));
}

/** dist/store.js and dist/vault.js, the store's own code, imported as the town runs it. */
async function storeCode() {
  const [store, vault] = await Promise.all([import(path.join(REPO, "dist", "store.js")), import(path.join(REPO, "dist", "vault.js"))]);
  return { openStore: store.openStore, readKey: vault.readKey };
}

/**
 * `--data <dir>`: an existing town's data directory, resolved, or a refusal
 * before anything is made or touched: no town.db in it, under an agent's
 * directory, or a town serving it already, by the process list or by an
 * answer at the address it last served at.
 */
async function givenData(dir) {
  const data = path.resolve(dir);
  if (!existsSync(data) || !statSync(data).isDirectory()) die(`--data ${dir} is not a directory; name an existing town's data directory`);
  if (!existsSync(path.join(data, "town.db"))) die(`--data ${dir} holds no town.db, so it is not a town's data directory; nothing was touched`);
  const above = grantAbove(data);
  if (above) die(`${above} makes ${data} an agent's directory, and a data directory is never under one; nothing was touched`);
  const spellings = new Set([dir, data, realpathSync(data)]);
  for (const t of servingTowns()) {
    if ([...spellings].some((s) => t.command.includes(`--data ${s} `) || t.command.endsWith(`--data ${s}`))) die(`a town is serving ${data} already (pid ${t.pid}); stop it, then stage again; nothing was touched`);
  }
  const { openStore } = await storeCode();
  const store = openStore(data);
  const address = store.getMeta("address");
  store.close();
  if (address) {
    const answer = await fetch(address, { signal: AbortSignal.timeout(1000) }).then((r) => r.text(), () => null);
    if (answer === "town\n") die(`a town answers at ${address}, where ${data} was last served; stop it, then stage again; nothing was touched`);
  }
  return data;
}

async function setUp(plan, given) {
  assertBuilt();
  const said = sentence();
  const root = mkdtempSync(path.join(os.tmpdir(), "town-walk-"));
  const data = given ?? path.join(root, "data");
  const agent = path.join(root, "agent");
  const shim = path.join(root, "shim");
  let town = null;
  try {
    const above = grantAbove(data);
    if (above) throw new Error(`${above} makes ${data} an agent's directory; set TMPDIR to a directory with no .town/grant in it or above it`);
    if (given === undefined) mkdirSync(data);
    mkdirSync(path.join(agent, ".town"), { recursive: true });
    mkdirSync(shim);
    if (!path.relative(realpathSync(agent), realpathSync(data)).startsWith("..")) throw new Error(`the data directory ${data} is under the agent's directory ${agent}`);
    writeFileSync(path.join(shim, "town"), `#!/bin/sh\nexec '${process.execPath}' '${TOWN}' "$@"\n`);
    chmodSync(path.join(shim, "town"), 0o755);

    // The rows a given town recorded before the walk: the audit lists them first, and --status counts past them.
    const auditBefore = given === undefined ? 0 : column(mustAdmin(data, "audit").stdout, "call").length;
    const startedAt = Date.now();
    town = await startTown(root, data);
    const user = plan.user ?? "walker";
    // Over a given directory, what the town already holds is kept: its user, and its shops.
    const kept = [];
    const added = [];
    if (given !== undefined && column(mustAdmin(data, "user", "ls").stdout, "name").includes(user)) kept.push(`user ${user}`);
    else {
      mustAdmin(data, "user", "add", user);
      added.push(`user ${user}`);
    }
    if (plan.token !== undefined) mustAdminWith(`${plan.token}\n`, data, "credential", "add", "--user", user, "--type", "github-token", "--label", "walk");
    const held = given === undefined ? [] : column(mustAdmin(data, "shop", "ls").stdout, "name");
    for (const shop of plan.shops) {
      if (shop.name && held.includes(shop.name)) {
        kept.push(`shop ${shop.name}`);
        continue;
      }
      // A shop marked `user` runs its tests through a teller against GitHub, on the walker's token, its dependencies' tests included.
      const addedShop = mustAdmin(data, "shop", "add", shop.dir, ...(shop.user ? ["--user", user] : []));
      if (shop.name) added.push(`shop ${shop.name}`);
      if (plan.token !== undefined) process.stdout.write(addedShop.stdout);
    }
    const pass = mustAdmin(data, "pass", "new", "--user", user, "--label", "walk");
    const passId = pass.stderr.trim();
    const grantFile = path.join(agent, ".town", "grant");
    writeFileSync(grantFile, pass.stdout, { mode: 0o600 });
    const grantArgs = (shop, commands, constraints) => ["--pass", passId, "--shop", shop, "--commands", commands, ...constraints.flatMap((c) => ["--constraint", c]), "--expires", plan.expires];
    const grants = {};
    for (const g of plan.grants) grants[g.shop] = mustAdmin(data, "grant", "new", ...grantArgs(g.shop, g.commands, g.constraints)).stdout.trim();
    const grantId = grants[plan.shop];
    const reader = given !== undefined && plan.reader ? readerGrant(data, user, plan.reader, (credential) => [...grantArgs(plan.reader.shop, plan.reader.commands, []), "--credential", credential]) : null;
    if (reader?.grant) grants[plan.reader.shop] = reader.grant;
    if (grantAbove(data)) throw new Error(`the data directory ${data} is under a grant file; the walk root is laid out wrong`);

    const walk = {
      root,
      data,
      ...(given === undefined ? {} : { dataGiven: true }),
      agent,
      shim,
      grantFile,
      address: town.address,
      wall: town.wall,
      pid: town.pid,
      startedAt,
      auditBefore,
      passId,
      grantId,
      grants,
      ...(reader ? { reader } : {}),
      sentence: said,
      shop: plan.shop,
      ...(plan.repo ? { repo: plan.repo } : {}),
    };
    writeFileSync(path.join(root, "walk.json"), `${JSON.stringify(walk, null, 2)}\n`);
    const quote = (w) => (/^[A-Za-z0-9_./:,=-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
    const n = plan.narrowed;
    const narrowing = n
      ? [
          `to narrow the grant at ${n.shop} to ${n.commands.replace(/,([^,]*)$/, " and $1").replace(/,/g, ", ")}, under the running agent:`,
          `  node ${TOWND} admin grant revoke ${grants[n.shop]}`,
          `  node ${TOWND} admin grant new ${grantArgs(n.shop, n.commands, n.constraints).map(quote).join(" ")}`,
          ``,
        ]
      : [];
    const permits = plan.permits
      ? [`to decide what the agent asks for, at the box:`, `  node ${TOWND} admin permit ls --pass ${passId}`, `  node ${TOWND} admin permit show <id>`, `  node ${TOWND} admin permit approve <id>`, ``]
      : [];

    process.stdout.write(
      [
        `walk ready: ${root}`,
        ``,
        `the town:    ${town.address} (pid ${town.pid}), pass ${passId}, shops walled by ${town.wall}`,
        ...(given === undefined ? [] : [`the data:    ${data}, given, and kept at teardown; ${[kept.length ? `kept ${kept.join(", ")}` : "", added.length ? `added ${added.join(", ")}` : ""].filter(Boolean).join("; ")}`]),
        ...plan.grants.map((g, i) => `${(i === 0 ? "the grants:" : "").padEnd(13)}${grants[g.shop]} ${g.shop} ${g.commands}; ${g.constraints.length ? g.constraints.join("; ") : "no constraints"}; expires ${plan.expires}`),
        ...(reader ? [`${"".padEnd(13)}${reader.said}`] : []),
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
        ...narrowing,
        ...permits,
        `status:      node ${SELF} --status ${root}`,
        ...(plan.token === undefined ? [] : [`search:      node ${SELF} --search ${root} <transcript> < <token file>`]),
        ...(given === undefined ? [] : [`search:      node ${SELF} --search-sealed ${root} <transcript> <scratch>...`]),
        `teardown:    node ${SELF} --teardown ${root}`,
        ``,
      ].join("\n"),
    );
  } catch (err) {
    if (town && alive(town.pid)) {
      process.kill(town.pid, "SIGTERM");
      await waitGone(town.pid, 5000);
    }
    // The walk root alone: a given data directory is never under it, and is never removed.
    rmSync(root, { recursive: true, force: true });
    die(err.message);
  }
}

/**
 * The grant at `reader.shop` a given town can make: when it holds the shop
 * and `user` a live credential of `reader.type`, bound to the newest; else
 * no grant, and why. What to print either way.
 */
function readerGrant(data, user, reader, argsFor) {
  if (!column(mustAdmin(data, "shop", "ls").stdout, "name").includes(reader.shop)) return { said: `no grant at ${reader.shop}: the town holds no ${reader.shop}` };
  const creds = mustAdmin(data, "credential", "ls", "--user", user).stdout;
  const [ids, types, states] = ["id", "type", "state"].map((c) => column(creds, c));
  const live = ids.filter((_, i) => types[i] === reader.type && states[i] === "active");
  if (live.length === 0) return { said: `no grant at ${reader.shop}: ${user} holds no live ${reader.type} credential` };
  const credential = live.at(-1);
  const grant = mustAdmin(data, "grant", "new", ...argsFor(credential)).stdout.trim();
  return { grant, credential, said: `${grant} ${reader.shop} ${reader.commands}; no constraints; bound to ${credential}, ${user}'s ${reader.type}${live.length > 1 ? `, the newest of ${live.length}` : ""}` };
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
  process.stdout.write(`grants of ${walk.passId}:\n${grants.stdout}\naudit of ${walk.passId}, as a tree by parent:\n${tree(audit.stdout)}\n`);
  const counts = new Map([["ok", 0], ["denied", 0]]);
  for (const r of column(audit.stdout, "result")) counts.set(r, (counts.get(r) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  process.stdout.write(`rows: ${total}; ${[...counts].map(([k, v]) => `${k} ${v}`).join(", ")}\n`);
  // The wall column: the kind a call's process ran within, `-` when none ran (denied, refused, the hall's own).
  const walls = new Map([["seatbelt", 0], ["none", 0], ["-", 0]]);
  for (const w of column(audit.stdout, "wall")) walls.set(w, (walls.get(w) ?? 0) + 1);
  process.stdout.write(`rows by wall: ${[...walls].filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}\n`);

  // The credentials column: `<type>:<requests>` comma-separated, or `-` when none was served.
  const shop = walk.shop ?? "town/memory";
  const results = column(audit.stdout, "result");
  const shops = column(audit.stdout, "shop");
  const served = column(audit.stdout, "credentials");
  const commands = column(audit.stdout, "command");
  const types = new Map();
  const bare = new Map();
  served.forEach((cell, i) => {
    if (cell === "-" || cell === "") {
      // A help row calls no command, so it is counted apart from an ok or denied call.
      const kind = commands[i] === "-" ? "help" : results[i];
      if (shops[i] === shop) bare.set(kind, (bare.get(kind) ?? 0) + 1);
      return;
    }
    for (const part of cell.split(",")) {
      const [type, n] = [part.slice(0, part.lastIndexOf(":")), Number(part.slice(part.lastIndexOf(":") + 1))];
      const t = types.get(type) ?? { requests: 0, rows: 0, none: 0 };
      t.requests += n;
      t.rows += 1;
      if (n === 0) t.none += 1;
      types.set(type, t);
    }
  });
  if (types.size === 0) process.stdout.write(`credentials: none served\n`);
  for (const [type, t] of types) process.stdout.write(`credentials: ${type} ${t.requests} requests over ${t.rows} rows, ${t.none} of them with none\n`);
  const bareTotal = [...bare.values()].reduce((a, b) => a + b, 0);
  process.stdout.write(`rows for ${shop} with no credential served: ${bareTotal}${bareTotal ? `; ${[...bare].map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}\n`);
  if (shop === "town/hall") process.stdout.write(hallCounts(audit.stdout, grants.stdout) + sinceWalk(walk));
}

/** An audit table's rows as objects of the named columns. */
function rowsOf(table, names) {
  const cols = Object.fromEntries(names.map((n) => [n, column(table, n)]));
  return (cols[names[0]] ?? []).map((_, i) => Object.fromEntries(names.map((n) => [n, cols[n][i]])));
}

/**
 * What the town recorded since the walk began, under any pass or none: the
 * rows by shop with their results and credentials; the publishes that asked
 * a permit; the approvals of this pass's permits, each with the rows made
 * under it; the consents; and the refreshes by type. The audit less the
 * rows a given town held before the stage, which it lists first, since it
 * orders rows by their times to the millisecond.
 */
function sinceWalk(walk) {
  const audit = admin(walk.data, "audit");
  const permits = admin(walk.data, "permit", "ls", "--pass", walk.passId);
  if (audit.exit !== 0 || permits.exit !== 0) die(`townd admin failed:\n${audit.stderr}${permits.stderr}`);
  const before = walk.auditBefore ?? 0;
  const rows = rowsOf(audit.stdout, ["call", "at", "pass", "shop", "command", "result", "credentials", "parent", "detail"]).slice(before);
  const ours = new Set(column(permits.stdout, "id"));
  const said = (m) => [...m].map(([k, v]) => `${k} ${v}`).join(", ");
  const tally = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  const lines = [`since the walk began: ${rows.length} rows${before ? `, after the ${before} the town held before it` : ""}`];

  const byShop = new Map();
  for (const r of rows) {
    const s = byShop.get(r.shop) ?? { results: new Map(), credentials: new Map(), passes: new Set() };
    tally(s.results, r.command === "-" && r.parent === "-" && r.pass !== "-" ? "help" : r.result);
    if (r.credentials !== "-") for (const part of r.credentials.split(",")) tally(s.credentials, part.slice(0, part.lastIndexOf(":")), Number(part.slice(part.lastIndexOf(":") + 1)));
    s.passes.add(r.pass === walk.passId ? "the walk's pass" : r.pass === "-" ? "no pass" : r.pass);
    byShop.set(r.shop, s);
  }
  lines.push(`rows by shop:`);
  for (const [name, s] of byShop) lines.push(`  ${name === "-" ? "no shop" : name}: ${said(s.results)}; ${s.credentials.size ? `credentials ${[...s.credentials].map(([t, n]) => `${t} ${n} requests`).join(", ")}` : "no credential served"}; under ${[...s.passes].join(", ")}`);

  const published = rows.filter((r) => r.shop === "town/hall" && r.command === "publish" && /^published \S+ \S+; requested prm_[0-9a-f]+$/.test(r.detail));
  lines.push(`published, requesting a permit: ${published.length}`, ...published.map((r) => `  ${r.detail}`));

  const approvals = rows.filter((r) => ours.has(/^approval (prm_[0-9a-f]+) tests \d+\/\d+$/.exec(r.detail)?.[1]));
  lines.push(`approvals of the walk's permits: ${approvals.length}`);
  for (const a of approvals) {
    lines.push(`  ${a.detail}, ${a.shop}, ${a.result} (${a.call})`);
    const under = (id, depth) => {
      for (const c of rows.filter((r) => r.parent === id)) {
        lines.push(`${"  ".repeat(depth + 2)}${c.shop} ${c.command} ${c.result}${c.credentials === "-" ? "" : ` ${c.credentials}`}${c.detail === "-" ? "" : `: ${c.detail}`}`);
        under(c.call, depth + 1);
      }
    };
    under(a.call, 0);
    const tests = rows.filter((r) => r.parent === a.call);
    lines.push(`    tests under it: ${tests.length}, ${tests.filter((t) => t.result === "ok").length} ok`);
  }

  const connected = rows.filter((r) => /^connected \S+ for \S+ in \d+s$/.test(r.detail));
  lines.push(`consents: ${connected.length}`, ...connected.map((r) => `  ${r.detail}`));

  const refreshed = new Map();
  for (const r of rows) for (const m of r.detail.matchAll(/(?:^|, )refreshed (\S+?)(?=,|$)/g)) tally(refreshed, m[1]);
  lines.push(`refreshes: ${[...refreshed.values()].reduce((a, b) => a + b, 0)}${refreshed.size ? `; ${said(refreshed)}` : ""}`);
  return `${lines.join("\n")}\n`;
}

/**
 * The survey's counts from the hall's rows: per command, how many rows and
 * what their details say, `refused` with the sections refused, `tests`
 * split into all passed and some failed, `published`, `requested`, and the
 * gate's words for a denial; then the pass's grants by source.
 */
function hallCounts(auditTable, grantTable) {
  const shops = column(auditTable, "shop");
  const commands = column(auditTable, "command");
  const details = column(auditTable, "detail");
  const tally = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const byCommand = new Map();
  shops.forEach((s, i) => {
    if (s !== "town/hall" || commands[i] === "-") return;
    const c = byCommand.get(commands[i]) ?? { rows: 0, kinds: new Map(), sections: new Map() };
    c.rows += 1;
    const detail = details[i] === "-" ? "" : details[i];
    const tests = /^tests (\d+)\/(\d+)$/.exec(detail);
    if (tests) tally(c.kinds, tests[1] === tests[2] ? "tests all passed" : "tests some failed");
    else if (detail.startsWith("refused §")) {
      tally(c.kinds, "refused");
      for (const section of detail.slice("refused ".length).split(",")) tally(c.sections, section);
    } else tally(c.kinds, detail === "" ? "ok" : detail.split(" ")[0]);
    byCommand.set(commands[i], c);
  });
  const said = (m) => [...m].map(([k, v]) => `${k} ${v}`).join(", ");
  const lines = [`hall rows by command: ${[...byCommand.values()].reduce((a, c) => a + c.rows, 0)}`];
  for (const [command, c] of byCommand) lines.push(`  ${command} ${c.rows}: ${said(c.kinds)}${c.sections.size ? `; sections refused: ${said(c.sections)}` : ""}`);
  const sources = new Map();
  for (const source of column(grantTable, "source")) tally(sources, source === "-" ? "operator" : source);
  lines.push(`grants by source: ${said(sources)}`);
  return `${lines.join("\n")}\n`;
}

/**
 * The audit table as a tree: each call the agent made, then the calls made
 * in its service under it, indented two spaces a level, in the audit's
 * order within a level; a row whose parent is not among these rows is a
 * root. Then how many rows were made in a shop's service.
 */
function tree(table) {
  const names = ["at", "pass", "shop", "command", "result", "exit", "shop exit", "ms", "notices", "credentials", "call", "parent", "detail"];
  const cols = Object.fromEntries(names.map((n) => [n, column(table, n)]));
  const rows = cols.call.map((_, i) => Object.fromEntries(names.map((n) => [n, cols[n][i]])));
  const ids = new Set(rows.map((r) => r.call));
  const children = (id) => rows.filter((r) => r.parent === id);
  const lines = [];
  const visit = (r, depth) => {
    lines.push([`${"  ".repeat(depth)}${r.call}`, ...names.filter((n) => n !== "call" && n !== "parent").map((n) => r[n])]);
    for (const c of children(r.call)) visit(c, depth + 1);
  };
  for (const r of rows.filter((r) => r.parent === "-" || !ids.has(r.parent))) visit(r, 0);
  const header = ["call", ...names.filter((n) => n !== "call" && n !== "parent")];
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const render = (cells) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join("  ").trimEnd();
  const inner = rows.filter((r) => r.parent !== "-").length;
  return `${[header, ...lines].map(render).join("\n")}\nrows made in a shop's service: ${inner}, under ${rows.filter((r) => children(r.call).length).length} calls\n`;
}

/** Every regular file under `p`, or `p` itself when it is one; links are not followed. */
function filesUnder(p) {
  const st = lstatSync(p);
  if (st.isFile()) return [p];
  if (!st.isDirectory()) return [];
  return readdirSync(p).sort().flatMap((e) => filesUnder(path.join(p, e)));
}

/** How many times `needle` occurs in `hay`, as bytes. */
function occurrences(hay, needle) {
  let n = 0;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) n++;
  return n;
}

/**
 * `--search <root> [<path>...]`: every file under the walk root, the town's
 * database, its WAL, and its shared memory among them, and under each path,
 * searched for the token's bytes. One line per file that holds it, then
 * `found in N files`; exit 0 for none, 1 for some, 2 when it could not look.
 */
async function search(root, paths) {
  if (!root) die("name the walk root: --search <root> [<path>...]", 2);
  for (const p of [root, ...paths]) if (!existsSync(p)) die(`${p} does not exist; nothing was searched`, 2);
  const token = Buffer.from(await readToken("--search", 2), "utf8");
  let found = 0;
  const seen = new Set();
  for (const p of [root, ...paths]) {
    for (const file of filesUnder(path.resolve(p))) {
      if (seen.has(file)) continue;
      seen.add(file);
      let bytes;
      try {
        bytes = readFileSync(file);
      } catch (err) {
        die(`${file} could not be read (${err.code ?? "unknown error"}); the search is incomplete`, 2);
      }
      const n = occurrences(bytes, token);
      if (n) {
        found++;
        process.stdout.write(`${n} ${file}\n`);
      }
    }
  }
  process.stdout.write(`found in ${found} files\n`);
  process.exit(found === 0 ? 0 : 1);
}

/**
 * Every secret the store holds sealed, opened with the vault's key by the
 * store's own code in this process: each credential's value, a `token`
 * credential's whole and an `oauth` credential's refresh and access tokens,
 * revoked ones included; and each type's client secret. By name, never
 * printed; an empty one, a public client's, is named and not searched.
 */
async function sealedSecrets(data) {
  const { openStore, readKey } = await storeCode();
  let store;
  try {
    store = openStore(data);
    const key = readKey(data);
    const rows = store.sealedRows();
    if (key === null) {
      if (rows > 0) throw new Refusal(`${rows} sealed rows and no vault.key`);
      return [];
    }
    const out = [];
    for (const c of store.listCredentials()) {
      const value = store.openCredential(c.id, key);
      const what = `${c.id} ${c.type}${c.revokedAt === null ? "" : " (revoked)"}`;
      if (store.getType(c.type)?.kind !== "oauth") {
        out.push({ name: `${what} token`, value });
        continue;
      }
      let tokens;
      try {
        tokens = JSON.parse(value);
      } catch {
        throw new Refusal(`${c.id}'s value is not an oauth credential's JSON`);
      }
      for (const field of ["refresh_token", "access_token"]) out.push({ name: `${what} ${field}`, value: String(tokens?.[field] ?? "") });
    }
    for (const t of store.listTypes()) if (t.hasClient) out.push({ name: `type ${t.name} client_secret`, value: store.openClient(t.name, key).secret });
    return out;
  } catch (err) {
    // The vault's and the store's refusals are one line and hold no value; any other message may quote what it read, a parser's does, so it is not printed.
    const said = err instanceof Refusal || ["VaultError", "StoreError"].includes(err?.constructor?.name) ? err.message : `${err?.constructor?.name ?? "an error"}, its message not printed`;
    die(`the sealed rows of ${data} did not open: ${said}; nothing was searched`, 2);
  } finally {
    store?.close();
  }
}

class Refusal extends Error {}

/**
 * `--search-sealed <root> [<path>...]`: every file under the walk root, the
 * paths, and the data directory's town.db, its WAL and shared memory,
 * shops/, and state/, searched for each sealed secret's bytes. One line per
 * secret by name with how many files hold it, each file under it; exit 0
 * for none found, 1 for some, 2 when it could not look.
 */
async function searchSealed(root, paths) {
  if (!root) die("name the walk root: --search-sealed <root> [<path>...]", 2);
  if (!existsSync(path.join(path.resolve(root), "walk.json"))) die(`${root} has no walk.json; it is not a walk root, and nothing was searched`, 2);
  const walk = readWalk(root);
  for (const p of paths) if (!existsSync(p)) die(`${p} does not exist; nothing was searched`, 2);
  assertBuilt();
  const secrets = await sealedSecrets(walk.data);
  const inData = ["town.db", "town.db-wal", "town.db-shm", "shops", "state"].map((e) => path.join(walk.data, e)).filter((p) => existsSync(p));
  const files = [...new Set([walk.root, ...paths, ...inData].flatMap((p) => filesUnder(path.resolve(p))))];
  const bytes = new Map();
  for (const file of files) {
    try {
      bytes.set(file, readFileSync(file));
    } catch (err) {
      die(`${file} could not be read (${err.code ?? "unknown error"}); the search is incomplete`, 2);
    }
  }
  process.stdout.write(`searched ${files.length} files under ${[walk.root, ...paths, ...inData].join(", ")}\n`);
  process.stdout.write(`the store holds each secret sealed, so a hit in town.db or its WAL is the plaintext bytes, not the sealed row\n`);
  let found = 0;
  for (const s of secrets) {
    if (s.value === "") {
      process.stdout.write(`${s.name}: empty, not searched\n`);
      continue;
    }
    const needle = Buffer.from(s.value, "utf8");
    const holding = files.filter((f) => bytes.get(f).includes(needle));
    if (holding.length) found++;
    process.stdout.write(`${s.name}: ${holding.length} files\n${holding.map((f) => `  ${f}\n`).join("")}`);
  }
  process.stdout.write(`${secrets.length} sealed secrets; ${found} found in a file\n`);
  process.exit(found === 0 ? 0 : 1);
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
  // A data directory given with --data is the town's, not the walk's: never under the root, so never removed with it.
  if (walk.dataGiven && existsSync(walk.data)) {
    const rel = path.relative(realpathSync(walk.root), realpathSync(walk.data));
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) die(`${walk.data}, the data directory given, is under ${walk.root}; the root is kept, and nothing was removed`);
  }
  rmSync(walk.root, { recursive: true, force: true });
  if (existsSync(walk.root)) die(`${walk.root} is still there`);
  process.stdout.write(`removed ${walk.root}\n`);
  if (walk.dataGiven) process.stdout.write(`kept ${walk.data}, the data directory given\n`);
}

const [flag, ...words] = process.argv.slice(2);
if (flag === undefined) await setUp(memoryPlan());
else if (flag === "--shop" && words[0] === "hall") {
  const rest = words.slice(1);
  if (rest.length === 0) await setUp(hallPlan());
  else if (rest[0] === "--data" && rest.length === 2) await setUp(hallPlan(), await givenData(rest[1]));
  else if (rest[0] === "--data" && rest.length === 1) die("--data needs a value, an existing town's data directory");
  else die("--shop hall takes no other flag but --data <dir>; it needs no repository and no token");
} else if (flag === "--shop") {
  const opts = new Map();
  for (let i = 0; i < process.argv.length - 2; i += 2) {
    const [name, value] = process.argv.slice(2 + i, 4 + i);
    if (name !== "--shop" && name !== "--repo") die(`${name} is not a flag of --shop; write --shop hall, or --shop github|watch --repo <owner/name>`);
    if (opts.has(name)) die(`${name} is given twice`);
    if (value === undefined) die(`${name} needs a value`);
    opts.set(name, value);
  }
  const shop = opts.get("--shop");
  if (!Object.hasOwn(PLANS, shop ?? "")) die(`--shop ${shop} is not a walk's shop; write --shop github, --shop watch, or --shop hall, or nothing for the memory walk`);
  const repo = opts.get("--repo");
  if (repo === undefined) die(`--shop ${shop} needs --repo <owner/name>, the repository the token is scoped to`);
  if (!REPO_SHAPE.test(repo)) die("--repo is not owner/name of letters, digits, _, ., and -");
  await setUp(PLANS[shop](repo, await readToken(`--shop ${shop}`)));
} else if (flag === "--search") await search(words[0], words.slice(1));
else if (flag === "--search-sealed") await searchSealed(words[0], words.slice(1));
else if (flag === "--status" || flag === "--teardown") {
  if (words.length > 1) die(`too many words: ${words.slice(1).join(" ")}`);
  if (flag === "--status") status(words[0]);
  else await teardown(words[0]);
} else die(`${flag} is not a walk flag; write nothing, --shop hall [--data <dir>], --shop github|watch --repo <owner/name>, --status <root>, --search <root> [<path>...], --search-sealed <root> [<path>...], or --teardown <root>`);
