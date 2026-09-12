// The manifest, v0: its types, the YAML parse, and the validator. Every
// refusal is one line, `<field>: <what is wrong>; write <this> instead
// (spec §<n>)`, and §<n> is a numbered section of src/spec.ts.

import { parse as parseYaml } from "yaml";
import { parseArgs, splitWords } from "./args.js";

export type ArgType = "string" | "int" | "bool" | "enum";
export type Effect = "read" | "write" | "destructive";
export type Output = "text" | "json";
export type ConstraintKind = "equals" | "one_of" | "prefix" | "regex" | "max_length";
export type ArgValue = string | number | boolean;

export interface Arg {
  name: string;
  type: ArgType;
  required?: boolean;
  doc?: string;
  default?: ArgValue;
  values?: string[];
  constrainable?: ConstraintKind[];
}

export interface Command {
  name: string;
  summary: string;
  effect: Effect;
  args?: Arg[];
  output: Output;
}

export type Expect = { contains: string } | { equals: string } | { exit: number };

export interface ShopTest {
  name: string;
  run: string;
  expect: Expect;
}

/** A need: a credential type the shop calls through (spec §8). */
export interface Need {
  type: string;
}

export interface Manifest {
  name: string;
  version: string;
  summary: string;
  guidance?: string;
  runtime: "subprocess";
  entry: string;
  credentials?: Need[];
  commands: Command[];
  tests: ShopTest[];
}

export const ARG_TYPES: readonly ArgType[] = ["string", "int", "bool", "enum"];
export const EFFECTS: readonly Effect[] = ["read", "write", "destructive"];
export const OUTPUTS: readonly Output[] = ["text", "json"];
export const CONSTRAINT_KINDS: readonly ConstraintKind[] = [
  "equals",
  "one_of",
  "prefix",
  "regex",
  "max_length",
];

/** Which constraint kinds each argument type can take (spec §5). */
export const KINDS_BY_TYPE: Record<ArgType, readonly ConstraintKind[]> = {
  string: CONSTRAINT_KINDS,
  int: ["equals", "one_of"],
  enum: ["equals", "one_of"],
  bool: [],
};

const TOP_FIELDS = [
  "name",
  "version",
  "summary",
  "guidance",
  "runtime",
  "entry",
  "credentials",
  "depends",
  "commands",
  "tests",
];
const COMMAND_FIELDS = ["name", "summary", "effect", "args", "output"];
const ARG_FIELDS = ["name", "type", "required", "doc", "default", "values", "constrainable"];
const TEST_FIELDS = ["name", "run", "expect"];
const EXPECT_FIELDS = ["contains", "equals", "exit"];
const NEED_FIELDS = ["type"];

const SHOP_NAME = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
const WORD_NAME = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Words the town's own binaries hold: no shop's last segment may be one (spec §2). */
export const RESERVED_SHOP_WORDS: readonly string[] = ["serve", "admin", "spec"];
/** Flags the agent's binary takes wherever they stand: no argument may be named one (spec §4). */
export const RESERVED_ARG_NAMES: readonly string[] = ["json", "grant", "help"];

function refusal(field: string, wrong: string, instead: string, section: number): string {
  return `${field}: ${wrong}; write ${instead} instead (spec §${section})`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isLine(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "" && !v.trim().includes("\n");
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (Array.isArray(v) && v.length === 0);
}

/**
 * Parses manifest YAML and validates it. `manifest` is set only when
 * there are no refusals. `types` is the credential types the town holds;
 * omitted when no store is at hand, and then a need is refused.
 */
export function parseManifest(text: string, types?: readonly string[]): { manifest: Manifest | null; refusals: string[] } {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    const why = (err instanceof Error ? err.message : String(err)).split("\n")[0];
    return {
      manifest: null,
      refusals: [refusal("manifest.yaml", `is not YAML (${why})`, "a YAML mapping of the fields in §2", 2)],
    };
  }
  const refusals = validateManifest(raw, types);
  return { manifest: refusals.length === 0 ? (raw as Manifest) : null, refusals };
}

/**
 * Every way `m` is not a v0 manifest, one line each; empty when it is one.
 * `types` is the credential types the town holds; omitted when no store
 * is at hand, and then a need is refused naming --data.
 */
