// ring: checkout
// scripts/hermetic.mjs without an account or a child: `main` driven with a
// fake account API behind box's own listing, a fake deploy that puts the
// tent on the fake account, writes home/.town/operator, and prints the
// token's line as box does, a fake conformance, and a fake strike, all
// functions here. The usage and every refusal before anything is made;
// --list; the preflight's lines and the --dry-run stop; a dirty tree named;
// the name from the sha and from --name, town refused; the pitch's build
// checked against the sha; a green run's step order and its directory
// removed; a failed check striking the tent and keeping the directory;
// --keep leaving the tent and naming it; the listings unequal seen; a signal
// striking; --strike on a name the listing lacks refused and on one it
// holds deleted under a HOME with no token; and every file the ring leaves
// read for the operator's token, found only in home/.town/operator. The
// agent ring on the same fakes and a fake townd admin, tar, and stage, over
// a fake sheep checkout this test makes (an empty scripts/drove.mjs and an
// empty .sheep/), never a real one: its words and every refusal of the
// preflight's stage half before the account is read; its --dry-run naming
// the stage's command line word for word; the furnishing's order, the token
// on the credential child's stdin and in no argument and no file; the
// stage's child word for word, its exit the verdict, its root recorded; a
// furnishing that fails or lists short, no stage; and the ring's search
// finding a token a fake stage planted, naming the path, never printing it.
// Nothing here spawns a child or reaches the network: a fake is what the
// ring sends, never what the platform does.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/hermetic.mjs");
const BOX = path.join(ROOT, "scripts/box.mjs");

/** What scripts/hermetic.mjs exports, as this test reads it: plain JavaScript, imported by a path typed as a string. */
interface Child {
  args: string[];
  stdin?: string;
  cwd?: string;
}
interface Hermetic {
  HARNESS: string[];
  USER: string;
  AGENT_PRICE: string;
  PREFIX: string;
  USAGE: string;
  RINGS: [string, string][];
  main(argv: string[], deps: unknown): Promise<number>;
  childOf(step: string, o: { name?: string; address?: string; harness?: string[]; words?: string[]; sheep?: string; kennel?: string; user?: string; repo?: string; issue?: number }): Child;
  childEnv(env: Record<string, string | undefined>, home: string): Record<string, string | undefined>;
  furnishing(user: string): { words: string[]; stdin?: "token" | { tar: string } }[];
  column(table: string, name: string): string[];
  rootOf(lines: string[]): string | null;
  searchFor(dir: string, token: string): { hits: string[]; unread: string[] };
}
const { HARNESS, USER, AGENT_PRICE, PREFIX, USAGE, RINGS, main, childOf, childEnv, furnishing, column, rootOf, searchFor }: Hermetic = await import(SCRIPT as string);
const { PRICE, tokenRefusal }: { PRICE: string[]; tokenRefusal(verb: string): string } = await import(BOX as string);

const SHA = "1cc6087aaaabbbbccccddddeeeeffff000011112";
const SHORT = "1cc6087";
const TENT = `town-hermetic-${SHORT}`;
const TOKEN = "cf-token-for-the-fake";
const OPERATOR = "op-the-tents-operator-token";
const GH = "github_pat_the-strangers-token-for-the-fake";
const API = "https://api.cloudflare.com/client/v4";

const dirs: string[] = [];
const scratch = (prefix: string) => {
  const d = mkdtempSync(path.join(os.tmpdir(), `town-hermetic-test-${prefix}-`));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Every file under `dir`, relative, with its bytes. */
function filesUnder(dir: string): [string, string][] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => statSync(path.join(dir, f)).isFile())
    .map((f) => [f, readFileSync(path.join(dir, f), "utf8")]);
}

interface Lines {
  out(line: string): void;
  err(line: string): void;
}
interface Ran {
  code: number;
  stdout?: string;
}

interface WorldOptions {
  env?: Record<string, string | undefined>;
  commit?: { sha: string; short: string; dirty: boolean } | null;
  stale?: string | null;
  answer?: { line: string; terminal: boolean };
  workers?: string[];
  accounts?: { id: string; name: string }[];
  /** The build the fake deploy's box answers with. */
  build?: string;
  deployCode?: number;
  /** Conformance's verdict: every check ok, or one failed. */
  conform?: "green" | "fail";
  /** The strike exits 0 and leaves the Worker on the account. */
  strikeLeaves?: boolean;
  /** Workers another's ring deploys or deletes on the account while the pitch or the strike runs. */
  meanwhile?: { add?: string[]; remove?: string[] };
  /** A step that raises the ring's signal while it runs. */
  signalIn?: "walk" | "stage";
  /** What stdin holds, or that it is a terminal. */
  stdin?: { terminal: true } | { terminal: false; text: string };
  /** A furnishing verb, by its first words, that exits 1. */
  adminFails?: string;
  /** Shops the fake tent's shop ls leaves out, and github-token credentials its credential ls lists. */
  shopLsLacks?: string;
  githubTokens?: number;
  /** The fake stage: its exit, the root line it prints, and where it plants the github token's bytes. */
  stage?: { code?: number; root?: "named" | "kept" | "none"; plant?: "stdout" | "home" };
}

const STAGE_ROOT = "/tmp/drove-fake-root-abc";

