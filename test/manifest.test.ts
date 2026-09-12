// ring: checkout
// Manifest v0: the memory manifest parses, and every refusal names its
// field, what is wrong, what to write instead, and a real spec section.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { parseManifest, validateManifest } from "../src/manifest.js";
import { SPEC, specSections } from "../src/spec.js";

const MEMORY = readFileSync(path.resolve(import.meta.dirname, "../shops/memory/manifest.yaml"), "utf8");
const SHAPE = /^([^:]+): (.+); write (.+) instead \(spec §(\d+)\)$/;

/** A fresh copy of the memory manifest as data, changed by `edit`. */
function memoryWith(edit: (m: any) => void): unknown {
  const m = parseYaml(MEMORY);
  edit(m);
  return m;
}

function expectWellFormed(refusals: string[]): void {
  const sections = specSections();
  for (const r of refusals) {
    const match = SHAPE.exec(r);
    expect(match, r).not.toBeNull();
    expect(sections, r).toContain(Number(match![4]));
  }
}

describe("the memory manifest", () => {
  it("parses with no refusals", () => {
    const { manifest, refusals } = parseManifest(MEMORY);
    expect(refusals).toEqual([]);
    expect(manifest?.name).toBe("town/memory");
    expect(manifest?.commands.map((c) => c.name)).toEqual(["remember", "recall", "list", "forget"]);
    expect(manifest?.commands.find((c) => c.name === "forget")?.effect).toBe("destructive");
  });

  it("is the spec's full example, with its own tests added; the example parses too", () => {
    const section = SPEC.split("## 9. A full example\n")[1]!.split("\n");
    const block = section.slice(1, section.findIndex((l, i) => i > 0 && l !== "" && !l.startsWith("    ")));
    const example = block.map((l) => l.slice(4)).join("\n");
    expect(parseManifest(example).refusals).toEqual([]);
    const { tests: exampleTests, ...exampleRest } = parseYaml(example);
    const { tests: memoryTests, ...memoryRest } = parseYaml(MEMORY);
    expect(exampleRest).toEqual(memoryRest);
    expect(memoryTests.slice(0, exampleTests.length)).toEqual(exampleTests);
  });
});

