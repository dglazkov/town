#!/usr/bin/env node
// The box's deploy and delete, the operator's tool at this laptop:
//
//   pnpm box deploy [--name <worker>]   the town as one Worker on the account CLOUDFLARE_API_TOKEN reaches
//   pnpm box delete [--name <worker>]   that Worker gone, after its name is typed
//
// The Worker is named `town` unless `--name` says. Nothing runs without
// CLOUDFLARE_API_TOKEN in this environment: absent or empty, the command
// prints what it needs, the token's permissions by name, and what the
// Worker uses and costs, and exits 2 having run nothing, whatever wrangler's
// own login on this machine would reach.
//
// `deploy` is the design's four steps. The Worker's secrets are read first
// (`wrangler secret list`), so a deploy that would make the operator's token
// over a ~/.town/operator already holding one is refused before anything is
// made. Then `wrangler deploy` over the checkout's wrangler.jsonc, the name
// given and the commit defined in as `TOWN_BUILD` (the commit plus `-dirty`
// when git has anything to say); then each secret the Worker lacks, made
// here and handed to `wrangler secret put` on stdin: `TOWN_VAULT_KEY`,
// thirty-two random bytes as hex, and `TOWN_OPERATOR`, a token written to
// ~/.town/operator with mode 600 and printed once, on one line. A redeploy
// keeps both and says so. Then `GET /` at the address wrangler printed,
// until it answers `town` with this build in `x-town-build`; when this deploy
// made the operator's token, then its door, until `POST /admin` with that token
// answers 400 stamped with this build fifteen times running, a second apart,
// each on a connection of its own (`connection: close`, as the GETs are too,
// so none rides a kept-alive one): a fresh Worker answers GET / from a version
// before the one holding the secrets, and in its first seconds a fresh name
// answers from Cloudflare's edge without a build as often as from the box;
// both waits within ninety seconds. Then the report:
// the address, the build, the consent redirect to register, and the line to
// type next.
//
// `delete` lists what goes, read with GETs alone: the account, the Worker
// and its address, its object and secrets, and whether ~/.town/operator
// holds this box's token, asked of the box's door with a body no verb reads
// (400 for the operator's bearer, 401 for any other, and no row either
// way). Then the name typed at a terminal, or one line of stdin where there
// is none, and nothing happens unless it is the name; then `wrangler delete
// --force`, and ~/.town/operator removed when it was this box's.
//
// Every wrangler here runs from the checkout's own node_modules with the
// token in its environment and no value in its arguments, `CI` set so it
// never prompts, no metrics, and `--env-file /dev/null` with
// CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false so the checkout's `.env` is
// read into nothing. `main` takes its world as `deps`, so
// test/deploy.test.ts drives both verbs with a fake wrangler and a fake
// account and box, and never the real ones.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(import.meta.dirname, "..");
export const CONFIG = path.join(REPO, "wrangler.jsonc");
const WRANGLER = path.join(REPO, "node_modules", "wrangler", "bin", "wrangler.js");
const API = "https://api.cloudflare.com/client/v4";

/** The Worker's name when `--name` gives none. */
export const DEFAULT_NAME = "town";

/** A Worker's name: lowercase letters, digits, and hyphens, neither end a hyphen, at most 63 characters. */
const WORKER_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** What the token needs, as the dashboard's token editor names them, and what each is for. */
export const PERMISSIONS = [
  ["Account > Workers Scripts > Edit", "the Worker, its Durable Object, its secrets, and its workers.dev address; the delete"],
  ["Account > Account Settings > Read", "for wrangler, and the delete's listing, to find the account"],
];

const TOKENS_PAGE = "https://dash.cloudflare.com/profile/api-tokens";
const PRICING_PAGE = "https://developers.cloudflare.com/workers/platform/pricing/";

/** How many times running, a second apart and each on its own connection, a fresh box's door must take the operator's token, stamped with the build, before the box stands. */
export const DOOR_RUN = 15;

