// Constraints: the five built-in kinds, one function each, and the check
// that a grant's shape fits its shop's manifest. A grant carries them as
// { "<command>.<arg>": { "<kind>": <value> } }; the gate checks them
// before a process exists, and `grant new` refuses a shape the manifest
// does not allow, so nothing is refused at call time that could have
// been refused when the grant was made.

import { CONSTRAINT_KINDS, type Arg, type ArgValue, type ConstraintKind, type Manifest } from "./manifest.js";

export type ConstraintValue = string | number | Array<string | number>;
export type Constraints = Record<string, Partial<Record<ConstraintKind, ConstraintValue>>>;

/** The value is exactly `rule`. */
export function equals(value: ArgValue, rule: ConstraintValue): boolean {
  return (typeof rule === "string" || typeof rule === "number") && value === rule;
}

/** The value is one of `rule`. */
export function oneOf(value: ArgValue, rule: ConstraintValue): boolean {
  return Array.isArray(rule) && rule.some((r) => r === value);
}

/** The value starts with `rule`. */
export function prefix(value: ArgValue, rule: ConstraintValue): boolean {
  return typeof value === "string" && typeof rule === "string" && value.startsWith(rule);
}

/** The whole value matches the JavaScript pattern `rule`, anchored at both ends. */
export function regex(value: ArgValue, rule: ConstraintValue): boolean {
  return typeof value === "string" && typeof rule === "string" && anchored(rule).test(value);
}

/** The value is at most `rule` characters long. */
export function maxLength(value: ArgValue, rule: ConstraintValue): boolean {
  return typeof value === "string" && typeof rule === "number" && [...value].length <= rule;
}

export const CHECKS: Record<ConstraintKind, (value: ArgValue, rule: ConstraintValue) => boolean> = {
  equals,
  one_of: oneOf,
  prefix,
  regex,
  max_length: maxLength,
};

