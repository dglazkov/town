// test/conform: the check shop. Each command's output is exact, so a
// conformance check compares what the harness printed with what this
// printed, byte for byte. Nothing runs at the top level (spec §7).

/** The whole of stdin, as bytes. */
async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  return Buffer.concat(chunks);
}

export default async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "echo":
      // Canonical form: `echo --text <value>`.
      process.stdout.write(`${args[1]}\n`);
      return 0;
    case "cat":
      process.stdout.write(await stdin());
      return 0;
    case "count":
      process.stdout.write(`${(await stdin()).length}\n`);
      return 0;
    case "fail":
      process.stderr.write("conform: failed on purpose\n");
      return 1;
    case "hidden":
      process.stdout.write("hidden\n");
      return 0;
  }
  process.stderr.write("conform: no such command\n");
  return 1;
}