/** The two secrets the deploy makes once. */
export const SECRETS = ["TOWN_VAULT_KEY", "TOWN_OPERATOR"];

export const USAGE = `usage: pnpm box deploy [--name <worker>]   the town as one Worker, named ${DEFAULT_NAME} unless --name says
       pnpm box delete [--name <worker>]   that Worker deleted, after its name is typed
Both need CLOUDFLARE_API_TOKEN in the environment.
`;

/** What the Worker uses and what it costs, two sentences, in the refusal without the token and in the ring's preflight. */
export const PRICE = [
  "The Worker uses Durable Objects with SQLite storage and the Worker Loader, on a workers.dev address.",
  `It costs the account's Workers plan (Workers Paid is 5 USD a month) and what the box uses over it, cents a day for one operator: ${PRICING_PAGE}`,
];

/** The refusal without the token: what the verb needs, the permissions by name, what the Worker uses and costs. */
export function tokenRefusal(verb) {
  const made = verb === "deploy" ? "nothing was made" : "nothing was deleted";
  return [
    `box ${verb} needs CLOUDFLARE_API_TOKEN in the environment, and it is not there; ${made}, and wrangler's own login on this machine is not used in its place.`,
    `Make an API token at ${TOKENS_PAGE} for the account the box is on, with these permissions:`,
    ...PERMISSIONS.map(([name, why]) => `  ${name.padEnd(36)} ${why}`),
    ...PRICE,
    "Then, with the token in the environment and never as an argument:",
    `  pnpm box ${verb}${verb === "delete" ? " --name <worker>" : " [--name <worker>]"}`,
    "",
  ].join("\n");
}

/**
 * The words: one verb, `deploy` or `delete`, and `--name <worker>` or
 * `--name=<worker>` at most once, anywhere; a lone `--` is pnpm's and
 * skipped. `{ help }` for `--help`, `{ refused }` for anything else wrong.
 */
export function parse(argv) {
  let verb;
  let name;
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i];
    if (w === "--") continue;
    if (w === "--help" || w === "-h" || w === "help") return { help: true };
    let given;
    if (w === "--name") {
      given = argv[++i];
      if (given === undefined || given.startsWith("--")) return { refused: "--name needs a Worker's name after it" };
    } else if (w.startsWith("--name=")) {
      given = w.slice("--name=".length);
    } else if (w.startsWith("-")) {
      return { refused: `${w} is not a flag of box; the one flag is --name <worker>` };
    } else if (verb === undefined) {
      if (w !== "deploy" && w !== "delete") return { refused: `${w} is not a verb of box; the verbs are deploy and delete` };
      verb = w;
      continue;
    } else {
      return { refused: `${w} is one word too many; box takes one verb and --name <worker>` };
    }
    if (name !== undefined) return { refused: "--name is given twice; a command is of one Worker" };
    if (!WORKER_NAME.test(given)) return { refused: `${given} is not a Worker's name: lowercase letters, digits, and hyphens, neither end a hyphen, at most 63 characters` };
    name = given;
  }
  if (verb === undefined) return { refused: "a verb is needed: deploy or delete" };
  return { verb, name: name ?? DEFAULT_NAME };
}

/** ~/.town/operator under `home`. */
export const operatorFile = (home) => path.join(home, ".town", "operator");

function heldToken(home) {
  try {
    const held = readFileSync(operatorFile(home), "utf8").trim();
    return held === "" ? null : held;
  } catch {
    return null;
  }
}

/** The last lines of a failed wrangler call, which carry no value this script sent: every value went on stdin. */
const tail = (ran, lines = 12) =>
  `${ran.stdout}\n${ran.stderr}`
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-lines)
    .map((l) => `  ${l}`)
    .join("\n");

/** What every wrangler call carries: the checkout's config, and an env file that is empty, so the checkout's `.env` is not read. */
const common = (name) => ["--name", name, "--config", CONFIG, "--env-file", "/dev/null"];

