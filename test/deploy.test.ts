// ring: checkout
// scripts/box.mjs without an account: the refusal without
// CLOUDFLARE_API_TOKEN, absent or empty, for both verbs, naming the
// token's permissions and what the Worker uses and costs, with exit 2 and
// nothing run, in this process with every seam a spy and as a process
// whose child_process is a spy; the words, each refusal before the token
// is read; and the design's four steps and the delete's listing and typed
// name driven through `main` against a fake wrangler, a fake account API,
// and a fake box, all functions here: the secrets read first, the deploy
// with the commit as TOWN_BUILD, each secret made once on stdin and in no
// argument, ~/.town/operator with mode 600 and the token on one printed
// line alone, a redeploy keeping both, and the delete doing nothing until
// the name is typed. Nothing here runs wrangler or reaches the network: a
// fake is what the script sends, never what the platform does.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/box.mjs");

/** What scripts/box.mjs exports, as this test reads it: the script is plain JavaScript with no declarations, so it is imported by a path typed as a string. */
interface Box {
  CONFIG: string;
  DEFAULT_NAME: string;
  PERMISSIONS: [string, string][];
  main(argv: string[], deps: unknown): Promise<number>;
  parse(argv: string[]): { verb?: string; name?: string; help?: true; refused?: string };
  tokenRefusal(verb: string): string;
}
const { CONFIG, DEFAULT_NAME, PERMISSIONS, main, parse, tokenRefusal }: Box = await import(SCRIPT as string);
const SPY = path.join(ROOT, "test/fixtures/spawn-spy.mjs");
const BUILD = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "cf-token-for-the-fake";

const dirs: string[] = [];
const scratch = (prefix: string) => {
  const d = mkdtempSync(path.join(os.tmpdir(), `town-box-${prefix}-`));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

interface Call {
  args: string[];
  token: string;
  accountId?: string;
  stdin?: string;
}

interface WorldOptions {
  env?: Record<string, string | undefined>;
  /** The Worker is on the account already, with these secrets' values. */
  existing?: Record<string, string>;
  typed?: { line: string; terminal: boolean };
  accounts?: { id: string; name: string }[];
}

/** The fake account, box, and wrangler, and every call made of them. */
function world(options: WorldOptions = {}) {
  const home = scratch("home");
  const calls: Call[] = [];
  const fetched: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const worker = { deployed: options.existing !== undefined, secrets: { ...(options.existing ?? {}) } as Record<string, string>, build: "checkout" };
  const address = (name: string) => `https://${name}.fake-sub.workers.dev`;
  let clock = 0;
  const deps = {
    env: { CLOUDFLARE_API_TOKEN: TOKEN, ...options.env },
    home,
    out: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
    build: () => BUILD,
    now: () => clock,
    sleep: async (ms: number) => void (clock += ms),
    vaultKey: () => "ab".repeat(32),
    operatorToken: () => `op-${Math.random().toString(36).slice(2)}-token`,
    confirm: async () => options.typed ?? { line: "", terminal: false },
    wrangler: async (args: string[], o: { token: string; accountId?: string; stdin?: string }): Promise<{ code: number; stdout: string; stderr: string }> => {
      calls.push({ args, ...o });
      const name = args[args.indexOf("--name") + 1]!;
      if (args[0] === "secret" && args[1] === "list") {
        if (!worker.deployed) return { code: 1, stdout: "", stderr: `✘ [ERROR] Worker "${name}" not found.\n\nIf this is a new Worker, run \`wrangler deploy\` first to create it.` };
        return { code: 0, stdout: JSON.stringify(Object.keys(worker.secrets).map((n) => ({ name: n, type: "secret_text" })), null, "  "), stderr: "" };
      }
      if (args[0] === "deploy") {
        worker.deployed = true;
        worker.build = args[args.indexOf("--var") + 1]!.replace(/^TOWN_BUILD:/, "");
        return { code: 0, stdout: `Total Upload: 1234.56 KiB / gzip: 234.56 KiB\nUploaded ${name} (2.34 sec)\nDeployed ${name} triggers (1.23 sec)\n  ${address(name)}\nCurrent Version ID: 0000`, stderr: "" };
      }
      if (args[0] === "secret" && args[1] === "put") {
        worker.secrets[args[2]!] = (o.stdin ?? "").trimEnd();
        return { code: 0, stdout: `✨ Success! Uploaded secret ${args[2]}`, stderr: "" };
      }
      if (args[0] === "delete") {
        worker.deployed = false;
        return { code: 0, stdout: `Successfully deleted ${name}`, stderr: "" };
      }
      return { code: 1, stdout: "", stderr: `fake wrangler: ${args.join(" ")}` };
    },
    fetch: async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
      const url = String(input);
      fetched.push(`${init.method ?? "GET"} ${url}`);
      const api = "https://api.cloudflare.com/client/v4";
      const json = (result: unknown) => Response.json({ success: true, errors: [], result });
      if (url === `${api}/accounts?per_page=50`) return json(options.accounts ?? [{ id: "acc", name: "the operator's account" }]);
      if (url === `${api}/accounts/acc/workers/scripts`) return json(worker.deployed ? [{ id: "town-box-1" }, { id: "other" }] : [{ id: "other" }]);
      if (url === `${api}/accounts/acc/workers/subdomain`) return json({ subdomain: "fake-sub" });
      const box = /^https:\/\/([a-z0-9-]+)\.fake-sub\.workers\.dev(\/.*)$/.exec(url);
      if (box && worker.deployed) {
        if (box[2] === "/" && (init.method ?? "GET") === "GET") return new Response("town\n", { headers: { "x-town-build": worker.build } });
        if (box[2] === "/admin" && init.method === "POST") {
          const bearer = new Headers(init.headers).get("authorization");
          const status = worker.secrets.TOWN_OPERATOR && bearer === `Bearer ${worker.secrets.TOWN_OPERATOR}` ? 400 : 401;
          return new Response("{}", { status });
        }
      }
      throw new Error(`the fake has no ${url}`);
    },
  };
  return { deps, home, calls, fetched, out: () => out.join(""), err: () => err.join(""), worker, operator: path.join(home, ".town", "operator") };
}

