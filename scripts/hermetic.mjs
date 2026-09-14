#!/usr/bin/env node
// The outer rings, the environments this checkout's state cannot reach:
//
//   pnpm hermetic --ring account [--name <worker>] [--yes] [--dry-run] [--keep] [-- <harness command…>]
//                                   a tent pitched from this commit, road's conformance over the wire, the tent struck
//   pnpm hermetic --strike <worker> [--yes]
//                                   a tent a killed run left, deleted under a HOME that holds no token
//   pnpm hermetic --list            each outer ring, what it needs, and what it costs; runs nothing
//
// The ring chooses the environment, never the steps: the account ring's
// steps are scripts/conform.mjs's, run over a box of the ring's own. The
// agent ring, drove's stage over that box, is named in the usage and the
// listing and refused until it is built.
//
// The preflight is every run's first part and `--dry-run` whole, a line
// each: CLOUDFLARE_API_TOKEN present, or box's own refusal and exit 2 with
// nothing read; the commit and whether the tree is dirty; dist/ no older
// than src/, since conformance refuses a stale build; the listing, the
// account's Workers by name read with box's own GETs, and the tent's name
// free in it, or a refusal naming --strike; the price in box's words; the
// consent from afar named as not walked. Then `pitch <name> on the
// account? [y/N]` at a terminal unless --yes; no terminal and no --yes is a
// refusal. Every refusal is exit 2 and makes nothing.
//
// After the ask, a directory under the system's temporary directory,
// `town-hermetic-<sha>-<random>/`, holding `home/`, the HOME every child
// runs under, `ring.json`, the run's facts as they happen, and
// `conform.txt`, conformance's lines. Then the steps, each a child of node
// from the checkout with HOME that `home/`, TOWN_OPERATOR unset, and the
// rest of this environment through, so no child reads ~/.town/operator:
//
//   1. the pitch: `scripts/box.mjs deploy --name <tent>`, its stdout read
//      for the address and the build, which must be this commit, and never
//      written or echoed, since it prints the tent's operator token once;
//      box's stderr passes through;
//   2. the walk: `scripts/conform.mjs --town <address> -- <harness>`, its
//      lines to the terminal and to conform.txt as they come, its verdict
//      line and its exit read and no count fixed;
//   3. the strike: `scripts/box.mjs delete --name <tent>`, the name on its
//      stdin, whatever step failed, unless --keep;
//   4. the listing again, which must be the listing before (with --keep,
//      but for the tent).
//
// Exit 0 is every step at 0 and the listings the same, the directory
// removed unless --keep; 1 is any other run, the directory kept and named;
// 130 is a run a signal stopped, the strike run where the process can
// still run it. `main` takes its world as `deps`, so test/hermetic.test.ts
// drives every path with fakes and never a child or the network.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { PRICE, listing, parse as boxWords, tokenRefusal } from "./box.mjs";
import { staleness } from "./stale.ts";

const REPO = path.resolve(import.meta.dirname, "..");
const BOX = path.join(REPO, "scripts", "box.mjs");
const CONFORM = path.join(REPO, "scripts", "conform.mjs");

/** The tent's name is this and the short commit, unless --name says. */
export const PREFIX = "town-hermetic-";

/** The harness conformance runs when no words follow `--`. */
export const HARNESS = ["node", "bin/town.js"];

export const USAGE = `usage: pnpm hermetic --ring account [--name <worker>] [--yes] [--dry-run] [--keep] [-- <harness command…>]
       pnpm hermetic --ring agent --sheep <dir> --repo <owner/name> --issue <n> [--kennel <dir>] [--user <name>] [--name <worker>] [--yes] [--dry-run] [--keep] < <token file>
       pnpm hermetic --strike <worker> [--yes]
       pnpm hermetic --list
`;

