#!/usr/bin/env node
// The outer rings, the environments this checkout's state cannot reach:
//
//   pnpm hermetic --ring account [--name <worker>] [--yes] [--dry-run] [--keep] [-- <harness command…>]
//                                   a tent pitched from this commit, road's conformance over the wire, the tent struck
//   pnpm hermetic --ring agent --sheep <dir> --repo <owner/name> --issue <n> [--kennel <dir>] [--user <name>] [--name <worker>] [--yes] [--dry-run] [--keep] < <token file>
//                                   the tent pitched and furnished, drove's stage run against it from a sheep checkout, the tent struck
//   pnpm hermetic --strike <worker> [--yes]
//                                   a tent a killed run left, deleted under a HOME that holds no token
//   pnpm hermetic --list            each outer ring, what it needs, and what it costs; runs nothing
//
// The ring chooses the environment, never the steps: the account ring's
// steps are scripts/conform.mjs's, run over a box of the ring's own; the
// agent ring's are the stage's, a sheep checkout's scripts/drove.mjs run as
// a program at the path --sheep gives. No file of the sheep checkout is
// imported or read here: the script and the kennel are found by path alone.
//
// The preflight is every run's first part and `--dry-run` whole, a line
// each: CLOUDFLARE_API_TOKEN present, or box's own refusal and exit 2 with
// nothing read; the commit and whether the tree is dirty; dist/ no older
// than src/, since conformance refuses a stale build; for the agent ring,
// the stage's script and the kennel found by path, and the github token
// read whole from stdin, refused from a terminal, empty, or with a line
// break, before the account is read; the listing, the account's Workers by
// name read with box's own GETs, and the tent's name free in it, or a
// refusal naming --strike; for the agent ring, the tent's address from the
// account's workers.dev subdomain and the stage's command line word for
// word; the price in box's words, and the agent ring's model turn; the
// consent from afar named as not walked. Then `pitch <name> on the
// account? [y/N]` at a terminal unless --yes; no terminal and no --yes is a
// refusal. Every refusal is exit 2 and makes nothing.
//
// After the ask, a directory under the system's temporary directory,
// `town-hermetic-<sha>-<random>/`, holding `home/`, the HOME every child
// runs under, `ring.json`, the run's facts as they happen, and the steps'
// lines, `conform.txt` or `drove.txt`. Then the steps, each a child of node
// with HOME that `home/`, TOWN_OPERATOR unset, and the rest of this
// environment through, so no child reads ~/.town/operator:
//
//   1. the pitch: `scripts/box.mjs deploy --name <tent>`, its stdout read
//      for the address and the build, which must be this commit, and never
//      written or echoed, since it prints the tent's operator token once;
//      box's stderr passes through;
//   2. the account ring's walk: `scripts/conform.mjs --town <address> --
//      <harness>`, its lines to the terminal and to conform.txt as they
//      come, its verdict line and its exit read and no count fixed;
//   2. the agent ring's furnishing: `bin/townd.js admin --town <address>`
//      from the checkout, `user add`, `credential add` with the token on its
//      stdin and nowhere else, `shop add -` for shops/memory and shops/github
//      each as a tar on stdin, then `shop ls` and `credential ls --user` read
//      as the stage reads them; then the stage: `<sheep>/scripts/drove.mjs
//      --box <address> …` in the sheep checkout, its lines to the terminal
//      and to drove.txt as they come (a line holding the token's bytes is
//      written to drove.txt whole and to the terminal without them), its
//      root recorded and its exit the verdict; then the ring's own search,
//      every file under the directory read for the token's bytes, a hit
//      named by path and never printed;
//   3. the strike: `scripts/box.mjs delete --name <tent>`, the name on its
//      stdin, whatever step failed, unless --keep;
//   4. the listing again, whose ring's own names, those starting
//      town-hermetic- and the tent's, must be the listing before's (with
//      --keep, but for the tent); the account is shared, so another's Worker
//      that came or went is named in the closing block and ring.json and is
//      not held against the run.
//
// Exit 0 is every step at 0, the search clean, and the listings the same,
// the directory removed unless --keep; 1 is any other run, the directory
// kept and named; 130 is a run a signal stopped, the strike run where the
// process can still run it. `main` takes its world as `deps`, so
// test/hermetic.test.ts drives every path with fakes and never a child or
// the network.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { ReadStream } from "node:tty";
import { fileURLToPath } from "node:url";
import { PRICE, listing, parse as boxWords, tokenRefusal } from "./box.mjs";
import { staleness } from "./stale.ts";

