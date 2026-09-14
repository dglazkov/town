#!/usr/bin/env node
// Conformance: whether a harness speaks the contract, docs/harness.md,
// check by check.
//
//   node scripts/conform.mjs -- <harness command…>
//                            a town started on a free port over a data directory of its own
//   node scripts/conform.mjs --town <url> -- <harness command…>
//                            a town already running, every verb `townd admin --town <url>`
//                            with the operator's token, which townd reads and this script never does
//   node scripts/conform.mjs --wall <kind> -- …
//                            the laptop town's wall, seatbelt or none; the box's when omitted
//   node scripts/conform.mjs --list
//                            each check and the section of the contract it proves; runs nothing
//
// The town: the user `conform`, made or reused; the check shop,
// scripts/conform-shop/, added as `test/conform`, replacing one there;
// pass A, labelled `conform A`, expiring in three days, with a grant at
// the check shop narrowed to four of its five commands and `echo --text`
// to at most 64 characters; pass B, `conform B`, made and revoked at
// once. After, whatever happened: pass A revoked, the check shop removed,
// and a town this script started stopped and its directory removed.
//
// A check runs the harness command once with its words appended, from an
// empty directory under an empty HOME, with this script's environment less
// every TOWN_* name, and TOWN_GRANT set to the value the check names or not
// set. Stdin is nothing (/dev/null), a pipe (`cat <file> | harness`, a
// FIFO), a regular file, or a socket held open and never written, as the
// check says. A word of the harness command naming a path that exists here
// is made absolute, since the harness runs elsewhere; the rest of it,
// `env BROKEN=x` included, is run as given.
//
// Each check prints `ok <name> (§<n>)` or `FAIL <name> (§<n>): expected
// <…> / came <…>`; then `conformant: <N> checks`, exit 0, or `not
// conformant: <k> of <N> checks failed`, exit 1. Exit 2 is no verdict: a
// usage error, a harness command that cannot be run (said before any town
// is started), or a town that could not be set up.
//
// Plain Node, no dependency, the built binaries, like scripts/walk.mjs.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const TOWND = path.join(REPO, "bin", "townd.js");
const SHOP_DIR = path.join(REPO, "scripts", "conform-shop");
const SHOP = "test/conform";
const USER = "conform";

/** How long a check's harness may run; the held-socket check's is shorter, since hanging is the failure it looks for. */
const RUN_MS = 30_000;
const HELD_MS = 20_000;
/** How many checks run at once; the ones that count audit rows run after, one at a time. */
const AT_ONCE = 4;
/** How much of a stream a FAIL line quotes. */
const QUOTE_BYTES = 300;

// ---------------------------------------------------------------------------
// What must come back: matchers over one stream, each with the words a FAIL line says.

const exact = (s) => ({ test: (got) => got === s, says: JSON.stringify(s) });
const empty = exact("");
const oneLine = { test: (got) => /^[^\n]+\n$/.test(got), says: "one line" };
const re = (pattern, says) => ({ test: (got) => pattern.test(got), says });
const all = (says, ...tests) => ({ test: (got) => tests.every((t) => t(got)), says });

const ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The notice pass A carries on every call: it expires in three days. */
const NOTICE_LINE = `town-notice: pass-expires expires=${ISO}\\n`;
const notice = re(new RegExp(`^${NOTICE_LINE}$`), "the pass-expires notice line alone");
/** Stderr of a call the town refused or failed: the notice line, then `lines`. */
const noticeThen = (lines) => re(new RegExp(`^${NOTICE_LINE}${escapeRe(lines)}$`), `the pass-expires notice line, then ${JSON.stringify(lines)}`);
/** The town's --json envelope, byte for byte but the notice's instant. */
const envelope = (fields) => {
  const { ok, output, exit, error } = fields;
  const text = `{"ok":${ok},"output":${JSON.stringify(output)},"notices":[{"kind":"pass-expires","expires":"@ISO@"}],"exit":${exit}${error === undefined ? "" : `,"error":${JSON.stringify(error)}`}}\n`;
  const pattern = escapeRe(text).replace("@ISO@", ISO);
  return re(new RegExp(`^${pattern}$`), `the envelope ${JSON.stringify(text.replace("@ISO@", "<instant>"))}`);
};
/** The harness's own --json envelope: exactly its five fields, `error` one line, and one newline after. */
const ownEnvelope = (exit) => ({
  test: (got) => {
    if (!got.endsWith("\n") || got.indexOf("\n") !== got.length - 1) return false;
    let v;
    try {
      v = JSON.parse(got);
    } catch {
      return false;
    }
    const keys = v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort().join(",") : "";
    return keys === "error,exit,notices,ok,output" && v.ok === false && v.output === "" && Array.isArray(v.notices) && v.notices.length === 0 && v.exit === exit && typeof v.error === "string" && /^[^\n]+$/.test(v.error);
  },
  says: `one line of JSON, {"ok":false,"output":"","notices":[],"exit":${exit},"error":<one line>}`,
});

