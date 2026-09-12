// ring: checkout
// The agent's binary knows nothing: src/cli.ts, and the one module of the
// town's it imports, name no shop, command, or argument of any shop under
// shops/, and none of the operator's verbs.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { parseManifest } from "../src/manifest.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Every word a shop under shops/ owns: its name and last segment, its commands, and its arguments as flags. */
function shopWords(): string[] {
  const words = new Set<string>();
  for (const dir of readdirSync(path.join(ROOT, "shops"))) {
    const m = parseManifest(read(`shops/${dir}/manifest.yaml`)).manifest!;
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

const FORBIDDEN = ["memory", "remember", "recall", "forget", "--key", "--prefix", "serve", "admin", "spec"];

it("knows the words it must not hold: memory's, and the operator's", () => {
  const words = shopWords();
  for (const w of ["town/memory", "memory", "remember", "recall", "list", "forget", "--key", "--value", "--prefix"]) expect(words).toContain(w);
});

it("src/cli.ts imports nothing of the town's but denials.ts, and denials.ts only types", () => {
  expect(localImports(read("src/cli.ts"))).toEqual(["./denials.js"]);
  expect(localImports(read("src/denials.ts")).every((i) => i.startsWith("type "))).toBe(true);
});

it.each(["src/cli.ts", "src/denials.ts"])("%s names no shop, command, argument, or operator verb", (file) => {
  const source = read(file);
  for (const word of FORBIDDEN) expect(source, word).not.toContain(word);
  for (const word of shopWords()) {
    expect(new RegExp(`(^|[^A-Za-z0-9_-])${word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^A-Za-z0-9_-]|$)`, "m").test(source), word).toBe(false);
  }
});

it("takes --json and --grant as its only flags", () => {
  const flags = new Set([...read("src/cli.ts").matchAll(/"(--[a-z-]+)[="]/g)].map((m) => m[1]));
  expect([...flags].sort()).toEqual(["--grant", "--json"]);
});
