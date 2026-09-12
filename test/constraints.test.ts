// ring: checkout
// The five built-in constraint kinds, one function each, the grant's
// constraints checked against a call's values, the admin's constraint
// lines typed for their argument, and checkGrantShape refusing what the
// manifest does not allow when the grant is made.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKS,
  checkGrantShape,
  equals,
  firstMiss,
  maxLength,
  oneOf,
  parseConstraintLines,
  passes,
  prefix,
  regex,
} from "../src/constraints.js";
import { CONSTRAINT_KINDS, parseManifest, type Manifest } from "../src/manifest.js";

const memory = parseManifest(readFileSync(path.resolve(import.meta.dirname, "../shops/memory/manifest.yaml"), "utf8")).manifest!;

const KINDS_YAML = `
name: test/kinds
version: 0.0.1
summary: Every constraint kind on one command.
runtime: subprocess
entry: ./main.mjs
commands:
  - name: pick
    summary: Pick.
    effect: read
    args:
      - { name: word, type: string, constrainable: [equals, one_of, prefix, regex, max_length] }
      - { name: n, type: int, constrainable: [equals, one_of] }
      - { name: flag, type: bool }
    output: text
tests:
  - { name: t, run: pick, expect: { exit: 0 } }
`;
const kinds = parseManifest(KINDS_YAML).manifest!;

describe("the five kinds", () => {
  it("are exactly the manifest's kinds, one function each", () => {
    expect(Object.keys(CHECKS).sort()).toEqual([...CONSTRAINT_KINDS].sort());
  });

  it("equals: exactly the value, typed", () => {
    expect(equals("a", "a")).toBe(true);
    expect(equals("ab", "a")).toBe(false);
    expect(equals(3, 3)).toBe(true);
    expect(equals("3", 3)).toBe(false);
  });

  it("one_of: one of the values", () => {
    expect(oneOf("b", ["a", "b"])).toBe(true);
    expect(oneOf("c", ["a", "b"])).toBe(false);
    expect(oneOf(2, [1, 2])).toBe(true);
  });

  it("prefix: starts with it", () => {
    expect(prefix("notes/lunch", "notes/")).toBe(true);
    expect(prefix("secret/notes/", "notes/")).toBe(false);
    expect(prefix("notes", "notes/")).toBe(false);
  });

  it("regex: the whole value matches, anchored at both ends", () => {
    expect(regex("notes/a", "[a-z]+/[a-z]+")).toBe(true);
    expect(regex("x notes/a", "[a-z]+/[a-z]+")).toBe(false);
    expect(regex("notes/a/b", "[a-z]+/[a-z]+")).toBe(false);
    expect(regex("ab", "a|ab")).toBe(true); // the alternation is grouped before anchoring
  });

  it("max_length: at most that many characters", () => {
    expect(maxLength("abcd", 4)).toBe(true);
    expect(maxLength("abcde", 4)).toBe(false);
    expect(maxLength("üüüü", 4)).toBe(true);
  });

  it("an argument left out passes no rule", () => {
    for (const k of CONSTRAINT_KINDS) expect(passes(k, "x", undefined)).toBe(false);
  });
});

describe("firstMiss", () => {
  const constraints = { "pick.word": { prefix: "a", max_length: 3 }, "pick.n": { one_of: [1, 2] }, "other.word": { equals: "z" } };
  it("is null when every rule on the command passes", () => {
    expect(firstMiss(constraints, "pick", { word: "abc", n: 2 })).toBeNull();
  });
  it("names the argument, kind, and rule missed", () => {
    expect(firstMiss(constraints, "pick", { word: "abcd", n: 2 })).toEqual({ arg: "word", kind: "max_length", rule: 3 });
    expect(firstMiss(constraints, "pick", { word: "abc", n: 5 })).toEqual({ arg: "n", kind: "one_of", rule: [1, 2] });
    expect(firstMiss(constraints, "pick", { n: 1 })).toEqual({ arg: "word", kind: "prefix", rule: "a" });
  });
  it("ignores rules on other commands", () => {
    expect(firstMiss(constraints, "pick", { word: "a", n: 1 })).toBeNull();
  });
});

describe("parseConstraintLines", () => {
  it("types values for the kind and the argument", () => {
    const { constraints, refusals } = parseConstraintLines(kinds, [
      "pick.word one_of a, b ,c",
      "pick.word max_length 10",
      "pick.word prefix has spaces/ ",
      "pick.n equals 7",
      "pick.n one_of 1,2",
    ]);
    expect(refusals).toEqual([]);
    expect(constraints).toEqual({
      "pick.word": { one_of: ["a", "b", "c"], max_length: 10, prefix: "has spaces/ " },
      "pick.n": { equals: 7, one_of: [1, 2] },
    });
  });

  it("refuses a line not of the form, and a kind given twice", () => {
    const { refusals } = parseConstraintLines(kinds, ["pick.word", "pick.word prefix a", "pick.word prefix b"]);
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toMatch(/is not '<command>\.<arg> <kind> <value>'; write one like/);
    expect(refusals[1]).toMatch(/already has a prefix rule/);
  });
});

describe("checkGrantShape", () => {
  const shape = (m: Manifest, commands: string[], lines: string[]) => checkGrantShape(m, { commands, constraints: parseConstraintLines(m, lines).constraints });

  it("accepts journey 2's grant", () => {
    expect(shape(memory, ["remember", "recall", "list"], ["remember.key prefix notes/", "recall.key prefix notes/"])).toEqual([]);
  });

  it("accepts every kind where the manifest marks it", () => {
    expect(shape(kinds, ["pick"], ["pick.word equals a", "pick.word one_of a,b", "pick.word prefix a", "pick.word regex a.*", "pick.word max_length 3", "pick.n equals 1", "pick.n one_of 1,2"])).toEqual([]);
  });

  const cases: Array<[string, Manifest, string[], string[], RegExp]> = [
    ["a kind not constrainable for the argument", memory, ["recall"], ["recall.key max_length 5"], /does not mark recall\.key constrainable by max_length; write one of prefix, regex$/],
    ["a kind on an argument that marks none", memory, ["remember"], ["remember.value prefix x"], /does not mark remember\.value constrainable by prefix; write no constraint on it$/],
    ["a kind that does not exist", memory, ["recall"], ["recall.key in_folder a"], /in_folder is not a constraint kind/],
    ["an int kind on an int argument with a word", kinds, ["pick"], ["pick.n equals seven"], /equals takes an int/],
    ["max_length that is not a number", kinds, ["pick"], ["pick.word max_length many"], /max_length takes a whole number/],
    ["a regex that does not compile", kinds, ["pick"], ["pick.word regex ("], /is not a JavaScript pattern/],
    ["a command the shop lacks", memory, ["recall", "burn"], [], /burn is not a command of town\/memory/],
    ["no commands", memory, [], [], /names no command/],
    ["a constraint on a command the grant does not hold", memory, ["recall"], ["remember.key prefix a"], /remember is not in this grant's commands/],
    ["a constraint on a command the shop lacks", memory, ["recall"], ["burn.key prefix a"], /burn is not a command of town\/memory/],
    ["a constraint on an argument the command lacks", memory, ["recall"], ["recall.path prefix a"], /path is not an argument of recall; write one of key$/],
  ];
  it.each(cases)("refuses %s, saying what to write", (_label, m, commands, lines, message) => {
    const refusals = shape(m, commands, lines);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(message);
    expect(refusals[0]).toMatch(/; (write|add) /);
  });
});