/** The secrets' names from `wrangler secret list`'s JSON; null when its stdout holds none. */
function secretNames(stdout) {
  const from = stdout.indexOf("[");
  const to = stdout.lastIndexOf("]");
  if (from === -1 || to < from) return null;
  try {
    const list = JSON.parse(stdout.slice(from, to + 1));
    return Array.isArray(list) ? list.map((s) => s?.name).filter((n) => typeof n === "string") : null;
  } catch {
    return null;
  }
}

/** The Worker's workers.dev address in wrangler deploy's output. */
function addressIn(output, name) {
  const escaped = name.replace(/[-]/g, "\\-");
  return new RegExp(`https://${escaped}\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.workers\\.dev\\b`).exec(output)?.[0] ?? null;
}

/**
 * Whether `token` is the box's operator, asked of its door: `POST /admin`
 * with the bearer and a body no verb reads is 400 for the operator and 401
 * for anyone else, and runs nothing and writes no row either way.
 */
async function isOperator(deps, address, token) {
  const status = (await doorAnswer(deps, address, token))?.status;
  return status === 400 ? "yes" : status === 401 ? "no" : "unknown";
}

/**
 * What the box's door answers `POST /admin` with `token` and a body no verb
 * reads: `{ status, build }`, the build its `x-town-build` or null, or null
 * when it did not answer. `headers` are added to the request's.
 */
async function doorAnswer(deps, address, token, headers = {}) {
  try {
    const res = await deps.fetch(new URL("/admin", address), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers }, body: "{}", signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel();
    return { status: res.status, build: res.headers.get("x-town-build") };
  } catch {
    return null;
  }
}