// ---------------------------------------------------------------------------
// The checks. Each: its name, the section of docs/harness.md it proves, the
// words, the grant, the stdin, and what must come back. `audit` is how many
// rows the call adds to pass A's audit.

const SECRET = `conform-secret-${randomBytes(12).toString("hex")}`;
const WORD_SPACES = "  two  words  ";
const WORD_WIDE = "héllo·wörld,世界🌍";
const TEXT = 'he said "hi" and\tleft\\ a backslash, \\n not a newline,\r\nand two lines after\n\n';
const LARGE = 900_000;
const TOO_LARGE = 1_100_000;

export const CHECKS = [
  { name: "help", section: 1, says: "no words is help for the grant, answered by the town", words: [], grant: "A",
    expect: { exit: 0, stdout: all("help listing test/conform at echo, cat, count, and fail, and never hidden", (s) => /^test\/conform {2}.*\[echo, cat, count, fail\]$/m.test(s), (s) => !s.includes("hidden")) } },
  { name: "grant-whitespace", section: 2, says: "a grant value surrounded by white space and newlines is the grant", words: ["conform", "echo", "--text", "spaced"], grant: "A-spaced",
    expect: { exit: 0, stdout: exact("spaced\n") } },
  { name: "no-grant", section: 2, says: "no TOWN_GRANT is exit 3 in one line", words: ["conform", "echo", "--text", "hi"], grant: "none",
    expect: { exit: 3, stdout: empty, stderr: oneLine } },
  { name: "grant-not-a-grant", section: 2, says: "a value that is not a grant is exit 3, never printed", words: ["conform", "echo", "--text", "hi"], grant: "not-a-grant",
    expect: { exit: 3, stdout: empty, stderr: oneLine, absent: SECRET } },
  { name: "grant-bare-token", section: 2, says: "a bare token in TOWN_GRANT is exit 3, never printed", words: ["conform", "echo", "--text", "hi"], grant: "bare-token",
    expect: { exit: 3, stdout: empty, stderr: oneLine, absent: SECRET } },
  { name: "help-at-shop", section: 3, says: "--help after a shop's name is sent as a word, help at the shop", words: ["conform", "--help"], grant: "A",
    expect: { exit: 0, stdout: all("help at the shop naming town conform echo and town conform fail, and never hidden", (s) => s.includes("town conform echo --text <string>"), (s) => s.includes("town conform fail"), (s) => !s.includes("hidden")) } },
  { name: "argv-empty-word", section: 3, says: "an empty word is sent as an empty string", words: ["conform", "echo", "--text", ""], grant: "A",
    expect: { exit: 0, stdout: exact("\n") } },
  { name: "argv-spaces", section: 3, says: "a word with spaces is sent whole", words: ["conform", "echo", "--text", WORD_SPACES], grant: "A",
    expect: { exit: 0, stdout: exact(`${WORD_SPACES}\n`) } },
  { name: "argv-non-ascii", section: 3, says: "a word that is not ASCII is sent as typed", words: ["conform", "echo", "--text", WORD_WIDE], grant: "A",
    expect: { exit: 0, stdout: exact(`${WORD_WIDE}\n`) } },
  { name: "json-before", section: 3, says: "--json before the words is the envelope", words: ["--json", "conform", "echo", "--text", "hi"], grant: "A",
    expect: { exit: 0, stdout: envelope({ ok: true, output: "hi\n", exit: 0 }), stderr: empty } },
  { name: "json-among", section: 3, says: "--json among the words is taken out of them", words: ["conform", "echo", "--json", "--text", "hi"], grant: "A",
    expect: { exit: 0, stdout: envelope({ ok: true, output: "hi\n", exit: 0 }), stderr: empty } },
  { name: "json-after", section: 3, says: "--json after the words is taken out of them", words: ["conform", "echo", "--text", "hi", "--json"], grant: "A",
    expect: { exit: 0, stdout: envelope({ ok: true, output: "hi\n", exit: 0 }), stderr: empty } },
  { name: "stdin-pipe", section: 4, says: "stdin through a pipe is read and sent", words: ["conform", "cat"], grant: "A", stdin: { kind: "pipe", bytes: "piped" },
    expect: { exit: 0, stdout: exact("piped") } },
  { name: "stdin-file", section: 4, says: "stdin from a regular file is read and sent", words: ["conform", "cat"], grant: "A", stdin: { kind: "file", bytes: "from a file" },
    expect: { exit: 0, stdout: exact("from a file") } },
  { name: "stdin-text", section: 4, says: "quotes, backslashes, tabs, and newlines round-trip, none added or removed", words: ["conform", "cat"], grant: "A", stdin: { kind: "pipe", bytes: TEXT },
    expect: { exit: 0, stdout: exact(TEXT) } },
  { name: "stdin-large", section: 4, says: `${LARGE} bytes of stdin, under the limit, arrive whole`, words: ["conform", "count"], grant: "A", stdin: { kind: "pipe", bytes: "a".repeat(LARGE) },
    expect: { exit: 0, stdout: exact(`${LARGE}\n`) } },
  { name: "stdin-too-large", section: 4, says: "stdin over the town's limit is sent, and refused by the town in its words", words: ["conform", "count"], grant: "A", stdin: { kind: "pipe", bytes: "a".repeat(TOO_LARGE) },
    expect: { exit: 1, stdout: empty, stderr: noticeThen(`error: stdin is ${TOO_LARGE} bytes, over the one megabyte limit\n`) } },
  { name: "stdin-socket", section: 4, says: "a socket held open is not read, and the call is answered", words: ["conform", "echo", "--text", "held"], grant: "A", stdin: { kind: "socket" },
    expect: { exit: 0, stdout: exact("held\n") } },
  { name: "stdin-not-text", section: 4, says: "stdin that is not UTF-8 is exit 1 before any request", words: ["conform", "cat"], grant: "A", stdin: { kind: "pipe", bytes: Buffer.from([0x68, 0x69, 0xff, 0xfe, 0x0a]) },
    expect: { exit: 1, stdout: empty, stderr: oneLine, audit: 0 } },
  { name: "request-town-slash", section: 5, says: "a town written with a trailing slash is posted at the same /call", words: ["conform", "echo", "--text", "slash"], grant: "A-slash",
    expect: { exit: 0, stdout: exact("slash\n") } },
  { name: "shop-fails", section: 6, says: "a shop that fails is exit 1, the town's stderr as given", words: ["conform", "fail"], grant: "A",
    expect: { exit: 1, stdout: empty, stderr: noticeThen("error: test/conform fail failed\nconform: failed on purpose\n") } },
  { name: "json-denial", section: 6, says: "with --json a denial is the town's envelope on stdout, stderr empty", words: ["--json", "conform", "hidden"], grant: "A",
    expect: { exit: 2, stdout: envelope({ ok: false, output: "", exit: 2, error: "error: command 'hidden' is not available to this grant" }), stderr: empty } },
  { name: "unreachable", section: 7, says: "a town that does not answer is exit 1 in one line", words: ["conform", "echo", "--text", "hi"], grant: "closed",
    expect: { exit: 1, stdout: empty, stderr: oneLine } },
  { name: "json-refusal", section: 7, says: "with --json the harness's own refusal is its envelope on stdout, stderr empty", words: ["--json", "conform", "echo", "--text", "hi"], grant: "none",
    expect: { exit: 3, stdout: ownEnvelope(3), stderr: empty } },
  { name: "denied-command", section: 8, says: "a command the grant lacks is exit 2 in the town's words", words: ["conform", "hidden"], grant: "A",
    expect: { exit: 2, stdout: empty, stderr: noticeThen("error: command 'hidden' is not available to this grant\n") } },
  { name: "denied-constraint", section: 8, says: "a value outside the grant's constraint is exit 2 in the town's words", words: ["conform", "echo", "--text", "x".repeat(65)], grant: "A",
    expect: { exit: 2, stdout: empty, stderr: noticeThen("error: --text must be at most 64 characters under this grant\n") } },
  { name: "usage-error", section: 8, says: "a call missing an argument the shop requires is exit 1 in the town's words", words: ["conform", "echo"], grant: "A",
    expect: { exit: 1, stdout: empty, stderr: noticeThen("error: --text is required\nusage: town conform echo --text <string>\n") } },
  { name: "revoked", section: 8, says: "a revoked pass is exit 3 in the town's words", words: ["conform", "echo", "--text", "hi"], grant: "B",
    expect: { exit: 3, stdout: empty, stderr: exact("error: this pass is not valid: its token is unknown, revoked, or expired\n") } },
  { name: "call", section: 9, says: "a call's output on stdout and its notice on stderr", words: ["conform", "echo", "--text", "hello"], grant: "A",
    expect: { exit: 0, stdout: exact("hello\n"), stderr: notice } },
  { name: "call-once", section: 10, says: "a call that fails is posted once, never retried", words: ["conform", "fail"], grant: "A",
    expect: { exit: 1, audit: 1 } },
];