describe("the spec", () => {
  it("is under three hundred lines", () => {
    expect(SPEC.split("\n").length).toBeLessThan(300);
  });

  it("numbers its sections 1 to 9", () => {
    expect(specSections()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

// Each case: a change to the memory manifest, the field the refusal must
// name, and the section it must cite.
const cases: Array<[string, (m: any) => void, string, number]> = [
  ["name missing", (m) => delete m.name, "name", 2],
  ["name without a namespace", (m) => (m.name = "memory"), "name", 2],
  ["version missing", (m) => delete m.version, "version", 2],
  ["version not semver", (m) => (m.version = "1"), "version", 2],
  ["summary missing", (m) => delete m.summary, "summary", 2],
  ["runtime missing", (m) => delete m.runtime, "runtime", 2],
  ["runtime not subprocess", (m) => (m.runtime = "wasi"), "runtime", 2],
  ["entry missing", (m) => delete m.entry, "entry", 2],
  ["entry outside the shop", (m) => (m.entry = "../main.mjs"), "entry", 2],
  ["an unknown top-level field", (m) => (m.color = "blue"), "color", 2],
  ["commands missing", (m) => delete m.commands, "commands", 3],
  ["commands empty", (m) => (m.commands = []), "commands", 3],
  ["command name missing", (m) => delete m.commands[0].name, "commands[0].name", 3],
  ["command name repeated", (m) => (m.commands[1].name = "remember"), "commands[1].name", 3],
  ["command summary missing", (m) => delete m.commands[0].summary, "commands[0].summary", 3],
  ["command effect missing", (m) => delete m.commands[0].effect, "commands[0].effect", 3],
  ["command effect unknown", (m) => (m.commands[3].effect = "delete"), "commands[3].effect", 3],
  ["command output missing", (m) => delete m.commands[0].output, "commands[0].output", 3],
  ["command output unknown", (m) => (m.commands[0].output = "yaml"), "commands[0].output", 3],
  ["an unknown command field", (m) => (m.commands[0].hidden = true), "commands[0].hidden", 3],
  ["args not a list", (m) => (m.commands[0].args = "key"), "commands[0].args", 4],
  ["arg name missing", (m) => delete m.commands[0].args[0].name, "commands[0].args[0].name", 4],
  ["arg type missing", (m) => delete m.commands[0].args[0].type, "commands[0].args[0].type", 4],
  ["arg type unknown", (m) => (m.commands[0].args[0].type = "float"), "commands[0].args[0].type", 4],
  ["enum without values", (m) => (m.commands[0].args[1].type = "enum"), "commands[0].args[1].values", 4],
  ["values on a string", (m) => (m.commands[0].args[1].values = ["a"]), "commands[0].args[1].values", 4],
  ["default of the wrong type", (m) => (m.commands[0].args[1].default = 3), "commands[0].args[1].default", 4],
  ["default with required", (m) => (m.commands[0].args[0].default = "k"), "commands[0].args[0].default", 4],
  ["required not a bool", (m) => (m.commands[0].args[0].required = "yes"), "commands[0].args[0].required", 4],
  ["constrainable an unknown kind", (m) => (m.commands[0].args[0].constrainable = ["in_folder"]), "commands[0].args[0].constrainable", 5],
  ["constrainable a kind the type does not take", (m) => (m.commands[0].args[0] = { name: "key", type: "bool", constrainable: ["prefix"] }), "commands[0].args[0].constrainable", 5],
  ["tests missing", (m) => delete m.tests, "tests", 6],
  ["tests empty", (m) => (m.tests = []), "tests", 6],
  ["test name missing", (m) => delete m.tests[0].name, "tests[0].name", 6],
  ["test run missing", (m) => delete m.tests[0].run, "tests[0].run", 6],
  ["test expect missing", (m) => delete m.tests[0].expect, "tests[0].expect", 6],
  ["test expect with two checks", (m) => (m.tests[0].expect = { contains: "a", exit: 0 }), "tests[0].expect", 6],
  ["test expect exit not an int", (m) => (m.tests[0].expect = { exit: "one" }), "tests[0].expect.exit", 6],
  ["test run line with an unknown command", (m) => (m.tests[0].run = "memorize --key a"), "tests[0].run line 1", 4],
  ["test run line missing a required argument", (m) => (m.tests[0].run = "remember --key a\nrecall"), "tests[0].run line 2", 4],
  ["test run line with an unclosed quote", (m) => (m.tests[0].run = "remember --key 'a"), "tests[0].run line 1", 6],
  ["a shop named for an operator verb", (m) => (m.name = "town/serve"), "name", 2],
  ["a shop named spec", (m) => (m.name = "someone/spec"), "name", 2],
  ["an argument named json", (m) => (m.commands[0].args[1].name = "json"), "commands[0].args[1].name", 4],
  ["an argument named grant", (m) => (m.commands[1].args[0].name = "grant"), "commands[1].args[0].name", 4],
  ["an argument named help", (m) => (m.commands[2].args[0].name = "help"), "commands[2].args[0].name", 4],
  ["a summary naming a command", (m) => (m.summary = "Remember and recall short notes by key."), "summary", 2],
  ["guidance naming a command", (m) => (m.guidance = "Keys are paths; `forget` drops one.\n"), "guidance", 2],
  ["guidance naming a command in another case", (m) => (m.guidance = "LIST shows what is under a prefix.\n"), "guidance", 2],
];

describe("refusals", () => {
  it.each(cases)("%s", (_label, edit, field, section) => {
    const refusals = validateManifest(memoryWith(edit));
    expectWellFormed(refusals);
    const mine = refusals.filter((r) => r.startsWith(`${field}: `));
    expect(mine, refusals.join("\n")).toHaveLength(1);
    expect(mine[0]).toMatch(new RegExp(`; write .+ instead \\(spec §${section}\\)$`));
  });

  it("refuses a manifest that is not YAML, or not a mapping", () => {
    const bad = parseManifest("name: [unclosed");
    expect(bad.manifest).toBeNull();
    expectWellFormed(bad.refusals);
    expectWellFormed(validateManifest("just a string"));
    expect(validateManifest(null)).toHaveLength(1);
  });

  it("gives no manifest while there is any refusal", () => {
    expect(parseManifest(MEMORY.replace("runtime: subprocess", "runtime: wasi")).manifest).toBeNull();
  });
});

describe("prose that names a command", () => {
  it("names each command it found, and passes a word that only contains one", () => {
    const refusals = validateManifest(memoryWith((m) => (m.summary = "Remember, then Recall; forget-me-nots and listings are fine.")));
    expectWellFormed(refusals);
    expect(refusals).toEqual([expect.stringMatching(/^summary: names the commands remember, recall, which a grant may hide; write /)]);
  });
});

describe("credentials and dependencies", () => {
  it("refuses credentials, saying this town holds neither yet and project vault brings them", () => {
    const text = `${MEMORY}credentials:\n  - type: google-oauth\n    scopes: [drive.file]\n`;
    const { manifest, refusals } = parseManifest(text);
    expect(manifest).toBeNull();
    expectWellFormed(refusals);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/^credentials: this town holds neither credentials nor dependencies yet, and project vault brings/);
  });

  it("refuses depends, saying this town holds neither yet and project compose brings them", () => {
    const { manifest, refusals } = parseManifest(`${MEMORY}depends:\n  - shop: town/other\n`);
    expect(manifest).toBeNull();
    expectWellFormed(refusals);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/^depends: this town holds neither credentials nor dependencies yet, and project compose brings/);
  });

  it("accepts both when present and empty", () => {
    expect(validateManifest(memoryWith((m) => ((m.credentials = []), (m.depends = null))))).toEqual([]);
  });
});

describe("every cited section", () => {
  it("is a numbered section of the spec, and every message says what to write", () => {
    const all = cases.flatMap(([, edit]) => validateManifest(memoryWith(edit)));
    all.push(...validateManifest(memoryWith((m) => ((m.credentials = [{ type: "x" }]), (m.depends = [{ shop: "a/b" }])))));
    expect(all.length).toBeGreaterThan(cases.length);
    expectWellFormed(all);
  });
});
