// A command's words to canonical arguments, or refusals as data. The
// shop tests use it now; the gate uses it in gate phase 1 to render a
// `usage:` line from the refusals. The rules are spec §4.

import type { Arg, ArgValue, Command, Manifest } from "./manifest.js";

export type ArgValues = Record<string, ArgValue>;

export type ArgRefusalKind =
  | "unknown-command"
  | "missing"
  | "unknown"
  | "stray"
  | "repeated"
  | "no-value"
  | "type"
  | "enum";

export interface ArgRefusal {
  kind: ArgRefusalKind;
  /** The argument's name, or the command's for unknown-command, or the word for stray. */
  subject: string;
  message: string;
}

export type ParsedArgs =
  | { ok: true; command: Command; values: ArgValues }
  | { ok: false; command: Command | null; refusals: ArgRefusal[] };

/**
 * Parses `words`, the arguments typed after `command`, against the
 * manifest. Values come back typed and with defaults filled.
 */
export function parseArgs(manifest: Manifest, command: string, words: readonly string[]): ParsedArgs {
  const cmd = manifest.commands.find((c) => c.name === command);
  if (!cmd) {
    return {
      ok: false,
      command: null,
      refusals: [{ kind: "unknown-command", subject: command, message: `${command || "(nothing)"} is not a command of ${manifest.name}` }],
    };
  }
  const args = cmd.args ?? [];
  const refusals: ArgRefusal[] = [];
  const given = new Map<string, string>();
  const mentioned = new Set<string>();

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (!word.startsWith("--") || word === "--") {
      refusals.push({ kind: "stray", subject: word, message: `${word} is not an argument; arguments are --name value` });
      continue;
    }
    const eq = word.indexOf("=");
    const name = eq === -1 ? word.slice(2) : word.slice(2, eq);
    const arg = args.find((a) => a.name === name);
    if (!arg) {
      refusals.push({ kind: "unknown", subject: name, message: `--${name} is not an argument of ${cmd.name}` });
      // Skip a value that is clearly not a flag, so one mistake is one refusal.
      if (eq === -1 && i + 1 < words.length && !words[i + 1]!.startsWith("--")) i++;
      continue;
    }
    let raw: string | undefined;
    if (eq !== -1) {
      raw = word.slice(eq + 1);
    } else if (arg.type === "bool") {
      const next = words[i + 1];
      if (next === "true" || next === "false") {
        raw = next;
        i++;
      } else {
        raw = "true";
      }
    } else if (i + 1 < words.length) {
      raw = words[++i]!;
    }
    if (mentioned.has(name)) {
      refusals.push({ kind: "repeated", subject: name, message: `--${name} is given more than once` });
      continue;
    }
    if (raw === undefined) {
      mentioned.add(name);
      refusals.push({ kind: "no-value", subject: name, message: `--${name} needs a value` });
      continue;
    }
    mentioned.add(name);
    given.set(name, raw);
  }

  const values: ArgValues = {};
  for (const arg of args) {
    const raw = given.get(arg.name);
    if (raw === undefined) {
      if (mentioned.has(arg.name)) continue;
      if (arg.default !== undefined) values[arg.name] = arg.default;
      else if (arg.required) refusals.push({ kind: "missing", subject: arg.name, message: `--${arg.name} is required` });
      continue;
    }
    const typed = convert(arg, raw);
    if (typed.ok) values[arg.name] = typed.value;
    else refusals.push(typed.refusal);
  }

  return refusals.length ? { ok: false, command: cmd, refusals } : { ok: true, command: cmd, values };
}

function convert(arg: Arg, raw: string): { ok: true; value: ArgValue } | { ok: false; refusal: ArgRefusal } {
  const bad = (kind: ArgRefusalKind, message: string) => ({ ok: false as const, refusal: { kind, subject: arg.name, message } });
  switch (arg.type) {
    case "string":
      return { ok: true, value: raw };
    case "int": {
      const n = Number(raw);
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(n)) return bad("type", `--${arg.name} must be an int, not ${raw}`);
      return { ok: true, value: n };
    }
    case "bool":
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return bad("type", `--${arg.name} must be true or false, not ${raw}`);
    case "enum":
      if (arg.values?.includes(raw)) return { ok: true, value: raw };
      return bad("enum", `--${arg.name} must be one of ${(arg.values ?? []).join(", ")}, not ${raw}`);
  }
}

/**
 * The canonical argv for a call: the command, then `--name value` in
 * manifest order, defaults filled, bools as true or false. Throws when
 * `values` is not what parseArgs would give: an unknown command or
 * argument, a missing required one, or a value of the wrong type.
 */
export function canonicalArgv(manifest: Manifest, command: string, values: ArgValues): string[] {
  const cmd = manifest.commands.find((c) => c.name === command);
  if (!cmd) throw new Error(`${command} is not a command of ${manifest.name}`);
  const args = cmd.args ?? [];
  for (const name of Object.keys(values)) {
    if (!args.some((a) => a.name === name)) throw new Error(`--${name} is not an argument of ${command}`);
  }
  const argv = [command];
  for (const arg of args) {
    const v = Object.hasOwn(values, arg.name) ? values[arg.name] : arg.default;
    if (v === undefined) {
      if (arg.required) throw new Error(`--${arg.name} is required`);
      continue;
    }
    const checked = convert(arg, String(v));
    if (!checked.ok || checked.value !== v) throw new Error(`--${arg.name} has a value of the wrong type`);
    argv.push(`--${arg.name}`, String(v));
  }
  return argv;
}

/**
 * Splits one line into words as a shell would, with single and double
 * quotes and backslash escapes, expanding nothing (spec §6).
 */
export function splitWords(line: string): { ok: true; words: string[] } | { ok: false; error: string } {
  const words: string[] = [];
  let cur = "";
  let inWord = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) return { ok: false, error: "has an unclosed single quote" };
      cur += line.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (ch === '"') {
      i++;
      let closed = false;
      while (i < line.length) {
        const c = line[i]!;
        if (c === '"') {
          closed = true;
          i++;
          break;
        }
        if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\")) {
          cur += line[i + 1];
          i += 2;
        } else {
          cur += c;
          i++;
        }
      }
      if (!closed) return { ok: false, error: "has an unclosed double quote" };
      inWord = true;
    } else if (ch === "\\") {
      if (i + 1 >= line.length) return { ok: false, error: "ends in a backslash" };
      cur += line[i + 1];
      inWord = true;
      i += 2;
    } else if (ch === " " || ch === "\t" || ch === "\r") {
      if (inWord) words.push(cur);
      cur = "";
      inWord = false;
      i++;
    } else {
      cur += ch;
      inWord = true;
      i++;
    }
  }
  if (inWord) words.push(cur);
  return { ok: true, words };
}