/** The fake account, deploy, conformance, and strike, and every call made of them. */
function world(options: WorldOptions = {}) {
  const tmp = scratch("tmp");
  const workers = new Set(options.workers ?? ["town", "other"]);
  const calls: { step: string; name?: string; home?: string; address?: string; harness?: string[]; args?: string[]; cwd?: string; stdin?: string | Buffer }[] = [];
  let stdinRead = 0;
  const tent = { users: [] as string[], credentials: [] as string[], shops: [] as string[] };
  const fetched: string[] = [];
  const asked: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const seen: { atStrike?: [string, string][]; homeAtStrike?: string[] } = {};
  let clock = 0;
  let commitRead = 0;
  let raise: ((signal: string) => void) | undefined;
  const address = (name: string) => `https://${name}.fake-sub.workers.dev`;
  const elsewhere = () => {
    for (const n of options.meanwhile?.add ?? []) workers.add(n);
    for (const n of options.meanwhile?.remove ?? []) workers.delete(n);
  };
  const deps = {
    env: { CLOUDFLARE_API_TOKEN: TOKEN, ...options.env },
    tmp,
    out: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
    now: () => clock,
    commit: () => (commitRead++, options.commit === undefined ? { sha: SHA, short: SHORT, dirty: false } : options.commit),
    stale: () => options.stale ?? null,
    ask: async (prompt: string) => (asked.push(prompt), options.answer ?? { line: "", terminal: false }),
    onSignal: (fn: (signal: string) => void) => ((raise = fn), () => (raise = undefined)),
    fetch: async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
      const url = String(input);
      fetched.push(`${init.method ?? "GET"} ${url}`);
      const json = (result: unknown) => Response.json({ success: true, errors: [], result });
      if (url === `${API}/accounts?per_page=50`) return json(options.accounts ?? [{ id: "acc", name: "the operator's account" }]);
      if (url === `${API}/accounts/acc/workers/scripts`) return json([...workers].map((id) => ({ id })));
      if (url === `${API}/accounts/acc/workers/subdomain`) return json({ subdomain: "fake-sub" });
      throw new Error(`the fake has no ${url}`);
    },
    deploy: async (name: string, home: string): Promise<Ran> => {
      calls.push({ step: "deploy", name, home });
      elsewhere();
      clock += 41_000;
      workers.add(name);
      const file = path.join(home, ".town", "operator");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `${OPERATOR}\n`, { mode: 0o600 });
      const build = options.build ?? SHA;
      const stdout = [
        `deployed ${name} in 41s: ${address(name)}`,
        "secrets: TOWN_VAULT_KEY made, TOWN_OPERATOR made",
        `operator token, shown once, kept in ${file} with mode 600: ${OPERATOR}`,
        ...(options.deployCode ? [] : [`GET / answers town; x-town-build ${build}`, "the door takes the operator's token", `consent redirect URI, to register with a provider's web client: ${address(name)}/consent`]),
      ].join("\n");
      return { code: options.deployCode ?? 0, stdout };
    },
    conform: async (at: string, harness: string[], home: string, lines: Lines): Promise<Ran> => {
      calls.push({ step: "conform", address: at, harness, home });
      clock += 14_000;
      if (options.signalIn === "walk") {
        raise?.("SIGINT");
        lines.err("conform: SIGINT; the town is struck");
        return { code: 130 };
      }
      for (let i = 0; i < 29; i++) lines.out(`ok check-${i} (§1)`);
      if (options.conform === "fail") {
        lines.out("FAIL stdin-pipe (§4): expected exit 0 / came exit 1");
        lines.out("not conformant: 1 of 30 checks failed");
        return { code: 1 };
      }
      lines.out("ok check-29 (§8)");
      lines.out("conformant: 30 checks");
      return { code: 0 };
    },
    strike: async (name: string, home: string): Promise<Ran> => {
      calls.push({ step: "strike", name, home });
      elsewhere();
      clock += 6_000;
      const dir = path.dirname(home);
      seen.atStrike = filesUnder(dir);
      seen.homeAtStrike = readdirSync(home, { recursive: true, encoding: "utf8" });
      if (!options.strikeLeaves) workers.delete(name);
      rmSync(path.join(home, ".town", "operator"), { force: true });
      return { code: 0 };
    },
    readStdin: async () => {
      stdinRead++;
      const given = options.stdin ?? { terminal: false, text: `${GH}\n` };
      return given.terminal ? { terminal: true } : { terminal: false, bytes: Buffer.from(given.text, "utf8") };
    },
    tar: (dir: string) => ({ code: 0, bytes: Buffer.from(`ustar of ${dir}`) }),
    admin: async (child: Child, home: string, stdin?: string | Buffer): Promise<Ran & { stderr: string }> => {
      calls.push({ step: "admin", args: child.args, home, stdin });
      clock += 1_000;
      const words = child.args.slice(4).join(" ");
      if (options.adminFails && words.startsWith(options.adminFails)) return { code: 1, stdout: "", stderr: `townd admin: ${words} refused by the fake` };
      const said = (stdout: string) => ({ code: 0, stdout, stderr: "" });
      if (words.startsWith("user add ")) return (tent.users.push(child.args.at(-1)!), said(`user ${child.args.at(-1)}\n`));
      if (words.startsWith("credential add ")) return (tent.credentials.push("github-token"), said("cred_1\n"));
      if (words === "shop add -") return (tent.shops.push("town/memory"), said("added town/memory\n"));
      if (words.startsWith("shop add - --user")) return (tent.shops.push("town/github"), said("added town/github\n"));
      if (words === "shop ls") {
        const rows = tent.shops.filter((n) => n !== options.shopLsLacks).map((n) => `${n.padEnd(12)}  0.1.0    town   list    -        2026-09-14`);
        return said(["name          version  owner  commands  depends  added", ...rows, ""].join("\n"));
      }
      if (words.startsWith("credential ls --user ")) {
        const n = options.githubTokens ?? tent.credentials.length;
        const rows = Array.from({ length: n }, (_, i) => `cred_${i}  stranger  github-token  hermetic  2026-09-14  live   -       0`);
        return said(["id      user      type          label     created     state  scopes  grants", ...rows, ""].join("\n"));
      }
      throw new Error(`the fake admin has no ${words}`);
    },
    stage: async (child: Child, home: string, lines: Lines): Promise<Ran> => {
      calls.push({ step: "stage", args: child.args, cwd: child.cwd, home });
      clock += 16_000;
      const o = options.stage ?? {};
      lines.out("pass: pass_1 for stranger");
      lines.out("sheep: sheep-fake-1 on sheep-drove");
      if (o.plant === "stdout") lines.out(`the grant was ${GH} all along`);
      if (o.plant === "home") writeFileSync(path.join(home, "left-behind.txt"), `token=${GH}\n`);
      if (options.signalIn === "stage") {
        raise?.("SIGINT");
        return { code: 130 };
      }
      lines.err("drove: a line on stderr");
      if (o.root !== "none") lines.out(o.root === "kept" ? `root: kept at ${STAGE_ROOT}, since the sheep could not be ended` : `root: ${STAGE_ROOT} (walk.json, log.jsonl, audit.txt, report.txt); --status and --teardown take it`);
      return { code: o.code ?? 0 };
    },
  };
  return {
    deps,
    workers,
    calls,
    fetched,
    asked,
    seen,
    tmp,
    tent,
    commitRead: () => commitRead,
    stdinRead: () => stdinRead,
    out: () => out.join(""),
    err: () => err.join(""),
    ringDirs: () => readdirSync(tmp).map((d) => path.join(tmp, d)),
  };
}

const onlyGets = (fetched: string[]) => fetched.every((f) => f.startsWith("GET "));

it("--help is the usage, --list is each outer ring on a line with what it needs and costs, and neither reads the token or runs anything", async () => {
  const w = world({ env: { CLOUDFLARE_API_TOKEN: undefined } });
  expect(await main(["--help"], w.deps)).toBe(0);
  expect(w.out()).toBe(USAGE);
  expect(USAGE).toContain("pnpm hermetic --ring account [--name <worker>] [--yes] [--dry-run] [--keep] [-- <harness command…>]");
  expect(USAGE).toContain("pnpm hermetic --strike <worker> [--yes]");
  expect(USAGE).toContain("pnpm hermetic --list");

  for (const argv of [["--list"], ["--", "--list"]]) {
    const l = world({ env: { CLOUDFLARE_API_TOKEN: undefined } });
    expect(await main(argv, l.deps)).toBe(0);
    const lines = l.out().trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^account +needs CLOUDFLARE_API_TOKEN .*costs .*cents/);
    expect(lines[1]).toMatch(/^agent +needs .*costs .*dollar/);
    expect(RINGS.map(([r]) => r)).toEqual(["account", "agent"]);
    expect(l.err()).toBe("");
    expect([l.calls, l.fetched, l.asked, l.ringDirs()]).toEqual([[], [], [], []]);
    expect(l.commitRead()).toBe(0);
  }
});

