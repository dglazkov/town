// Runs `town` with the words it was given, as an agent would, through the
// grant file the town handed this call, and prints what came back as JSON:
// { exit, stdout, stderr }. It exits as `town` did. It never writes the
// words, or anything `town` printed, to its own stderr.

import { spawn } from "node:child_process";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if (command !== "relay" || typeof args.words !== "string") {
  process.stderr.write("unexpected arguments\n");
  process.exit(64);
}

const child = spawn("town", args.words.split(" ").filter(Boolean), { stdio: ["ignore", "pipe", "pipe"] });
const out = [];
const err = [];
child.stdout.on("data", (b) => out.push(b));
child.stderr.on("data", (b) => err.push(b));
child.on("error", () => {
  process.stderr.write("there is no town to call\n");
  process.exit(65);
});
child.on("close", (code) => {
  const exit = code ?? 1;
  process.stdout.write(JSON.stringify({ exit, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
  process.exit(exit);
});