it("without CLOUDFLARE_API_TOKEN, absent or empty, both verbs refuse with the permissions by name and what the Worker uses and costs, exit 2, and run nothing", async () => {
  for (const verb of ["deploy", "delete"]) {
    for (const token of [undefined, "", "  "]) {
      const w = world({ env: { CLOUDFLARE_API_TOKEN: token } });
      const code = await main([verb, "--name", "town-box-1"], w.deps);
      expect(code).toBe(2);
      expect(w.err()).toBe(tokenRefusal(verb));
      expect(w.out()).toBe("");
      expect(w.calls).toEqual([]);
      expect(w.fetched).toEqual([]);
      expect(existsSync(path.join(w.home, ".town"))).toBe(false);
    }
  }
  const text = tokenRefusal("deploy");
  expect(text).toMatch(/^box deploy needs CLOUDFLARE_API_TOKEN in the environment, and it is not there; nothing was made, and wrangler's own login on this machine is not used in its place\./);
  for (const [name] of PERMISSIONS) expect(text).toContain(name);
  expect(text).toContain("Workers Scripts > Edit");
  expect(text).toContain("Durable Objects with SQLite storage and the Worker Loader");
  expect(text).toMatch(/costs .*USD/);
  expect(tokenRefusal("delete")).toContain("nothing was deleted");
});

it("as a process, the refusal is the same, exit 2, and no child process is started", () => {
  const log = path.join(scratch("spy"), "spawns.jsonl");
  writeFileSync(log, "");
  // The spy is proved first: a script that spawns is recorded.
  const control = spawnSync(process.execPath, ["--import", SPY, "-e", "import('node:child_process').then((c) => { try { c.spawn('true', []); } catch {} })"], { env: { ...process.env, TOWN_TEST_SPAWN_LOG: log }, encoding: "utf8" });
  expect(control.status).toBe(0);
  expect(readFileSync(log, "utf8")).toContain('"fn":"spawn"');
  writeFileSync(log, "");
  for (const verb of ["deploy", "delete"]) {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: scratch("home"), TOWN_TEST_SPAWN_LOG: log };
    delete env.CLOUDFLARE_API_TOKEN;
    const r = spawnSync(process.execPath, ["--import", SPY, SCRIPT, verb], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(r.status, r.stderr).toBe(2);
    expect(r.stderr).toBe(tokenRefusal(verb));
    expect(r.stdout).toBe("");
    expect(existsSync(path.join(env.HOME!, ".town"))).toBe(false);
  }
  expect(readFileSync(log, "utf8")).toBe("");
});

it("reads one verb and --name at most once, and refuses anything else before the token is read", async () => {
  expect(parse(["deploy"])).toEqual({ verb: "deploy", name: DEFAULT_NAME });
  expect(DEFAULT_NAME).toBe("town");
  expect(parse(["deploy", "--name", "town-box-1"])).toEqual({ verb: "deploy", name: "town-box-1" });
  expect(parse(["--name=town-box-1", "delete"])).toEqual({ verb: "delete", name: "town-box-1" });
  expect(parse(["--", "delete", "--name", "x"])).toEqual({ verb: "delete", name: "x" });
  expect(parse(["deploy", "--name", "a".repeat(63)])).toEqual({ verb: "deploy", name: "a".repeat(63) });
  for (const help of [["--help"], ["-h"], ["deploy", "--help"]]) expect(parse(help)).toEqual({ help: true });
  const refusals: [string[], RegExp][] = [
    [[], /a verb is needed: deploy or delete/],
    [["launch"], /launch is not a verb of box/],
    [["deploy", "delete"], /delete is one word too many/],
    [["deploy", "--name"], /--name needs a Worker's name/],
    [["deploy", "--name", "--force"], /--name needs a Worker's name/],
    [["deploy", "--force"], /--force is not a flag of box/],
    [["deploy", "--name", "a", "--name", "b"], /--name is given twice/],
    [["deploy", "--name", "Town_Box"], /Town_Box is not a Worker's name/],
    [["deploy", "--name", "-town"], /-town is not a flag of box|is not a Worker's name/],
    [["deploy", "--name=town-"], /town- is not a Worker's name/],
    [["deploy", "--name", "a".repeat(64)], /is not a Worker's name/],
    [["deploy", "--name="], /is not a Worker's name/],
  ];
  for (const [argv, words] of refusals) {
    expect(parse(argv).refused, argv.join(" ")).toMatch(words);
    for (const token of [undefined, TOKEN]) {
      const w = world({ env: { CLOUDFLARE_API_TOKEN: token } });
      expect(await main(argv, w.deps), argv.join(" ")).toBe(2);
      expect(w.err()).toMatch(/^box: .*\nusage: pnpm box deploy/);
      expect(w.calls).toEqual([]);
      expect(w.fetched).toEqual([]);
    }
  }
  const w = world({ env: { CLOUDFLARE_API_TOKEN: undefined } });
  expect(await main(["--help"], w.deps)).toBe(0);
  expect(w.out()).toMatch(/^usage: pnpm box deploy \[--name <worker>\]/);
});

it("deploy: the secrets read, the Worker deployed with the commit, each secret made once on stdin, ~/.town/operator with mode 600, the token on one line, GET / read", async () => {
  const w = world();
  expect(await main(["deploy", "--name", "town-box-1"], w.deps), w.err()).toBe(0);
  const common = ["--name", "town-box-1", "--config", CONFIG, "--env-file", "/dev/null"];
  expect(CONFIG).toBe(path.join(ROOT, "wrangler.jsonc"));
  expect(w.calls.map((c) => c.args)).toEqual([
    ["secret", "list", ...common],
    ["deploy", ...common, "--var", `TOWN_BUILD:${BUILD}`],
    ["secret", "put", "TOWN_VAULT_KEY", ...common],
    ["secret", "put", "TOWN_OPERATOR", ...common],
  ]);
  for (const c of w.calls) expect(c.token).toBe(TOKEN);
  const operator = w.worker.secrets.TOWN_OPERATOR!;
  const key = w.worker.secrets.TOWN_VAULT_KEY!;
  expect(key).toMatch(/^[0-9a-f]{64}$/);
  expect(operator).toMatch(/^op-/);
  expect(w.calls[2]!.stdin).toBe(`${key}\n`);
  expect(w.calls[3]!.stdin).toBe(`${operator}\n`);
  for (const c of w.calls) for (const a of c.args) for (const secret of [key, operator, TOKEN]) expect(a).not.toContain(secret);
  expect(readFileSync(w.operator, "utf8")).toBe(`${operator}\n`);
  expect(statSync(w.operator).mode & 0o777).toBe(0o600);
  const lines = w.out().split("\n");
  expect(lines.filter((l) => l.includes(operator))).toEqual([`operator token, shown once, kept in ${w.operator} with mode 600: ${operator}`]);
  expect(`${w.out()}${w.err()}`).not.toContain(key);
  expect(w.err()).not.toContain(operator);
  expect(`${w.out()}${w.err()}`).not.toContain(TOKEN);
  expect(w.out()).toContain("deployed town-box-1 in 0s: https://town-box-1.fake-sub.workers.dev\n");
  expect(w.out()).toContain("secrets: TOWN_VAULT_KEY made, TOWN_OPERATOR made\n");
  expect(w.out()).toContain(`GET / answers town; x-town-build ${BUILD}\n`);
  expect(w.out()).toContain("consent redirect URI, to register with a provider's web client: https://town-box-1.fake-sub.workers.dev/consent\n");
  expect(w.out()).toContain("next: node bin/townd.js admin --town https://town-box-1.fake-sub.workers.dev user add <name>\n");
  expect(w.fetched).toEqual(["GET https://town-box-1.fake-sub.workers.dev/"]);

  // Run again: the same Worker, redeployed, both secrets kept, no token made or printed, the file as it was.
  const again = world({ existing: { ...w.worker.secrets } });
  mkdirSync(path.dirname(again.operator), { recursive: true });
  writeFileSync(again.operator, `${operator}\n`, { mode: 0o600 });
  expect(await main(["deploy", "--name", "town-box-1"], again.deps), again.err()).toBe(0);
  expect(again.calls.map((c) => c.args[0] + (c.args[0] === "secret" ? ` ${c.args[1]}` : ""))).toEqual(["secret list", "deploy"]);
  expect(again.out()).toContain("redeployed town-box-1 in 0s:");
  expect(again.out()).toContain("secrets: TOWN_VAULT_KEY kept, TOWN_OPERATOR kept (a redeploy keeps both)\n");
  expect(again.out()).toContain(`${again.operator}: holds town-box-1's token\n`);
  expect(`${again.out()}${again.err()}`).not.toContain(operator);
  expect(readFileSync(again.operator, "utf8")).toBe(`${operator}\n`);
});

it("deploy: a Worker to be given an operator's token over a ~/.town/operator that holds one is refused, exit 2, after the read alone", async () => {
  const w = world();
  mkdirSync(path.dirname(w.operator), { recursive: true });
  writeFileSync(w.operator, "another-box-token\n", { mode: 0o600 });
  expect(await main(["deploy"], w.deps)).toBe(2);
  expect(w.calls.map((c) => c.args.slice(0, 2))).toEqual([["secret", "list"]]);
  expect(w.err()).toContain(`box deploy would make town's operator token, and ${w.operator} holds one already, another box's or one deleted; nothing was made.`);
  expect(readFileSync(w.operator, "utf8")).toBe("another-box-token\n");
  expect(w.err()).not.toContain("another-box-token");
});

it("delete: the listing with GETs alone, nothing until the name is typed, then wrangler delete and ~/.town/operator removed when it was this box's", async () => {
  const secrets = { TOWN_VAULT_KEY: "cd".repeat(32), TOWN_OPERATOR: "the-box-operator" };
  const withFile = (w: ReturnType<typeof world>, token: string) => {
    mkdirSync(path.dirname(w.operator), { recursive: true });
    writeFileSync(w.operator, `${token}\n`, { mode: 0o600 });
  };

  // Typed wrong, typed nothing at a terminal, and nothing at all without one: nothing deleted, nothing but GETs.
  for (const typed of [{ line: "town-box-2", terminal: true }, { line: "", terminal: true }, { line: "", terminal: false }]) {
    const w = world({ existing: secrets, typed });
    withFile(w, "the-box-operator");
    expect(await main(["delete", "--name", "town-box-1"], w.deps)).toBe(2);
    expect(w.calls).toEqual([]);
    expect(w.fetched.every((f) => f.startsWith("GET ") || f === "POST https://town-box-1.fake-sub.workers.dev/admin")).toBe(true);
    expect(existsSync(w.operator)).toBe(true);
    expect(w.out()).toBe(
      [
        "deleting town-box-1 from the account the operator's account:",
        "  the Worker at https://town-box-1.fake-sub.workers.dev",
        "  its Durable Object and every row in it: users, shops and their state, passes, grants, sealed credentials, the audit",
        "  its secrets TOWN_VAULT_KEY and TOWN_OPERATOR",
        `  ${w.operator}: holds town-box-1's token, and is removed`,
        "",
      ].join("\n"),
    );
    expect(w.err()).toMatch(typed.terminal ? /nothing was deleted\n$/ : /no terminal here and nothing on stdin; nothing was deleted\./);
  }

  // Typed: deleted, and the file removed.
  const w = world({ existing: secrets, typed: { line: "town-box-1", terminal: true } });
  withFile(w, "the-box-operator");
  expect(await main(["delete", "--name", "town-box-1"], w.deps), w.err()).toBe(0);
  expect(w.calls).toEqual([{ args: ["delete", "--name", "town-box-1", "--config", CONFIG, "--env-file", "/dev/null", "--force"], token: TOKEN, accountId: "acc" }]);
  expect(w.fetched).toEqual([
    "GET https://api.cloudflare.com/client/v4/accounts?per_page=50",
    "GET https://api.cloudflare.com/client/v4/accounts/acc/workers/scripts",
    "GET https://api.cloudflare.com/client/v4/accounts/acc/workers/subdomain",
    "POST https://town-box-1.fake-sub.workers.dev/admin",
  ]);
  expect(w.worker.deployed).toBe(false);
  expect(existsSync(w.operator)).toBe(false);
  expect(w.out()).toContain(`deleted town-box-1 from the operator's account, with its object and its secrets\nremoved ${w.operator}\n`);
  expect(`${w.out()}${w.err()}`).not.toContain("the-box-operator");

  // Another box's token is kept.
  const other = world({ existing: secrets, typed: { line: "town-box-1", terminal: true } });
  withFile(other, "another-box-token");
  expect(await main(["delete", "--name", "town-box-1"], other.deps)).toBe(0);
  expect(other.out()).toContain(`${other.operator}: holds another box's token, and is kept`);
  expect(readFileSync(other.operator, "utf8")).toBe("another-box-token\n");

  // No Worker of the name: refused before the prompt; two accounts without CLOUDFLARE_ACCOUNT_ID: refused.
  const absent = world({ typed: { line: "town-box-1", terminal: true } });
  expect(await main(["delete", "--name", "town-box-1"], absent.deps)).toBe(2);
  expect(absent.err()).toBe("box delete: the account the operator's account has no Worker named town-box-1; nothing was deleted\n");
  expect(absent.calls).toEqual([]);
  const two = world({ existing: secrets, accounts: [{ id: "acc", name: "one" }, { id: "b", name: "two" }], typed: { line: "town-box-1", terminal: true } });
  expect(await main(["delete", "--name", "town-box-1"], two.deps)).toBe(2);
  expect(two.err()).toContain("set CLOUDFLARE_ACCOUNT_ID to the box's; nothing was deleted");
  const chosen = world({ existing: secrets, env: { CLOUDFLARE_ACCOUNT_ID: "acc" }, accounts: [{ id: "acc", name: "one" }, { id: "b", name: "two" }], typed: { line: "town-box-1", terminal: true } });
  expect(await main(["delete", "--name", "town-box-1"], chosen.deps), chosen.err()).toBe(0);
});
