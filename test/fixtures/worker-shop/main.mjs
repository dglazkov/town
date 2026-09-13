// test/worker: each way a worker shop's main ends (spec §7), and what it
// was given. Nothing runs at the top level: an import and a definition.
import { setTimeout as delay } from "node:timers/promises";

export default async function main() {
  const [command, ...rest] = process.argv.slice(2);
  await delay(20); // main is awaited: what follows a wait still runs
  if (command === "returns") {
    process.stdout.write(`returning ${rest[1]}\n`);
    return Number(rest[1]);
  }
  if (command === "throws") {
    process.stdout.write("about to throw\n");
    throw new Error("the fixture threw on purpose");
  }
  if (command === "exits") {
    process.stderr.write("exiting 2\n");
    process.exit(2);
  }
  if (command === "echo") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), argv1: process.argv[1], env: Object.keys(process.env).sort(), stdin: Buffer.concat(chunks).toString("utf8") }));
  }
}