it("every wrong word is refused in a sentence with the usage, exit 2, before the token, git, or the listing is read", async () => {
  const refusals: [string[], RegExp][] = [
    [[], /a ring is needed: --ring account, or --strike <worker>, or --list/],
    [["--ring"], /--ring needs a ring's name/],
    [["--ring", "sky"], /no ring sky: the outer rings are account and agent/],
    [["--ring", "agent"], /the agent ring needs --sheep <dir>, a sheep checkout/],
    [["--ring", "agent", "--repo", "o/r", "--issue", "7"], /the agent ring needs --sheep <dir>/],
    [["--ring", "agent", "--sheep", "/s", "--issue", "7"], /the agent ring needs --repo <owner\/name>/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r"], /the agent ring needs --issue <n>/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r/x", "--issue", "7"], /--repo o\/r\/x is not owner\/name/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "../r", "--issue", "7"], /--repo \.\.\/r is not owner\/name/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r", "--issue", "0"], /--issue 0 is not an issue's number/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r", "--issue", "7x"], /--issue 7x is not an issue's number/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r", "--issue", "7", "--user", "Stranger"], /--user Stranger is not a user's name/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r", "--issue", "7", "--sheep", "/t"], /--sheep is given twice/],
    [["--ring", "agent", "--sheep"], /--sheep needs a sheep checkout's directory after it/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r", "--issue", "7", "--", "node", "bin/town.js"], /a harness command after -- is the account ring's/],
    [["--ring", "agent", "--sheep", "/s", "--repo", "o/r", "--issue", "7", "--name", "town"], /town is the shepherd's box/],
    [["--ring", "account", "--repo", "o/r"], /--repo is the agent ring's/],
    [["--strike", TENT, "--sheep", "/s"], /--strike takes --yes and nothing else; --sheep is a ring's/],
    [["--ring", "account", "--sheep", "../sheep"], /--sheep is the agent ring's/],
    [["--ring", "account", "--name", "town"], /town is the shepherd's box/],
    [["--ring=account", "--name=town"], /town is the shepherd's box/],
    [["--ring", "account", "--name", "Town_Tent"], /Town_Tent is not a Worker's name/],
    [["--ring", "account", "--name"], /--name needs a Worker's name/],
    [["--ring", "account", "--yes", "--yes"], /--yes is given twice/],
    [["--ring", "account", "--ring", "account"], /--ring is given twice/],
    [["--ring", "account", "--force"], /--force is not a flag of hermetic/],
    [["--ring", "account", "--keep=1"], /--keep takes no value/],
    [["--ring", "account", "now"], /now is not a word of hermetic/],
    [["--ring", "account", "--"], /-- needs a harness command after it/],
    [["--strike", "town"], /town is the shepherd's box/],
    [["--strike"], /--strike needs a Worker's name/],
    [["--strike", TENT, "--ring", "account"], /--strike takes --yes and nothing else/],
    [["--strike", TENT, "--keep"], /--strike takes --yes and nothing else/],
    [["--strike", TENT, "--", "node", "bin/town.js"], /--strike takes --yes and nothing else/],
    [["--list", "--ring", "account"], /--list runs nothing: give it alone/],
    [["--list", "--", "node", "bin/town.js"], /--list runs nothing: give it alone/],
  ];
  for (const [argv, words] of refusals) {
    const w = world();
    expect(await main(argv, w.deps), argv.join(" ")).toBe(2);
    expect(w.err(), argv.join(" ")).toMatch(words);
    expect(w.err()).toMatch(/^hermetic: .*\nusage: pnpm hermetic --ring account/);
    expect(w.out()).toBe("");
    expect([w.calls, w.fetched, w.asked, w.ringDirs()]).toEqual([[], [], [], []]);
    expect(w.commitRead()).toBe(0);
  }
});

it("without CLOUDFLARE_API_TOKEN, absent or empty, the ring and the strike repeat box's own refusal, exit 2, nothing read", async () => {
  for (const token of [undefined, "", "  "]) {
    for (const [argv, verb] of [[["--ring", "account", "--dry-run"], "deploy"], [["--strike", TENT, "--yes"], "delete"]] as const) {
      const w = world({ env: { CLOUDFLARE_API_TOKEN: token } });
      expect(await main([...argv], w.deps)).toBe(2);
      expect(w.err()).toBe(tokenRefusal(verb));
      expect(w.out()).toBe("");
      expect([w.calls, w.fetched, w.asked, w.ringDirs()]).toEqual([[], [], [], []]);
      expect(w.commitRead()).toBe(0);
    }
  }
});

it("--dry-run is the preflight a line each, the tent named for the sha or by --name, a dirty tree said, and nothing deployed, exit 0, the listing unchanged", async () => {
  const w = world();
  expect(await main(["--ring", "account", "--dry-run"], w.deps), w.err()).toBe(0);
  expect(w.out()).toBe(
    [
      "CLOUDFLARE_API_TOKEN: present in the environment",
      `the commit: ${SHA}, the tree clean`,
      "dist: no older than src/",
      `the listing: 2 Workers on the account the operator's account, and ${TENT} free`,
      `the tent: ${TENT}, pitched from this checkout; the harness: node bin/town.js`,
      ...PRICE.map((p) => `the price: ${p}`),
      "the consent from afar, box journey 4: not walked, since it needs a browser",
      "--dry-run: stopped before the ask, and nothing was deployed",
      "",
    ].join("\n"),
  );
  expect(PRICE.join(" ")).toMatch(/Workers plan.*cents a day/);
  expect(w.err()).toBe("");
  expect([w.calls, w.asked, w.ringDirs()]).toEqual([[], [], []]);
  expect(w.fetched).toEqual([`GET ${API}/accounts?per_page=50`, `GET ${API}/accounts/acc/workers/scripts`]);
  expect([...w.workers]).toEqual(["town", "other"]);

  const dirty = world({ commit: { sha: SHA, short: SHORT, dirty: true } });
  expect(await main(["--ring", "account", "--dry-run", "--name", "tent-of-mine", "--", "env", "BROKEN=no-stdin", "node", "test/fixtures/broken-harness.mjs"], dirty.deps)).toBe(0);
  expect(dirty.out()).toContain(`the commit: ${SHA}, the tree dirty, so the build is ${SHA}-dirty\n`);
  expect(dirty.out()).toContain("and tent-of-mine free\n");
  expect(dirty.out()).toContain("the tent: tent-of-mine, pitched from this checkout; the harness: env BROKEN=no-stdin node test/fixtures/broken-harness.mjs\n");
  expect([dirty.calls, dirty.asked, dirty.ringDirs()]).toEqual([[], [], []]);
});

it("the preflight refuses, exit 2 and nothing made: git silent, dist stale, the listing refused in box's words, and a name the listing holds, naming --strike", async () => {
  const silent = world({ commit: null });
  expect(await main(["--ring", "account", "--dry-run"], silent.deps)).toBe(2);
  expect(silent.err()).toMatch(/git could not say it; nothing was made\n$/);
  expect(silent.fetched).toEqual([]);

  const stale = world({ stale: "dist is older than src/gate.ts" });
  expect(await main(["--ring", "account", "--yes"], stale.deps)).toBe(2);
  expect(stale.err()).toBe("hermetic: dist is older than src/gate.ts, and conformance refuses a stale build; run pnpm build first; nothing was made\n");
  expect(stale.fetched).toEqual([]);

  const two = world({ accounts: [{ id: "acc", name: "one" }, { id: "b", name: "two" }] });
  expect(await main(["--ring", "account", "--yes"], two.deps)).toBe(2);
  expect(two.err()).toBe("hermetic: the token reaches 2 accounts (one, two); set CLOUDFLARE_ACCOUNT_ID to the box's; nothing was made\n");

  const held = world({ workers: ["town", TENT] });
  expect(await main(["--ring", "account", "--yes"], held.deps)).toBe(2);
  expect(held.err()).toBe(`hermetic: the account the operator's account already holds a Worker named ${TENT}, a tent kept or left by a killed run; strike it with pnpm hermetic --strike ${TENT}; nothing was made\n`);
  for (const w of [silent, stale, two, held]) expect([w.calls, w.asked, w.ringDirs()]).toEqual([[], [], []]);
});

it("the ask: no terminal and no --yes is refused naming --yes, a terminal's no is refused, both before the pitch, exit 2", async () => {
  const script = world();
  expect(await main(["--ring", "account"], script.deps)).toBe(2);
  expect(script.asked).toEqual([`pitch ${TENT} on the account? [y/N] `]);
  expect(script.err()).toBe(`hermetic: pitching ${TENT} is asked at a terminal, and there is none here; run it at one, or give --yes to answer from a script; nothing was made\n`);
  const no = world({ answer: { line: "n", terminal: true } });
  expect(await main(["--ring", "account"], no.deps)).toBe(2);
  expect(no.err()).toContain(`pitching ${TENT} was not answered y; nothing was made`);
  for (const w of [script, no]) {
    expect([w.calls, w.ringDirs()]).toEqual([[], []]);
    expect(onlyGets(w.fetched)).toBe(true);
  }
});

it("a green run: asked, pitched, walked, struck, in that order under the ring's HOME; the token nowhere but its file; the listing the same; the directory removed; exit 0", async () => {
  const w = world({ answer: { line: "y", terminal: true } });
  expect(await main(["--ring", "account"], w.deps), w.err()).toBe(0);
  expect(w.asked).toEqual([`pitch ${TENT} on the account? [y/N] `]);
  expect(w.calls.map((c) => c.step)).toEqual(["deploy", "conform", "strike"]);
  const home = w.calls[0]!.home!;
  expect(path.basename(home)).toBe("home");
  expect(path.basename(path.dirname(home))).toMatch(new RegExp(`^${PREFIX}${SHORT}-`));
  expect(path.dirname(path.dirname(home))).toBe(w.tmp);
  for (const c of w.calls) expect(c.home).toBe(home);
  expect(w.calls[1]).toEqual({ step: "conform", address: `https://${TENT}.fake-sub.workers.dev`, harness: HARNESS, home });
  expect(HARNESS).toEqual(["node", "bin/town.js"]);
  expect(w.calls[2]!.name).toBe(TENT);

  // Before the strike: ring.json and conform.txt, the token in home/.town/operator alone.
  const atStrike = Object.fromEntries(w.seen.atStrike!);
  expect(Object.keys(atStrike).sort()).toEqual(["conform.txt", path.join("home", ".town", "operator"), "ring.json"]);
  for (const [f, bytes] of w.seen.atStrike!) expect(bytes.includes(OPERATOR), f).toBe(f === path.join("home", ".town", "operator"));
  expect(atStrike["conform.txt"]!.split("\n").filter((l) => l.startsWith("ok "))).toHaveLength(30);
  expect(atStrike["conform.txt"]).toMatch(/\nconformant: 30 checks\n$/);
  const facts = JSON.parse(atStrike["ring.json"]!);
  expect(facts).toMatchObject({ ring: "account", name: TENT, sha: SHA, dirty: false, harness: "node bin/town.js", address: `https://${TENT}.fake-sub.workers.dev`, build: SHA, verdict: "conformant: 30 checks" });
  expect(facts.steps).toEqual([{ step: "pitch", exit: 0, seconds: 41 }, { step: "walk", exit: 0, seconds: 14 }]);
  expect(facts.listing.before).toEqual(["other", "town"]);

  // The terminal: the pitch in the ring's words, conformance's lines, the closing block; the token's line never.
  expect(`${w.out()}${w.err()}`).not.toContain(OPERATOR);
  expect(w.out()).not.toContain("operator token");
  expect(w.out()).toContain(`pitched ${TENT} in 41s at https://${TENT}.fake-sub.workers.dev, the build ${SHA}, this commit\n`);
  expect(w.out()).toContain("ok check-0 (§1)\n");
  expect(w.out()).toContain("conformant: 30 checks\n");
  const block = w.out().slice(w.out().indexOf("the account ring: "));
  expect(block).toBe(
    [
      "the account ring: green",
      `  the tent: ${TENT} at https://${TENT}.fake-sub.workers.dev, the build ${SHA}`,
      "  the harness: node bin/town.js",
      "  the steps: pitch exit 0 in 41s, walk exit 0 in 14s, strike exit 0 in 6s",
      "  the verdict: conformant: 30 checks",
      "  the listing: the same before and after, 2 Workers",
      "  the consent from afar, box journey 4: skipped, since it needs a browser",
      "  the directory: removed",
      "",
    ].join("\n"),
  );
  expect(w.ringDirs()).toEqual([]);
  expect([...w.workers].sort()).toEqual(["other", "town"]);
  expect(onlyGets(w.fetched)).toBe(true);

  // A dirty tree's build carries -dirty, and --yes answers from a script.
  const dirty = world({ commit: { sha: SHA, short: SHORT, dirty: true }, build: `${SHA}-dirty` });
  expect(await main(["--ring", "account", "--yes"], dirty.deps), dirty.err()).toBe(0);
  expect(dirty.asked).toEqual([]);
});

it("a failed check: not conformant, the tent struck anyway, the listing the same, the directory kept and named with no token in it, exit 1", async () => {
  const harness = ["env", "BROKEN=no-stdin", "node", "test/fixtures/broken-harness.mjs"];
  const w = world({ conform: "fail" });
  expect(await main(["--ring", "account", "--yes", "--", ...harness], w.deps)).toBe(1);
  expect(w.calls.map((c) => c.step)).toEqual(["deploy", "conform", "strike"]);
  expect(w.calls[1]!.harness).toEqual(harness);
  expect(w.workers.has(TENT)).toBe(false);
  const [dir] = w.ringDirs();
  expect(w.out()).toContain("not conformant: 1 of 30 checks failed\n");
  expect(w.out()).toContain("the account ring: not green\n");
  expect(w.out()).toContain("  the verdict: not conformant: 1 of 30 checks failed\n");
  expect(w.out()).toContain("  the listing: the same before and after, 2 Workers\n");
  expect(w.out()).toContain(`  the directory: kept, ${dir}\n`);
  expect(w.out()).not.toContain("--strike");
  const files = Object.fromEntries(filesUnder(dir!));
  expect(Object.keys(files).sort()).toEqual(["conform.txt", "ring.json"]);
  for (const [f, bytes] of Object.entries(files)) expect(bytes, f).not.toContain(OPERATOR);
  expect(files["conform.txt"]).toContain("FAIL stdin-pipe (§4)");
  const facts = JSON.parse(files["ring.json"]!);
  expect(facts).toMatchObject({ harness: harness.join(" "), verdict: "not conformant: 1 of 30 checks failed", exit: 1 });
  expect(facts.steps.map((s: { step: string; exit: number }) => [s.step, s.exit])).toEqual([["pitch", 0], ["walk", 1], ["strike", 0]]);
  expect(facts.listing).toEqual({ before: ["other", "town"], after: ["other", "town"] });
  expect(`${w.out()}${w.err()}`).not.toContain(OPERATOR);
});

it("a pitch that fails or answers another build: no walk, the strike run, the token's line not echoed, exit 1", async () => {
  const wrong = world({ build: "0000000000000000000000000000000000000000" });
  expect(await main(["--ring", "account", "--yes"], wrong.deps)).toBe(1);
  expect(wrong.calls.map((c) => c.step)).toEqual(["deploy", "strike"]);
  expect(wrong.err()).toContain(`the pitch answered the build 0000000000000000000000000000000000000000, not this commit's ${SHA}`);
  const failed = world({ deployCode: 1 });
  expect(await main(["--ring", "account", "--yes"], failed.deps)).toBe(1);
  expect(failed.calls.map((c) => c.step)).toEqual(["deploy", "strike"]);
  expect(failed.err()).toContain("the pitch exited 1; box's stdout, less the token's line:\n");
  for (const w of [wrong, failed]) {
    expect(`${w.out()}${w.err()}`).not.toContain(OPERATOR);
    expect(w.out()).toContain("  the verdict: no verdict line\n");
    const [dir] = w.ringDirs();
    for (const [f, bytes] of filesUnder(dir!)) expect(bytes, f).not.toContain(OPERATOR);
  }
});

it("--keep: no strike, the tent standing and named with the line that strikes it, the directory kept with the token in home/.town/operator alone, mode 600, exit 0", async () => {
  const w = world();
  expect(await main(["--ring", "account", "--yes", "--keep"], w.deps), w.err()).toBe(0);
  expect(w.calls.map((c) => c.step)).toEqual(["deploy", "conform"]);
  expect(w.workers.has(TENT)).toBe(true);
  const [dir] = w.ringDirs();
  expect(w.out()).toContain("the account ring: green\n");
  expect(w.out()).toContain("  the listing: the same before and after but for the tent, 2 Workers\n");
  expect(w.out()).toContain(`  the tent stands, kept; strike it with: pnpm hermetic --strike ${TENT}\n`);
  expect(w.out()).toContain(`  the directory: kept, ${dir}\n`);
  const operator = path.join("home", ".town", "operator");
  const files = filesUnder(dir!);
  expect(files.map(([f]) => f).sort()).toEqual(["conform.txt", operator, "ring.json"]);
  expect(files.filter(([, bytes]) => bytes.includes(OPERATOR)).map(([f]) => f)).toEqual([operator]);
  expect(statSync(path.join(dir!, operator)).mode & 0o777).toBe(0o600);
  expect(`${w.out()}${w.err()}`).not.toContain(OPERATOR);
});

it("the listings unequal are seen: a strike that leaves the tent is exit 1, naming what was added and the line that strikes it", async () => {
  const w = world({ strikeLeaves: true });
  expect(await main(["--ring", "account", "--yes"], w.deps)).toBe(1);
  expect(w.calls.map((c) => c.step)).toEqual(["deploy", "conform", "strike"]);
  expect(w.out()).toContain("the account ring: not green\n");
  expect(w.out()).toContain(`  the listing: not the same before and after: added ${TENT}\n`);
  expect(w.out()).toContain(`  the tent may stand; strike it with: pnpm hermetic --strike ${TENT}\n`);
  const [dir] = w.ringDirs();
  expect(JSON.parse(readFileSync(path.join(dir!, "ring.json"), "utf8")).listing.after).toEqual(["other", "town", TENT].sort());
});

it("the account is shared: another's Worker that comes or goes mid-run is named and recorded and not held against the run, exit 0; a ring-named one that comes is, exit 1", async () => {
  const added = world({ meanwhile: { add: ["sheep-hermetic-cc475fb-c-t-collie"] } });
  expect(await main(["--ring", "account", "--yes"], added.deps), added.err()).toBe(0);
  expect(added.out()).toContain("  the listing: the same before and after, 2 Workers\n  others' Workers: added sheep-hermetic-cc475fb-c-t-collie, not the ring's, and not held against the run\n");
  expect(added.out()).toContain("the account ring: green\n");

  const gone = world({ meanwhile: { remove: ["other"] }, answer: { line: "y", terminal: true } });
  const dir = () => gone.calls[0]!.home!;
  expect(await main(["--ring", "account", "--keep"], gone.deps), gone.err()).toBe(0);
  expect(gone.out()).toContain("  others' Workers: gone other, not the ring's, and not held against the run\n");
  expect(JSON.parse(readFileSync(path.join(path.dirname(dir()), "ring.json"), "utf8")).listing).toEqual({ before: ["other", "town"], after: ["other", TENT, "town"].filter((n) => n !== "other").sort(), others: { added: [], gone: ["other"] } });

  const both = world({ meanwhile: { add: ["sheep-hermetic-x"], remove: ["other"] } });
  expect(await main(agentWords(fakeSheep(), "--yes", "--keep"), both.deps), both.err()).toBe(0);
  expect(both.out()).toContain("  others' Workers: added sheep-hermetic-x; gone other, not the ring's, and not held against the run\n");
  expect(JSON.parse(readFileSync(path.join(both.ringDirs()[0]!, "ring.json"), "utf8")).listing.others).toEqual({ added: ["sheep-hermetic-x"], gone: ["other"] });

  // A name of the ring's own coming mid-run is the ring's to answer for, and so is a --name tent that stays.
  const ours = world({ meanwhile: { add: ["town-hermetic-other"] } });
  expect(await main(["--ring", "account", "--yes"], ours.deps)).toBe(1);
  expect(ours.out()).toContain("  the listing: not the same before and after: added town-hermetic-other\n");
  expect(ours.out()).not.toContain("others' Workers");
  const named = world({ strikeLeaves: true });
  expect(await main(["--ring", "account", "--yes", "--name", "tent-of-mine"], named.deps)).toBe(1);
  expect(named.out()).toContain("  the listing: not the same before and after: added tent-of-mine\n");

  // --strike: the ring's own names before less the struck one; another's coming meanwhile is named, exit 0.
  const struck = world({ workers: ["town", TENT], meanwhile: { add: ["sheep-hermetic-y"] } });
  expect(await main(["--strike", TENT, "--yes"], struck.deps)).toBe(0);
  expect(struck.out()).toContain(`  the listing: the listing before without ${TENT}, 2 Workers\n  others' Workers: added sheep-hermetic-y, not the ring's, and not held against the run\n`);
  const strayed = world({ workers: ["town", TENT], meanwhile: { add: ["town-hermetic-z"] } });
  expect(await main(["--strike", TENT, "--yes"], strayed.deps)).toBe(1);
  expect(strayed.out()).toContain(`not the listing before without ${TENT}: added town-hermetic-z\n`);
});

it("a signal while a step runs: the steps stop, the tent struck unless --keep, ring.json written, the directory kept and named, exit 130", async () => {
  const w = world({ signalIn: "walk" });
  expect(await main(["--ring", "account", "--yes"], w.deps)).toBe(130);
  expect(w.calls.map((c) => c.step)).toEqual(["deploy", "conform", "strike"]);
  expect(w.workers.has(TENT)).toBe(false);
  expect(w.err()).toContain("hermetic: SIGINT; the steps stop, and the tent is struck\n");
  expect(w.out()).toContain("the account ring: stopped by SIGINT\n");
  const [dir] = w.ringDirs();
  expect(w.out()).toContain(`  the directory: kept, ${dir}\n`);
  expect(JSON.parse(readFileSync(path.join(dir!, "ring.json"), "utf8"))).toMatchObject({ signal: "SIGINT", exit: 130 });

  const kept = world({ signalIn: "walk" });
  expect(await main(["--ring", "account", "--yes", "--keep"], kept.deps)).toBe(130);
  expect(kept.calls.map((c) => c.step)).toEqual(["deploy", "conform"]);
  expect(kept.out()).toContain(`strike it with: pnpm hermetic --strike ${TENT}`);
});

it("--strike: a name the listing lacks refused; one it holds listed, asked, deleted under a fresh HOME with no token, the listing again, exit 0", async () => {
  const absent = world({ workers: ["town"] });
  expect(await main(["--strike", TENT, "--yes"], absent.deps)).toBe(2);
  expect(absent.err()).toBe(`hermetic: the account the operator's account has no Worker named ${TENT}; nothing was struck\n`);
  expect([absent.calls, absent.ringDirs()]).toEqual([[], []]);

  const script = world({ workers: ["town", TENT] });
  expect(await main(["--strike", TENT], script.deps)).toBe(2);
  expect(script.asked).toEqual([`strike ${TENT} on the account? [y/N] `]);
  expect(script.err()).toContain("give --yes to answer from a script; nothing was struck");
  expect([script.calls, script.ringDirs()]).toEqual([[], []]);

  const w = world({ workers: ["town", TENT], answer: { line: "yes", terminal: true } });
  expect(await main(["--strike", TENT], w.deps), w.err()).toBe(0);
  expect(w.calls.map((c) => c.step)).toEqual(["strike"]);
  expect(w.calls[0]!.name).toBe(TENT);
  expect(w.seen.homeAtStrike).toEqual([]);
  expect(path.basename(path.dirname(w.calls[0]!.home!))).toMatch(new RegExp(`^${PREFIX}strike-`));
  expect([...w.workers]).toEqual(["town"]);
  expect(w.out()).toContain(`the strike: ${TENT} struck\n`);
  expect(w.out()).toContain(`  the listing: the listing before without ${TENT}, 1 Workers\n`);
  expect(w.ringDirs()).toEqual([]);
  expect(onlyGets(w.fetched)).toBe(true);
  expect(w.fetched).toHaveLength(4);

  const leaves = world({ workers: ["town", TENT], strikeLeaves: true });
  expect(await main(["--strike", TENT, "--yes"], leaves.deps)).toBe(1);
  expect(leaves.out()).toContain(`not the listing before without ${TENT}: added ${TENT}`);
  expect(leaves.ringDirs()).toHaveLength(1);
});

it("each child is node over box or conformance from the checkout, no token in its words, the name on the strike's stdin, HOME the ring's and TOWN_OPERATOR unset", () => {
  expect(childOf("deploy", { name: TENT })).toEqual({ args: [path.join(ROOT, "scripts/box.mjs"), "deploy", "--name", TENT] });
  expect(childOf("strike", { name: TENT })).toEqual({ args: [path.join(ROOT, "scripts/box.mjs"), "delete", "--name", TENT], stdin: `${TENT}\n` });
  expect(childOf("conform", { address: "https://t.fake-sub.workers.dev", harness: ["env", "BROKEN=x", "node", "h.mjs"] })).toEqual({
    args: [path.join(ROOT, "scripts/conform.mjs"), "--town", "https://t.fake-sub.workers.dev", "--", "env", "BROKEN=x", "node", "h.mjs"],
  });
  const env = childEnv({ CLOUDFLARE_API_TOKEN: TOKEN, TOWN_OPERATOR: "the-shepherds-token", HOME: "/Users/shepherd", PATH: "/bin" }, "/tmp/ring/home");
  expect(env).toEqual({ CLOUDFLARE_API_TOKEN: TOKEN, HOME: "/tmp/ring/home", PATH: "/bin" });
  expect(existsSync(SCRIPT)).toBe(true);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  expect(pkg.scripts.hermetic).toBe("node scripts/hermetic.mjs");
});

/** A fake sheep checkout: an empty scripts/drove.mjs and an empty .sheep/, made here, never a real one. */
function fakeSheep(options: { script?: boolean; kennel?: boolean } = {}) {
  const sheep = scratch("sheep");
  if (options.script !== false) {
    mkdirSync(path.join(sheep, "scripts"));
    writeFileSync(path.join(sheep, "scripts", "drove.mjs"), "");
  }
  if (options.kennel !== false) mkdirSync(path.join(sheep, ".sheep"));
  return sheep;
}

const REPO_NAME = "stranger-owner/tent-issues";
const agentWords = (sheep: string, ...more: string[]) => ["--ring", "agent", "--sheep", sheep, "--repo", REPO_NAME, "--issue", "7", ...more];
const ADDRESS = `https://${TENT}.fake-sub.workers.dev`;
const TOWND = path.join(ROOT, "bin/townd.js");

/** The stage's child, word for word, as the brief gives it. */
const stageArgs = (sheep: string, kennel: string, user = "stranger") => [path.join(sheep, "scripts/drove.mjs"), "--box", ADDRESS, "--user", user, "--repo", REPO_NAME, "--issue", "7", "--townd", TOWND, "--kennel", kennel];

it("the agent ring's preflight refuses by path and stdin, exit 2, before the account is read: no drove.mjs, no checkout, no kennel, a terminal, an empty file, a line break", async () => {
  const cases: [string[], WorldOptions, RegExp][] = [
    [agentWords(fakeSheep({ script: false })), {}, /holds no scripts\/drove\.mjs, the stage; --sheep names a sheep checkout; nothing was made\n$/],
    [agentWords(path.join(os.tmpdir(), "town-hermetic-test-no-such-sheep")), {}, /town-hermetic-test-no-such-sheep holds no scripts\/drove\.mjs/],
    [agentWords(fakeSheep({ kennel: false })), {}, /the kennel .*\/\.sheep is not a directory; --kennel names one/],
    [agentWords(fakeSheep(), "--kennel", path.join(os.tmpdir(), "town-hermetic-test-no-kennel")), {}, /the kennel .*town-hermetic-test-no-kennel is not a directory/],
    [agentWords(fakeSheep()), { stdin: { terminal: true } }, /reads the github token on stdin, and stdin is a terminal; redirect it from a file; nothing was made/],
    [agentWords(fakeSheep()), { stdin: { terminal: false, text: "" } }, /read nothing on stdin; redirect the github token from a file/],
    [agentWords(fakeSheep()), { stdin: { terminal: false, text: "\n" } }, /read nothing on stdin/],
    [agentWords(fakeSheep()), { stdin: { terminal: false, text: `${GH}\n${GH}\n` } }, /holds a line break after its last one is stripped; a token is one line/],
    [agentWords(fakeSheep()), { stdin: { terminal: false, text: `${GH}\r\n\r\n` } }, /holds a line break/],
  ];
  for (const [argv, options, words] of cases) {
    const w = world(options);
    expect(await main(argv, w.deps), argv.join(" ")).toBe(2);
    expect(w.err(), argv.join(" ")).toMatch(words);
    expect(w.err()).toMatch(/^hermetic: /);
    expect([w.calls, w.fetched, w.asked, w.ringDirs()]).toEqual([[], [], [], []]);
    expect(`${w.out()}${w.err()}`).not.toContain(GH);
  }
  // The token is read after the script and the kennel are found, and not before.
  const noScript = world();
  await main(agentWords(fakeSheep({ script: false })), noScript.deps);
  expect(noScript.stdinRead()).toBe(0);
});

it("the agent ring's --dry-run: the preflight with the stage found, the token read and not printed, the stage's command line word for word with the tent's address, the model's price, nothing deployed, exit 0", async () => {
  const sheep = fakeSheep();
  const kennel = path.join(sheep, ".sheep");
  const w = world();
  expect(await main(agentWords(sheep, "--dry-run"), w.deps), w.err()).toBe(0);
  expect(w.out()).toBe(
    [
      "CLOUDFLARE_API_TOKEN: present in the environment",
      `the commit: ${SHA}, the tree clean`,
      "dist: no older than src/",
      `the stage: ${path.join(sheep, "scripts/drove.mjs")}, found by path`,
      `the kennel: ${kennel}, found by path`,
      `the token: read from stdin, ${Buffer.byteLength(GH)} bytes, not printed`,
      `the listing: 2 Workers on the account the operator's account, and ${TENT} free`,
      `the tent: ${TENT}, pitched from this checkout and furnished for stranger; its address ${ADDRESS}`,
      `the stage's command line, in ${sheep}: node ${stageArgs(sheep, kennel).join(" ")}`,
      ...PRICE.map((p) => `the price: ${p}`),
      `the price: ${AGENT_PRICE}`,
      "the consent from afar, box journey 4: not walked, since it needs a browser",
      "--dry-run: stopped before the ask, and nothing was deployed",
      "",
    ].join("\n"),
  );
  expect(AGENT_PRICE).toMatch(/model turn, under a dollar.*sixteen and fifteen seconds/);
  expect(w.err()).toBe("");
  expect(w.stdinRead()).toBe(1);
  expect([w.calls, w.asked, w.ringDirs()]).toEqual([[], [], []]);
  expect(w.fetched).toEqual([`GET ${API}/accounts?per_page=50`, `GET ${API}/accounts/acc/workers/scripts`, `GET ${API}/accounts/acc/workers/subdomain`]);
  expect(w.out()).not.toContain(GH);

  // --kennel and --user are said as given, the kennel made absolute.
  const other = scratch("kennel");
  const given = world();
  expect(await main(agentWords(sheep, "--dry-run", "--kennel", other, "--user", "walker", "--name", "tent-of-mine"), given.deps)).toBe(0);
  expect(given.out()).toContain(`the stage's command line, in ${sheep}: node ${path.join(sheep, "scripts/drove.mjs")} --box https://tent-of-mine.fake-sub.workers.dev --user walker --repo ${REPO_NAME} --issue 7 --townd ${TOWND} --kennel ${other}\n`);
});

it("the agent ring's ask: no terminal and no --yes is refused after the token is read, asked of the controlling terminal since stdin is the token, exit 2, nothing made", async () => {
  const asked: unknown[] = [];
  const w = world();
  const ask = w.deps.ask;
  w.deps.ask = async (prompt: string, o?: unknown) => (asked.push(o), ask(prompt));
  expect(await main(agentWords(fakeSheep()), w.deps)).toBe(2);
  expect(asked).toEqual([{ tty: true }]);
  expect(w.err()).toBe(`hermetic: pitching ${TENT} is asked at a terminal, and there is none here; run it at one, or give --yes to answer from a script; nothing was made\n`);
  expect([w.calls, w.ringDirs()]).toEqual([[], []]);
});

it("a green agent run: pitched, furnished in the github plan's order with the token on the credential child's stdin alone, the stage run word for word, its root recorded, the search clean, struck, the directory removed, exit 0", async () => {
  const sheep = fakeSheep();
  const kennel = path.join(sheep, ".sheep");
  const w = world({ answer: { line: "y", terminal: true } });
  expect(await main(agentWords(sheep), w.deps), w.err()).toBe(0);
  expect(w.calls.map((c) => c.step)).toEqual(["deploy", "admin", "admin", "admin", "admin", "admin", "admin", "stage", "strike"]);
  const home = w.calls[0]!.home!;
  for (const c of w.calls) expect(c.home).toBe(home);

  // The furnishing: townd admin --town from the checkout, in order, each stdin what it should be.
  const admins = w.calls.filter((c) => c.step === "admin");
  expect(admins.map((c) => c.args)).toEqual(
    [
      ["user", "add", "stranger"],
      ["credential", "add", "--user", "stranger", "--type", "github-token", "--label", "hermetic"],
      ["shop", "add", "-"],
      ["shop", "add", "-", "--user", "stranger"],
      ["shop", "ls"],
      ["credential", "ls", "--user", "stranger"],
    ].map((words) => [TOWND, "admin", "--town", ADDRESS, ...words]),
  );
  expect(admins.map((c) => c.stdin)).toEqual([undefined, `${GH}\n`, Buffer.from(`ustar of ${path.join(ROOT, "shops/memory")}`), Buffer.from(`ustar of ${path.join(ROOT, "shops/github")}`), undefined, undefined]);
  expect(furnishing(USER).map((f) => f.stdin)).toEqual([undefined, "token", { tar: path.join(ROOT, "shops/memory") }, { tar: path.join(ROOT, "shops/github") }]);

  // The token in no argument of any child.
  for (const c of w.calls) expect([...(c.args ?? []), c.name, c.address, ...(c.harness ?? [])].join(" ")).not.toContain(GH);

  // The stage: word for word, in the sheep checkout.
  const stage = w.calls.find((c) => c.step === "stage")!;
  expect(stage.args).toEqual(stageArgs(sheep, kennel));
  expect(stage.cwd).toBe(sheep);

  // Before the strike: ring.json, drove.txt, and the tent's operator token; the github token in no file.
  const atStrike = Object.fromEntries(w.seen.atStrike!);
  expect(Object.keys(atStrike).sort()).toEqual(["drove.txt", path.join("home", ".town", "operator"), "ring.json"]);
  for (const [f, bytes] of w.seen.atStrike!) expect(bytes, f).not.toContain(GH);
  expect(atStrike["drove.txt"]).toBe(`pass: pass_1 for stranger\nsheep: sheep-fake-1 on sheep-drove\ndrove: a line on stderr\nroot: ${STAGE_ROOT} (walk.json, log.jsonl, audit.txt, report.txt); --status and --teardown take it\n`);
  const facts = JSON.parse(atStrike["ring.json"]!);
  expect(facts).toMatchObject({ ring: "agent", name: TENT, sheep, kennel, repo: REPO_NAME, issue: 7, user: "stranger", stageRoot: STAGE_ROOT, search: "clean", address: ADDRESS, stage: `node ${stageArgs(sheep, kennel).join(" ")}` });
  expect(facts.furnishing).toEqual(["user add stranger", "credential add --user stranger --type github-token --label hermetic", "shop add -", "shop add - --user stranger", "shop ls", "credential ls --user stranger"].map((verb) => ({ verb, exit: 0 })));
  expect(facts.steps.map((s: { step: string; exit: number }) => [s.step, s.exit])).toEqual([["pitch", 0], ["furnish", 0], ["stage", 0]]);

  // The terminal.
  const out = w.out();
  expect(`${out}${w.err()}`).not.toContain(GH);
  expect(`${out}${w.err()}`).not.toContain(OPERATOR);
  expect(out).toContain(
    [
      "furnish: user add stranger exit 0",
      "furnish: credential add --user stranger --type github-token --label hermetic exit 0",
      "furnish: shop add - exit 0",
      "furnish: shop add - --user stranger exit 0",
      "furnish: shop ls exit 0",
      "shop ls: town/memory, town/github",
      "furnish: credential ls --user stranger exit 0",
      "credential ls --user stranger: github-token",
      `the stage, in ${sheep}: node ${stageArgs(sheep, kennel).join(" ")}`,
      "pass: pass_1 for stranger",
    ].join("\n"),
  );
  expect(w.err()).toContain("drove: a line on stderr\n");
  const dir = path.dirname(home);
  expect(out).toContain(`the stage: exit 0; its root ${STAGE_ROOT}\nsearch: the token is in no file under ${dir}\n`);
  expect(out.slice(out.indexOf("the agent ring: "))).toBe(
    [
      "the agent ring: green",
      `  the tent: ${TENT} at ${ADDRESS}, the build ${SHA}`,
      `  the stage: node ${stageArgs(sheep, kennel).join(" ")}`,
      `  the kennel: ${kennel}`,
      "  the steps: pitch exit 0 in 41s, furnish exit 0 in 6s, stage exit 0 in 16s, strike exit 0 in 6s",
      "  the furnishing: user add stranger exit 0, credential add --user stranger --type github-token --label hermetic exit 0, shop add - exit 0, shop add - --user stranger exit 0, shop ls exit 0, credential ls --user stranger exit 0",
      `  the stage's root: ${STAGE_ROOT}; read it with: node ${path.join(sheep, "scripts/drove.mjs")} --status ${STAGE_ROOT}`,
      `  the search: the token is in no file under ${dir}`,
      "  the listing: the same before and after, 2 Workers",
      "  the consent from afar, box journey 4: skipped, since it needs a browser",
      "  the directory: removed",
      "",
    ].join("\n"),
  );
  expect(w.ringDirs()).toEqual([]);
  expect([...w.workers].sort()).toEqual(["other", "town"]);
  expect(onlyGets(w.fetched)).toBe(true);
});

it("a stage that fails: its exit read, the strike run anyway, the listing the same, the directory kept with drove.txt, the kept root recorded, exit 1", async () => {
  const sheep = fakeSheep();
  const w = world({ stage: { code: 1, root: "kept" } });
  expect(await main(agentWords(sheep, "--yes"), w.deps)).toBe(1);
  expect(w.calls.map((c) => c.step).filter((s) => s !== "admin")).toEqual(["deploy", "stage", "strike"]);
  expect(w.workers.has(TENT)).toBe(false);
  const [dir] = w.ringDirs();
  const files = Object.fromEntries(filesUnder(dir!));
  expect(Object.keys(files).sort()).toEqual(["drove.txt", "ring.json"]);
  expect(files["drove.txt"]).toContain(`root: kept at ${STAGE_ROOT}, since`);
  const facts = JSON.parse(files["ring.json"]!);
  expect(facts).toMatchObject({ stageRoot: STAGE_ROOT, search: "clean", exit: 1, listing: { before: ["other", "town"], after: ["other", "town"] } });
  expect(facts.steps.map((s: { step: string; exit: number }) => [s.step, s.exit])).toEqual([["pitch", 0], ["furnish", 0], ["stage", 1], ["strike", 0]]);
  expect(w.out()).toContain("the agent ring: not green\n");
  expect(w.out()).toContain(`  the stage's root: ${STAGE_ROOT}; read it with: node ${path.join(sheep, "scripts/drove.mjs")} --status ${STAGE_ROOT}\n`);
  expect(w.out()).toContain("  the listing: the same before and after, 2 Workers\n");
  expect(w.out()).toContain(`  the directory: kept, ${dir}\n`);

  // A stage that names no root: null, and said.
  const none = world({ stage: { root: "none" } });
  expect(await main(agentWords(sheep, "--yes"), none.deps)).toBe(0);
  expect(none.out()).toContain("the stage: exit 0; its root not named: its stdout has no root: line\n");
  expect(none.out()).toContain("  the stage's root: none, since the stage printed no root: line\n");
});

it("a furnishing that fails or lists short: no stage, the ring's words, the strike run, exit 1", async () => {
  const sheep = fakeSheep();
  const failed = world({ adminFails: "credential add" });
  expect(await main(agentWords(sheep, "--yes"), failed.deps)).toBe(1);
  expect(failed.calls.map((c) => c.step)).toEqual(["deploy", "admin", "admin", "strike"]);
  expect(failed.out()).toContain("furnish: credential add --user stranger --type github-token --label hermetic exit 1\n");
  expect(failed.err()).toContain("hermetic: townd admin credential add --user stranger --type github-token --label hermetic exited 1:\n  townd admin: credential add");
  expect(failed.out()).toContain("  the stage: not run\n");
  expect(failed.out()).toContain("  the stage's root: none, since the stage was not run\n");

  const short = world({ shopLsLacks: "town/github" });
  expect(await main(agentWords(sheep, "--yes"), short.deps)).toBe(1);
  expect(short.calls.map((c) => c.step)).toEqual(["deploy", "admin", "admin", "admin", "admin", "admin", "admin", "strike"]);
  expect(short.err()).toContain("hermetic: the tent's shop ls names no town/github, and the stage needs both; the stage is not run\n");

  const two = world({ githubTokens: 2 });
  expect(await main(agentWords(sheep, "--yes"), two.deps)).toBe(1);
  expect(two.calls.map((c) => c.step)).not.toContain("stage");
  expect(two.err()).toContain("hermetic: the tent's credential ls --user stranger names 2 github-token credentials, and the stage needs exactly one; the stage is not run\n");

  const pitchFails = world({ deployCode: 1 });
  expect(await main(agentWords(sheep, "--yes"), pitchFails.deps)).toBe(1);
  expect(pitchFails.calls.map((c) => c.step)).toEqual(["deploy", "strike"]);
  expect(pitchFails.out()).toContain("  the furnishing: not done\n");
  for (const w of [failed, short, two, pitchFails]) {
    expect(`${w.out()}${w.err()}`).not.toContain(GH);
    expect(w.ringDirs()).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(w.ringDirs()[0]!, "ring.json"), "utf8")).stageRoot).toBeNull();
  }
});

it("journey 2 step 6, the ring's search falsified: a fake stage that puts the token's bytes in drove.txt, or in a file under home/, is exit 1, the path named, the token never printed, the directory kept", async () => {
  for (const [plant, file] of [["stdout", "drove.txt"], ["home", path.join("home", "left-behind.txt")]] as const) {
    const w = world({ stage: { plant } });
    expect(await main(agentWords(fakeSheep(), "--yes"), w.deps), plant).toBe(1);
    expect(w.calls.map((c) => c.step).filter((s) => s !== "admin")).toEqual(["deploy", "stage", "strike"]);
    expect(w.out()).toContain(`search: the token is in ${file}\n`);
    expect(w.out()).toContain(`  the search: the token is in ${file}\n`);
    expect(w.out()).toContain("the agent ring: not green\n");
    expect(`${w.out()}${w.err()}`).not.toContain(GH);
    const [dir] = w.ringDirs();
    expect(readFileSync(path.join(dir!, file), "utf8")).toContain(GH);
    const facts = JSON.parse(readFileSync(path.join(dir!, "ring.json"), "utf8"));
    expect(facts).toMatchObject({ search: [file], exit: 1 });
    expect(JSON.stringify(facts)).not.toContain(GH);
    if (plant === "stdout") expect(w.out()).toContain("the grant was <the github token, not printed> all along\n");
  }
  // The search itself, over a directory of files: every file, nested, as bytes.
  const dir = scratch("search");
  mkdirSync(path.join(dir, "home", "Library", "Preferences", ".wrangler", "logs"), { recursive: true });
  writeFileSync(path.join(dir, "home", "Library", "Preferences", ".wrangler", "logs", "wrangler.log"), `x${GH}y`);
  writeFileSync(path.join(dir, "drove.txt"), "clean\n");
  writeFileSync(path.join(dir, "ring.json"), "{}\n");
  expect(searchFor(dir, GH)).toEqual({ hits: [path.join("home", "Library", "Preferences", ".wrangler", "logs", "wrangler.log")], unread: [] });
});

it("a signal while the stage runs: the search and the strike still run, exit 130", async () => {
  const w = world({ signalIn: "stage" });
  expect(await main(agentWords(fakeSheep(), "--yes"), w.deps)).toBe(130);
  expect(w.calls.map((c) => c.step).filter((s) => s !== "admin")).toEqual(["deploy", "stage", "strike"]);
  expect(w.out()).toContain("the agent ring: stopped by SIGINT\n");
  expect(w.out()).toMatch(/search: the token is in no file under /);
});

it("the agent ring's children: townd admin --town from the checkout, the stage from the sheep checkout in its directory; townd's tables read by column; the root read from the stage's line", () => {
  expect(childOf("admin", { address: ADDRESS, words: ["shop", "ls"] })).toEqual({ args: [TOWND, "admin", "--town", ADDRESS, "shop", "ls"] });
  expect(childOf("stage", { address: ADDRESS, sheep: "/s", kennel: "/k", user: "u", repo: "o/r", issue: 3 })).toEqual({ args: ["/s/scripts/drove.mjs", "--box", ADDRESS, "--user", "u", "--repo", "o/r", "--issue", "3", "--townd", TOWND, "--kennel", "/k"], cwd: "/s" });
  const table = "name         version  owner\ntown/memory  0.1.0    town\ntown/github  0.2.0    town\n";
  expect(column(table, "name")).toEqual(["town/memory", "town/github"]);
  expect(column("", "name")).toEqual([]);
  expect(rootOf(["pass: x", "root: /tmp/a (walk.json, log.jsonl, audit.txt, report.txt); --status and --teardown take it"])).toBe("/tmp/a");
  expect(rootOf(["root: kept at /tmp/b, since the end failed"])).toBe("/tmp/b");
  expect(rootOf(["the root: /tmp/c", "no root here"])).toBeNull();
});
