// Help, rendered on the server for the calling pass. `town --help` lists
// the pass's grants; `town <shop> --help` renders one shop's manifest
// through one grant. Both read only what the grant allows: a command the
// grant lacks is never named, and neither is a constraint it does not
// hold. The same grant decides, in the gate, whether a call runs.

import type { Constraints, ConstraintValue } from "./constraints.js";
import { splitTarget } from "./constraints.js";
import type { Arg, Command, ConstraintKind, Manifest } from "./manifest.js";
import { isoTime } from "./notices.js";
import type { Grant, Pass, Store } from "./store.js";

/** What help needs of a grant: its commands, its constraints, the pass's label, and when it ends. */
export interface GrantView {
  commands: readonly string[];
  constraints: Constraints;
  label: string;
  expiresAt: number | null;
}

/** The commands `grant` allows at `manifest`, in manifest order. */
export function allowedCommands(manifest: Manifest, grant: { commands: readonly string[] }): Command[] {
  return manifest.commands.filter((c) => grant.commands.includes(c.name));
}

/** The name an agent types for `shop`: its last segment when no other grant of the pass shares it, else the full name. */
export function typedName(shop: string, grantedShops: readonly string[]): string {
  const last = shop.split("/").pop()!;
  return grantedShops.filter((s) => s.split("/").pop() === last).length === 1 ? last : shop;
}

/**
 * `town --help` for `pass` at `now`: one line per live grant, and one line
 * saying where to look next. A grant whose credential was removed, or whose
 * shop gained a need it does not meet, is not live and not listed; help
 * never says why, nor anything about credentials.
 */
export function helpForPass(store: Store, pass: Pass, now = Date.now()): string {
  const rows: Array<[string, string, string]> = [];
  const held: Array<{ grant: Grant; manifest: Manifest }> = [];
  for (const grant of store.grantsForPass(pass.id, now)) {
    const shop = store.getShop(grant.shop);
    if (shop) held.push({ grant, manifest: shop.manifest });
  }
  if (held.length === 0) return "This pass holds no grants.\n";
  for (const { grant, manifest } of held) {
    const commands = allowedCommands(manifest, grant).map((c) => c.name);
    rows.push([manifest.name, manifest.summary, `[${commands.join(", ")}]`]);
  }
  const width = Math.max(...rows.map((r) => r[0].length));
  const lines = rows.map(([name, summary, commands]) => `${name.padEnd(width)}  ${summary} ${commands}`);
  const example = typedName(held[0]!.manifest.name, held.map((h) => h.manifest.name));
  lines.push("", `\`town <shop> --help\` shows a shop's commands and this grant's limits; a shop answers to its last part, as in \`town ${example} --help\`.`);
  return `${lines.join("\n")}\n`;
}

/** `town <shop> --help`: summary, guidance, each allowed command with its arguments, then the grant in words. */
export function helpForGrant(manifest: Manifest, grant: GrantView, invokedAs: string = manifest.name): string {
  const out: string[] = [`${manifest.name}: ${manifest.summary}`];
  if (manifest.guidance?.trim()) out.push("", manifest.guidance.trimEnd());
  out.push("", "commands:");
  for (const cmd of allowedCommands(manifest, grant)) {
    out.push(`  town ${invokedAs} ${synopsis(cmd)}`);
    out.push(`      ${cmd.summary} (${cmd.effect})`);
    const args = cmd.args ?? [];
    const width = Math.max(0, ...args.map((a) => flagWithValue(a).length));
    for (const a of args) {
      const notes = [a.doc, a.required ? "Required." : undefined, a.default !== undefined ? `Default: ${String(a.default)}.` : undefined]
        .filter(Boolean)
        .join(" ");
      out.push(`      ${flagWithValue(a).padEnd(width)}${notes ? `  ${notes}` : ""}`.trimEnd());
    }
  }
  out.push("", `this grant: ${grant.label}; ${grant.expiresAt === null ? "does not expire" : `expires ${isoTime(grant.expiresAt)}`}`);
  const words = constraintLines(manifest, grant);
  if (words.length) out.push("constraints:", ...words.map((w) => `  ${w}`));
  else out.push("constraints: none");
  out.push("", "Add --json to any call for a JSON envelope of ok, output, notices, and exit.");
  return `${out.join("\n")}\n`;
}

/** The `usage:` line for one command, or for the shop when `command` is null, rendered for the grant. */
export function usageFor(manifest: Manifest, grant: { commands: readonly string[] }, invokedAs: string, command: string | null): string {
  const cmd = command === null ? undefined : manifest.commands.find((c) => c.name === command && grant.commands.includes(c.name));
  if (cmd) return `town ${invokedAs} ${synopsis(cmd)}`;
  const names = allowedCommands(manifest, grant).map((c) => c.name);
  return `town ${invokedAs} <${names.join("|")}> [--name value ...]; town ${invokedAs} --help says more`;
}

function synopsis(cmd: Command): string {
  const parts = [cmd.name];
  for (const a of cmd.args ?? []) parts.push(a.required ? flagWithValue(a) : `[${flagWithValue(a)}]`);
  return parts.join(" ");
}

function flagWithValue(a: Arg): string {
  switch (a.type) {
    case "bool":
      return `--${a.name} [true|false]`;
    case "enum":
      return `--${a.name} <${(a.values ?? []).join("|")}>`;
    default:
      return `--${a.name} <${a.type}>`;
  }
}

function constraintLines(manifest: Manifest, grant: GrantView): string[] {
  const lines: string[] = [];
  for (const [target, rules] of Object.entries(grant.constraints)) {
    const [command, argName] = splitTarget(target);
    if (!grant.commands.includes(command)) continue;
    const arg = manifest.commands.find((c) => c.name === command)?.args?.find((a) => a.name === argName);
    if (!arg) continue;
    for (const [kind, rule] of Object.entries(rules) as Array<[ConstraintKind, ConstraintValue]>) {
      const mustGive = arg.required || arg.default !== undefined ? "" : `, and --${arg.name} must be given`;
      lines.push(`${command} --${arg.name}: ${constraintWords(arg.name, kind, rule)}${mustGive}`);
    }
  }
  return lines;
}

/** A constraint in plain words, from the argument's name and the rule: "keys under `notes/` only". */
export function constraintWords(argName: string, kind: ConstraintKind, rule: ConstraintValue): string {
  const many = plural(argName.replace(/-/g, " "));
  const tick = (v: string | number) => `\`${v}\``;
  switch (kind) {
    case "prefix":
      return `${many} under ${tick(String(rule))} only`;
    case "equals":
      return `${argName.replace(/-/g, " ")} ${tick(rule as string | number)} only`;
    case "one_of": {
      const vs = (rule as Array<string | number>).map(tick);
      return `${many} ${vs.length > 1 ? `${vs.slice(0, -1).join(", ")} or ${vs.at(-1)}` : vs[0]} only`;
    }
    case "regex":
      return `${many} matching the JavaScript pattern ${tick(String(rule))} as a whole only`;
    case "max_length":
      return `${many} of at most ${rule} characters only`;
  }
}

function plural(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
