// The wire, for the operator: `townd admin --town <url> <verb …>` as a
// pipe. The verb's words, and its stdin when src/admin.ts's `readsStdin`
// says the verb reads it and null otherwise, are posted to the box's `/admin`
// with the operator's token, from $TOWN_OPERATOR or ~/.town/operator, and
// what comes back is printed as it came, the verb's exit its exit; the
// verbs, their refusals, and their printouts are src/admin.ts's, run in
// the box's object. A consent begun is waited on at
// `/admin/consent/<state>` until it lands, is refused, or times out. A
// token the box refuses is said so, and nothing ran there.

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readsStdin, type Io } from "./admin.js";

/** What the pipe prints, and the door answers, for a bearer that is not the operator's. */
export const OPERATOR_REFUSED = "the operator token is refused";

/** `argv` without `--<name> <value>` or `--<name>=<value>`, wherever they stand. */
export function withoutFlag(argv: readonly string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i]!;
    if (w === `--${name}`) i++;
    else if (!w.startsWith(`--${name}=`)) out.push(w);
  }
  return out;
}

/** What the wire answers a verb: what it printed and its exit, and for a consent begun, the state to wait on. */
export interface AdminAnswer {
  stdout: string;
  stderr: string;
  exit: number;
  wait?: string;
}

/** How long the pipe waits for one answer of the box's before it says the box did not answer. */
const WIRE_TIMEOUT_MS = 10 * 60_000;

/** The operator's token for the wire: $TOWN_OPERATOR, else ~/.town/operator; null when neither holds one. */
export function operatorToken(env: NodeJS.ProcessEnv): string | null {
  const given = env.TOWN_OPERATOR?.trim();
  if (given) return given;
  try {
    const held = readFileSync(path.join(env.HOME ?? os.homedir(), ".town", "operator"), "utf8").trim();
    return held === "" ? null : held;
  } catch {
    return null;
  }
}

/**
 * `townd admin --town <url> <verb …>`: a pipe. The verb and its stdin
 * posted to the box's `/admin` with the operator's token, and what comes
 * back printed; a consent begun is waited on at `/admin/consent/<state>`
 * until it lands, is refused, or times out. A token the box refuses is
 * said so, and nothing ran.
 */
export async function pipe(url: string, argv: string[], io: Io): Promise<number> {
  let base: URL;
  try {
    base = new URL(url);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("not http");
  } catch {
    io.err(`townd admin: --town ${url} is not a town's address; write the box's URL, like https://town.example.workers.dev\n`);
    return 1;
  }
  const token = operatorToken(io.env);
  if (token === null) {
    io.err("townd admin: --town needs the operator's token, and neither $TOWN_OPERATOR nor ~/.town/operator holds one\n");
    return 1;
  }
  // Stdin is read only for a verb that reads it, as the verb reads it at a laptop: another returns with stdin an open pipe.
  let stdin: string | null = null;
  if (readsStdin(argv) && io.stdin && !io.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of io.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
    stdin = chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
  }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const ask = async (target: string, init: RequestInit): Promise<AdminAnswer | number> => {
    let res: Response;
    try {
      res = await fetch(new URL(target, base), { ...init, headers, signal: AbortSignal.timeout(WIRE_TIMEOUT_MS) });
    } catch {
      io.err(`townd admin: the town at ${base.origin} did not answer\n`);
      return 1;
    }
    if (res.status === 401) {
      await res.body?.cancel();
      io.err(`townd admin: ${OPERATOR_REFUSED}\n`);
      return 1;
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.stdout !== "string" || typeof body.stderr !== "string" || typeof body.exit !== "number") {
      io.err(`townd admin: the town at ${base.origin} answered ${res.status} and no verb's answer\n`);
      return 1;
    }
    return { stdout: body.stdout, stderr: body.stderr, exit: body.exit, ...(typeof body.wait === "string" ? { wait: body.wait } : {}) };
  };
  // The verb's answer; then, for a consent begun, the box's answers to the wait until one is not a wait.
  let answer = await ask("/admin", { method: "POST", body: JSON.stringify({ argv, stdin }) });
  for (;;) {
    if (typeof answer === "number") return answer;
    if (answer.stdout) io.out(answer.stdout);
    if (answer.stderr) io.err(answer.stderr);
    if (answer.wait === undefined) return answer.exit;
    answer = await ask(`/admin/consent/${encodeURIComponent(answer.wait)}`, { method: "GET" });
  }
}
