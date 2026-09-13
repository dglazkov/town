// Every sentence the agent can be told about a call that did not simply
// succeed, and nothing else. The gate, the town over HTTP, and the agent's
// binary take their words from here; a test enumerates them. Help and
// notices are rendered from the manifest and the grant, not written here.
//
// This file is part of the agent's binary: it names no shop, command,
// argument, or operator verb.

import type { ConstraintKind } from "./manifest.js";

type Rule = string | number | Array<string | number>;

const quote = (v: string | number) => `'${v}'`;

export const denials = {
  /** Exit 2. A command the grant lacks, and a shop the pass holds no grant for, in the same words. */
  notAvailable: (subject: string) => `error: command '${subject}' is not available to this grant`,

  /** Exit 2. A grant the call found was no longer good at its sixth step, with the clause saying why. */
  notAvailableSince: (subject: string, why: string) => `error: command '${subject}' is not available to this grant: ${why}`,

  /** Exit 2. A value outside one of the grant's constraints. */
  constraint: (arg: string, kind: ConstraintKind, rule: Rule) => {
    const flag = `--${arg}`;
    switch (kind) {
      case "prefix":
        return `error: ${flag} must start with ${quote(String(rule))} under this grant`;
      case "equals":
        return `error: ${flag} must be ${quote(rule as string | number)} under this grant`;
      case "one_of":
        return `error: ${flag} must be one of ${(rule as Array<string | number>).map(quote).join(", ")} under this grant`;
      case "regex":
        return `error: ${flag} must match the pattern ${quote(String(rule))} as a whole under this grant`;
      case "max_length":
        return `error: ${flag} must be at most ${rule} characters under this grant`;
    }
  },

  /** Exit 1. A malformed call: what is wrong, then the usage rendered for the grant. */
  usage: (problems: readonly string[], usageLine: string) => `error: ${problems.join("; ")}\nusage: ${usageLine}`,

  /** Exit 1. One of the words the operator's binary holds, typed to the agent's. */
  noSuchCommand: (word: string) => `error: town has no command '${word}'`,

  /** Exit 3. The token is missing, unknown, revoked, or expired; which one is the operator's to know. */
  invalidPass: () => "error: this pass is not valid: its token is unknown, revoked, or expired",

  /** Exit 1. The shop ran and failed; the last lines of its log follow. */
  shopFailed: (shop: string, command: string, stderrTail: string) =>
    `error: ${shop} ${command} failed${stderrTail ? `\n${stderrTail}` : ""}`,

  /** Exit 1. The shop ran out of time and was stopped. */
  shopTimedOut: (shop: string, command: string, seconds: number) =>
    `error: ${shop} ${command} ran out of time after ${seconds} seconds and was stopped`,

  /** Exit 1. Stdin past the limit is refused whole, since a truncated value is a corrupt one. */
  stdinTooLarge: (bytes: number) => `error: stdin is ${bytes} bytes, over the one megabyte limit`,

  /** Exit 1. A request the town could not parse as a call. */
  badCall: () => "error: the town could not parse this call",

  /** Exit 1. The town failed on its side; the audit has the row. */
  townFailed: () => "error: the town failed on this call",

  /** Exit 3, from the agent's binary. */
  noGrantFile: () =>
    "error: no grant file: this command reads --grant <path>, $TOWN_GRANT, .town/grant here or in a directory above, or ~/.town/grant",

  /** Exit 3, from the agent's binary. */
  badGrantFile: (file: string) => `error: ${file} is not a grant file of the form { "town": <url>, "token": <token> }`,

  /** Exit 1, from the agent's binary. */
  flagNeedsValue: (flag: string) => `error: ${flag} needs a value`,

  /** Exit 1, from the agent's binary, before any request: the town carries text. */
  stdinNotText: () => "error: stdin is not text; the town carries text, so send a shop as a tar of text files",

  /** Exit 1, from the agent's binary. */
  townUnreachable: () => "error: the town did not answer; try again, or tell the person who gave you this grant",
} as const;

export type DenialName = keyof typeof denials;