/** Each outer ring, what it needs, and what it costs, as --list prints them. */
export const RINGS = [
  ["account", "needs CLOUDFLARE_API_TOKEN and this checkout built; a tent pitched from this commit, road's conformance over the wire, the tent struck; costs a deploy's requests and an object's minutes, cents, and about a minute"],
  ["agent", "needs the account ring's, a sheep checkout (--sheep), a kennel naming a standing station, and a github token on stdin; the tent furnished and drove's stage run against it; costs a container's minutes and a model turn, under a dollar, and minutes; not built yet"],
];

/** The agent ring's own words, refused by name until that ring is built. */
const AGENT_WORDS = ["--sheep", "--repo", "--issue", "--kennel", "--user"];

const refused = (line) => ({ refused: line });

/**
 * The words: `--ring <name>`, `--name <worker>`, `--strike <worker>` (each
 * also as `--flag=value`), `--yes`, `--dry-run`, `--keep`, `--list`, each at
 * most once, and after a `--` the harness command; a lone `--` before any
 * word is pnpm's and skipped. `{ help }`, `{ refused }`, or what was given.
 */
export function parse(argv) {
  const given = { ring: undefined, name: undefined, strike: undefined, list: false, yes: false, dryRun: false, keep: false, harness: undefined };
  const seen = new Set();
  for (let i = argv[0] === "--" ? 1 : 0; i < argv.length; i++) {
    const w = argv[i];
    if (w === "--") {
      given.harness = argv.slice(i + 1);
      if (given.harness.length === 0) return refused("-- needs a harness command after it, as in -- node bin/town.js");
      break;
    }
    if (w === "--help" || w === "-h") return { help: true };
    const eq = w.startsWith("--") ? w.indexOf("=") : -1;
    const flag = eq === -1 ? w : w.slice(0, eq);
    if (AGENT_WORDS.includes(flag)) return refused(`${flag} is the agent ring's, and the agent ring is not built yet; the ring here is --ring account`);
    if (["--yes", "--dry-run", "--keep", "--list"].includes(flag)) {
      if (eq !== -1) return refused(`${flag} takes no value`);
    } else if (["--ring", "--name", "--strike"].includes(flag)) {
      // the value is read below
    } else if (w.startsWith("-")) {
      return refused(`${w} is not a flag of hermetic; a harness command's words go after --`);
    } else {
      return refused(`${w} is not a word of hermetic; a harness command goes after --`);
    }
    if (seen.has(flag)) return refused(`${flag} is given twice`);
    seen.add(flag);
    if (flag === "--yes") given.yes = true;
    else if (flag === "--dry-run") given.dryRun = true;
    else if (flag === "--keep") given.keep = true;
    else if (flag === "--list") given.list = true;
    else {
      const value = eq === -1 ? argv[++i] : w.slice(eq + 1);
      const what = flag === "--ring" ? "a ring's name: account" : "a Worker's name";
      if (value === undefined || value === "" || (eq === -1 && value.startsWith("-"))) return refused(`${flag} needs ${what} after it`);
      if (flag === "--ring") {
        if (value === "agent") return refused("the agent ring is not built yet; the ring here is --ring account");
        if (value !== "account") return refused(`no ring ${value}: the outer rings are account and agent`);
        given.ring = value;
      } else {
        const bad = boxWords(["deploy", "--name", value]).refused;
        if (bad) return refused(bad);
        if (value === "town") return refused("town is the shepherd's box, and a ring never names a tent town, pitches it, or strikes it; leave --name out for town-hermetic-<sha>");
        given[flag.slice(2)] = value;
      }
    }
  }
  if (given.list) {
    if (seen.size > 1 || given.harness) return refused("--list runs nothing: give it alone");
    return given;
  }
  if (given.strike !== undefined) {
    const extra = [...seen].filter((f) => f !== "--strike" && f !== "--yes");
    if (extra.length || given.harness) return refused(`--strike takes --yes and nothing else; ${extra[0] ?? "a harness command"} is a ring's`);
    return given;
  }
  if (given.ring === undefined) return refused("a ring is needed: --ring account, or --strike <worker>, or --list");
  return given;
}

