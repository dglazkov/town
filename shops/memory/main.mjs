// town/memory: a file per key under TOWN_STATE. Written to the runtime
// contract (townd spec, §7) and nothing more.
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].slice(2)] = rest[i + 1];
const state = path.resolve(process.env.TOWN_STATE);

function fail(line) {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

function fileFor(key) {
  const file = path.resolve(state, key);
  if (!file.startsWith(state + path.sep)) fail(`key ${key} is outside the state`);
  return file;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function walk(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const keys = [];
  for (const e of entries) {
    const key = prefix + e.name;
    if (e.isDirectory()) keys.push(...(await walk(path.join(dir, e.name), `${key}/`)));
    else keys.push(key);
  }
  return keys;
}

const missing = (key) => (err) => err.code === "ENOENT" || err.code === "ENOTDIR" || err.code === "EISDIR"
  ? fail(`no value under ${key}`)
  : fail(err.message);

switch (command) {
  case "remember": {
    const file = fileFor(args.key);
    const value = args.value ?? (await readStdin());
    await mkdir(path.dirname(file), { recursive: true }).catch((err) => fail(err.message));
    await writeFile(file, value).catch((err) => fail(err.message));
    break;
  }
  case "recall": {
    const value = await readFile(fileFor(args.key), "utf8").catch(missing(args.key));
    process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
    break;
  }
  case "list": {
    const keys = (await walk(state)).filter((k) => k.startsWith(args.prefix ?? "")).sort();
    if (keys.length) process.stdout.write(`${keys.join("\n")}\n`);
    break;
  }
  case "forget":
    await unlink(fileFor(args.key)).catch(missing(args.key));
    break;
  default:
    fail(`no command ${command}`);
}
