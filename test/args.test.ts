// ring: checkout
// A command's words to canonical arguments, or refusals as data (spec §4),
// and a test line's words split as a shell would with nothing expanded.

import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalArgv, parseArgs, splitWords, type ArgRefusalKind } from "../src/args.js";
import type { Manifest } from "../src/manifest.js";
import { loadShop } from "../src/shoptest.js";

let m: Manifest;
beforeAll(async () => {
  m = await loadShop(path.resolve(import.meta.dirname, "fixtures/echo-shop"));
});

function kinds(words: string[], command = "echo"): ArgRefusalKind[] {
  const r = parseArgs(m, command, words);
  return r.ok ? [] : r.refusals.map((x) => x.kind);
}

describe("parseArgs", () => {
  it("types values and fills defaults", () => {
    const r = parseArgs(m, "echo", ["--loud", "--alpha", "12", "--zeta=a=b"]);
    expect(r.ok && r.values).toEqual({ zeta: "a=b", alpha: 12, mode: "slow", loud: true });
  });

  it("takes the next word as a value whatever it looks like", () => {
    const r = parseArgs(m, "echo", ["--zeta", "--alpha"]);
    expect(r.ok && r.values.zeta).toBe("--alpha");
  });

  it("reads a bool from an explicit true or false", () => {
    const r = parseArgs(m, "echo", ["--zeta", "z", "--loud", "false"]);
    expect(r.ok && r.values.loud).toBe(false);
  });

  it("refuses a missing required argument", () => expect(kinds([])).toEqual(["missing"]));
  it("refuses an unknown argument", () => expect(kinds(["--zeta", "z", "--colour", "red"])).toEqual(["unknown"]));
  it("refuses a word that is not an argument", () => expect(kinds(["--zeta", "z", "loose"])).toEqual(["stray"]));
  it("refuses an argument given twice", () => expect(kinds(["--zeta", "z", "--zeta", "y"])).toEqual(["repeated"]));
  it("refuses an argument with no value", () => expect(kinds(["--zeta"])).toEqual(["no-value"]));
  it("refuses a value that is not an int", () => expect(kinds(["--zeta", "z", "--alpha", "1.5"])).toEqual(["type"]));
  it("refuses a bool that is not true or false", () => expect(kinds(["--zeta", "z", "--loud=yes"])).toEqual(["type"]));
  it("refuses a value outside an enum", () => expect(kinds(["--zeta", "z", "--mode", "medium"])).toEqual(["enum"]));
  it("refuses an unknown command", () => expect(kinds([], "nope")).toEqual(["unknown-command"]));

  it("gives each refusal a subject and a message", () => {
    const r = parseArgs(m, "echo", ["--mode", "medium"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refusals).toContainEqual({ kind: "missing", subject: "zeta", message: "--zeta is required" });
      expect(r.refusals).toContainEqual({ kind: "enum", subject: "mode", message: "--mode must be one of fast, slow, not medium" });
    }
  });
});

describe("canonicalArgv", () => {
  it("is what parseArgs' values render to, in manifest order", () => {
    const r = parseArgs(m, "echo", ["--note", "n", "--loud", "--zeta", "z"]);
    expect(r.ok && canonicalArgv(m, "echo", r.values)).toEqual(
      ["echo", "--zeta", "z", "--alpha", "7", "--mode", "slow", "--loud", "true", "--note", "n"],
    );
  });

  it("round-trips: canonical words parse to the same values", () => {
    const first = parseArgs(m, "echo", ["--zeta", "z", "--mode", "fast"]);
    if (!first.ok) throw new Error("did not parse");
    const [, ...words] = canonicalArgv(m, "echo", first.values);
    const again = parseArgs(m, "echo", words);
    expect(again.ok && again.values).toEqual(first.values);
  });
});

describe("splitWords", () => {
  const words = (line: string) => {
    const r = splitWords(line);
    return r.ok ? r.words : r.error;
  };
  it("splits on spaces", () => expect(words("  remember --key  t/a ")).toEqual(["remember", "--key", "t/a"]));
  it("keeps single quotes literal", () => expect(words(`say '$HOME "x" \\n'`)).toEqual(["say", `$HOME "x" \\n`]));
  it("keeps double quotes, with \\\" and \\\\ escaped", () => expect(words(`say "a \\"b\\" \\\\ $c"`)).toEqual(["say", `a "b" \\ $c`]));
  it("joins adjacent quoted parts", () => expect(words(`say a'b c'"d"`)).toEqual(["say", "ab cd"]));
  it("keeps an empty quoted word", () => expect(words(`say ''`)).toEqual(["say", ""]));
  it("expands nothing", () => expect(words("say $(pwd) | cat > x")).toEqual(["say", "$(pwd)", "|", "cat", ">", "x"]));
  it("refuses an unclosed quote", () => expect(words(`say "a`)).toMatch(/unclosed/));
});