export function validateManifest(m: unknown, types?: readonly string[]): string[] {
  const out: string[] = [];
  if (!isRecord(m)) {
    return [refusal("manifest.yaml", "is not a mapping", "a YAML mapping of the fields in §2", 2)];
  }

  for (const key of Object.keys(m)) {
    if (!TOP_FIELDS.includes(key)) {
      out.push(refusal(key, "is not a manifest field", `only the fields in §2 (${TOP_FIELDS.filter((f) => f !== "depends").join(", ")})`, 2));
    }
  }

  if (!(typeof m.name === "string" && SHOP_NAME.test(m.name))) {
    out.push(refusal("name", describe(m.name, "a shop name"), "a name like town/memory", 2));
  } else if (RESERVED_SHOP_WORDS.includes(m.name.split("/")[1]!)) {
    out.push(refusal("name", `ends in ${m.name.split("/")[1]}, a word the town's binaries hold`, `a last part other than ${RESERVED_SHOP_WORDS.join(", ")}`, 2));
  }
  if (!(typeof m.version === "string" && SEMVER.test(m.version))) {
    out.push(refusal("version", describe(m.version, "a semver version"), "a version like 0.1.0", 2));
  }
  if (!isLine(m.summary)) {
    out.push(refusal("summary", describe(m.summary, "a one-line summary"), "one line saying what the shop is for", 2));
  }
  if (m.guidance !== undefined && typeof m.guidance !== "string") {
    out.push(refusal("guidance", "is not a string", "text, or leave guidance out", 2));
  }
  if (m.runtime !== "subprocess") {
    out.push(refusal("runtime", describe(m.runtime, "subprocess"), "runtime: subprocess", 2));
  }
  if (!(typeof m.entry === "string" && isInsidePath(m.entry))) {
    out.push(refusal("entry", describe(m.entry, "a relative path inside the shop"), "a path like ./main.mjs", 2));
  }

  validateNeeds(m.credentials, types, out);
  if (!isEmpty(m.depends)) {
    out.push(
      refusal(
        "depends",
        "this town holds no dependencies yet, and project compose brings them",
        "the manifest without depends",
        8,
      ),
    );
  }

  const commandsOk = validateCommands(m.commands, out);
  if (Array.isArray(m.commands)) validateProse(m, out);
  validateTests(m.tests, out, commandsOk ? (m as unknown as Manifest) : null);
  return out;
}

/**
 * A shop's summary and guidance name none of its commands as a whole word,
 * in any case: a grant may hide any command, and help prints the prose
 * whole (spec §2).
 */
function validateProse(m: Record<string, unknown>, out: string[]): void {
  const names = (m.commands as unknown[])
    .map((c) => (isRecord(c) && typeof c.name === "string" && WORD_NAME.test(c.name) ? c.name : null))
    .filter((n): n is string => n !== null);
  for (const field of ["summary", "guidance"] as const) {
    const text = m[field];
    if (typeof text !== "string") continue;
    const named = names.filter((n) => new RegExp(`(?<![A-Za-z0-9_-])${n}(?![A-Za-z0-9_-])`, "i").test(text));
    if (named.length) {
      out.push(
        refusal(
          field,
          `names the command${named.length === 1 ? "" : "s"} ${named.join(", ")}, which a grant may hide`,
          `${field === "summary" ? "a summary" : "guidance"} about the shop that names no command, with a word about one command in its summary or an argument's doc,`,
          2,
        ),
      );
    }
  }
}

/** `credentials`: a list of `{ type }`, one per type, each a type the town holds (spec §8). */
function validateNeeds(needs: unknown, types: readonly string[] | undefined, out: string[]): void {
  if (needs === undefined || needs === null) return;
  if (!Array.isArray(needs)) {
    out.push(refusal("credentials", "is not a list", "a list of needs like - type: github-token, or leave credentials out", 8));
    return;
  }
  const seen = new Set<string>();
  needs.forEach((n, i) => {
    const at = `credentials[${i}]`;
    if (!isRecord(n)) {
      out.push(refusal(at, "is not a mapping", "a need like { type: github-token }", 8));
      return;
    }
    for (const key of Object.keys(n)) {
      if (!NEED_FIELDS.includes(key)) out.push(refusal(`${at}.${key}`, "is not a need field", `only ${NEED_FIELDS.join(", ")}`, 8));
    }
    if (typeof n.type !== "string" || n.type === "") {
      out.push(refusal(`${at}.type`, describe(n.type, "a type name"), "a type like github-token", 8));
      return;
    }
    if (seen.has(n.type)) {
      out.push(refusal(`${at}.type`, `repeats the type ${n.type}`, "each type once", 8));
      return;
    }
    seen.add(n.type);
    if (types === undefined) {
      out.push(refusal(`${at}.type`, `'${n.type}' cannot be checked with no data directory at hand`, "the verb again with --data <dir>, so the town's types are read,", 8));
    } else if (!types.includes(n.type)) {
      out.push(refusal(`${at}.type`, `'${n.type}' is not a type this town holds`, `one of (${types.join(", ")})`, 8));
    }
  });
}

function describe(v: unknown, what: string): string {
  if (v === undefined) return "is missing";
  return `is not ${what}`;
}

