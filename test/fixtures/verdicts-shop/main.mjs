import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [command, , value] = process.argv.slice(2);
if (command === "say") {
  process.stdout.write(`${value}\n`);
} else if (command === "count") {
  const file = path.join(process.env.TOWN_STATE, "count");
  const n = Number(await readFile(file, "utf8").catch(() => "0")) + 1;
  await writeFile(file, String(n));
  process.stdout.write(`${n}\n`);
} else if (command === "fail") {
  process.stderr.write("boom\n");
  process.exit(2);
}
