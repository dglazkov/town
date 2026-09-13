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

describe("credentials", () => {
  const TYPES = ["github-token"];
  const withNeeds = (credentials: unknown) => memoryWith((m) => (m.credentials = credentials));

  it("parses a need of a type the town holds", () => {
    const { manifest, refusals } = parseManifest(`${MEMORY}credentials:\n  - type: github-token\n`, TYPES);
    expect(refusals).toEqual([]);
    expect(manifest?.credentials).toEqual([{ type: "github-token" }]);
  });

  it("refuses a type the town does not hold, naming the ones it does", () => {
    const refusals = validateManifest(withNeeds([{ type: "github-tokens" }]), ["github-token", "internal"]);
    expectWellFormed(refusals);
    expect(refusals).toEqual(["credentials[0].type: 'github-tokens' is not a type this town holds; write one of (github-token, internal) instead (spec §8)"]);
  });

  it("writes the design's line for one type held", () => {
    expect(validateManifest(withNeeds([{ type: "github-tokens" }]), TYPES)).toEqual([
      "credentials[0].type: 'github-tokens' is not a type this town holds; write one of (github-token) instead (spec §8)",
    ]);
  });

  it("refuses a need when no store is at hand, naming --data", () => {
    const refusals = validateManifest(withNeeds([{ type: "github-token" }]));
    expectWellFormed(refusals);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/^credentials\[0\]\.type: 'github-token' cannot be checked with no data directory at hand; write .*--data <dir>.* instead \(spec §8\)$/);
  });

  it("refuses a need with another key, a type given twice, a need that is not a mapping, and a list that is not one", () => {
    const cases: Array<[unknown, string]> = [
      [[{ type: "github-token", scopes: ["repo"] }], "credentials[0].scopes"],
      [[{ type: "github-token" }, { type: "github-token" }], "credentials[1].type"],
      [["github-token"], "credentials[0]"],
      [[{}], "credentials[0].type"],
      [{ type: "github-token" }, "credentials"],
    ];
    for (const [credentials, field] of cases) {
      const refusals = validateManifest(withNeeds(credentials), TYPES);
      expectWellFormed(refusals);
      expect(refusals.map((r) => r.split(": ")[0]), JSON.stringify(credentials)).toEqual([field]);
    }
  });

  it("accepts none: absent, null, or empty, with or without a store", () => {
    for (const credentials of [undefined, null, []]) {
      expect(validateManifest(withNeeds(credentials))).toEqual([]);
      expect(validateManifest(withNeeds(credentials), [])).toEqual([]);
    }
  });
});

