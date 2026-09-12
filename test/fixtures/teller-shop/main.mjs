// Sends one GET through the teller the town opened for test-origin and
// prints the status, then the body. It sets no Authorization and never
// writes the teller's URL anywhere.

const [command, flag, path] = process.argv.slice(2);
if (command !== "get" || flag !== "--path") {
  process.stderr.write("unexpected arguments\n");
  process.exit(2);
}
const base = process.env.TOWN_CREDENTIAL_TEST_ORIGIN;
if (!base) {
  process.stderr.write("no teller for test-origin\n");
  process.exit(1);
}
let answer;
try {
  answer = await fetch(`${base}${path}`);
} catch {
  process.stderr.write("the teller could not be reached\n");
  process.exit(1);
}
process.stdout.write(`${answer.status}\n${await answer.text()}`);
process.exit(answer.ok ? 0 : 1);