const REPO = path.resolve(import.meta.dirname, "..");
const BOX = path.join(REPO, "scripts", "box.mjs");
const CONFORM = path.join(REPO, "scripts", "conform.mjs");
const TOWND = path.join(REPO, "bin", "townd.js");
const MEMORY = path.join(REPO, "shops", "memory");
const GITHUB = path.join(REPO, "shops", "github");
const API = "https://api.cloudflare.com/client/v4";

/** The tent's name is this and the short commit, unless --name says. */
export const PREFIX = "town-hermetic-";

/** The harness conformance runs when no words follow `--`. */
export const HARNESS = ["node", "bin/town.js"];

/** The user the agent ring furnishes the tent for, unless --user says. */
export const USER = "stranger";

/** The stage's script, under the sheep checkout --sheep names; found by path, never read. */
export const STAGE = path.join("scripts", "drove.mjs");

/** The kennel, under the sheep checkout, unless --kennel says: the stage's own default, said explicitly. */
export const KENNEL = ".sheep";

/** What the agent ring adds to box's price. */
export const AGENT_PRICE = "a container's minutes on the kennel's station and a model turn, under a dollar; drove phase 2's two walks took sixteen and fifteen seconds";

export const USAGE = `usage: pnpm hermetic --ring account [--name <worker>] [--yes] [--dry-run] [--keep] [-- <harness command…>]
       pnpm hermetic --ring agent --sheep <dir> --repo <owner/name> --issue <n> [--kennel <dir>] [--user <name>] [--name <worker>] [--yes] [--dry-run] [--keep] < <token file>
       pnpm hermetic --strike <worker> [--yes]
       pnpm hermetic --list
`;

/** Each outer ring, what it needs, and what it costs, as --list prints them. */
export const RINGS = [
  ["account", "needs CLOUDFLARE_API_TOKEN and this checkout built; a tent pitched from this commit, road's conformance over the wire, the tent struck; costs a deploy's requests and an object's minutes, cents, and about a minute"],
  ["agent", "needs the account ring's, a sheep checkout (--sheep), a kennel naming a standing station, and a github token on stdin; the tent furnished and drove's stage run against it; costs a container's minutes and a model turn, under a dollar, and minutes"],
];

/** The agent ring's own words, each taking a value. */
const AGENT_WORDS = ["--sheep", "--repo", "--issue", "--kennel", "--user"];

/** What each word that takes a value needs after it, in a refusal. */
const NEEDS = {
  "--ring": "a ring's name: account or agent",
  "--name": "a Worker's name",
  "--strike": "a Worker's name",
  "--sheep": "a sheep checkout's directory",
  "--kennel": "a kennel's directory",
  "--repo": "a repository as owner/name",
  "--issue": "an issue's number",
  "--user": "a user's name",
};

/** `owner/name`, each part of GitHub's characters and neither `.` nor `..`: scripts/walk.mjs's rule, what shops/github accepts. */
const REPO_SHAPE = /^(?![.]{1,2}\/)[A-Za-z0-9_.-]+\/(?![.]{1,2}$)[A-Za-z0-9_.-]+$/;

/** A user's name, as the town's store takes one: a namespace. */
const USER_NAME = /^[a-z][a-z0-9-]*$/;

const refused = (line) => ({ refused: line });

/**
 * The words: `--ring <name>`, `--name <worker>`, `--strike <worker>`, and
 * the agent ring's `--sheep`, `--repo`, `--issue`, `--kennel`, `--user`
 * (each also as `--flag=value`), `--yes`, `--dry-run`, `--keep`, `--list`,
 * each at most once, and after a `--` the harness command; a lone `--`
 * before any word is pnpm's and skipped. `{ help }`, `{ refused }`, or what
 * was given.
 */