/** The child for each step: node's arguments, and what goes on its stdin. No value of a token is in either. */
export function childOf(step, { name, address, harness }) {
  if (step === "deploy") return { args: [BOX, "deploy", "--name", name] };
  if (step === "strike") return { args: [BOX, "delete", "--name", name], stdin: `${name}\n` };
  if (step === "conform") return { args: [CONFORM, "--town", address, "--", ...harness] };
  throw new Error(`no step ${step}`);
}

/** A child's environment: this one, HOME the ring's, and TOWN_OPERATOR unset, so townd reads the tent's token and never the shepherd's. */
export function childEnv(env, home) {
  const child = { ...env, HOME: home };
  delete child.TOWN_OPERATOR;
  return child;
}

/** Two listings as sets of names: the same, or what was added and what is gone. */
function compare(before, after) {
  const added = after.filter((n) => !before.includes(n));
  const gone = before.filter((n) => !after.includes(n));
  return { same: added.length === 0 && gone.length === 0, added, gone };
}

const seconds = (ms) => Math.round(ms / 1000);

/** The ask, at a terminal unless --yes: null to go on, or the refusal's sentence. */
async function consent(deps, given, question, what) {
  if (given.yes) return null;
  const asked = await deps.ask(`${question} [y/N] `);
  if (!asked.terminal) return `${what} is asked at a terminal, and there is none here; run it at one, or give --yes to answer from a script`;
  if (!/^y(es)?$/i.test(asked.line.trim())) return `${what} was not answered y`;
  return null;
}

