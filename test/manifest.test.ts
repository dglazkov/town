// ring: checkout
// Manifest v0: the memory manifest parses, and every refusal names its
// field, what is wrong, what to write instead, and a real spec section.
// Consent phase 0: a need that defines its type, every shape and each
// refusal citing §8, a definition matching and differing from a held and a
// proposed type, a registration refused naming its key, guidance without
// a definition, over its length, or naming a host the type does not send
// to, an oauth definition shape-checked and then refused, and the spec's
// §8 saying so within its line count. Box phase 0: `runtime: worker`, the
// four shops' runtime, validated, and any other word refused naming both
// runtimes; §7's paragraph for a worker shop and its line for the box.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { parseManifest, validateManifest, type TownType } from "../src/manifest.js";
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
    expect(parseManifest(MEMORY.replace("runtime: worker", "runtime: wasi")).manifest).toBeNull();
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
    expect(refusals).toEqual(["credentials[0].type: 'github-tokens' is not a type this town holds; write one of (github-token, internal), or an origin and a header beside it to propose one, instead (spec §8)"]);
  });

  it("writes the design's line for one type held", () => {
    expect(validateManifest(withNeeds([{ type: "github-tokens" }]), TYPES)).toEqual([
      "credentials[0].type: 'github-tokens' is not a type this town holds; write one of (github-token), or an origin and a header beside it to propose one, instead (spec §8)",
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

describe("needs that define a type", () => {
  const GITHUB: TownType = { name: "github-token", kind: "token", state: "held", origin: "https://api.github.com", header: "Authorization: Bearer {token}", oauth: null };
  const PROPOSED: TownType = { name: "figma", kind: "token", state: "proposed", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", oauth: null };
  const GUIDANCE = "Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.";
  const FIGMA = { type: "figma", origin: "https://api.figma.com", header: "X-Figma-Token: {token}", guidance: GUIDANCE };
  const OAUTH = { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/documents.readonly"] };
  const withNeeds = (credentials: unknown) => memoryWith((m) => (m.credentials = credentials));
  /** Each refusal ends citing a section the spec has. */
  const cites8 = (refusals: string[]) => {
    for (const r of refusals) expect(r, r).toMatch(/ \(spec §8\)$/);
  };

  it("accepts every need shape: a held type named, a held or proposed type defined as the town holds it, and a type the town lacks proposed, with or without guidance", () => {
    for (const [town, needs] of [
      [[GITHUB], [{ type: "github-token" }]],
      [[GITHUB], [{ type: "github-token", origin: GITHUB.origin, header: GITHUB.header }]],
      [[GITHUB], [{ type: "github-token" }, FIGMA]],
      [[GITHUB], [{ type: "figma", origin: FIGMA.origin, header: FIGMA.header }]],
      [[GITHUB, PROPOSED], [{ type: "figma" }]],
      [[GITHUB, PROPOSED], [FIGMA]],
      [[GITHUB], [{ ...FIGMA, guidance: "Make one at https://api.figma.com/settings, with file_content:read.\n" }]],
    ] as Array<[TownType[], unknown[]]>) {
      expect(validateManifest(withNeeds(needs), town), JSON.stringify(needs)).toEqual([]);
    }
    const { manifest } = parseManifest(`${MEMORY}credentials:\n  - type: figma\n    origin: https://api.figma.com\n    header: "X-Figma-Token: {token}"\n    guidance: |\n      ${GUIDANCE}\n`, [GITHUB]);
    expect(manifest?.credentials).toEqual([{ ...FIGMA, guidance: `${GUIDANCE}\n` }]);
  });

  it("refuses a definition differing from a held type, or a proposed one, in the design's words, naming what the town holds", () => {
    const moved = validateManifest(withNeeds([{ type: "github-token", origin: "https://api.figma.com", header: GITHUB.header }]), [GITHUB]);
    expect(moved).toEqual(["credentials[0]: github-token is a type this town holds, at https://api.github.com in Authorization; leave the definition out, or write that (spec §8)"]);
    const v2 = validateManifest(withNeeds([{ type: "github-token" }, { ...FIGMA, origin: "https://api.figma.com/v2" }]), [GITHUB, PROPOSED]);
    expect(v2).toEqual(["credentials[1]: figma is a type this town holds, at https://api.figma.com in X-Figma-Token; leave the definition out, or write that (spec §8)"]);
    const header = validateManifest(withNeeds([{ ...FIGMA, header: "Authorization: Bearer {token}" }]), [PROPOSED]);
    expect(header).toEqual(["credentials[0]: figma is a type this town holds, at https://api.figma.com in X-Figma-Token; leave the definition out, or write that (spec §8)"]);
  });

  it("refuses a type the town lacks with no definition, naming the ones it holds and how to propose one, and a definition with no store at hand naming --data", () => {
    const lacks = validateManifest(withNeeds([{ type: "figma" }]), [GITHUB]);
    expectWellFormed(lacks);
    expect(lacks).toEqual(["credentials[0].type: 'figma' is not a type this town holds; write one of (github-token), or an origin and a header beside it to propose one, instead (spec §8)"]);
    const nowhere = validateManifest(withNeeds([FIGMA]));
    expectWellFormed(nowhere);
    expect(nowhere).toEqual(["credentials[0].type: 'figma' cannot be checked with no data directory at hand; write the verb again with --data <dir>, so the town's types are read, instead (spec §8)"]);
  });

  // Each case: the need, and the one field its refusal names; every refusal cites §8.
  const shapes: Array<[string, unknown, string]> = [
    ["origin without a header", { type: "figma", origin: FIGMA.origin }, "credentials[0].header"],
    ["a header without an origin", { type: "figma", header: FIGMA.header }, "credentials[0].origin"],
    ["an origin with a query", { ...FIGMA, origin: "https://api.figma.com/?x=1" }, "credentials[0].origin"],
    ["an origin with userinfo", { ...FIGMA, origin: "https://me:pw@api.figma.com" }, "credentials[0].origin"],
    ["an origin that is not http", { ...FIGMA, origin: "ftp://api.figma.com" }, "credentials[0].origin"],
    ["a header with no {token}", { ...FIGMA, header: "X-Figma-Token: abc" }, "credentials[0].header"],
    ["a type that is not a name", { ...FIGMA, type: "Figma" }, "credentials[0].type"],
    ["a key that is not a need's", { ...FIGMA, scopes: ["file_content:read"] }, "credentials[0].scopes"],
    ["a registration beside the definition", { ...FIGMA, client_secret: "s3cret" }, "credentials[0].client_secret"],
    ["a registration under oauth", { ...FIGMA, oauth: { ...OAUTH, client_id: "123.apps" } }, "credentials[0].oauth.client_id"],
    ["a redirect under oauth", { ...FIGMA, oauth: { ...OAUTH, redirect_uri: "http://127.0.0.1/" } }, "credentials[0].oauth.redirect_uri"],
    ["oauth with no origin and header", { type: "google-oauth", oauth: OAUTH }, "credentials[0].oauth"],
    ["oauth that is not a mapping", { ...FIGMA, oauth: "google" }, "credentials[0].oauth"],
    ["an authorize endpoint on http", { ...FIGMA, oauth: { ...OAUTH, authorize: "http://accounts.google.com/auth" } }, "credentials[0].oauth.authorize"],
    ["a token endpoint missing", { ...FIGMA, oauth: { authorize: OAUTH.authorize, scopes: OAUTH.scopes } }, "credentials[0].oauth.token"],
    ["scopes empty", { ...FIGMA, oauth: { ...OAUTH, scopes: [] } }, "credentials[0].oauth.scopes"],
    ["a key that is not oauth's", { ...FIGMA, oauth: { ...OAUTH, audience: "x" } }, "credentials[0].oauth.audience"],
    ["guidance with no definition", { type: "github-token", guidance: "Make a classic token." }, "credentials[0].guidance"],
    ["guidance over six hundred characters", { ...FIGMA, guidance: "Make a token. ".repeat(43) }, "credentials[0].guidance"],
    ["guidance of two paragraphs", { ...FIGMA, guidance: "Make a token.\n\nThen paste it.\n" }, "credentials[0].guidance"],
    ["guidance that is not text", { ...FIGMA, guidance: ["Make a token."] }, "credentials[0].guidance"],
  ];

  it.each(shapes)("refuses %s, naming the field, citing §8", (_label, need, field) => {
    const refusals = validateManifest(withNeeds([need]), [GITHUB]);
    cites8(refusals);
    expect(refusals.map((r) => r.split(": ")[0]), refusals.join("\n")).toEqual([field]);
  });

  it("refuses a registration naming the key and saying it is the operator's", () => {
    const [line] = validateManifest(withNeeds([{ ...FIGMA, oauth: { ...OAUTH, client_id: "123.apps" } }]), [GITHUB]);
    expect(line).toBe("credentials[0].oauth.client_id: is a registration, which is the operator's and never a manifest's; write authorize, token, and scopes alone, and the operator gives the town its client, instead (spec §8)");
  });

  it("refuses guidance at six hundred and one characters and takes it at six hundred", () => {
    const at = (n: number) => validateManifest(withNeeds([{ ...FIGMA, guidance: "x".repeat(n) }]), [GITHUB]);
    expect(at(600)).toEqual([]);
    expect(at(601)).toEqual(["credentials[0].guidance: is 601 characters, over 600; write one paragraph of at most 600 characters instead (spec §8)"]);
  });

  it("refuses guidance naming a host the type does not send to, naming the host and the rule, and takes the origin's own host", () => {
    const elsewhere = validateManifest(withNeeds([{ ...FIGMA, guidance: "Make a token in Figma, then paste it at https://paste.example.com/figma so the shop can read it." }]), [GITHUB]);
    expect(elsewhere).toEqual(["credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)"]);
    expect(validateManifest(withNeeds([{ ...FIGMA, guidance: "Paste it at HTTPS://API.FIGMA.COM/v1/me to check it." }]), [GITHUB])).toEqual([]);
    // Compared exactly: www.figma.com is not api.figma.com.
    expect(validateManifest(withNeeds([{ ...FIGMA, guidance: "See www.figma.com, Settings > Security." }]), [GITHUB])).toEqual([
      "credentials[0].guidance: names www.figma.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)",
    ]);
  });

  it("refuses a host written bare as a URL is, takes the origin's own host bare, and takes a file's name", () => {
    const guided = (guidance: string, need: object = FIGMA) => validateManifest(withNeeds([{ ...need, guidance }]), [GITHUB]);
    expect(guided("Make a token in Figma, then paste it at paste.example.com so the shop can read it.")).toEqual([
      "credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)",
    ]);
    expect(guided("Email the token to someone@Paste.Example.com.")).toEqual([
      "credentials[0].guidance: names paste.example.com, which is not where this type sends; say where the secret is made, not where to send it (spec §8)",
    ]);
    expect(guided("It is sent to api.figma.com alone; make it at Figma > Settings > Security.")).toEqual([]);
    expect(guided("Make a token at Figma > Settings > Security; main.mjs reads it through the town, as Node.js does, never client_secret.json, e.g. not v1.2.3.")).toEqual([]);
    // The oauth endpoints' hosts count as the type's, bare too.
    const oauth = { type: "google-oauth", origin: "https://docs.googleapis.com", header: "Authorization: Bearer {token}", oauth: OAUTH };
    expect(guided("Consent happens at accounts.google.com, for docs.googleapis.com.", oauth)).toEqual([]);
    expect(guided("Make the client at console.cloud.google.com.", oauth).map((r) => r.split(": ")[0])).toEqual(["credentials[0].guidance"]);
  });

  it("takes an oauth definition since consent phase 1, its endpoints https: or http: on loopback, and matches a held oauth type field for field", () => {
    const GDOCS = { type: "google-oauth", origin: "https://docs.googleapis.com", header: "Authorization: Bearer {token}", oauth: OAUTH, guidance: "In the Google Cloud console, enable the Docs API and make a Desktop client; consent is at https://accounts.google.com." };
    expect(validateManifest(withNeeds([GDOCS]), [GITHUB])).toEqual([]);
    const loopback = { ...GDOCS, origin: "http://127.0.0.1:9", oauth: { authorize: "http://127.0.0.1:8/authorize", token: "http://localhost:8/token", scopes: ["s"] }, guidance: "Consent at the fake." };
    expect(validateManifest(withNeeds([loopback]), [GITHUB])).toEqual([]);
    expect(validateManifest(withNeeds([{ ...loopback, oauth: { ...loopback.oauth, token: "http://fake.example.test/token" } }]), [GITHUB]).map((r) => r.split(": ")[0])).toEqual(["credentials[0].oauth.token"]);
    // Held: the same endpoints in another key order meet it; other scopes are a differing definition.
    const HELD: TownType = { name: "google-oauth", kind: "oauth", state: "held", origin: GDOCS.origin, header: GDOCS.header, oauth: OAUTH };
    expect(validateManifest(withNeeds([{ ...GDOCS, oauth: { scopes: OAUTH.scopes, token: OAUTH.token, authorize: OAUTH.authorize } }]), [GITHUB, HELD])).toEqual([]);
    expect(validateManifest(withNeeds([{ ...GDOCS, oauth: { ...OAUTH, scopes: ["https://www.googleapis.com/auth/documents"] } }]), [GITHUB, HELD])).toEqual([
      "credentials[0]: google-oauth is a type this town holds, at https://docs.googleapis.com in Authorization; leave the definition out, or write that (spec §8)",
    ]);
    // A shape refusal comes first, alone.
    expect(validateManifest(withNeeds([{ type: "google-oauth", origin: "https://docs.googleapis.com", header: "Authorization: Bearer {token}", oauth: { ...OAUTH, scopes: "documents" } }]), [GITHUB]).map((r) => r.split(": ")[0])).toEqual(["credentials[0].oauth.scopes"]);
  });

  it("says the need's definition in §8 of the spec, and names no host in its example that the type does not send to", () => {
    const section = SPEC.split("## 8. ")[1]!.split("## 9. ")[0]!;
    for (const word of ["origin", "header", "guidance", "oauth", "authorize", "scopes", "a proposal", "a registration is the operator's", "600", "names no host, bare or in a URL, the type does not send to", "refreshes an OAuth type's token first"]) expect(section, word).toContain(word);
    expect(SPEC.split("\n").length).toBeLessThan(300);
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

describe("the runtime", () => {
  it("is worker in the four shops, and a worker shop validates as a subprocess shop does", () => {
    for (const shop of ["memory", "github", "watch", "gdocs"]) {
      expect(parseYaml(readFileSync(path.resolve(import.meta.dirname, `../shops/${shop}/manifest.yaml`), "utf8")).runtime, shop).toBe("worker");
    }
    expect(validateManifest(memoryWith((m) => (m.runtime = "worker")))).toEqual([]);
    expect(validateManifest(memoryWith((m) => (m.runtime = "subprocess")))).toEqual([]);
    expect(parseManifest(MEMORY).manifest?.runtime).toBe("worker");
  });

  it("refuses runtime: box, or any other word, naming subprocess and worker", () => {
    const refusals = validateManifest(memoryWith((m) => (m.runtime = "box")));
    expect(refusals).toEqual(["runtime: is not subprocess or worker; write runtime: worker or runtime: subprocess instead (spec §2)"]);
    expectWellFormed(refusals);
    expect(validateManifest(memoryWith((m) => delete m.runtime))).toEqual(["runtime: is missing; write runtime: worker or runtime: subprocess instead (spec §2)"]);
  });

  it("is said in §2 and §7: the program as a function, what the top level may not do, what is the same, and the box's PATH", () => {
    const two = SPEC.split("## 2. ")[1]!.split("## 3. ")[0]!;
    expect(two).toMatch(/runtime: worker\n\s+worker, the program a function the entry exports; or subprocess,/);
    const seven = SPEC.split("## 7. ")[1]!.split("## 8. ")[0]!;
    const flat = seven.replace(/\s+/g, " ");
    expect(flat).toContain("runtime: worker is this contract with the program a function: the entry exports default async function main(), called once per call");
    expect(flat).toContain("Outside main, only imports and definitions: no await, I/O, or timers.");
    expect(flat).toContain("The rest is the same on every box.");
    expect(seven).toContain("On the box there is none: post to the town in TOWN_GRANT.");
    expect(SPEC.split("\n").length).toBeLessThan(300);
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
