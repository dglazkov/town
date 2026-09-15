// ring: checkout
// The operator's verbs and their stdin, held together: `readsStdin`, which
// the wire asks before it reads and sends stdin, says yes for exactly the
// verbs whose code reads `io.stdin`. Every verb the admin dispatches, found
// by its `case` in src/admin.ts and src/secrets.ts, is run in process, as
// far as its read where it has one, with a stdin that records whether it
// was read: over a data directory, as at a laptop, and over a store handed
// in as the box's object runs them, where a shop's directory is refused
// before anything is read.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { main, readsStdin, type AdminTown, type Io } from "../src/admin.js";
import { runShelved } from "../src/runtime.js";
import { openStore, type Store } from "../src/store.js";
import { openWall } from "../src/wall.js";
import { withoutFlag } from "../src/wire.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const MEMORY = path.join(ROOT, "shops/memory");
const made: string[] = [];

afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const d = mkdtempSync(path.join(os.tmpdir(), `town-stdin-${prefix}-`));
  made.push(d);
  return d;
}

/** What the steps share: ids made along the way, and the directories and bundles they name. */
interface Ctx {
  pass: string;
  grant: string;
  credential: string;
  approvable: string;
  deniable: string;
  gdocs: string;
  memoryTar: string;
  /** Where export makes the wagon's key, and the wagon it printed. */
  wagonKey: string;
  wagon: string;
}

/** One verb's argv, what is on its stdin, and what the store needs before it runs so the verb reaches its read. */
interface Step {
  argv: (c: Ctx) => string[];
  stdin?: (c: Ctx) => string;
  before?: (store: Store, c: Ctx) => void;
  after?: (r: { stdout: string; stderr: string }, c: Ctx) => void;
  /** Its exit over a data directory and in the object: 0 unless named, so no step is refused short of the read it is there for. */
  exits?: [number, number];
}

const OAUTH_FLAGS = ["--origin", "https://docs.example", "--header", "Authorization: Bearer {token}", "--authorize", "https://auth.example/authorize", "--token", "https://auth.example/token", "--scopes", "read"];

const STEPS: Step[] = [
  { argv: () => ["user", "add", "dimitri"] },
  { argv: () => ["user", "ls"] },
  { argv: () => ["pass", "new", "--user", "dimitri", "--label", "stdin"], after: (r, c) => void (c.pass = r.stderr.trim()) },
  { argv: () => ["pass", "ls"] },
  { argv: () => ["shop", "add", "-"], stdin: (c) => c.memoryTar },
  { argv: () => ["shop", "add", MEMORY], exits: [0, 1] },
  { argv: () => ["shop", "add", "-", "--client-id", "cid"], stdin: (c) => c.memoryTar, exits: [1, 1] },
  { argv: (c) => ["shop", "add", c.gdocs, "--client-id", "cid"], stdin: () => "client-secret\n", exits: [1, 1] },
  { argv: () => ["shop", "test", "-"], stdin: () => "not a tar", exits: [1, 1] },
  { argv: () => ["shop", "test", MEMORY], exits: [0, 1] },
  { argv: () => ["shop", "ls"] },
  { argv: (c) => ["grant", "new", "--pass", c.pass, "--shop", "town/memory", "--commands", "recall"], after: (r, c) => void (c.grant = r.stdout.trim()) },
  { argv: () => ["grant", "ls"] },
  { argv: (c) => ["grant", "revoke", c.grant] },
  { argv: () => ["type", "add", "plain", "--origin", "https://plain.example", "--header", "X-Key: {token}"] },
  { argv: () => ["type", "add", "oa", "--kind", "oauth", ...OAUTH_FLAGS, "--client-id", "cid"], stdin: () => "client-secret\n" },
  { argv: () => ["type", "ls"] },
  {
    argv: () => ["type", "approve", "proposed-oauth", "--client-id", "cid"],
    stdin: () => "client-secret\n",
    before: (store, c) => void store.proposeType({ name: "proposed-oauth", origin: "https://p.example", header: "Authorization: Bearer {token}", oauth: { authorize: "https://p.example/a", token: "https://p.example/t", scopes: ["read"] } }, c.pass, false),
  },
  { argv: () => ["type", "approve", "proposed-token"], before: (store, c) => void store.proposeType({ name: "proposed-token", origin: "https://q.example", header: "X-Key: {token}" }, c.pass, false) },
  { argv: () => ["type", "rm", "plain"] },
  { argv: () => ["credential", "add", "--user", "dimitri", "--type", "github-token"], stdin: () => "ghp_not_a_token\n", after: (r, c) => void (c.credential = r.stdout.trim()) },
  { argv: () => ["credential", "connect", "--user", "dimitri", "--type", "oa", "--timeout", "1s"], exits: [1, 0] },
  { argv: () => ["credential", "ls"] },
  { argv: (c) => ["credential", "rm", c.credential] },
  { argv: () => ["permit", "ls"], before: (store, c) => void (c.approvable = store.newPermit({ passId: c.pass, shop: "town/memory", commands: ["recall"], constraints: {}, why: "a test" }).id) },
  { argv: (c) => ["permit", "show", c.approvable] },
  { argv: (c) => ["permit", "approve", c.approvable] },
  { argv: (c) => ["permit", "deny", c.deniable], before: (store, c) => void (c.deniable = store.newPermit({ passId: c.pass, shop: "town/hall", commands: ["search"], constraints: {}, why: "a test" }).id) },
  { argv: () => ["audit"] },
  { argv: () => ["audit", "--since", "1d"] },
  // Export makes the key, and import reads the wagon before refusing a town that is not empty; in the object the key comes as the pipe sends it, out of the words.
  { argv: (c) => ["store", "export", "--key", c.wagonKey], after: (r, c) => void (c.wagon = r.stdout) },
  { argv: (c) => ["store", "import", "--key", c.wagonKey], stdin: (c) => c.wagon, exits: [1, 1] },
  { argv: (c) => ["pass", "revoke", c.pass] },
  { argv: () => ["shop", "rm", "town/memory"] },
];