/** The account ring: the preflight, the ask, the pitch, the walk, the strike, the listing again, and the closing block. */
async function account(given, token, deps) {
  const say = (line) => deps.out(`${line}\n`);
  const refuse = (line) => (deps.err(`hermetic: ${line}; nothing was made\n`), 2);
  const harness = given.harness ?? HARNESS;

  // The preflight.
  say("CLOUDFLARE_API_TOKEN: present in the environment");
  const commit = deps.commit();
  if (commit === null) return refuse("the tent is named and built for this checkout's commit, and git could not say it");
  say(`the commit: ${commit.sha}, the tree ${commit.dirty ? `dirty, so the build is ${commit.sha}-dirty` : "clean"}`);
  const stale = deps.stale();
  if (stale !== null) return refuse(`${stale}, and conformance refuses a stale build; run pnpm build first`);
  say("dist: no older than src/");
  const name = given.name ?? `${PREFIX}${commit.short}`;
  const before = await listing(deps, token);
  if (before.failed) return refuse(before.failed);
  if (before.names.includes(name)) return refuse(`the account ${before.account.name} already holds a Worker named ${name}, a tent kept or left by a killed run; strike it with pnpm hermetic --strike ${name}`);
  say(`the listing: ${before.names.length} Workers on the account ${before.account.name}, and ${name} free`);
  say(`the tent: ${name}, pitched from this checkout; the harness: ${harness.join(" ")}`);
  for (const line of PRICE) say(`the price: ${line}`);
  say("the consent from afar, box journey 4: not walked, since it needs a browser");
  if (given.dryRun) {
    say("--dry-run: stopped before the ask, and nothing was deployed");
    return 0;
  }
  const no = await consent(deps, given, `pitch ${name} on the account?`, `pitching ${name}`);
  if (no !== null) return refuse(no);

  // The directory, and the facts as they happen.
  const dir = mkdtempSync(path.join(deps.tmp, `${PREFIX}${commit.short}-`));
  const home = path.join(dir, "home");
  mkdirSync(home, { mode: 0o700 });
  const facts = { ring: "account", name, sha: commit.sha, dirty: commit.dirty, harness: harness.join(" "), keep: given.keep, directory: dir, account: before.account.name, address: null, build: null, verdict: null, steps: [], listing: { before: [...before.names].sort(), after: null }, signal: null, exit: null };
  const record = () => writeFileSync(path.join(dir, "ring.json"), `${JSON.stringify(facts, null, 2)}\n`);
  record();
  let signal = null;
  const unhook = deps.onSignal((s) => {
    if (signal !== null) return;
    signal = s;
    facts.signal = s;
    deps.err(`hermetic: ${s}; the steps stop${given.keep ? ", and --keep leaves the tent" : ", and the tent is struck"}\n`);
  });
  const step = async (label, run) => {
    const started = deps.now();
    const ran = await run();
    facts.steps.push({ step: label, exit: ran.code, seconds: seconds(deps.now() - started) });
    record();
    return ran;
  };

  try {
    // 1. The pitch. Its stdout holds the tent's operator token on one line, and goes nowhere.
    say(`pitching ${name} (box deploy under ${home})`);
    const pitch = await step("pitch", () => deps.deploy(name, home));
    const address = /^(?:deployed|redeployed) \S+ in \d+s: (https:\/\/\S+)$/m.exec(pitch.stdout)?.[1] ?? null;
    const build = /^GET \/ answers town; x-town-build (\S+)$/m.exec(pitch.stdout)?.[1] ?? null;
    Object.assign(facts, { address, build });
    record();
    const pitched = pitch.code === 0 && address !== null && (build === commit.sha || build === `${commit.sha}-dirty`);
    if (pitched) {
      say(`pitched ${name} in ${facts.steps.at(-1).seconds}s at ${address}, the build ${build}, this commit`);
    } else {
      const why = pitch.code !== 0 ? `exited ${pitch.code}` : address === null ? "printed no address" : `answered the build ${build ?? "(none)"}, not this commit's ${commit.sha}`;
      const secret = /^operator token, shown once.*: (\S+)$/m.exec(pitch.stdout)?.[1];
      const shown = pitch.stdout.split("\n").filter((l) => l.trim() !== "" && !(secret && l.includes(secret)));
      deps.err(`hermetic: the pitch ${why}${shown.length ? `; box's stdout, less the token's line:\n${shown.map((l) => `  ${l}`).join("\n")}` : ""}\n`);
    }

    // 2. The walk, conformance's lines as they come.
    let walk = null;
    if (pitched && signal === null) {
      const lines = path.join(dir, "conform.txt");
      writeFileSync(lines, "");
      const keep = (line) => appendFileSync(lines, `${line}\n`);
      walk = await step("walk", () =>
        deps.conform(address, harness, home, {
          out: (line) => {
            deps.out(`${line}\n`);
            keep(line);
            if (/^(?:not )?conformant: /.test(line)) facts.verdict = line;
          },
          err: (line) => {
            deps.err(`${line}\n`);
            keep(line);
          },
        }),
      );
      record();
    }

    // 3. The strike, whatever step failed, unless --keep.
    const struck = given.keep ? null : await step("strike", () => deps.strike(name, home));

    // 4. The listing again.
    const after = await listing(deps, token);
    facts.listing.after = after.failed ? after.failed : [...after.names].sort();
    const seen = after.failed ? null : compare(before.names, given.keep ? after.names.filter((n) => n !== name) : after.names);
    const green = signal === null && pitched && walk?.code === 0 && facts.verdict?.startsWith("conformant: ") === true && (struck === null || struck.code === 0) && seen?.same === true;
    facts.exit = signal !== null ? 130 : green ? 0 : 1;
    record();

    // The closing block.
    const standing = !after.failed && after.names.includes(name);
    const block = [
      `the account ring: ${signal !== null ? `stopped by ${signal}` : green ? "green" : "not green"}`,
      `  the tent: ${name}${address ? ` at ${address}` : ""}${build ? `, the build ${build}` : ""}`,
      `  the harness: ${harness.join(" ")}`,
      `  the steps: ${facts.steps.map((s) => `${s.step} exit ${s.exit} in ${s.seconds}s`).join(", ")}`,
      `  the verdict: ${facts.verdict ?? "no verdict line"}`,
      `  the listing: ${after.failed ? `not read after: ${after.failed}` : seen.same ? `the same before and after${given.keep ? " but for the tent" : ""}, ${before.names.length} Workers` : `not the same before and after: ${[seen.added.length ? `added ${seen.added.join(", ")}` : "", seen.gone.length ? `gone ${seen.gone.join(", ")}` : ""].filter(Boolean).join("; ")}`}`,
      "  the consent from afar, box journey 4: skipped, since it needs a browser",
    ];
    if (given.keep) block.push(`  the tent stands, kept; strike it with: pnpm hermetic --strike ${name}`);
    else if (standing || after.failed) block.push(`  the tent may stand; strike it with: pnpm hermetic --strike ${name}`);
    if (facts.exit === 0 && !given.keep) {
      rmSync(dir, { recursive: true, force: true });
      block.push("  the directory: removed");
    } else {
      block.push(`  the directory: kept, ${dir}`);
    }
    say(block.join("\n"));
    return facts.exit;
  } finally {
    unhook();
  }
}

