// A recipe over two shops, as an agent would call them: `town teller get`,
// then `town echo echo` with the answer as --note. Not on stdin: a Node
// child's stdin is a socket, and `town` reads only a pipe or a file. It
// runs `town` with execFile, never a shell, and when a call fails it
// passes town's stderr on as it came, since the town's lines carry no
// value, and exits as town did.

import { execFile } from "node:child_process";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if ((command !== "mark" && command !== "changes") || typeof args.path !== "string") {
  process.stderr.write("unexpected arguments\n");
  process.exit(64);
}

function town(argv) {
  return new Promise((resolve) => {
    execFile("town", argv, { encoding: "utf8" }, (err, stdout, stderr) => {
      resolve({ exit: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr });
    }).stdin.end();
  });
}

function passOn(r) {
  process.stderr.write(r.stderr);
  process.exit(r.exit);
}

const first = await town(["teller", "get", "--path", args.path]);
if (first.exit !== 0) passOn(first);
if (command === "mark") {
  const echoed = await town(["echo", "echo", "--zeta", "mark", "--note", first.stdout]);
  if (echoed.exit !== 0) passOn(echoed);
  const argv = JSON.parse(echoed.stdout).argv;
  process.stdout.write(`marked ${Buffer.byteLength(argv[argv.indexOf("--note") + 1])} bytes\n`);
} else {
  const second = await town(["teller", "get", "--path", args.path]);
  if (second.exit !== 0) passOn(second);
  process.stdout.write(`changed: ${first.stdout === second.stdout ? "no" : "yes"}\n`);
}
