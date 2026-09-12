// town, the agent's binary: a pipe. It finds the grant file, posts what
// it was typed and its stdin (when stdin is a pipe or a file) to the
// town, prints what comes back, and exits with the code it was given. Its two flags, --json and --grant,
// are taken wherever they stand; every other word goes to the town as
// typed. It knows no shop, no command, no argument, and no verb of the
// operator's; the town answers for all of them.

import { existsSync, fstatSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { denials } from "./denials.js";

interface GrantFile {
  town: string;
  token: string;
}

export async function main(argv: readonly string[]): Promise<number> {
  const words: string[] = [];
  let json = false;
  let grantPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i]!;
    if (w === "--json") json = true;
    else if (w === "--grant") {
      grantPath = argv[++i];
      if (grantPath === undefined) return say(json, denials.flagNeedsValue("--grant"), 1);
    } else if (w.startsWith("--grant=")) grantPath = w.slice("--grant=".length);
    else words.push(w);
  }

  const file = grantPath ?? process.env.TOWN_GRANT ?? findGrantFile(process.cwd());
  if (!file) return say(json, denials.noGrantFile(), 3);
  const grant = readGrantFile(file);
  if (!grant) return say(json, denials.badGrantFile(file), 3);

  const stdin = stdinIsData() ? await readStdin() : null;

  let answer: { stdout: string; stderr: string; exit: number };
  try {
    const res = await fetch(new URL("/call", grant.town), {
      method: "POST",
      headers: { authorization: `Bearer ${grant.token}`, "content-type": "application/json" },
      body: JSON.stringify({ argv: words, stdin, json }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.stdout !== "string" || typeof body.stderr !== "string" || typeof body.exit !== "number") throw new Error("not an answer");
    answer = { stdout: body.stdout, stderr: body.stderr, exit: body.exit };
  } catch {
    return say(json, denials.townUnreachable(), 1);
  }

  await write(process.stdout, answer.stdout);
  await write(process.stderr, answer.stderr);
  return answer.exit;
}

/** `.town/grant` in `dir` or the nearest directory above it, then `~/.town/grant`; undefined when neither exists. */
function findGrantFile(dir: string): string | undefined {
  let d = path.resolve(dir);
  for (;;) {
    const candidate = path.join(d, ".town", "grant");
    if (existsSync(candidate)) return candidate;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  const home = path.join(os.homedir(), ".town", "grant");
  return existsSync(home) ? home : undefined;
}

function readGrantFile(file: string): GrantFile | null {
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    if (typeof v.town !== "string" || typeof v.token !== "string" || v.token === "") return null;
    new URL(v.town);
    return { town: v.town, token: v.token };
  } catch {
    return null;
  }
}

/**
 * Whether stdin carries data to send: a pipe or a file. A terminal does
 * not, and neither does a character device such as /dev/null or a socket:
 * a harness may hand its commands a socket it never closes, and reading
 * one would wait forever. A shell's `|` and `<` give a pipe and a file.
 */
function stdinIsData(): boolean {
  try {
    const st = fstatSync(0);
    return st.isFIFO() || st.isFile();
  } catch {
    return false;
  }
}

async function readStdin(): Promise<string | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
}

/** A line the command says for itself, before any answer: on stderr, or as the envelope with --json. */
async function say(json: boolean, line: string, exit: number): Promise<number> {
  if (json) await write(process.stdout, `${JSON.stringify({ ok: false, output: "", notices: [], exit, error: line })}\n`);
  else await write(process.stderr, `${line}\n`);
  return exit;
}

function write(stream: NodeJS.WriteStream, text: string): Promise<void> {
  return new Promise((resolve) => (text === "" ? resolve() : stream.write(text, () => resolve())));
}