function anchored(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`);
}

/** Whether `value` passes one rule. An argument the call left out passes none: a constraint cannot be skipped by omission. */
export function passes(kind: ConstraintKind, rule: ConstraintValue, value: ArgValue | undefined): boolean {
  return value !== undefined && CHECKS[kind](value, rule);
}

export interface ConstraintMiss {
  arg: string;
  kind: ConstraintKind;
  rule: ConstraintValue;
}

/** The first of the grant's constraints on `command` that `values` miss, in the order the grant lists them; null when all pass. */
export function firstMiss(constraints: Constraints, command: string, values: Record<string, ArgValue>): ConstraintMiss | null {
  for (const [target, rules] of Object.entries(constraints)) {
    const [cmd, arg] = splitTarget(target);
    if (cmd !== command) continue;
    for (const [kind, rule] of Object.entries(rules) as Array<[ConstraintKind, ConstraintValue]>) {
      if (!passes(kind, rule, values[arg])) return { arg, kind, rule };
    }
  }
  return null;
}

export function splitTarget(target: string): [string, string] {
  const dot = target.indexOf(".");
  return dot === -1 ? [target, ""] : [target.slice(0, dot), target.slice(dot + 1)];
}

/**
 * Turns the admin's `--constraint '<command>.<arg> <kind> <value>'` lines
 * into a grant's constraints, typed for the argument: `one_of` splits on
 * commas, `max_length` is an int, an int argument's `equals` and
 * `one_of` are ints. Shape is checked by checkGrantShape, not here.
 */
export function parseConstraintLines(manifest: Manifest, lines: readonly string[]): { constraints: Constraints; refusals: string[] } {
  const constraints: Constraints = {};
  const refusals: string[] = [];
  for (const line of lines) {
    const m = /^\s*([^\s.]+)\.(\S+)\s+(\S+)\s(.*)$/.exec(line);
    if (!m || m[4] === "") {
      refusals.push(`--constraint '${line}': is not '<command>.<arg> <kind> <value>'; write one like 'recall.key prefix notes/'`);
      continue;
    }
    const [, command, argName, kind, raw] = m as unknown as [string, string, string, string, string];
    const target = `${command}.${argName}`;
    const arg = manifest.commands.find((c) => c.name === command)?.args?.find((a) => a.name === argName);
    let value: ConstraintValue;
    switch (kind) {
      case "one_of":
        value = raw.split(",").map((s) => s.trim()).filter((s) => s !== "").map((s) => typed(arg, s));
        break;
      case "max_length":
        value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
        break;
      case "equals":
        value = typed(arg, raw);
        break;
      default:
        value = raw;
    }
    const rules = (constraints[target] ??= {});
    if (Object.hasOwn(rules, kind)) {
      refusals.push(`--constraint '${line}': ${target} already has a ${kind} rule; write one ${kind} per argument`);
      continue;
    }
    (rules as Record<string, ConstraintValue>)[kind] = value;
  }
  return { constraints, refusals };
}

function typed(arg: Arg | undefined, raw: string): string | number {
  return arg?.type === "int" && /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

/**
 * Every way `grant` does not fit `manifest`, one line each saying what to
 * write instead; empty when it fits. Refused: no commands, a command the
 * shop lacks, a constraint on a command the grant does not hold, on an
 * argument the command lacks, of a kind the argument is not
 * `constrainable` for, or with a value of the wrong shape.
 */
export function checkGrantShape(manifest: Manifest, grant: { commands: readonly string[]; constraints: Constraints }): string[] {
  const out: string[] = [];
  const names = manifest.commands.map((c) => c.name);
  if (grant.commands.length === 0) out.push(`--commands: names no command; write some of ${names.join(",")}, or leave it out for all`);
  for (const c of grant.commands) {
    if (!names.includes(c)) out.push(`--commands: ${c} is not a command of ${manifest.name}; write some of ${names.join(",")}`);
  }
  for (const [target, rules] of Object.entries(grant.constraints)) {
    const [command, argName] = splitTarget(target);
    const cmd = manifest.commands.find((c) => c.name === command);
    if (!cmd) {
      out.push(`--constraint ${target}: ${command} is not a command of ${manifest.name}; write one of ${names.join(", ")}`);
      continue;
    }
    if (!grant.commands.includes(command)) {
      out.push(`--constraint ${target}: ${command} is not in this grant's commands; add it to --commands or drop the constraint`);
      continue;
    }
    const arg = cmd.args?.find((a) => a.name === argName);
    if (!arg) {
      const argNames = (cmd.args ?? []).map((a) => a.name);
      out.push(`--constraint ${target}: ${argName} is not an argument of ${command}; write ${argNames.length ? `one of ${argNames.join(", ")}` : `no constraint, since ${command} takes no arguments`}`);
      continue;
    }
    for (const [kind, rule] of Object.entries(rules) as Array<[string, ConstraintValue]>) {
      const allowed = arg.constrainable ?? [];
      if (!CONSTRAINT_KINDS.includes(kind as ConstraintKind)) {
        out.push(`--constraint ${target}: ${kind} is not a constraint kind; write one of ${CONSTRAINT_KINDS.join(", ")}`);
      } else if (!allowed.includes(kind as ConstraintKind)) {
        out.push(
          `--constraint ${target}: ${manifest.name} does not mark ${target} constrainable by ${kind}; write ${allowed.length ? `one of ${allowed.join(", ")}` : "no constraint on it"}`,
        );
      } else {
        const why = shapeProblem(arg, kind as ConstraintKind, rule);
        if (why) out.push(`--constraint ${target}: ${why}`);
      }
    }
  }
  return out;
}

function shapeProblem(arg: Arg, kind: ConstraintKind, rule: ConstraintValue): string | null {
  const scalar = (v: unknown) => (arg.type === "int" ? typeof v === "number" && Number.isSafeInteger(v) : typeof v === "string");
  const typeWord = arg.type === "int" ? "an int" : "a string";
  switch (kind) {
    case "equals":
      return scalar(rule) ? null : `equals takes ${typeWord}; write the one value --${arg.name} must be`;
    case "one_of":
      return Array.isArray(rule) && rule.length > 0 && rule.every(scalar)
        ? null
        : `one_of takes values of ${typeWord} separated by commas; write them like a,b,c`;
    case "prefix":
      return typeof rule === "string" && rule !== "" ? null : "prefix takes a string; write the start every value must have";
    case "max_length":
      return typeof rule === "number" && Number.isSafeInteger(rule) && rule >= 0 ? null : "max_length takes a whole number; write one like 64";
    case "regex":
      if (typeof rule !== "string") return "regex takes a JavaScript pattern; write one like [a-z/]+";
      try {
        anchored(rule);
        return null;
      } catch (err) {
        return `regex ${rule} is not a JavaScript pattern (${(err as Error).message}); write one like [a-z/]+`;
      }
  }
}
