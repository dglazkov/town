// ring: command
// Journey 4 against a real town: everything an agent sees about a shop
// comes from its manifest. A copy of memory's `guidance` and one
// command's `doc` are changed, the copy is added again (latest only),
// and `town memory --help` says the change with no other file touched.
// Also `townd admin shop test`, one line per test, and `shop add`
// refusing a link that could reach outside the shop.

import { createHash } from "node:crypto";
import { cpSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { MEMORY, agent, assertBuilt, cleanup, cleanEnv, serve, tmp, townd, type Town } from "./helpers/town.js";

const made: string[] = [];
let town: Town;

beforeAll(async () => {
  assertBuilt();
  const data = tmp("contract");
  made.push(data);
  town = await serve(data);
}, 30_000);

afterAll(async () => {
  await town?.stop();
  cleanup(...made, town?.env.HOME ?? "");
});

function fingerprint(dir: string, except: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const rel = path.relative(dir, path.join(e.parentPath, e.name));
    if (rel === except) continue;
    out[rel] = createHash("sha256").update(readFileSync(path.join(dir, rel))).digest("hex");
  }
  return out;
}

it("reads a changed guidance and doc in --help, with no other file touched", () => {
  const shop = tmp("contract-shop");
  made.push(shop);
  cpSync(MEMORY, shop, { recursive: true });
  const repoBefore = fingerprint(MEMORY, "");

  expect(town.admin("shop", "add", shop).exit).toBe(0);
  expect(town.admin("user", "add", "writer").exit).toBe(0);
  const pass = town.admin("pass", "new", "--user", "writer", "--label", "author");
  expect(town.admin("grant", "new", "--pass", pass.stderr.trim(), "--shop", "town/memory").exit).toBe(0);
  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(pass.stdout);

  const before = a.town("memory", "--help");
  expect(before.exit).toBe(0);
  const manifestBefore = parseYaml(readFileSync(path.join(shop, "manifest.yaml"), "utf8"));
  expect(before.stdout).toContain(manifestBefore.guidance.trimEnd());
  expect(before.stdout).toContain("A path-like key.");

  const othersBefore = fingerprint(shop, "manifest.yaml");
  const text = readFileSync(path.join(shop, "manifest.yaml"), "utf8");
  const changed = text
    .replace(/guidance: \|\n(?: {2}.*\n)+/, "guidance: |\n  Group keys by topic, like `recipes/soup`, and browse a topic by its prefix.\n")
    .replace('doc: "A path-like key."', 'doc: "Where the value lives, slash-separated."');
  expect(changed).not.toBe(text);
  writeFileSync(path.join(shop, "manifest.yaml"), changed);
  expect(fingerprint(shop, "manifest.yaml")).toEqual(othersBefore);

  const readded = town.admin("shop", "add", shop);
  expect(readded.exit, readded.stderr).toBe(0);
  const after = a.town("memory", "--help");
  expect(after.exit).toBe(0);
  expect(after.stdout).toContain("Group keys by topic, like `recipes/soup`, and browse a topic by its prefix.");
  expect(after.stdout).toContain("Where the value lives, slash-separated.");
  expect(after.stdout).not.toContain("A path-like key.");
  expect(after.stdout).not.toContain(manifestBefore.guidance.trimEnd());
  expect(fingerprint(MEMORY, "")).toEqual(repoBefore);
}, 60_000);

it("runs a shop's own tests through townd admin shop test, one line per test", () => {
  const home = tmp("no-data");
  made.push(home);
  const r = townd(["admin", "shop", "test", MEMORY], cleanEnv(home));
  expect(r.exit, r.stderr).toBe(0);
  const names = (parseYaml(readFileSync(path.join(MEMORY, "manifest.yaml"), "utf8")).tests as Array<{ name: string }>).map((t) => t.name);
  expect(r.stdout.trim().split("\n")).toEqual(names.map((n) => `ok ${n}`));
}, 60_000);

it("refuses a shop holding a symbolic link, since a copied link can reach outside the shop", () => {
  const shop = tmp("linked-shop");
  const outside = tmp("outside");
  made.push(shop, outside);
  cpSync(MEMORY, shop, { recursive: true });
  writeFileSync(path.join(outside, "secret.mjs"), "export {};\n");
  symlinkSync(path.join(outside, "secret.mjs"), path.join(shop, "helper.mjs"));
  const r = town.admin("shop", "add", shop);
  expect(r.exit).toBe(1);
  expect(r.stderr).toContain(`${path.join(shop, "helper.mjs")} is not a plain file`);
  expect(r.stderr).toContain("put the file itself there instead of a link");

  const linkedDir = tmp("linked-dir-shop");
  made.push(linkedDir);
  cpSync(MEMORY, linkedDir, { recursive: true });
  symlinkSync(outside, path.join(linkedDir, "lib"));
  expect(town.admin("shop", "add", linkedDir).exit).toBe(1);
}, 30_000);

it("keeps a grant made with no --commands to the commands the shop had then; a later shop add does not widen it", () => {
  const shop = tmp("growing-shop");
  made.push(shop);
  cpSync(MEMORY, shop, { recursive: true });
  expect(town.admin("shop", "add", shop).exit).toBe(0);
  expect(town.admin("user", "add", "grower").exit).toBe(0);
  const before = town.admin("pass", "new", "--user", "grower", "--label", "before");
  const beforeGrant = town.admin("grant", "new", "--pass", before.stderr.trim(), "--shop", "town/memory");
  expect(beforeGrant.exit, beforeGrant.stderr).toBe(0);

  const text = readFileSync(path.join(shop, "manifest.yaml"), "utf8");
  const grown = text.replace(
    "tests:\n",
    "  - name: stamp\n    summary: Print nothing, for a test of grants.\n    effect: read\n    output: text\ntests:\n",
  );
  expect(grown).not.toBe(text);
  writeFileSync(path.join(shop, "manifest.yaml"), grown);
  const readded = town.admin("shop", "add", shop);
  expect(readded.exit, readded.stderr).toBe(0);

  const a = agent();
  made.push(a.dir, a.home);
  a.writeGrant(before.stdout);
  expect(a.town("--help").stdout).toContain("[remember, recall, list, forget]\n");
  expect(a.town("memory", "--help").stdout).not.toContain("stamp");
  expect(a.town("memory", "stamp")).toMatchObject({ exit: 2, stderr: "error: command 'stamp' is not available to this grant\n" });
  const row = town.admin("grant", "ls", "--pass", before.stderr.trim()).stdout;
  expect(row).toContain("remember,recall,list,forget ");

  const after = town.admin("pass", "new", "--user", "grower", "--label", "after");
  expect(town.admin("grant", "new", "--pass", after.stderr.trim(), "--shop", "town/memory").exit).toBe(0);
  const b = agent();
  made.push(b.dir, b.home);
  b.writeGrant(after.stdout);
  expect(b.town("--help").stdout).toContain("[remember, recall, list, forget, stamp]\n");
}, 60_000);
