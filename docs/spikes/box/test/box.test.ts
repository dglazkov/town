import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import type { Env as SpikeEnv, RunRequest } from "../src/index.ts";

const spike = env as unknown as SpikeEnv;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, shop TEXT NOT NULL, credentials TEXT NOT NULL, revoked_at INTEGER);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

async function run(req: RunRequest): Promise<Record<string, any>> {
  const res = await SELF.fetch("http://town/run", { method: "POST", body: JSON.stringify(req) });
  return (await res.json()) as Record<string, any>;
}

const SHOP = String.raw`
import { readFile, writeFile, mkdir } from "node:fs/promises";
export default async function main(argv, stdin) {
  const state = process.env.TOWN_STATE;
  await mkdir(state + "/notes", { recursive: true });
  const prev = await readFile(state + "/count", "utf8").catch(() => "0");
  await writeFile(state + "/count", String(Number(prev) + 1));
  await writeFile(state + "/notes/last", argv.join(" "));
  const base = process.env.TOWN_CREDENTIAL_GITHUB_TOKEN;
  const r = await fetch(base + "/repos/octocat/hello?state=open", { headers: { accept: "application/json" } });
  const window = await r.json();
  const other = await fetch("https://api.github.com/repos/octocat/hello");
  const refused = other.status + " " + (await other.text());
  const keys = Object.keys(process.env).sort().join(",");
  process.stdout.write("argv=" + argv.join(",") + " stdin=" + stdin + " count=" + (Number(prev) + 1) + "\n");
  process.stderr.write("log line\n");
  return { window, refused, keys, cwd: process.cwd(), grant: process.env.TOWN_GRANT ? JSON.parse(await readFile(process.env.TOWN_GRANT, "utf8")) : null };
}
`;

it("the object runs the town's SQL: many statements, json_each, a transaction, the seal", async () => {
  const town = spike.TOWN.getByName("t");
  await town.exec(SCHEMA);
  await town.exec("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)", "u_1", "dimitri", 1);
  await town.exec("INSERT INTO grants (id, shop, credentials, revoked_at) VALUES (?, ?, ?, NULL)", "grt_1", "town/github", JSON.stringify({ "github-token": "cred_1" }));
  const bound = await town.exec("SELECT DISTINCT g.id FROM grants g, json_each(g.credentials) j WHERE j.value = ? AND g.revoked_at IS NULL", "cred_1");
  expect(bound).toEqual([{ id: "grt_1" }]);
  expect(await town.atomic()).toMatch(/^rolled back: .*rows=0$/);
  expect(await town.seal()).toBe("secret-value refused");
});

it("a shop's main runs in an isolate under the contract: state in and out, the window, nothing else", async () => {
  const req: RunRequest = {
    entry: "main.mjs",
    source: SHOP,
    argv: ["list", "--repo", "octocat/hello"],
    stdin: "hi",
    user: "usr_1",
    state: { count: "2", "notes/old": "x" },
    window: { callId: "call_1", type: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}", token: "ghp_secret" },
    grant: { town: "http://clerk/call_1", token: "per-call" },
  };
  const r = await run(req);
  console.log(JSON.stringify(r, null, 1));
  expect(r.loadError).toBeUndefined();
  expect(r.exit).toBe(0);
  expect(r.stdout.split("\n")[0]).toBe("argv=list,--repo,octocat/hello stdin=hi count=3");
  const said = JSON.parse(r.stdout.split("\n")[1]!);
  expect(said.window.forwarded).toBe("https://api.github.com/repos/octocat/hello?state=open");
  expect(said.window.header).toBe("Authorization: Bearer <token>");
  expect(said.refused).toMatch(/^403 refused/);
  expect(said.keys).toBe("TOWN_CREDENTIAL_GITHUB_TOKEN,TOWN_ENTRY,TOWN_GRANT,TOWN_STATE,TOWN_USER");
  expect(r.stderr).toBe("log line\n");
  expect(r.state).toEqual({ count: "3", "notes/old": "x", "notes/last": "list --repo octocat/hello" });
  const second = await run({ ...req, state: r.state });
  expect(second.stdout).toContain("count=4");
});

it("a module's top-level await is not waited for: import() resolves at the first real await", async () => {
  const r = await run({ entry: "top.mjs", source: `process.stdout.write("first;"); await new Promise((r) => setTimeout(r, 20)); process.stdout.write("late;");`, argv: [], stdin: "", user: "u", state: {}, window: null });
  console.log("top-level await:", JSON.stringify(r));
  expect(r.stdout).toBe("first;");
});