/** A stdin that says whether anything iterated it. */
function recorder(text: string | undefined): { stdin: NonNullable<Io["stdin"]>; read: () => boolean } {
  let read = false;
  return {
    read: () => read,
    stdin: {
      isTTY: false,
      async *[Symbol.asyncIterator]() {
        read = true;
        if (text) yield Buffer.from(text, "utf8");
      },
    },
  };
}

function context(): Ctx {
  const gdocs = scratch("gdocs");
  cpSync(path.join(ROOT, "shops/gdocs"), gdocs, { recursive: true });
  // The shop's oauth type under a name no step holds, so --client-id at shop add reads its secret.
  writeFileSync(path.join(gdocs, "manifest.yaml"), readFileSync(path.join(gdocs, "manifest.yaml"), "utf8").replace("type: google-oauth", "type: gdocs-oauth"));
  const tar = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", MEMORY, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return { pass: "", grant: "", credential: "", approvable: "", deniable: "", gdocs, memoryTar: tar.stdout.toString("utf8"), wagonKey: path.join(scratch("wagon"), "wagon.key"), wagon: "" };
}

const wall = () => ({ open: (opts: { data?: string }) => openWall("none", opts) });

it("names every verb the admin dispatches", () => {
  const source = ["src/admin.ts", "src/secrets.ts"].map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const verbs = new Set([...source.matchAll(/^\s*case "([a-z]+(?: [a-z]+)?)":/gm)].map((m) => m[1]!));
  verbs.add("shop test");
  const ctx = context();
  const stepped = new Set(STEPS.map((s) => s.argv(ctx)).map(([noun, verb]) => (verb === undefined || verb.startsWith("-") ? noun! : `${noun} ${verb}`)));
  expect([...verbs].filter((v) => !stepped.has(v))).toEqual([]);
  expect(verbs.size).toBeGreaterThan(20);
});

it("says a verb reads stdin exactly when the verb, run over a data directory, reads it", async () => {
  const data = scratch("data");
  const ctx = context();
  for (const step of STEPS) {
    if (step.before) {
      const store = openStore(data);
      try {
        step.before(store, ctx);
      } finally {
        store.close();
      }
    }
    const argv = step.argv(ctx);
    const r = recorder(step.stdin?.(ctx));
    let stdout = "";
    let stderr = "";
    const io: Io = { out: (s) => void (stdout += s), err: (s) => void (stderr += s), env: {}, stdin: r.stdin };
    const exit = await main(["--data", data, ...argv], io, wall);
    step.after?.({ stdout, stderr }, ctx);
    expect([argv.join(" "), exit], stderr).toEqual([argv.join(" "), step.exits?.[0] ?? 0]);
    expect([argv.join(" "), readsStdin(argv)], stderr).toEqual([argv.join(" "), r.read()]);
  }
}, 120_000);

it("says a verb reads stdin exactly when the verb, run in the box's object, reads it, a shop's directory refused there unread", async () => {
  const store = openStore(scratch("box"));
  // The wagon's key as the door hands it to the object, and `--key <file>` out of the words, as the pipe takes it out.
  const town: AdminTown = { store, runtime: runShelved, address: "https://town.example", wagonKey: randomBytes(32) };
  const ctx = context();
  try {
    for (const step of STEPS) {
      step.before?.(store, ctx);
      const argv = withoutFlag(step.argv(ctx), "key");
      const r = recorder(step.stdin?.(ctx));
      let stdout = "";
      let stderr = "";
      const io: Io = { out: (s) => void (stdout += s), err: (s) => void (stderr += s), env: {}, stdin: r.stdin, consent: { redirect: `${town.address}/consent`, hold: () => {} } };
      const exit = await main(argv, io, wall, town);
      step.after?.({ stdout, stderr }, ctx);
      expect([argv.join(" "), exit], stderr).toEqual([argv.join(" "), step.exits?.[1] ?? 0]);
      const directory = argv[0] === "shop" && (argv[1] === "add" || argv[1] === "test") && argv[2] !== "-";
      expect([argv.join(" "), readsStdin(argv) && !directory], stderr).toEqual([argv.join(" "), r.read()]);
    }
    // --key in the words the object is given is refused naming the pipe, before the wagon on stdin is read.
    const r = recorder(ctx.wagon);
    let stderr = "";
    const exit = await main(["store", "import", "--key", ctx.wagonKey], { out: () => {}, err: (s) => void (stderr += s), env: {}, stdin: r.stdin }, wall, town);
    expect([exit, stderr.split("\n")[0], r.read()]).toEqual([1, "townd admin: --key is read where townd runs, never on the box; the pipe reads the file and sends the key: townd admin --town https://town.example store export --key <file>", false]);
  } finally {
    store.close();
  }
}, 120_000);