// ---------------------------------------------------------------------------
// The command line.

function usage(line) {
  process.stderr.write(`conform: ${line}\nusage: node scripts/conform.mjs [--town <url>] [--wall <kind>] -- <harness command…> | node scripts/conform.mjs --list\n`);
  process.exit(2);
}

function parse(argv) {
  const given = { town: undefined, wall: undefined, list: false, harness: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      given.harness = argv.slice(i + 1);
      break;
    }
    if (a === "--list") given.list = true;
    else if (a === "--town" || a === "--wall") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) usage(`${a} needs a value`);
      given[a.slice(2)] = v;
    } else usage(`no flag ${a}; the harness command goes after --`);
  }
  return given;
}

function list() {
  const width = Math.max(...CHECKS.map((c) => `${c.name} (§${c.section})`.length));
  process.stdout.write(CHECKS.map((c) => `${`${c.name} (§${c.section})`.padEnd(width)}  ${c.says}\n`).join(""));
}

// ---------------------------------------------------------------------------
// The operator's side: townd admin over a data directory or a town's URL.

/** The environment townd runs in: nothing of a grant or a data directory inherited. */
function operatorEnv() {
  const env = { ...process.env };
  delete env.TOWN_GRANT;
  delete env.TOWN_DATA;
  return env;
}

