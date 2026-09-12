// townd, the operator's binary: `serve`, `admin`, and `spec`. `spec` and
// `admin shop test` read no data directory; every other verb needs
// --data, or $TOWN_DATA.

import { main as admin } from "./admin.js";
import { agentGrantAbove, startServer } from "./server.js";
import { SPEC } from "./spec.js";

const USAGE = "usage: townd serve [--data <dir>] [--port <n>] | townd admin [--data <dir>] <verb> | townd spec";

export async function main(argv: readonly string[]): Promise<number> {
  const [verb, ...rest] = argv;
  const io = { out: (s: string) => void process.stdout.write(s), err: (s: string) => void process.stderr.write(s), env: process.env };
  if (verb === "spec" && rest.length === 0) {
    process.stdout.write(SPEC);
    return 0;
  }
  if (verb === "admin") return admin(rest, io);
  if (verb === "serve") return serve(rest);
  process.stderr.write(`townd: ${verb ? `${verb} is not a verb` : "no verb given"}\n${USAGE}\n`);
  return 1;
}

async function serve(argv: readonly string[]): Promise<number> {
  let data = process.env.TOWN_DATA;
  let port = 7000;
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i]!;
    const value = argv[i + 1];
    if ((w === "--data" || w === "--port") && value === undefined) return fail(`${w} needs a value`);
    if (w === "--data") data = argv[++i];
    else if (w === "--port") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0 || n > 65535) return fail(`--port ${value} is not a port; write a number from 0 to 65535`);
      port = n;
    } else return fail(`${w} is not a serve flag`);
  }
  if (!data) return fail("needs --data <dir>, or $TOWN_DATA");

  const grant = agentGrantAbove(data);
  if (grant) {
    return fail(
      `refusing ${data}: ${grant} makes it an agent's directory, and a data directory under one is a grant the agent can widen; put the data directory outside any directory an agent works in`,
    );
  }

  let town;
  try {
    town = await startServer({ dataDir: data, port });
  } catch (err) {
    return fail(`could not listen on 127.0.0.1:${port}: ${(err as Error).message}`);
  }
  process.stdout.write(`town listening on ${town.url}\n`);
  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await town.close();
  return 0;
}

function fail(why: string): number {
  process.stderr.write(`townd serve: ${why}\n`);
  return 1;
}