export function parse(argv) {
  const given = { ring: undefined, name: undefined, strike: undefined, list: false, yes: false, dryRun: false, keep: false, harness: undefined, sheep: undefined, repo: undefined, issue: undefined, kennel: undefined, user: undefined };
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
    if (["--yes", "--dry-run", "--keep", "--list"].includes(flag)) {
      if (eq !== -1) return refused(`${flag} takes no value`);
    } else if (flag in NEEDS) {
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
      if (value === undefined || value === "" || (eq === -1 && value.startsWith("-"))) return refused(`${flag} needs ${NEEDS[flag]} after it`);
      if (flag === "--ring") {
        if (value !== "account" && value !== "agent") return refused(`no ring ${value}: the outer rings are account and agent`);
        given.ring = value;
      } else if (flag === "--name" || flag === "--strike") {
        const bad = boxWords(["deploy", "--name", value]).refused;
        if (bad) return refused(bad);
        if (value === "town") return refused("town is the shepherd's box, and a ring never names a tent town, pitches it, or strikes it; leave --name out for town-hermetic-<sha>");
        given[flag.slice(2)] = value;
      } else if (flag === "--repo") {
        if (!REPO_SHAPE.test(value)) return refused(`--repo ${value} is not owner/name of letters, digits, _, ., and -`);
        given.repo = value;
      } else if (flag === "--issue") {
        if (!/^[1-9][0-9]*$/.test(value)) return refused(`--issue ${value} is not an issue's number, a positive integer`);
        given.issue = Number(value);
      } else if (flag === "--user") {
        if (!USER_NAME.test(value)) return refused(`--user ${value} is not a user's name: lowercase letters, digits, and -, starting with a letter`);
        given.user = value;
      } else {
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
  if (given.ring === undefined) return refused("a ring is needed: --ring account, or --strike <worker>, or --list; the agent ring is --ring agent --sheep <dir>");
  if (given.ring === "account") {
    const theirs = AGENT_WORDS.find((f) => seen.has(f));
    if (theirs) return refused(`${theirs} is the agent ring's; the ring here is --ring account`);
    return given;
  }
  if (given.harness) return refused("a harness command after -- is the account ring's; the agent ring's steps are the stage's");
  if (given.sheep === undefined) return refused("the agent ring needs --sheep <dir>, a sheep checkout whose scripts/drove.mjs is the stage");
  if (given.repo === undefined) return refused("the agent ring needs --repo <owner/name>, the repository the github token is scoped to");
  if (given.issue === undefined) return refused("the agent ring needs --issue <n>, an open issue on that repository");
  given.sheep = path.resolve(given.sheep);
  given.kennel = path.resolve(given.kennel ?? path.join(given.sheep, KENNEL));
  given.user ??= USER;
  return given;
}

/** The child for each step: node's arguments, where it runs when not the checkout, and what goes on its stdin. No value of a token is in any. */
export function childOf(step, { name, address, harness, words, sheep, kennel, user, repo, issue }) {
  if (step === "deploy") return { args: [BOX, "deploy", "--name", name] };
  if (step === "strike") return { args: [BOX, "delete", "--name", name], stdin: `${name}\n` };
  if (step === "conform") return { args: [CONFORM, "--town", address, "--", ...harness] };
  if (step === "admin") return { args: [TOWND, "admin", "--town", address, ...words] };
  if (step === "stage") return { args: [path.join(sheep, STAGE), "--box", address, "--user", user, "--repo", repo, "--issue", String(issue), "--townd", TOWND, "--kennel", kennel], cwd: sheep };
  throw new Error(`no step ${step}`);
}

/**
 * The furnishing, in scripts/walk.mjs's github plan's order over a box: the
 * user, the credential with the token on its stdin, memory, and github with
 * --user so its tests run on the credential; each verb's words and what its
 * stdin is, `token` or a shop's directory as a tar, never a value.
 */
export function furnishing(user) {
  return [
    { words: ["user", "add", user] },
    { words: ["credential", "add", "--user", user, "--type", "github-token", "--label", "hermetic"], stdin: "token" },
    { words: ["shop", "add", "-"], stdin: { tar: MEMORY } },
    { words: ["shop", "add", "-", "--user", user], stdin: { tar: GITHUB } },
  ];
}

/** A child's environment: this one, HOME the ring's, and TOWN_OPERATOR unset, so townd reads the tent's token and never the shepherd's. */
export function childEnv(env, home) {
  const child = { ...env, HOME: home };
  delete child.TOWN_OPERATOR;
  return child;
}

/** The column under `name` in a table townd admin printed, by the header's offsets, as scripts/walk.mjs reads one. */
export function column(table, name) {
  const [header, ...rows] = table.split("\n").filter((l) => l !== "");
  if (header === undefined) return [];
  const start = header.indexOf(name);
  if (start === -1) return [];
  const next = header.slice(start + name.length).search(/\S/);
  const end = next === -1 ? undefined : start + name.length + next;
  return rows.map((r) => r.slice(start, end).trim());
}

/**
 * The ring's search, as scripts/walk.mjs's `--search` reads: every file
 * under `dir`, as bytes, for the token's bytes. `{ hits, unread }`, each a
 * list of paths relative to `dir`; the token is never returned.
 */
export function searchFor(dir, token) {
  const needle = Buffer.from(token, "utf8");
  const hits = [];
  const unread = [];
  for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" }).sort()) {
    const full = path.join(dir, file);
    try {
      if (!lstatSync(full).isFile()) continue;
      if (readFileSync(full).includes(needle)) hits.push(file);
    } catch (e) {
      unread.push(`${file} (${e.code ?? "unknown error"})`);
    }
  }
  return { hits, unread };
}

/** The stage's root, from the last `root:` line of its stdout; null when it printed none. */
export function rootOf(lines) {
  let root = null;
  for (const line of lines) {
    const m = /^root: (?:kept at )?(\S+?)(?:,? since .*| \(.*|;.*)?$/.exec(line);
    if (m) root = m[1];
  }
  return root;
}

/**
 * Two listings as sets of names, the ring's own apart: those starting
 * town-hermetic- and the tent's. The account is shared, so only the ring's
 * own decide `same`; what of them was added and is gone, and what of
 * others' came or went, named and not held against the run.
 */
function compare(before, after, tent) {
  const ours = (n) => n.startsWith(PREFIX) || n === tent;
  const added = after.filter((n) => !before.includes(n));
  const gone = before.filter((n) => !after.includes(n));
  const mine = { added: added.filter(ours), gone: gone.filter(ours) };
  const others = { added: added.filter((n) => !ours(n)), gone: gone.filter((n) => !ours(n)) };
  return { same: mine.added.length === 0 && mine.gone.length === 0, added: mine.added, gone: mine.gone, others, othersMoved: others.added.length + others.gone.length > 0 };
}

/** The closing block's line for others' Workers that came or went, or none. */
const othersLine = (seen) =>
  seen?.othersMoved ? [`  others' Workers: ${[seen.others.added.length ? `added ${seen.others.added.join(", ")}` : "", seen.others.gone.length ? `gone ${seen.others.gone.join(", ")}` : ""].filter(Boolean).join("; ")}, not the ring's, and not held against the run`] : [];

const seconds = (ms) => Math.round(ms / 1000);

/** The ask, at a terminal unless --yes: null to go on, or the refusal's sentence. */
async function consent(deps, given, question, what) {
  if (given.yes) return null;
  // The agent ring's stdin is the token, so its ask is the controlling terminal's.
  const asked = await deps.ask(`${question} [y/N] `, given.ring === "agent" ? { tty: true } : undefined);
  if (!asked.terminal) return `${what} is asked at a terminal, and there is none here; run it at one, or give --yes to answer from a script`;
  if (!/^y(es)?$/i.test(asked.line.trim())) return `${what} was not answered y`;
  return null;
}

/** The stage's half of the preflight, by path and stdin alone: the lines to say and the token, or the refusal. */
async function stageFound(given, deps) {
  const script = path.join(given.sheep, STAGE);
  let kind = null;
  try {
    kind = statSync(script).isFile() ? "file" : "not a file";
  } catch {
    kind = null;
  }
  if (kind !== "file") return { refused: `${given.sheep} holds no ${STAGE}${kind === null ? "" : " that is a file"}, the stage; --sheep names a sheep checkout` };
  let kennel = false;
  try {
    kennel = statSync(given.kennel).isDirectory();
  } catch {
    kennel = false;
  }
  if (!kennel) return { refused: `the kennel ${given.kennel} is not a directory; --kennel names one, ${path.join(given.sheep, KENNEL)} unless given` };
  const stdin = await deps.readStdin();
  if (stdin.terminal) return { refused: "the agent ring reads the github token on stdin, and stdin is a terminal; redirect it from a file" };
  const token = stdin.bytes.toString("utf8").replace(/\r?\n$/, "");
  if (token === "") return { refused: "the agent ring read nothing on stdin; redirect the github token from a file" };
  if (/[\r\n]/.test(token)) return { refused: "the github token on stdin holds a line break after its last one is stripped; a token is one line" };
  return {
    token,
    lines: [`the stage: ${script}, found by path`, `the kennel: ${given.kennel}, found by path`, `the token: read from stdin, ${Buffer.byteLength(token, "utf8")} bytes, not printed`],
  };
}

/** The account's workers.dev subdomain, with one GET as box's delete reads it; `{ subdomain }` or `{ failed }`. */
async function subdomainOf(deps, token, account) {
  const route = `/accounts/${account.id}/workers/subdomain`;
  try {
    const res = await deps.fetch(`${API}${route}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success === true && body.result?.subdomain) return { subdomain: body.result.subdomain };
    return { failed: `the account API answered GET ${route} with status ${res.status} and no subdomain` };
  } catch (e) {
    return { failed: `the account API did not answer ${route} (${e.message})` };
  }
}

/** The command line a child's node arguments make, as the terminal and ring.json say it. */
const commandLine = (child) => ["node", ...child.args].join(" ");

/** The ring, account or agent: the preflight, the ask, the pitch, the walk or the furnishing and the stage and the search, the strike, the listing again, and the closing block. */
async function ring(given, cfToken, deps) {
  const agent = given.ring === "agent";
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
  let token = null;
  if (agent) {
    const found = await stageFound(given, deps);
    if (found.refused) return refuse(found.refused);
    token = found.token;
    for (const line of found.lines) say(line);
  }
  const name = given.name ?? `${PREFIX}${commit.short}`;
  const before = await listing(deps, cfToken);
  if (before.failed) return refuse(before.failed);
  if (before.names.includes(name)) return refuse(`the account ${before.account.name} already holds a Worker named ${name}, a tent kept or left by a killed run; strike it with pnpm hermetic --strike ${name}`);
  say(`the listing: ${before.names.length} Workers on the account ${before.account.name}, and ${name} free`);
  if (agent) {
    const sub = await subdomainOf(deps, cfToken, before.account);
    const would = sub.failed ? `https://${name}.<subdomain>.workers.dev` : `https://${name}.${sub.subdomain}.workers.dev`;
    say(`the tent: ${name}, pitched from this checkout and furnished for ${given.user}; its address ${sub.failed ? `${would}, the subdomain not read: ${sub.failed}` : would}`);
    say(`the stage's command line, in ${given.sheep}: ${commandLine(childOf("stage", { ...given, address: would }))}`);
  } else {
    say(`the tent: ${name}, pitched from this checkout; the harness: ${harness.join(" ")}`);
  }
  for (const line of PRICE) say(`the price: ${line}`);
  if (agent) say(`the price: ${AGENT_PRICE}`);
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
  const facts = agent
    ? { ring: "agent", name, sha: commit.sha, dirty: commit.dirty, sheep: given.sheep, kennel: given.kennel, repo: given.repo, issue: given.issue, user: given.user, stage: null, keep: given.keep, directory: dir, account: before.account.name, address: null, build: null, furnishing: [], stageRoot: null, search: null, steps: [], listing: { before: [...before.names].sort(), after: null }, signal: null, exit: null }
    : { ring: "account", name, sha: commit.sha, dirty: commit.dirty, harness: harness.join(" "), keep: given.keep, directory: dir, account: before.account.name, address: null, build: null, verdict: null, steps: [], listing: { before: [...before.names].sort(), after: null }, signal: null, exit: null };
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

    // 2. The walk: conformance's lines as they come, or the furnishing, the stage, and the search.
    let walked;
    let block;
    if (agent) {
      walked = await agentSteps({ given, deps, dir, home, token, address, facts, record, step, say, go: () => pitched && signal === null });
    } else {
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
      walked = walk?.code === 0 && facts.verdict?.startsWith("conformant: ") === true;
    }

    // 3. The strike, whatever step failed, unless --keep.
    const struck = given.keep ? null : await step("strike", () => deps.strike(name, home));

    // 4. The listing again.
    const after = await listing(deps, cfToken);
    facts.listing.after = after.failed ? after.failed : [...after.names].sort();
    const seen = after.failed ? null : compare(before.names, given.keep ? after.names.filter((n) => n !== name) : after.names, name);
    if (seen?.othersMoved) facts.listing.others = seen.others;
    const green = signal === null && pitched && walked && (struck === null || struck.code === 0) && seen?.same === true;
    facts.exit = signal !== null ? 130 : green ? 0 : 1;
    record();

    // The closing block.
    const standing = !after.failed && after.names.includes(name);
    block = [
      `the ${agent ? "agent" : "account"} ring: ${signal !== null ? `stopped by ${signal}` : green ? "green" : "not green"}`,
      `  the tent: ${name}${address ? ` at ${address}` : ""}${build ? `, the build ${build}` : ""}`,
    ];
    if (agent) {
      block.push(
        `  the stage: ${facts.stage ?? "not run"}`,
        `  the kennel: ${given.kennel}`,
        `  the steps: ${facts.steps.map((s) => `${s.step} exit ${s.exit} in ${s.seconds}s`).join(", ")}`,
        `  the furnishing: ${facts.furnishing.length ? facts.furnishing.map((f) => `${f.verb} exit ${f.exit}`).join(", ") : "not done"}`,
        `  the stage's root: ${facts.stageRoot ? `${facts.stageRoot}; read it with: node ${path.join(given.sheep, STAGE)} --status ${facts.stageRoot}` : facts.stage ? "none, since the stage printed no root: line" : "none, since the stage was not run"}`,
        `  the search: ${facts.search === "clean" ? `the token is in no file under ${dir}` : [facts.search.length ? `the token is in ${facts.search.join(", ")}` : "", facts.searchUnread ? `incomplete, ${facts.searchUnread.join(", ")} unread` : ""].filter(Boolean).join("; ")}`,
      );
    } else {
      block.push(
        `  the harness: ${harness.join(" ")}`,
        `  the steps: ${facts.steps.map((s) => `${s.step} exit ${s.exit} in ${s.seconds}s`).join(", ")}`,
        `  the verdict: ${facts.verdict ?? "no verdict line"}`,
      );
    }
    block.push(
      `  the listing: ${after.failed ? `not read after: ${after.failed}` : seen.same ? `the same before and after${given.keep ? " but for the tent" : ""}, ${before.names.length} Workers` : `not the same before and after: ${[seen.added.length ? `added ${seen.added.join(", ")}` : "", seen.gone.length ? `gone ${seen.gone.join(", ")}` : ""].filter(Boolean).join("; ")}`}`,
      ...othersLine(seen),
      "  the consent from afar, box journey 4: skipped, since it needs a browser",
    );
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

/**
 * The agent ring's steps between the pitch and the strike: the furnishing,
 * the stage, and the ring's own search, which runs whatever came before it.
 * True when all three are green.
 */
async function agentSteps({ given, deps, dir, home, token, address, facts, record, step, say, go }) {
  // Nothing a child prints on the terminal holds the token's bytes; what it wrote to a file is kept whole, for the search.
  const hidden = (line) => (line.includes(token) ? line.split(token).join("<the github token, not printed>") : line);

  // The furnishing, each verb printed with its exit; the first not 0 stops it.
  let furnished = false;
  if (go()) {
    const ran = await step("furnish", async () => {
      const admin = async (words, stdin) => {
        const verb = words.join(" ");
        let input;
        if (stdin === "token") input = `${token}\n`;
        else if (stdin?.tar) {
          const tar = deps.tar(stdin.tar);
          if (tar.code !== 0) {
            facts.furnishing.push({ verb, exit: tar.code });
            record();
            say(`furnish: ${verb} exit ${tar.code}, since tar of ${stdin.tar} exited ${tar.code}`);
            return { code: tar.code, stdout: "" };
          }
          input = tar.bytes;
        }
        const r = await deps.admin(childOf("admin", { address, words }), home, input);
        facts.furnishing.push({ verb, exit: r.code });
        record();
        say(`furnish: ${verb} exit ${r.code}`);
        if (r.code !== 0) {
          const shown = `${r.stdout}\n${r.stderr}`.split("\n").filter((l) => l.trim() !== "").map((l) => `  ${hidden(l)}`);
          if (shown.length) deps.err(`hermetic: townd admin ${verb} exited ${r.code}:\n${shown.join("\n")}\n`);
        }
        return r;
      };
      for (const verb of furnishing(given.user)) {
        if (!go()) return { code: 130 };
        const r = await admin(verb.words, verb.stdin);
        if (r.code !== 0) return { code: r.code };
      }
      // Read as the stage reads them, so a furnishing it would refuse is refused here in the ring's words.
      const shops = await admin(["shop", "ls"]);
      if (shops.code !== 0) return { code: shops.code };
      const names = column(shops.stdout, "name");
      say(`shop ls: ${names.join(", ") || "no shops"}`);
      const creds = await admin(["credential", "ls", "--user", given.user]);
      if (creds.code !== 0) return { code: creds.code };
      const types = column(creds.stdout, "type");
      say(`credential ls --user ${given.user}: ${types.join(", ") || "no credentials"}`);
      const lacks = ["town/memory", "town/github"].filter((s) => !names.includes(s));
      const github = types.filter((t) => t === "github-token").length;
      if (lacks.length) {
        deps.err(`hermetic: the tent's shop ls names no ${lacks.join(" and no ")}, and the stage needs both; the stage is not run\n`);
        return { code: 1 };
      }
      if (github !== 1) {
        deps.err(`hermetic: the tent's credential ls --user ${given.user} names ${github} github-token credentials, and the stage needs exactly one; the stage is not run\n`);
        return { code: 1 };
      }
      return { code: 0 };
    });
    furnished = ran.code === 0;
  }

  // The stage, its lines as they come, its root recorded, its exit the verdict.
  let staged = false;
  if (furnished && go()) {
    const child = childOf("stage", { ...given, address });
    facts.stage = commandLine(child);
    record();
    say(`the stage, in ${given.sheep}: ${facts.stage}`);
    const file = path.join(dir, "drove.txt");
    writeFileSync(file, "");
    const keep = (line) => appendFileSync(file, `${line}\n`);
    const outLines = [];
    const ran = await step("stage", () =>
      deps.stage(child, home, {
        out: (line) => {
          deps.out(`${hidden(line)}\n`);
          keep(line);
          outLines.push(line);
        },
        err: (line) => {
          deps.err(`${hidden(line)}\n`);
          keep(line);
        },
      }),
    );
    facts.stageRoot = rootOf(outLines);
    record();
    say(`the stage: exit ${ran.code}; its root ${facts.stageRoot ?? "not named: its stdout has no root: line"}`);
    staged = ran.code === 0;
  }

  // The ring's own search, over every file under its directory, before the strike.
  const { hits, unread } = searchFor(dir, token);
  facts.search = hits.length ? hits : unread.length ? [] : "clean";
  if (unread.length) facts.searchUnread = unread;
  record();
  for (const hit of hits) say(`search: the token is in ${hit}`);
  for (const u of unread) say(`search: ${u} could not be read, and the search is incomplete`);
  if (facts.search === "clean") say(`search: the token is in no file under ${dir}`);

  return furnished && staged && facts.search === "clean";
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
  const seen = after.failed ? null : compare(before.names.filter((n) => n !== name), after.names, name);
  if (seen?.othersMoved) facts.listing.others = seen.others;
  facts.exit = struck.code === 0 && seen?.same === true ? 0 : 1;
  record();
  const block = [
    `the strike: ${facts.exit === 0 ? `${name} struck` : `${name} not struck clean`}`,
    `  the step: strike exit ${struck.code} in ${facts.steps[0].seconds}s`,
    `  the listing: ${after.failed ? `not read after: ${after.failed}` : seen.same ? `the listing before without ${name}, ${after.names.length} Workers` : `not the listing before without ${name}: ${[seen.added.length ? `added ${seen.added.join(", ")}` : "", seen.gone.length ? `gone ${seen.gone.join(", ")}` : ""].filter(Boolean).join("; ")}`}`,
    ...othersLine(seen),
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
  return given.strike !== undefined ? strike(given, token, deps) : ring(given, token, deps);
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

/** A line asked on stderr and read from `input`, a terminal. */
const question = (input, prompt) =>
  new Promise((resolve) => {
    const rl = createInterface({ input, output: process.stderr });
    rl.question(prompt, (answer) => (rl.close(), resolve({ line: answer, terminal: true })));
  });

/** This machine's world: the checkout's scripts as children, the network, the system's temporary directory. */
export function realDeps() {
  const running = new Set();
  /** Node over `args` under `home`, in `cwd` or the checkout; stdout and stderr each line by line to a function. */
  const child = ({ args, stdin, cwd }, home, out, err) =>
    new Promise((resolve) => {
      // Not detached: an interrupt at the terminal reaches the child and all it started, as one process group.
      const c = spawn(process.execPath, args, { cwd: cwd ?? REPO, env: childEnv(process.env, home), stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
      running.add(c);
      const flushOut = eachLine(c.stdout, out);
      const flushErr = eachLine(c.stderr, err);
      if (stdin !== undefined) {
        c.stdin.on("error", () => {});
        c.stdin.end(stdin);
      }
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
    ask: (prompt, { tty = false } = {}) => {
      if (process.stdin.isTTY) return question(process.stdin, prompt);
      if (!tty) return Promise.resolve({ line: "", terminal: false });
      // stdin holds the token: the controlling terminal answers, when there is one.
      let fd;
      try {
        fd = openSync("/dev/tty", "r");
      } catch {
        return Promise.resolve({ line: "", terminal: false });
      }
      const input = new ReadStream(fd);
      return question(input, prompt).finally(() => input.destroy());
    },
    /** The whole of stdin as bytes, or that it is a terminal and unread. */
    readStdin: async () => {
      if (process.stdin.isTTY) return { terminal: true };
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      return { terminal: false, bytes: Buffer.concat(chunks) };
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
    /** A shop's directory as the bytes `tar --format ustar -cf - -C <dir> .` makes, as scripts/walk.mjs's tarOf does. */
    tar: (dir) => {
      const r = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", dir, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" }, maxBuffer: 16 * 1024 * 1024 });
      return { code: r.status ?? 1, bytes: r.stdout };
    },
    /** townd admin as a child; its stdout and stderr read whole, `input` its stdin. */
    admin: async (adminChild, home, input) => {
      const out = [];
      const err = [];
      const ran = await child({ ...adminChild, stdin: input }, home, (l) => out.push(l), (l) => err.push(l));
      return { code: ran.code, stdout: out.length ? `${out.join("\n")}\n` : "", stderr: err.join("\n") };
    },
    stage: (stageChild, home, lines) => child(stageChild, home, lines.out, lines.err),
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), realDeps());
}
