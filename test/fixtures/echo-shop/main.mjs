import { spawn } from "node:child_process";

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
  // The grandchild records its own pid, then becomes `sleep`.
  spawn("sh", ["-c", 'echo $$ > "$TOWN_STATE/grandchild.pid"; exec sleep 60'], { stdio: "ignore" });
  process.stdout.write("sleeping\n");
} else if (command === "fail") {
  process.stderr.write("the fixture failed on purpose\n");
  process.exit(3);
}