/** A subprocess-shaped script as a worker shop: imports hoisted, the program wrapped as main. What an agent would do by hand. */
function asMain(source: string): string {
  const imports: string[] = [];
  const body = source.replace(/^import[^;]*;\s*$/gm, (m) => { imports.push(m); return ""; });
  return `${imports.join("\n")}\nexport default async function main() {\n${body}\n}\n`;
}

it("a shop with no window has no way out", async () => {
  const r = await run({ entry: "m.mjs", source: `export default async function main() { const said = {}; try { const r = await fetch("https://example.com/"); said.fetch = "answered " + r.status; } catch (e) { said.fetch = "threw: " + e.message; } for (const m of ["node:child_process", "node:net", "node:http", "node:os"]) { try { const mod = await import(m); said[m] = "imported: " + Object.keys(mod).slice(0, 4).join(","); if (m === "node:child_process") { try { mod.spawnSync("ls"); said.spawn = "spawned"; } catch (e) { said.spawn = "threw: " + e.message; } } if (m === "node:os") said.os = mod.hostname() + " " + mod.homedir(); } catch (e) { said[m] = "threw: " + e.message; } } return said; }`, argv: [], stdin: "", user: "u", state: {}, window: null });
  console.log(JSON.stringify(r));
  expect(r.exit).toBe(0);
});

import MEMORY from "../../../../shops/memory/main.mjs?raw";
import GITHUB from "../../../../shops/github/main.mjs?raw";

const bare = (entry: string, source: string, argv: string[], state: Record<string, string> = {}, stdin = "", window: RunRequest["window"] = null): RunRequest => ({ entry, source, argv, stdin, user: "usr_1", state, window });

it("town/memory, its program wrapped as main, runs as it does on the laptop: its whole program at the top level, fs on the state, stdin, process.exit", async () => {
  const a = await run(bare("main.mjs", asMain(MEMORY), ["remember", "--key", "t/a", "--value", "hello"]));
  expect(a.exit, JSON.stringify(a)).toBe(0);
  expect(a.state).toEqual({ "t/a": "hello" });
  const b = await run(bare("main.mjs", asMain(MEMORY), ["recall", "--key", "t/a"], a.state));
  expect(b.stdout).toBe("hello\n");
  const c = await run(bare("main.mjs", asMain(MEMORY), ["remember", "--key", "t/b"], a.state, "from stdin"));
  expect(c.state["t/b"]).toBe("from stdin");
  const d = await run(bare("main.mjs", asMain(MEMORY), ["recall", "--key", "never/set"], a.state));
  expect([d.exit, d.stderr]).toEqual([1, "no value under that key\n"]);
  const e = await run(bare("main.mjs", asMain(MEMORY), ["remember", "--key", "../escape", "--value", "x"], a.state));
  expect([e.exit, e.stderr]).toEqual([1, "the key is outside the state\n"]);
  const f = await run(bare("main.mjs", asMain(MEMORY), ["list", "--prefix", "t/"], { ...a.state, "t/b": "x", "u/c": "y" }));
  expect(f.stdout).toBe("t/a\nt/b\n");
  console.log("memory ms:", [a, b, c, d, e, f].map((r) => r.ms).join(","));
});

it("town/github, wrapped as main: fetch at the top level through the window, refused past it", async () => {
  const window = { callId: "call_2", type: "github-token", origin: "https://api.github.com", header: "Authorization: Bearer {token}", token: "ghp_secret" };
  const a = await run(bare("main.mjs", asMain(GITHUB), ["list", "--repo", "octocat/hello", "--limit", "30"], {}, "", window));
  console.log(JSON.stringify(a));
  expect(a.exit).toBe(0);
  expect(a.stdout).toContain("a real-looking issue");
  const b = await run(bare("main.mjs", asMain(GITHUB), ["list", "--repo", "octocat/hello", "--limit", "30"]));
  expect(b.exit).toBe(1);
  expect(b.stderr).toBe("the town gave no window for a github-token\n");
});

it("a hundred state files round trip", async () => {
  const state: Record<string, string> = {};
  for (let i = 0; i < 100; i++) state[`notes/n${i}`] = "x".repeat(2000);
  const r = await run(bare("main.mjs", asMain(MEMORY), ["list", "--prefix", "notes/"], state));
  expect(r.stdout.split("\n").filter(Boolean)).toHaveLength(100);
  console.log("100 files x 2 KB:", r.ms, "ms");
});
