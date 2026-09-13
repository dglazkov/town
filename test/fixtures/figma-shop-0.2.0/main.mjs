// A shop an agent writes for a provider the town has never seen: its
// manifest proposes the figma type over an origin a test names in place
// of http://127.0.0.1:9, the fake origin's address. `file` and `comments`
// send one GET through the teller the town opened for figma and print the
// status, then the body; `environment`, a command a test adds, prints the
// process's environment as JSON, to show an address and no token. It sets
// no header of its own and never writes the teller's URL to stderr.

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if (command === "environment") {
  process.stdout.write(`${JSON.stringify(process.env)}\n`);
  process.exit(0);
}
const base = process.env.TOWN_CREDENTIAL_FIGMA;
if (!base) {
  process.stderr.write("no teller for figma\n");
  process.exit(1);
}
const paths = { file: `/v1/files/${encodeURIComponent(args.key ?? "")}`, comments: `/v1/files/${encodeURIComponent(args.key ?? "")}/comments` };
if (!(command in paths)) {
  process.stderr.write("unexpected arguments\n");
  process.exit(2);
}
let answer;
try {
  answer = await fetch(`${base}${paths[command]}`);
} catch {
  process.stderr.write("the teller could not be reached\n");
  process.exit(1);
}
process.stdout.write(`${answer.status}\n${await answer.text()}`);
process.exit(answer.ok ? 0 : 1);