async function deploy(name, token, deps) {
  const say = (line) => deps.err(`box: ${line}\n`);
  const build = deps.build();
  if (build === null) {
    deps.err("box deploy needs this checkout's commit, which it defines into the Worker, and git could not say it; nothing was made\n");
    return 2;
  }
  const home = deps.home;

  // 1. The Worker's secrets, read before anything is made: a Worker not on the account has none.
  say(`reading ${name}'s secrets (wrangler secret list)`);
  const listed = await deps.wrangler(["secret", "list", ...common(name)], { token });
  let names;
  let existed;
  if (listed.code === 0) {
    names = secretNames(listed.stdout);
    existed = true;
    if (names === null) {
      deps.err(`box deploy: wrangler secret list printed no list of secrets; nothing was made:\n${tail(listed)}\n`);
      return 1;
    }
  } else if (/not found/i.test(`${listed.stdout}\n${listed.stderr}`)) {
    names = [];
    existed = false;
  } else {
    deps.err(`box deploy: wrangler secret list --name ${name} exited ${listed.code}; nothing was made:\n${tail(listed)}\n`);
    return 1;
  }
  const missing = SECRETS.filter((s) => !names.includes(s));
  if (missing.includes("TOWN_OPERATOR") && heldToken(home) !== null) {
    deps.err(
      `box deploy would make ${name}'s operator token, and ${operatorFile(home)} holds one already, another box's or one deleted; nothing was made.\n` +
        `Move it away (townd admin --town reads $TOWN_OPERATOR as well) and run the deploy again.\n`,
    );
    return 2;
  }

  // 2. The deploy, the commit defined in.
  const started = deps.now();
  say(`deploying ${name} from ${build} (wrangler deploy)`);
  const deployed = await deps.wrangler(["deploy", ...common(name), "--var", `TOWN_BUILD:${build}`], { token });
  if (deployed.code !== 0) {
    deps.err(`box deploy: wrangler deploy --name ${name} exited ${deployed.code}:\n${tail(deployed)}\n`);
    return 1;
  }
  const address = addressIn(`${deployed.stdout}\n${deployed.stderr}`, name);
  if (address === null) {
    deps.err(`box deploy: wrangler deployed ${name} and printed no workers.dev address for it; the box needs one:\n${tail(deployed)}\n`);
    return 1;
  }

  // 3. The secrets, once, each on stdin.
  let operator = null;
  for (const secret of missing) {
    const value = secret === "TOWN_VAULT_KEY" ? deps.vaultKey() : (operator = deps.operatorToken());
    say(`making ${secret} (wrangler secret put, the value on stdin)`);
    const put = await deps.wrangler(["secret", "put", secret, ...common(name)], { token, stdin: `${value}\n` });
    if (put.code !== 0) {
      deps.err(`box deploy: wrangler secret put ${secret} --name ${name} exited ${put.code}; ${name} is deployed without it, and the deploy run again makes what is missing:\n${tail(put)}\n`);
      return 1;
    }
  }
  let kept = null;
  if (operator !== null) {
    try {
      mkdirSync(path.dirname(operatorFile(home)), { recursive: true, mode: 0o700 });
      writeFileSync(operatorFile(home), `${operator}\n`, { mode: 0o600 });
      chmodSync(operatorFile(home), 0o600);
      kept = operatorFile(home);
    } catch (e) {
      deps.err(`box deploy: ${operatorFile(home)} could not be written (${e.message}); keep the token below yourself, it is not shown again\n`);
    }
  }

  // 4. The report, once the address answers as this build and, when this deploy made the operator's token, the door takes it:
  // a fresh Worker's GET / answers from a version before the one holding the secrets, and its door meanwhile answers 500;
  // a fresh name answers from Cloudflare's edge (404, `error code: 1042`, no build) as well as from the box, so one 400 is
  // not the box standing, nor five on one kept-alive connection: DOOR_RUN of them running is, each on its own connection
  // and stamped with the build.
  say(`waiting for GET / at ${address} to answer town as ${build}`);
  const until = deps.now() + 90_000;
  let answered = null;
  for (; deps.now() < until; await deps.sleep(1_000)) {
    try {
      const res = await deps.fetch(new URL("/", address), { headers: { connection: "close" }, signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      answered = { text, build: res.headers.get("x-town-build") };
      if (text === "town\n" && answered.build === build) break;
    } catch {
      answered = null;
    }
  }
  const built = answered !== null && answered.text === "town\n" && answered.build === build;
  let door = null;
  let run = 0;
  let longest = 0;
  if (built && operator !== null) {
    say(`waiting for the door at ${address} to take the operator's token`);
    for (; deps.now() < until; await deps.sleep(1_000)) {
      door = await doorAnswer(deps, address, operator, { connection: "close" });
      run = door?.status === 400 && door.build === build ? run + 1 : 0;
      longest = Math.max(longest, run);
      if (run === DOOR_RUN) break;
    }
  }
  const seconds = Math.round((deps.now() - started) / 1000);
  const out = (line) => deps.out(`${line}\n`);
  out(`${existed ? "redeployed" : "deployed"} ${name} in ${seconds}s: ${address}`);
  out(`secrets: ${SECRETS.map((s) => `${s} ${missing.includes(s) ? "made" : "kept"}`).join(", ")}${missing.length === 0 ? " (a redeploy keeps both)" : ""}`);
  if (operator !== null) out(`operator token, shown once${kept ? `, kept in ${kept} with mode 600` : ""}: ${operator}`);
  if (!built) {
    deps.err(`box deploy: GET ${address} did not answer town with x-town-build ${build} within ninety seconds; it answered ${answered ? `${JSON.stringify(answered.text.slice(0, 80))} as ${answered.build ?? "no build"}` : "nothing"}\n`);
    return 1;
  }
  out(`GET / answers town; x-town-build ${answered.build}`);
  if (operator !== null) {
    if (run !== DOOR_RUN) {
      deps.err(`box deploy: the door at ${address} did not take the operator's token ${DOOR_RUN} times running within ninety seconds; POST /admin with it answered ${door === null ? "nothing" : `${door.status} with ${door.build === null ? "no build" : `the build ${door.build}`}`} after ${longest} of ${DOOR_RUN} in a row, and 400 with the build ${build} is the operator's\n`);
      return 1;
    }
    out("the door takes the operator's token");
  }
  if (operator === null) {
    const held = heldToken(home);
    const mine = held === null ? "absent" : await isOperator(deps, address, held);
    const said = {
      absent: `absent: townd admin --town needs $TOWN_OPERATOR set to ${name}'s token`,
      yes: `holds ${name}'s token`,
      no: `holds a token ${name} refuses: townd admin --town needs $TOWN_OPERATOR set to ${name}'s token`,
      unknown: "holds a token the box did not say is its own",
    };
    out(`${operatorFile(home)}: ${said[mine]}`);
  }
  out(`consent redirect URI, to register with a provider's web client: ${new URL("/consent", address)}`);
  out(`next: node bin/townd.js admin --town ${address} user add <name>`);
  return 0;
}

/** One GET of the account API with the token; the result, or a sentence. */
async function api(deps, token, route) {
  let res;
  try {
    res = await deps.fetch(`${API}${route}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return { failed: `the account API did not answer ${route} (${e.message})`, code: 1 };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success !== true) {
    const errors = Array.isArray(body?.errors) && body.errors.length ? body.errors.map((e) => `${e.message} (code ${e.code})`).join("; ") : `status ${res.status}`;
    return { failed: `the account API refused GET ${route}: ${errors}`, code: 2 };
  }
  return { result: body.result };
}

/**
 * The listing, with GETs alone and `deps.fetch` and `deps.env` of its world:
 * the one account the token reaches (narrowed by CLOUDFLARE_ACCOUNT_ID), and
 * the names of its Workers. `{ account, names }`, or `{ failed, code }` with
 * the sentence; the delete reads it, and so does scripts/hermetic.mjs.
 */
export async function listing(deps, token) {
  const accounts = await api(deps, token, "/accounts?per_page=50");
  if (accounts.failed) return accounts;
  const wanted = deps.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const reachable = (Array.isArray(accounts.result) ? accounts.result : []).filter((a) => !wanted || a.id === wanted);
  if (reachable.length === 0) return { failed: wanted ? `the token reaches no account ${wanted}` : "the token reaches no account", code: 2 };
  if (reachable.length > 1) return { failed: `the token reaches ${reachable.length} accounts (${reachable.map((a) => a.name).join(", ")}); set CLOUDFLARE_ACCOUNT_ID to the box's`, code: 2 };
  const account = reachable[0];
  const scripts = await api(deps, token, `/accounts/${account.id}/workers/scripts`);
  if (scripts.failed) return scripts;
  return { account, names: (Array.isArray(scripts.result) ? scripts.result : []).map((s) => s.id) };
}

async function remove(name, token, deps) {
  const home = deps.home;
  const refuse = (line, code = 2) => (deps.err(`box delete: ${line}; nothing was deleted\n`), code);

  // The listing, with GETs alone.
  const listed = await listing(deps, token);
  if (listed.failed) return refuse(listed.failed, listed.code);
  const { account, names } = listed;
  if (!names.includes(name)) return refuse(`the account ${account.name} has no Worker named ${name}`);
  const subdomain = await api(deps, token, `/accounts/${account.id}/workers/subdomain`);
  const address = subdomain.result?.subdomain ? `https://${name}.${subdomain.result.subdomain}.workers.dev` : null;
  const held = heldToken(home);
  const mine = held === null ? "absent" : address === null ? "unknown" : await isOperator(deps, address, held);
  const file = operatorFile(home);
  const fileLine = {
    absent: `${file}: absent`,
    yes: `${file}: holds ${name}'s token, and is removed`,
    no: `${file}: holds another box's token, and is kept`,
    unknown: `${file}: holds a token ${name} did not say is its own, and is kept`,
  }[mine];
  deps.out(
    [
      `deleting ${name} from the account ${account.name}:`,
      `  the Worker at ${address ?? "(no workers.dev address known)"}`,
      "  its Durable Object and every row in it: users, shops and their state, passes, grants, sealed credentials, the audit",
      `  its secrets ${SECRETS.join(" and ")}`,
      `  ${fileLine}`,
      "",
    ].join("\n"),
  );

  // The name, typed.
  const { line, terminal } = await deps.confirm(`type ${name} to delete it: `);
  if (line === "" && !terminal) {
    deps.err(`box delete needs ${name} typed to confirm, and there is no terminal here and nothing on stdin; nothing was deleted.\nDeleting ${name} cannot be undone, so it is the operator's to type: at your own terminal, run\n  pnpm box delete --name ${name}\nand type the name when it asks.\n`);
    return 2;
  }
  if (line !== name) return refuse(line === "" ? `nothing typed (the name is ${name})` : `${line} is not ${name}`);

  deps.err(`box: deleting ${name} (wrangler delete)\n`);
  const deleted = await deps.wrangler(["delete", ...common(name), "--force"], { token, accountId: account.id });
  if (deleted.code !== 0) {
    deps.err(`box delete: wrangler delete --name ${name} --force exited ${deleted.code}:\n${tail(deleted)}\n`);
    return 1;
  }
  deps.out(`deleted ${name} from ${account.name}, with its object and its secrets\n`);
  if (mine === "yes") {
    rmSync(file, { force: true });
    deps.out(`removed ${file}\n`);
  } else if (mine !== "absent") {
    deps.out(`kept ${file}\n`);
  }
  return 0;
}

/** The two verbs over `deps`: the words, the token, then deploy or delete. The exit code. */
export async function main(argv, deps) {
  const words = parse(argv);
  if (words.help) {
    deps.out(USAGE);
    return 0;
  }
  if (words.refused) {
    deps.err(`box: ${words.refused}\n${USAGE}`);
    return 2;
  }
  const token = deps.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    deps.err(tokenRefusal(words.verb));
    return 2;
  }
  return words.verb === "deploy" ? deploy(words.name, token, deps) : remove(words.name, token, deps);
}

/** The commit this checkout is at, `-dirty` when git has anything to say; null when git cannot say. */
function checkoutBuild() {
  const git = (...args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  const head = git("rev-parse", "HEAD");
  const status = git("status", "--porcelain");
  if (head.status !== 0 || status.status !== 0) return null;
  return `${head.stdout.trim()}${status.stdout.trim() === "" ? "" : "-dirty"}`;
}

/** One line: at a terminal, asked for on stderr and typed; otherwise the first line of stdin. */
function readLine(prompt) {
  if (process.stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(prompt, (answer) => (rl.close(), resolve({ line: answer.trim(), terminal: true })));
    });
  }
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve({ line: text.split("\n")[0].trim(), terminal: false }));
    process.stdin.on("error", () => resolve({ line: "", terminal: false }));
    process.stdin.resume();
  });
}