/** `--strike <worker>`: the listing, the ask, box's delete under a fresh HOME that holds no token, the listing again. */
async function strike(given, token, deps) {
  const name = given.strike;
  const say = (line) => deps.out(`${line}\n`);
  const refuse = (line) => (deps.err(`hermetic: ${line}; nothing was struck\n`), 2);

  say("CLOUDFLARE_API_TOKEN: present in the environment");
  const before = await listing(deps, token);
  if (before.failed) return refuse(before.failed);
  if (!before.names.includes(name)) return refuse(`the account ${before.account.name} has no Worker named ${name}`);
  say(`the listing: ${before.names.length} Workers on the account ${before.account.name}, ${name} among them`);
  say(`striking ${name} deletes its Worker, its Durable Object and every row in it, and its secrets, with box delete under a HOME that holds no token`);
  const no = await consent(deps, given, `strike ${name} on the account?`, `striking ${name}`);
  if (no !== null) return refuse(no);

  const dir = mkdtempSync(path.join(deps.tmp, `${PREFIX}strike-`));
  const home = path.join(dir, "home");
  mkdirSync(home, { mode: 0o700 });
  const facts = { ring: "strike", name, account: before.account.name, directory: dir, steps: [], listing: { before: [...before.names].sort(), after: null }, exit: null };
  const record = () => writeFileSync(path.join(dir, "ring.json"), `${JSON.stringify(facts, null, 2)}\n`);
  record();
  const started = deps.now();
  const struck = await deps.strike(name, home);
  facts.steps.push({ step: "strike", exit: struck.code, seconds: seconds(deps.now() - started) });
  const after = await listing(deps, token);
  facts.listing.after = after.failed ? after.failed : [...after.names].sort();
  const seen = after.failed ? null : compare(before.names.filter((n) => n !== name), after.names);
  facts.exit = struck.code === 0 && seen?.same === true ? 0 : 1;
  record();
  const block = [
    `the strike: ${facts.exit === 0 ? `${name} struck` : `${name} not struck clean`}`,
    `  the step: strike exit ${struck.code} in ${facts.steps[0].seconds}s`,
    `  the listing: ${after.failed ? `not read after: ${after.failed}` : seen.same ? `the listing before without ${name}, ${after.names.length} Workers` : `not the listing before without ${name}: ${[seen.added.length ? `added ${seen.added.join(", ")}` : "", seen.gone.length ? `gone ${seen.gone.join(", ")}` : ""].filter(Boolean).join("; ")}`}`,
  ];
  if (facts.exit === 0) {
    rmSync(dir, { recursive: true, force: true });
    block.push("  the directory: removed");
  } else {
    block.push(`  the directory: kept, ${dir}`);
  }
  say(block.join("\n"));
  return facts.exit;
}

