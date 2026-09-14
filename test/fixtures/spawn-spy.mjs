// Loaded with `node --import` before a script: every child process the
// script starts through node:child_process is appended, one JSON line of
// its command and arguments, to $TOWN_TEST_SPAWN_LOG, and nothing is
// started. test/deploy.test.ts reads the log to show the refusal ran
// nothing.

import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const log = process.env.TOWN_TEST_SPAWN_LOG;
for (const fn of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  childProcess[fn] = (...args) => {
    appendFileSync(log, `${JSON.stringify({ fn, args: args.filter((a) => typeof a === "string" || Array.isArray(a)) })}\n`);
    throw new Error(`spawn-spy: ${fn} refused`);
  };
}
syncBuiltinESMExports();