describe("dependencies", () => {
  const SHOPS = [
    { name: "test/echo", commands: ["echo", "sleep", "fail"] },
    { name: "test/teller", commands: ["get", "post"] },
  ];
  const withDepends = (depends: unknown) => memoryWith((m) => (m.depends = depends));

  it("parses dependencies on shops the town holds, at commands they have", () => {
    const { manifest, refusals } = parseManifest(`${MEMORY}depends:\n  - shop: test/echo\n    commands: [echo]\n  - shop: test/teller\n    commands: [get, post]\n`, [], SHOPS);
    expect(refusals).toEqual([]);
    expect(manifest?.depends).toEqual([
      { shop: "test/echo", commands: ["echo"] },
      { shop: "test/teller", commands: ["get", "post"] },
    ]);
  });

  it("refuses a shop the town does not hold, naming the ones it holds and shop add", () => {
    const refusals = validateManifest(withDepends([{ shop: "test/gh", commands: ["list"] }]), [], SHOPS);
    expectWellFormed(refusals);
    expect(refusals).toEqual([
      "depends[0].shop: 'test/gh' is not a shop this town holds; write one of (test/echo, test/teller), or add it with townd admin shop add first, instead (spec §8)",
    ]);
  });

  it("refuses a command the shop does not have, naming the ones it has", () => {
    const refusals = validateManifest(withDepends([{ shop: "test/echo", commands: ["echo", "shout"] }]), [], SHOPS);
    expectWellFormed(refusals);
    expect(refusals).toEqual(["depends[0].commands[1]: 'shout' is not a command test/echo has; write one of (echo, sleep, fail) instead (spec §8)"]);
  });

  it("refuses the shop itself, with a store at hand or without", () => {
    for (const shops of [SHOPS, [...SHOPS, { name: "town/memory", commands: ["recall"] }], undefined]) {
      const refusals = validateManifest(withDepends([{ shop: "town/memory", commands: ["recall"] }]), [], shops);
      expectWellFormed(refusals);
      expect(refusals).toEqual(["depends[0].shop: is town/memory, this shop itself; write a shop other than this one instead (spec §8)"]);
    }
  });

  it("refuses commands missing or empty", () => {
    for (const d of [{ shop: "test/echo" }, { shop: "test/echo", commands: [] }]) {
      const refusals = validateManifest(withDepends([d]), [], SHOPS);
      expectWellFormed(refusals);
      expect(refusals, JSON.stringify(d)).toEqual([
        `depends[0].commands: ${"commands" in d ? "is not a non-empty list" : "is missing"}; write the commands this shop calls there, like [recall] instead (spec §8)`,
      ]);
    }
  });

  it("refuses a second entry for one shop, and a command named twice", () => {
    const twice = validateManifest(withDepends([{ shop: "test/echo", commands: ["echo"] }, { shop: "test/echo", commands: ["sleep"] }]), [], SHOPS);
    expectWellFormed(twice);
    expect(twice).toEqual(["depends[1].shop: repeats the shop test/echo; write each shop once, with all the commands called there instead (spec §8)"]);
    const again = validateManifest(withDepends([{ shop: "test/echo", commands: ["echo", "echo"] }]), [], SHOPS);
    expect(again).toEqual(["depends[0].commands[1]: repeats the command echo; write each command once instead (spec §8)"]);
  });

  it("refuses a dependency when no store is at hand, naming --data", () => {
    const refusals = validateManifest(withDepends([{ shop: "test/echo", commands: ["echo"] }]));
    expectWellFormed(refusals);
    expect(refusals).toEqual([
      "depends[0].shop: 'test/echo' cannot be checked with no data directory at hand; write the verb again with --data <dir>, so the town's shops are read, instead (spec §8)",
    ]);
  });

  it("refuses a depends that is not a list, an entry that is not a mapping, another key, and a shop that is not a name", () => {
    const cases: Array<[unknown, string[]]> = [
      [{ shop: "test/echo", commands: ["echo"] }, ["depends"]],
      [["test/echo"], ["depends[0]"]],
      [[{ shop: "test/echo", commands: ["echo"], version: "1.0.0" }], ["depends[0].version"]],
      [[{ shop: "echo", commands: ["echo"] }], ["depends[0].shop"]],
      [[{ shop: "test/echo", commands: [7] }], ["depends[0].commands[0]"]],
    ];
    for (const [depends, fields] of cases) {
      const refusals = validateManifest(withDepends(depends), [], SHOPS);
      expectWellFormed(refusals);
      expect(refusals.map((r) => r.split(": ")[0]), JSON.stringify(depends)).toEqual(fields);
    }
  });

  it("accepts none: absent, null, or empty, with or without a store", () => {
    for (const depends of [undefined, null, []]) {
      expect(validateManifest(withDepends(depends))).toEqual([]);
      expect(validateManifest(withDepends(depends), [], SHOPS)).toEqual([]);
    }
  });
});

describe("the town's own shop", () => {
  const HALL_SHOP = { name: "town/hall", commands: ["search", "show", "spec", "validate", "test", "publish", "request", "requests"] };

  it("refuses runtime: town in any manifest, with a line naming it the town's own", () => {
    const refusals = validateManifest(memoryWith((m) => (m.runtime = "town")));
    expect(refusals).toEqual(["runtime: is town, the runtime of the town's own shop and no other; write runtime: subprocess instead (spec §2)"]);
    expectWellFormed(refusals);
  });

  it("refuses a dependency on town/hall naming §8, though the town holds it, and leaves it out of the shops it offers", () => {
    const refusals = validateManifest(memoryWith((m) => (m.depends = [{ shop: "town/hall", commands: ["search"] }])), [], [HALL_SHOP]);
    expect(refusals).toEqual(["depends[0].shop: is town/hall, the town's own shop, which answers agents and never a shop; write a shop other than town/hall instead (spec §8)"]);
    expectWellFormed(refusals);
    const offered = validateManifest(memoryWith((m) => (m.depends = [{ shop: "test/gh", commands: ["list"] }])), [], [HALL_SHOP, { name: "test/echo", commands: ["echo"] }]);
    expect(offered).toEqual(["depends[0].shop: 'test/gh' is not a shop this town holds; write one of (test/echo), or add it with townd admin shop add first, instead (spec §8)"]);
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