function admin(where, args, input) {
  const r = spawnSync(process.execPath, [TOWND, "admin", ...where, ...args], {
    env: operatorEnv(),
    encoding: input === undefined ? "utf8" : undefined,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
  const text = (b) => (typeof b === "string" ? b : (b ?? Buffer.alloc(0)).toString("utf8"));
  return { stdout: text(r.stdout), stderr: text(r.stderr), exit: r.status ?? -1 };
}

function mustAdmin(where, args, input) {
  const r = admin(where, args, input);
  if (r.exit !== 0) throw new Error(`townd admin ${args.join(" ")} exited ${r.exit}: ${(r.stderr || r.stdout).trim()}`);
  return r;
}

/** The check shop's directory as a ustar tar, the way a shop reaches a box. */
function tarOf(dir) {
  const r = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", dir, "."], { env: { ...operatorEnv(), COPYFILE_DISABLE: "1" }, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`tar of ${dir} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}

/** Refuses when dist/ is missing or older than a src/*.ts that `pnpm build` compiles. */
function assertBuilt() {
  const src = path.join(REPO, "src");
  const tsconfig = JSON.parse(readFileSync(path.join(REPO, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  const skipped = (tsconfig.exclude ?? []).filter((f) => f.startsWith("src/")).map((f) => path.basename(f));
  for (const e of readdirSync(src)) {
    if (!e.endsWith(".ts") || skipped.includes(e)) continue;
    const js = path.join(REPO, "dist", e.replace(/\.ts$/, ".js"));
    if (!existsSync(js)) usage(`dist/${path.basename(js)} is missing; run pnpm build`);
    if (statSync(path.join(src, e)).mtimeMs > statSync(js).mtimeMs) usage(`dist is older than src/${e}; run pnpm build`);
  }
}

/** A port on 127.0.0.1 that nothing listens on: bound, then closed. */
function closedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** `townd serve --data <data> --port 0 [--wall <kind>]`, resolved with its address once it prints it. */
function startTown(data, wall) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TOWND, "serve", "--data", data, "--port", "0", ...(wall ? ["--wall", wall] : [])], { env: operatorEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`townd serve printed no address in 15s: ${err}`));
    }, 15_000);
    child.stdout.on("data", (b) => {
      out += b.toString("utf8");
      const m = /^town listening on (http:\/\/127\.0\.0\.1:\d+)/m.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve({ child, url: m[1] });
      }
    });
    child.stderr.on("data", (b) => (err += b.toString("utf8")));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`townd serve exited ${code}: ${err.trim()}`));
    });
  });
}

