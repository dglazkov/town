// The prying entry as a worker shop, for box's journey 2 steps 1 and 2:
// it tries everything the isolate might reach and prints one JSON line per
// probe, { step, act, target, result, ... }, where result is "ok" or the
// error's code or name. A file it can read is printed whole. Its stdin is
// JSON: { mark, origin }, each optional; `mark` goes on every request it
// sends, so a test can find them at the origin, and `origin` is the
// address it tries past its window. Nothing runs at the top level.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export default async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  const given = text ? JSON.parse(text) : {};

  let step = 0;
  const say = (line) => process.stdout.write(`${JSON.stringify({ step, ...line })}\n`);
  const code = (e) => e.code ?? e.name ?? String(e);

  function read(target) {
    try {
      say({ act: "read", target, result: "ok", content: readFileSync(target, "utf8") });
    } catch (e) {
      say({ act: "read", target, result: code(e) });
    }
  }

  function walk(dir) {
    let names;
    try {
      names = readdirSync(dir).sort();
      say({ act: "list", target: dir, result: "ok", names });
    } catch (e) {
      say({ act: "list", target: dir, result: code(e) });
      return;
    }
    for (const name of names) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else read(full);
    }
  }

  function write(target) {
    try {
      writeFileSync(target, "written by the prying entry\n");
      say({ act: "write", target, result: "ok" });
    } catch (e) {
      say({ act: "write", target, result: code(e) });
    }
  }

  // Its own directory: where Node says the module is, or the directory it runs from where the runtime gives a module no path.
  const own = import.meta.dirname ?? process.cwd();
  const state = process.env.TOWN_STATE;

  // 1. Its own files, its state read and written, a write beside its entry, a child, and its environment.
  step = 1;
  walk(own);
  if (state) {
    write(path.join(state, "pried.txt"));
    walk(state);
  }
  write(path.join(own, "beside-the-entry.txt"));
  try {
    spawnSync("/bin/sh", ["-c", "true"]);
    say({ act: "spawn", target: "/bin/sh", result: "ok" });
  } catch (e) {
    say({ act: "spawn", target: "/bin/sh", result: code(e), message: e.message });
  }
  say({ act: "env", target: "process.env", result: "ok", env: Object.fromEntries(Object.entries(process.env).sort()) });
  try {
    const { env } = await import("cloudflare:workers");
    say({ act: "env", target: "cloudflare:workers", result: "ok", kinds: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, typeof v]).sort()) });
  } catch (e) {
    say({ act: "env", target: "cloudflare:workers", result: code(e) });
  }

  // 2. Every address it knows: its window, the origin past it, and a public one.
  step = 2;
  const mark = given.mark ?? "unmarked";
  const targets = [];
  for (const [name, value] of Object.entries(process.env).sort()) if (name.startsWith("TOWN_CREDENTIAL_")) targets.push([name, `${value}/pried?by=${mark}`]);
  if (given.origin) targets.push(["origin", `${given.origin}/pried?by=${mark}`]);
  targets.push(["public", `https://example.com/pried?by=${mark}`]);
  for (const [target, url] of targets) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      say({ act: "fetch", target, url, result: "ok", status: res.status, body: await res.text() });
    } catch (e) {
      say({ act: "fetch", target, url, result: code(e), message: e.message });
    }
  }
}
