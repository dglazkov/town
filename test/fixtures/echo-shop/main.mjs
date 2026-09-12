import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [command] = process.argv.slice(2);
if (command === "echo") {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.stdout.write(
    JSON.stringify({
      argv: process.argv.slice(2),
      env: process.env,
      cwd: process.cwd(),
      stdin: Buffer.concat(chunks).toString("utf8"),
    }),
  );
} else if (command === "sleep") {
  // The environment names it was given, kept where a test can read them
  // after the limit; then the grandchild records its own pid and sleeps.
  writeFileSync(`${process.env.TOWN_STATE}/env.json`, JSON.stringify(process.env));
  spawn("sh", ["-c", 'echo $$ > "$TOWN_STATE/grandchild.pid"; exec sleep 60'], { stdio: "ignore" });
  process.stdout.write("sleeping\n");
} else if (command === "fail") {
  process.stderr.write("the fixture failed on purpose\n");
  process.exit(3);
}