/** The words, then --list, the token, and the ring or the strike. The exit code. */
export async function main(argv, deps) {
  const given = parse(argv);
  if (given.help) {
    deps.out(USAGE);
    return 0;
  }
  if (given.refused) {
    deps.err(`hermetic: ${given.refused}\n${USAGE}`);
    return 2;
  }
  if (given.list) {
    const width = Math.max(...RINGS.map(([ring]) => ring.length));
    deps.out(RINGS.map(([ring, says]) => `${ring.padEnd(width)}  ${says}\n`).join(""));
    return 0;
  }
  const token = deps.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    deps.err(tokenRefusal(given.strike !== undefined ? "delete" : "deploy"));
    return 2;
  }
  return given.strike !== undefined ? strike(given, token, deps) : account(given, token, deps);
}

/** A stream read as lines, each handed on as it completes, the last one at the end. */
function eachLine(stream, fn) {
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const parts = `${rest}${chunk}`.split("\n");
    rest = parts.pop();
    for (const line of parts) fn(line);
  });
  return () => rest !== "" && fn(rest);
}

/** The commit this checkout is at, short and whole, and whether git has anything to say; null when git cannot say. */
function checkoutCommit() {
  const git = (...args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  const head = git("rev-parse", "HEAD");
  const short = git("rev-parse", "--short", "HEAD");
  const status = git("status", "--porcelain");
  if (head.status !== 0 || short.status !== 0 || status.status !== 0) return null;
  return { sha: head.stdout.trim(), short: short.stdout.trim(), dirty: status.stdout.trim() !== "" };
}

/** This machine's world: the checkout's scripts as children, the network, the system's temporary directory. */
export function realDeps() {
  const running = new Set();
  /** Node over `args` from the checkout under `home`; stdout and stderr each line by line to a function. */
  const child = ({ args, stdin }, home, out, err) =>
    new Promise((resolve) => {
      // Not detached: an interrupt at the terminal reaches the child and all it started, as one process group.
      const c = spawn(process.execPath, args, { cwd: REPO, env: childEnv(process.env, home), stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
      running.add(c);
      const flushOut = eachLine(c.stdout, out);
      const flushErr = eachLine(c.stderr, err);
      if (stdin !== undefined) c.stdin.end(stdin);
      c.once("error", (e) => {
        running.delete(c);
        err(`hermetic: ${args[0]} could not be run: ${e.message}`);
        resolve({ code: 1 });
      });
      c.once("close", (code, signal) => {
        running.delete(c);
        flushOut();
        flushErr();
        resolve({ code: code ?? 128 + (os.constants.signals[signal] ?? 0) });
      });
    });
  const toOut = (line) => process.stdout.write(`${line}\n`);
  const toErr = (line) => process.stderr.write(`${line}\n`);
  return {
    env: process.env,
    tmp: os.tmpdir(),
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    now: () => Date.now(),
    fetch: (...a) => fetch(...a),
    commit: checkoutCommit,
    stale: () => staleness(REPO),
    ask: (prompt) => {
      if (!process.stdin.isTTY) return Promise.resolve({ line: "", terminal: false });
      return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        rl.question(prompt, (answer) => (rl.close(), resolve({ line: answer, terminal: true })));
      });
    },
    // A signal at the terminal reaches the children as one process group; a SIGTERM sent to the ring alone is passed on.
    onSignal: (fn) => {
      const on = (signal) => {
        if (signal === "SIGTERM") for (const c of running) c.kill(signal);
        fn(signal);
      };
      process.on("SIGINT", on);
      process.on("SIGTERM", on);
      return () => {
        process.off("SIGINT", on);
        process.off("SIGTERM", on);
      };
    },
    deploy: async (name, home) => {
      const lines = [];
      const ran = await child(childOf("deploy", { name }), home, (line) => lines.push(line), toErr);
      return { code: ran.code, stdout: lines.join("\n") };
    },
    conform: (address, harness, home, lines) => child(childOf("conform", { address, harness }), home, lines.out, lines.err),
    strike: (name, home) => child(childOf("strike", { name }), home, toOut, toErr),
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), realDeps());
}