function isInsidePath(p: string): boolean {
  if (p === "" || p.startsWith("/") || p.includes("\\")) return false;
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  return parts.length > 0 && !parts.includes("..");
}

function validateCommands(commands: unknown, out: string[]): boolean {
  const before = out.length;
  if (!Array.isArray(commands) || commands.length === 0) {
    out.push(refusal("commands", describe(commands, "a non-empty list"), "a list of commands as in §3", 3));
    return false;
  }
  const seen = new Set<string>();
  commands.forEach((c, i) => {
    const at = `commands[${i}]`;
    if (!isRecord(c)) {
      out.push(refusal(at, "is not a mapping", "a command with name, summary, effect, args, output", 3));
      return;
    }
    for (const key of Object.keys(c)) {
      if (!COMMAND_FIELDS.includes(key)) {
        out.push(refusal(`${at}.${key}`, "is not a command field", `only ${COMMAND_FIELDS.join(", ")}`, 3));
      }
    }
    if (!(typeof c.name === "string" && WORD_NAME.test(c.name))) {
      out.push(refusal(`${at}.name`, describe(c.name, "a command name"), "a name like remember", 3));
    } else if (seen.has(c.name)) {
      out.push(refusal(`${at}.name`, `repeats the command ${c.name}`, "a name no other command has", 3));
    } else {
      seen.add(c.name);
    }
    if (!isLine(c.summary)) {
      out.push(refusal(`${at}.summary`, describe(c.summary, "a one-line summary"), "one line saying what it does", 3));
    }
    if (!EFFECTS.includes(c.effect as Effect)) {
      out.push(refusal(`${at}.effect`, describe(c.effect, "an effect"), `one of ${EFFECTS.join(", ")}`, 3));
    }
    if (!OUTPUTS.includes(c.output as Output)) {
      out.push(refusal(`${at}.output`, describe(c.output, "an output"), `one of ${OUTPUTS.join(", ")}`, 3));
    }
    if (c.args !== undefined && c.args !== null) {
      if (!Array.isArray(c.args)) {
        out.push(refusal(`${at}.args`, "is not a list", "a list of arguments as in §4, or leave args out", 4));
      } else {
        validateArgs(c.args, `${at}.args`, out);
      }
    }
  });
  return out.length === before;
}

function validateArgs(args: unknown[], at0: string, out: string[]): void {
  const seen = new Set<string>();
  args.forEach((a, j) => {
    const at = `${at0}[${j}]`;
    if (!isRecord(a)) {
      out.push(refusal(at, "is not a mapping", "an argument like { name: key, type: string }", 4));
      return;
    }
    for (const key of Object.keys(a)) {
      if (!ARG_FIELDS.includes(key)) {
        out.push(refusal(`${at}.${key}`, "is not an argument field", `only ${ARG_FIELDS.join(", ")}`, 4));
      }
    }
    if (!(typeof a.name === "string" && WORD_NAME.test(a.name))) {
      out.push(refusal(`${at}.name`, describe(a.name, "an argument name"), "a name like key", 4));
    } else if (RESERVED_ARG_NAMES.includes(a.name)) {
      out.push(refusal(`${at}.name`, `is ${a.name}, a flag the town command takes for itself`, `a name other than ${RESERVED_ARG_NAMES.join(", ")}`, 4));
    } else if (seen.has(a.name)) {
      out.push(refusal(`${at}.name`, `repeats the argument ${a.name}`, "a name no other argument of this command has", 4));
    } else {
      seen.add(a.name);
    }
    const typeOk = ARG_TYPES.includes(a.type as ArgType);
    if (!typeOk) {
      out.push(refusal(`${at}.type`, describe(a.type, "a type"), `one of ${ARG_TYPES.join(", ")}`, 4));
    }
    if (a.required !== undefined && typeof a.required !== "boolean") {
      out.push(refusal(`${at}.required`, "is not a bool", "required: true, or leave it out", 4));
    }
    if (a.doc !== undefined && !isLine(a.doc)) {
      out.push(refusal(`${at}.doc`, "is not a one-line string", "one line of doc, or leave it out", 4));
    }
    if (a.type === "enum") {
      if (!Array.isArray(a.values) || a.values.length === 0 || !a.values.every((v) => typeof v === "string")) {
        out.push(refusal(`${at}.values`, describe(a.values, "a non-empty list of strings"), "values: [one, two]", 4));
      }
    } else if (a.values !== undefined) {
      out.push(refusal(`${at}.values`, "is only for type enum", "type: enum, or leave values out", 4));
    }
    if (a.default !== undefined) {
      if (a.required === true) {
        out.push(refusal(`${at}.default`, "is given with required: true", "either a default or required: true", 4));
      }
      if (typeOk && !defaultFits(a as unknown as Arg)) {
        out.push(refusal(`${at}.default`, `is not a value of type ${String(a.type)}`, "a default of the argument's type", 4));
      }
    }
    if (a.constrainable !== undefined) {
      if (!Array.isArray(a.constrainable)) {
        out.push(refusal(`${at}.constrainable`, "is not a list", "a list like [prefix, regex], or leave it out", 5));
      } else {
        const allowed = typeOk ? KINDS_BY_TYPE[a.type as ArgType] : CONSTRAINT_KINDS;
        for (const k of a.constrainable) {
          if (!CONSTRAINT_KINDS.includes(k as ConstraintKind)) {
            out.push(
              refusal(`${at}.constrainable`, `names ${String(k)}, not a constraint kind`, `kinds from ${CONSTRAINT_KINDS.join(", ")}`, 5),
            );
          } else if (!allowed.includes(k as ConstraintKind)) {
            out.push(
              refusal(
                `${at}.constrainable`,
                `names ${String(k)}, which type ${String(a.type)} does not take`,
                allowed.length ? `kinds from ${allowed.join(", ")}` : "no constrainable for a bool",
                5,
              ),
            );
          }
        }
      }
    }
  });
}

