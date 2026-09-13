// The isolate's entry, as source text: what a `runtime: worker` shop is loaded beside.
export const ENTRY_MODULE = "__town_entry.mjs";
export const ENTRY_SOURCE = String.raw`
import { WorkerEntrypoint } from "cloudflare:workers";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import process from "node:process";
import { Readable } from "node:stream";

class Exit extends Error {
  constructor(code) { super("process.exit(" + code + ")"); this.exitCode = code; }
}

const STATE = "/tmp/state";
const GRANT = "/tmp/grant";

function walk(dir, prefix, out) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + e.name;
    if (e.isDirectory()) walk(dir + "/" + e.name, rel + "/", out);
    else out[rel] = readFileSync(dir + "/" + e.name, "utf8");
  }
  return out;
}

export default class extends WorkerEntrypoint {
  async run(argv, stdin, state, grant) {
    let out = "", err = "";
    mkdirSync(STATE, { recursive: true });
    for (const [rel, content] of Object.entries(state)) {
      const file = STATE + "/" + rel;
      mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
      writeFileSync(file, content);
    }
    for (const [k, v] of Object.entries(this.env)) if (typeof v === "string") process.env[k] = v;
    process.env.TOWN_STATE = STATE;
    if (grant) { writeFileSync(GRANT, JSON.stringify(grant)); process.env.TOWN_GRANT = GRANT; }
    const write = (sink) => (chunk, enc, cb) => { if (sink === "out") out += String(chunk); else err += String(chunk); if (typeof enc === "function") enc(); else if (cb) cb(); return true; };
    process.stdout.write = write("out");
    process.stderr.write = write("err");
    process.argv = ["node", "/bundle/" + this.env.TOWN_ENTRY, ...argv];
    process.exit = (code) => { throw new Exit(code ?? 0); };
    Object.defineProperty(process, "stdin", { value: Readable.from([Buffer.from(stdin ?? "", "utf8")]), configurable: true });
    let exit = 0;
    try {
      const mod = await import("./" + this.env.TOWN_ENTRY);
      if (typeof mod.default === "function") { const code = await mod.default(argv, stdin); if (typeof code === "number") exit = code; else if (code !== undefined) out += JSON.stringify(code) + "\n"; }
    } catch (e) {
      if (e && typeof e.exitCode === "number") exit = e.exitCode;
      else { err += String(e && e.stack || e) + "\n"; exit = 1; }
    }
    return { stdout: out, stderr: err, exit, state: walk(STATE, "", {}), cwd: process.cwd(), tmpWritable: existsSync(STATE) };
  }
}
`;
