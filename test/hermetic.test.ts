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
// read for the operator's token, found only in home/.town/operator. Nothing
// here spawns a child or reaches the network: a fake is what the ring sends,
// never what the platform does.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/hermetic.mjs");
const BOX = path.join(ROOT, "scripts/box.mjs");

/** What scripts/hermetic.mjs exports, as this test reads it: plain JavaScript, imported by a path typed as a string. */
interface Hermetic {
  HARNESS: string[];
  PREFIX: string;
  USAGE: string;
  RINGS: [string, string][];
  main(argv: string[], deps: unknown): Promise<number>;
  childOf(step: string, o: { name?: string; address?: string; harness?: string[] }): { args: string[]; stdin?: string };
  childEnv(env: Record<string, string | undefined>, home: string): Record<string, string | undefined>;
}
const { HARNESS, PREFIX, USAGE, RINGS, main, childOf, childEnv }: Hermetic = await import(SCRIPT as string);
const { PRICE, tokenRefusal }: { PRICE: string[]; tokenRefusal(verb: string): string } = await import(BOX as string);

const SHA = "1cc6087aaaabbbbccccddddeeeeffff000011112";
const SHORT = "1cc6087";
const TENT = `town-hermetic-${SHORT}`;
const TOKEN = "cf-token-for-the-fake";
const OPERATOR = "op-the-tents-operator-token";
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
  /** A step that raises the ring's signal while it runs. */
  signalIn?: "walk";
}

/** The fake account, deploy, conformance, and strike, and every call made of them. */
function world(options: WorldOptions = {}) {
  const tmp = scratch("tmp");
  const workers = new Set(options.workers ?? ["town", "other"]);
  const calls: { step: string; name?: string; home?: string; address?: string; harness?: string[] }[] = [];
  const fetched: string[] = [];
  const asked: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const seen: { atStrike?: [string, string][]; homeAtStrike?: string[] } = {};
  let clock = 0;
  let commitRead = 0;
  let raise: ((signal: string) => void) | undefined;
  const address = (name: string) => `https://${name}.fake-sub.workers.dev`;
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
      throw new Error(`the fake has no ${url}`);
    },
    deploy: async (name: string, home: string): Promise<Ran> => {
      calls.push({ step: "deploy", name, home });
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
      clock += 6_000;
      const dir = path.dirname(home);
      seen.atStrike = filesUnder(dir);
      seen.homeAtStrike = readdirSync(home, { recursive: true, encoding: "utf8" });
      if (!options.strikeLeaves) workers.delete(name);
      rmSync(path.join(home, ".town", "operator"), { force: true });
      return { code: 0 };
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
    commitRead: () => commitRead,
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
    [["--ring", "agent"], /the agent ring is not built yet/],
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