function defaultFits(a: Arg): boolean {
  const d = a.default;
  switch (a.type) {
    case "string":
      return typeof d === "string";
    case "int":
      return typeof d === "number" && Number.isSafeInteger(d);
    case "bool":
      return typeof d === "boolean";
    case "enum":
      return typeof d === "string" && Array.isArray(a.values) && a.values.includes(d);
  }
}

function validateTests(tests: unknown, out: string[], manifest: Manifest | null): void {
  if (!Array.isArray(tests) || tests.length === 0) {
    out.push(refusal("tests", describe(tests, "a non-empty list"), "a list of tests as in §6", 6));
    return;
  }
  const seen = new Set<string>();
  tests.forEach((t, i) => {
    const at = `tests[${i}]`;
    if (!isRecord(t)) {
      out.push(refusal(at, "is not a mapping", "a test with name, run, expect", 6));
      return;
    }
    for (const key of Object.keys(t)) {
      if (!TEST_FIELDS.includes(key)) {
        out.push(refusal(`${at}.${key}`, "is not a test field", `only ${TEST_FIELDS.join(", ")}`, 6));
      }
    }
    if (!isLine(t.name)) {
      out.push(refusal(`${at}.name`, describe(t.name, "a one-line name"), "a name like roundtrip", 6));
    } else if (seen.has(t.name)) {
      out.push(refusal(`${at}.name`, `repeats the test ${t.name}`, "a name no other test has", 6));
    } else {
      seen.add(t.name);
    }
    validateExpect(t.expect, `${at}.expect`, out);
    if (typeof t.run !== "string" || t.run.trim() === "") {
      out.push(refusal(`${at}.run`, describe(t.run, "lines of calls"), "one call per line, like remember --key t/a --value hello", 6));
      return;
    }
    t.run.split("\n").forEach((line, n) => {
      if (line.trim() === "") return;
      const where = `${at}.run line ${n + 1}`;
      const split = splitWords(line);
      if (!split.ok) {
        out.push(refusal(where, split.error, "words quoted as a shell would, nothing expanded", 6));
        return;
      }
      if (!manifest) return;
      const [command, ...words] = split.words;
      const parsed = parseArgs(manifest, command ?? "", words);
      if (!parsed.ok) {
        for (const r of parsed.refusals) {
          out.push(refusal(where, r.message, "a call the manifest's commands and arguments accept", 4));
        }
      }
    });
  });
}

function validateExpect(e: unknown, at: string, out: string[]): void {
  const instead = "exactly one of { contains: <string> }, { equals: <string> }, { exit: <int> }";
  if (!isRecord(e)) {
    out.push(refusal(at, describe(e, "a mapping"), instead, 6));
    return;
  }
  const keys = Object.keys(e);
  if (keys.length !== 1 || !EXPECT_FIELDS.includes(keys[0]!)) {
    out.push(refusal(at, `has ${keys.length ? keys.join(", ") : "nothing"}`, instead, 6));
    return;
  }
  const v = e[keys[0]!];
  if (keys[0] === "exit" ? !(typeof v === "number" && Number.isInteger(v)) : typeof v !== "string") {
    out.push(refusal(`${at}.${keys[0]}`, "is the wrong type", instead, 6));
  }
}

/** The command named `name`, or undefined. */
export function findCommand(manifest: Manifest, name: string): Command | undefined {
  return manifest.commands.find((c) => c.name === name);
}
