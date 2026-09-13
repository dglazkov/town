// townd, the operator's binary: `serve`, `admin`, and `spec`. `spec` reads
// no data directory and `admin shop test` reads one only when given one;
// every other verb needs --data, or $TOWN_DATA. `serve` and `admin` resolve
// the wall before anything else: `--wall seatbelt` or `--wall none`, and
// with no flag the wall this box has. A box with none is refused, as is a
// kind the box cannot give, before any listen and before any verb, so no
// shop's code runs unwalled without `--wall none` on the command line.

import os from "node:os";
import { main as admin, type WallChooser } from "./admin.js";
import { agentGrantAbove, startServer } from "./server.js";
import { SPEC } from "./spec.js";
import { VaultError } from "./vault.js";
import { openWall, wallOnThisBox, type WallKind } from "./wall.js";

const USAGE = "usage: townd serve [--data <dir>] [--port <n>] [--wall <kind>] | townd admin [--data <dir>] [--wall <kind>] <verb> | townd spec";

/** The words for a box with no wall and no flag. */
export const NO_WALL = "this box has no wall; a shop would run with the box's authority. Write --wall none to run it anyway.";

/**
 * The wall `--wall <flag>` names, or with no flag the wall this box has;
 * the refusal's words when the box has none, the kind is not this box's to
 * give, or the flag names no kind.
 */
export function chooseWall(flag: string | undefined): { kind: WallKind } | { refused: string } {
  const box = wallOnThisBox();
  if (flag === undefined) return box === null ? { refused: NO_WALL } : { kind: box };
  if (flag === "none") return { kind: "none" };
  if (flag === "seatbelt") {
    return box === "seatbelt" ? { kind: "seatbelt" } : { refused: `--wall seatbelt: this box, ${os.hostname()}, has no seatbelt wall; a shop would run with the box's authority. Write --wall none to run it anyway.` };
  }
  return { refused: `--wall ${flag} is not a wall; write seatbelt or none` };
}

/** `chooseWall` as the admin takes it: the kind opened once the admin knows the data directory. */
const adminWall: WallChooser = (flag) => {
  const wall = chooseWall(flag);
  return "refused" in wall ? wall : { open: (opts) => openWall(wall.kind, opts) };
};

export async function main(argv: readonly string[]): Promise<number> {
  const [verb, ...rest] = argv;
  const io = { out: (s: string) => void process.stdout.write(s), err: (s: string) => void process.stderr.write(s), env: process.env, stdin: process.stdin };
  if (verb === "spec" && rest.length === 0) {
    process.stdout.write(SPEC);
    return 0;
  }
  if (verb === "admin") return admin(rest, io, adminWall);
  if (verb === "serve") return serve(rest);
  process.stderr.write(`townd: ${verb ? `${verb} is not a verb` : "no verb given"}\n${USAGE}\n`);
  return 1;
}

async function serve(argv: readonly string[]): Promise<number> {
  let data = process.env.TOWN_DATA;
  let port = 7000;
  let wallFlag: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i]!;
    const value = argv[i + 1];
    if ((w === "--data" || w === "--port" || w === "--wall") && value === undefined) return fail(`${w} needs a value`);
    if (w === "--data") data = argv[++i];
    else if (w === "--wall") {
      if (wallFlag !== undefined) return fail("--wall is given more than once");
      wallFlag = argv[++i];
    } else if (w === "--port") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0 || n > 65535) return fail(`--port ${value} is not a port; write a number from 0 to 65535`);
      port = n;
    } else return fail(`${w} is not a serve flag`);
  }
  const wall = chooseWall(wallFlag);
  if ("refused" in wall) return fail(wall.refused);
  if (!data) return fail("needs --data <dir>, or $TOWN_DATA");

  const grant = agentGrantAbove(data);
  if (grant) {
    return fail(
      `refusing ${data}: ${grant} makes it an agent's directory, and a data directory under one is a grant the agent can widen; put the data directory outside any directory an agent works in`,
    );
  }

  let town;
  try {
    town = await startServer({ dataDir: data, port, wall: wall.kind });
  } catch (err) {
    if (err instanceof VaultError) return fail(err.message);
    return fail(`could not listen on 127.0.0.1:${port}: ${(err as Error).message}`);
  }
  process.stdout.write(`town listening on ${town.url}, shops walled by ${town.wall}\n`);
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