// ---------------------------------------------------------------------------
// The harness's side.

/** The harness command with each word naming a path that exists here made absolute, since it runs from an empty directory. */
function resolveHarness(words) {
  return words.map((w) => (w.includes("/") && !w.includes("=") && existsSync(w) ? path.resolve(w) : w));
}

/** The environment a check's harness runs in: this one less every TOWN_* name, HOME its own, and TOWN_GRANT as the check says. */
function harnessEnv(home, grant) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("TOWN_")) env[k] = v;
  env.HOME = home;
  if (grant !== undefined) env.TOWN_GRANT = grant;
  return env;
}

const running = new Set();

/**
 * Runs `command` with `words` from `cwd`; stdin as `stdin` names it. Resolves
 * with what came back, or `timedOut` when it did not exit within `ms`, when
 * it and all it started are killed. `error` when it could not be run at all.
 */
function runHarness(command, words, opts) {
  const { cwd, env, stdin, ms, scratch } = opts;
  return new Promise((resolve) => {
    let file = command[0];
    let args = [...command.slice(1), ...words];
    let stdio0 = "ignore";
    let fd;
    if (stdin?.kind === "pipe") {
      const bytesFile = path.join(scratch, `stdin-${randomBytes(6).toString("hex")}`);
      writeFileSync(bytesFile, stdin.bytes);
      // A shell's pipe, a FIFO: never Node's stdio "pipe", which is a socket.
      file = "/bin/sh";
      args = ["-c", 'cat "$0" | "$@"', bytesFile, ...command, ...words];
    } else if (stdin?.kind === "file") {
      const bytesFile = path.join(scratch, `stdin-${randomBytes(6).toString("hex")}`);
      writeFileSync(bytesFile, stdin.bytes);
      fd = openSync(bytesFile, "r");
      stdio0 = fd;
    } else if (stdin?.kind === "socket") {
      stdio0 = "pipe";
    }
    let child;
    try {
      child = spawn(file, args, { cwd, env, stdio: [stdio0, "pipe", "pipe"], detached: true });
    } catch (err) {
      if (fd !== undefined) closeSync(fd);
      return resolve({ error: err.message });
    }
    if (fd !== undefined) closeSync(fd);
    running.add(child);
    const out = [];
    const err = [];
    child.stdout.on("data", (b) => out.push(b));
    child.stderr.on("data", (b) => err.push(b));
    let timedOut = false;
    // The group is killed only while something of it still holds its stdio open, before `close`: a group id is not
    // reused while a member lives, but once all are gone the id is free, and a kill then could reach another's group.
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, ms);
    child.on("error", (e) => {
      clearTimeout(timer);
      running.delete(child);
      resolve({ error: e.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      running.delete(child);
      child.stdin?.destroy();
      resolve({ exit: code ?? (signal ? `signal ${signal}` : -1), stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), timedOut });
    });
  });
}

function quote(s) {
  const cut = Buffer.byteLength(s) > QUOTE_BYTES ? `${Buffer.from(s).subarray(0, QUOTE_BYTES).toString("utf8")}…` : s;
  return JSON.stringify(cut);
}

