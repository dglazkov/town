// Runs `town` as an agent would: with --via, `town <via> relay --words
// <words>`, the words passed whole; without, the words split on spaces.
// Prints what came back as JSON, { exit, stdout, stderr }, and exits as
// `town` did.

import { spawn } from "node:child_process";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if (command !== "hop" || typeof args.words !== "string") {
  process.stderr.write("unexpected arguments\n");
  process.exit(64);
}

const argv = args.via ? [args.via, "relay", "--words", args.words] : args.words.split(" ").filter(Boolean);
const child = spawn("town", argv, { stdio: ["ignore", "pipe", "pipe"] });
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
