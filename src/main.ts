// The launcher: a `runtime: worker` shop's entry run as a process under
// the town's own Node, as bin/main.js starts it, `node bin/main.js <entry>
// <argv>`. It sets process.argv as spec §7 gives it to a process, imports
// the entry, and awaits its `main`, the entry's default export, once; the
// process exits when `main` settles, as the isolate on the box ends, with
// `main`'s return as the exit code, a number or 0. A throw is exit 1 with
// the error's line on stderr; `process.exit` in `main` exits as it says;
// an entry that exports no `main` is exit 1 with spec §7's line. It loads
// nothing of the town's but this file.

import { pathToFileURL } from "node:url";

/** Spec §7's line for a worker entry that exports no `main`. */
export const NO_MAIN = "the entry exports no main; write export default async function main() around the program (spec §7)";

/** Runs the worker entry at `entry` with `argv`, and resolves to the exit code; what it prints goes to this process's stdout and stderr. */
export async function launch(entry: string, argv: readonly string[]): Promise<number> {
  process.argv = [process.argv[0]!, entry, ...argv];
  let code: unknown;
  try {
    const mod = (await import(pathToFileURL(entry).href)) as { default?: unknown };
    if (typeof mod.default !== "function") {
      process.stderr.write(`${NO_MAIN}\n`);
      return 1;
    }
    code = await (mod.default as () => unknown)();
  } catch (err) {
    process.stderr.write(`${oneLine(err)}\n`);
    return 1;
  }
  return typeof code === "number" && Number.isInteger(code) ? code : 0;
}

/** An error as one line: its name and message, never its stack, whose paths say which box ran it. */
function oneLine(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

/** Resolves once what was written to stdout and stderr has gone, so an exit cuts nothing off. */
export function flushed(): Promise<void> {
  const drain = (stream: NodeJS.WriteStream) => new Promise<void>((resolve) => stream.write("", () => resolve()));
  return Promise.all([drain(process.stdout), drain(process.stderr)]).then(() => undefined);
}
