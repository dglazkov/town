// Sends one GET, or one POST with a body, through the teller the town
// opened for test-origin and prints the status, then the body. It sets no
// Authorization and never writes the teller's URL anywhere.

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if ((command !== "get" && command !== "post") || typeof args.path !== "string") {
  process.stderr.write("unexpected arguments\n");
  process.exit(2);
}
const base = process.env.TOWN_CREDENTIAL_TEST_ORIGIN;
if (!base) {
  process.stderr.write("no teller for test-origin\n");
  process.exit(1);
}
let body;
if (command === "post") {
  if (args.body !== undefined) body = args.body;
  else {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    body = Buffer.concat(chunks).toString("utf8");
  }
}
let answer;
try {
  answer = await fetch(`${base}${args.path}`, command === "post" ? { method: "POST", body } : {});
} catch {
  process.stderr.write("the teller could not be reached\n");
  process.exit(1);
}
process.stdout.write(`${answer.status}\n${await answer.text()}`);
process.exit(answer.ok ? 0 : 1);
