// ring: checkout
// The agent's binary knows nothing: src/cli.ts, and the one module of the
// town's it imports, name no shop, command, or argument of any shop under
// shops/, none of the operator's verbs, nothing of vault's: no github,
// no credential, no repo; and nothing of compose's: no depends, no watch,
// no clerk; and nothing of hall's: no hall, no publish, no permit; and
// nothing of consent's: no consent, no connect, no oauth, no refresh, no
// guidance. Its one new line, that stdin is not text, names none of them
// either.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { denials } from "../src/denials.js";
import { parseManifest, type Manifest, type TownShop } from "../src/manifest.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Every manifest under shops/, parsed with the seeded type and, for a shop with dependencies, the shops under shops/ it names, parsed first. */
function shopManifests(): Manifest[] {
  let pending = readdirSync(path.join(ROOT, "shops")).map((dir) => ({ dir, text: read(`shops/${dir}/manifest.yaml`) }));
  const parsed: Manifest[] = [];
  while (pending.length) {
    const shops: TownShop[] = parsed.map((m) => ({ name: m.name, commands: m.commands.map((c) => c.name) }));
    const results = pending.map((p) => ({ ...p, ...parseManifest(p.text, ["github-token"], shops) }));
    const next = results.filter((r) => !r.manifest);
    if (next.length === pending.length) throw new Error(`shops/ manifests that do not parse:\n${next.map((r) => `${r.dir}: ${r.refusals.join("; ")}`).join("\n")}`);
    parsed.push(...results.flatMap((r) => (r.manifest ? [r.manifest] : [])));
    pending = next;
  }
  return parsed;
}

/** Every word a shop under shops/ owns: its name and last segment, its commands, and its arguments as flags. */
function shopWords(): string[] {
  const words = new Set<string>();
  for (const m of shopManifests()) {
    words.add(m.name).add(m.name.split("/")[1]!);
    for (const c of m.commands) {
      words.add(c.name);
      for (const a of c.args ?? []) words.add(`--${a.name}`);
    }
  }
  return [...words];
}

function localImports(source: string): string[] {
  return [...source.matchAll(/^import\s+(type\s+)?[^'"]*from\s+"(\.[^"]+)";/gm)].map((m) => `${m[1] ? "type " : ""}${m[2]}`);
}

const FORBIDDEN = ["memory", "remember", "recall", "forget", "--key", "--prefix", "serve", "admin", "spec", "github", "credential", "repo", "depends", "watch", "clerk", "hall", "publish", "permit", "consent", "connect", "oauth", "refresh", "guidance"];

it("knows the words it must not hold: memory's, the operator's, vault's, compose's, hall's, and consent's", () => {
  for (const w of ["github", "credential", "repo", "depends", "watch", "clerk", "hall", "publish", "permit", "consent", "connect", "oauth", "refresh"]) expect(FORBIDDEN).toContain(w);
  const words = shopWords();
  for (const w of ["town/memory", "memory", "remember", "recall", "list", "forget", "--key", "--value", "--prefix"]) expect(words).toContain(w);
  for (const w of ["town/watch", "watch", "mark", "changes", "--repo"]) expect(words).toContain(w);
});

it("src/cli.ts imports nothing of the town's but denials.ts, and denials.ts only types", () => {
  expect(localImports(read("src/cli.ts"))).toEqual(["./denials.js"]);
  expect(localImports(read("src/denials.ts")).every((i) => i.startsWith("type "))).toBe(true);
});

it.each(["src/cli.ts", "src/denials.ts"])("%s names no shop, command, argument, or operator verb", (file) => {
  const source = read(file);
  for (const word of FORBIDDEN) expect(source.toLowerCase(), word).not.toContain(word);
  for (const word of shopWords()) {
    expect(new RegExp(`(^|[^A-Za-z0-9_-])${word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^A-Za-z0-9_-]|$)`, "m").test(source), word).toBe(false);
  }
});

it("says stdin is not text in one line from denials.ts, naming no shop, command, argument, or verb", () => {
  const line = denials.stdinNotText();
  expect(line).toBe("error: stdin is not text; the town carries text, so send a shop as a tar of text files");
  expect(read("src/cli.ts")).toContain("denials.stdinNotText()");
  for (const word of FORBIDDEN) expect(line.toLowerCase(), word).not.toContain(word);
  for (const word of shopWords()) expect(new RegExp(`(^|[^A-Za-z0-9_-])${word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^A-Za-z0-9_-]|$)`).test(line), word).toBe(false);
});

it("takes --json and --grant as its only flags", () => {
  const flags = new Set([...read("src/cli.ts").matchAll(/"(--[a-z-]+)[="]/g)].map((m) => m[1]));
  expect([...flags].sort()).toEqual(["--grant", "--json"]);
});