/** This machine's world: the checkout's wrangler, the network, the operator's home. */
export function realDeps() {
  return {
    env: process.env,
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    home: process.env.HOME ?? os.homedir(),
    build: checkoutBuild,
    fetch: (...a) => fetch(...a),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    vaultKey: () => randomBytes(32).toString("hex"),
    operatorToken: () => randomBytes(32).toString("base64url"),
    confirm: readLine,
    wrangler: (args, { token, accountId, stdin }) =>
      new Promise((resolve, reject) => {
        if (!existsSync(WRANGLER)) return reject(new Error(`${WRANGLER} is missing; run pnpm install`));
        const env = { ...process.env, CLOUDFLARE_API_TOKEN: token, CI: "1", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
        if (accountId) env.CLOUDFLARE_ACCOUNT_ID = accountId;
        delete env.TOWN_OPERATOR;
        // Not detached: an interrupt at the terminal reaches wrangler and anything it started, as one process group.
        const child = spawn(process.execPath, [WRANGLER, ...args], { cwd: REPO, env, stdio: ["pipe", "pipe", "pipe"] });
        const out = [];
        const err = [];
        child.stdout.on("data", (b) => out.push(b));
        child.stderr.on("data", (b) => err.push(b));
        child.once("error", reject);
        child.once("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
        child.stdin.end(stdin ?? "");
      }),
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), realDeps());
}