/** What a check expected, in words. */
function expected(e) {
  const parts = [];
  if (e.exit !== undefined) parts.push(`exit ${e.exit}`);
  if (e.stdout) parts.push(`stdout ${e.stdout.says}`);
  if (e.stderr) parts.push(`stderr ${e.stderr.says}`);
  if (e.absent) parts.push("neither stream holding the value");
  if (e.audit !== undefined) parts.push(`${e.audit} audit ${e.audit === 1 ? "row" : "rows"} added`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// A run.

async function conform(given) {
  if (!given.harness || given.harness.length === 0) usage("give the harness command after --, as in -- node bin/town.js");
  if (given.town !== undefined && given.wall !== undefined) usage("--wall is the laptop town's; a town at --town has its own");
  let origin;
  if (given.town !== undefined) {
    try {
      origin = new URL(given.town).origin;
    } catch {
      usage(`--town ${given.town} is not a town's address`);
    }
  }
  assertBuilt();
  const harness = resolveHarness(given.harness);
  const root = mkdtempSync(path.join(os.tmpdir(), "town-conform-"));
  const scratch = path.join(root, "scratch");
  mkdirSync(scratch);
  let n = 0;
  const emptyDirs = () => {
    const d = path.join(root, `run-${n++}`);
    mkdirSync(path.join(d, "cwd"), { recursive: true });
    mkdirSync(path.join(d, "home"));
    return { cwd: path.join(d, "cwd"), home: path.join(d, "home") };
  };

  const state = { town: null, where: null, passA: null, shopAdded: false, torn: false };
  const teardown = () => {
    if (state.torn) return;
    state.torn = true;
    for (const child of running) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
    if (state.where) {
      if (state.passA) admin(state.where, ["pass", "revoke", state.passA]);
      if (state.shopAdded) admin(state.where, ["shop", "rm", SHOP]);
    }
    if (state.town) state.town.child.kill("SIGTERM");
    rmSync(root, { recursive: true, force: true });
  };
  const interrupted = (signal) => {
    process.stderr.write(`conform: ${signal}; the town is struck\n`);
    teardown();
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);

  try {
    // The harness must run at all before any town is made: the probe is the no-grant check's situation.
    const probeDirs = emptyDirs();
    const probe = await runHarness(harness, [], { ...probeDirs, env: harnessEnv(probeDirs.home, undefined), ms: RUN_MS, scratch });
    if (probe.error !== undefined || probe.exit === 126 || probe.exit === 127) {
      process.stderr.write(`conform: the harness command cannot be run: ${probe.error ?? `${harness.join(" ")} exited ${probe.exit}: ${probe.stderr.trim().split("\n")[0]}`}\n`);
      return 2;
    }

    let grants;
    try {
      if (given.town !== undefined) {
        if (!process.env.TOWN_OPERATOR && !existsSync(path.join(os.homedir(), ".town", "operator"))) {
          process.stderr.write("conform: --town needs the operator's token for townd, and neither $TOWN_OPERATOR nor ~/.town/operator is there; nothing was made\n");
          return 2;
        }
        state.where = ["--town", origin];
      } else {
        const data = path.join(root, "data");
        state.town = await startTown(data, given.wall);
        state.where = ["--data", data, ...(given.wall ? ["--wall", given.wall] : [])];
      }
      grants = setUp(state);
    } catch (err) {
      process.stderr.write(`conform: the town could not be set up: ${err.message}\n`);
      return 2;
    }

    const closed = await closedPort();
    const grantOf = {
      A: grants.a,
      "A-spaced": `\n\t  ${grants.a.trim()}\n\n `,
      "A-slash": JSON.stringify({ ...JSON.parse(grants.a), town: `${new URL(JSON.parse(grants.a).town).origin}/` }),
      B: grants.b,
      none: undefined,
      "not-a-grant": JSON.stringify({ town: "not a url", token: SECRET }),
      "bare-token": SECRET,
      closed: JSON.stringify({ town: `http://127.0.0.1:${closed}`, token: "conform-closed-port" }),
    };
    const auditRows = () => mustAdmin(state.where, ["audit", "--pass", state.passA]).stdout.split("\n").filter((l) => l.trim() !== "").length - 1;

    const runCheck = async (check) => {
      const dirs = emptyDirs();
      const before = check.expect.audit === undefined ? 0 : auditRows();
      const came = await runHarness(harness, check.words, { ...dirs, env: harnessEnv(dirs.home, grantOf[check.grant]), stdin: check.stdin, ms: check.stdin?.kind === "socket" ? HELD_MS : RUN_MS, scratch });
      const e = check.expect;
      const failures = [];
      if (came.error !== undefined) failures.push(`could not run: ${came.error}`);
      else if (came.timedOut) failures.push(`no exit within ${(check.stdin?.kind === "socket" ? HELD_MS : RUN_MS) / 1000} s, killed`);
      else {
        if (e.exit !== undefined && came.exit !== e.exit) failures.push("exit");
        if (e.stdout && !e.stdout.test(came.stdout)) failures.push("stdout");
        if (e.stderr && !e.stderr.test(came.stderr)) failures.push("stderr");
        if (e.absent && (came.stdout.includes(e.absent) || came.stderr.includes(e.absent))) failures.push("value printed");
        if (e.audit !== undefined) {
          const added = auditRows() - before;
          if (added !== e.audit) failures.push(`${added} audit ${added === 1 ? "row" : "rows"} added`);
        }
      }
      if (failures.length === 0) return { ok: true, line: `ok ${check.name} (§${check.section})` };
      const what = came.error !== undefined || came.timedOut ? failures[0] : `exit ${came.exit}, stdout ${quote(came.stdout)}, stderr ${quote(came.stderr)}${failures.find((f) => f.includes("audit")) ? `, ${failures.find((f) => f.includes("audit"))}` : ""}`;
      return { ok: false, line: `FAIL ${check.name} (§${check.section}): expected ${expected(e)} / came ${what}` };
    };

    // Checks that count audit rows run alone, after the rest, so no other call lands between their counts.
    const results = new Array(CHECKS.length);
    const free = CHECKS.map((c, i) => [c, i]).filter(([c]) => c.expect.audit === undefined);
    const counted = CHECKS.map((c, i) => [c, i]).filter(([c]) => c.expect.audit !== undefined);
    let next = 0;
    await Promise.all(
      Array.from({ length: AT_ONCE }, async () => {
        while (next < free.length) {
          const [check, i] = free[next++];
          results[i] = await runCheck(check);
        }
      }),
    );
    for (const [check, i] of counted) results[i] = await runCheck(check);

    for (const r of results) process.stdout.write(`${r.line}\n`);
    const failed = results.filter((r) => !r.ok).length;
    if (failed === 0) {
      process.stdout.write(`conformant: ${CHECKS.length} checks\n`);
      return 0;
    }
    process.stdout.write(`not conformant: ${failed} of ${CHECKS.length} checks failed\n`);
    return 1;
  } finally {
    teardown();
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
  }
}

/** The user, the check shop, pass A and its grant, pass B made and revoked: the grant values of A and B. */
function setUp(state) {
  const where = state.where;
  const user = admin(where, ["user", "add", USER]);
  if (user.exit !== 0) {
    const users = mustAdmin(where, ["user", "ls"]);
    if (!users.stdout.split("\n").some((l) => l.split(/\s+/).includes(USER))) throw new Error(`townd admin user add ${USER} exited ${user.exit}: ${user.stderr.trim()}`);
  }
  const overWire = where[0] === "--town";
  mustAdmin(where, ["shop", "add", overWire ? "-" : SHOP_DIR], overWire ? tarOf(SHOP_DIR) : undefined);
  state.shopAdded = true;
  const a = mustAdmin(where, ["pass", "new", "--user", USER, "--label", "conform A", "--expires", "3d"]);
  state.passA = a.stderr.trim();
  mustAdmin(where, ["grant", "new", "--pass", state.passA, "--shop", SHOP, "--commands", "echo,cat,count,fail", "--constraint", "echo.text max_length 64"]);
  const b = mustAdmin(where, ["pass", "new", "--user", USER, "--label", "conform B", "--expires", "3d"]);
  mustAdmin(where, ["pass", "revoke", b.stderr.trim()]);
  return { a: a.stdout, b: b.stdout };
}

// ---------------------------------------------------------------------------

if (import.meta.main) {
  const given = parse(process.argv.slice(2));
  if (given.list) {
    if (given.harness || given.town || given.wall) usage("--list runs nothing: give it alone");
    list();
    process.exit(0);
  }
  process.exit(await conform(given));
}
